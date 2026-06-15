import type { StateAqiRow } from './aqi';
import { normalizeStateKey } from './geo';
import { toFiniteNumber } from './numbers';

/** COPD risk proxy weights (sum to 1.0). */
export const COPD_RISK_WEIGHTS = {
  aqi: 0.35,
  solidFuel: 0.4,
  tobacco: 0.25,
} as const;

export interface AqiBounds {
  minAqi: number;
  maxAqi: number;
}

export interface NfhsRiskInputs {
  clean_fuel_pct?: unknown;
  women_tobacco_pct?: unknown;
  men_tobacco_pct?: unknown;
}

export interface CopdRiskEnrichment {
  avg_aqi: number | null;
  copd_risk_score: number | null;
  gap_score: number | null;
}

export function normalizeAqi(avgAqi: number, minAqi: number, maxAqi: number): number {
  if (maxAqi <= minAqi) return 0;
  return (100 * (avgAqi - minAqi)) / (maxAqi - minAqi);
}

/** Household solid-fuel exposure share (0–100). */
export function normalizeSolidFuel(cleanFuelPct: number): number {
  return 100 - cleanFuelPct;
}

/** Average adult tobacco prevalence (0–100). */
export function normalizeTobacco(womenTobaccoPct: number, menTobaccoPct: number): number {
  return (womenTobaccoPct + menTobaccoPct) / 2;
}

export function computeCopdRiskProxy(input: {
  avgAqi: number;
  minAqi: number;
  maxAqi: number;
  cleanFuelPct: number;
  womenTobaccoPct: number;
  menTobaccoPct: number;
}): number {
  const aqiNorm = normalizeAqi(input.avgAqi, input.minAqi, input.maxAqi);
  const solidFuelNorm = normalizeSolidFuel(input.cleanFuelPct);
  const tobaccoNorm = normalizeTobacco(input.womenTobaccoPct, input.menTobaccoPct);

  return (
    COPD_RISK_WEIGHTS.aqi * aqiNorm +
    COPD_RISK_WEIGHTS.solidFuel * solidFuelNorm +
    COPD_RISK_WEIGHTS.tobacco * tobaccoNorm
  );
}

export function roundRiskScore(value: number): number {
  return Math.round(value * 10) / 10;
}

export function aqiBoundsFromRows(states: StateAqiRow[]): AqiBounds | null {
  if (!states.length) return null;
  let minAqi = Infinity;
  let maxAqi = -Infinity;
  for (const row of states) {
    minAqi = Math.min(minAqi, row.avgAqi);
    maxAqi = Math.max(maxAqi, row.avgAqi);
  }
  return { minAqi, maxAqi };
}

export function computeCopdRiskFromNfhs(
  nfhs: NfhsRiskInputs,
  avgAqi: number | null | undefined,
  bounds: AqiBounds | null
): number | null {
  if (!bounds || avgAqi == null) return null;

  const cleanFuelPct = toFiniteNumber(nfhs.clean_fuel_pct, Number.NaN);
  const womenTobaccoPct = toFiniteNumber(nfhs.women_tobacco_pct, Number.NaN);
  const menTobaccoPct = toFiniteNumber(nfhs.men_tobacco_pct, Number.NaN);

  if (
    Number.isNaN(cleanFuelPct) ||
    Number.isNaN(womenTobaccoPct) ||
    Number.isNaN(menTobaccoPct) ||
    bounds.maxAqi <= bounds.minAqi
  ) {
    return null;
  }

  return roundRiskScore(
    computeCopdRiskProxy({
      avgAqi,
      minAqi: bounds.minAqi,
      maxAqi: bounds.maxAqi,
      cleanFuelPct,
      womenTobaccoPct,
      menTobaccoPct,
    })
  );
}

export function computeStateGapScore(copdRisk: number, trustWeighted: number): number {
  return roundRiskScore(copdRisk * (1 - Math.min(trustWeighted / 20.0, 1)));
}

export function computeDistrictGapScore(copdRisk: number, trustWeighted: number): number {
  return roundRiskScore(copdRisk * (1 - Math.min(trustWeighted / 3.0, 1)));
}

export function enrichStateCoverageRow<T extends NfhsRiskInputs & { state: string; trust_weighted?: unknown }>(
  row: T,
  aqiByKey: Map<string, StateAqiRow>,
  bounds: AqiBounds | null
): T & CopdRiskEnrichment {
  const avgAqi = aqiByKey.get(normalizeStateKey(row.state))?.avgAqi ?? null;
  const copdRisk = computeCopdRiskFromNfhs(row, avgAqi, bounds);
  const trustWeighted = toFiniteNumber(row.trust_weighted);

  return {
    ...row,
    avg_aqi: avgAqi,
    copd_risk_score: copdRisk,
    gap_score: copdRisk == null ? null : computeStateGapScore(copdRisk, trustWeighted),
  };
}

export function enrichDistrictCoverageRow<T extends NfhsRiskInputs & { trust_weighted?: unknown }>(
  row: T,
  stateAqi: number | null | undefined,
  bounds: AqiBounds | null
): T & CopdRiskEnrichment {
  const copdRisk = computeCopdRiskFromNfhs(row, stateAqi, bounds);
  const trustWeighted = toFiniteNumber(row.trust_weighted);

  return {
    ...row,
    avg_aqi: stateAqi ?? null,
    copd_risk_score: copdRisk,
    gap_score: copdRisk == null ? null : computeDistrictGapScore(copdRisk, trustWeighted),
  };
}

export function enrichStateCoverageRows<T extends NfhsRiskInputs & { state: string; trust_weighted?: unknown }>(
  rows: T[],
  aqiByKey: Map<string, StateAqiRow>,
  bounds: AqiBounds | null
): Array<T & CopdRiskEnrichment> {
  return rows.map((row) => enrichStateCoverageRow(row, aqiByKey, bounds));
}

export function enrichDistrictCoverageRows<T extends NfhsRiskInputs & { trust_weighted?: unknown }>(
  rows: T[],
  stateAqi: number | null | undefined,
  bounds: AqiBounds | null
): Array<T & CopdRiskEnrichment> {
  return rows.map((row) => enrichDistrictCoverageRow(row, stateAqi, bounds));
}

export function averageCopdRiskScore(rows: Array<{ copd_risk_score?: number | null }>): number | null {
  const scores = rows.map((row) => row.copd_risk_score).filter((score): score is number => score != null);
  if (!scores.length) return null;
  return roundRiskScore(scores.reduce((total, score) => total + score, 0) / scores.length);
}
