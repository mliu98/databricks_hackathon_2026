import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@databricks/appkit-ui/react';
import { Eye, FileDown, MapPin } from 'lucide-react';
import type { Scenario } from '../lib/scenarios';
import {
  capabilityLabel,
  exportScenarioPdf,
  geographyLabel,
  metricRows,
  plainVerdict,
} from '../lib/scenarioReport';

const TONE_STYLES: Record<string, string> = {
  gap: 'border-destructive/40 bg-destructive/10 text-destructive',
  verify: 'border-warning/40 bg-warning/10 text-warning',
  ok: 'border-success/40 bg-success/10 text-success',
};

export function ViewScenarioDialog({ scenario }: { scenario: Scenario }) {
  const [open, setOpen] = useState(false);
  const verdict = plainVerdict(scenario);
  const rows = metricRows(scenario);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`View ${scenario.name}`}>
          <Eye className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">{scenario.name}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {geographyLabel(scenario)}
            </span>
            <span>·</span>
            <span>{capabilityLabel(scenario.capability)}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Plain-language verdict */}
          <div className={`rounded-xl border p-4 ${TONE_STYLES[verdict.tone] ?? 'border-border bg-muted'}`}>
            <p className="text-sm font-semibold">{verdict.headline}</p>
            <p className="mt-1 text-sm text-foreground/80">{verdict.body}</p>
          </div>

          {/* Results */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              What the data shows
            </h3>
            <div className="divide-y divide-border rounded-xl border">
              {rows.map((r) => (
                <div key={r.label} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 px-4 py-3">
                  <span className="text-sm font-medium text-foreground">{r.label}</span>
                  <span className="text-sm font-bold tabular-nums text-foreground">{r.value}</span>
                  <span className="col-span-2 text-xs text-muted-foreground">{r.meaning}</span>
                </div>
              ))}
            </div>
          </div>

          {scenario.snapshot?.recommended_action && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Recommended action
              </h3>
              <p className="rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-foreground">
                {scenario.snapshot.recommended_action}
              </p>
            </div>
          )}

          {scenario.notes && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Coordinator notes
              </h3>
              <p className="whitespace-pre-wrap rounded-xl border bg-muted/40 p-3 text-sm text-foreground">
                {scenario.notes}
              </p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Saved {new Date(scenario.updated_at).toLocaleString()}
            {scenario.snapshot?.methodology_version ? ` · Methodology ${scenario.snapshot.methodology_version}` : ''}
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button className="gap-2" onClick={() => exportScenarioPdf(scenario)}>
            <FileDown className="h-4 w-4" /> Export PDF report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
