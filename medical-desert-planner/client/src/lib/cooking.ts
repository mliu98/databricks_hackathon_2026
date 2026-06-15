import { normalizeStateKey } from './geo';
import { formatFixed } from './numbers';

export interface StateCookingRow {
  state: string;
  solidBiomassPct: number;
  firewoodPct: number;
  otherNaturalPct: number;
}

export interface StateCookingDataset {
  generatedAt: string;
  method: string;
  states: StateCookingRow[];
}

export async function loadStateCookingDataset(): Promise<StateCookingDataset> {
  const res = await fetch('/data/state-cooking.json');
  if (!res.ok) throw new Error(`Failed to load cooking fuel data (${res.status})`);
  return (await res.json()) as StateCookingDataset;
}

export function stateCookingByKey(states: StateCookingRow[]): Map<string, StateCookingRow> {
  const map = new Map<string, StateCookingRow>();
  for (const row of states) {
    map.set(normalizeStateKey(row.state), row);
  }
  return map;
}

export function cookingHoverLabel(row: Pick<StateCookingRow, 'solidBiomassPct'>): string {
  return `Solid biomass fuel ${formatFixed(row.solidBiomassPct, 1)}%`;
}
