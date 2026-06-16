import express, { Application, Request } from 'express';
import { z } from 'zod';
import {
  CapabilityId,
  capabilityTaxonomy,
  getCapabilityLabel,
  getCapabilitySearchTerms,
  inferCapabilityFromText,
  scoreFacilityCapabilities,
} from '../lib/capability-trust';
import {
  editableFacilityFields,
  effectiveFacilitiesCte,
  enrichedFacilitiesCte,
  normalizedGeoExpression,
} from '../lib/facility-edits';

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
  capability: z.enum(capabilityTaxonomy).optional(),
});

const ShortlistQuery = z.object({
  q: z.string().trim().min(1).max(180),
  capability: z.enum(capabilityTaxonomy).optional(),
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

const coordinateColumn = (column: string) => `
  CASE
    WHEN NULLIF(${column}::text, 'null') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN ${column}::text::float
  END
`;

const enrichedFacilitySelect = `
  unique_id,
  name,
  description,
  facility_type_id,
  operator_type_id,
  COALESCE(normalized_district_name, address_city) AS address_city,
  COALESCE(normalized_state_name, address_state_or_region) AS address_state_or_region,
  official_phone,
  official_website,
  specialties,
  capability,
  doctors,
  latitude,
  longitude
`;

const shortlistFacilitySelect = `
  ef.unique_id,
  ef.name,
  ef.description,
  ef.facility_type_id,
  ef.operator_type_id,
  COALESCE(ef.normalized_district_name, ef.address_city) AS address_city,
  COALESCE(ef.normalized_state_name, ef.address_state_or_region) AS address_state_or_region,
  ef.official_phone,
  ef.official_website,
  ef.specialties,
  ef.capability,
  ef.doctors,
  ef.latitude,
  ef.longitude
`;

const normalizeEditValue = (value: string | null) => {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' || trimmed.toLowerCase() === 'null' ? null : trimmed;
};

const getActor = (req: Request) =>
  req.get('x-forwarded-user') ?? req.get('x-databricks-user') ?? req.get('x-forwarded-email') ?? 'unknown-user';

const withCapabilityTrust = (row: Record<string, unknown>) => ({
  ...row,
  capability_trust_signals: scoreFacilityCapabilities(row),
});

const parseShortlistQuery = (rawQuery: string, requestedCapability?: CapabilityId) => {
  const normalized = rawQuery.replace(/\s+/g, ' ').trim();
  const nearMatch = normalized.match(/^(.+?)\s+(?:near|in|around|at)\s+(.+)$/i);
  const careNeed = (nearMatch ? nearMatch[1] : normalized).trim();
  const location = (nearMatch ? nearMatch[2] : '').trim();
  const capability = requestedCapability ?? inferCapabilityFromText(careNeed);

  return {
    raw_query: normalized,
    care_need: careNeed,
    location,
    capability,
    capability_label: capability ? getCapabilityLabel(capability) : null,
  };
};

const trustRank: Record<string, number> = {
  'strong evidence': 40,
  'partial evidence': 26,
  'weak or suspicious evidence': 10,
  'no claim': 0,
};

const scoreShortlistFacility = (row: Record<string, unknown>, capability: CapabilityId | null) => {
  const capabilitySignals = scoreFacilityCapabilities(row);
  const selectedSignal = capability
    ? capabilitySignals.find((signal) => signal.capability === capability)
    : [...capabilitySignals].sort((a, b) => b.score - a.score)[0];
  const distanceKm = typeof row.distance_km === 'number' ? row.distance_km : Number(row.distance_km);
  const distanceScore = Number.isFinite(distanceKm) ? Math.max(0, 35 - Math.min(distanceKm, 175) / 5) : 8;
  const contactScore = row.official_phone || row.official_website ? 12 : 0;
  const completenessScore = [row.description, row.specialties, row.capability, row.latitude, row.longitude].filter(
    Boolean
  ).length;
  const capabilityScore = selectedSignal ? trustRank[selectedSignal.signal] + selectedSignal.score * 2 : 0;

  return {
    ...row,
    distance_km: Number.isFinite(distanceKm) ? Math.round(distanceKm * 10) / 10 : null,
    capability_trust_signals: capabilitySignals,
    matched_capability: selectedSignal ?? null,
    shortlist_score: Math.round((capabilityScore + distanceScore + contactScore + completenessScore) * 10) / 10,
  };
};

export function setupFacilityRoutes(appkit: AppKitWithLakebase) {
  appkit.server.extend((app) => {
    app.use(express.json({ limit: '1mb' }));

    app.get('/api/facilities/overview', async (_req, res) => {
      try {
        const result = await appkit.lakebase.query(`
          WITH ${enrichedFacilitiesCte}
          SELECT
            COUNT(*)::int AS facility_count,
            COUNT(DISTINCT normalized_state_name)::int AS state_count,
            COUNT(*) FILTER (WHERE NULLIF(facility_type_id, 'null') = 'hospital')::int AS hospital_count,
            COUNT(*) FILTER (WHERE NULLIF(facility_type_id, 'null') = 'clinic')::int AS clinic_count
          FROM effective_facilities_enriched
        `);
        res.json(result.rows[0]);
      } catch (err) {
        console.error('Failed to load facility overview:', err);
        res.status(500).json({ error: 'Failed to load facility overview' });
      }
    });

    app.get('/api/facilities/data-quality', async (_req, res) => {
      try {
        const result = await appkit.lakebase.query(`
          WITH ${enrichedFacilitiesCte},
          ambiguous_districts AS (
            SELECT
              district_key,
              district_name,
              state_match_count
            FROM pincode_district_reference
            WHERE state_match_count > 1
          ),
          unmapped_facility_states AS (
            SELECT
              address_state_or_region AS raw_state,
              COUNT(*)::int AS facility_count
            FROM effective_facilities_enriched
            WHERE geography_quality = 'unmapped_state'
            GROUP BY 1
            ORDER BY facility_count DESC, raw_state
            LIMIT 12
          ),
          geography_quality_counts AS (
            SELECT
              geography_quality,
              COUNT(*)::int AS facility_count
            FROM effective_facilities_enriched
            GROUP BY 1
            ORDER BY facility_count DESC, geography_quality
          ),
          facility_type_issues AS (
            SELECT
              COUNT(*) FILTER (
                WHERE NULLIF(facility_type_id, 'null') IS NULL
              )::int AS missing_facility_type_count,
              COUNT(*) FILTER (
                WHERE LOWER(NULLIF(facility_type_id, 'null')) = 'farmacy'
              )::int AS farmacy_type_count
            FROM effective_facilities
          )
          SELECT
            (
              SELECT COUNT(DISTINCT ${normalizedGeoExpression('address_state_or_region::text')})::int
              FROM public.facilities
            ) AS raw_facility_state_distinct_count,
            COUNT(DISTINCT normalized_state_name)::int AS normalized_facility_state_distinct_count,
            COUNT(*) FILTER (WHERE geography_quality = 'unmapped_state')::int AS unmapped_facility_state_count,
            (SELECT COUNT(*)::int FROM ambiguous_districts) AS ambiguous_district_mapping_count,
            COUNT(*) FILTER (
              WHERE latitude IS NULL
                OR longitude IS NULL
                OR latitude::text = 'null'
                OR longitude::text = 'null'
            )::int AS missing_facility_coordinate_count,
            (
              SELECT COUNT(*)::int
              FROM public.pincode_directory
              WHERE latitude IS NULL
                OR longitude IS NULL
                OR latitude::text = 'null'
                OR longitude::text = 'null'
            ) AS missing_pincode_coordinate_count,
            (
              SELECT missing_facility_type_count
              FROM facility_type_issues
            ) AS missing_facility_type_count,
            (
              SELECT farmacy_type_count
              FROM facility_type_issues
            ) AS farmacy_type_count,
            (
              SELECT COALESCE(jsonb_agg(to_jsonb(u)), '[]'::jsonb)
              FROM unmapped_facility_states u
            ) AS unmapped_facility_state_samples,
            (
              SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.state_match_count DESC, a.district_name), '[]'::jsonb)
              FROM (
                SELECT *
                FROM ambiguous_districts
                ORDER BY state_match_count DESC, district_name
                LIMIT 12
              ) a
            ) AS ambiguous_district_samples,
            (
              SELECT COALESCE(jsonb_agg(to_jsonb(g)), '[]'::jsonb)
              FROM geography_quality_counts g
            ) AS geography_quality_counts
          FROM effective_facilities_enriched
        `);
        res.json(result.rows[0]);
      } catch (err) {
        console.error('Failed to load facility data quality diagnostics:', err);
        res.status(500).json({ error: 'Failed to load facility data quality diagnostics' });
      }
    });

    app.get('/api/facilities/options', async (_req, res) => {
      try {
        const result = await appkit.lakebase.query(`
            WITH ${enrichedFacilitiesCte}
            SELECT
              normalized_state_name AS value,
              COUNT(*)::int AS facility_count
            FROM effective_facilities_enriched
            WHERE normalized_state_name IS NOT NULL
            GROUP BY 1
            ORDER BY facility_count DESC, value
            LIMIT 100
          `);

        const typesResult = await appkit.lakebase.query(`
            WITH ${effectiveFacilitiesCte}
            SELECT
              NULLIF(facility_type_id, 'null') AS value,
              COUNT(*)::int AS facility_count
            FROM effective_facilities
            WHERE NULLIF(facility_type_id, 'null') IS NOT NULL
            GROUP BY 1
            ORDER BY facility_count DESC, value
            LIMIT 20
          `);

        res.json({
          states: result.rows,
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
      const { q, state, type, capability } = parsed.data;

      if (q) {
        params.push(`%${q}%`);
        filters.push(`
          (
            name ILIKE $${params.length}
            OR COALESCE(description, '') ILIKE $${params.length}
            OR COALESCE(address_city, '') ILIKE $${params.length}
            OR COALESCE(address_state_or_region, '') ILIKE $${params.length}
            OR COALESCE(normalized_district_name, '') ILIKE $${params.length}
            OR COALESCE(normalized_state_name, '') ILIKE $${params.length}
            OR COALESCE(specialties, '') ILIKE $${params.length}
          )
        `);
      }

      if (state) {
        params.push(state);
        filters.push(`normalized_state_name = $${params.length}`);
      }

      if (type) {
        params.push(type);
        filters.push(`NULLIF(facility_type_id, 'null') = $${params.length}`);
      }

      if (capability) {
        const capabilityFilters = getCapabilitySearchTerms(capability).map((term) => {
          params.push(`%${term}%`);
          const paramIndex = params.length;
          return `
            COALESCE(facility_type_id, '') ILIKE $${paramIndex}
            OR COALESCE(specialties, '') ILIKE $${paramIndex}
            OR COALESCE(capability, '') ILIKE $${paramIndex}
            OR COALESCE(description, '') ILIKE $${paramIndex}
            OR COALESCE(doctors, '') ILIKE $${paramIndex}
          `;
        });
        filters.push(`(${capabilityFilters.map((filter) => `(${filter})`).join(' OR ')})`);
      }

      const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

      try {
        const result = await appkit.lakebase.query(
          `
            WITH ${enrichedFacilitiesCte}
            SELECT ${enrichedFacilitySelect}
            FROM effective_facilities_enriched
            ${whereClause}
            ORDER BY
              normalized_state_name NULLS LAST,
              name NULLS LAST,
              unique_id
            LIMIT 60
          `,
          params
        );
        const rows = result.rows
          .map(withCapabilityTrust)
          .filter(
            (row) =>
              !capability ||
              row.capability_trust_signals.find((signal) => signal.capability === capability)?.signal !== 'no claim'
          );
        res.json(rows);
      } catch (err) {
        console.error('Failed to load facilities:', err);
        res.status(500).json({ error: 'Failed to load facilities' });
      }
    });

    app.get('/api/facilities/shortlist', async (req, res) => {
      const parsed = ShortlistQuery.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid shortlist query' });
        return;
      }

      const shortlistQuery = parseShortlistQuery(parsed.data.q, parsed.data.capability);
      const params: unknown[] = [shortlistQuery.location, `%${shortlistQuery.location}%`];
      const filters: string[] = ['latitude_num BETWEEN 6 AND 38', 'longitude_num BETWEEN 68 AND 98'];

      if (shortlistQuery.location) {
        filters.push(`
          (
            origin_latitude IS NULL
            OR distance_km <= 300
            OR normalized_district_name ILIKE $2
            OR normalized_state_name ILIKE $2
            OR address_city ILIKE $2
          )
        `);
      }

      if (shortlistQuery.capability) {
        const capabilityFilters = getCapabilitySearchTerms(shortlistQuery.capability).map((term) => {
          params.push(`%${term}%`);
          const paramIndex = params.length;
          return `
            COALESCE(facility_type_id, '') ILIKE $${paramIndex}
            OR COALESCE(specialties, '') ILIKE $${paramIndex}
            OR COALESCE(capability, '') ILIKE $${paramIndex}
            OR COALESCE(description, '') ILIKE $${paramIndex}
            OR COALESCE(doctors, '') ILIKE $${paramIndex}
          `;
        });
        filters.push(`(${capabilityFilters.map((filter) => `(${filter})`).join(' OR ')})`);
      }

      const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

      try {
        const result = await appkit.lakebase.query(
          `
            WITH ${enrichedFacilitiesCte},
            location_matches AS (
              SELECT
                COALESCE(NULLIF(officename, 'null'), NULLIF(district, 'null'), NULLIF(statename, 'null')) AS label,
                NULLIF(district, 'null') AS district,
                NULLIF(statename, 'null') AS state_name,
                ${coordinateColumn('latitude')} AS latitude_num,
                ${coordinateColumn('longitude')} AS longitude_num,
                CASE
                  WHEN pincode::text = $1 THEN 0
                  WHEN COALESCE(district, '') ILIKE $2 THEN 1
                  WHEN COALESCE(officename, '') ILIKE $2 THEN 2
                  WHEN COALESCE(statename, '') ILIKE $2 THEN 3
                  ELSE 4
                END AS match_rank
              FROM public.pincode_directory
              WHERE $1 <> ''
                AND ${coordinateColumn('latitude')} BETWEEN 6 AND 38
                AND ${coordinateColumn('longitude')} BETWEEN 68 AND 98
                AND (
                  pincode::text = $1
                  OR COALESCE(district, '') ILIKE $2
                  OR COALESCE(officename, '') ILIKE $2
                  OR COALESCE(statename, '') ILIKE $2
                )
              ORDER BY match_rank, district, officename
              LIMIT 60
            ),
            origin AS (
              SELECT
                AVG(latitude_num)::float AS latitude,
                AVG(longitude_num)::float AS longitude,
                MIN(label) AS label,
                MIN(district) AS district,
                MIN(state_name) AS state_name
              FROM location_matches
            ),
            candidate_facilities AS (
              SELECT
                ${shortlistFacilitySelect},
                ef.normalized_state_name,
                ef.normalized_district_name,
                ef.geography_quality,
                ${coordinateColumn('ef.latitude')} AS latitude_num,
                ${coordinateColumn('ef.longitude')} AS longitude_num,
                origin.latitude AS origin_latitude,
                origin.longitude AS origin_longitude,
                origin.label AS origin_label,
                origin.district AS origin_district,
                origin.state_name AS origin_state,
                CASE
                  WHEN origin.latitude IS NOT NULL
                    AND origin.longitude IS NOT NULL
                    AND ${coordinateColumn('ef.latitude')} BETWEEN 6 AND 38
                    AND ${coordinateColumn('ef.longitude')} BETWEEN 68 AND 98
                  THEN (
                    6371 * 2 * ASIN(LEAST(1, SQRT(
                      POWER(SIN(RADIANS((${coordinateColumn('ef.latitude')} - origin.latitude) / 2)), 2)
                      + COS(RADIANS(origin.latitude))
                      * COS(RADIANS(${coordinateColumn('ef.latitude')}))
                      * POWER(SIN(RADIANS((${coordinateColumn('ef.longitude')} - origin.longitude) / 2)), 2)
                    )))
                  )::float
                END AS distance_km
              FROM effective_facilities_enriched ef
              CROSS JOIN origin
            )
            SELECT *
            FROM candidate_facilities
            ${whereClause}
            ORDER BY
              distance_km ASC NULLS LAST,
              CASE WHEN official_phone IS NOT NULL OR official_website IS NOT NULL THEN 0 ELSE 1 END,
              name NULLS LAST
            LIMIT 140
          `,
          params
        );

        const facilities = result.rows
          .map((row) => scoreShortlistFacility(row, shortlistQuery.capability))
          .filter((row) => !shortlistQuery.capability || row.matched_capability?.signal !== 'no claim')
          .sort((a, b) => Number(b.shortlist_score) - Number(a.shortlist_score))
          .slice(0, 12);

        res.json({
          parsed_query: shortlistQuery,
          origin: {
            label: result.rows[0]?.origin_label ?? null,
            district: result.rows[0]?.origin_district ?? null,
            state_name: result.rows[0]?.origin_state ?? null,
            latitude: result.rows[0]?.origin_latitude ?? null,
            longitude: result.rows[0]?.origin_longitude ?? null,
          },
          facilities,
        });
      } catch (err) {
        console.error('Failed to load facility shortlist:', err);
        res.status(500).json({ error: 'Failed to load facility shortlist' });
      }
    });

    app.get('/api/facilities/:id/capabilities', async (req, res) => {
      const id = z.string().trim().min(1).max(120).safeParse(req.params.id);
      if (!id.success) {
        res.status(400).json({ error: 'Invalid facility id' });
        return;
      }

      try {
        const result = await appkit.lakebase.query(
          `
            WITH ${enrichedFacilitiesCte}
            SELECT ${enrichedFacilitySelect}
            FROM effective_facilities_enriched
            WHERE unique_id = $1
            LIMIT 1
          `,
          [id.data]
        );

        const facility = result.rows[0];
        if (!facility) {
          res.status(404).json({ error: 'Facility not found' });
          return;
        }

        res.json({
          unique_id: facility.unique_id,
          capabilities: scoreFacilityCapabilities(facility),
        });
      } catch (err) {
        console.error('Failed to score facility capabilities:', err);
        res.status(500).json({ error: 'Failed to score facility capabilities' });
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
