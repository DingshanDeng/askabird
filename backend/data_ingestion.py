"""
Data ingestion helpers.

Real API usage:
  - eBird Basic Dataset via the eBird API 2.0
    https://documenter.getpostman.com/view/664302/S1ENwy59
  - OpenStreetMap via the Overpass API

Falls back to mock data when API keys are absent.
"""
import logging
from functools import lru_cache
import pandas as pd
import requests
from backend.config import EBIRD_API_KEY, TUCSON_BOUNDS
from backend.mock_data import generate_sightings, generate_infrastructure

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def load_sightings() -> pd.DataFrame:
    """Return bird sighting data, using the eBird API when a key is set."""
    if EBIRD_API_KEY:
        try:
            return _fetch_ebird_sightings()
        except Exception as exc:
            logger.warning("eBird API call failed (%s). Falling back to mock data.", exc)
    return generate_sightings()


@lru_cache(maxsize=1)
def load_infrastructure() -> pd.DataFrame:
    """Return OSM infrastructure data, using Overpass API when available."""
    try:
        return _fetch_osm_infrastructure()
    except Exception as exc:
        logger.warning("Overpass API call failed (%s). Falling back to mock data.", exc)
    return generate_infrastructure()


# ---------------------------------------------------------------------------
# Real API helpers (used only when keys/network are available)
# ---------------------------------------------------------------------------

def _fetch_ebird_sightings() -> pd.DataFrame:
    """Fetch recent bird observations from eBird for the Tucson bounding box."""
    b = TUCSON_BOUNDS
    url = (
        "https://api.ebird.org/v2/data/obs/geo/recent"
        f"?lat={(b['min_lat'] + b['max_lat']) / 2}"
        f"&lng={(b['min_lon'] + b['max_lon']) / 2}"
        "&dist=30&maxResults=3000&back=30"
    )
    headers = {"X-eBirdApiToken": EBIRD_API_KEY}
    resp = requests.get(url, headers=headers, timeout=15)
    resp.raise_for_status()
    raw = resp.json()
    if not raw:
        raise ValueError("Empty eBird response")
    rows = [
        {
            "latitude": r["lat"],
            "longitude": r["lng"],
            "species": r.get("comName", "Unknown"),
            "day_of_year": pd.Timestamp(r["obsDt"]).day_of_year,
        }
        for r in raw
    ]
    return pd.DataFrame(rows)


def _fetch_osm_infrastructure() -> pd.DataFrame:
    """Query Overpass API for power plants, industrial areas, and highways."""
    b = TUCSON_BOUNDS
    overpass_query = f"""
    [out:json][timeout:25];
    (
      node["power"="plant"]({b['min_lat']},{b['min_lon']},{b['max_lat']},{b['max_lon']});
      node["landuse"="industrial"]({b['min_lat']},{b['min_lon']},{b['max_lat']},{b['max_lon']});
      way["highway"~"motorway|trunk|primary"]({b['min_lat']},{b['min_lon']},{b['max_lat']},{b['max_lon']});
    );
    out center;
    """
    resp = requests.post(
        "https://overpass-api.de/api/interpreter",
        data=overpass_query,
        timeout=30,
    )
    resp.raise_for_status()
    elements = resp.json().get("elements", [])
    rows = []
    for el in elements:
        lat = el.get("lat") or el.get("center", {}).get("lat")
        lon = el.get("lon") or el.get("center", {}).get("lon")
        if lat and lon:
            tags = el.get("tags", {})
            rows.append({
                "latitude": lat,
                "longitude": lon,
                "type": tags.get("power") or tags.get("landuse") or tags.get("highway", "unknown"),
            })
    if not rows:
        raise ValueError("Empty Overpass response")
    return pd.DataFrame(rows)
