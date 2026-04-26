import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bird, Printer, ArrowLeft, Loader2, Shield, Plane, Leaf, TrendingDown, TrendingUp, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { getBirdAvatar } from "@/assets/birds";
import { cn } from "@/lib/utils";
import type { AnalysisResult } from "@/components/ImpactResult";

interface ReportData {
  bird_title: string;
  executive_summary: string;
  endangered_analysis: string;
  migratory_analysis: string;
  biodiversity_analysis: string;
  recommendations: { title: string; description: string; score_credit: number }[];
  closing_statement: string;
}

interface LocationState {
  result: AnalysisResult;
  birdSpecies: string;
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(1, score)) * 100;
  const safe = score >= 0.6;
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", safe ? "bg-emerald-500" : "bg-red-400")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn("text-sm font-semibold tabular-nums w-10 text-right", safe ? "text-emerald-700" : "text-red-600")}>
        {score.toFixed(2)}
      </span>
    </div>
  );
}

function SectionHeader({ icon, title, score }: { icon: React.ReactNode; title: string; score?: number }) {
  return (
    <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200">
      <div className="flex items-center gap-2 text-gray-800">
        {icon}
        <h3 className="font-semibold text-base">{title}</h3>
      </div>
      {score !== undefined && (
        <div className="flex items-center gap-2 w-48">
          <ScoreBar score={score} />
        </div>
      )}
    </div>
  );
}

