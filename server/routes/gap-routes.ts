import { Application } from 'express';
import { z } from 'zod';
import { enrichedFacilitiesCte, normalizedGeoExpression, titleCaseExpression } from '../lib/facility-edits';

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

const coordinateColumn = (column: string) => `
  CASE
    WHEN NULLIF(${column}::text, 'null') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN ${column}::text::float
  END
`;

const GapQuery = z.object({
  level: z.enum(['state', 'district']).optional().default('state'),
  state: z.string().trim().max(120).optional().default(''),
  q: z.string().trim().max(120).optional().default(''),
  minConfidence: z.coerce.number().min(0).max(100).optional().default(0),
});

const buildHealthGeo = (level: 'state' | 'district', stateParamIndex: number | null) => {
  const stateName = titleCaseExpression(normalizedGeoExpression('state_ut::text'));
  const stateWhere = stateParamIndex ? `WHERE ${stateName} = $${stateParamIndex}` : '';

  if (level === 'state') {
    return `
      SELECT
        MIN(${stateName}) AS geography_key,
        MIN(${stateName}) AS geography_name,
        MIN(${stateName}) AS state_name,
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
      ${stateWhere}
      GROUP BY ${normalizedGeoExpression('state_ut::text')}
    `;
  }

  return `
    SELECT
      CONCAT(${stateName}, ' / ', TRIM(district_name)) AS geography_key,
      TRIM(district_name) AS geography_name,
      ${stateName} AS state_name,
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
    ${stateWhere}
  `;
};

const buildFacilityGeo = (level: 'state' | 'district', stateParamIndex: number | null) => {
  const geographyName = level === 'state' ? `normalized_state_name` : `normalized_district_name`;
  const stateFilter = stateParamIndex ? `AND normalized_state_name = $${stateParamIndex}` : '';

  return `
    SELECT
      MIN(${geographyName}) AS geography_name,
      MIN(normalized_state_name) AS state_name,
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
    FROM effective_facilities_enriched
    WHERE ${geographyName} IS NOT NULL
      ${stateFilter}
    GROUP BY ${normalizedGeoExpression(geographyName)}${
      level === 'district' ? `, ${normalizedGeoExpression('normalized_state_name')}` : ''
    }
  `;
};

const buildPincodeGeo = (level: 'state' | 'district', stateParamIndex: number | null) => {
  const geographyName = level === 'state' ? `TRIM(NULLIF(statename, 'null'))` : `TRIM(NULLIF(district, 'null'))`;
  const pincodeStateName = titleCaseExpression(normalizedGeoExpression(`TRIM(NULLIF(statename, 'null'))`));
  const stateFilter = stateParamIndex ? `AND ${pincodeStateName} = $${stateParamIndex}` : '';

  return `
    SELECT
      MIN(${geographyName}) AS geography_name,
      MIN(TRIM(NULLIF(statename, 'null'))) AS state_name,
      COUNT(DISTINCT pincode)::float AS pincode_count,
      COUNT(*)::float AS post_office_count,
      COUNT(*) FILTER (WHERE NULLIF(officetype, 'null') = 'BO')::float AS branch_office_count,
      COUNT(*) FILTER (WHERE NULLIF(delivery, 'null') = 'Delivery')::float AS delivery_office_count,
      COUNT(*) FILTER (WHERE latitude_num IS NOT NULL AND longitude_num IS NOT NULL)::float AS geocoded_pincode_count,
      AVG(latitude_num)::float AS centroid_latitude,
      AVG(longitude_num)::float AS centroid_longitude
    FROM (
      SELECT
        *,
        CASE
          WHEN latitude_raw BETWEEN 6 AND 38 AND longitude_raw BETWEEN 68 AND 98 THEN latitude_raw
        END AS latitude_num,
        CASE
          WHEN latitude_raw BETWEEN 6 AND 38 AND longitude_raw BETWEEN 68 AND 98 THEN longitude_raw
        END AS longitude_num
      FROM (
        SELECT
          *,
          ${coordinateColumn('latitude')} AS latitude_raw,
          ${coordinateColumn('longitude')} AS longitude_raw
        FROM public.pincode_directory
      ) raw_pincodes
    ) p
    WHERE ${geographyName} IS NOT NULL
      ${stateFilter}
    GROUP BY ${normalizedGeoExpression(geographyName)}${
      level === 'district' ? `, ${normalizedGeoExpression(`TRIM(NULLIF(statename, 'null'))`)} ` : ''
    }
  `;
};

