import { normalizeStateKey } from './geo';
import { formatFixed } from './numbers';

export interface StateAqiRow {
  state: string;
  avgAqi: number;
  readingCount: number;
  status: string;
}

export interface StateAqiDataset {
  generatedAt: string;
  method: string;
  states: StateAqiRow[];
}

export function aqiStatusLabel(value: number): string {
  if (value <= 50) return 'Good';
  if (value <= 100) return 'Satisfactory';
  if (value <= 200) return 'Moderate';
  if (value <= 300) return 'Poor';
  if (value <= 400) return 'Very Poor';
  return 'Severe';
}

export async function loadStateAqiDataset(): Promise<StateAqiDataset> {
  const res = await fetch('/data/state-aqi.json');
  if (!res.ok) throw new Error(`Failed to load AQI data (${res.status})`);
  return (await res.json()) as StateAqiDataset;
}

export function stateAqiByKey(states: StateAqiRow[]): Map<string, StateAqiRow> {
  const map = new Map<string, StateAqiRow>();
  for (const row of states) {
    map.set(normalizeStateKey(row.state), row);
  }
  return map;
}

export function aqiHoverLabel(row: Pick<StateAqiRow, 'avgAqi' | 'status'>): string {
  return `Avg AQI ${formatFixed(row.avgAqi)} · ${row.status}`;
}
