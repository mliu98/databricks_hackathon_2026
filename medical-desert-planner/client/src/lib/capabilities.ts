import { toBoolean } from './numbers';

const FACILITY_CAPABILITY_FLAGS = [
  { field: 'has_pulmonology', label: 'Respiratory' },
  { field: 'has_spirometry', label: 'Spirometry' },
  { field: 'has_oxygen', label: 'Oxygen' },
  { field: 'has_inhaler_nebulizer', label: 'Inhaler/nebulizer' },
  { field: 'has_pulmonary_rehab', label: 'Pulmonary rehab' },
  { field: 'has_critical_care', label: 'Critical care' },
] as const;

const COPD_DEPARTMENT_PATTERN =
  /copd|chronic obstructive|pulmon|respirat|chest medicine|spirom|pulmonary function|lung function|\bpft\b|oxygen|ventilat|nebul|inhaler|bronchodilator|pulmonary rehab|respiratory rehab|critical care|intensive care|\bicu\b|criticalcaremedicine/i;

export function facilityCapabilityLabels(row: Record<string, unknown>): string[] {
  return FACILITY_CAPABILITY_FLAGS.filter(({ field }) => toBoolean(row[field])).map(({ label }) => label);
}

function copdRelatedSpecialtyNames(specialties: string | null | undefined): string[] {
  if (!specialties?.trim()) return [];
  return specialties
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && COPD_DEPARTMENT_PATTERN.test(s));
}

/** COPD-relevant departments from evidence flags and filtered specialty names. */
export function facilityCopdDepartments(row: Record<string, unknown>): string[] {
  const seen = new Set<string>();
  const departments: string[] = [];

  for (const name of [...copdRelatedSpecialtyNames(row.specialties as string | undefined), ...facilityCapabilityLabels(row)]) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    departments.push(name);
  }

  return departments;
}
