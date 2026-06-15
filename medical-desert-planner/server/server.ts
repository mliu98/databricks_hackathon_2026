import { createApp, analytics, genie, lakebase, server } from '@databricks/appkit';
import { setupScenarioRoutes } from './routes/scenarios/scenario-routes';

createApp({
  plugins: [
    analytics(),
    // Reads DATABRICKS_GENIE_SPACE_ID and registers it under the `default` alias.
    genie(),
    lakebase(),
    server(),
  ],
  async onPluginsReady(appkit) {
    await setupScenarioRoutes(appkit);
  },
}).catch(console.error);
