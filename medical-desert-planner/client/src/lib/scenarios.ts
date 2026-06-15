// Client for the Lakebase-backed planning-scenario API.
export interface ScenarioSnapshot {
  n_facilities?: number;
  trust_weighted?: number;
  avg_trust?: number;
  fully_vax_pct?: number | null;
  institutional_birth_pct?: number | null;
  insurance_pct?: number | null;
  clean_fuel_pct?: number | null;
  adult_tobacco_pct?: number | null;
  child_ari_pct?: number | null;
  copd_risk_score?: number | null;
  gap_score?: number;
  data_confidence?: string;
  metric?: string;
  recommended_action?: string;
  recommendation_kind?: string;
  methodology_version?: string;
}

export interface Scenario {
  id: string;
  name: string;
  capability: string;
  geography_state: string;
  geography_district: string;
  notes: string;
  snapshot: ScenarioSnapshot;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ScenarioInput {
  name: string;
  capability: string;
  geography_state: string;
  geography_district: string;
  notes: string;
  snapshot: ScenarioSnapshot;
}

export type ScenarioUpdate = Partial<ScenarioInput>;

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function listScenarios(): Promise<Scenario[]> {
  return fetch('/api/scenarios').then((r) => asJson<Scenario[]>(r));
}

export function createScenario(input: ScenarioInput): Promise<Scenario> {
  return fetch('/api/scenarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }).then((r) => asJson<Scenario>(r));
}

export function updateScenario(id: string, input: ScenarioUpdate): Promise<Scenario> {
  return fetch(`/api/scenarios/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }).then((r) => asJson<Scenario>(r));
}

export async function deleteScenario(id: string): Promise<void> {
  const res = await fetch(`/api/scenarios/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw new Error(`Failed to delete (${res.status})`);
}
