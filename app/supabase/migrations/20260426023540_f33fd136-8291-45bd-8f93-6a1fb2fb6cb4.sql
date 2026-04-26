CREATE TABLE IF NOT EXISTS public.ebird_nearby_cache (
  cell_key text PRIMARY KEY,
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  species jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ebird_nearby_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read nearby cache"
ON public.ebird_nearby_cache
FOR SELECT
TO authenticated
USING (true);

CREATE INDEX IF NOT EXISTS idx_ebird_nearby_cache_fetched_at ON public.ebird_nearby_cache(fetched_at);