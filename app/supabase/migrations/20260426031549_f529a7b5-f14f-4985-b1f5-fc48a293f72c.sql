-- Clear region biodiversity cache so it gets repopulated with the corrected
-- (cell-sized) eBird search radius. Previous rows used a ~1 mile radius
-- which dramatically under-counted unique species per grid cell.
TRUNCATE TABLE public.ebird_nearby_cache;