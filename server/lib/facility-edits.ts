export const editableFacilityFields = [
  'name',
  'description',
  'facility_type_id',
  'operator_type_id',
  'address_city',
  'address_state_or_region',
  'official_phone',
  'official_website',
  'specialties',
  'capability',
  'doctors',
  'latitude',
  'longitude',
] as const;

export type EditableFacilityField = (typeof editableFacilityFields)[number];

export const editableFacilitySelect = editableFacilityFields.map((field) => `e.${field}`).join(',\n  ');

const effectiveColumn = (field: EditableFacilityField) => {
  if (field === 'doctors') return `e.doctors`;
  return `CASE WHEN e.unique_id IS NULL THEN f.${field}::text ELSE e.${field} END AS ${field}`;
};

export const effectiveFacilitiesCte = `
  effective_facilities AS (
    SELECT
      f.unique_id::text AS unique_id,
      ${editableFacilityFields.map(effectiveColumn).join(',\n      ')}
    FROM public.facilities f
    LEFT JOIN app_data.facility_edits e ON e.unique_id = f.unique_id::text
  )
`;

export const facilityJsonObject = (alias: string) =>
  `jsonb_build_object(${editableFacilityFields.map((field) => `'${field}', ${alias}.${field}`).join(', ')})`;
