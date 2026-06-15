import { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Skeleton,
  Alert,
  AlertDescription,
  Empty,
} from '@databricks/appkit-ui/react';
import { Trash2, MapPin, RefreshCw } from 'lucide-react';
import { listScenarios, deleteScenario, type Scenario } from '../lib/scenarios';
import { pct } from '../components/StatBits';
import { EditScenarioDialog } from '../components/EditScenarioDialog';
import { formatFixed, formatNumber } from '../lib/numbers';

export function ScenariosPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  function refresh() {
    setLoading(true);
    listScenarios()
      .then(setScenarios)
      .then(() => setError(null))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load scenarios'))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  async function remove(id: string) {
    setDeleting(id);
    try {
      await deleteScenario(id);
      setScenarios((s) => s.filter((x) => x.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete scenario');
    } finally {
      setDeleting(null);
    }
  }

  function replaceScenario(updated: Scenario) {
    setScenarios((current) => current.map((scenario) => (scenario.id === updated.id ? updated : scenario)));
  }

  const geoLabel = (s: Scenario) =>
    s.geography_district !== 'all'
      ? `${s.geography_district}, ${s.geography_state}`
      : s.geography_state === 'all'
        ? 'All India'
        : s.geography_state;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Saved planning scenarios</h2>
          <p className="text-sm text-muted-foreground">Persisted in Lakebase Postgres — revisit and revise your work.</p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : scenarios.length === 0 ? (
        <Empty>No saved scenarios yet. Drill into a region on the Planner and save one.</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {scenarios.map((s) => (
            <Card key={s.id}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div className="min-w-0">
                  <CardTitle className="truncate text-base">{s.name}</CardTitle>
                  <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" /> {geoLabel(s)}
                  </div>
                </div>
                <div className="flex items-center">
                  <EditScenarioDialog scenario={s} onUpdated={replaceScenario} />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void remove(s.id)}
                    disabled={deleting === s.id}
                    aria-label={`Delete ${s.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{s.capability === 'all' ? 'All capabilities' : s.capability}</Badge>
                  {s.snapshot?.n_facilities != null && (
                    <Badge variant="outline">{formatNumber(s.snapshot.n_facilities)} facilities</Badge>
                  )}
                  {s.snapshot?.gap_score != null && (
                    <Badge variant="outline">worst gap {formatFixed(s.snapshot.gap_score)}</Badge>
                  )}
                  {s.snapshot?.copd_risk_score != null && (
                    <Badge variant="outline">COPD risk {formatFixed(s.snapshot.copd_risk_score)}</Badge>
                  )}
                  {s.snapshot?.clean_fuel_pct != null && (
                    <Badge variant="outline">clean fuel {pct(s.snapshot.clean_fuel_pct)}</Badge>
                  )}
                  {s.snapshot?.adult_tobacco_pct != null && (
                    <Badge variant="outline">adult tobacco {pct(s.snapshot.adult_tobacco_pct)}</Badge>
                  )}
                </div>
                {s.notes && <p className="text-sm text-muted-foreground">{s.notes}</p>}
                <p className="text-xs text-muted-foreground">
                  Saved {new Date(s.updated_at).toLocaleString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
