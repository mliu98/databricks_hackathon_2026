import { useMemo } from 'react';
import { useAnalyticsQuery } from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@databricks/appkit-ui/react';
import { Building2, ExternalLink, Mail, Phone, ShieldQuestion, Stethoscope, Users, Wrench, X } from 'lucide-react';
import { ConfidenceBadge, GapPill } from './StatBits';
import { SaveScenarioDialog } from './SaveScenarioDialog';
import { rankInterventions, type DistrictGapRow, type InterventionKind } from '../lib/interventions';
import { formatFixed, formatNumber, toBoolean, toFiniteNumber } from '../lib/numbers';
import type { ScenarioSnapshot } from '../lib/scenarios';

interface Props {
  state: string;
  capability: string;
  stateRow?: Record<string, unknown>;
  onClose: () => void;
}

const ACTION_ICONS: Record<InterventionKind, typeof Building2> = {
  verify: ShieldQuestion,
  build: Building2,
  upgrade: Wrench,
  staff: Users,
  expand: Stethoscope,
};

const capabilityBadges = (partner: Record<string, unknown>) =>
  [
    toBoolean(partner.has_pulmonology) && 'Respiratory',
    toBoolean(partner.has_spirometry) && 'Spirometry',
    toBoolean(partner.has_oxygen) && 'Oxygen',
    toBoolean(partner.has_inhaler_nebulizer) && 'Inhaler/nebulizer',
    toBoolean(partner.has_pulmonary_rehab) && 'Rehab',
    toBoolean(partner.has_critical_care) && 'Critical care',
  ].filter(Boolean) as string[];

