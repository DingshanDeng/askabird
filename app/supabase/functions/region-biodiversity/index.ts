// Edge function: region-biodiversity
// Returns a 15x15 grid of cells around a given map center, each annotated with:
//   - species_count : unique species observed in / near that cell
//   - sensitive[]   : matched endangered/sensitive species names
//   - migratory[]   : matched migratory species names
//
// To stay within runtime limits, we read everything we can from the
// ebird_nearby_cache (and ebird_cache) first, and only call eBird live for a
// small number of empty cells per request. Cells that remain empty come back
// with species_count = 0 — the next request will progressively fill them in.
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  SENSITIVE_SPECIES,
  MIGRATORY_SPECIES,
} from "../_shared/biodiversity.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRID_SIZE = 15;
const DEFAULT_HALF_SPAN = 0.45; // ~50 km half-span -> 100 km square viewport
const MAX_LIVE_FETCHES = 18; // safety cap per request
const CACHE_TTL_HOURS = 24 * 7; // a week — biodiversity moves slowly

// ~1 km cell key, matching nearby-birds (1-mile radius searches).
function cellKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)}_${lon.toFixed(2)}`;
}

interface EBirdObs {
  speciesCode: string;
  comName: string;
  howMany?: number;
}

interface CellInput {
  i: number;
  j: number;
  lat: number;
  lon: number;
  cellKey: string;
}

interface CellOutput {
  i: number;
  j: number;
  lat: number;
  lon: number;
  species_count: number;
  sensitive: { name: string; status: string }[];
  migratory: string[];
}

async function fetchEBird(lat: number, lon: number, dist: number, apiKey: string): Promise<EBirdObs[]> {
  const url = `https://api.ebird.org/v2/data/obs/geo/recent?lat=${lat}&lng=${lon}&dist=${dist}&back=30`;
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

