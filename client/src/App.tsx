import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Building2,
  Database,
  Droplets,
  Globe,
  HeartPulse,
  MapPin,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
  Stethoscope,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
} from '@databricks/appkit-ui/react';

interface Overview {
  district_count: number;
  state_count: number;
  avg_sanitation_pct: number;
  avg_insurance_pct: number;
  avg_anaemia_pct: number;
  avg_institutional_birth_pct: number;
}

interface StateOption {
  state_ut: string;
  district_count: number;
}

interface District {
  district_name: string;
  state_ut: string;
  households_surveyed: number;
  women_15_49_interviewed: number;
  men_15_54_interviewed: number;
  hh_electricity_pct: number;
  hh_improved_water_pct: number;
  hh_use_improved_sanitation_pct: number;
  households_using_clean_fuel_for_cooking_pct: number;
  hh_member_covered_health_insurance_pct: number;
  women_age_15_49_who_are_literate_pct: number;
  women_age_15_49_with_10_or_more_years_of_schooling_pct: number;
  institutional_birth_5y_pct: number;
  births_attended_by_skilled_hp_5y_10_pct: number;
  child_u5_who_are_stunted_height_for_age_18_pct: number;
  child_u5_who_are_underweight_weight_for_age_18_pct: number;
  all_w15_49_who_are_anaemic_pct: number;
  w15_plus_with_high_bp_sys_gte_140_mmhg_and_or_dia_gte_90_mm_pct: number;
  m15_plus_with_high_bp_sys_gte_140_mmhg_and_or_dia_gte_90_mm_pct: number;
}

interface FacilityOverview {
  facility_count: number;
  state_count: number;
  hospital_count: number;
  clinic_count: number;
}

interface FacilityOption {
  value: string;
  facility_count: number;
}

interface FacilityOptions {
  states: FacilityOption[];
  types: FacilityOption[];
}

interface Facility {
  unique_id: string;
  name: string;
  description: string | null;
  facility_type_id: string | null;
  operator_type_id: string | null;
  address_city: string | null;
  address_state_or_region: string | null;
  official_phone: string | null;
  official_website: string | null;
  specialties: string | null;
  capability: string | null;
  latitude: string | null;
  longitude: string | null;
}

const sortOptions = [
  { value: 'anaemia', label: 'Anaemia' },
  { value: 'sanitation', label: 'Sanitation' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'schooling', label: 'Schooling' },
  { value: 'births', label: 'Institutional births' },
];

