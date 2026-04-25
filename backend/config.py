import os
from dotenv import load_dotenv

load_dotenv()

EBIRD_API_KEY = os.getenv("EBIRD_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

# Tucson, AZ bounding box
TUCSON_BOUNDS = {
    "min_lat": 32.05,
    "max_lat": 32.35,
    "min_lon": -111.10,
    "max_lon": -110.75,
}

CONSTRUCTION_TYPES = [
    "power_plant",
    "industrial",
    "highway",
    "building",
    "solar_farm",
    "wind_farm",
]

OFFSET_STRUCTURES = {
    "Urban Forest": {
        "weight": 0.30,
        "description": "Planting native trees to provide canopy habitat and food sources.",
        "radius_m": 500,
    },
    "Wetland Restoration": {
        "weight": 0.40,
        "description": "Restoring wetlands to support water birds and amphibians.",
        "radius_m": 800,
    },
    "Green Corridor": {
        "weight": 0.20,
        "description": "Connecting fragmented habitats so birds can safely move.",
        "radius_m": 1000,
    },
    "Bird-Friendly Building Standards": {
        "weight": 0.15,
        "description": "Reducing glass-strike collisions and noise pollution.",
        "radius_m": 200,
    },
    "Native Shrubland": {
        "weight": 0.25,
        "description": "Restoring Sonoran Desert scrub for ground-nesting species.",
        "radius_m": 600,
    },
}

# Impact multipliers (higher = more damaging)
CONSTRUCTION_IMPACT = {
    "power_plant": 0.85,
    "industrial": 0.70,
    "highway": 0.55,
    "solar_farm": 0.45,
    "wind_farm": 0.60,
    "building": 0.35,
}
