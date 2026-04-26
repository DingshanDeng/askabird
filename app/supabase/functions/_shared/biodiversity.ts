// Shared evaluation logic for analyze-site and suggest-alternatives.
//
// SAFETY-oriented scoring (high = good place to build):
//   endangered_safety : 0.50  (no listed birds within 1 mile = 1.0)
//   migratory_safety  : 0.30  (fewer than 10 migrants in flyway = 1.0)
//   biodiversity_safety: 0.20 (below regional average = 1.0)
//
// A site is "good to build" when post-construction impact_score >= 0.9.

export interface EBirdObs {
  speciesCode: string;
  comName: string;
  sciName?: string;
  howMany?: number;
  lat?: number;
  lng?: number;
  obsDt?: string;
  locName?: string;
}

export const SENSITIVE_SPECIES: { name: string; status: string }[] = [
  { name: "Yellow-billed Cuckoo", status: "Threatened (ESA)" },
  { name: "Southwestern Willow Flycatcher", status: "Endangered (ESA)" },
  { name: "Mexican Spotted Owl", status: "Threatened (ESA)" },
  { name: "California Condor", status: "Endangered (ESA)" },
  { name: "Cactus Ferruginous Pygmy-Owl", status: "Sensitive" },
  { name: "Bald Eagle", status: "Protected" },
  { name: "Golden Eagle", status: "Protected" },
  { name: "Peregrine Falcon", status: "Sensitive" },
  { name: "Bendire's Thrasher", status: "Sensitive" },
  { name: "Le Conte's Thrasher", status: "Sensitive" },
  { name: "Lucy's Warbler", status: "Sensitive" },
  { name: "Rufous-winged Sparrow", status: "Sensitive" },
  { name: "Five-striped Sparrow", status: "Sensitive" },
  { name: "Elegant Trogon", status: "Sensitive" },
  { name: "Buff-collared Nightjar", status: "Sensitive" },
  { name: "Whiskered Screech-Owl", status: "Sensitive" },
  { name: "Gray Hawk", status: "Sensitive" },
  { name: "Common Black Hawk", status: "Sensitive" },
  { name: "Zone-tailed Hawk", status: "Sensitive" },
  { name: "Crissal Thrasher", status: "Sensitive" },
];

export const MIGRATORY_SPECIES = new Set<string>(
  [
    "Vermilion Flycatcher",
    "Western Tanager",
    "Wilson's Warbler",
    "Yellow Warbler",
    "Lucy's Warbler",
    "Lazuli Bunting",
    "Lark Bunting",
    "Sandhill Crane",
    "American White Pelican",
    "Northern Pintail",
    "Cinnamon Teal",
    "Swainson's Hawk",
    "Turkey Vulture",
    "Rufous Hummingbird",
    "Calliope Hummingbird",
    "Black-headed Grosbeak",
    "Western Kingbird",
    "Yellow-billed Cuckoo",
    "Southwestern Willow Flycatcher",
  ].map((s) => s.toLowerCase()),
);

const FLYWAY_BOXES: { name: string; box: [number, number, number, number] }[] = [
  { name: "Pacific Flyway", box: [-125, 22, -108, 60] },
  { name: "Central Flyway", box: [-110, 22, -95, 60] },
];

export function flywayFor(lat: number, lon: number): string | null {
  for (const f of FLYWAY_BOXES) {
    const [x1, y1, x2, y2] = f.box;
    if (lon >= x1 && lon <= x2 && lat >= y1 && lat <= y2) return f.name;
  }
  return null;
}

// Haversine distance in km
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const ONE_MILE_KM = 1.609;

export interface SensitiveHit {
  name: string;
  status: string;
  count: number;
  distance_km: number; // distance from query point to nearest sighting
  lat?: number;
  lon?: number;
}

export interface MigratoryHit {
  name: string;
  count: number;
  distance_km: number;
  lat?: number;
  lon?: number;
}

