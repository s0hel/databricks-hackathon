import express, { Application, Request } from 'express';
import { z } from 'zod';
import { editableFacilityFields, effectiveFacilitiesCte } from '../lib/facility-edits';

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

const NullableText = z.string().trim().max(8000).nullable();

const FacilityEditBody = z.object({
  name: z.string().trim().min(1).max(500),
  description: NullableText,
  facility_type_id: z.string().trim().max(120).nullable(),
  operator_type_id: z.string().trim().max(120).nullable(),
  address_city: z.string().trim().max(180).nullable(),
  address_state_or_region: z.string().trim().max(180).nullable(),
  official_phone: z.string().trim().max(120).nullable(),
  official_website: z.string().trim().max(500).nullable(),
  specialties: NullableText,
  capability: NullableText,
  doctors: NullableText,
  latitude: z.string().trim().max(80).nullable(),
  longitude: z.string().trim().max(80).nullable(),
  note: z.string().trim().max(1000).optional().default(''),
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
  doctors,
  latitude,
  longitude
`;

const normalizeEditValue = (value: string | null) => {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' || trimmed.toLowerCase() === 'null' ? null : trimmed;
};

const getActor = (req: Request) =>
  req.get('x-forwarded-user') ?? req.get('x-databricks-user') ?? req.get('x-forwarded-email') ?? 'unknown-user';

export function setupFacilityRoutes(appkit: AppKitWithLakebase) {
  appkit.server.extend((app) => {
    app.use(express.json({ limit: '1mb' }));

    app.get('/api/facilities/overview', async (_req, res) => {
      try {
        const result = await appkit.lakebase.query(`
          WITH ${effectiveFacilitiesCte}
          SELECT
            COUNT(*)::int AS facility_count,
            COUNT(DISTINCT NULLIF(address_state_or_region, 'null'))::int AS state_count,
            COUNT(*) FILTER (WHERE NULLIF(facility_type_id, 'null') = 'hospital')::int AS hospital_count,
            COUNT(*) FILTER (WHERE NULLIF(facility_type_id, 'null') = 'clinic')::int AS clinic_count
          FROM effective_facilities
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
            WITH ${effectiveFacilitiesCte}
            SELECT
              NULLIF(address_state_or_region, 'null') AS value,
              COUNT(*)::int AS facility_count
            FROM effective_facilities
            WHERE NULLIF(address_state_or_region, 'null') IS NOT NULL
            GROUP BY 1
            ORDER BY facility_count DESC, value
            LIMIT 100
          `),
          appkit.lakebase.query(`
            WITH ${effectiveFacilitiesCte}
            SELECT
              NULLIF(facility_type_id, 'null') AS value,
              COUNT(*)::int AS facility_count
            FROM effective_facilities
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
            WITH ${effectiveFacilitiesCte}
            SELECT ${facilitySelect}
            FROM effective_facilities
            ${whereClause}
            ORDER BY
              NULLIF(address_state_or_region, 'null') NULLS LAST,
              name NULLS LAST,
              unique_id
            LIMIT 60
          `,
          params
        );
        res.json(result.rows);
      } catch (err) {
        console.error('Failed to load facilities:', err);
        res.status(500).json({ error: 'Failed to load facilities' });
      }
    });

    app.get('/api/facilities/:id/audit', async (req, res) => {
      const id = z.string().trim().min(1).max(120).safeParse(req.params.id);
      if (!id.success) {
        res.status(400).json({ error: 'Invalid facility id' });
        return;
      }

      try {
        const result = await appkit.lakebase.query(
          `
            SELECT
              id,
              facility_unique_id,
              changed_at,
              changed_by,
              change_note,
              changed_fields,
              old_values,
              new_values
            FROM app_data.facility_audit_log
            WHERE facility_unique_id = $1
            ORDER BY changed_at DESC
            LIMIT 25
          `,
          [id.data]
        );
        res.json(result.rows);
      } catch (err) {
        console.error('Failed to load facility audit log:', err);
        res.status(500).json({ error: 'Failed to load facility audit log' });
      }
    });

    app.put('/api/facilities/:id', async (req, res) => {
      const id = z.string().trim().min(1).max(120).safeParse(req.params.id);
      const parsed = FacilityEditBody.safeParse(req.body);
      if (!id.success || !parsed.success) {
        res.status(400).json({ error: 'Invalid facility update' });
        return;
      }

      const facilityId = id.data;
      const actor = getActor(req);
      const note = parsed.data.note.trim() || null;
      const nextValues = Object.fromEntries(
        editableFacilityFields.map((field) => [
          field,
          field === 'name' ? parsed.data.name.trim() : normalizeEditValue(parsed.data[field]),
        ])
      ) as Record<(typeof editableFacilityFields)[number], string | null>;

      try {
        const currentResult = await appkit.lakebase.query(
          `
            WITH ${effectiveFacilitiesCte}
            SELECT ${facilitySelect}
            FROM effective_facilities
            WHERE unique_id = $1
            LIMIT 1
          `,
          [facilityId]
        );

        const current = currentResult.rows[0];
        if (!current) {
          res.status(404).json({ error: 'Facility not found' });
          return;
        }

        const changedFields = editableFacilityFields.filter((field) => {
          const rawValue = current[field];
          const before =
            typeof rawValue === 'string' || typeof rawValue === 'number' ? normalizeEditValue(`${rawValue}`) : null;
          const after = nextValues[field];
          return before !== after;
        });

        if (changedFields.length === 0) {
          res.json({ facility: current, audit: null });
          return;
        }

        const values = editableFacilityFields.map((field) => nextValues[field]);
        const insertColumns = editableFacilityFields.join(', ');
        const insertPlaceholders = editableFacilityFields.map((_, index) => `$${index + 2}`).join(', ');
        const updateAssignments = editableFacilityFields.map((field) => `${field} = EXCLUDED.${field}`).join(', ');

        const updatedResult = await appkit.lakebase.query(
          `
            WITH saved AS (
              INSERT INTO app_data.facility_edits (
                unique_id,
                ${insertColumns},
                updated_by,
                update_note
              )
              VALUES (
                $1,
                ${insertPlaceholders},
                $${editableFacilityFields.length + 2},
                $${editableFacilityFields.length + 3}
              )
              ON CONFLICT (unique_id) DO UPDATE SET
                ${updateAssignments},
                updated_at = NOW(),
                updated_by = EXCLUDED.updated_by,
                update_note = EXCLUDED.update_note
              RETURNING *
            ),
            audit AS (
              INSERT INTO app_data.facility_audit_log (
                facility_unique_id,
                changed_by,
                change_note,
                changed_fields,
                old_values,
                new_values
              )
              VALUES (
                $1,
                $${editableFacilityFields.length + 2},
                $${editableFacilityFields.length + 3},
                $${editableFacilityFields.length + 4}::text[],
                $${editableFacilityFields.length + 5}::jsonb,
                $${editableFacilityFields.length + 6}::jsonb
              )
              RETURNING id, changed_at
            )
            SELECT ${facilitySelect}
            FROM saved
            LIMIT 1
          `,
          [facilityId, ...values, actor, note, changedFields, JSON.stringify(current), JSON.stringify(nextValues)]
        );

        res.json({ facility: updatedResult.rows[0], audit: { changed_fields: changedFields } });
      } catch (err) {
        console.error('Failed to update facility:', err);
        res.status(500).json({ error: 'Failed to update facility' });
      }
    });
  });
}
