import { useMemo, useState } from 'react';
import { useAnalyticsQuery } from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ToggleGroup,
  ToggleGroupItem,
  Skeleton,
  Alert,
  AlertDescription,
  Label,
} from '@databricks/appkit-ui/react';
import { IndiaMap, type StateDatum } from '../components/IndiaMap';
import { RegionDetail } from '../components/RegionDetail';
import { StateActionPanel } from '../components/StateActionPanel';
import { KpiCard, ConfidenceBadge, GapPill, pct } from '../components/StatBits';
import { normalizeStateKey } from '../lib/geo';
import { formatFixed, formatNumber, formatOptionalFixed, toFiniteNumber } from '../lib/numbers';

type Metric = 'coverage' | 'gap';

// Stable empty-array reference so memo deps don't change while data is loading.
const EMPTY_ROWS: never[] = [];

function humanize(token: string): string {
  const labels: Record<string, string> = {
    pulmonology: 'Pulmonology / respiratory care',
    spirometry: 'Spirometry / lung function',
    oxygenTherapy: 'Oxygen therapy',
    inhalerNebulizer: 'Inhalers / nebulizers',
    pulmonaryRehab: 'Pulmonary rehabilitation',
    criticalCare: 'Critical / exacerbation care',
  };
  return labels[token] ?? token.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

export function PlannerPage() {
  const [capability, setCapability] = useState('all');
  const [metric, setMetric] = useState<Metric>('coverage');
  const [selectedState, setSelectedState] = useState<string | null>(null);

  const specialtyParams = useMemo(() => ({}), []);
  const capabilityParams = useMemo(() => ({ capability: sql.string(capability) }), [capability]);

  const specialties = useAnalyticsQuery('specialty_options', specialtyParams);
  const kpis = useAnalyticsQuery('national_kpis', capabilityParams);
  const coverage = useAnalyticsQuery('state_coverage', capabilityParams);

  const stateRows = coverage.data ?? EMPTY_ROWS;

  const { mapData, maxValue } = useMemo(() => {
    const m = new Map<string, StateDatum>();
    let max = 0;
    for (const r of stateRows) {
      const trustWeighted = toFiniteNumber(r.trust_weighted);
      const gapScore = toFiniteNumber(r.gap_score);
      const value = metric === 'coverage' ? trustWeighted : gapScore;
      max = Math.max(max, value);
      m.set(normalizeStateKey(r.state), {
        state: r.state,
        value,
        valueLabel:
          metric === 'coverage'
            ? `${formatFixed(trustWeighted)} trust-weighted facilities`
            : `Gap score ${formatOptionalFixed(r.gap_score)}`,
        subLabel: `${formatNumber(r.n_facilities)} facilities · COPD risk ${formatOptionalFixed(r.copd_risk_score)} · clean fuel ${pct(r.clean_fuel_pct)}`,
      });
    }
    return { mapData: m, maxValue: max };
  }, [stateRows, metric]);

  const rankedRows = useMemo(
    () =>
      [...stateRows].sort((a, b) =>
        metric === 'coverage'
          ? toFiniteNumber(b.trust_weighted) - toFiniteNumber(a.trust_weighted)
          : toFiniteNumber(b.gap_score) - toFiniteNumber(a.gap_score)
      ),
    [stateRows, metric]
  );
  const selectedStateRow = useMemo(
    () =>
      selectedState
        ? stateRows.find((row) => normalizeStateKey(row.state) === normalizeStateKey(selectedState))
        : undefined,
    [selectedState, stateRows]
  );

  const k = kpis.data?.[0];
  const colorVar = metric === 'coverage' ? '--success' : '--destructive';

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Medical Desert Planner</h2>
          <p className="text-sm text-muted-foreground">
            Where are the highest-risk gaps in care — and how confident are we they are real?
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="capability">Capability</Label>
            <Select value={capability} onValueChange={(v) => setCapability(v)}>
              <SelectTrigger id="capability" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All COPD care</SelectItem>
                {(specialties.data ?? []).map((s) => (
                  <SelectItem key={s.capability} value={s.capability}>
                    {humanize(s.capability)} ({formatNumber(s.facility_mentions)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Map view</Label>
            <ToggleGroup
              type="single"
              value={metric}
              onValueChange={(v) => v && setMetric(v as Metric)}
              variant="outline"
            >
              <ToggleGroupItem value="coverage">Coverage</ToggleGroupItem>
              <ToggleGroupItem value="gap">Care gaps</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </div>

      <Alert>
        <AlertDescription>
          COPD risk is estimated from household solid-fuel exposure and adult tobacco use in NFHS-5. Care capacity is
          extracted from Unity Catalog facility specialties, procedures, equipment, descriptions, and capability
          evidence. This is a planning proxy, not measured COPD prevalence.
        </AlertDescription>
      </Alert>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.loading || !k ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <KpiCard
              label="COPD-care facilities"
              value={formatNumber(k.n_facilities)}
              hint={`${formatNumber(k.geocoded)} mapped`}
            />
            <KpiCard
              label="States with supply"
              value={formatNumber(k.n_states)}
              hint={`${formatNumber(k.n_districts)} districts`}
            />
            <KpiCard
              label="Avg COPD risk proxy"
              value={`${formatFixed(k.avg_copd_risk)}/100`}
              hint="solid fuel + tobacco"
            />
            <KpiCard
              label="Trust-weighted capacity"
              value={formatNumber(k.trust_weighted)}
              hint={`${formatFixed(k.avg_trust)}/100 avg evidence trust`}
            />
          </>
        )}
      </div>

      {coverage.error && (
        <Alert variant="destructive">
          <AlertDescription>Failed to load coverage data: {coverage.error}</AlertDescription>
        </Alert>
      )}

      {/* Map + ranking */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>
              {metric === 'coverage' ? 'Trust-weighted COPD-care coverage' : 'COPD care-gap risk by state'}
            </CardTitle>
            <Legend colorVar={colorVar} label={metric === 'coverage' ? 'More trusted supply' : 'Higher care gap'} />
          </CardHeader>
          <CardContent className="relative">
            {coverage.loading ? (
              <Skeleton className="w-full" style={{ aspectRatio: '720 / 780' }} />
            ) : (
              <IndiaMap
                data={mapData}
                colorVar={colorVar}
                maxValue={maxValue}
                selectedState={selectedState}
                onSelect={(s) => setSelectedState(s)}
              />
            )}
            {selectedState && !coverage.loading && (
              <StateActionPanel
                state={selectedState}
                capability={capability}
                stateRow={selectedStateRow as Record<string, unknown> | undefined}
                onClose={() => setSelectedState(null)}
              />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">
              {metric === 'coverage' ? 'Best COPD-care coverage' : 'Highest COPD care gaps'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[680px] overflow-auto">
              {coverage.loading
                ? Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="mx-4 my-2 h-10" />)
                : rankedRows.map((r, idx) => {
                    const isSel =
                      selectedState != null && normalizeStateKey(selectedState) === normalizeStateKey(r.state);
                    return (
                      <button
                        key={r.state}
                        onClick={() => setSelectedState(r.state)}
                        className={`flex w-full items-center gap-3 border-b px-4 py-2.5 text-left transition-colors hover:bg-muted ${isSel ? 'bg-muted' : ''}`}
                      >
                        <span className="w-5 text-xs tabular-nums text-muted-foreground">{idx + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">{r.state}</span>
                          <span className="block text-xs text-muted-foreground">
                            {formatNumber(r.n_facilities)} facilities
                          </span>
                        </span>
                        {metric === 'coverage' ? (
                          <span className="text-sm font-semibold tabular-nums text-foreground">
                            {formatFixed(r.trust_weighted)}
                          </span>
                        ) : (
                          <GapPill score={r.gap_score} />
                        )}
                      </button>
                    );
                  })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Drill-down */}
      {selectedState ? (
        <RegionDetail state={selectedState} capability={capability} onClose={() => setSelectedState(null)} />
      ) : (
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
            <ConfidenceBadge level="low" />
            Select a state on the map or list to drill into district gaps, the facility evidence behind each aggregate,
            and save a planning scenario.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Legend({ colorVar, label }: { colorVar: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>Low</span>
      <span
        className="h-2 w-24 rounded-full"
        style={{
          background: `linear-gradient(to right, var(--muted), color-mix(in oklch, var(${colorVar}) 90%, var(--muted)))`,
        }}
      />
      <span>{label}</span>
    </div>
  );
}
