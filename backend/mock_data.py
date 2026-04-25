"""
Generate synthetic eBird sightings and OSM infrastructure data for Tucson, AZ.
Used as a fallback when real API keys are unavailable.
"""
import numpy as np
import pandas as pd
from backend.config import TUCSON_BOUNDS

RNG = np.random.default_rng(42)

TUCSON_BIRDS = [
    "Gambel's Quail", "Gila Woodpecker", "Verdin", "Cactus Wren",
    "Curve-billed Thrasher", "Phainopepla", "Pyrrhuloxia",
    "White-winged Dove", "Inca Dove", "Greater Roadrunner",
    "Ladder-backed Woodpecker", "Black-tailed Gnatcatcher",
    "Lucy's Warbler", "Yellow Warbler", "Wilson's Warbler",
    "Western Kingbird", "Ash-throated Flycatcher", "Say's Phoebe",
    "Black Phoebe", "Anna's Hummingbird", "Costa's Hummingbird",
    "Broad-billed Hummingbird", "Gilded Flicker", "Elf Owl",
    "Burrowing Owl", "Great Horned Owl", "Cooper's Hawk",
    "Harris's Hawk", "Red-tailed Hawk", "American Kestrel",
]

POWER_PLANTS = [
    (32.22, -111.00), (32.18, -110.95), (32.28, -110.85),
]

ROADS = [
    # (lat_start, lon_start, lat_end, lon_end)
    (32.05, -111.05, 32.35, -111.05),  # I-10 proxy
    (32.20, -111.10, 32.20, -110.75),  # E-W highway
    (32.10, -110.90, 32.35, -110.90),  # N-S artery
]


def _dist_to_points(lat: float, lon: float, points: list) -> float:
    """Euclidean distance in degrees to the nearest point in list."""
    if not points:
        return 999.0
    dists = [np.sqrt((lat - p[0]) ** 2 + (lon - p[1]) ** 2) for p in points]
    return min(dists)


def _road_density(lat: float, lon: float) -> float:
    """Very rough road-proximity proxy (0..1, higher = closer to road)."""
    min_d = min(
        abs(lat - 32.20),  # E-W highway
        abs(lon - (-111.05)),  # I-10 proxy
        abs(lon - (-110.90)),  # N-S artery
    )
    return max(0.0, 1.0 - min_d / 0.15)


def _building_density(lat: float, lon: float) -> float:
    """
    Urban core of Tucson ~ (32.22, -110.97).
    Returns 0-1 density score.
    """
    d = np.sqrt((lat - 32.22) ** 2 + (lon - (-110.97)) ** 2)
    return max(0.0, 1.0 - d / 0.20)


def generate_sightings(n: int = 2000) -> pd.DataFrame:
    """Return a DataFrame of synthetic bird sightings with features."""
    bounds = TUCSON_BOUNDS
    lats = RNG.uniform(bounds["min_lat"], bounds["max_lat"], n)
    lons = RNG.uniform(bounds["min_lon"], bounds["max_lon"], n)
    days = RNG.integers(1, 366, n)

    dist_pp = np.array([_dist_to_points(la, lo, POWER_PLANTS) * 111 for la, lo in zip(lats, lons)])
    dist_rd = np.array([_road_density(la, lo) for la, lo in zip(lats, lons)])
    bldg_d = np.array([_building_density(la, lo) for la, lo in zip(lats, lons)])

    # Seasonality boost: more species Apr-Jun (days 91-181)
    season = np.where((days >= 91) & (days <= 181), 1.2, 0.9)

    # Species richness (target): higher far from infrastructure
    richness_base = (
        0.4
        + 0.3 * np.clip(dist_pp / 20.0, 0, 1)
        - 0.2 * dist_rd
        - 0.15 * bldg_d
        + 0.1 * RNG.standard_normal(n)
    ) * season
    richness = np.clip(richness_base / 1.2, 0.05, 1.0)

    species = RNG.choice(TUCSON_BIRDS, n)

    df = pd.DataFrame(
        {
            "latitude": lats,
            "longitude": lons,
            "species": species,
            "day_of_year": days,
            "dist_power_plant_km": dist_pp,
            "road_proximity": dist_rd,
            "building_density": bldg_d,
            "stability_score": richness,
        }
    )
    return df


def generate_infrastructure() -> pd.DataFrame:
    """Return a DataFrame of synthetic OSM infrastructure points."""
    rows = []
    # Power plants
    for lat, lon in POWER_PLANTS:
        rows.append({"latitude": lat, "longitude": lon, "type": "power_plant"})
    # Industrial zones
    for _ in range(10):
        rows.append({
            "latitude": RNG.uniform(TUCSON_BOUNDS["min_lat"], TUCSON_BOUNDS["max_lat"]),
            "longitude": RNG.uniform(TUCSON_BOUNDS["min_lon"], TUCSON_BOUNDS["max_lon"]),
            "type": "industrial",
        })
    return pd.DataFrame(rows)
