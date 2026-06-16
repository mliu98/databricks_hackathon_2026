import { normalizeStateKey } from './geo';

/** COPD risk proxy weights (sum to 1.0). */
export const COPD_RISK_WEIGHTS = {
  aqi: 0.25,
  solidFuel: 0.3,
  tobacco: 0.2,
  capacityStress: 0.25,
} as const;

export const AQI_SCALE_MAX = 500;

export interface RegionRiskInputs {
  avgAqi?: number | null;
  cleanFuelPct?: number | null;
  womenTobaccoPct?: number | null;
  menTobaccoPct?: number | null;
  adultTobaccoPct?: number | null;
  trustWeighted?: number | null;
  totalReportedCapacity?: number | null;
  population?: number | null;
}

export interface RiskNormBounds {
  minAqi: number;
  maxAqi: number;
  minCapacityPerMillion: number;
  maxCapacityPerMillion: number;
}

/** NFHS household solid-fuel exposure share (0–100). */
export function solidFuelExposure(inputs: RegionRiskInputs): number | null {
  if (inputs.cleanFuelPct != null && !Number.isNaN(inputs.cleanFuelPct)) {
    return 100 - inputs.cleanFuelPct;
  }
  return null;
}

export function tobaccoPrevalence(inputs: RegionRiskInputs): number | null {
  if (inputs.adultTobaccoPct != null && !Number.isNaN(inputs.adultTobaccoPct)) {
    return inputs.adultTobaccoPct;
  }
  const women = inputs.womenTobaccoPct;
  const men = inputs.menTobaccoPct;
  if (women != null && men != null && !Number.isNaN(women) && !Number.isNaN(men)) {
    return (women + men) / 2;
  }
  return null;
}

/** Trust-weighted clinic supply blended with reported bed capacity. */
export function clinicCapacityUnits(inputs: RegionRiskInputs): number {
  const trustWeighted = inputs.trustWeighted ?? 0;
  const reportedCapacity = inputs.totalReportedCapacity ?? 0;
  return trustWeighted + reportedCapacity / 1000;
}

export function capacityPerMillion(inputs: RegionRiskInputs): number | null {
  const population = inputs.population;
  if (population == null || population <= 0 || Number.isNaN(population)) return null;
  return (clinicCapacityUnits(inputs) * 1_000_000) / population;
}

export function normalizeAqiTo100(avgAqi: number, bounds: RiskNormBounds): number {
  if (bounds.maxAqi > bounds.minAqi) {
    const ratio = (avgAqi - bounds.minAqi) / (bounds.maxAqi - bounds.minAqi);
    return Math.min(100, Math.max(0, ratio * 100));
  }
  return Math.min(100, Math.max(0, (avgAqi / AQI_SCALE_MAX) * 100));
}

export function capacityStressScore(capacityPerMillionValue: number, bounds: RiskNormBounds): number {
  if (bounds.maxCapacityPerMillion <= bounds.minCapacityPerMillion) return 50;
  const ratio =
    (capacityPerMillionValue - bounds.minCapacityPerMillion) /
    (bounds.maxCapacityPerMillion - bounds.minCapacityPerMillion);
  return Math.min(100, Math.max(0, (1 - ratio) * 100));
}

export function buildRiskNormBounds(regions: RegionRiskInputs[]): RiskNormBounds {
  const aqiValues = regions.map((r) => r.avgAqi).filter((v): v is number => v != null && !Number.isNaN(v));
  const capacityValues = regions
    .map((r) => capacityPerMillion(r))
    .filter((v): v is number => v != null && !Number.isNaN(v));

  const minAqi = aqiValues.length ? Math.min(...aqiValues) : 0;
  const maxAqi = aqiValues.length ? Math.max(...aqiValues) : AQI_SCALE_MAX;
  const minCapacityPerMillion = capacityValues.length ? Math.min(...capacityValues) : 0;
  const maxCapacityPerMillion = capacityValues.length ? Math.max(...capacityValues) : 1;

  return { minAqi, maxAqi, minCapacityPerMillion, maxCapacityPerMillion };
}