const formatPct = (value: number | string | null | undefined) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(1)}%` : 'n/a';
};

const formatCount = (value: number | string | null | undefined) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? new Intl.NumberFormat('en-US').format(numeric) : 'n/a';
};

const normalizeText = (value: string | null | undefined, fallback = 'n/a') => {
  if (!value || value === 'null') return fallback;
  return value;
};

const formatToken = (value: string | null | undefined, fallback = 'Unspecified') => {
  const normalized = normalizeText(value, fallback);
  if (normalized === fallback) return fallback;
  return normalized
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const parseListPreview = (value: string | null | undefined) => {
  const normalized = normalizeText(value, '');
  if (!normalized) return 'No specialty data';

  try {
    const parsed = JSON.parse(normalized) as unknown;
    if (Array.isArray(parsed)) {
      const values = parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
      return values.slice(0, 3).map((item) => formatToken(item, item)).join(', ') || 'No specialty data';
    }
  } catch {
    // Keep the original string when JSON parsing fails.
  }

  return normalized.slice(0, 120);
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export default function App() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [states, setStates] = useState<StateOption[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [query, setQuery] = useState('');
  const [state, setState] = useState('');
  const [sort, setSort] = useState('anaemia');
  const [healthLoading, setHealthLoading] = useState(true);
  const [districtsLoading, setDistrictsLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [facilityOverview, setFacilityOverview] = useState<FacilityOverview | null>(null);
  const [facilityOptions, setFacilityOptions] = useState<FacilityOptions>({ states: [], types: [] });
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilityQuery, setFacilityQuery] = useState('');
  const [facilityState, setFacilityState] = useState('');
  const [facilityType, setFacilityType] = useState('');
  const [facilityLoading, setFacilityLoading] = useState(true);
  const [facilitiesLoading, setFacilitiesLoading] = useState(true);
  const [facilityError, setFacilityError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchJson<Overview>('/api/health/overview'),
      fetchJson<StateOption[]>('/api/health/states'),
    ])
      .then(([overviewData, stateData]) => {
        setOverview(overviewData);
        setStates(stateData);
      })
      .catch((err) => setHealthError(err instanceof Error ? err.message : 'Failed to load health data'))
      .finally(() => setHealthLoading(false));
  }, []);

  useEffect(() => {
    Promise.all([
      fetchJson<FacilityOverview>('/api/facilities/overview'),
      fetchJson<FacilityOptions>('/api/facilities/options'),
    ])
      .then(([overviewData, optionsData]) => {
        setFacilityOverview(overviewData);
        setFacilityOptions(optionsData);
      })
      .catch((err) => setFacilityError(err instanceof Error ? err.message : 'Failed to load facility data'))
      .finally(() => setFacilityLoading(false));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (state) params.set('state', state);
    params.set('sort', sort);

    async function loadDistricts() {
      setDistrictsLoading(true);
      try {
        const response = await fetch(`/api/health/districts?${params.toString()}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        const nextDistricts = (await response.json()) as District[];
        setDistricts(nextDistricts);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setHealthError(err instanceof Error ? err.message : 'Failed to load districts');
      } finally {
        setDistrictsLoading(false);
      }
    }

    void loadDistricts();

    return () => controller.abort();
  }, [query, state, sort]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (facilityQuery.trim()) params.set('q', facilityQuery.trim());
    if (facilityState) params.set('state', facilityState);
    if (facilityType) params.set('type', facilityType);

    async function loadFacilities() {
      setFacilitiesLoading(true);
      try {
        const response = await fetch(`/api/facilities/search?${params.toString()}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        const nextFacilities = (await response.json()) as Facility[];
        setFacilities(nextFacilities);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setFacilityError(err instanceof Error ? err.message : 'Failed to load facilities');
      } finally {
        setFacilitiesLoading(false);
      }
    }

    void loadFacilities();

    return () => controller.abort();
  }, [facilityQuery, facilityState, facilityType]);

  const selectedStateCount = useMemo(() => {
    if (!state) return states.reduce((sum, item) => sum + Number(item.district_count), 0);
    return states.find((item) => item.state_ut === state)?.district_count ?? 0;
  }, [state, states]);

  const selectedFacilityStateCount = useMemo(() => {
    if (!facilityState) return facilityOverview?.facility_count ?? 0;
    return facilityOptions.states.find((item) => item.value === facilityState)?.facility_count ?? 0;
  }, [facilityOverview?.facility_count, facilityOptions.states, facilityState]);

  return (
    <main className="min-h-screen bg-[#F9F7F4] text-[#0B2026]">
      <section className="border-b border-[#0B2026]/10 bg-[#EEEDE9]">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-8 md:px-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-normal text-[#FF3621]">
                <Database className="h-4 w-4" />
                Lakebase synced datasets
              </div>
              <h1 className="text-3xl font-bold tracking-normal md:text-5xl">
                Hackathon health and facility explorer
              </h1>
              <p className="max-w-2xl text-base leading-7 text-[#0B2026]/70">
                District-level NFHS-5 indicators and a deduplicated healthcare facility directory served from Unity Catalog snapshots synced into Lakebase Postgres for low-latency application reads.
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-md border border-[#0B2026]/15 bg-white px-4 py-3 text-sm shadow-sm">
              <Sparkles className="h-5 w-5 text-[#FF3621]" />
              <div>
                <div className="font-semibold">Sources</div>
                <div className="text-[#0B2026]/65">DAIS 2026 hackathon datasets</div>
              </div>
            </div>
          </div>

          {healthError && (
            <InlineError message={healthError} />
          )}
          {facilityError && facilityError !== healthError && (
            <InlineError message={facilityError} />
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <MetricCard
              icon={<Building2 className="h-5 w-5" />}
              label="Districts"
              value={healthLoading ? null : formatCount(overview?.district_count)}
              detail={`${formatCount(overview?.state_count)} states and territories`}
            />
            <MetricCard
              icon={<Droplets className="h-5 w-5" />}
              label="Improved sanitation"
              value={healthLoading ? null : formatPct(overview?.avg_sanitation_pct)}
              detail="Average household coverage"
            />
            <MetricCard
              icon={<ShieldCheck className="h-5 w-5" />}
              label="Health insurance"
              value={healthLoading ? null : formatPct(overview?.avg_insurance_pct)}
              detail="Average household member coverage"
            />
            <MetricCard
              icon={<HeartPulse className="h-5 w-5" />}
              label="Anaemia"
              value={healthLoading ? null : formatPct(overview?.avg_anaemia_pct)}
              detail="Women ages 15-49"
            />
            <MetricCard
              icon={<Stethoscope className="h-5 w-5" />}
              label="Facilities"
              value={facilityLoading ? null : formatCount(facilityOverview?.facility_count)}
              detail={`${formatCount(facilityOverview?.state_count)} states in directory`}
            />
            <MetricCard
              icon={<MapPin className="h-5 w-5" />}
              label="Hospitals / clinics"
              value={facilityLoading ? null : `${formatCount(facilityOverview?.hospital_count)} / ${formatCount(facilityOverview?.clinic_count)}`}
              detail="Top facility types"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-6 md:px-8 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          <Card className="rounded-md border-[#0B2026]/10 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Health filters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="block space-y-2 text-sm font-medium">
                <span>District or state</span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#0B2026]/45" />
                  <Input
                    className="pl-9"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search districts"
                  />
                </div>
              </label>

              <label className="block space-y-2 text-sm font-medium">
                <span>State or territory</span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={state}
                  onChange={(event) => setState(event.target.value)}
                >
                  <option value="">All states</option>
                  {states.map((option) => (
                    <option key={option.state_ut} value={option.state_ut}>
                      {option.state_ut}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2 text-sm font-medium">
                <span>Rank by</span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                >
                  {sortOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setQuery('');
                  setState('');
                  setSort('anaemia');
                }}
              >
                Reset health filters
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-md border-[#0B2026]/10 shadow-sm">
            <CardContent className="space-y-2 pt-6 text-sm">
              <div className="font-semibold">{formatCount(selectedStateCount)} districts in scope</div>
              <p className="leading-6 text-[#0B2026]/65">
                Results are read through AppKit server routes from the synced Postgres table
                <span className="font-mono"> public.health_indicators</span>.
              </p>
            </CardContent>
          </Card>
        </aside>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">District results</h2>
              <p className="text-sm text-[#0B2026]/65">Showing up to 80 districts sorted by the selected indicator.</p>
            </div>
            <div className="hidden items-center gap-2 rounded-md bg-[#0B2026] px-3 py-2 text-sm text-white md:flex">
              <Activity className="h-4 w-4 text-[#FF3621]" />
              Lakebase read path
            </div>
          </div>

          {districtsLoading ? (
            <div className="grid gap-3">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-32 rounded-md" />
              ))}
            </div>
          ) : (
            <div className="grid gap-3">
              {districts.map((district) => (
                <DistrictCard key={`${district.state_ut}-${district.district_name}`} district={district} />
              ))}
              {districts.length === 0 && (
                <div className="rounded-md border border-[#0B2026]/10 bg-white p-8 text-center text-[#0B2026]/65">
                  No districts match the current filters.
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="border-t border-[#0B2026]/10 bg-[#F2EFE8]">
        <div className="mx-auto grid max-w-7xl gap-5 px-5 py-6 md:px-8 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-4">
            <Card className="rounded-md border-[#0B2026]/10 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Facility filters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <label className="block space-y-2 text-sm font-medium">
                  <span>Facility, city, state, specialty</span>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#0B2026]/45" />
                    <Input
                      className="pl-9"
                      value={facilityQuery}
                      onChange={(event) => setFacilityQuery(event.target.value)}
                      placeholder="Search facilities"
                    />
                  </div>
                </label>

                <label className="block space-y-2 text-sm font-medium">
                  <span>State</span>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={facilityState}
                    onChange={(event) => setFacilityState(event.target.value)}
                  >
                    <option value="">All states</option>
                    {facilityOptions.states.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.value}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-2 text-sm font-medium">
                  <span>Facility type</span>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={facilityType}
                    onChange={(event) => setFacilityType(event.target.value)}
                  >
                    <option value="">All types</option>
                    {facilityOptions.types.map((option) => (
                      <option key={option.value} value={option.value}>
                        {formatToken(option.value)}
                      </option>
                    ))}
                  </select>
                </label>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setFacilityQuery('');
                    setFacilityState('');
                    setFacilityType('');
                  }}
                >
                  Reset facility filters
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-md border-[#0B2026]/10 shadow-sm">
              <CardContent className="space-y-2 pt-6 text-sm">
                <div className="font-semibold">{formatCount(selectedFacilityStateCount)} facilities in scope</div>
                <p className="leading-6 text-[#0B2026]/65">
                  Searches are served from the synced Postgres table
                  <span className="font-mono"> public.facilities</span>.
                </p>
              </CardContent>
            </Card>
          </aside>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Facility search</h2>
                <p className="text-sm text-[#0B2026]/65">
                  Browse up to 60 healthcare facilities with low-latency lookup filters backed by Lakebase.
                </p>
              </div>
              <div className="hidden items-center gap-2 rounded-md bg-white px-3 py-2 text-sm text-[#0B2026] shadow-sm md:flex">
                <Stethoscope className="h-4 w-4 text-[#FF3621]" />
                Facility directory
              </div>
            </div>

            {facilitiesLoading ? (
              <div className="grid gap-3">
                {Array.from({ length: 5 }, (_, index) => (
                  <Skeleton key={index} className="h-40 rounded-md" />
                ))}
              </div>
            ) : (
              <div className="grid gap-3">
                {facilities.map((facility) => (
                  <FacilityCard key={facility.unique_id} facility={facility} />
                ))}
                {facilities.length === 0 && (
                  <div className="rounded-md border border-[#0B2026]/10 bg-white p-8 text-center text-[#0B2026]/65">
                    No facilities match the current filters. If this table was just synced, the initial Lakebase snapshot may still be finishing.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-[#FF3621]/30 bg-white px-4 py-3 text-sm text-[#8A1F13]">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  detail: string;
}) {
  return (
    <Card className="rounded-md border-[#0B2026]/10 bg-white shadow-sm">
      <CardContent className="flex items-start gap-4 p-5">
        <div className="rounded-md bg-[#FF3621]/10 p-2 text-[#FF3621]">{icon}</div>
        <div>
          <div className="text-sm text-[#0B2026]/65">{label}</div>
          <div className="mt-1 text-2xl font-semibold">{value ?? <Skeleton className="h-8 w-20" />}</div>
          <div className="mt-1 text-xs text-[#0B2026]/55">{detail}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function DistrictCard({ district }: { district: District }) {
  return (
    <Card className="rounded-md border-[#0B2026]/10 bg-white shadow-sm">
      <CardContent className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold">{district.district_name}</h3>
            <p className="text-sm text-[#0B2026]/65">{district.state_ut}</p>
            <p className="mt-3 text-sm text-[#0B2026]/70">
              {formatCount(district.households_surveyed)} households surveyed,
              {' '}
              {formatCount(district.women_15_49_interviewed)} women interviewed
            </p>
          </div>

          <div className="grid min-w-full gap-2 sm:grid-cols-2 lg:min-w-[520px] lg:grid-cols-4">
            <Indicator label="Anaemia" value={district.all_w15_49_who_are_anaemic_pct} tone="red" />
            <Indicator label="Sanitation" value={district.hh_use_improved_sanitation_pct} tone="green" />
            <Indicator label="Insurance" value={district.hh_member_covered_health_insurance_pct} tone="blue" />
            <Indicator label="Institutional births" value={district.institutional_birth_5y_pct} tone="dark" />
          </div>
        </div>

        <div className="mt-4 grid gap-2 border-t border-[#0B2026]/10 pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <MiniStat label="Women literacy" value={district.women_age_15_49_who_are_literate_pct} />
          <MiniStat label="Clean cooking fuel" value={district.households_using_clean_fuel_for_cooking_pct} />
          <MiniStat label="Child stunting" value={district.child_u5_who_are_stunted_height_for_age_18_pct} />
          <MiniStat label="High BP, women" value={district.w15_plus_with_high_bp_sys_gte_140_mmhg_and_or_dia_gte_90_mm_pct} />
        </div>
      </CardContent>
    </Card>
  );
}

function FacilityCard({ facility }: { facility: Facility }) {
  const city = normalizeText(facility.address_city);
  const state = normalizeText(facility.address_state_or_region);
  const website = normalizeText(facility.official_website, '');
  const phone = normalizeText(facility.official_phone, '');

  return (
    <Card className="rounded-md border-[#0B2026]/10 bg-white shadow-sm">
      <CardContent className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div>
              <h3 className="text-lg font-semibold">{facility.name}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#0B2026]/60">
                <Badge>{formatToken(facility.facility_type_id)}</Badge>
                <Badge>{formatToken(facility.operator_type_id)}</Badge>
              </div>
            </div>

            <p className="text-sm leading-6 text-[#0B2026]/72">
              {normalizeText(facility.description, 'No description available.')}
            </p>

            <div className="grid gap-2 text-sm text-[#0B2026]/72 sm:grid-cols-2">
              <MetaLine icon={<MapPin className="h-4 w-4" />} text={`${city}${state !== 'n/a' ? `, ${state}` : ''}`} />
              <MetaLine icon={<Phone className="h-4 w-4" />} text={phone || 'No phone listed'} />
              <MetaLine icon={<Globe className="h-4 w-4" />} text={website || 'No website listed'} />
              <MetaLine icon={<Stethoscope className="h-4 w-4" />} text={parseListPreview(facility.specialties)} />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[240px] lg:grid-cols-1">
            <MiniStat label="Directory ID" value={facility.unique_id.slice(0, 8)} />
            <MiniStat label="Capabilities" value={parseListPreview(facility.capability)} />
            <MiniStat
              label="Coordinates"
              value={
                facility.latitude && facility.longitude && facility.latitude !== 'null' && facility.longitude !== 'null'
                  ? `${facility.latitude}, ${facility.longitude}`
                  : 'Unavailable'
              }
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetaLine({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-[#FF3621]">{icon}</span>
      <span className="min-w-0 break-words">{text}</span>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-[#0B2026]/6 px-2.5 py-1 font-medium text-[#0B2026]">
      {children}
    </span>
  );
}

function Indicator({ label, value, tone }: { label: string; value: number; tone: 'red' | 'green' | 'blue' | 'dark' }) {
  const toneClass = {
    red: 'bg-[#FF3621]/10 text-[#8A1F13]',
    green: 'bg-emerald-50 text-emerald-800',
    blue: 'bg-sky-50 text-sky-800',
    dark: 'bg-[#0B2026] text-white',
  }[tone];

  return (
    <div className={`rounded-md px-3 py-2 ${toneClass}`}>
      <div className="text-xs opacity-75">{label}</div>
      <div className="text-lg font-semibold">{formatPct(value)}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xs text-[#0B2026]/55">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
