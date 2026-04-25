import logging
import osmnx as ox
import networkx as nx
import geopandas as gpd
import pandas as pd
from shapely.geometry import Point

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Enable osmnx caching
ox.settings.use_cache = True

def load_sightings(lat: float = None, lon: float = None, radius_meters: int = 1000) -> pd.DataFrame:
    """
    Dummy function for eBird sightings to prevent ImportError.
    Eventually, this will connect to the real eBird API.
    """
    logger.info("Loading dummy sightings data.")
    data = [
        {"species": "Cactus Wren", "count": 2, "latitude": lat or 32.2226, "longitude": lon or -110.9747, "day_of_year": 100},
        {"species": "Gila Woodpecker", "count": 1, "latitude": lat or 32.2226, "longitude": lon or -110.9747, "day_of_year": 105}
    ]
    return pd.DataFrame(data)

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

def get_nearest_power_facility(lat: float, lon: float, radius_meters: int = 50000) -> dict:
    """
    Find the nearest power plant or generator within a radius using OSMnx.
    
    Returns:
        dict: {
            "has_facility": bool,
            "nearest_distance_meters": float or None,
            "facility_type": str
        }
    """
    logger.info(f"Searching for power facilities near lat={lat}, lon={lon} within {radius_meters}m")
    
    result = {
        "has_facility": False,
        "nearest_distance_meters": None,
        "facility_type": "unknown"
    }

    try:
        tags = {'power': ['plant', 'generator']}
        facilities = ox.features_from_point((lat, lon), tags=tags, dist=radius_meters)
        
        if facilities.empty:
            logger.info("No power facilities found within the radius.")
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
        source = (nearest_facility.get("generator:source") or 
                  nearest_facility.get("plant:source") or 
                  nearest_facility.get("source") or 
                  "unknown")
        
        # Handle cases where source might be a list or NaN
        if isinstance(source, list):
            source = source[0]
        if str(source) == 'nan':
            source = "unknown"
            
        result["facility_type"] = str(source)
        logger.info(f"Nearest facility found at {min_dist:.2f}m. Type: {result['facility_type']}")
        
    except Exception as e:
        logger.info(f"Error searching for power facilities: {e}")
        
    return result

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