export function matchSensitiveWithDistance(
  centerLat: number,
  centerLon: number,
  obs: EBirdObs[],
): SensitiveHit[] {
  const byName = new Map<string, SensitiveHit>();
  for (const o of obs) {
    const lower = o.comName.toLowerCase();
    for (const s of SENSITIVE_SPECIES) {
      if (!lower.includes(s.name.toLowerCase())) continue;
      const d =
        typeof o.lat === "number" && typeof o.lng === "number"
          ? distanceKm(centerLat, centerLon, o.lat, o.lng)
          : 0;
      const ex = byName.get(s.name);
      if (!ex || d < ex.distance_km) {
        byName.set(s.name, {
          name: s.name,
          status: s.status,
          count: o.howMany ?? 1,
          distance_km: d,
          lat: o.lat,
          lon: o.lng,
        });
      }
      break;
    }
  }
  return [...byName.values()].sort((a, b) => a.distance_km - b.distance_km);
}

export function matchMigratoryWithDistance(
  centerLat: number,
  centerLon: number,
  obs: EBirdObs[],
): MigratoryHit[] {
  const byName = new Map<string, MigratoryHit>();
  for (const o of obs) {
    const lower = o.comName.toLowerCase();
    if (!MIGRATORY_SPECIES.has(lower)) continue;
    const d =
      typeof o.lat === "number" && typeof o.lng === "number"
        ? distanceKm(centerLat, centerLon, o.lat, o.lng)
        : 0;
    const ex = byName.get(lower);
    if (!ex || d < ex.distance_km) {
      byName.set(lower, {
        name: o.comName,
        count: o.howMany ?? 1,
        distance_km: d,
        lat: o.lat,
        lon: o.lng,
      });
    }
  }
  return [...byName.values()].sort((a, b) => a.distance_km - b.distance_km);
}

export interface CriteriaBreakdown {
  endangered: {
    score: number;
    species: SensitiveHit[];
    nearby_count: number; // how many sensitive species WITHIN 1 mile
    nearest?: SensitiveHit;
    note: string;
  };
  migratory: {
    score: number;
    in_flyway: boolean;
    flyway: string | null;
    species: MigratoryHit[];
    hotspot?: { lat: number; lon: number; species_count: number; distance_km: number };
    note: string;
  };
  biodiversity: {
    score: number;
    species_count: number;
    observation_count: number;
    region_avg?: number;
    note: string;
  };
  weighted_baseline: number; // safety baseline (high = good to build)
  top_species: { name: string; count: number }[];
}

export interface EvaluateOpts {
  // Optional regional average for biodiversity comparison.
  // The regional average is the mean species count per ~25km radius across surrounding samples.
  regionAvgSpecies?: number;
}

/**
 * Evaluate site SAFETY (high = safe to build, low = sensitive area).
 *
 * @param centerLat / centerLon — proposed site
 * @param obs — eBird observations within ~25km of the site (for context)
 * @param opts — optional regional biodiversity average
 */
