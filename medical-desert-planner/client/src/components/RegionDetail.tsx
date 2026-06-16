import { useMemo, useState } from 'react';
import { useAnalyticsQuery } from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Badge,
  Button,
  Skeleton,
  Alert,
  AlertDescription,
  Empty,
} from '@databricks/appkit-ui/react';
import { BadgeCheck, Globe, Users, Image as ImageIcon, Clock, X } from 'lucide-react';
import { ConfidenceBadge, GapPill, pct } from './StatBits';
import { SaveScenarioDialog } from './SaveScenarioDialog';
import type { ScenarioSnapshot } from '../lib/scenarios';
import { formatFixed, formatNumber, formatOptionalFixed, toBoolean, toFiniteNumber } from '../lib/numbers';

interface Props {
  state: string;
  capability: string;
  onClose: () => void;
}

const CAPABILITY_LABELS: Record<string, string> = {
  all: 'All COPD care',
  pulmonology: 'Pulmonology / respiratory care',
  spirometry: 'Spirometry / lung function',
  oxygenTherapy: 'Oxygen therapy',
  inhalerNebulizer: 'Inhalers / nebulizers',
  pulmonaryRehab: 'Pulmonary rehabilitation',
  criticalCare: 'Critical / exacerbation care',
};

const capLabel = (capability: string) => CAPABILITY_LABELS[capability] ?? capability;

