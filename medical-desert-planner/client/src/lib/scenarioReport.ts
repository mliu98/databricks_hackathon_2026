// Builds an NGO-coordinator-friendly, board-ready PDF report from a saved
// planning scenario and opens it in the browser's print-to-PDF dialog.
// Implemented with the browser print pipeline so it needs no extra dependency.
import type { Scenario } from './scenarios';
import { formatFixed, formatNumber } from './numbers';

const CAPABILITY_LABELS: Record<string, string> = {
  all: 'All COPD care',
  pulmonology: 'Pulmonology / respiratory care',
  spirometry: 'Spirometry / lung function testing',
  oxygenTherapy: 'Oxygen therapy',
  inhalerNebulizer: 'Inhalers / nebulizers',
  pulmonaryRehab: 'Pulmonary rehabilitation',
  criticalCare: 'Critical / exacerbation care',
};

export const capabilityLabel = (capability: string) => CAPABILITY_LABELS[capability] ?? capability;

export function geographyLabel(s: Scenario): string {
  if (s.geography_district && s.geography_district !== 'all') {
    return `${s.geography_district}, ${s.geography_state}`;
  }
  if (!s.geography_state || s.geography_state === 'all') return 'All India';
  return s.geography_state;
}

function num(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pctText(value: number | string | null | undefined): string {
  const n = num(value);
  return n == null ? 'Not measured' : `${formatFixed(n, 1)}%`;
}

// Plain-language verdict combining the care gap with how much we trust it.
export function plainVerdict(s: Scenario): { headline: string; tone: 'gap' | 'verify' | 'ok'; body: string } {
  const gap = num(s.snapshot?.gap_score) ?? 0;
  const confidence = (s.snapshot?.data_confidence ?? '').toLowerCase();
  const where = geographyLabel(s);
  const cap = capabilityLabel(s.capability).toLowerCase();

  if (confidence === 'low') {
    return {
      headline: 'Investigate before deploying',
      tone: 'verify',
      body: `The evidence for ${where} is thin, so this is a data-poor region rather than a confirmed gap. Run a quick field survey or verify facility listings for ${cap} before committing budget — a low record count can look like a gap when it is really under-reporting.`,
    };
  }
  if (gap >= 30) {
    return {
      headline: 'Likely a true care gap — prioritise',
      tone: 'gap',
      body: `${where} combines high COPD risk with weak verified ${cap} capacity, and the evidence is strong enough to act on. This is a defensible priority for the next funding cycle.`,
    };
  }
  if (gap >= 12) {
    return {
      headline: 'Moderate gap — worth a closer look',
      tone: 'gap',
      body: `${where} shows a moderate shortfall in ${cap} relative to risk. Consider it alongside higher-priority regions and confirm on-the-ground demand.`,
    };
  }
  return {
    headline: 'Reasonably served on current evidence',
    tone: 'ok',
    body: `On the available evidence, ${cap} supply in ${where} broadly matches the estimated COPD risk. Monitor rather than deploy new capacity here.`,
  };
}

interface MetricRow {
  label: string;
  value: string;
  meaning: string;
}

export function metricRows(s: Scenario): MetricRow[] {
  const snap = s.snapshot ?? {};
  const rows: MetricRow[] = [];

  rows.push({
    label: 'Care-gap score',
    value: num(snap.gap_score) == null ? 'Not measured' : formatFixed(num(snap.gap_score)!),
    meaning: 'COPD risk weighed against remaining care scarcity. Higher means a more urgent shortfall.',
  });
  rows.push({
    label: 'COPD risk proxy',
    value: num(snap.copd_risk_score) == null ? 'Not measured' : `${formatFixed(num(snap.copd_risk_score)!)} / 100`,
    meaning: 'Estimated respiratory-disease burden from household smoke exposure and adult tobacco use.',
  });
  rows.push({
    label: 'Matching facilities',
    value: formatNumber(snap.n_facilities ?? 0),
    meaning: 'Facilities in the region with evidence of the selected COPD-care capability.',
  });
  rows.push({
    label: 'Trust-weighted capacity',
    value: num(snap.trust_weighted) == null ? '—' : formatNumber(snap.trust_weighted!),
    meaning: 'Facility count discounted where the supporting web evidence is weak or incomplete.',
  });
  rows.push({
    label: 'Evidence confidence',
    value: snap.data_confidence ? `${snap.data_confidence[0].toUpperCase()}${snap.data_confidence.slice(1)}` : 'Unknown',
    meaning: 'How sure we are the gap is real. Low confidence means verify before deploying.',
  });
  rows.push({
    label: 'Clean cooking fuel',
    value: pctText(snap.clean_fuel_pct),
    meaning: 'Households using cleaner fuel. Lower values mean more household smoke exposure.',
  });
  rows.push({
    label: 'Adult tobacco use',
    value: pctText(snap.adult_tobacco_pct),
    meaning: 'Adult tobacco prevalence — a driver of COPD risk and a target for cessation outreach.',
  });

  return rows;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildReportHtml(s: Scenario): string {
  const verdict = plainVerdict(s);
  const rows = metricRows(s);
  const toneColor = verdict.tone === 'gap' ? '#d6452f' : verdict.tone === 'verify' ? '#b8860b' : '#0f9d6b';
  const generated = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const action = s.snapshot?.recommended_action;

  const metricsHtml = rows
    .map(
      (r) => `
        <tr>
          <td class="m-label">${escapeHtml(r.label)}</td>
          <td class="m-value">${escapeHtml(r.value)}</td>
          <td class="m-meaning">${escapeHtml(r.meaning)}</td>
        </tr>`
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(s.name)} — COPD Care-Gap Report</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #1a1a1a; margin: 0; font-size: 12px; line-height: 1.55;
  }
  .header { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid #1a1a1a; padding-bottom: 14px; }
  .header img { height: 48px; width: auto; }
  .header .titles { flex: 1; }
  .eyebrow { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #6b7280; margin: 0; }
  h1 { font-size: 20px; margin: 2px 0 0; }
  .meta { margin-top: 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; }
  .meta div { font-size: 12px; }
  .meta .k { color: #6b7280; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; }
  .verdict { margin-top: 22px; border-left: 5px solid ${toneColor}; background: #f7f7f5; padding: 14px 16px; border-radius: 6px; }
  .verdict h2 { margin: 0 0 4px; font-size: 15px; color: ${toneColor}; }
  .verdict p { margin: 0; }
  h3 { font-size: 13px; margin: 26px 0 8px; text-transform: uppercase; letter-spacing: 0.05em; color: #374151; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 1.5px solid #d1d5db; padding: 6px 8px; }
  td { padding: 8px; border-bottom: 1px solid #ececec; vertical-align: top; }
  .m-label { font-weight: 600; width: 28%; }
  .m-value { font-weight: 700; width: 18%; white-space: nowrap; }
  .m-meaning { color: #4b5563; }
  .action { margin-top: 10px; background: #eef6f1; border: 1px solid #cfe6da; border-radius: 6px; padding: 12px 14px; }
  .notes { margin-top: 10px; white-space: pre-wrap; background: #faf9f7; border: 1px solid #e7e5e1; border-radius: 6px; padding: 12px 14px; }
  .footer { margin-top: 28px; border-top: 1px solid #d1d5db; padding-top: 10px; font-size: 9.5px; color: #9ca3af; }
  .print-bar { position: fixed; top: 12px; right: 12px; }
  .print-bar button { font: inherit; font-size: 12px; padding: 8px 16px; border-radius: 999px; border: 0; background: #1a1a1a; color: #fff; cursor: pointer; }
  @media print { .print-bar { display: none; } }
</style>
</head>
<body>
  <div class="print-bar"><button onclick="window.print()">Print / Save as PDF</button></div>

  <div class="header">
    <img src="/img/high-resolution-color-logo.png" alt="" />
    <div class="titles">
      <p class="eyebrow">COPD Care-Gap Planning Report</p>
      <h1>${escapeHtml(s.name)}</h1>
    </div>
  </div>

  <div class="meta">
    <div><div class="k">Region</div>${escapeHtml(geographyLabel(s))}</div>
    <div><div class="k">Capability assessed</div>${escapeHtml(capabilityLabel(s.capability))}</div>
    <div><div class="k">Report generated</div>${escapeHtml(generated)}</div>
    <div><div class="k">Scenario last updated</div>${escapeHtml(new Date(s.updated_at).toLocaleDateString())}</div>
  </div>

  <div class="verdict">
    <h2>${escapeHtml(verdict.headline)}</h2>
    <p>${escapeHtml(verdict.body)}</p>
  </div>

  <h3>What the data shows</h3>
  <table>
    <thead><tr><th>Indicator</th><th>Value</th><th>What it means</th></tr></thead>
    <tbody>${metricsHtml}</tbody>
  </table>

  ${action ? `<h3>Recommended action</h3><div class="action">${escapeHtml(action)}</div>` : ''}

  ${s.notes ? `<h3>Coordinator notes</h3><div class="notes">${escapeHtml(s.notes)}</div>` : ''}

  <div class="footer">
    Generated by the COPD Care-Gap Planner${s.snapshot?.methodology_version ? ` · Methodology ${escapeHtml(s.snapshot.methodology_version)}` : ''}.
    Scores are planning proxies derived from facility records and NFHS-5 indicators, not measured COPD prevalence.
    Treat low-confidence regions as data-poor (verify first) rather than confirmed gaps.
  </div>

  <script>
    window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 350); });
  </script>
</body>
</html>`;
}

export function exportScenarioPdf(s: Scenario): void {
  const html = buildReportHtml(s);
  const win = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1000');
  if (!win) {
    // Popup blocked — fall back to a downloadable HTML file the user can print.
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${s.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-copd-report.html`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