export function evaluate(
  centerLat: number,
  centerLon: number,
  obs: EBirdObs[],
  opts: EvaluateOpts = {},
): CriteriaBreakdown {
  // Build species map for biodiversity & top species
  const speciesMap = new Map<string, { name: string; count: number }>();
  let totalObs = 0;
  for (const o of obs) {
    const n = o.howMany ?? 1;
    totalObs += n;
    const ex = speciesMap.get(o.speciesCode);
    if (ex) ex.count += n;
    else speciesMap.set(o.speciesCode, { name: o.comName, count: n });
  }
  const speciesCount = speciesMap.size;
  const topSpecies = [...speciesMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // === 1. Endangered safety ===
  // Safety = 1.0 when zero sensitive species within 1 mile.
  // Drops with each one nearby; saturates (score = 0) at 4+ within 1 mile.
  const sensitiveAll = matchSensitiveWithDistance(centerLat, centerLon, obs);
  const sensitiveNearby = sensitiveAll.filter((s) => s.distance_km <= ONE_MILE_KM);
  const nearest = sensitiveAll[0];
  const endangeredScore = Math.max(0, 1 - sensitiveNearby.length / 4);
  let endangeredNote: string;
  if (sensitiveNearby.length === 0) {
    endangeredNote = nearest
      ? `No listed birds within 1 mile (nearest: ${nearest.name} at ${nearest.distance_km.toFixed(1)} km).`
      : "No listed or sensitive birds reported in the area.";
  } else {
    const list = sensitiveNearby
      .slice(0, 2)
      .map((s) => `${s.name} (~${s.distance_km.toFixed(1)} km)`)
      .join(", ");
    endangeredNote = `${sensitiveNearby.length} listed/sensitive species within 1 mile: ${list}${sensitiveNearby.length > 2 ? "…" : ""}.`;
  }

  // === 2. Migratory safety ===
  // Only consider migrants within ~5 km of the click (NEARBY) — sightings 20 km
  // away should not make a parking lot look like a migration corridor.
  // Safety = 1.0 when fewer than 10 NEARBY migratory species (or outside flyway).
  // Drops linearly to 0 at 25+ nearby migrants.
  const NEARBY_KM = 5;
  const HIGH_PRESSURE_THRESHOLD = 10;
  const flyway = flywayFor(centerLat, centerLon);
  const migratorySpeciesAll = matchMigratoryWithDistance(centerLat, centerLon, obs);
  const migratorySpeciesNearby = migratorySpeciesAll.filter(
    (m) => m.distance_km <= NEARBY_KM,
  );
  const nearbyMigrantCount = migratorySpeciesNearby.length;
  let migratoryScore: number;
  if (!flyway) {
    migratoryScore = 1; // outside flyway = safe
  } else if (nearbyMigrantCount < HIGH_PRESSURE_THRESHOLD) {
    migratoryScore = 1;
  } else {
    migratoryScore = Math.max(0, 1 - (nearbyMigrantCount - HIGH_PRESSURE_THRESHOLD) / 15);
  }
  // Identify a "migration hotspot" — anchored on the closest nearby migratory cluster.
  let hotspot: CriteriaBreakdown["migratory"]["hotspot"];
  if (nearbyMigrantCount >= HIGH_PRESSURE_THRESHOLD) {
    const closest = migratorySpeciesNearby[0];
    if (closest && typeof closest.lat === "number" && typeof closest.lon === "number") {
      hotspot = {
        lat: closest.lat,
        lon: closest.lon,
        species_count: nearbyMigrantCount,
        distance_km: closest.distance_km,
      };
    }
  }
  let migratoryNote: string;
  if (!flyway) {
    migratoryNote = "Outside the main Pacific/Central flyways — low migration pressure.";
  } else if (nearbyMigrantCount === 0) {
    migratoryNote = `Inside the ${flyway} but no migrant species reported within ~${NEARBY_KM} km — low migration pressure.`;
  } else if (nearbyMigrantCount < HIGH_PRESSURE_THRESHOLD) {
    migratoryNote = `Inside the ${flyway} — only ${nearbyMigrantCount} migrant species within ~${NEARBY_KM} km — low migration pressure.`;
  } else {
    const lead = migratorySpeciesNearby[0]?.name;
    migratoryNote = `High migration pressure — ${nearbyMigrantCount} migrant species within ~${NEARBY_KM} km${lead ? ` (incl. ${lead})` : ""}, inside the ${flyway}.`;
  }

  // === 3. Biodiversity safety ===
  // Safety = 1.0 when site biodiversity is at/below the regional average.
  // Drops as the site exceeds the regional average; saturates at 2x.
  // Wording escalates with magnitude so a 0% bar reads as "major hotspot".
  const regionAvg = opts.regionAvgSpecies;
  let biodiversityScore: number;
  let biodiversityNote: string;
  if (typeof regionAvg === "number" && regionAvg > 0) {
    if (speciesCount <= regionAvg) {
      biodiversityScore = 1;
      biodiversityNote = `${speciesCount} species here — at or below the regional average of ${regionAvg.toFixed(0)} (typical).`;
    } else {
      const ratio = speciesCount / regionAvg;
      const excess = (speciesCount - regionAvg) / regionAvg;
      biodiversityScore = Math.max(0, 1 - excess);
      if (ratio > 2.5) {
        biodiversityNote = `Major hotspot for bird biodiversity — ${speciesCount} species here vs. regional average of ${regionAvg.toFixed(0)}.`;
      } else if (ratio > 1.5) {
        biodiversityNote = `Notable bird hotspot — ${speciesCount} species here vs. regional average of ${regionAvg.toFixed(0)}.`;
      } else {
        biodiversityNote = `${speciesCount} species here — above the regional average of ${regionAvg.toFixed(0)} (richer than typical).`;
      }
    }
  } else {
    // Fallback: calibrate against an absolute target of ~30 species in 25km.
    const TARGET = 30;
    if (speciesCount <= TARGET) {
      biodiversityScore = 1;
      biodiversityNote = `${speciesCount} species, ${totalObs} sightings within 25 km — modest richness.`;
    } else if (speciesCount > TARGET * 2) {
      biodiversityScore = Math.max(0, 1 - (speciesCount - TARGET) / TARGET);
      biodiversityNote = `Major hotspot for bird biodiversity — ${speciesCount} species, ${totalObs} sightings within 25 km.`;
    } else {
      biodiversityScore = Math.max(0, 1 - (speciesCount - TARGET) / TARGET);
      biodiversityNote = `${speciesCount} species, ${totalObs} sightings within 25 km — high richness.`;
    }
  }

  // Baseline safety with a small +0.05 optimism nudge so typical sites land
  // a hair into the "safe" range. Applied ONCE, here only. Clamped to [0, 1].
  const BASELINE_BOOST = 0.05;
  const rawBaseline =
    0.5 * endangeredScore + 0.3 * migratoryScore + 0.2 * biodiversityScore;
  const weightedBaseline = Math.max(0, Math.min(1, rawBaseline + BASELINE_BOOST));

  return {
    endangered: {
      score: endangeredScore,
      species: sensitiveAll,
      nearby_count: sensitiveNearby.length,
      nearest,
      note: endangeredNote,
    },
    migratory: {
      score: migratoryScore,
      in_flyway: !!flyway,
      flyway,
      species: migratorySpeciesAll,
      hotspot,
      note: migratoryNote,
    },
    biodiversity: {
      score: biodiversityScore,
      species_count: speciesCount,
      observation_count: totalObs,
      region_avg: regionAvg,
      note: biodiversityNote,
    },
    weighted_baseline: weightedBaseline,
    top_species: topSpecies,
  };
}

// Per-criterion construction impact deltas (signed).
//   negative = harms that criterion's safety
//   positive = neutral/slightly beneficial use of land (rare; only residential)
// Each criterion can independently move up or down:
//   - endangered : direct disturbance to listed/sensitive species
//   - migratory  : interference with migration corridors
//   - biodiversity: outright habitat removal / land conversion
export interface ImpactProfile {
  endangered: number;   // signed delta in roughly [-0.6, +0.1]
  migratory: number;
  biodiversity: number;
  // Headline summary used by the bird chat to explain the type's main concern
  main_concern: string;
}

export const CONSTRUCTION_PROFILES: Record<string, ImpactProfile> = {
  industrial: {
    endangered: -0.45,
    migratory: -0.35,
    biodiversity: -0.50,
    main_concern: "industrial sites bring noise, fumes, lighting, and traffic that disturb every kind of bird",
  },
  building: {
    // Residential is the only type that can read as net-neutral / slightly
    // positive: low-density housing on already-disturbed land doesn't add
    // meaningful new pressure, and well-planted yards even help biodiversity.
    endangered: -0.05,
    migratory: -0.05,
    biodiversity: 0.05,
    main_concern: "residential buildings cause some window collisions and light pollution, but the footprint is small and yards can support backyard birds",
  },
  solar_farm: {
    endangered: -0.20,
    migratory: -0.15,
    biodiversity: -0.50,
    main_concern: "solar farms clear huge areas of ground habitat — biodiversity takes the biggest hit",
  },
  wind_farm: {
    endangered: -0.30,
    migratory: -0.55,
    biodiversity: -0.10,
    main_concern: "wind turbines are especially dangerous for migrating birds and large raptors",
  },
  nuclear_farm: {
    endangered: -0.30,
    migratory: -0.30,
    biodiversity: -0.25,
    main_concern: "nuclear plants have a small footprint, but cooling water and exclusion zones still affect nearby wildlife",
  },
  none: { endangered: 0, migratory: 0, biodiversity: 0, main_concern: "no construction" },
};

// Average signed delta — used by the scalar fallback path.
function averageDelta(p: ImpactProfile): number {
  return (p.endangered + p.migratory + p.biodiversity) / 3;
}

// Backward-compat exports (older callers expect a [0,1] harm/penalty scalar).
export const CONSTRUCTION_HARM: Record<string, number> = Object.fromEntries(
  Object.entries(CONSTRUCTION_PROFILES).map(([k, v]) => [k, Math.max(0, -averageDelta(v))]),
);

export const CONSTRUCTION_PENALTY: Record<string, number> = Object.fromEntries(
  Object.entries(CONSTRUCTION_PROFILES).map(([k, v]) => [k, Math.max(0, 1 + averageDelta(v))]),
);

/**
 * Apply a signed construction delta to a single criterion's baseline safety.
 *
 * Sensitivity weighting: harm bites harder on already-stressed criteria
 * (low baseline), and a positive delta helps more on degraded criteria.
 *   sensitivity = 0.7 + 0.6 * (1 - baseline)   ∈ [0.7, 1.3]
 *
 * Positive contributions are capped at +0.1 per criterion so a residential
 * use can never paint over a real ecological problem.
 */
function applyDelta(baseline: number, delta: number): number {
  const sensitivity = 0.7 + 0.6 * (1 - baseline);
  let change = delta * sensitivity;
  if (change > 0) change = Math.min(change, 0.1);
  return Math.max(0, Math.min(1, baseline + change));
}

export interface ImpactBreakdown {
  endangered: number;
  migratory: number;
  biodiversity: number;
  weighted: number;
}

/**
 * Per-criterion post-construction safety. Applies the type's signed delta to
 * each criterion's baseline (with sensitivity weighting), then re-weights
 * using the same 0.5 / 0.3 / 0.2 weights as the baseline.
 *
 * The +0.05 baseline nudge from `evaluate()` is already baked into each
 * criterion's starting point — we do NOT add it again here.
 */
export function computeImpactBreakdown(
  c: CriteriaBreakdown,
  constructionType: string,
): ImpactBreakdown {
  const profile = CONSTRUCTION_PROFILES[constructionType] ?? CONSTRUCTION_PROFILES.building;
  const e = applyDelta(c.endangered.score, profile.endangered);
  const m = applyDelta(c.migratory.score, profile.migratory);
  const b = applyDelta(c.biodiversity.score, profile.biodiversity);
  const weighted = Math.max(0, Math.min(1, 0.5 * e + 0.3 * m + 0.2 * b));
  return { endangered: e, migratory: m, biodiversity: b, weighted };
}

/**
 * Convenience overload kept for `suggest-alternatives` and other callers that
 * only have a baseline number. Uses the average signed delta.
 */
export function computeImpactScore(
  baselineOrCriteria: number | CriteriaBreakdown,
  constructionType: string,
): number {
  if (typeof baselineOrCriteria !== "number") {
    return computeImpactBreakdown(baselineOrCriteria, constructionType).weighted;
  }
  const profile = CONSTRUCTION_PROFILES[constructionType] ?? CONSTRUCTION_PROFILES.building;
  return applyDelta(baselineOrCriteria, averageDelta(profile));
}

export const GOOD_SITE_THRESHOLD = 0.6;

export function buildRationale(
  c: CriteriaBreakdown,
  constructionType: string,
  impactScore: number,
): string {
  const pieces: string[] = [];
  const isGood = impactScore >= GOOD_SITE_THRESHOLD;

  if (isGood) {
    pieces.push(
      `This looks like a good spot — post-construction safety is ${impactScore.toFixed(2)}, above the 0.60 threshold.`,
    );
    pieces.push(c.endangered.note);
    if (c.migratory.score < 1) pieces.push(c.migratory.note);
    pieces.push("Even on a good site, please minimize lighting, preserve native plants, and build with care.");
  } else {
    pieces.push(
      `Post-construction safety is ${impactScore.toFixed(2)} — below the 0.60 threshold for a good site.`,
    );
    // Lead with whichever concern is biggest (lowest score = biggest concern in the safety frame).
    const ordered = [
      { weight: 0.5, score: c.endangered.score, note: c.endangered.note },
      { weight: 0.3, score: c.migratory.score, note: c.migratory.note },
      { weight: 0.2, score: c.biodiversity.score, note: c.biodiversity.note },
    ].sort((a, b) => a.score * a.weight - b.score * b.weight);
    pieces.push(ordered[0].note);
    if (ordered[1].score < 0.6) pieces.push(ordered[1].note);
    pieces.push("Consider the alternatives below — small shifts in location can make a real difference.");
  }
  if (constructionType !== "none") {
    pieces.push(
      `(${constructionType.replace("_", " ")} construction assumed.)`,
    );
  }
  return pieces.join(" ");
}
