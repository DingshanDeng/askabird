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
from typing import List
import pandas as pd
import requests
from backend.config import EBIRD_API_KEY, TUCSON_BOUNDS, ARIZONA_BOUNDS
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


@lru_cache(maxsize=1)
def fetch_hotspots_region(region_code: str = "US-AZ") -> List[dict]:
    """
    Return all eBird hotspots for an entire region (e.g. 'US-AZ' for Arizona).

    Uses the region hotspot endpoint which has no distance cap, so it covers
    the full state. Results are cached for the process lifetime.
    Falls back to an empty list when no API key is set.
    """
    if not EBIRD_API_KEY:
        return []
    try:
        resp = requests.get(
            f"https://api.ebird.org/v2/ref/hotspot/{region_code}",
            params={"fmt": "json"},
            headers={"X-eBirdApiToken": EBIRD_API_KEY},
            timeout=30,
        )
        resp.raise_for_status()
        raw = resp.json()
        return [
            {
                "locId": h.get("locId", ""),
                "locName": h.get("locName", "Unknown"),
                "lat": h.get("lat"),
                "lng": h.get("lng"),
                "latestObsDt": h.get("latestObsDt", ""),
                "numSpeciesAllTime": h.get("numSpeciesAllTime", 0),
            }
            for h in raw
            if h.get("lat") and h.get("lng")
        ]
    except Exception as exc:
        logger.warning("eBird region hotspot fetch failed (%s). Falling back to geo endpoint.", exc)
        # Fall back to geo-based fetch centred on Arizona
        b = ARIZONA_BOUNDS
        lat_c = (b["min_lat"] + b["max_lat"]) / 2
        lng_c = (b["min_lon"] + b["max_lon"]) / 2
        return fetch_hotspots(lat_c, lng_c, dist_km=50)


@lru_cache(maxsize=4)
def fetch_hotspots(lat: float, lng: float, dist_km: int = 30) -> List[dict]:
    """
    Return eBird hotspots within dist_km of the given coordinates.

    Each dict has: locId, locName, lat, lng, latestObsDt, numSpeciesAllTime.
    Falls back to an empty list when the key is absent or the request fails.
    """
    if not EBIRD_API_KEY:
        return []
    try:
        resp = requests.get(
            "https://api.ebird.org/v2/ref/hotspot/geo",
            params={"lat": lat, "lng": lng, "dist": dist_km, "fmt": "json"},
            headers={"X-eBirdApiToken": EBIRD_API_KEY},
            timeout=15,
        )
        resp.raise_for_status()
        raw = resp.json()
        return [
            {
                "locId": h.get("locId", ""),
                "locName": h.get("locName", "Unknown"),
                "lat": h.get("lat"),
                "lng": h.get("lng"),
                "latestObsDt": h.get("latestObsDt", ""),
                "numSpeciesAllTime": h.get("numSpeciesAllTime", 0),
            }
            for h in raw
            if h.get("lat") and h.get("lng")
        ]
    except Exception as exc:
        logger.warning("eBird hotspot fetch failed (%s).", exc)
        return []


@lru_cache(maxsize=4096)
def fetch_hotspot_species(loc_id: str) -> tuple:
    """Return all-time species codes for an eBird hotspot (tuple for lru_cache hashability).

    Falls back to an empty tuple when the key is absent or the request fails.
    """
    if not EBIRD_API_KEY:
        return ()
    try:
        resp = requests.get(
            f"https://api.ebird.org/v2/product/spplist/{loc_id}",
            headers={"X-eBirdApiToken": EBIRD_API_KEY},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        return tuple(data) if isinstance(data, list) else ()
    except Exception as exc:
        logger.warning("eBird spplist fetch failed for %s (%s).", loc_id, exc)
        return ()
