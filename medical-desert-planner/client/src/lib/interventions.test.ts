import { describe, expect, it } from 'vitest';
import { rankInterventions, recommendIntervention, type DistrictGapRow } from './interventions';

const base: DistrictGapRow = {
  district: 'Example',
  n_facilities: 2,
  trust_weighted: 1.4,
  copd_risk_score: 60,
  gap_score: 32,
  data_confidence: 'high',
  catalog_records: 20,
  n_without_named_staff: 0,
  n_established_before_2000: 0,
  n_stale_web_evidence: 0,
  n_with_doctor_count: 2,
};

describe('recommendIntervention', () => {
  it('recommends an access point only when zero supply has adequate evidence', () => {
    const action = recommendIntervention({ ...base, n_facilities: 0 }, 'spirometry');
    expect(action.kind).toBe('build');
    expect(action.title).toContain('mobile spirometry');
  });

  it('uses a low-confidence zero only as verification when broader records are absent', () => {
    expect(
      recommendIntervention({ ...base, data_confidence: 'low', n_facilities: 0, catalog_records: 0 }, 'spirometry').kind
    ).toBe('verify');
    expect(
      recommendIntervention({ ...base, data_confidence: 'low', n_facilities: 0, catalog_records: 3 }, 'spirometry').kind
    ).toBe('build');
  });

  it('treats facility age as an audit signal, not proof of disrepair', () => {
    const action = recommendIntervention({ ...base, n_established_before_2000: 2 }, 'oxygenTherapy');
    expect(action.kind).toBe('upgrade');
    expect(action.rationale).toContain('do not prove physical disrepair');
  });

  it('returns the three highest-gap districts', () => {
    const actions = rankInterventions(
      [
        { ...base, district: 'B', gap_score: 20 },
        { ...base, district: 'A', gap_score: 40 },
        { ...base, district: 'D', gap_score: 10 },
        { ...base, district: 'C', gap_score: 30 },
      ],
      'all'
    );
    expect(actions).toHaveLength(3);
    expect(actions[0].district).toBe('A');
  });
});