export function StateActionPanel({ state, capability, stateRow, onClose }: Props) {
  const districtParams = useMemo(
    () => ({ state: sql.string(state), capability: sql.string(capability) }),
    [state, capability]
  );
  const partnerParams = useMemo(() => ({ state: sql.string(state) }), [state]);
  const districts = useAnalyticsQuery('district_coverage', districtParams);
  const partners = useAnalyticsQuery('partner_candidates', partnerParams);
  const rows = (districts.data ?? []) as DistrictGapRow[];
  const actions = rankInterventions(rows, capability);

  return (
    <Card className="z-20 border-primary/40 bg-card/95 shadow-xl backdrop-blur lg:absolute lg:right-3 lg:top-3 lg:w-[390px]">
      <CardHeader className="space-y-2 p-4 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{state} action brief</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Top district interventions from current Unity Catalog evidence
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close state action brief">
            <X className="h-4 w-4" />
          </Button>
        </div>
        {stateRow && (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <Metric
                label="Risk proxy"
                value={`${formatFixed(stateRow.copd_risk_score)}/100`}
                description="Planning estimate from household solid-fuel exposure and adult tobacco use. It is not COPD prevalence."
              />
              <Metric
                label="Supply"
                value={formatNumber(stateRow.n_facilities)}
                description="Facilities whose catalog text contains evidence for the selected COPD-care capability. It is not a verified capacity count."
              />
              <Metric
                label="Gap"
                value={<GapPill score={stateRow.gap_score as string | number | null | undefined} />}
                description="Risk multiplied by remaining supply scarcity. Higher values indicate a stronger risk-to-supply mismatch."
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted/50 px-2 py-1.5 text-[11px]">
              <span title="Households not using clean cooking fuel; the 60% household-smoke component of the COPD risk proxy.">
                Household smoke exposure{' '}
                <strong className="text-foreground">{pctFromInverse(stateRow.clean_fuel_pct)}</strong>
              </span>
              <span title="Average NFHS-5 tobacco use among women and men age 15+; the 40% tobacco component of the COPD risk proxy.">
                Adult tobacco <strong className="text-foreground">{pctValue(stateRow.adult_tobacco_pct)}</strong>
              </span>
              <ConfidenceBadge
                level={typeof stateRow.data_confidence === 'string' ? stateRow.data_confidence : 'low'}
              />
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="max-h-[620px] space-y-4 overflow-y-auto p-4 pt-2">
        {districts.loading && <Skeleton className="h-72 w-full" />}
        {districts.error && (
          <Alert variant="destructive">
            <AlertDescription>Could not load district recommendations: {districts.error}</AlertDescription>
          </Alert>
        )}
        {partners.error && (
          <Alert variant="destructive">
            <AlertDescription>Could not load potential partner contacts: {partners.error}</AlertDescription>
          </Alert>
        )}
        {!districts.loading && !districts.error && actions.length === 0 && (
          <p className="text-sm text-muted-foreground">No district risk evidence is available for this state.</p>
        )}

        {actions.map((action, index) => {
          const row = rows.find((candidate) => candidate.district === action.district);
          if (!row) return null;
          const Icon = ACTION_ICONS[action.kind];
          const districtPartners = ((partners.data ?? []) as Record<string, unknown>[])
            .filter((partner) => String(partner.district).toLowerCase() === action.district.toLowerCase())
            .slice(0, 2);
          const snapshot: ScenarioSnapshot = {
            n_facilities: toFiniteNumber(row.n_facilities),
            trust_weighted: toFiniteNumber(row.trust_weighted),
            copd_risk_score: toFiniteNumber(row.copd_risk_score),
            gap_score: toFiniteNumber(row.gap_score),
            data_confidence: row.data_confidence,
            metric: capability,
            recommended_action: action.title,
            recommendation_kind: action.kind,
            methodology_version: 'district-actions-v1',
          };

          return (
            <section key={action.district} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 rounded-md bg-primary/10 p-1.5 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Priority {index + 1}
                    </span>
                    <ConfidenceBadge level={action.confidence} />
                  </div>
                  <h4 className="mt-1 text-sm font-semibold text-foreground">{action.title}</h4>
                </div>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{action.rationale}</p>
              <div className="flex flex-wrap gap-1.5 text-xs">
                <Badge variant="outline">risk {formatFixed(row.copd_risk_score)}/100</Badge>
                <Badge variant="outline">{formatNumber(row.n_facilities)} matching facilities</Badge>
                <Badge variant="outline">gap {formatFixed(row.gap_score)}</Badge>
              </div>
              <GapDrivers row={row} />

              {districtPartners.length > 0 && (
                <div className="space-y-1.5 border-t pt-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Potential partners
                  </div>
                  {districtPartners.map((partner) => (
                    <Partner key={String(partner.facility_id)} partner={partner} />
                  ))}
                </div>
              )}

              <SaveScenarioDialog
                capability={capability}
                state={state}
                district={action.district}
                snapshot={snapshot}
                initialName={action.title}
                initialNotes={`${action.rationale}\n\nEvidence confidence: ${action.confidence}. Potential partners are unverified candidates from public catalog contact fields.`}
                triggerLabel="Add to scenario"
                triggerVariant="outline"
              />
            </section>
          );
        })}

        <details className="rounded-md border px-3 py-2 text-xs">
          <summary className="cursor-pointer font-medium text-foreground">How gaps and actions are calculated</summary>
          <div className="mt-2 space-y-2 text-muted-foreground">
            <p>
              <strong className="text-foreground">Risk:</strong> 60% solid-fuel exposure plus 40% average adult tobacco
              use from NFHS-5.
            </p>
            <p>
              <strong className="text-foreground">Supply:</strong> trust-weighted catalog records matching the selected
              capability.
            </p>
            <p>
              <strong className="text-foreground">Gap:</strong> risk × remaining scarcity, where three trust-weighted
              facilities represents the current district supply target.
            </p>
            <p>
              <strong className="text-foreground">Confidence:</strong> broader catalog record volume, web-evidence
              trust, and complete NFHS inputs. Low confidence always triggers verification first.
            </p>
            <p>
              Facility age, stale pages, and missing named staff are audit signals only. Partners are public-contact
              candidates, not verified NGOs or committed collaborators.
            </p>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function GapDrivers({ row }: { row: DistrictGapRow }) {
  const facilities = toFiniteNumber(row.n_facilities);
  const doctorCoverage = facilities > 0 ? toFiniteNumber(row.n_with_doctor_count) / facilities : 0;
  const capabilityGaps = [
    toFiniteNumber(row.n_spirometry) === 0 && 'No spirometry evidence',
    toFiniteNumber(row.n_oxygen) === 0 && 'No oxygen evidence',
    toFiniteNumber(row.n_inhaler_nebulizer) === 0 && 'No inhaler/nebulizer evidence',
    toFiniteNumber(row.n_pulmonary_rehab) === 0 && 'No rehab evidence',
  ].filter(Boolean) as string[];

  return (
    <details className="rounded-md bg-muted/40 px-2 py-1.5 text-[11px]">
      <summary className="cursor-pointer font-medium text-foreground">Why this gap appears</summary>
      <div className="mt-1.5 space-y-1 text-muted-foreground">
        <p>
          Household smoke exposure: <strong className="text-foreground">{pctFromInverse(row.clean_fuel_pct)}</strong>
          {' · '}Adult tobacco: <strong className="text-foreground">{pctValue(row.adult_tobacco_pct)}</strong>
          {' · '}Insurance coverage: <strong className="text-foreground">{pctValue(row.insurance_pct)}</strong>
        </p>
        <p>
          Supply spans <strong className="text-foreground">{formatNumber(row.n_cities_with_supply)}</strong> cities
          {row.largest_city_share_pct != null && (
            <>
              ; the largest city holds{' '}
              <strong className="text-foreground">{pctValue(row.largest_city_share_pct)}</strong>
            </>
          )}
          . Doctor counts are reported by{' '}
          <strong className="text-foreground">
            {facilities ? `${Math.round(doctorCoverage * 100)}%` : 'no matching facilities'}
          </strong>
          .
        </p>
        {capabilityGaps.length > 0 && <p>{capabilityGaps.join(' · ')}</p>}
        <p>These are catalog-evidence gaps, not confirmed service absences.</p>
      </div>
    </details>
  );
}

function Metric({ label, value, description }: { label: string; value: React.ReactNode; description: string }) {
  return (
    <div className="rounded-md bg-muted/60 p-2" title={description}>
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold tabular-nums text-foreground">{value}</div>
      <p className="mt-1 line-clamp-3 text-[10px] leading-tight text-muted-foreground">{description}</p>
    </div>
  );
}

function Partner({ partner }: { partner: Record<string, unknown> }) {
  const badges = capabilityBadges(partner);
  const website = catalogValues(partner.website)[0] ?? '';
  const phone = catalogValues(partner.phone).join(', ');
  const email = catalogValues(partner.email).join(', ');
  const safeWebsite = website.startsWith('http://') || website.startsWith('https://') ? website : null;

  return (
    <div className="rounded-md bg-muted/50 p-2">
      <div className="truncate text-xs font-medium text-foreground">{String(partner.name)}</div>
      {Boolean(partner.organization_type) && (
        <div className="truncate text-[10px] text-muted-foreground">{String(partner.organization_type)}</div>
      )}
      <div className="mt-1 flex flex-wrap gap-1">
        {badges.slice(0, 3).map((badge) => (
          <Badge key={badge} variant="secondary">
            {badge}
          </Badge>
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {phone && (
          <span className="inline-flex items-center gap-1">
            <Phone className="h-3 w-3" />
            {phone}
          </span>
        )}
        {email && (
          <span className="inline-flex items-center gap-1">
            <Mail className="h-3 w-3" />
            {email}
          </span>
        )}
        {safeWebsite && (
          <a
            className="inline-flex items-center gap-1 text-primary hover:underline"
            href={safeWebsite}
            target="_blank"
            rel="noreferrer"
          >
            Website <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}

function catalogValues(value: unknown): string[] {
  if (typeof value === 'number') return [String(value)];
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    }
  } catch {
    // Plain catalog strings are expected more often than JSON arrays.
  }
  return [value];
}

function pctValue(value: unknown): string {
  if (value == null || value === '') return 'not measured';
  return `${formatFixed(value, 1)}%`;
}

function pctFromInverse(cleanFuel: unknown): string {
  if (cleanFuel == null || cleanFuel === '') return 'not measured';
  return `${formatFixed(100 - toFiniteNumber(cleanFuel), 1)}%`;
}
