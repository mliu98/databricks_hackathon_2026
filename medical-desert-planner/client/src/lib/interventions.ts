import { toFiniteNumber } from './numbers';

export type InterventionKind = 'verify' | 'build' | 'upgrade' | 'staff' | 'expand';

export interface DistrictGapRow {
  district: string;
  n_facilities: unknown;
  trust_weighted: unknown;
  // copd_risk_score and gap_score are no longer returned by SQL — they are
  // added client-side by enrichDistrictCoverageRows (see lib/copdRisk).
  copd_risk_score?: unknown;
  gap_score?: unknown;
  data_confidence: string;
  catalog_records?: unknown;
  catalog_trust_weighted?: unknown;
  n_without_named_staff?: unknown;
  n_established_before_2000?: unknown;
  n_stale_web_evidence?: unknown;
  n_with_doctor_count?: unknown;
  reported_doctors?: unknown;
  n_with_capacity?: unknown;
  total_reported_capacity?: unknown;
  n_accepts_volunteers?: unknown;
  n_spirometry?: unknown;
  n_oxygen?: unknown;
  n_inhaler_nebulizer?: unknown;
  n_pulmonary_rehab?: unknown;
  n_critical_care?: unknown;
  n_cities_with_supply?: unknown;
  largest_city_share_pct?: unknown;
  clean_fuel_pct?: unknown;
  adult_tobacco_pct?: unknown;
  child_ari_pct?: unknown;
  insurance_pct?: unknown;
}

export interface Intervention {
  district: string;
  kind: InterventionKind;
  title: string;
  rationale: string;
  confidence: string;
  priorityScore: number;
}

const capabilityName = (capability: string) => {
  const labels: Record<string, string> = {
    all: 'COPD care',
    pulmonology: 'respiratory care',
    spirometry: 'spirometry',
    oxygenTherapy: 'oxygen therapy',
    inhalerNebulizer: 'inhaler and nebulizer access',
    pulmonaryRehab: 'pulmonary rehabilitation',
    criticalCare: 'critical respiratory care',
  };
  return labels[capability] ?? capability;
};

export function recommendIntervention(row: DistrictGapRow, capability: string): Intervention {
  const facilities = toFiniteNumber(row.n_facilities);
  const risk = toFiniteNumber(row.copd_risk_score);
  const gap = toFiniteNumber(row.gap_score);
  const withoutStaff = toFiniteNumber(row.n_without_named_staff);
  const oldFacilities = toFiniteNumber(row.n_established_before_2000);
  const staleEvidence = toFiniteNumber(row.n_stale_web_evidence);
  const catalogRecords = toFiniteNumber(row.catalog_records);
  const cityShare = toFiniteNumber(row.largest_city_share_pct);
  const doctorsReported = toFiniteNumber(row.n_with_doctor_count);
  const service = capabilityName(capability);

  if (facilities === 0 && catalogRecords < 2) {
    return {
      district: row.district,
      kind: 'verify',
      title: `Verify care availability in ${row.district}`,
      rationale: `Catalog visibility is too limited to distinguish a true ${service} shortage from missing records. Validate facilities and contacts before funding deployment.`,
      confidence: 'low',
      priorityScore: gap,
    };
  }

  if (facilities === 0) {
    const title =
      capability === 'spirometry'
        ? `Assess a mobile spirometry service in ${row.district}`
        : `Assess a new ${service} access point in ${row.district}`;
    return {
      district: row.district,
      kind: 'build',
      title,
      rationale: `COPD risk is ${risk.toFixed(1)}/100 and no matching facility was found across ${catalogRecords} broader facility records. Verify the service inventory, then assess a mobile or permanent access point with a local operating partner.`,
      confidence: row.data_confidence,
      priorityScore: gap,
    };
  }

  if (oldFacilities / facilities >= 0.5 || staleEvidence / facilities >= 0.5) {
    return {
      district: row.district,
      kind: 'upgrade',
      title: `Audit and upgrade ${service} in ${row.district}`,
      rationale: `${facilities} matching facility record${facilities === 1 ? '' : 's'} exist, but establishment-age or stale web-evidence signals justify an infrastructure and equipment audit. These signals do not prove physical disrepair.`,
      confidence: row.data_confidence,
      priorityScore: gap,
    };
  }

  if (withoutStaff / facilities >= 0.5) {
    return {
      district: row.district,
      kind: 'staff',
      title: `Verify staffing and recruit for ${row.district}`,
      rationale: `${withoutStaff} of ${facilities} matching records do not show named staff. Confirm actual rosters first, then fund recruitment, training, or rotating outreach where shortages are verified.`,
      confidence: row.data_confidence,
      priorityScore: gap,
    };
  }

  if (facilities >= 3 && cityShare >= 75) {
    return {
      district: row.district,
      kind: 'expand',
      title: `Extend ${service} beyond the main city in ${row.district}`,
      rationale: `${cityShare.toFixed(0)}% of matching facility records are concentrated in one city. Use mobile outreach, referral transport, or satellite service days to improve geographic reach.`,
      confidence: row.data_confidence,
      priorityScore: gap,
    };
  }

  if (doctorsReported === 0) {
    return {
      district: row.district,
      kind: 'staff',
      title: `Validate COPD staffing capacity in ${row.district}`,
      rationale: `Matching facilities exist, but none report a usable doctor count. Confirm respiratory staffing and recruit, train, or rotate clinicians where the roster review identifies shortages.`,
      confidence: row.data_confidence,
      priorityScore: gap,
    };
  }

  return {
    district: row.district,
    kind: 'expand',
    title: `Expand ${service} reach in ${row.district}`,
    rationale: `Existing supply is visible, but COPD risk (${risk.toFixed(1)}/100) remains mismatched with trust-weighted capacity. Consider outreach, referral coordination, or additional service days.`,
    confidence: row.data_confidence,
    priorityScore: gap,
  };
}

export function rankInterventions(rows: DistrictGapRow[], capability: string, limit = 3): Intervention[] {
  const candidates = [...rows]
    .filter((row) => row.copd_risk_score != null && row.gap_score != null)
    .sort((a, b) => toFiniteNumber(b.gap_score) - toFiniteNumber(a.gap_score))
    .map((row) => recommendIntervention(row, capability));

  const selected: Intervention[] = [];
  for (const candidate of candidates) {
    if (!selected.some((action) => action.kind === candidate.kind)) selected.push(candidate);
    if (selected.length === limit) return selected;
  }
  for (const candidate of candidates) {
    if (!selected.includes(candidate)) selected.push(candidate);
    if (selected.length === limit) break;
  }
  return selected;
}
