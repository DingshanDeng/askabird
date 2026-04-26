from __future__ import annotations

import json
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import List

import numpy as np
import pandas as pd

from backend.config import ARIZONA_BOUNDS, TUCSON_BOUNDS
from backend.data_ingestion import fetch_hotspot_species, fetch_hotspots_region, load_sightings

logger = logging.getLogger(__name__)

TARGET_GRID = 15
PRECOMPUTED_GRID_CSV_PATH = Path(__file__).resolve().parent / "data" / "species_grid.csv"


def build_species_grid_dataframe() -> pd.DataFrame:
    """Build a fixed Arizona-wide heatmap dataset and return it as a DataFrame."""
    cell_height = (TUCSON_BOUNDS["max_lat"] - TUCSON_BOUNDS["min_lat"]) / TARGET_GRID
    cell_width = (TUCSON_BOUNDS["max_lon"] - TUCSON_BOUNDS["min_lon"]) / TARGET_GRID
    lat_steps = int(np.ceil((ARIZONA_BOUNDS["max_lat"] - ARIZONA_BOUNDS["min_lat"]) / cell_height))
    lon_steps = int(np.ceil((ARIZONA_BOUNDS["max_lon"] - ARIZONA_BOUNDS["min_lon"]) / cell_width))

    hotspots = fetch_hotspots_region("US-AZ")
    use_hotspots = len(hotspots) > 0
    sightings_df = None if use_hotspots else load_sightings()

    cell_records = [
        {
            "min_lat": round(ARIZONA_BOUNDS["min_lat"] + i * cell_height, 6),
            "max_lat": round(
                min(ARIZONA_BOUNDS["min_lat"] + (i + 1) * cell_height, ARIZONA_BOUNDS["max_lat"]),
                6,
            ),
            "min_lon": round(ARIZONA_BOUNDS["min_lon"] + j * cell_width, 6),
            "max_lon": round(
                min(ARIZONA_BOUNDS["min_lon"] + (j + 1) * cell_width, ARIZONA_BOUNDS["max_lon"]),
                6,
            ),
            "species_count": 0.0,
            "top_species": [],
            "obs_count": 0,
            "interpolated": False,
        }
        for i in range(lat_steps)
        for j in range(lon_steps)
    ]

    if use_hotspots:
        per_cell_spots = [[] for _ in range(len(cell_records))]
        for hotspot in hotspots:
            lat = hotspot.get("lat")
            lng = hotspot.get("lng")
            if lat is None or lng is None:
                continue
            if not (
                ARIZONA_BOUNDS["min_lat"] <= lat <= ARIZONA_BOUNDS["max_lat"]
                and ARIZONA_BOUNDS["min_lon"] <= lng <= ARIZONA_BOUNDS["max_lon"]
            ):
                continue
            i = min(int((lat - ARIZONA_BOUNDS["min_lat"]) / cell_height), lat_steps - 1)
            j = min(int((lng - ARIZONA_BOUNDS["min_lon"]) / cell_width), lon_steps - 1)
            per_cell_spots[i * lon_steps + j].append(hotspot)

        # Prefetch all unique hotspot species lists in parallel so each locId is
        # fetched once; results land in lru_cache for the aggregation step below.
        unique_loc_ids = {
            spot["locId"]
            for spots in per_cell_spots
            for spot in spots
            if spot.get("locId")
        }
        logger.info("Fetching species lists for %d hotspots…", len(unique_loc_ids))
        with ThreadPoolExecutor(max_workers=8) as executor:
            futures = {executor.submit(fetch_hotspot_species, lid): lid for lid in unique_loc_ids}
            for future in as_completed(futures):
                future.result()  # populates lru_cache; errors already logged inside

        for idx, spots in enumerate(per_cell_spots):
            if not spots:
                continue
            # Union of all-time species codes across every hotspot in the cell.
            cell_species: set[str] = set()
            for spot in spots:
                loc_id = spot.get("locId", "")
                if loc_id:
                    cell_species.update(fetch_hotspot_species(loc_id))
            # Fall back to max(numSpeciesAllTime) if the species-list API returned nothing.
            sp_count = len(cell_species) if cell_species else float(
                max((spot.get("numSpeciesAllTime") or 0 for spot in spots), default=0)
            )
            cell_records[idx]["species_count"] = float(sp_count)
            cell_records[idx]["top_species"] = [
                spot.get("locName", "Unknown")
                for spot in sorted(
                    spots,
                    key=lambda item: item.get("numSpeciesAllTime") or 0,
                    reverse=True,
                )[:3]
            ]
            cell_records[idx]["obs_count"] = len(spots)
    else:
        per_cell_species: List[set] = [set() for _ in range(len(cell_records))]
        per_cell_names: List[dict] = [{} for _ in range(len(cell_records))]
        per_cell_obs = [0 for _ in range(len(cell_records))]
        for row in sightings_df.itertuples(index=False):
            lat = getattr(row, "latitude")
            lng = getattr(row, "longitude")
            species_name = getattr(row, "species", "Unknown")
            if not (
                ARIZONA_BOUNDS["min_lat"] <= lat <= ARIZONA_BOUNDS["max_lat"]
                and ARIZONA_BOUNDS["min_lon"] <= lng <= ARIZONA_BOUNDS["max_lon"]
            ):
                continue
            i = min(int((lat - ARIZONA_BOUNDS["min_lat"]) / cell_height), lat_steps - 1)
            j = min(int((lng - ARIZONA_BOUNDS["min_lon"]) / cell_width), lon_steps - 1)
            idx = i * lon_steps + j
            per_cell_species[idx].add(species_name)
            per_cell_names[idx][species_name] = per_cell_names[idx].get(species_name, 0) + 1
            per_cell_obs[idx] += 1

        for idx, species_set in enumerate(per_cell_species):
            if not species_set:
                continue
            cell_records[idx]["species_count"] = float(len(species_set))
            cell_records[idx]["top_species"] = [
                name
                for name, _count in sorted(
                    per_cell_names[idx].items(),
                    key=lambda item: item[1],
                    reverse=True,
                )[:5]
            ]
            cell_records[idx]["obs_count"] = per_cell_obs[idx]

    data_grid = np.zeros((lat_steps, lon_steps))
    has_data = np.zeros((lat_steps, lon_steps), dtype=bool)
    for idx, cell in enumerate(cell_records):
        if cell["species_count"] > 0:
            data_grid[idx // lon_steps, idx % lon_steps] = cell["species_count"]
            has_data[idx // lon_steps, idx % lon_steps] = True

    radius = 3
    for idx, cell in enumerate(cell_records):
        if cell["species_count"] > 0:
            continue
        ci, cj = idx // lon_steps, idx % lon_steps
        weights, values = [], []
        for di in range(-radius, radius + 1):
            for dj in range(-radius, radius + 1):
                if di == 0 and dj == 0:
                    continue
                ni, nj = ci + di, cj + dj
                if 0 <= ni < lat_steps and 0 <= nj < lon_steps and has_data[ni, nj]:
                    dist = float(np.sqrt(di ** 2 + dj ** 2))
                    weights.append(1.0 / dist ** 2)
                    values.append(data_grid[ni, nj])
        if weights:
            cell["species_count"] = round(float(np.average(values, weights=weights)), 1)
            cell["interpolated"] = True

    df = pd.DataFrame(cell_records)
    df["top_species_json"] = df["top_species"].apply(json.dumps)
    df = df.drop(columns=["top_species"])
    return df


def save_species_grid_csv(df: pd.DataFrame) -> None:
    PRECOMPUTED_GRID_CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(PRECOMPUTED_GRID_CSV_PATH, index=False)

