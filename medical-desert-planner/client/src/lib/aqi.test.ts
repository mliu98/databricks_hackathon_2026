import { describe, expect, it } from 'vitest';
import { aqiHoverLabel, aqiStatusLabel, stateAqiByKey } from './aqi';
import { normalizeStateKey } from './geo';

describe('aqiStatusLabel', () => {
  it('maps CPCB AQI bands', () => {
    expect(aqiStatusLabel(40)).toBe('Good');
    expect(aqiStatusLabel(75)).toBe('Satisfactory');
    expect(aqiStatusLabel(150)).toBe('Moderate');
    expect(aqiStatusLabel(250)).toBe('Poor');
    expect(aqiStatusLabel(350)).toBe('Very Poor');
    expect(aqiStatusLabel(450)).toBe('Severe');
  });
});

describe('stateAqiByKey', () => {
  it('indexes rows by normalized state name', () => {
    const map = stateAqiByKey([{ state: 'Uttar Pradesh', avgAqi: 120, readingCount: 10, status: 'Moderate' }]);
    expect(map.get(normalizeStateKey('Uttar Pradesh'))?.avgAqi).toBe(120);
  });
});

describe('aqiHoverLabel', () => {
  it('formats avg AQI and status for tooltips', () => {
    expect(aqiHoverLabel({ avgAqi: 120.4, status: 'Moderate' })).toBe('Avg AQI 120 · Moderate');
  });
});
