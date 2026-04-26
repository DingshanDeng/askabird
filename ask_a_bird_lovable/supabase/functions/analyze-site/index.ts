// analyze-site: SAFETY-oriented evaluation.
// High score = good place to build. impact_score >= 0.6 = recommended site.
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  evaluate,
  buildRationale,
  computeImpactBreakdown,
  CONSTRUCTION_PROFILES,
  GOOD_SITE_THRESHOLD,
  type EBirdObs,
} from "../_shared/biodiversity.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function cellKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)}_${lon.toFixed(2)}`;
}

// Wide radius so we can compute regional context (avg species per sub-cell)
// AND distance-from-site for endangered/migratory hits.
async function fetchEBirdWide(lat: number, lon: number, apiKey: string): Promise<EBirdObs[]> {
  const url = `https://api.ebird.org/v2/data/obs/geo/recent?lat=${lat}&lng=${lon}&dist=25&back=30&includeProvisional=true`;
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

function syntheticData(lat: number, lon: number): EBirdObs[] {
  return [
    { speciesCode: "cacwre", comName: "Cactus Wren", howMany: 4, lat, lng: lon },
    { speciesCode: "gamqua", comName: "Gambel's Quail", howMany: 8, lat, lng: lon },
    { speciesCode: "gilwoo", comName: "Gila Woodpecker", howMany: 3, lat, lng: lon },
    { speciesCode: "verdin", comName: "Verdin", howMany: 2, lat, lng: lon },
    { speciesCode: "verfly", comName: "Vermilion Flycatcher", howMany: 2, lat, lng: lon },
  ];
}

// Compute the regional average species count by binning observations into ~5km sub-cells
// and averaging species count across non-empty cells. Uses 0.05° bins (~5.5km lat).
function regionalAverageSpecies(obs: EBirdObs[]): number {
  if (obs.length === 0) return 0;
  const cells = new Map<string, Set<string>>();
  for (const o of obs) {
    if (typeof o.lat !== "number" || typeof o.lng !== "number") continue;
    const key = `${o.lat.toFixed(2)}_${o.lng.toFixed(2)}`;
    if (!cells.has(key)) cells.set(key, new Set());
    cells.get(key)!.add(o.speciesCode);
  }
  if (cells.size === 0) return 0;
  let total = 0;
  for (const set of cells.values()) total += set.size;
  return total / cells.size;
}

// Restrict observations to those within ~1.6 km of the site (1 mile),
// used to evaluate the SITE itself for biodiversity scoring.
function withinRadius(obs: EBirdObs[], lat: number, lon: number, km: number): EBirdObs[] {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  return obs.filter((o) => {
    if (typeof o.lat !== "number" || typeof o.lng !== "number") return true;
    const dLat = toRad(o.lat - lat);
    const dLon = toRad(o.lng - lon);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat)) * Math.cos(toRad(o.lat)) * Math.sin(dLon / 2) ** 2;
    const d = 2 * R * Math.asin(Math.sqrt(a));
    return d <= km;
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { lat, lon, construction_type } = await req.json();
    if (typeof lat !== "number" || typeof lon !== "number" || !construction_type) {
      return new Response(JSON.stringify({ error: "lat, lon, construction_type required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const key = cellKey(lat, lon);

    let wideObs: EBirdObs[] = [];
    let usedSynthetic = false;

    const apiKey = Deno.env.get("EBIRD_API_KEY");
    if (apiKey) {
      try {
        wideObs = await fetchEBirdWide(lat, lon, apiKey);
      } catch (e) {
        console.error("eBird fetch failed:", e);
      }
    }
    if (!wideObs || wideObs.length === 0) {
      wideObs = syntheticData(lat, lon);
      usedSynthetic = true;
    }

    // Regional average for biodiversity comparison
    const regionAvgSpecies = regionalAverageSpecies(wideObs);

    // For biodiversity SCORE we want what's inside ~1mi; but for endangered/migratory
    // distances we pass the full wide set (the evaluator computes distances itself).
    // Trick: evaluate operates on the obs list for biodiversity counting AND for
    // sensitive/migratory matching. We want the biodiversity count to reflect the
    // immediate site, so build a hybrid: use site-radius obs for the speciesMap,
    // but include wide-obs sensitive/migratory hits (the evaluator already handles
    // distance for those when we pass wide obs). To keep the API simple, we evaluate
    // in two passes and merge.

    const siteObs = withinRadius(wideObs, lat, lon, 1.6);
    const siteEval = evaluate(lat, lon, siteObs, { regionAvgSpecies });
    const wideEval = evaluate(lat, lon, wideObs, { regionAvgSpecies });

    // Merge: keep site-level biodiversity + top species, but use wide-level
    // endangered/migratory (with distances) for the safety scores.
    const criteria = {
      endangered: wideEval.endangered,
      migratory: wideEval.migratory,
      biodiversity: siteEval.biodiversity,
      weighted_baseline:
        0.5 * wideEval.endangered.score +
        0.3 * wideEval.migratory.score +
        0.2 * siteEval.biodiversity.score,
      top_species: siteEval.top_species.length > 0 ? siteEval.top_species : wideEval.top_species,
    };

    const baselineScore = criteria.weighted_baseline;
    const impactBreakdown = computeImpactBreakdown(criteria, construction_type);
    const impactScore = impactBreakdown.weighted;
    const delta = impactScore - baselineScore;
    const impactPct = baselineScore > 0 ? (delta / baselineScore) * 100 : 0;
    const isGoodSite = impactScore >= GOOD_SITE_THRESHOLD;
    const profile = CONSTRUCTION_PROFILES[construction_type] ?? CONSTRUCTION_PROFILES.building;

    if (!usedSynthetic) {
      await supabase.from("ebird_cache").upsert({
        cell_key: key,
        lat,
        lon,
        species_count: criteria.biodiversity.species_count,
        observation_count: criteria.biodiversity.observation_count,
        top_species: criteria.top_species,
        fetched_at: new Date().toISOString(),
      });
    }

    const rationale = buildRationale(criteria, construction_type, impactScore)
      + (usedSynthetic ? " (Note: using synthetic Sonoran data — eBird returned no recent sightings.)" : "");

    return new Response(
      JSON.stringify({
        baseline_score: baselineScore,
        impact_score: impactScore,
        delta,
        impact_pct: impactPct,
        is_good_site: isGoodSite,
        good_site_threshold: GOOD_SITE_THRESHOLD,
        species_count: criteria.biodiversity.species_count,
        observation_count: criteria.biodiversity.observation_count,
        region_avg_species: regionAvgSpecies,
        top_species: criteria.top_species,
        criteria,
        impact_breakdown: impactBreakdown,
        construction_profile: profile,
        rationale,
        used_synthetic: usedSynthetic,
        used_cache: false,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("analyze-site error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