export function RegionDetail({ state, capability, onClose }: Props) {
  const [district, setDistrict] = useState('all');

  const districtParams = useMemo(
    () => ({
      state: sql.string(state),
      capability: sql.string(capability),
    }),
    [state, capability]
  );
  const facilityParams = useMemo(
    () => ({
      state: sql.string(state),
      district: sql.string(district),
      capability: sql.string(capability),
    }),
    [state, district, capability]
  );

  const districts = useAnalyticsQuery('district_coverage', districtParams);
  const facilities = useAnalyticsQuery('facility_list', facilityParams);

  // Roll the district rows up into a state-level snapshot for saved scenarios.
  const rows = districts.data ?? [];
  const totalFacilities = rows.reduce((total, row) => total + toFiniteNumber(row.n_facilities), 0);
  const totalTrust = rows.reduce((total, row) => total + toFiniteNumber(row.trust_weighted), 0);
  const riskRows = rows.filter((row) => row.copd_risk_score != null);
  const avgRisk = riskRows.length
    ? riskRows.reduce((total, row) => total + toFiniteNumber(row.copd_risk_score), 0) / riskRows.length
    : null;
  const cleanFuelRows = rows.filter((row) => row.clean_fuel_pct != null);
  const avgCleanFuel = cleanFuelRows.length
    ? cleanFuelRows.reduce((total, row) => total + toFiniteNumber(row.clean_fuel_pct), 0) / cleanFuelRows.length
    : null;
  const tobaccoRows = rows.filter((row) => row.adult_tobacco_pct != null);
  const avgTobacco = tobaccoRows.length
    ? tobaccoRows.reduce((total, row) => total + toFiniteNumber(row.adult_tobacco_pct), 0) / tobaccoRows.length
    : null;
  const ariRows = rows.filter((row) => row.child_ari_pct != null);
  const avgChildAri = ariRows.length
    ? ariRows.reduce((total, row) => total + toFiniteNumber(row.child_ari_pct), 0) / ariRows.length
    : null;
  const worstGap = rows.length ? Math.max(...rows.map((row) => toFiniteNumber(row.gap_score))) : 0;
  const snapshot: ScenarioSnapshot = {
    n_facilities: totalFacilities,
    trust_weighted: Math.round(totalTrust),
    clean_fuel_pct: avgCleanFuel,
    adult_tobacco_pct: avgTobacco,
    child_ari_pct: avgChildAri,
    copd_risk_score: avgRisk,
    gap_score: worstGap,
    metric: capability,
  };

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-xl">{state}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {capLabel(capability)} · {formatNumber(totalFacilities)} facilities · {formatNumber(totalTrust)}{' '}
            trust-weighted
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SaveScenarioDialog capability={capability} state={state} district={district} snapshot={snapshot} />
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close region detail">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* District-level gaps */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">District COPD risk and care gaps</h3>
            {district !== 'all' && (
              <Button variant="ghost" size="sm" onClick={() => setDistrict('all')}>
                Clear district filter
              </Button>
            )}
          </div>
          <details className="rounded-md border px-3 py-2 text-xs">
            <summary className="cursor-pointer font-medium text-foreground">What these district metrics mean</summary>
            <div className="mt-2 grid gap-2 text-muted-foreground md:grid-cols-2">
              <p>
                <strong className="text-foreground">COPD risk:</strong> planning proxy from AQI, solid-fuel use,
                tobacco prevalence, and population-weighted clinic capacity; not diagnosed prevalence.
              </p>
              <p>
                <strong className="text-foreground">Trust-weighted supply:</strong> matching facilities discounted when
                their web evidence is weak or incomplete.
              </p>
              <p>
                <strong className="text-foreground">Gap:</strong> risk multiplied by remaining scarcity against a three
                trust-weighted-facility district target.
              </p>
              <p>
                <strong className="text-foreground">Confidence:</strong> whether the broader catalog and NFHS evidence
                are sufficient to call a shortage. Low means verify first.
              </p>
              <p>
                <strong className="text-foreground">Clean fuel:</strong> households using cleaner cooking fuel; lower
                values indicate more household smoke exposure.
              </p>
              <p>
                <strong className="text-foreground">Child ARI:</strong> contextual respiratory-health indicator only; it
                is not part of the COPD risk formula.
              </p>
            </div>
          </details>

          {districts.loading && <Skeleton className="h-48 w-full" />}
          {districts.error && (
            <Alert variant="destructive">
              <AlertDescription>Failed to load districts: {districts.error}</AlertDescription>
            </Alert>
          )}
          {!districts.loading && !districts.error && rows.length === 0 && (
            <Empty>No facility evidence for this capability in {state}.</Empty>
          )}
          {!districts.loading && rows.length > 0 && (
            <div className="max-h-80 overflow-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead>District</TableHead>
                    <TableHead className="text-right">Facilities</TableHead>
                    <TableHead className="text-right">Trust-wtd</TableHead>
                    <TableHead className="text-right">Cities</TableHead>
                    <TableHead className="text-right">Doctor data</TableHead>
                    <TableHead className="text-right">COPD risk</TableHead>
                    <TableHead className="text-right">Clean fuel</TableHead>
                    <TableHead className="text-right">Adult tobacco</TableHead>
                    <TableHead className="text-right">Child ARI</TableHead>
                    <TableHead className="text-right">Gap</TableHead>
                    <TableHead>Confidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const active = district !== 'all' && district.toLowerCase() === r.district.toLowerCase();
                    return (
                      <TableRow
                        key={r.district}
                        onClick={() => setDistrict(active ? 'all' : r.district)}
                        className={`cursor-pointer ${active ? 'bg-muted' : ''}`}
                      >
                        <TableCell className="font-medium">{r.district}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(r.n_facilities)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatFixed(r.trust_weighted)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(r.n_cities_with_supply)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(r.n_with_doctor_count)}/{formatNumber(r.n_facilities)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatOptionalFixed(r.copd_risk_score)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{pct(r.clean_fuel_pct)}</TableCell>
                        <TableCell className="text-right tabular-nums">{pct(r.adult_tobacco_pct)}</TableCell>
                        <TableCell className="text-right tabular-nums">{pct(r.child_ari_pct)}</TableCell>
                        <TableCell className="text-right">
                          <GapPill score={r.gap_score} />
                        </TableCell>
                        <TableCell>
                          <ConfidenceBadge level={r.data_confidence} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        {/* Facility drill-down — the evidence behind the aggregate */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            Facility evidence{district !== 'all' ? ` — ${district}` : ''}
            <span className="ml-2 font-normal text-muted-foreground">
              {facilities.data
                ? `(${facilities.data.length}${facilities.data.length === 200 ? '+' : ''} shown, most trusted first)`
                : ''}
            </span>
          </h3>

          {facilities.loading && <Skeleton className="h-40 w-full" />}
          {facilities.error && (
            <Alert variant="destructive">
              <AlertDescription>Failed to load facilities: {facilities.error}</AlertDescription>
            </Alert>
          )}
          {!facilities.loading && facilities.data && facilities.data.length === 0 && (
            <Empty>No facility records match this selection.</Empty>
          )}
          {!facilities.loading && facilities.data && facilities.data.length > 0 && (
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {facilities.data.slice(0, 40).map((f, i) => (
                <div key={`${f.name}-${f.pin}-${i}`} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">{f.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {f.city || '—'} · {f.district || '—'} · {f.pin}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className="shrink-0 tabular-nums"
                      style={{ borderColor: 'color-mix(in oklch, var(--primary) 40%, transparent)' }}
                    >
                      trust {formatFixed(f.trust_score)}
                    </Badge>
                  </div>
                  {f.specialties && (
                    <div className="mt-1.5 line-clamp-1 text-xs text-muted-foreground">{f.specialties}</div>
                  )}
                  {f.evidence && (
                    <div className="mt-1 line-clamp-2 text-xs italic text-muted-foreground">“{f.evidence}”</div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {toBoolean(f.has_pulmonology) && <Badge variant="secondary">Respiratory</Badge>}
                    {toBoolean(f.has_spirometry) && <Badge variant="secondary">Spirometry</Badge>}
                    {toBoolean(f.has_oxygen) && <Badge variant="secondary">Oxygen</Badge>}
                    {toBoolean(f.has_inhaler_nebulizer) && <Badge variant="secondary">Inhaler/nebulizer</Badge>}
                    {toBoolean(f.has_pulmonary_rehab) && <Badge variant="secondary">Pulmonary rehab</Badge>}
                    {toBoolean(f.has_critical_care) && <Badge variant="secondary">Critical care</Badge>}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground">
                    {toBoolean(f.has_logo) && <TrustChip icon={<ImageIcon className="h-3 w-3" />} label="Logo" />}
                    {toBoolean(f.has_staff) && <TrustChip icon={<Users className="h-3 w-3" />} label="Named staff" />}
                    {toBoolean(f.has_website) && <TrustChip icon={<Globe className="h-3 w-3" />} label="Website" />}
                    {toBoolean(f.recently_updated) && <TrustChip icon={<Clock className="h-3 w-3" />} label="Recent" />}
                    {f.social_count > 0 && (
                      <TrustChip icon={<BadgeCheck className="h-3 w-3" />} label={`${f.social_count} social`} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function TrustChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground">
      {icon}
      {label}
    </span>
  );
}
