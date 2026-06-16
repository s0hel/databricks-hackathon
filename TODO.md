# TODO

## Current Status

- [x] Reviewed `requirements.md`.
- [x] Started with the critical data quality issue before adding use case 1.
- [x] Added shared backend SQL helpers for geographic normalization.
- [x] Canonicalized `Maharastra`/`Maharashtra` and common state aliases.
- [x] Mapped facility `address_state_or_region` values that are actually districts/cities to canonical states using `public.pincode_directory`.
- [x] Updated facility overview/options/search to use canonical state and district fields.
- [x] Updated gap aggregation to use the same canonical facility geography.
- [x] Updated health indicator state counts, filters, and display values to use canonical state names.

## Data Quality Work

- [x] Validate the normalized facility state counts against the Genie-reported issue: raw facility state field has 234 distinct values; normalized app state count now collapses to 34 mapped states/UTs in `/api/facilities/overview`.
- [ ] Add a data quality diagnostics API/view that reports:
  - raw facility state distinct count
  - normalized facility state distinct count
  - unmapped facility state rows
  - ambiguous district-to-state mappings
  - missing facility coordinates
  - missing pincode coordinates
- [ ] Decide whether normalized geography should remain an app-layer CTE or be materialized as Lakebase views such as `app_data.facilities_normalized`.
- [ ] Normalize district names more aggressively after inspecting unmatched health-indicator districts.
- [ ] Prioritize coordinate remediation:
  - 12,009 pincode directory records missing latitude/longitude
  - 30 facilities missing latitude/longitude
- [ ] Normalize facility type values, including `farmacy` to `pharmacy`.

## Use Case 1: Facility Claim Trust

- [ ] Define capability taxonomy: ICU, maternity, emergency, oncology, trauma, NICU, dialysis, surgery.
- [ ] Parse claim evidence from `facility_type_id`, `specialties`, `capability`, `description`, and `doctors`.
- [ ] Score each facility-capability pair as:
  - strong evidence
  - partial evidence
  - weak or suspicious evidence
  - no claim
- [ ] Add an API endpoint for facility capability trust signals.
- [ ] Add a UI panel on facility cards showing evidence-attached capability claims.

## Use Case 2: Gap Confidence

- [x] Existing app ranks care gaps by health need, supply adequacy, access pressure, and confidence.
- [x] Existing gap model now uses normalized facility geography.
- [ ] Add drill-down explanations for which data quality factors lowered confidence.
- [ ] Add filters for capability-specific gaps after use case 1 exists.

## Use Case 3: Patient or Coordinator Shortlist

- [ ] Add location and care need search input, for examples like `dialysis near Jaipur` or `emergency surgery near Patna`.
- [ ] Parse care need into the capability taxonomy from use case 1.
- [ ] Resolve entered location to candidate district/city/pincode coordinates.
- [ ] Rank nearby facilities by distance, capability trust, contactability, and data completeness.
- [ ] Return an evidence-attached shortlist of candidate facilities.

## Verification Checklist

- [x] Run `npm run typecheck`.
- [x] Run `npm run lint`.
- [x] Run local API smoke checks:
  - `/api/health/states`
  - `/api/facilities/options`
  - `/api/facilities/search?q=clinic`
  - `/api/gaps/regions?level=state`
- [ ] Run Playwright smoke tests if the dev server and Lakebase credentials are available.
