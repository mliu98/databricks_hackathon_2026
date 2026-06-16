import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { IndiaMap, type FacilityMarker, type StateDatum } from '../components/IndiaMap';
import { RegionDetail } from '../components/RegionDetail';
import { StateActionPanel } from '../components/StateActionPanel';
import { KpiCard, ConfidenceBadge, GapPill, pct } from '../components/StatBits';
import { loadStateAqiDataset, stateAqiByKey, type StateAqiRow } from '../lib/aqi';
import { COPD_RISK_FORMULA_DESCRIPTION, enrichStateCoverageRows } from '../lib/copdRisk';
import { loadStatePopulationDataset, statePopulationByKey } from '../lib/population';
import { visibleAnalyticsError } from '../lib/analytics-query';
import { facilityCopdDepartments } from '../lib/capabilities';
import { normalizeStateKey } from '../lib/geo';
import { formatFixed, formatNumber, formatOptionalFixed, toFiniteNumber } from '../lib/numbers';

type Metric = 'risk' | 'coverage' | 'gap' | 'aqi' | 'solidFuel';

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

function nfhsSolidFuelPct(cleanFuelPct: unknown): number | null {
  if (cleanFuelPct == null) return null;
  return 100 - toFiniteNumber(cleanFuelPct);
}

export function PlannerPage() {
  const [capability, setCapability] = useState('all');
  const [metric, setMetric] = useState<Metric>('risk');
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [aqiRows, setAqiRows] = useState<StateAqiRow[]>([]);
  const [aqiLoading, setAqiLoading] = useState(true);
  const [aqiError, setAqiError] = useState<string | null>(null);
  const [populationRows, setPopulationRows] = useState<{ state: string; population: number }[]>([]);
  const [populationLoading, setPopulationLoading] = useState(true);

  useEffect(() => {
    let active = true;
    loadStateAqiDataset()
      .then((dataset) => {
        if (!active) return;
        setAqiRows(dataset.states);
        setAqiError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setAqiRows([]);
        setAqiError(err instanceof Error ? err.message : 'Failed to load AQI data');
      })
      .finally(() => {
        if (active) setAqiLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    loadStatePopulationDataset()
      .then((dataset) => {
        if (!active) return;
        setPopulationRows(dataset.states);
      })
      .catch(() => {
        if (!active) return;
        setPopulationRows([]);
      })
      .finally(() => {
        if (active) setPopulationLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const specialtyParams = useMemo(() => ({}), []);
  const capabilityParams = useMemo(() => ({ capability: sql.string(capability) }), [capability]);

  const specialties = useAnalyticsQuery('specialty_options', specialtyParams);
  const kpis = useAnalyticsQuery('national_kpis', capabilityParams);
  const coverageEnabled = metric !== 'aqi';
  const coverage = useAnalyticsQuery('state_coverage', capabilityParams, { autoStart: coverageEnabled });
  const facilityMap = useAnalyticsQuery('facility_map', capabilityParams, { autoStart: coverageEnabled });

  const rawStateRows = coverage.data ?? EMPTY_ROWS;
  const coverageLoadError = visibleAnalyticsError(coverage.error, {
    loading: coverage.loading,
    data: coverage.data,
  });
  const aqiByKey = useMemo(() => stateAqiByKey(aqiRows), [aqiRows]);
  const populationByKey = useMemo(() => statePopulationByKey(populationRows), [populationRows]);

  const enrichedStateRows = useMemo(() => {
    if (!rawStateRows.length) return rawStateRows;
    return enrichStateCoverageRows(rawStateRows, aqiByKey, populationByKey);
  }, [rawStateRows, aqiByKey, populationByKey]);

  const stateRows = enrichedStateRows;

  const { mapData, maxValue } = useMemo(() => {
    const m = new Map<string, StateDatum>();
    let max = 0;

    if (metric === 'aqi') {
      for (const row of aqiRows) {
        max = Math.max(max, row.avgAqi);
        m.set(normalizeStateKey(row.state), {
          state: row.state,
          value: row.avgAqi,
          valueLabel: `Avg AQI ${formatFixed(row.avgAqi)}`,
          subLabel: `${row.status} · ${formatNumber(row.readingCount)} PM2.5 readings`,
        });
      }
      return { mapData: m, maxValue: max };
    }

    for (const r of stateRows) {
      const trustWeighted = toFiniteNumber(r.trust_weighted);
      const gapScore = toFiniteNumber(r.gap_score);
      const riskScore = toFiniteNumber(r.copd_risk_score);
      const solidFuelPct = nfhsSolidFuelPct(r.clean_fuel_pct);
      const stateKey = normalizeStateKey(r.state);
      const aqiRow = aqiByKey.get(stateKey);

      let value: number;
      let valueLabel: string;
      let subLabel: string;

      if (metric === 'coverage') {
        value = trustWeighted;
        valueLabel = `${formatFixed(trustWeighted)} trust-weighted facilities`;
        subLabel = `${formatNumber(r.n_facilities)} facilities · COPD risk ${formatOptionalFixed(r.copd_risk_score)} · clean fuel ${pct(r.clean_fuel_pct)}`;
      } else if (metric === 'risk') {
        value = riskScore;
        valueLabel = `COPD risk ${formatOptionalFixed(r.copd_risk_score)}`;
        subLabel = `${aqiRow ? `AQI ${formatFixed(aqiRow.avgAqi)} · ` : ''}solid fuel ${pct(solidFuelPct)} · tobacco ${pct(r.adult_tobacco_pct)}`;
      } else if (metric === 'solidFuel') {
        value = solidFuelPct ?? 0;
        valueLabel = `Solid fuel use ${pct(solidFuelPct)}`;
        subLabel = `NFHS clean fuel ${pct(r.clean_fuel_pct)} · tobacco ${pct(r.adult_tobacco_pct)}`;
      } else {
        value = gapScore;
        valueLabel = `Gap score ${formatOptionalFixed(r.gap_score)}`;
        subLabel = `${formatNumber(r.n_facilities)} facilities · COPD risk ${formatOptionalFixed(r.copd_risk_score)} · clean fuel ${pct(r.clean_fuel_pct)}`;
      }

      if (metric === 'solidFuel' && solidFuelPct == null) continue;

      max = Math.max(max, value);
      m.set(stateKey, { state: r.state, value, valueLabel, subLabel });
    }
    return { mapData: m, maxValue: max };
  }, [stateRows, metric, aqiRows, aqiByKey]);

  const rankedRows = useMemo(() => {
    if (metric === 'aqi') {
      return [...aqiRows].sort((a, b) => b.avgAqi - a.avgAqi);
    }
    if (metric === 'solidFuel') {
      return [...stateRows]
        .filter((row) => nfhsSolidFuelPct(row.clean_fuel_pct) != null)
        .sort((a, b) => nfhsSolidFuelPct(b.clean_fuel_pct)! - nfhsSolidFuelPct(a.clean_fuel_pct)!);
    }
    return [...stateRows].sort((a, b) => {
      if (metric === 'coverage') {
        return toFiniteNumber(b.trust_weighted) - toFiniteNumber(a.trust_weighted);
      }
      if (metric === 'risk') {
        return toFiniteNumber(b.copd_risk_score) - toFiniteNumber(a.copd_risk_score);
      }
      return toFiniteNumber(b.gap_score) - toFiniteNumber(a.gap_score);
    });
  }, [stateRows, metric, aqiRows]);

  const selectedStateRow = useMemo(
    () =>
      selectedState
        ? stateRows.find((row) => normalizeStateKey(row.state) === normalizeStateKey(selectedState))
        : undefined,
    [selectedState, stateRows]
  );

  const mapMarkers = useMemo((): FacilityMarker[] => {
    const rows = facilityMap.data ?? [];
    const selectedKey = selectedState ? normalizeStateKey(selectedState) : null;
    return rows
      .filter((row) => !selectedKey || normalizeStateKey(row.state) === selectedKey)
      .map((row) => {
        const staffCount =
          row.staff_count != null && Number.isFinite(Number(row.staff_count))
            ? toFiniteNumber(row.staff_count)
            : null;
        return {
          id: row.facility_id,
          name: row.name,
          latitude: row.latitude,
          longitude: row.longitude,
          staffCount,
          copdDepartments: facilityCopdDepartments(row),
        };
      });
  }, [facilityMap.data, selectedState]);

  const k = kpis.data?.[0];
  const populationWeightedAvgRisk = useMemo(() => {
    let weightedSum = 0;
    let totalPopulation = 0;
    for (const row of stateRows) {
      const risk = row.copd_risk_score;
      const population =
        populationByKey.get(normalizeStateKey(row.state))?.population ?? (row.population as number | undefined);
      if (risk == null || population == null) continue;
      weightedSum += toFiniteNumber(risk) * population;
      totalPopulation += population;
    }
    return totalPopulation > 0 ? Math.round((weightedSum / totalPopulation) * 10) / 10 : null;
  }, [stateRows, populationByKey]);

  const colorVar =
    metric === 'coverage'
      ? '--success'
      : metric === 'gap'
        ? '--destructive'
        : metric === 'risk'
          ? '--chart-5'
          : metric === 'aqi'
            ? '--chart-4'
            : '--warning';
  const mapLoading = metric === 'aqi' ? aqiLoading : coverage.loading || aqiLoading || populationLoading;
  const mapTitle =
    metric === 'risk'
      ? 'COPD risk proxy by state'
      : metric === 'coverage'
        ? 'Trust-weighted COPD-care coverage'
        : metric === 'gap'
          ? 'COPD care-gap risk by state'
          : metric === 'aqi'
            ? 'Average PM2.5 AQI by state'
            : 'Household solid-fuel use by state (NFHS-5)';
  const mapLegend =
    metric === 'risk'
      ? 'Higher COPD risk'
      : metric === 'coverage'
        ? 'More trusted supply'
        : metric === 'gap'
          ? 'Higher care gap'
          : metric === 'aqi'
            ? 'Higher AQI (worse air)'
            : 'Higher solid-fuel use';
  const rankTitle =
    metric === 'risk'
      ? 'Highest COPD risk'
      : metric === 'coverage'
        ? 'Best COPD-care coverage'
        : metric === 'gap'
          ? 'Highest COPD care gaps'
          : metric === 'aqi'
            ? 'Highest average AQI'
            : 'Highest solid-fuel use (NFHS)';
  const noDataLabel =
    metric === 'aqi' ? 'No PM2.5 AQI data' : metric === 'solidFuel' ? 'No NFHS fuel data' : 'No facility evidence';
  const mapViewDescription =
    metric === 'risk'
      ? `COPD risk combines PM2.5 AQI, NFHS-5 household solid-fuel exposure, adult tobacco prevalence, and clinic capacity stress weighted by population (${COPD_RISK_FORMULA_DESCRIPTION}). Care capacity is extracted from Unity Catalog facility evidence. This is a planning proxy, not measured COPD prevalence.`
      : metric === 'coverage'
        ? `Trust-weighted coverage sums web-evidence trust scores for facilities matching the selected COPD-care capability. Each facility contributes its trust score as a fraction of one full facility (100 trust = 1.0). Darker shading indicates stronger, more believable supply — not verified clinical capacity.`
        : metric === 'gap'
          ? `Care gap combines COPD risk with supply scarcity: gap = risk × (1 − min(trust-weighted supply / 20, 1)). Higher values highlight states where need likely outstrips trustworthy COPD-care capacity. This is a planning priority signal, not a measured shortage.`
          : metric === 'aqi'
            ? `Average PM2.5 Air Quality Index by state from bundled monitoring readings. Darker shading indicates worse ambient air — a key driver of COPD risk. Select a state to highlight it on the map.`
            : `Household solid-fuel use from NFHS-5: 100 − clean cooking fuel %. Darker shading indicates more households exposed to indoor biomass smoke, a major COPD risk factor. This is survey-based exposure, not measured emissions.`;

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">COPD Care Planner</h2>
          <p className="text-sm text-muted-foreground">
            Where are the highest-risk gaps in care — and what intervention make most sense to close them?
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="capability">Capability</Label>
            <Select value={capability} onValueChange={(v) => setCapability(v)}>
              <SelectTrigger id="capability" className="w-56 bg-card text-foreground border border-input shadow-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card text-foreground border border-input shadow-xl">
                <SelectItem value="all" className="text-foreground">
                  All COPD care
                </SelectItem>
                {(specialties.data ?? []).map((s) => (
                  <SelectItem key={s.capability} value={s.capability} className="text-foreground">
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
              className="inline-flex rounded-md border border-input bg-card text-foreground"
            >
              <ToggleGroupItem
                value="risk"
                className="px-3 py-2 text-sm text-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                Risk
              </ToggleGroupItem>
              <ToggleGroupItem
                value="coverage"
                className="px-3 py-2 text-sm text-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                Coverage
              </ToggleGroupItem>
              <ToggleGroupItem
                value="gap"
                className="px-3 py-2 text-sm text-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                Care gaps
              </ToggleGroupItem>
              <ToggleGroupItem
                value="aqi"
                className="px-3 py-2 text-sm text-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                AQI
              </ToggleGroupItem>
              <ToggleGroupItem
                value="solidFuel"
                className="px-3 py-2 text-sm text-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                Solid fuel
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </div>

      <Alert>
        <AlertDescription>{mapViewDescription}</AlertDescription>
      </Alert>

      {aqiError && metric === 'aqi' && (
        <Alert variant="destructive">
          <AlertDescription>Failed to load AQI data: {aqiError}</AlertDescription>
        </Alert>
      )}

      {coverageLoadError && (
        <Alert variant="destructive">
          <AlertDescription>Failed to load coverage data: {coverageLoadError}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 overflow-hidden rounded-[32px] border border-white/10 bg-[#171719] shadow-2xl lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="order-2 rounded-none border-0 border-r border-white/10 bg-[#171719] shadow-none lg:order-1">
          <CardHeader className="border-b border-white/10">
            <CardTitle className="text-base">{rankTitle}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {metric === 'aqi'
                ? 'Exposure overlay — select a state to highlight it'
                : 'Select a state to open its action brief'}
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[660px] overflow-auto">
              {mapLoading
                ? Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="mx-4 my-2 h-14" />)
                : rankedRows.map((row, idx) => {
                    const name = (row as { state: string }).state;
                    const isSel = selectedState != null && normalizeStateKey(selectedState) === normalizeStateKey(name);
                    let sub: ReactNode;
                    let stat: ReactNode;
                    if (metric === 'aqi') {
                      const aqiRow = row as StateAqiRow;
                      sub = aqiRow.status;
                      stat = (
                        <span className="rounded-lg border border-white/10 bg-black/25 px-2 py-1 text-sm font-semibold tabular-nums text-foreground">
                          {formatFixed(aqiRow.avgAqi)}
                        </span>
                      );
                    } else {
                      const stateRow = row as (typeof stateRows)[number];
                      const stateKey = normalizeStateKey(name);
                      const aqiRow = aqiByKey.get(stateKey);
                      const solidFuel = nfhsSolidFuelPct(stateRow.clean_fuel_pct);
                      sub =
                        metric === 'risk'
                          ? `${aqiRow ? `AQI ${formatFixed(aqiRow.avgAqi)} · ` : ''}${formatNumber(stateRow.n_facilities)} facilities`
                          : metric === 'solidFuel'
                            ? `Clean fuel ${pct(stateRow.clean_fuel_pct)}`
                            : `${formatNumber(stateRow.n_facilities)} facilities`;
                      stat =
                        metric === 'coverage' ? (
                          <span className="rounded-lg border border-white/10 bg-black/25 px-2 py-1 text-sm font-semibold tabular-nums text-primary">
                            {formatFixed(stateRow.trust_weighted)}
                          </span>
                        ) : metric === 'risk' ? (
                          <span className="rounded-lg border border-white/10 bg-black/25 px-2 py-1 text-sm font-semibold tabular-nums text-foreground">
                            {formatOptionalFixed(stateRow.copd_risk_score)}
                          </span>
                        ) : metric === 'solidFuel' ? (
                          <span className="rounded-lg border border-white/10 bg-black/25 px-2 py-1 text-sm font-semibold tabular-nums text-foreground">
                            {pct(solidFuel)}
                          </span>
                        ) : (
                          <GapPill score={stateRow.gap_score} />
                        );
                    }
                    return (
                      <button
                        key={name}
                        onClick={() => setSelectedState(name)}
                        className={`mx-3 my-1 flex w-[calc(100%-1.5rem)] items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-all hover:bg-white/5 ${
                          isSel
                            ? 'border-primary bg-primary/10 shadow-[0_0_24px_rgba(87,255,196,0.12)]'
                            : 'border-transparent'
                        }`}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/8 text-xs font-semibold text-foreground">
                          {idx + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">{name}</span>
                          <span className="block text-xs text-muted-foreground">{sub}</span>
                        </span>
                        {stat}
                      </button>
                    );
                  })}
            </div>
          </CardContent>
        </Card>

        <Card className="relative order-1 rounded-none border-0 bg-[#202224] shadow-none lg:order-2">
          <CardHeader className="absolute left-4 right-4 top-4 z-10 flex flex-row items-center justify-between gap-4 space-y-0 rounded-2xl border border-white/10 bg-black/60 px-4 py-3 backdrop-blur-xl">
            <CardTitle className="text-sm lg:text-base">{mapTitle}</CardTitle>
            <Legend colorVar={colorVar} label={mapLegend} />
          </CardHeader>
          <CardContent className="relative p-0">
            {mapLoading ? (
              <Skeleton className="h-[660px] w-full" />
            ) : (
              <IndiaMap
                data={mapData}
                colorVar={colorVar}
                maxValue={maxValue}
                selectedState={selectedState}
                onSelect={(s) => setSelectedState(s)}
                noDataLabel={noDataLabel}
                markers={metric === 'aqi' ? [] : mapMarkers}
              />
            )}
            {selectedState && !mapLoading && metric !== 'aqi' && (
              <StateActionPanel
                key={selectedState}
                state={selectedState}
                capability={capability}
                stateRow={selectedStateRow as Record<string, unknown> | undefined}
                onClose={() => setSelectedState(null)}
              />
            )}
          </CardContent>
        </Card>
      </div>

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
              value={
                populationWeightedAvgRisk != null
                  ? `${formatFixed(populationWeightedAvgRisk)}/100`
                  : `${formatFixed(k.avg_copd_risk)}/100`
              }
              hint="population-weighted · AQI + NFHS fuel + tobacco + capacity"
            />
            <KpiCard
              label="Trust-weighted capacity"
              value={formatNumber(k.trust_weighted)}
              hint={`${formatFixed(k.avg_trust)}/100 avg evidence trust`}
            />
          </>
        )}
      </div>

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
