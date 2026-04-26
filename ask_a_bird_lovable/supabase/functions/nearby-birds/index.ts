// Edge function: nearby-birds
// Returns species observed near a given lat/lon (eBird, last 30 days, 25km).
// Uses a dedicated cache table (ebird_nearby_cache) so it never collides with
// analyze-site's much shorter top-5 list.
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ~1 km cell — matches the 1-mile (~1.6 km) eBird search radius so cache
// hits actually correspond to the same neighborhood being asked about.
function cellKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)}_${lon.toFixed(2)}`;
}

// 1 mile ≈ 1.609 km — the realistic radius construction noise/light/habitat
// disturbance affects local birds.
const SEARCH_RADIUS_KM = 1.6;

interface EBirdObs {
  speciesCode: string;
  comName: string;
  sciName: string;
  howMany?: number;
}

const SYNTHETIC: { speciesCode: string; comName: string; count: number }[] = [
  { speciesCode: "grerai", comName: "Greater Roadrunner", count: 6 },
  { speciesCode: "verfly", comName: "Vermilion Flycatcher", count: 4 },
  { speciesCode: "gamqua", comName: "Gambel's Quail", count: 8 },
  { speciesCode: "cacwre", comName: "Cactus Wren", count: 5 },
  { speciesCode: "gilwoo", comName: "Gila Woodpecker", count: 3 },
  { speciesCode: "verdin", comName: "Verdin", count: 2 },
  { speciesCode: "curtho", comName: "Curve-billed Thrasher", count: 3 },
  { speciesCode: "phaino", comName: "Phainopepla", count: 2 },
  { speciesCode: "annhum", comName: "Anna's Hummingbird", count: 4 },
  { speciesCode: "harhaw", comName: "Harris's Hawk", count: 1 },
];

async function fetchEBird(lat: number, lon: number, apiKey: string): Promise<EBirdObs[]> {
  const url = `https://api.ebird.org/v2/data/obs/geo/recent?lat=${lat}&lng=${lon}&dist=${SEARCH_RADIUS_KM}&back=30`;
  const resp = await fetch(url, {
    headers: {
      "X-eBirdApiToken": apiKey,
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json",
    },
  });
  if (!resp.ok) throw new Error(`eBird ${resp.status}`);
  return (await resp.json()) as EBirdObs[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { lat, lon } = await req.json();
    if (typeof lat !== "number" || typeof lon !== "number") {
      return new Response(JSON.stringify({ error: "lat, lon required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const key = cellKey(lat, lon);

    // Try dedicated nearby cache (24h)
    const { data: cached } = await supabase
      .from("ebird_nearby_cache")
      .select("species, fetched_at")
      .eq("cell_key", key)
      .maybeSingle();
    const ageHours = cached
      ? (Date.now() - new Date(cached.fetched_at).getTime()) / 3_600_000
      : Infinity;

    if (cached && ageHours < 24 && Array.isArray(cached.species) && cached.species.length > 0) {
      return new Response(
        JSON.stringify({
          species: cached.species,
          used_synthetic: false,
          used_cache: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let species: { speciesCode: string; comName: string; count: number }[] = [];
    let usedSynthetic = false;
    const apiKey = Deno.env.get("EBIRD_API_KEY");
    if (apiKey) {
      try {
        const obs = await fetchEBird(lat, lon, apiKey);
        const map = new Map<string, { speciesCode: string; comName: string; count: number }>();
        for (const o of obs) {
          const ex = map.get(o.speciesCode);
          const n = o.howMany ?? 1;
          if (ex) ex.count += n;
          else map.set(o.speciesCode, { speciesCode: o.speciesCode, comName: o.comName, count: n });
        }
        species = [...map.values()].sort((a, b) => b.count - a.count).slice(0, 60);
      } catch (e) {
        console.error("eBird failed:", e);
      }
    }
    if (species.length === 0) {
      species = SYNTHETIC;
      usedSynthetic = true;
    } else {
      // Persist to dedicated cache (best-effort, don't block response on failure).
      await supabase
        .from("ebird_nearby_cache")
        .upsert({ cell_key: key, lat, lon, species, fetched_at: new Date().toISOString() })
        .then(({ error }) => {
          if (error) console.error("cache upsert failed:", error.message);
        });
    }

    return new Response(
      JSON.stringify({ species, used_synthetic: usedSynthetic, used_cache: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("nearby-birds error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
