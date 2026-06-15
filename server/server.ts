import { createApp, genie, lakebase, server } from '@databricks/appkit';
import { setupFacilityRoutes } from './routes/facility-routes';
import { setupGapRoutes } from './routes/gap-routes';
import { setupHealthRoutes } from './routes/health-routes';

await createApp({
  plugins: [lakebase(), server(), genie()],
  async onPluginsReady(appkit) {
    await appkit.lakebase.query(`
      CREATE SCHEMA IF NOT EXISTS app_data;

      CREATE TABLE IF NOT EXISTS app_data.facility_edits (
        unique_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        facility_type_id TEXT,
        operator_type_id TEXT,
        address_city TEXT,
        address_state_or_region TEXT,
        official_phone TEXT,
        official_website TEXT,
        specialties TEXT,
        capability TEXT,
        doctors TEXT,
        latitude TEXT,
        longitude TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by TEXT NOT NULL,
        update_note TEXT
      );

      CREATE TABLE IF NOT EXISTS app_data.facility_audit_log (
        id BIGSERIAL PRIMARY KEY,
        facility_unique_id TEXT NOT NULL,
        changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        changed_by TEXT NOT NULL,
        change_note TEXT,
        changed_fields TEXT[] NOT NULL,
        old_values JSONB NOT NULL,
        new_values JSONB NOT NULL
      );

      CREATE INDEX IF NOT EXISTS facility_audit_log_facility_changed_idx
        ON app_data.facility_audit_log (facility_unique_id, changed_at DESC);
    `);

    setupGapRoutes(appkit);
    setupFacilityRoutes(appkit);
    setupHealthRoutes(appkit);
  },
}).catch(console.error);