const buildHospitalPoints = (stateParamIndex: number | null) => `
  SELECT
    state_name,
      latitude,
      longitude
  FROM (
    SELECT
      normalized_state_name AS state_name,
      ${coordinateColumn('latitude')} AS latitude,
      ${coordinateColumn('longitude')} AS longitude
    FROM effective_facilities_enriched
    WHERE NULLIF(facility_type_id, 'null') = 'hospital'
      ${stateParamIndex ? `AND normalized_state_name = $${stateParamIndex}` : ''}
  ) coordinates
  WHERE latitude BETWEEN 6 AND 38
    AND longitude BETWEEN 68 AND 98
`;

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

      const stateParamIndex = state ? params.length : null;

      if (q) {
        params.push(`%${q}%`);
        filters.push(`(scored.geography_name ILIKE $${params.length} OR scored.state_name ILIKE $${params.length})`);
      }

      params.push(minConfidence);
      filters.push(`scored.confidence_score >= $${params.length}`);

      const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
      const joinCondition =
        level === 'state'
          ? `${normalizedGeoExpression('h.geography_name')} = ${normalizedGeoExpression('f.geography_name')}`
          : `${normalizedGeoExpression('h.geography_name')} = ${normalizedGeoExpression('f.geography_name')}
          AND ${normalizedGeoExpression('h.state_name')} = ${normalizedGeoExpression('f.state_name')}`;

      try {
        const result = await appkit.lakebase.query(
          `
            WITH health_geo AS (
              ${buildHealthGeo(level, stateParamIndex)}
            ),
            ${enrichedFacilitiesCte},
            facility_geo AS (
              ${buildFacilityGeo(level, stateParamIndex)}
            ),
            pincode_geo AS (
              ${buildPincodeGeo(level, stateParamIndex)}
            ),
            hospital_points AS (
              ${buildHospitalPoints(stateParamIndex)}
            ),
            pincode_access AS (
              SELECT
                p.*,
                nearest.nearest_hospital_km
              FROM pincode_geo p
              LEFT JOIN LATERAL (
                SELECT
                  MIN(
                    6371 * 2 * ASIN(LEAST(1, SQRT(
                      POWER(SIN(RADIANS((hp.latitude - p.centroid_latitude) / 2)), 2)
                      + COS(RADIANS(p.centroid_latitude))
                      * COS(RADIANS(hp.latitude))
                      * POWER(SIN(RADIANS((hp.longitude - p.centroid_longitude) / 2)), 2)
                    )))
                  )::float AS nearest_hospital_km
                FROM hospital_points hp
                WHERE ${normalizedGeoExpression('hp.state_name')} = ${normalizedGeoExpression('p.state_name')}
                  AND p.centroid_latitude IS NOT NULL
                  AND p.centroid_longitude IS NOT NULL
              ) nearest ON TRUE
            ),
            joined AS (
              SELECT
                h.*,
                COALESCE(f.facility_count, 0)::float AS facility_count,
                COALESCE(f.hospital_count, 0)::float AS hospital_count,
                COALESCE(f.clinic_count, 0)::float AS clinic_count,
                COALESCE(f.geocoded_count, 0)::float AS geocoded_count,
                COALESCE(f.contactable_count, 0)::float AS contactable_count,
                COALESCE(f.described_count, 0)::float AS described_count,
                COALESCE(p.pincode_count, 0)::float AS pincode_count,
                COALESCE(p.post_office_count, 0)::float AS post_office_count,
                COALESCE(p.branch_office_count, 0)::float AS branch_office_count,
                COALESCE(p.delivery_office_count, 0)::float AS delivery_office_count,
                COALESCE(p.geocoded_pincode_count, 0)::float AS geocoded_pincode_count,
                p.centroid_latitude,
                p.centroid_longitude,
                p.nearest_hospital_km
              FROM health_geo h
              LEFT JOIN facility_geo f ON ${joinCondition}
              LEFT JOIN pincode_access p ON ${
                level === 'state'
                  ? `${normalizedGeoExpression('h.geography_name')} = ${normalizedGeoExpression('p.geography_name')}`
                  : `${normalizedGeoExpression('h.geography_name')} = ${normalizedGeoExpression('p.geography_name')}
                  AND ${normalizedGeoExpression('h.state_name')} = ${normalizedGeoExpression('p.state_name')}`
              }
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
                  LEAST(40, COALESCE(nearest_hospital_km, 80) * 0.7)
                  + LEAST(35, (pincode_count / GREATEST(facility_count, 1)) * 1.8)
                  + LEAST(15, (branch_office_count / GREATEST(post_office_count, 1)) * 15)
                  + LEAST(10, (1 - (geocoded_pincode_count / GREATEST(post_office_count, 1))) * 10)
                )::float AS geographic_access_score,
                (facility_count / GREATEST(pincode_count, 1) * 100)::float AS facilities_per_100_pincodes,
                LEAST(100,
                  25
                  + LEAST(35, households_surveyed / 450.0)
                  + LEAST(15, women_interviewed / 350.0)
                  + LEAST(15, facility_count * 2.0)
                  + LEAST(10, pincode_count * 0.75)
                  + LEAST(10, geocoded_pincode_count * 0.25)
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
              ROUND(pincode_count::numeric, 0)::int AS pincode_count,
              ROUND(post_office_count::numeric, 0)::int AS post_office_count,
              ROUND(branch_office_count::numeric, 0)::int AS branch_office_count,
              ROUND(delivery_office_count::numeric, 0)::int AS delivery_office_count,
              ROUND(geocoded_pincode_count::numeric, 0)::int AS geocoded_pincode_count,
              ROUND(centroid_latitude::numeric, 5)::float AS centroid_latitude,
              ROUND(centroid_longitude::numeric, 5)::float AS centroid_longitude,
              ROUND(nearest_hospital_km::numeric, 1)::float AS nearest_hospital_km,
              ROUND(need_score::numeric, 1)::float AS need_score,
              ROUND(facility_evidence_score::numeric, 1)::float AS facility_evidence_score,
              ROUND(facility_evidence_per_10k_households::numeric, 2)::float AS facility_evidence_per_10k_households,
              ROUND(supply_adequacy_score::numeric, 1)::float AS supply_adequacy_score,
              ROUND(geographic_access_score::numeric, 1)::float AS geographic_access_score,
              ROUND(facilities_per_100_pincodes::numeric, 2)::float AS facilities_per_100_pincodes,
              ROUND(LEAST(100, (
                need_score * (1 - LEAST(supply_adequacy_score, 95) / 115.0)
                + geographic_access_score * 0.3
              ))::numeric, 1)::float AS gap_score,
              ROUND(confidence_score::numeric, 1)::float AS confidence_score,
              CASE
                WHEN confidence_score < 50 THEN 'Data-poor'
                WHEN need_score >= 45 AND supply_adequacy_score < 30 AND geographic_access_score >= 35 THEN 'Likely real gap'
                WHEN need_score >= 45 AND geographic_access_score >= 45 THEN 'High need, remote access'
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
          params
        );

        res.json(result.rows);
      } catch (err) {
        console.error('Failed to load care gaps:', err);
        res.status(500).json({ error: 'Failed to load care gaps' });
      }
    });
  });
}
