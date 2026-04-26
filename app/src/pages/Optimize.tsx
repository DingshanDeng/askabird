import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Target, MapPin, Loader2, Sparkles, ArrowRight, ThumbsUp, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import MapView, { TUCSON_CENTER, type SitePin, type Suggestion } from "@/components/MapView";
import ImpactResult, { type AnalysisResult } from "@/components/ImpactResult";
import BirdChat, { type SiteContext } from "@/components/BirdChat";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRegionBiodiversity } from "@/hooks/useRegionBiodiversity";

const CONSTRUCTION_TYPES = [
  { value: "industrial", label: "Industrial site" },
  { value: "building", label: "Residential area" },
  { value: "solar_farm", label: "Solar farm" },
  { value: "wind_farm", label: "Wind farm" },
  { value: "nuclear_farm", label: "Nuclear plant" },
];

export default function Optimize() {
  const { user } = useAuth();
  const [proposed, setProposed] = useState<{ lat: number; lon: number } | null>(null);
  const [type, setType] = useState("building");
  const [history, setHistory] = useState<SitePin[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  // Viewport center — drives heatmap fetches and updates as the user pans
  // so they can plan beyond the Tucson area.
  const [viewCenter, setViewCenter] = useState<{ lat: number; lon: number }>({
    lat: TUCSON_CENTER[0],
    lon: TUCSON_CENTER[1],
  });

  // Use the proposed point if there is one, otherwise the panned viewport.
  const regionLat = proposed?.lat ?? viewCenter.lat;
  const regionLon = proposed?.lon ?? viewCenter.lon;
  const { region, loading: regionLoading, refresh } = useRegionBiodiversity(regionLat, regionLon);

  const loadHistory = async () => {
    const { data } = await supabase
      .from("sites")
      .select("id, lat, lon, construction_type, delta")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setHistory(data as SitePin[]);
  };

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    setResult(null);
    setSaved(false);
    setSuggestions([]);
  }, [proposed?.lat, proposed?.lon, type]);

  const handleMapClick = (lat: number, lon: number) => {
    setProposed({ lat, lon });
  };

  const runAnalysis = async (lat: number, lon: number, ctype: string) => {
    setAnalyzing(true);
    setResult(null);
    setSuggestions([]);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-site", {
        body: { lat, lon, construction_type: ctype },
      });
      if (error) throw error;
      setResult({ ...data, lat, lon, construction_type: ctype });

      // If the site is already a "good spot" (post-construction safety >= 0.6),
      // skip the alternatives lookup — no point searching for somewhere better.
      const isGood = data?.is_good_site ?? (typeof data?.impact_score === "number" && data.impact_score >= 0.6);
      if (isGood) {
        setSuggestions([]);
        setLoadingSuggestions(false);
      } else {
        // Fire-and-await suggestions in parallel
        setLoadingSuggestions(true);
        supabase.functions
          .invoke("suggest-alternatives", { body: { lat, lon, construction_type: ctype } })
          .then(({ data: sd, error: se }) => {
            if (se) throw se;
            setSuggestions(sd?.suggestions ?? []);
          })
          .catch((e) => {
            console.error(e);
            setSuggestions([]);
          })
          .finally(() => setLoadingSuggestions(false));
      }
    } catch (e) {
      console.error(e);
      toast.error("Analysis failed. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAnalyze = () => {
    if (!proposed) return;
    runAnalysis(proposed.lat, proposed.lon, type);
  };

  const handleSelectSuggestion = (s: Suggestion) => {
    setProposed({ lat: s.lat, lon: s.lon });
    // Re-run analysis at the new spot with current construction type
    setTimeout(() => runAnalysis(s.lat, s.lon, type), 0);
  };

  const handleSave = async () => {
    if (!result || !user) return;
    setSaving(true);
    const { error } = await supabase.from("sites").insert({
      user_id: user.id,
      lat: result.lat,
      lon: result.lon,
      construction_type: result.construction_type,
      baseline_score: result.baseline_score,
      impact_score: result.impact_score,
      delta: result.delta,
      rationale: result.rationale,
    });
    setSaving(false);
    if (error) toast.error("Failed to save: " + error.message);
    else {
      setSaved(true);
      toast.success("Saved to your balance sheet");
      loadHistory();
    }
  };

  

  return (
    <div className="container py-6 space-y-4">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Target className="h-7 w-7 text-primary" />
          Construction plan
        </h1>
        <p className="text-muted-foreground mt-1">
          Drop a proposed structure on the map. We'll score the biodiversity impact and surface
          kinder nearby alternatives.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] items-start">
        {/* Left: scrollable column */}
        <div className="space-y-4">
          <Card className="shadow-[var(--shadow-soft)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                Propose a construction
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {proposed ? (
                <div className="text-sm space-y-1">
                  <div><span className="text-muted-foreground">Lat:</span> {proposed.lat.toFixed(4)}</div>
                  <div><span className="text-muted-foreground">Lon:</span> {proposed.lon.toFixed(4)}</div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Click the map to drop a proposed site.</p>
              )}

              <div>
                <Label className="mb-1.5 block">Construction type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONSTRUCTION_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button className="w-full" disabled={!proposed || analyzing} onClick={handleAnalyze}>
                {analyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  "Analyze impact"
                )}
              </Button>
            </CardContent>
          </Card>

          {result && (
            <Card className="shadow-[var(--shadow-soft)] animate-in fade-in slide-in-from-bottom-2 duration-300">
              <CardContent className="pt-6">
                <ImpactResult
                  result={result}
                  onSave={user ? handleSave : undefined}
                  saving={saving}
                  saved={saved}
                />
              </CardContent>
            </Card>
          )}

          {result && (() => {
            const isGoodSite = (result as AnalysisResult & { is_good_site?: boolean }).is_good_site
              ?? result.impact_score >= 0.6;
            return (
              <Card className="shadow-[var(--shadow-soft)] animate-in fade-in slide-in-from-bottom-2 duration-300">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    {loadingSuggestions ? (
                      <Sparkles className="h-4 w-4 text-saguaro" />
                    ) : isGoodSite ? (
                      <ThumbsUp className="h-4 w-4 text-saguaro" />
                    ) : (
                      <Sparkles className="h-4 w-4 text-saguaro" />
                    )}
                    {loadingSuggestions
                      ? "Looking for safer spots"
                      : isGoodSite
                      ? "Good spot for new construction"
                      : "Safer nearby spots"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {loadingSuggestions && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Scanning the surrounding area…
                    </div>
                  )}
                  {!loadingSuggestions && isGoodSite && (
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Post-construction safety stays at <span className="font-semibold text-foreground">{result.impact_score.toFixed(2)}</span>{" "}
                      (above the 0.60 threshold). This is a recommended spot. Even so, please
                      keep protecting the local habitat: minimize lighting, preserve native
                      plants, and build with care.
                    </p>
                  )}
                  {!loadingSuggestions && !isGoodSite && suggestions.length === 0 && (
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      We couldn't find a meaningfully safer spot in the immediate area. Consider
                      moving farther afield, or revisit the construction type.
                    </p>
                  )}
                  {!isGoodSite && suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleSelectSuggestion(s)}
                      className="w-full text-left rounded-md border border-border hover:border-primary/60 hover:bg-muted/40 transition-colors p-3 flex items-start gap-3"
                    >
                      <div className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-saguaro/15 text-saguaro text-xs font-bold">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium flex items-center gap-2">
                          ~{s.distance_km} km away
                          {s.is_good_site && (
                            <span className="text-[10px] uppercase tracking-wide font-semibold text-saguaro">good spot</span>
                          )}
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{s.reason}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Baseline {s.baseline.toFixed(2)} · after {s.impact.toFixed(2)}
                        </div>
                      </div>
                    </button>
                  ))}
                </CardContent>
              </Card>
            );
          })()}

          {result && !loadingSuggestions && (() => {
            const isGoodSite = (result as AnalysisResult & { is_good_site?: boolean }).is_good_site
              ?? result.impact_score >= 0.6;
            const birdSpecies = result.top_species[0]?.name ?? "Cactus Wren";
            const ctypeLabel = result.construction_type.replace(/_/g, " ");
            const profile = (result as AnalysisResult & { construction_profile?: { main_concern?: string } }).construction_profile;
            const mainConcern = profile?.main_concern;

            // Build concrete concerns to feed the bird
            const c = result.criteria;
            const concerns: string[] = [];
            if (mainConcern) {
              concerns.push(`General: ${mainConcern}.`);
            }
            if (c?.endangered?.nearby_count && c.endangered.nearby_count > 0 && c.endangered.nearest) {
              const n = c.endangered.nearest;
              concerns.push(
                `Endangered/sensitive nearby: ${n.name} (${n.status}) only ~${n.distance_km?.toFixed(1)} km away.`,
              );
            }
            if (c?.migratory?.hotspot) {
              const h = c.migratory.hotspot;
              concerns.push(
                `Migration hotspot ~${h.distance_km.toFixed(1)} km away with ${h.species_count} migrant species (in the ${c.migratory.flyway}).`,
              );
            }
            if (c?.biodiversity && typeof c.biodiversity.region_avg === "number" &&
                c.biodiversity.species_count > c.biodiversity.region_avg) {
              concerns.push(
                `Local biodiversity (${c.biodiversity.species_count} species) is above the regional average (~${c.biodiversity.region_avg.toFixed(0)}).`,
              );
            }
            const concernsText = concerns.length > 0 ? " Key concerns: " + concerns.join(" ") : "";

            const opener = isGoodSite
              ? `A human is proposing a ${ctypeLabel} where I live. Your analysis says this is a GOOD spot — post-construction safety is ${result.impact_score.toFixed(2)} (above 0.60). As the ${birdSpecies}, greet them warmly, confirm it's a reasonable place, briefly mention the specific risk of a ${ctypeLabel} (${mainConcern ?? "habitat disturbance"}), and encourage them to keep protecting the habitat — minimize lighting, preserve native plants, build carefully — and invite them to ask questions. Keep it under 100 words.`
              : `A human is proposing a ${ctypeLabel} where I live. Your analysis says this is NOT a good spot — post-construction safety is only ${result.impact_score.toFixed(2)} (below 0.60).${concernsText} As the ${birdSpecies}, greet them, explain the specific risk a ${ctypeLabel} brings (${mainConcern ?? "habitat disturbance"}), name the concerns above (which species, how close, where the migration hotspot is), and gently urge them to move a little farther to one of the suggested safer spots. Invite questions. Keep it under 120 words.`;

            const siteCtx: SiteContext = {
              lat: result.lat,
              lon: result.lon,
              construction_type: result.construction_type,
              baseline_score: result.baseline_score,
              impact_score: result.impact_score,
              delta: result.delta,
              top_species: result.top_species,
            };

            return (
              <Card className="shadow-[var(--shadow-soft)] animate-in fade-in slide-in-from-bottom-2 duration-300">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-primary" />
                    Hear from the neighbors
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[460px]">
                    <BirdChat
                      key={`${result.lat}-${result.lon}-${result.construction_type}-${isGoodSite}`}
                      siteContext={siteCtx}
                      birdSpecies={birdSpecies}
                      autoOpener={opener}
                      quickReplies={["Hey there, how can I reduce our impact even more?"]}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })()}

        </div>

        {/* Right: sticky map */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <Card className="overflow-hidden shadow-[var(--shadow-soft)]">
            <div className="h-[calc(100vh-14rem)] min-h-[420px] relative">
              <MapView
                center={proposed ? [proposed.lat, proposed.lon] : TUCSON_CENTER}
                zoom={11}
                proposed={proposed}
                history={history}
                suggestions={suggestions}
                onMapClick={handleMapClick}
                onSuggestionClick={handleSelectSuggestion}
                recenterOnCenterChange
                region={region}
                regionLoading={regionLoading}
                onCenterChange={(lat, lon) => setViewCenter({ lat, lon })}
                onRefreshRegion={refresh}
              />
              {!proposed && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-card/95 backdrop-blur border border-border rounded-full px-4 py-1.5 text-xs font-medium shadow-[var(--shadow-soft)] flex items-center gap-1.5 z-[1000]">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  Click the map to drop a proposed site
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* <p className="text-xs text-muted-foreground text-center pt-2">
        Bird sighting data powered by{" "}
        <a
          href="https://ebird.org"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-foreground"
        >
          eBird
        </a>
        .
      </p> */}
    </div>
  );
}