export default function Report() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;

  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state?.result) return;
    const { result, birdSpecies } = state;
    setLoading(true);
    (async () => {
      try {
        const { data, error: fnErr } = await supabase.functions.invoke("generate-report", {
          body: {
            bird_species: birdSpecies,
            lat: result.lat,
            lon: result.lon,
            construction_type: result.construction_type,
            baseline_score: result.baseline_score,
            impact_score: result.impact_score,
            delta: result.delta,
            top_species: result.top_species,
            criteria: result.criteria,
          },
        });
        if (fnErr) throw fnErr;
        setReport(data.report);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Report generation failed.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (!state?.result) {
    return (
      <div className="container py-20 text-center space-y-4">
        <Bird className="h-12 w-12 text-muted-foreground mx-auto" />
        <h2 className="text-xl font-semibold">No site selected</h2>
        <p className="text-muted-foreground">Run a site analysis on the Find a Spot page first, then generate a report from there.</p>
        <Button onClick={() => navigate("/optimize")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Go to Find a Spot
        </Button>
      </div>
    );
  }

  const { result, birdSpecies } = state;
  const avatar = getBirdAvatar(birdSpecies);
  const isGood = result.is_good_site ?? result.impact_score >= 0.6;
  const ctypeLabel = result.construction_type.replace(/_/g, " ");
  const reportDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const c = result.criteria;

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">

      {/* Toolbar — hidden when printing */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back
        </Button>
        <span className="text-sm font-medium text-gray-600">Environmental Impact Guidance Report</span>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-1.5" />
          Print / Save PDF
        </Button>
      </div>

      {/* Report document */}
      <div className="max-w-3xl mx-auto px-6 py-10 print:py-6 print:px-8">

        {/* Report Header */}
        <div className="mb-8 pb-6 border-b-2 border-gray-800">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              {avatar ? (
                <img src={avatar} alt={birdSpecies} className="h-16 w-16 rounded-full object-cover ring-2 ring-gray-300" />
              ) : (
                <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center">
                  <Bird className="h-8 w-8 text-gray-400" />
                </div>
              )}
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-400 font-medium mb-0.5">Prepared by</p>
                <p className="text-lg font-bold text-gray-900">{birdSpecies}</p>
                <p className="text-xs text-gray-500 mt-0.5">{report?.bird_title ?? "Regional Environmental Correspondent, Sonoran Desert Division"}</p>
              </div>
            </div>
            <div className="text-right text-xs text-gray-500 space-y-1 shrink-0">
              <p><span className="font-medium">Date:</span> {reportDate}</p>
              <p><span className="font-medium">Coordinates:</span> {result.lat.toFixed(4)}°N, {Math.abs(result.lon).toFixed(4)}°W</p>
              <p><span className="font-medium">Type:</span> {ctypeLabel}</p>
            </div>
          </div>

          <h1 className="mt-6 text-2xl font-bold text-gray-900 uppercase tracking-wide">
            Environmental Impact Guidance Report
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Biodiversity Assessment · Sonoran Desert Region · AskABird Platform
          </p>
        </div>

        {/* Score Summary */}
        <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xs uppercase tracking-widest text-gray-400 font-medium mb-4">Biodiversity Safety Scores</h2>
          <div className="grid grid-cols-2 gap-6 mb-4">
            <div>
              <p className="text-xs text-gray-500 mb-1.5">Baseline (current)</p>
              <ScoreBar score={result.baseline_score} />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1.5">
                Post-construction (projected)
                {isGood && <Badge variant="outline" className="ml-2 text-[9px] py-0 text-emerald-700 border-emerald-300">Good site</Badge>}
              </p>
              <ScoreBar score={result.impact_score} />
            </div>
          </div>
          <div className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
            isGood ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
          )}>
            {result.delta >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            <span className="font-medium">{result.delta >= 0 ? "+" : ""}{result.delta.toFixed(2)}</span>
            <span className="text-gray-500">—</span>
            <span>{isGood ? "Post-construction safety remains above the 0.60 threshold." : "Post-construction safety falls below the 0.60 threshold. Mitigation is recommended."}</span>
          </div>

          {c && (
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
              <div className="flex items-center gap-3 text-xs text-gray-600">
                <Shield className="h-3.5 w-3.5 shrink-0" />
                <span className="w-44">Listed-species safety <span className="text-gray-400">· wt 0.50</span></span>
                <div className="flex-1"><ScoreBar score={c.endangered.score} /></div>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-600">
                <Plane className="h-3.5 w-3.5 shrink-0" />
                <span className="w-44">Migration pressure <span className="text-gray-400">· wt 0.30</span></span>
                <div className="flex-1"><ScoreBar score={c.migratory.score} /></div>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-600">
                <Leaf className="h-3.5 w-3.5 shrink-0" />
                <span className="w-44">Biodiversity sensitivity <span className="text-gray-400">· wt 0.20</span></span>
                <div className="flex-1"><ScoreBar score={c.biodiversity.score} /></div>
              </div>
            </div>
          )}
        </div>

        {/* Loading / Error */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
            <Loader2 className="h-7 w-7 animate-spin" />
            <p className="text-sm">{birdSpecies} is preparing the formal report…</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 mb-6">
            Report generation failed: {error}
          </div>
        )}

        {report && (
          <div className="space-y-8 text-gray-800 leading-relaxed text-[0.95rem]">

            {/* Executive Summary */}
            <section>
              <h2 className="text-sm uppercase tracking-widest text-gray-400 font-medium mb-4">Executive Summary</h2>
              <div className="space-y-3 whitespace-pre-line">{report.executive_summary}</div>
            </section>

            <hr className="border-gray-200" />

            {/* Criteria Analyses */}
            <section>
              <h2 className="text-sm uppercase tracking-widest text-gray-400 font-medium mb-5">Detailed Criteria Analysis</h2>
              <div className="space-y-7">

                <div>
                  <SectionHeader
                    icon={<Shield className="h-4 w-4 text-gray-500" />}
                    title="Listed-Species Safety"
                    score={c?.endangered.score}
                  />
                  {c?.endangered.species.length ? (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {c.endangered.species.map((s) => (
                        <Badge key={s.name} variant="outline" className="text-xs">{s.name} · {s.status}</Badge>
                      ))}
                    </div>
                  ) : null}
                  <div className="whitespace-pre-line text-gray-700">{report.endangered_analysis}</div>
                </div>

                <div>
                  <SectionHeader
                    icon={<Plane className="h-4 w-4 text-gray-500" />}
                    title="Migration Pressure"
                    score={c?.migratory.score}
                  />
                  <div className="whitespace-pre-line text-gray-700">{report.migratory_analysis}</div>
                </div>

                <div>
                  <SectionHeader
                    icon={<Leaf className="h-4 w-4 text-gray-500" />}
                    title="Biodiversity Sensitivity"
                    score={c?.biodiversity.score}
                  />
                  <div className="whitespace-pre-line text-gray-700">{report.biodiversity_analysis}</div>
                </div>
              </div>
            </section>

            <hr className="border-gray-200" />

            {/* Mitigation Recommendations */}
            <section>
              <h2 className="text-sm uppercase tracking-widest text-gray-400 font-medium mb-5">Mitigation Recommendations</h2>
              <div className="space-y-4">
                {report.recommendations.map((r, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">{i + 1}</span>
                        <h4 className="font-semibold text-gray-900 text-sm">{r.title}</h4>
                      </div>
                      {r.score_credit > 0 && (
                        <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5 shrink-0">
                          +{r.score_credit.toFixed(2)} est. credit
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed pl-8">{r.description}</p>
                  </div>
                ))}
              </div>
            </section>

            <hr className="border-gray-200" />

            {/* Closing */}
            <section>
              <h2 className="text-sm uppercase tracking-widest text-gray-400 font-medium mb-4">Closing Statement</h2>
              <div className="whitespace-pre-line text-gray-700 italic border-l-4 border-gray-300 pl-5">
                {report.closing_statement}
              </div>
            </section>

            {/* Scope Disclaimer */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 leading-relaxed">
              <div className="flex gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Scope Notice — </span>
                  This report evaluates environmental biodiversity impact only, from a wildlife perspective. A responsible and thorough development assessment must also consider cultural heritage, Indigenous land history, human neighbors and community wellbeing, noise and traffic impacts, and applicable local regulations. The perspectives of birds are one voice among many that deserve to be heard.
                </div>
              </div>
            </div>

            {/* Report Footer */}
            <div className="pt-6 border-t border-gray-200 text-xs text-gray-400 flex items-center justify-between">
              <div>
                <p>Report prepared by <span className="font-medium">{birdSpecies}</span> · {report.bird_title}</p>
                <p className="mt-0.5">Generated {reportDate} · AskABird Environmental Platform · Powered by eBird &amp; Gemini/Gemma4</p>
              </div>
              <div className="text-right">
                <p>Score threshold: 0.60</p>
                <p>Biodiversity assessment only</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
