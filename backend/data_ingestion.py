import logging
import osmnx as ox
import networkx as nx
import geopandas as gpd
import pandas as pd
import requests
from functools import lru_cache
from typing import List
from shapely.geometry import Point
from backend.config import EBIRD_API_KEY, TUCSON_BOUNDS, ARIZONA_BOUNDS
from backend.mock_data import generate_sightings, generate_infrastructure

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Enable osmnx caching and set timeout
ox.settings.use_cache = True
ox.settings.timeout = 30

@lru_cache(maxsize=1)
def load_sightings() -> pd.DataFrame:
    """Return bird sighting data, using the eBird API when a key is set."""
    if EBIRD_API_KEY:
        try:
            return _fetch_ebird_sightings()
        except Exception as exc:
            logger.warning("eBird API call failed (%s). Falling back to mock data.", exc)
    return generate_sightings()

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

def get_infrastructure_density(lat: float, lon: float, radius_meters: int = 1000) -> dict:
    """
    Fetch human infrastructure data (buildings and streets) within a radius using OSMnx.
    
    Returns:
        dict: {
            "building_count": int,
            "total_street_length": float,
            "latitude": float,
            "longitude": float,
            "radius": int
        }
    """
    logger.info(f"Fetching infrastructure data for lat={lat}, lon={lon}, radius={radius_meters}m")
    
    result = {
        "building_count": 0,
        "total_street_length": 0.0,
        "latitude": lat,
        "longitude": lon,
        "radius": radius_meters
    }

    try:
        # 1. Fetch buildings
        try:
            buildings = ox.features_from_point((lat, lon), tags={"building": True}, dist=radius_meters)
            result["building_count"] = len(buildings)
            logger.info(f"Found {result['building_count']} buildings.")
        except Exception as e:
            logger.info(f"No buildings found or error fetching buildings: {e}")
            result["building_count"] = 0

        # 2. Fetch street network
        try:
            G = ox.graph_from_point((lat, lon), dist=radius_meters, network_type="drive")
            _, edges = ox.graph_to_gdfs(G)
            result["total_street_length"] = float(edges["length"].sum())
            logger.info(f"Total street length: {result['total_street_length']:.2f} meters.")
        except Exception as e:
            logger.info(f"No streets found or error fetching streets: {e}")
            result["total_street_length"] = 0.0

    except Exception as e:
        logger.error(f"Unexpected error in get_infrastructure_density: {e}")

    return result

def get_nearest_power_facility(lat: float, lon: float, radius_meters: int = 15000) -> dict:
    """
    Find the nearest power plant within a radius using OSMnx.
    
    Returns:
        dict: {
            "has_facility": bool,
            "nearest_distance_meters": float or None,
            "facility_type": str
        }
    """
    logger.info(f"Searching for power plants near lat={lat}, lon={lon} within {radius_meters}m")
    
    result = {
        "has_facility": False,
        "nearest_distance_meters": None,
        "facility_type": "unknown"
    }

    try:
        tags = {'power': 'plant'}
        facilities = ox.features_from_point((lat, lon), tags=tags, dist=radius_meters)
        
        if facilities.empty:
            logger.info("No power plants found within the radius.")
            return result
            
        result["has_facility"] = True
        
        # Project to local UTM for accurate distance calculation
        gdf_proj = ox.project_gdf(facilities)
        
        # Project the origin point to the same CRS
        point_gdf = gpd.GeoDataFrame(geometry=[Point(lon, lat)], crs="EPSG:4326")
        point_gdf_proj = point_gdf.to_crs(gdf_proj.crs)
        origin_proj = point_gdf_proj.geometry.iloc[0]
        
        # Calculate distances to all facilities
        distances = gdf_proj.distance(origin_proj)
        min_dist = distances.min()
        result["nearest_distance_meters"] = float(min_dist)
        
        # Find the row with the minimum distance to extract tags
        nearest_facility = facilities.iloc[distances.argmin()]
        
        # Extract energy source from various possible tags
        source = (nearest_facility.get("plant:source") or 
                  nearest_facility.get("source") or 
                  "unknown")
        
        # Handle cases where source might be a list or NaN
        if isinstance(source, list):
            source = source[0]
        if str(source) == 'nan':
            source = "unknown"
            
        result["facility_type"] = str(source)
        logger.info(f"Nearest plant found at {min_dist:.2f}m. Type: {result['facility_type']}")
        
    except Exception as e:
        logger.error(f"Error searching for power facilities (timeout or network): {e}")
        return {
            "has_facility": False,
            "nearest_distance_meters": None,
            "facility_type": "unknown"
        }
        
    return result

@lru_cache(maxsize=1)
def fetch_hotspots_region(region_code: str = "US-AZ") -> List[dict]:
    """
    Return all eBird hotspots for an entire region (e.g. 'US-AZ' for Arizona).
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
        b = ARIZONA_BOUNDS
        lat_c = (b["min_lat"] + b["max_lat"]) / 2
        lng_c = (b["min_lon"] + b["max_lon"]) / 2
        return fetch_hotspots(lat_c, lng_c, dist_km=50)

@lru_cache(maxsize=4)
def fetch_hotspots(lat: float, lng: float, dist_km: int = 30) -> List[dict]:
    """
    Return eBird hotspots within dist_km of the given coordinates.
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
    """Return all-time species codes for an eBird hotspot."""
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

if __name__ == "__main__":
    # Test locations
    test_locations = [
        {"name": "Tucson Downtown", "lat": 32.2226, "lon": -110.9747},
        {"name": "Saguaro National Park", "lat": 32.1746, "lon": -110.7339}
    ]

    for loc in test_locations:
        print(f"\n--- Testing location: {loc['name']} ---")
        
        # Test Infrastructure Density
        density_data = get_infrastructure_density(loc['lat'], loc['lon'])
        print(f"Density Results: {density_data}")
        
        # Test Nearest Power Facility
        power_data = get_nearest_power_facility(loc['lat'], loc['lon'])
        print(f"Power Facility Results: {power_data}")
