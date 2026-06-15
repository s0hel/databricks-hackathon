import { createApp, genie, lakebase, server } from '@databricks/appkit';
import { setupFacilityRoutes } from './routes/facility-routes';
import { setupGapRoutes } from './routes/gap-routes';
import { setupHealthRoutes } from './routes/health-routes';

createApp({
  plugins: [
    lakebase(),
    server(),
    genie(),
  ],
  onPluginsReady(appkit) {
    setupGapRoutes(appkit);
    setupFacilityRoutes(appkit);
    setupHealthRoutes(appkit);
  },
}).catch(console.error);
