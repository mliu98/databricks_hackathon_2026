// Lakebase persistence for saved planning scenarios.
// A scenario captures a planner's chosen capability + geography and a snapshot
// of the trust-weighted evidence they were looking at, so work can be saved,
// revisited, and revised.
import { z } from 'zod';
import { Application, Request } from 'express';

interface AppKitWithLakebase {
  lakebase: {
    query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  };
  server: {
    extend(fn: (app: Application) => void): void;
  };
}

const SETUP_SCHEMA_SQL = `CREATE SCHEMA IF NOT EXISTS planner`;

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS planner.scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    capability TEXT NOT NULL DEFAULT 'all',
    geography_state TEXT NOT NULL DEFAULT 'all',
    geography_district TEXT NOT NULL DEFAULT 'all',
    notes TEXT NOT NULL DEFAULT '',
    snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by TEXT NOT NULL DEFAULT 'unknown',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

const SELECT_COLS = `id, name, capability, geography_state, geography_district, notes, snapshot, created_by, created_at, updated_at`;

const ScenarioBody = z.object({
  name: z.string().min(1).max(200),
  capability: z.string().min(1).max(120).default('all'),
  geography_state: z.string().min(1).max(120).default('all'),
  geography_district: z.string().min(1).max(120).default('all'),
  notes: z.string().max(5000).default(''),
  snapshot: z.record(z.string(), z.unknown()).default({}),
});

const ScenarioPatch = ScenarioBody.partial();

// The Databricks Apps proxy injects the signed-in user's email. Fall back to a
// stable dev identity for local development.
function currentUser(req: Request): string {
  return req.header('x-forwarded-email') ?? 'local-dev@databricks';
}

export async function setupScenarioRoutes(appkit: AppKitWithLakebase) {
  try {
    await appkit.lakebase.query(SETUP_SCHEMA_SQL);
    await appkit.lakebase.query(CREATE_TABLE_SQL);
    console.log('[lakebase] planner.scenarios ready');
  } catch (err) {
    console.warn('[lakebase] schema setup failed:', (err as Error).message);
    console.warn('[lakebase] routes registered but may error until the app is deployed (SP must own the schema)');
  }

  appkit.server.extend((app) => {
    // List the current user's saved scenarios (most recent first).
    app.get('/api/scenarios', async (req, res) => {
      try {
        const { rows } = await appkit.lakebase.query(
          `SELECT ${SELECT_COLS} FROM planner.scenarios WHERE created_by = $1 ORDER BY updated_at DESC`,
          [currentUser(req)],
        );
        res.json(rows);
      } catch (err) {
        console.error('Failed to list scenarios:', err);
        res.status(500).json({ error: 'Failed to list scenarios' });
      }
    });

    // Fetch a single scenario.
    app.get('/api/scenarios/:id', async (req, res) => {
      try {
        const { rows } = await appkit.lakebase.query(
          `SELECT ${SELECT_COLS} FROM planner.scenarios WHERE id = $1 AND created_by = $2`,
          [req.params.id, currentUser(req)],
        );
        if (rows.length === 0) { res.status(404).json({ error: 'Scenario not found' }); return; }
        res.json(rows[0]);
      } catch (err) {
        console.error('Failed to get scenario:', err);
        res.status(500).json({ error: 'Failed to get scenario' });
      }
    });

    // Save a new planning scenario.
    app.post('/api/scenarios', async (req, res) => {
      const parsed = ScenarioBody.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Invalid scenario', details: parsed.error.issues }); return; }
      const s = parsed.data;
      try {
        const { rows } = await appkit.lakebase.query(
          `INSERT INTO planner.scenarios (name, capability, geography_state, geography_district, notes, snapshot, created_by)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
           RETURNING ${SELECT_COLS}`,
          [s.name, s.capability, s.geography_state, s.geography_district, s.notes, JSON.stringify(s.snapshot), currentUser(req)],
        );
        res.status(201).json(rows[0]);
      } catch (err) {
        console.error('Failed to create scenario:', err);
        res.status(500).json({ error: 'Failed to create scenario' });
      }
    });

    // Revise an existing scenario (any subset of fields).
    app.patch('/api/scenarios/:id', async (req, res) => {
      const parsed = ScenarioPatch.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Invalid update', details: parsed.error.issues }); return; }
      const p = parsed.data;
      try {
        const { rows } = await appkit.lakebase.query(
          `UPDATE planner.scenarios SET
             name = COALESCE($1, name),
             capability = COALESCE($2, capability),
             geography_state = COALESCE($3, geography_state),
             geography_district = COALESCE($4, geography_district),
             notes = COALESCE($5, notes),
             snapshot = COALESCE($6::jsonb, snapshot),
             updated_at = NOW()
           WHERE id = $7 AND created_by = $8
           RETURNING ${SELECT_COLS}`,
          [
            p.name ?? null,
            p.capability ?? null,
            p.geography_state ?? null,
            p.geography_district ?? null,
            p.notes ?? null,
            p.snapshot ? JSON.stringify(p.snapshot) : null,
            req.params.id,
            currentUser(req),
          ],
        );
        if (rows.length === 0) { res.status(404).json({ error: 'Scenario not found' }); return; }
        res.json(rows[0]);
      } catch (err) {
        console.error('Failed to update scenario:', err);
        res.status(500).json({ error: 'Failed to update scenario' });
      }
    });

    // Delete a scenario.
    app.delete('/api/scenarios/:id', async (req, res) => {
      try {
        const { rows } = await appkit.lakebase.query(
          `DELETE FROM planner.scenarios WHERE id = $1 AND created_by = $2 RETURNING id`,
          [req.params.id, currentUser(req)],
        );
        if (rows.length === 0) { res.status(404).json({ error: 'Scenario not found' }); return; }
        res.status(204).send();
      } catch (err) {
        console.error('Failed to delete scenario:', err);
        res.status(500).json({ error: 'Failed to delete scenario' });
      }
    });
  });
}
