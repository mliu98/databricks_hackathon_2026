import { describe, expect, it } from 'vitest';
import { cookingHoverLabel, stateCookingByKey } from './cooking';
import { normalizeStateKey } from './geo';

describe('stateCookingByKey', () => {
  it('indexes rows by normalized state name', () => {
    const map = stateCookingByKey([
      { state: 'Uttar Pradesh', solidBiomassPct: 44, firewoodPct: 38.67, otherNaturalPct: 5.37 },
    ]);
    expect(map.get(normalizeStateKey('Uttar Pradesh'))?.solidBiomassPct).toBe(44);
  });
});

describe('cookingHoverLabel', () => {
  it('formats solid biomass share for tooltips', () => {
    expect(cookingHoverLabel({ solidBiomassPct: 44.04 })).toBe('Solid biomass fuel 44.0%');
  });
});
