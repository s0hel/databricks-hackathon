import { createApp, lakebase, server } from '@databricks/appkit';
import { setupHealthRoutes } from './routes/health-routes';

createApp({
  plugins: [
    lakebase(),
    server(),
  ],
  onPluginsReady(appkit) {
    setupHealthRoutes(appkit);
  },
}).catch(console.error);
