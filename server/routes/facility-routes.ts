import { Application } from 'express';
import { z } from 'zod';

interface AppKitWithLakebase {
  lakebase: {
    query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  };
  server: {
    extend(fn: (app: Application) => void): void;
  };
}

const FacilityQuery = z.object({
  q: z.string().trim().max(120).optional().default(''),
  state: z.string().trim().max(120).optional().default(''),
  type: z.string().trim().max(80).optional().default(''),
});

const facilitySelect = `
  unique_id,
  name,
  description,
  facility_type_id,
  operator_type_id,
  address_city,
  address_state_or_region,
  official_phone,
  official_website,
  specialties,
  capability,
  latitude,
  longitude
`;

export function setupFacilityRoutes(appkit: AppKitWithLakebase) {
  appkit.server.extend((app) => {
    app.get('/api/facilities/overview', async (_req, res) => {
      try {
        const result = await appkit.lakebase.query(`
          SELECT
            COUNT(*)::int AS facility_count,
            COUNT(DISTINCT NULLIF(address_state_or_region, 'null'))::int AS state_count,
            COUNT(*) FILTER (WHERE NULLIF(facility_type_id, 'null') = 'hospital')::int AS hospital_count,
            COUNT(*) FILTER (WHERE NULLIF(facility_type_id, 'null') = 'clinic')::int AS clinic_count
          FROM public.facilities
        `);
        res.json(result.rows[0]);
      } catch (err) {
        console.error('Failed to load facility overview:', err);
        res.status(500).json({ error: 'Failed to load facility overview' });
      }
    });

    app.get('/api/facilities/options', async (_req, res) => {
      try {
        const [statesResult, typesResult] = await Promise.all([
          appkit.lakebase.query(`
            SELECT
              NULLIF(address_state_or_region, 'null') AS value,
              COUNT(*)::int AS facility_count
            FROM public.facilities
            WHERE NULLIF(address_state_or_region, 'null') IS NOT NULL
            GROUP BY 1
            ORDER BY facility_count DESC, value
            LIMIT 100
          `),
          appkit.lakebase.query(`
            SELECT
              NULLIF(facility_type_id, 'null') AS value,
              COUNT(*)::int AS facility_count
            FROM public.facilities
            WHERE NULLIF(facility_type_id, 'null') IS NOT NULL
            GROUP BY 1
            ORDER BY facility_count DESC, value
            LIMIT 20
          `),
        ]);

        res.json({
          states: statesResult.rows,
          types: typesResult.rows,
        });
      } catch (err) {
        console.error('Failed to load facility options:', err);
        res.status(500).json({ error: 'Failed to load facility options' });
      }
    });

    app.get('/api/facilities/search', async (req, res) => {
      const parsed = FacilityQuery.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid filters' });
        return;
      }

      const filters: string[] = [];
      const params: string[] = [];
      const { q, state, type } = parsed.data;

      if (q) {
        params.push(`%${q}%`);
        filters.push(`
          (
            name ILIKE $${params.length}
            OR COALESCE(description, '') ILIKE $${params.length}
            OR COALESCE(address_city, '') ILIKE $${params.length}
            OR COALESCE(address_state_or_region, '') ILIKE $${params.length}
            OR COALESCE(specialties, '') ILIKE $${params.length}
          )
        `);
      }

      if (state) {
        params.push(state);
        filters.push(`NULLIF(address_state_or_region, 'null') = $${params.length}`);
      }

      if (type) {
        params.push(type);
        filters.push(`NULLIF(facility_type_id, 'null') = $${params.length}`);
      }

      const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

      try {
        const result = await appkit.lakebase.query(
          `
            SELECT ${facilitySelect}
            FROM public.facilities
            ${whereClause}
            ORDER BY
              NULLIF(address_state_or_region, 'null') NULLS LAST,
              name NULLS LAST,
              unique_id
            LIMIT 60
          `,
          params,
        );
        res.json(result.rows);
      } catch (err) {
        console.error('Failed to load facilities:', err);
        res.status(500).json({ error: 'Failed to load facilities' });
      }
    });
  });
}
