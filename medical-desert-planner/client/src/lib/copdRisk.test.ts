import { describe, expect, it } from 'vitest';
import {
  buildRiskNormBounds,
  capacityPerMillion,
  computeCopdRiskScore,
  COPD_RISK_WEIGHTS,
  solidFuelExposure,
  tobaccoPrevalence,
} from './copdRisk';

describe('solidFuelExposure', () => {
  it('derives solid fuel share from NFHS clean fuel percentage', () => {
    expect(solidFuelExposure({ cleanFuelPct: 80 })).toBe(20);
  });
});

describe('tobaccoPrevalence', () => {
  it('uses adult average when provided', () => {
    expect(tobaccoPrevalence({ adultTobaccoPct: 33 })).toBe(33);
  });

  it('averages women and men prevalence', () => {
    expect(tobaccoPrevalence({ womenTobaccoPct: 20, menTobaccoPct: 40 })).toBe(30);
  });
});

describe('capacityPerMillion', () => {
  it('weights clinic capacity by population', () => {
    const perMillion = capacityPerMillion({
      trustWeighted: 4,
      totalReportedCapacity: 2000,
      population: 1_000_000,
    });
    expect(perMillion).toBe(6);
  });
});

describe('computeCopdRiskScore', () => {
  const bounds = buildRiskNormBounds([
    { avgAqi: 60, trustWeighted: 1, population: 1_000_000 },
    { avgAqi: 240, trustWeighted: 10, population: 1_000_000 },
  ]);

  it('combines all four weighted components', () => {
    const score = computeCopdRiskScore(
      {
        avgAqi: 240,
        cleanFuelPct: 50,
        womenTobaccoPct: 20,
        menTobaccoPct: 40,
        trustWeighted: 1,
        totalReportedCapacity: 0,
        population: 1_000_000,
      },
      bounds
    );

    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThan(50);
  });

  it('reweights when AQI is missing', () => {
    const withAqi = computeCopdRiskScore(
      {
        avgAqi: 200,
        cleanFuelPct: 40,
        adultTobaccoPct: 30,
        trustWeighted: 2,
        population: 1_000_000,
      },
      bounds
    );
    const withoutAqi = computeCopdRiskScore(
      {
        cleanFuelPct: 40,
        adultTobaccoPct: 30,
        trustWeighted: 2,
        population: 1_000_000,
      },
      bounds
    );

    expect(withAqi).not.toBeNull();
    expect(withoutAqi).not.toBeNull();
    expect(withAqi!).not.toBe(withoutAqi!);
  });

  it('weights sum to one', () => {
    const total =
      COPD_RISK_WEIGHTS.aqi +
      COPD_RISK_WEIGHTS.solidFuel +
      COPD_RISK_WEIGHTS.tobacco +
      COPD_RISK_WEIGHTS.capacityStress;
    expect(total).toBe(1);
  });
});
