import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Button,
  Input,
  Textarea,
  Label,
  Alert,
  AlertDescription,
} from '@databricks/appkit-ui/react';
import { Bookmark } from 'lucide-react';
import { createScenario, type ScenarioInput, type ScenarioSnapshot } from '../lib/scenarios';

interface Props {
  capability: string;
  state: string;
  district: string;
  snapshot: ScenarioSnapshot;
  onSaved?: () => void;
  initialName?: string;
  initialNotes?: string;
  triggerLabel?: string;
  triggerVariant?: 'default' | 'outline' | 'secondary' | 'ghost';
}

export function SaveScenarioDialog({
  capability,
  state,
  district,
  snapshot,
  onSaved,
  initialName = '',
  initialNotes = '',
  triggerLabel = 'Save planning scenario',
  triggerVariant = 'default',
}: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const geoLabel = district !== 'all' ? `${district}, ${state}` : state === 'all' ? 'All India' : state;
  const capLabel = capability === 'all' ? 'All capabilities' : capability;

  function setDialogOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setName(initialName);
      setNotes(initialNotes);
      setError(null);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    const input: ScenarioInput = {
      name: name.trim() || `${capLabel} — ${geoLabel}`,
      capability,
      geography_state: state,
      geography_district: district,
      notes: notes.trim(),
      snapshot,
    };
    try {
      await createScenario(input);
      setOpen(false);
      setName('');
      setNotes('');
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save scenario');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={triggerVariant} className="gap-2">
          <Bookmark className="h-4 w-4" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save planning scenario</DialogTitle>
          <DialogDescription>
            Capturing <span className="font-medium text-foreground">{capLabel}</span> across{' '}
            <span className="font-medium text-foreground">{geoLabel}</span> with the current evidence snapshot.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="scenario-name">Scenario name</Label>
            <Input
              id="scenario-name"
              placeholder={`${capLabel} — ${geoLabel}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="scenario-notes">Planning notes</Label>
            <Textarea
              id="scenario-notes"
              placeholder="Why this region? What action is being considered?"
              value={notes}
              rows={3}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save scenario'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
