import { Application } from 'express';
import { z } from 'zod';
import { normalizedGeoExpression, titleCaseExpression } from '../lib/facility-edits';

interface AppKitWithLakebase {
  lakebase: {
    query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  };
  server: {
    extend(fn: (app: Application) => void): void;
  };
}

const SORT_COLUMNS = {
  anaemia: 'all_w15_49_who_are_anaemic_pct',
  sanitation: 'hh_use_improved_sanitation_pct',
  insurance: 'hh_member_covered_health_insurance_pct',
  schooling: 'women_age_15_49_with_10_or_more_years_of_schooling_pct',
  births: 'institutional_birth_5y_pct',
} as const;

const DistrictQuery = z.object({
  q: z.string().trim().max(80).optional().default(''),
  state: z.string().trim().max(80).optional().default(''),
  sort: z.enum(['anaemia', 'sanitation', 'insurance', 'schooling', 'births']).optional().default('anaemia'),
});

const districtSelect = `
  district_name,
  ${titleCaseExpression(normalizedGeoExpression('state_ut::text'))} AS state_ut,
  households_surveyed,
  women_15_49_interviewed,
  men_15_54_interviewed,
  hh_electricity_pct,
  hh_improved_water_pct,
  hh_use_improved_sanitation_pct,
  households_using_clean_fuel_for_cooking_pct,
  hh_member_covered_health_insurance_pct,
  women_age_15_49_who_are_literate_pct,
  women_age_15_49_with_10_or_more_years_of_schooling_pct,
  institutional_birth_5y_pct,
  births_attended_by_skilled_hp_5y_10_pct,
  child_u5_who_are_stunted_height_for_age_18_pct,
  child_u5_who_are_underweight_weight_for_age_18_pct,
  all_w15_49_who_are_anaemic_pct,
  w15_plus_with_high_bp_sys_gte_140_mmhg_and_or_dia_gte_90_mm_pct,
  m15_plus_with_high_bp_sys_gte_140_mmhg_and_or_dia_gte_90_mm_pct
`;

export function setupHealthRoutes(appkit: AppKitWithLakebase) {
  appkit.server.extend((app) => {
    app.get('/api/health/overview', async (_req, res) => {
      try {
        const result = await appkit.lakebase.query(`
          SELECT
            COUNT(*)::int AS district_count,
            COUNT(DISTINCT ${normalizedGeoExpression('state_ut::text')})::int AS state_count,
            ROUND(AVG(hh_use_improved_sanitation_pct)::numeric, 1)::float AS avg_sanitation_pct,
            ROUND(AVG(hh_member_covered_health_insurance_pct)::numeric, 1)::float AS avg_insurance_pct,
            ROUND(AVG(all_w15_49_who_are_anaemic_pct)::numeric, 1)::float AS avg_anaemia_pct,
            ROUND(AVG(institutional_birth_5y_pct)::numeric, 1)::float AS avg_institutional_birth_pct
          FROM public.health_indicators
        `);
        res.json(result.rows[0]);
      } catch (err) {
        console.error('Failed to load health overview:', err);
        res.status(500).json({ error: 'Failed to load health overview' });
      }
    });

    app.get('/api/health/states', async (_req, res) => {
      try {
        const result = await appkit.lakebase.query(`
          SELECT
            ${titleCaseExpression(normalizedGeoExpression('state_ut::text'))} AS state_ut,
            COUNT(*)::int AS district_count
          FROM public.health_indicators
          GROUP BY ${normalizedGeoExpression('state_ut::text')}
          ORDER BY state_ut
        `);
        res.json(result.rows);
      } catch (err) {
        console.error('Failed to load states:', err);
        res.status(500).json({ error: 'Failed to load states' });
      }
    });

    app.get('/api/health/districts', async (req, res) => {
      const parsed = DistrictQuery.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid filters' });
        return;
      }

      const filters: string[] = [];
      const params: string[] = [];
      const { q, state, sort } = parsed.data;

      if (q) {
        params.push(`%${q}%`);
        filters.push(
          `(district_name ILIKE $${params.length} OR ${titleCaseExpression(
            normalizedGeoExpression('state_ut::text')
          )} ILIKE $${params.length})`
        );
      }

      if (state) {
        params.push(state);
        filters.push(`${titleCaseExpression(normalizedGeoExpression('state_ut::text'))} = $${params.length}`);
      }

      const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
      const sortColumn = SORT_COLUMNS[sort];

      try {
        const result = await appkit.lakebase.query(
          `
            SELECT ${districtSelect}
            FROM public.health_indicators
            ${whereClause}
            ORDER BY ${sortColumn} DESC NULLS LAST, ${titleCaseExpression(
              normalizedGeoExpression('state_ut::text')
            )}, district_name
            LIMIT 80
          `,
          params
        );
        res.json(result.rows);
      } catch (err) {
        console.error('Failed to load districts:', err);
        res.status(500).json({ error: 'Failed to load districts' });
      }
    });
  });
}
