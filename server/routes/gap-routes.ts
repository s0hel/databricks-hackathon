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

const numericColumn = (column: string) => `
  NULLIF(REGEXP_REPLACE(NULLIF(${column}::text, 'null'), '[^0-9.-]', '', 'g'), '')::float
`;

const GapQuery = z.object({
  level: z.enum(['state', 'district']).optional().default('state'),
  state: z.string().trim().max(120).optional().default(''),
  q: z.string().trim().max(120).optional().default(''),
  minConfidence: z.coerce.number().min(0).max(100).optional().default(0),
});

const buildHealthGeo = (level: 'state' | 'district') => {
  if (level === 'state') {
    return `
      SELECT
        TRIM(state_ut) AS geography_key,
        TRIM(state_ut) AS geography_name,
        TRIM(state_ut) AS state_name,
        COUNT(*)::int AS district_count,
        SUM(COALESCE(${numericColumn('households_surveyed')}, 0))::float AS households_surveyed,
        SUM(COALESCE(${numericColumn('women_15_49_interviewed')}, 0))::float AS women_interviewed,
        AVG(${numericColumn('all_w15_49_who_are_anaemic_pct')})::float AS anaemia_pct,
        AVG(${numericColumn('hh_use_improved_sanitation_pct')})::float AS sanitation_pct,
        AVG(${numericColumn('hh_member_covered_health_insurance_pct')})::float AS insurance_pct,
        AVG(${numericColumn('institutional_birth_5y_pct')})::float AS institutional_birth_pct,
        AVG(${numericColumn('child_u5_who_are_stunted_height_for_age_18_pct')})::float AS stunting_pct,
        AVG(${numericColumn('w15_plus_with_high_bp_sys_gte_140_mmhg_and_or_dia_gte_90_mm_pct')})::float AS high_bp_women_pct
      FROM public.health_indicators
      GROUP BY TRIM(state_ut)
    `;
  }

  return `
    SELECT
      CONCAT(TRIM(state_ut), ' / ', TRIM(district_name)) AS geography_key,
      TRIM(district_name) AS geography_name,
      TRIM(state_ut) AS state_name,
      1::int AS district_count,
      COALESCE(${numericColumn('households_surveyed')}, 0)::float AS households_surveyed,
      COALESCE(${numericColumn('women_15_49_interviewed')}, 0)::float AS women_interviewed,
      ${numericColumn('all_w15_49_who_are_anaemic_pct')} AS anaemia_pct,
      ${numericColumn('hh_use_improved_sanitation_pct')} AS sanitation_pct,
      ${numericColumn('hh_member_covered_health_insurance_pct')} AS insurance_pct,
      ${numericColumn('institutional_birth_5y_pct')} AS institutional_birth_pct,
      ${numericColumn('child_u5_who_are_stunted_height_for_age_18_pct')} AS stunting_pct,
      ${numericColumn('w15_plus_with_high_bp_sys_gte_140_mmhg_and_or_dia_gte_90_mm_pct')} AS high_bp_women_pct
    FROM public.health_indicators
  `;
};

const buildFacilityGeo = (level: 'state' | 'district') => {
  const geographyName = level === 'state'
    ? `TRIM(NULLIF(address_state_or_region, 'null'))`
    : `TRIM(NULLIF(address_city, 'null'))`;

  return `
    SELECT
      ${geographyName} AS geography_name,
      TRIM(NULLIF(address_state_or_region, 'null')) AS state_name,
      COUNT(*)::float AS facility_count,
      COUNT(*) FILTER (WHERE NULLIF(facility_type_id, 'null') = 'hospital')::float AS hospital_count,
      COUNT(*) FILTER (WHERE NULLIF(facility_type_id, 'null') = 'clinic')::float AS clinic_count,
      COUNT(*) FILTER (
        WHERE latitude IS NOT NULL
          AND longitude IS NOT NULL
          AND latitude::text <> 'null'
          AND longitude::text <> 'null'
      )::float AS geocoded_count,
      COUNT(*) FILTER (
        WHERE NULLIF(official_phone, 'null') IS NOT NULL
          OR NULLIF(official_website, 'null') IS NOT NULL
      )::float AS contactable_count,
      COUNT(*) FILTER (
        WHERE NULLIF(specialties, 'null') IS NOT NULL
          OR NULLIF(capability, 'null') IS NOT NULL
      )::float AS described_count
    FROM public.facilities
    WHERE ${geographyName} IS NOT NULL
    GROUP BY 1, 2
  `;
};

