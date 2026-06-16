import { normalizeStateKey } from './geo';

export interface StatePopulationRow {
  state: string;
  population: number;
}

export interface StatePopulationDataset {
  generatedAt: string;
  method: string;
  states: StatePopulationRow[];
}

export async function loadStatePopulationDataset(): Promise<StatePopulationDataset> {
  const res = await fetch('/data/state-population.json');
  if (!res.ok) throw new Error(`Failed to load population data (${res.status})`);
  return (await res.json()) as StatePopulationDataset;
}

export function statePopulationByKey(states: StatePopulationRow[]): Map<string, StatePopulationRow> {
  const map = new Map<string, StatePopulationRow>();
  for (const row of states) {
    map.set(normalizeStateKey(row.state), row);
  }
  return map;
}
