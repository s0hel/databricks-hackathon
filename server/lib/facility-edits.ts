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

export const cleanTextExpression = (expression: string) => `
  NULLIF(NULLIF(TRIM(${expression}), ''), 'null')
`;

export const normalizedGeoExpression = (expression: string) => `
  CASE
    WHEN ${cleanTextExpression(expression)} IS NULL THEN NULL
    WHEN LOWER(${cleanTextExpression(expression)}) IN ('maharastra', 'maharashtra') THEN 'maharashtra'
    WHEN LOWER(${cleanTextExpression(expression)}) IN ('orissa', 'odisha') THEN 'odisha'
    WHEN LOWER(${cleanTextExpression(expression)}) IN ('tamilnadu', 'tamil nadu') THEN 'tamil nadu'
    WHEN LOWER(${cleanTextExpression(expression)}) IN ('uttaranchal', 'uttranchal', 'uttarakhand') THEN 'uttarakhand'
    WHEN LOWER(${cleanTextExpression(expression)}) IN ('nct of delhi', 'delhi') THEN 'delhi'
    WHEN LOWER(${cleanTextExpression(expression)}) IN ('jammu & kashmir', 'jammu and kashmir') THEN 'jammu and kashmir'
    WHEN LOWER(${cleanTextExpression(expression)}) IN ('andaman & nicobar islands', 'andaman and nicobar islands') THEN 'andaman and nicobar islands'
    WHEN LOWER(${cleanTextExpression(expression)}) IN (
      'the dadra and nagar haveli and daman and diu',
      'dadra and nagar haveli and daman and diu'
    ) THEN 'dadra and nagar haveli and daman and diu'
    ELSE TRIM(REGEXP_REPLACE(REPLACE(LOWER(${cleanTextExpression(expression)}), '&', 'and'), '[^a-z0-9]+', ' ', 'g'))
  END
`;

export const titleCaseExpression = (expression: string) => `
  INITCAP(${expression})
`;

export const pincodeGeographyReferenceCtes = `
  pincode_state_reference AS (
    SELECT
      ${normalizedGeoExpression('statename::text')} AS state_key,
      MIN(${titleCaseExpression(normalizedGeoExpression('statename::text'))}) AS state_name
    FROM public.pincode_directory
    WHERE ${cleanTextExpression('statename::text')} IS NOT NULL
    GROUP BY 1
  ),
  pincode_district_reference AS (
    SELECT
      ${normalizedGeoExpression('district::text')} AS district_key,
      MIN(${titleCaseExpression(normalizedGeoExpression('district::text'))}) AS district_name,
      MIN(${titleCaseExpression(normalizedGeoExpression('statename::text'))}) AS state_name,
      COUNT(DISTINCT ${normalizedGeoExpression('statename::text')})::int AS state_match_count
    FROM public.pincode_directory
    WHERE ${cleanTextExpression('district::text')} IS NOT NULL
      AND ${cleanTextExpression('statename::text')} IS NOT NULL
    GROUP BY 1
  ),
  facility_state_alias_reference AS (
    SELECT *
    FROM (
      VALUES
        ('ahmedabad', 'Gujarat', 'Ahmedabad'),
        ('ahmadabad', 'Gujarat', 'Ahmedabad'),
        ('gj', 'Gujarat', NULL),
        ('guj', 'Gujarat', NULL),
        ('up', 'Uttar Pradesh', NULL),
        ('u p', 'Uttar Pradesh', NULL),
        ('dl', 'Delhi', NULL),
        ('nct delhi', 'Delhi', NULL),
        ('delhi ncr', 'Delhi', NULL),
        ('orissa', 'Odisha', NULL),
        ('tamilnadu', 'Tamil Nadu', NULL),
        ('navi mumbai', 'Maharashtra', NULL),
        ('navi mumbai maharashtra', 'Maharashtra', NULL),
        ('navi mumbai thane', 'Maharashtra', 'Thane'),
        ('pimpri chinchwad', 'Maharashtra', 'Pune'),
        ('mohali', 'Punjab', 'Sahibzada Ajit Singh Nagar'),
        ('sas nagar', 'Punjab', 'Sahibzada Ajit Singh Nagar'),
        ('dakshin kannad', 'Karnataka', 'Dakshina Kannada'),
        ('mangalore', 'Karnataka', 'Dakshina Kannada'),
        ('mysore', 'Karnataka', 'Mysuru'),
        ('bijapur karnataka', 'Karnataka', 'Vijayapura'),
        ('north 24 parganas', 'West Bengal', 'North 24 Parganas'),
        ('south 24 parganas', 'West Bengal', 'South 24 Parganas'),
        ('24pgs s', 'West Bengal', 'South 24 Parganas'),
        ('paschim medinipur', 'West Bengal', 'Paschim Medinipur'),
        ('midnapore', 'West Bengal', 'Paschim Medinipur'),
        ('hoogly', 'West Bengal', 'Hooghly'),
        ('birbhum west bengal', 'West Bengal', 'Birbhum'),
        ('east delhi', 'Delhi', 'East Delhi'),
        ('north west delhi', 'Delhi', 'North West Delhi'),
        ('south delhi', 'Delhi', 'South Delhi'),
        ('east singhbhum', 'Jharkhand', 'East Singhbhum'),
        ('ghaziabad uttar pradesh', 'Uttar Pradesh', 'Ghaziabad'),
        ('sirsa haryana', 'Haryana', 'Sirsa'),
        ('gurugram haryana', 'Haryana', 'Gurugram'),
        ('haridwar uttarakhand', 'Uttarakhand', 'Haridwar'),
        ('kutch gujarat', 'Gujarat', 'Kachchh'),
        ('ernakulam district kerala', 'Kerala', 'Ernakulam'),
        ('guntur district andhra pradesh', 'Andhra Pradesh', 'Guntur'),
        ('kadapa andhra pradesh', 'Andhra Pradesh', 'Ysr'),
        ('ramanagara district karnataka', 'Karnataka', 'Ramanagara'),
        ('satara district maharashtra', 'Maharashtra', 'Satara'),
        ('palghar district', 'Maharashtra', 'Palghar'),
        ('kanyakumari district', 'Tamil Nadu', 'Kanniyakumari'),
        ('malappuram district', 'Kerala', 'Malappuram'),
        ('thrissur district', 'Kerala', 'Thrissur'),
        ('srinagar kashmir', 'Jammu And Kashmir', 'Srinagar')
    ) AS aliases(alias_key, state_name, district_name)
  )
`;

