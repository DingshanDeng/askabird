import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingDown, TrendingUp, Shield, Plane, Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SiteContext } from "./BirdChat";

// Anything at or above this fraction of safety paints the bar green;
// anything below paints it red. Matches GOOD_SITE_THRESHOLD on the backend.
const SAFETY_THRESHOLD = 0.6;

function SafetyBar({ score, className }: { score: number; className?: string }) {
  const pct = Math.max(0, Math.min(1, score)) * 100;
  const safe = score >= SAFETY_THRESHOLD;
  return (
    <div
      className={cn(
        "relative h-1.5 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
    >
      <div
        className={cn(
          "h-full transition-all",
          safe ? "bg-saguaro" : "bg-destructive",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export interface SensitiveHit {
  name: string;
  status: string;
  count: number;
  distance_km?: number;
  lat?: number;
  lon?: number;
}

export interface CriteriaBreakdown {
  endangered: {
    score: number;
    species: SensitiveHit[];
    nearby_count?: number;
    nearest?: SensitiveHit;
    note: string;
  };
  migratory: {
    score: number;
    in_flyway: boolean;
    flyway: string | null;
    species: { name: string; count: number; distance_km?: number; lat?: number; lon?: number }[];
    hotspot?: { lat: number; lon: number; species_count: number; distance_km: number };
    note: string;
  };
  biodiversity: {
    score: number;
    species_count: number;
    observation_count: number;
    region_avg?: number;
    note: string;
  };
  weighted_baseline: number;
  top_species: { name: string; count: number }[];
}

export interface AnalysisResult extends SiteContext {
  impact_pct: number;
  species_count: number;
  observation_count: number;
  rationale: string;
  used_synthetic: boolean;
  is_good_site?: boolean;
  good_site_threshold?: number;
  region_avg_species?: number;
  criteria?: CriteriaBreakdown;
}


interface Props {
  result: AnalysisResult;
  onSave?: () => void;
  saving?: boolean;
  saved?: boolean;
}

function CriteriaBar({
  icon,
  label,
  weight,
  score,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  weight: string;
  score: number;
  note: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">{icon}</span>
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">· weight {weight}</span>
        <span className="ml-auto tabular-nums text-muted-foreground">{(score * 100).toFixed(0)}%</span>
      </div>
      <SafetyBar score={score} />
      <p className="text-xs text-muted-foreground leading-snug">{note}</p>
    </div>
  );
}

export default function ImpactResult({ result, onSave, saving, saved }: Props) {
  const positive = result.delta >= 0;
  const c = result.criteria;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Impact analysis</h3>
        {result.used_synthetic && (
          <Badge variant="outline" className="text-xs">synthetic data</Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-muted-foreground">Baseline safety</div>
          <div className="text-2xl font-semibold">{result.baseline_score.toFixed(2)}</div>
          <SafetyBar score={result.baseline_score} className="mt-1" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            After construction
            {result.is_good_site && (
              <Badge
                variant="outline"
                className="text-[9px] leading-none px-1.5 py-0.5 border-saguaro/50 text-saguaro"
              >
                Good spot
              </Badge>
            )}
          </div>
          <div className="text-2xl font-semibold">{result.impact_score.toFixed(2)}</div>
          <SafetyBar score={result.impact_score} className="mt-1" />
        </div>
      </div>

      <div
        className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
          result.is_good_site
            ? "bg-saguaro/10 text-saguaro"
            : positive
            ? "bg-muted text-foreground"
            : "bg-muted text-foreground"
        }`}
      >
        {result.delta >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
        <span className="font-medium">
          {result.delta >= 0 ? "+" : ""}
          {result.delta.toFixed(2)}
        </span>
        <span className="text-muted-foreground">
          {result.is_good_site
            ? "— above the 0.60 good-site threshold"
            : "— below the 0.60 good-site threshold"}
        </span>
      </div>

      {c && (
        <div className="rounded-md border border-border p-3 space-y-3 bg-muted/30">
          <div className="text-xs font-medium text-muted-foreground">Why this matters (high = safer)</div>
          <CriteriaBar
            icon={<Shield className="h-3.5 w-3.5" />}
            label="Listed-species safety"
            weight="0.50"
            score={c.endangered.score}
            note={c.endangered.note}
          />
          <CriteriaBar
            icon={<Plane className="h-3.5 w-3.5" />}
            label="Migration pressure"
            weight="0.30"
            score={c.migratory.score}
            note={c.migratory.note}
          />
          <CriteriaBar
            icon={<Leaf className="h-3.5 w-3.5" />}
            label="Biodiversity sensitivity"
            weight="0.20"
            score={c.biodiversity.score}
            note={c.biodiversity.note}
          />
        </div>
      )}

      <div className="text-xs text-muted-foreground leading-relaxed">{result.rationale}</div>

      {c && c.endangered.species.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1.5">Listed species nearby</div>
          <div className="flex flex-wrap gap-1.5">
            {c.endangered.species.map((s) => (
              <Badge key={s.name} variant="outline" className="text-xs">
                {s.name} · {s.status}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {result.top_species.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1.5">Top species nearby</div>
          <div className="flex flex-wrap gap-1.5">
            {result.top_species.map((s) => (
              <Badge key={s.name} variant="secondary" className="text-xs">
                {s.name} · {s.count}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {onSave && (
        <Button onClick={onSave} disabled={saving || saved} className="w-full" variant={saved ? "secondary" : "default"}>
          {saved ? "Saved to balance sheet ✓" : saving ? "Saving…" : "Save to balance sheet"}
        </Button>
      )}
    </div>
  );
}
