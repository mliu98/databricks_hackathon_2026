import { useEffect, useState } from 'react';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Textarea,
} from '@databricks/appkit-ui/react';
import { Pencil } from 'lucide-react';
import { updateScenario, type Scenario } from '../lib/scenarios';

interface Props {
  scenario: Scenario;
  onUpdated: (scenario: Scenario) => void;
}

export function EditScenarioDialog({ scenario, onUpdated }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(scenario.name);
  const [notes, setNotes] = useState(scenario.notes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName(scenario.name);
      setNotes(scenario.notes);
      setError(null);
    }
  }, [open, scenario.name, scenario.notes]);

  async function save() {
    if (!name.trim()) {
      setError('Scenario name is required.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updated = await updateScenario(scenario.id, {
        name: name.trim(),
        notes: notes.trim(),
      });
      onUpdated(updated);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update scenario');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Edit ${scenario.name}`}>
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revise planning scenario</DialogTitle>
          <DialogDescription>
            Update the scenario title and planning notes. Its saved evidence snapshot stays unchanged.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor={`scenario-name-${scenario.id}`}>Scenario name</Label>
            <Input
              id={`scenario-name-${scenario.id}`}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`scenario-notes-${scenario.id}`}>Planning notes</Label>
            <Textarea
              id={`scenario-notes-${scenario.id}`}
              value={notes}
              rows={4}
              onChange={(event) => setNotes(event.target.value)}
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
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