export const enrichedFacilitiesCte = `
  ${effectiveFacilitiesCte},
  ${pincodeGeographyReferenceCtes},
  effective_facilities_enriched AS (
    SELECT
      ef.*,
      COALESCE(
        raw_alias.state_name,
        raw_embedded_state.state_name,
        state_ref.state_name,
        CASE WHEN state_as_district.state_match_count = 1 THEN state_as_district.state_name END,
        city_alias.state_name,
        city_embedded_state.state_name,
        CASE WHEN city_as_district.state_match_count = 1 THEN city_as_district.state_name END
      ) AS normalized_state_name,
      COALESCE(
        raw_alias.district_name,
        CASE WHEN state_ref.state_key IS NULL AND state_as_district.state_match_count = 1 THEN state_as_district.district_name END,
        city_alias.district_name,
        city_as_district.district_name,
        ${titleCaseExpression(normalizedGeoExpression('ef.address_city::text'))}
      ) AS normalized_district_name,
      CASE
        WHEN raw_alias.state_name IS NOT NULL THEN 'alias_match'
        WHEN raw_embedded_state.state_name IS NOT NULL THEN 'embedded_state_match'
        WHEN state_ref.state_key IS NOT NULL THEN 'state_match'
        WHEN state_as_district.state_match_count = 1 THEN 'state_field_mapped_from_district'
        WHEN city_alias.state_name IS NOT NULL THEN 'city_alias_match'
        WHEN city_embedded_state.state_name IS NOT NULL THEN 'city_embedded_state_match'
        WHEN city_as_district.state_match_count = 1 THEN 'city_field_mapped_from_district'
        WHEN ${cleanTextExpression('ef.address_state_or_region::text')} IS NULL THEN 'missing_state'
        ELSE 'unmapped_state'
      END AS geography_quality
    FROM effective_facilities ef
    LEFT JOIN facility_state_alias_reference raw_alias
      ON ${normalizedGeoExpression('ef.address_state_or_region::text')} = raw_alias.alias_key
    LEFT JOIN LATERAL (
      SELECT state_name
      FROM pincode_state_reference
      WHERE ${normalizedGeoExpression('ef.address_state_or_region::text')} LIKE '%' || state_key || '%'
        AND LENGTH(state_key) > 2
      ORDER BY LENGTH(state_key) DESC
      LIMIT 1
    ) raw_embedded_state ON TRUE
    LEFT JOIN pincode_state_reference state_ref
      ON ${normalizedGeoExpression('ef.address_state_or_region::text')} = state_ref.state_key
    LEFT JOIN pincode_district_reference state_as_district
      ON ${normalizedGeoExpression('ef.address_state_or_region::text')} = state_as_district.district_key
    LEFT JOIN facility_state_alias_reference city_alias
      ON ${normalizedGeoExpression('ef.address_city::text')} = city_alias.alias_key
    LEFT JOIN LATERAL (
      SELECT state_name
      FROM pincode_state_reference
      WHERE ${normalizedGeoExpression('ef.address_city::text')} LIKE '%' || state_key || '%'
        AND LENGTH(state_key) > 2
      ORDER BY LENGTH(state_key) DESC
      LIMIT 1
    ) city_embedded_state ON TRUE
    LEFT JOIN pincode_district_reference city_as_district
      ON ${normalizedGeoExpression('ef.address_city::text')} = city_as_district.district_key
  )
`;