export function setupGapRoutes(appkit: AppKitWithLakebase) {
  appkit.server.extend((app) => {
    app.get('/api/gaps/regions', async (req, res) => {
      const parsed = GapQuery.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid filters' });
        return;
      }

      const { level, state, q, minConfidence } = parsed.data;
      const filters: string[] = [];
      const params: Array<string | number> = [];

      if (state) {
        params.push(state);
        filters.push(`scored.state_name = $${params.length}`);
      }

      if (q) {
        params.push(`%${q}%`);
        filters.push(`(scored.geography_name ILIKE $${params.length} OR scored.state_name ILIKE $${params.length})`);
      }

      params.push(minConfidence);
      filters.push(`scored.confidence_score >= $${params.length}`);

      const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
      const joinCondition = level === 'state'
        ? `LOWER(TRIM(h.geography_name)) = LOWER(TRIM(f.geography_name))`
        : `LOWER(TRIM(h.geography_name)) = LOWER(TRIM(f.geography_name))
          AND LOWER(TRIM(h.state_name)) = LOWER(TRIM(f.state_name))`;

      try {
        const result = await appkit.lakebase.query(
          `
            WITH health_geo AS (
              ${buildHealthGeo(level)}
            ),
            facility_geo AS (
              ${buildFacilityGeo(level)}
            ),
            joined AS (
              SELECT
                h.*,
                COALESCE(f.facility_count, 0)::float AS facility_count,
                COALESCE(f.hospital_count, 0)::float AS hospital_count,
                COALESCE(f.clinic_count, 0)::float AS clinic_count,
                COALESCE(f.geocoded_count, 0)::float AS geocoded_count,
                COALESCE(f.contactable_count, 0)::float AS contactable_count,
                COALESCE(f.described_count, 0)::float AS described_count
              FROM health_geo h
              LEFT JOIN facility_geo f ON ${joinCondition}
            ),
            scored AS (
              SELECT
                *,
                LEAST(100, GREATEST(0,
                  (
                    COALESCE(anaemia_pct, 0)
                    + (100 - COALESCE(sanitation_pct, 100))
                    + (100 - COALESCE(insurance_pct, 100))
                    + (100 - COALESCE(institutional_birth_pct, 100))
                    + COALESCE(stunting_pct, 0)
                    + COALESCE(high_bp_women_pct, 0)
                  ) / 6
                ))::float AS need_score,
                (
                  hospital_count * 1.0
                  + clinic_count * 0.65
                  + GREATEST(facility_count - hospital_count - clinic_count, 0) * 0.35
                  + geocoded_count * 0.12
                  + contactable_count * 0.1
                  + described_count * 0.1
                )::float AS facility_evidence_score,
                (
                  (
                    hospital_count * 1.0
                    + clinic_count * 0.65
                    + GREATEST(facility_count - hospital_count - clinic_count, 0) * 0.35
                    + geocoded_count * 0.12
                    + contactable_count * 0.1
                    + described_count * 0.1
                  ) / GREATEST(households_surveyed / 10000.0, 1)
                )::float AS facility_evidence_per_10k_households,
                LEAST(100, LN(1 + (
                  (
                    hospital_count * 1.0
                    + clinic_count * 0.65
                    + GREATEST(facility_count - hospital_count - clinic_count, 0) * 0.35
                    + geocoded_count * 0.12
                    + contactable_count * 0.1
                    + described_count * 0.1
                  ) / GREATEST(households_surveyed / 10000.0, 1)
                )) * 32)::float AS supply_adequacy_score,
                LEAST(100,
                  25
                  + LEAST(35, households_surveyed / 450.0)
                  + LEAST(15, women_interviewed / 350.0)
                  + LEAST(25, facility_count * 2.5)
                )::float AS confidence_score
              FROM joined
            )
            SELECT
              geography_key,
              geography_name,
              state_name,
              district_count,
              ROUND(households_surveyed::numeric, 0)::int AS households_surveyed,
              ROUND(women_interviewed::numeric, 0)::int AS women_interviewed,
              ROUND(anaemia_pct::numeric, 1)::float AS anaemia_pct,
              ROUND(sanitation_pct::numeric, 1)::float AS sanitation_pct,
              ROUND(insurance_pct::numeric, 1)::float AS insurance_pct,
              ROUND(institutional_birth_pct::numeric, 1)::float AS institutional_birth_pct,
              ROUND(stunting_pct::numeric, 1)::float AS stunting_pct,
              ROUND(high_bp_women_pct::numeric, 1)::float AS high_bp_women_pct,
              ROUND(facility_count::numeric, 0)::int AS facility_count,
              ROUND(hospital_count::numeric, 0)::int AS hospital_count,
              ROUND(clinic_count::numeric, 0)::int AS clinic_count,
              ROUND(geocoded_count::numeric, 0)::int AS geocoded_count,
              ROUND(contactable_count::numeric, 0)::int AS contactable_count,
              ROUND(described_count::numeric, 0)::int AS described_count,
              ROUND(need_score::numeric, 1)::float AS need_score,
              ROUND(facility_evidence_score::numeric, 1)::float AS facility_evidence_score,
              ROUND(facility_evidence_per_10k_households::numeric, 2)::float AS facility_evidence_per_10k_households,
              ROUND(supply_adequacy_score::numeric, 1)::float AS supply_adequacy_score,
              ROUND((need_score * (1 - LEAST(supply_adequacy_score, 95) / 115.0))::numeric, 1)::float AS gap_score,
              ROUND(confidence_score::numeric, 1)::float AS confidence_score,
              CASE
                WHEN confidence_score < 50 THEN 'Data-poor'
                WHEN need_score >= 45 AND supply_adequacy_score < 30 THEN 'Likely real gap'
                WHEN need_score >= 45 THEN 'High need, some evidence'
                WHEN supply_adequacy_score < 20 THEN 'Sparse facility evidence'
                ELSE 'Lower priority'
              END AS evidence_label,
              CASE
                WHEN confidence_score >= 75 THEN 'High'
                WHEN confidence_score >= 50 THEN 'Medium'
                ELSE 'Low'
              END AS confidence_label
            FROM scored
            ${whereClause}
            ORDER BY
              (need_score * (1 - LEAST(supply_adequacy_score, 95) / 115.0)) DESC NULLS LAST,
              confidence_score DESC,
              geography_name
            LIMIT 80
          `,
          params,
        );

        res.json(result.rows);
      } catch (err) {
        console.error('Failed to load care gaps:', err);
        res.status(500).json({ error: 'Failed to load care gaps' });
      }
    });
  });
}
