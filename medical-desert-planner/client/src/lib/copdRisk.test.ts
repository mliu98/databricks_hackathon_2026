import { describe, expect, it } from 'vitest';
import {
  averageCopdRiskScore,
  computeCopdRiskFromNfhs,
  computeCopdRiskProxy,
  computeDistrictGapScore,
  computeStateGapScore,
  enrichDistrictCoverageRow,
  enrichStateCoverageRow,
  normalizeAqi,
  normalizeSolidFuel,
  normalizeTobacco,
} from './copdRisk';

describe('copdRisk normalization', () => {
  it('min-max normalizes AQI to 0–100', () => {
    expect(normalizeAqi(62, 62, 234)).toBe(0);
    expect(normalizeAqi(234, 62, 234)).toBeCloseTo(100);
    expect(normalizeAqi(148, 62, 234)).toBeCloseTo(50);
  });

  it('derives solid-fuel and tobacco norms from NFHS percentages', () => {
    expect(normalizeSolidFuel(40)).toBe(60);
    expect(normalizeTobacco(20, 40)).toBe(30);
  });
});

describe('computeCopdRiskProxy', () => {
  it('applies 35/40/25 weights on normalized inputs', () => {
    const score = computeCopdRiskProxy({
      avgAqi: 234,
      minAqi: 62,
      maxAqi: 234,
      cleanFuelPct: 40,
      womenTobaccoPct: 20,
      menTobaccoPct: 40,
    });

    expect(score).toBeCloseTo(0.35 * 100 + 0.4 * 60 + 0.25 * 30);
  });
});

describe('coverage enrichment', () => {
  const bounds = { minAqi: 62, maxAqi: 234 };
  const aqiByKey = new Map([
    [
      'maharashtra',
      { state: 'Maharashtra', avgAqi: 138.7, readingCount: 10, status: 'Moderate' },
    ],
  ]);

  it('enriches state rows with local AQI and derived scores', () => {
    const enriched = enrichStateCoverageRow(
      {
        state: 'Maharashtra',
        trust_weighted: 4,
        clean_fuel_pct: 40,
        women_tobacco_pct: 20,
        men_tobacco_pct: 40,
      },
      aqiByKey,
      bounds
    );

    expect(enriched.avg_aqi).toBe(138.7);
    expect(enriched.copd_risk_score).not.toBeNull();
    expect(enriched.gap_score).toBe(computeStateGapScore(enriched.copd_risk_score!, 4));
  });

  it('enriches district rows with state-level AQI', () => {
    const enriched = enrichDistrictCoverageRow(
      {
        trust_weighted: 1,
        clean_fuel_pct: 40,
        women_tobacco_pct: 20,
        men_tobacco_pct: 40,
      },
      138.7,
      bounds
    );

    expect(enriched.avg_aqi).toBe(138.7);
    expect(enriched.gap_score).toBe(computeDistrictGapScore(enriched.copd_risk_score!, 1));
  });

  it('returns null risk when NFHS inputs are missing', () => {
    expect(computeCopdRiskFromNfhs({}, 138.7, bounds)).toBeNull();
  });

  it('averages enriched COPD risk scores', () => {
    expect(
      averageCopdRiskScore([
        { copd_risk_score: 50 },
        { copd_risk_score: 70 },
        { copd_risk_score: null },
      ])
    ).toBe(60);
  });
});