function annotate(species: { speciesCode: string; comName: string; count: number }[]) {
  const sensitive: { name: string; status: string }[] = [];
  const seenSensitive = new Set<string>();
  const migratory: string[] = [];
  const seenMig = new Set<string>();
  for (const s of species) {
    const lower = s.comName.toLowerCase();
    for (const sp of SENSITIVE_SPECIES) {
      if (lower.includes(sp.name.toLowerCase()) && !seenSensitive.has(sp.name)) {
        seenSensitive.add(sp.name);
        sensitive.push({ name: sp.name, status: sp.status });
      }
    }
    if (MIGRATORY_SPECIES.has(lower) && !seenMig.has(lower)) {
      seenMig.add(lower);
      migratory.push(s.comName);
    }
  }
  return { sensitive, migratory };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const centerLat = Number(body.centerLat);
    const centerLon = Number(body.centerLon);
    const halfSpan = Number(body.halfSpanDeg) || DEFAULT_HALF_SPAN;
    if (!Number.isFinite(centerLat) || !Number.isFinite(centerLon)) {
      return new Response(JSON.stringify({ error: "centerLat, centerLon required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const stepLat = (2 * halfSpan) / GRID_SIZE;
    const stepLon = (2 * halfSpan) / GRID_SIZE;

    // Build cells (centers).
    const cells: CellInput[] = [];
    for (let i = 0; i < GRID_SIZE; i++) {
      for (let j = 0; j < GRID_SIZE; j++) {
        const lat = centerLat - halfSpan + stepLat * (i + 0.5);
        const lon = centerLon - halfSpan + stepLon * (j + 0.5);
        cells.push({ i, j, lat, lon, cellKey: cellKey(lat, lon) });
      }
    }

    // Group cells by their cache key (multiple sub-cells can share one ~10km bucket).
    const keyToCells = new Map<string, CellInput[]>();
    for (const c of cells) {
      const arr = keyToCells.get(c.cellKey) ?? [];
      arr.push(c);
      keyToCells.set(c.cellKey, arr);
    }
    const uniqueKeys = [...keyToCells.keys()];

    // Bulk-load nearby cache for those keys.
    type Bucket = { species: { speciesCode: string; comName: string; count: number }[] };
    const buckets = new Map<string, Bucket>();

    if (uniqueKeys.length > 0) {
      const { data: nearbyRows } = await supabase
        .from("ebird_nearby_cache")
        .select("cell_key, species, fetched_at")
        .in("cell_key", uniqueKeys);
      for (const r of nearbyRows ?? []) {
        const ageHours = (Date.now() - new Date(r.fetched_at).getTime()) / 3_600_000;
        if (ageHours < CACHE_TTL_HOURS && Array.isArray(r.species)) {
          buckets.set(r.cell_key as string, { species: r.species as Bucket["species"] });
        }
      }

      // Fall back to analyze-site cache (top 5) for keys still missing.
      const stillMissing = uniqueKeys.filter((k) => !buckets.has(k));
      if (stillMissing.length > 0) {
        const { data: legacyRows } = await supabase
          .from("ebird_cache")
          .select("cell_key, top_species, fetched_at")
          .in("cell_key", stillMissing);
        for (const r of legacyRows ?? []) {
          const ageHours = (Date.now() - new Date(r.fetched_at).getTime()) / 3_600_000;
          if (ageHours < CACHE_TTL_HOURS && Array.isArray(r.top_species)) {
            const species = (r.top_species as { name: string; count: number }[]).map((s, i) => ({
              speciesCode: `legacy_${i}`,
              comName: s.name,
              count: s.count,
            }));
            buckets.set(r.cell_key as string, { species });
          }
        }
      }
    }

    // Live-fetch a handful of empty buckets to progressively populate the map.
    const apiKey = Deno.env.get("EBIRD_API_KEY");
    const liveCandidates = uniqueKeys.filter((k) => !buckets.has(k));
    // Each grid cell is ~stepLat° tall (~111*stepLat km). Use a radius of
    // ~75% of the cell's half-width so the lat/lon scan circle covers the
    // *entire* cell (with slight overlap into neighbors). The previous 1-mile
    // cap dramatically under-counted species because it only sampled a tiny
    // dot at each cell's center. eBird allows up to dist=50 km.
    const cellHalfWidthKm = stepLat * 111 / 2;
    const cellRadiusKm = Math.min(50, Math.max(2, cellHalfWidthKm * 1.5));
    let liveBudget = MAX_LIVE_FETCHES;
    if (apiKey && liveCandidates.length > 0) {
      // Prioritize buckets closer to the center first (so the visible area fills fastest).
      liveCandidates.sort((a, b) => {
        const ca = keyToCells.get(a)![0];
        const cb = keyToCells.get(b)![0];
        const da = Math.hypot(ca.lat - centerLat, ca.lon - centerLon);
        const db = Math.hypot(cb.lat - centerLat, cb.lon - centerLon);
        return da - db;
      });
      const toFetch = liveCandidates.slice(0, liveBudget);
      const results = await Promise.allSettled(
        toFetch.map(async (key) => {
          const repCell = keyToCells.get(key)![0];
          const obs = await fetchEBird(repCell.lat, repCell.lon, cellRadiusKm, apiKey);
          const m = new Map<string, { speciesCode: string; comName: string; count: number }>();
          for (const o of obs) {
            const n = o.howMany ?? 1;
            const ex = m.get(o.speciesCode);
            if (ex) ex.count += n;
            else m.set(o.speciesCode, { speciesCode: o.speciesCode, comName: o.comName, count: n });
          }
          // No artificial cap — keep every unique species so the heatmap reflects
          // the true biodiversity recorded for the cell.
          const species = [...m.values()].sort((a, b) => b.count - a.count);
          return { key, lat: repCell.lat, lon: repCell.lon, species };
        }),
      );
      const upserts: { cell_key: string; lat: number; lon: number; species: unknown; fetched_at: string }[] = [];
      const now = new Date().toISOString();
      for (const r of results) {
        if (r.status === "fulfilled") {
          buckets.set(r.value.key, { species: r.value.species });
          upserts.push({
            cell_key: r.value.key,
            lat: r.value.lat,
            lon: r.value.lon,
            species: r.value.species,
            fetched_at: now,
          });
          liveBudget--;
        }
      }
      if (upserts.length > 0) {
        await supabase.from("ebird_nearby_cache").upsert(upserts).then(({ error }) => {
          if (error) console.error("region cache upsert failed:", error.message);
        });
      }
    }

    // Build outputs.
    const out: CellOutput[] = cells.map((c) => {
      const bucket = buckets.get(c.cellKey);
      if (!bucket) {
        return {
          i: c.i,
          j: c.j,
          lat: c.lat,
          lon: c.lon,
          species_count: 0,
          sensitive: [],
          migratory: [],
        };
      }
      const { sensitive, migratory } = annotate(bucket.species);
      return {
        i: c.i,
        j: c.j,
        lat: c.lat,
        lon: c.lon,
        species_count: bucket.species.length,
        sensitive,
        migratory,
      };
    });

    return new Response(
      JSON.stringify({
        center: { lat: centerLat, lon: centerLon },
        half_span_deg: halfSpan,
        grid_size: GRID_SIZE,
        step_lat: stepLat,
        step_lon: stepLon,
        cells: out,
        cells_with_data: out.filter((c) => c.species_count > 0).length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("region-biodiversity error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
