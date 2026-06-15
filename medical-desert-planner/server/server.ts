import { createApp, analytics, lakebase, server } from '@databricks/appkit';
import { setupScenarioRoutes } from './routes/scenarios/scenario-routes';

createApp({
  plugins: [
    analytics(),
    lakebase(),
    server(),
  ],
  async onPluginsReady(appkit) {
    await setupScenarioRoutes(appkit);
  },
}).catch(console.error);
