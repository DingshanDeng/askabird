"""
Random Forest model for biodiversity impact prediction.

Features
--------
dist_power_plant_km : float  – km to nearest power plant
road_proximity      : float  – 0-1 score (1 = on a major road)
building_density    : float  – 0-1 score (1 = dense urban core)
day_of_year         : int    – 1-365

Target
------
stability_score     : float  – 0-1  (1 = pristine, 0 = severely degraded)
"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import List

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error

from backend.config import (
    TUCSON_BOUNDS,
    CONSTRUCTION_IMPACT,
    OFFSET_STRUCTURES,
)
from backend.data_ingestion import load_sightings
from backend.mock_data import POWER_PLANTS, _dist_to_points, _road_density, _building_density

logger = logging.getLogger(__name__)

FEATURES = [
    "dist_power_plant_km",
    "road_proximity",
    "building_density",
    "day_of_year",
]


@lru_cache(maxsize=1)
def get_model() -> RandomForestRegressor:
    """Train (or retrieve cached) Random Forest model on sightings data."""
    df = load_sightings()

    # Ensure all feature columns exist (real eBird data may lack them)
    df = _enrich_features(df)

    X = df[FEATURES]
    y = df["stability_score"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )
    model = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1)
    model.fit(X_train, y_train)

    mae = mean_absolute_error(y_test, model.predict(X_test))
    logger.info("RF model trained. Test MAE = %.4f", mae)
    return model


def _enrich_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add derived feature columns when they are absent (e.g. real eBird data)."""
    if "dist_power_plant_km" not in df.columns:
        df["dist_power_plant_km"] = df.apply(
            lambda r: _dist_to_points(r["latitude"], r["longitude"], POWER_PLANTS) * 111,
            axis=1,
        )
    if "road_proximity" not in df.columns:
        df["road_proximity"] = df.apply(
            lambda r: _road_density(r["latitude"], r["longitude"]), axis=1
        )
    if "building_density" not in df.columns:
        df["building_density"] = df.apply(
            lambda r: _building_density(r["latitude"], r["longitude"]), axis=1
        )
    if "day_of_year" not in df.columns:
        df["day_of_year"] = 180  # default mid-year

    if "stability_score" not in df.columns:
        # Derive a plausible target from available features
        df["stability_score"] = np.clip(
            0.4
            + 0.3 * np.clip(df["dist_power_plant_km"] / 20.0, 0, 1)
            - 0.2 * df["road_proximity"]
            - 0.15 * df["building_density"],
            0.05,
            1.0,
        )
    return df


def _features_for_point(
    lat: float,
    lon: float,
    construction_type: str,
    day_of_year: int = 180,
) -> pd.DataFrame:
    """Build a single-row feature DataFrame for a given location."""
    dist_pp = _dist_to_points(lat, lon, POWER_PLANTS) * 111
    road_prox = _road_density(lat, lon)
    bldg_d = _building_density(lat, lon)

    # If user is placing a power plant, snap dist_pp to 0
    if construction_type == "power_plant":
        dist_pp = 0.0
    elif construction_type in ("industrial", "solar_farm"):
        dist_pp = max(dist_pp - 5.0, 0.5)
    elif construction_type in ("highway", "wind_farm"):
        road_prox = min(road_prox + 0.4, 1.0)
    elif construction_type == "building":
        bldg_d = min(bldg_d + 0.3, 1.0)

    return pd.DataFrame(
        [
            {
                "dist_power_plant_km": dist_pp,
                "road_proximity": road_prox,
                "building_density": bldg_d,
                "day_of_year": day_of_year,
            }
        ]
    )


def predict_impact(
    lat: float,
    lon: float,
    construction_type: str,
    day_of_year: int = 180,
) -> dict:
    """
    Predict biodiversity stability before and after a construction event.

    Returns
    -------
    dict with keys:
        baseline_score  : float  (before construction)
        impact_score    : float  (after construction)
        delta           : float  (impact_score - baseline_score, negative = harm)
        impact_pct      : float  (percentage change)
    """
    model = get_model()

    # Baseline (no extra construction)
    dist_pp = _dist_to_points(lat, lon, POWER_PLANTS) * 111
    road_prox = _road_density(lat, lon)
    bldg_d = _building_density(lat, lon)
    baseline_feat = pd.DataFrame([{
        "dist_power_plant_km": dist_pp,
        "road_proximity": road_prox,
        "building_density": bldg_d,
        "day_of_year": day_of_year,
    }])
    baseline_score = float(model.predict(baseline_feat)[0])

    # After construction
    impact_feat = _features_for_point(lat, lon, construction_type, day_of_year)

    # Apply construction-type multiplier
    multiplier = CONSTRUCTION_IMPACT.get(construction_type, 0.5)
    impact_score = baseline_score * (1.0 - multiplier * 0.5)
    impact_score = float(np.clip(impact_score, 0.0, 1.0))

    delta = impact_score - baseline_score
    impact_pct = (delta / max(baseline_score, 1e-6)) * 100

    return {
        "baseline_score": round(baseline_score, 4),
        "impact_score": round(impact_score, 4),
        "delta": round(delta, 4),
        "impact_pct": round(impact_pct, 2),
    }


def find_optimal_sites(
    bounds: dict,
    construction_type: str,
    grid_size: int = 20,
    top_n: int = 3,
) -> List[dict]:
    """
    Grid the region into grid_size x grid_size cells and return the
    top_n locations with the LOWEST negative impact (most bird-friendly).

    Parameters
    ----------
    bounds : dict with min_lat, max_lat, min_lon, max_lon
    construction_type : str
    grid_size : int  (default 20 → 400 cells)
    top_n : int

    Returns
    -------
    List of dicts: [{"lat": float, "lon": float, "impact_score": float, "delta": float}, ...]
    """
    lat_steps = np.linspace(bounds["min_lat"], bounds["max_lat"], grid_size)
    lon_steps = np.linspace(bounds["min_lon"], bounds["max_lon"], grid_size)

    results = []
    for lat in lat_steps:
        for lon in lon_steps:
            res = predict_impact(lat, lon, construction_type)
            results.append(
                {
                    "lat": round(float(lat), 6),
                    "lon": round(float(lon), 6),
                    "impact_score": res["impact_score"],
                    "delta": res["delta"],
                    "baseline_score": res["baseline_score"],
                }
            )

    # Sort by highest impact_score (least damage) then pick top_n
    results.sort(key=lambda x: x["impact_score"], reverse=True)
    return results[:top_n]


def suggest_offsets(impact_pct: float, construction_type: str) -> List[dict]:
    """
    Given a negative impact percentage, suggest offset structures and
    calculate how much of the loss each one can recover.

    Returns list of dicts sorted by effectiveness.
    """
    suggestions = []
    for name, info in OFFSET_STRUCTURES.items():
        offset_pct = abs(impact_pct) * info["weight"]
        suggestions.append(
            {
                "name": name,
                "description": info["description"],
                "offset_pct": round(offset_pct, 2),
                "radius_m": info["radius_m"],
            }
        )
    suggestions.sort(key=lambda x: x["offset_pct"], reverse=True)
    return suggestions