export function computeCopdRiskScore(inputs: RegionRiskInputs, bounds: RiskNormBounds): number | null {
  const solidFuel = solidFuelExposure(inputs);
  const tobacco = tobaccoPrevalence(inputs);
  const capacityPerMillionValue = capacityPerMillion(inputs);
  const hasExposure = solidFuel != null && tobacco != null;
  const hasAqi = inputs.avgAqi != null && !Number.isNaN(inputs.avgAqi);
  const hasCapacity = capacityPerMillionValue != null;

  if (!hasExposure && !hasAqi && !hasCapacity) return null;

  let totalWeight = 0;
  let weightedSum = 0;

  if (hasAqi) {
    weightedSum += COPD_RISK_WEIGHTS.aqi * normalizeAqiTo100(inputs.avgAqi!, bounds);
    totalWeight += COPD_RISK_WEIGHTS.aqi;
  }
  if (solidFuel != null) {
    weightedSum += COPD_RISK_WEIGHTS.solidFuel * solidFuel;
    totalWeight += COPD_RISK_WEIGHTS.solidFuel;
  }
  if (tobacco != null) {
    weightedSum += COPD_RISK_WEIGHTS.tobacco * tobacco;
    totalWeight += COPD_RISK_WEIGHTS.tobacco;
  }
  if (hasCapacity) {
    weightedSum +=
      COPD_RISK_WEIGHTS.capacityStress * capacityStressScore(capacityPerMillionValue, bounds);
    totalWeight += COPD_RISK_WEIGHTS.capacityStress;
  }

  if (totalWeight <= 0) return null;
  return Math.round((weightedSum / totalWeight) * 10) / 10;
}

export const COPD_RISK_FORMULA_DESCRIPTION =
  '0.25 × AQI + 0.30 × NFHS solid fuel + 0.20 × tobacco + 0.25 × clinic capacity stress (population-weighted)';

export interface EnrichedCoverageRow {
  copd_risk_score: number | null;
  gap_score: number | null;
}

export function gapScoreFromRisk(
  copdRiskScore: number | null,
  trustWeighted: number,
  supplyTarget = 20
): number | null {
  if (copdRiskScore == null) return null;
  return Math.round(copdRiskScore * (1 - Math.min(trustWeighted / supplyTarget, 1)) * 10) / 10;
}

export function enrichStateCoverageRow<T extends Record<string, unknown>>(
  row: T,
  bounds: RiskNormBounds,
  extras?: {
    avgAqi?: number | null;
    population?: number | null;
  }
): T & EnrichedCoverageRow {
  const trustWeighted = Number(row.trust_weighted ?? 0);
  const totalReportedCapacity = Number(row.total_reported_capacity ?? 0);
  const copd_risk_score = computeCopdRiskScore(
    {
      avgAqi: extras?.avgAqi,
      cleanFuelPct: row.clean_fuel_pct as number | null,
      womenTobaccoPct: row.women_tobacco_pct as number | null,
      menTobaccoPct: row.men_tobacco_pct as number | null,
      adultTobaccoPct: row.adult_tobacco_pct as number | null,
      trustWeighted,
      totalReportedCapacity,
      population: extras?.population ?? (row.population as number | null),
    },
    bounds
  );

  return {
    ...row,
    copd_risk_score,
    gap_score: gapScoreFromRisk(copd_risk_score, trustWeighted, 20),
  };
}

export function buildStateRiskBounds(
  rows: Array<Record<string, unknown>>,
  aqiByKey: Map<string, { avgAqi: number }>,
  populationByKey: Map<string, { population: number }>
): RiskNormBounds {
  const inputs: RegionRiskInputs[] = rows.map((row) => {
    const key = normalizeStateKey((row.state as string | undefined) ?? '');
    return {
      avgAqi: aqiByKey.get(key)?.avgAqi,
      cleanFuelPct: row.clean_fuel_pct as number | null,
      womenTobaccoPct: row.women_tobacco_pct as number | null,
      menTobaccoPct: row.men_tobacco_pct as number | null,
      adultTobaccoPct: row.adult_tobacco_pct as number | null,
      trustWeighted: row.trust_weighted as number | null,
      totalReportedCapacity: row.total_reported_capacity as number | null,
      population: populationByKey.get(key)?.population ?? (row.population as number | null),
    };
  });
  return buildRiskNormBounds(inputs);
}

export function enrichStateCoverageRows<T extends Record<string, unknown>>(
  rows: T[],
  aqiByKey: Map<string, { avgAqi: number }>,
  populationByKey: Map<string, { population: number }>
): Array<T & EnrichedCoverageRow> {
  const bounds = buildStateRiskBounds(rows, aqiByKey, populationByKey);
  return rows.map((row) => {
    const key = normalizeStateKey((row.state as string | undefined) ?? '');
    return enrichStateCoverageRow(row, bounds, {
      avgAqi: aqiByKey.get(key)?.avgAqi,
      population: populationByKey.get(key)?.population ?? (row.population as number | null),
    });
  });
}
