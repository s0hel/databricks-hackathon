import { createApp, lakebase, server } from '@databricks/appkit';
import { setupFacilityRoutes } from './routes/facility-routes';
import { setupHealthRoutes } from './routes/health-routes';

createApp({
  plugins: [
    lakebase(),
    server(),
  ],
  onPluginsReady(appkit) {
    setupFacilityRoutes(appkit);
    setupHealthRoutes(appkit);
  },
}).catch(console.error);
