import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RegionData } from "@/components/MapView";

// Round to a moderately coarse cell so small pans don't thrash, but
// panning to a different city/region triggers a fresh region fetch.
// 0.1° ≈ 11 km buckets — small enough to follow exploration, large enough
// to dedupe rapid drag events.
function quantize(n: number) {
  return Math.round(n * 10) / 10;
}

export function useRegionBiodiversity(lat: number, lon: number, halfSpanDeg = 0.45) {
  const [region, setRegion] = useState<RegionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const qLat = quantize(lat);
  const qLon = quantize(lon);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("region-biodiversity", {
          body: { centerLat: qLat, centerLon: qLon, halfSpanDeg },
        });
        if (cancelled) return;
        if (error) throw error;
        setRegion(data as RegionData);
      } catch (e) {
        console.error("region-biodiversity failed", e);
        if (!cancelled) setRegion(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qLat, qLon, halfSpanDeg, refreshNonce]);

  const refresh = useCallback(() => setRefreshNonce((n) => n + 1), []);

  return { region, loading, refresh };
}
