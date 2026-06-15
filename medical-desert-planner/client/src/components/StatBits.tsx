import { Card, CardContent } from '@databricks/appkit-ui/react';
import { formatFixed, toFiniteNumber } from '../lib/numbers';

// Small presentational helpers shared across the planner. Semantic meaning is
// always carried by a design token (var(--success) etc.), never a raw color.

export function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

const CONFIDENCE_TOKEN: Record<string, string> = {
  high: 'var(--success)',
  medium: 'var(--warning)',
  low: 'var(--destructive)',
};

export function ConfidenceBadge({ level }: { level: string }) {
  const token = CONFIDENCE_TOKEN[level] ?? 'var(--muted-foreground)';
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ color: token, backgroundColor: `color-mix(in oklch, ${token} 14%, transparent)` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: token }} />
      {level} confidence
    </span>
  );
}

export function GapPill({ score }: { score: number | string | null | undefined }) {
  if (score == null || score === '') {
    return <span className="text-xs text-muted-foreground">not measured</span>;
  }
  // Higher gap => more concerning => closer to destructive.
  const numericScore = toFiniteNumber(score);
  const ratio = Math.min(Math.max(numericScore, 0) / 50, 1);
  const token = ratio > 0.66 ? 'var(--destructive)' : ratio > 0.33 ? 'var(--warning)' : 'var(--success)';
  return (
    <span
      className="inline-flex min-w-12 justify-center rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums"
      style={{ color: token, backgroundColor: `color-mix(in oklch, ${token} 14%, transparent)` }}
    >
      {formatFixed(numericScore)}
    </span>
  );
}

export function pct(value: unknown): string {
  if (value == null || value === '') return '—';
  const numericValue = toFiniteNumber(value, Number.NaN);
  return Number.isNaN(numericValue) ? '—' : `${formatFixed(numericValue, 1)}%`;
}
