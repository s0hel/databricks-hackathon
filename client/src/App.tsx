import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Bot,
  Building2,
  CheckCircle2,
  Database,
  Edit3,
  Droplets,
  Gauge,
  Globe,
  HeartPulse,
  History,
  Info,
  Layers,
  MapPin,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Target,
  Save,
  X,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  GenieChat,
  Input,
  Skeleton,
} from '@databricks/appkit-ui/react';
import { INDIA_BOUNDARY_PATHS, INDIA_MAP_BOUNDS } from './lib/india-boundary';

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

interface FacilityDataQualitySample {
  raw_state?: string | null;
  district_key?: string | null;
  district_name?: string | null;
  facility_count?: number;
  state_match_count?: number;
}

interface GeographyQualityCount {
  geography_quality: string;
  facility_count: number;
}

interface FacilityDataQuality {
  raw_facility_state_distinct_count: number;
  normalized_facility_state_distinct_count: number;
  unmapped_facility_state_count: number;
  ambiguous_district_mapping_count: number;
  missing_facility_coordinate_count: number;
  missing_pincode_coordinate_count: number;
  missing_facility_type_count: number;
  farmacy_type_count: number;
  unmapped_facility_state_samples: FacilityDataQualitySample[];
  ambiguous_district_samples: FacilityDataQualitySample[];
  geography_quality_counts: GeographyQualityCount[];
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
  doctors: string | null;
  latitude: string | null;
  longitude: string | null;
  capability_trust_signals?: CapabilityTrustScore[];
}

type CapabilityTrustSignal = 'strong evidence' | 'partial evidence' | 'weak or suspicious evidence' | 'no claim';

interface CapabilityEvidence {
  source: keyof Pick<Facility, 'facility_type_id' | 'specialties' | 'capability' | 'description' | 'doctors'>;
  excerpt: string;
  weight: number;
}

interface CapabilityTrustScore {
  capability: string;
  label: string;
  signal: CapabilityTrustSignal;
  score: number;
  evidence: CapabilityEvidence[];
}

interface FacilityAuditLog {
  id: number;
  facility_unique_id: string;
  changed_at: string;
  changed_by: string;
  change_note: string | null;
  changed_fields: string[];
  old_values: Partial<Facility>;
  new_values: Partial<Facility>;
}

interface FacilityEditForm {
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
  doctors: string | null;
  latitude: string | null;
  longitude: string | null;
  note: string;
}

interface GapRegion {
  geography_key: string;
  geography_name: string;
  state_name: string;
  district_count: number;
  households_surveyed: number;
  women_interviewed: number;
  anaemia_pct: number;
  sanitation_pct: number;
  insurance_pct: number;
  institutional_birth_pct: number;
  stunting_pct: number;
  high_bp_women_pct: number;
  facility_count: number;
  hospital_count: number;
  clinic_count: number;
  geocoded_count: number;
  contactable_count: number;
  described_count: number;
  pincode_count: number;
  post_office_count: number;
  branch_office_count: number;
  delivery_office_count: number;
  geocoded_pincode_count: number;
  centroid_latitude: number | null;
  centroid_longitude: number | null;
  nearest_hospital_km: number | null;
  need_score: number;
  facility_evidence_score: number;
  facility_evidence_per_10k_households: number;
  supply_adequacy_score: number;
  geographic_access_score: number;
  facilities_per_100_pincodes: number;
  gap_score: number;
  confidence_score: number;
  evidence_label: string;
  confidence_label: 'High' | 'Medium' | 'Low';
  confidence_factors: ConfidenceFactor[];
}

interface ConfidenceFactor {
  label: string;
  severity: 'high' | 'medium';
  detail: string;
}

const sortOptions = [
  { value: 'anaemia', label: 'Anaemia' },
  { value: 'sanitation', label: 'Sanitation' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'schooling', label: 'Schooling' },
  { value: 'births', label: 'Institutional births' },
];

type ActiveTab = 'gaps' | 'health' | 'facilities' | 'genie';
type ScoreMetricLabel = 'Gap score' | 'Need' | 'Supply adequacy' | 'Access pressure' | 'Confidence';
type MapMetric = 'gap' | 'need';

const metricDescriptions: Record<ScoreMetricLabel, string> = {
  'Gap score':
    'Overall priority score from health need, reduced by supply adequacy, plus 30% of access pressure. Higher means a stronger likely care gap.',
  Need: 'Average burden score from anaemia, child stunting, high blood pressure, and gaps in sanitation, insurance, and institutional births. Higher means greater health need.',
  'Supply adequacy':
    'Log-scaled facility evidence per 10k surveyed households. Hospitals count most, clinics partially, and mapped, contactable, described facilities add trust signals. Higher means stronger supply.',
  'Access pressure':
    'Geographic access strain from distance to the nearest hospital, pincodes per facility, branch-office share, and unmapped pincode coverage. Higher means harder access.',
  Confidence:
    'Data support score from surveyed households, women interviewed, facility count, pincode coverage, and mapped pincodes. Higher means the gap classification is better supported.',
};

const toFiniteNumber = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const formatPct = (value: number | string | null | undefined) => {
  const numeric = toFiniteNumber(value);
  return numeric !== null ? `${numeric.toFixed(1)}%` : 'n/a';
};

const formatCount = (value: number | string | null | undefined) => {
  const numeric = toFiniteNumber(value);
  return numeric !== null ? new Intl.NumberFormat('en-US').format(numeric) : 'n/a';
};

const formatScore = (value: number | string | null | undefined) => {
  const numeric = toFiniteNumber(value);
  return numeric !== null ? numeric.toFixed(1) : 'n/a';
};

const formatKm = (value: number | string | null | undefined) => {
  const numeric = toFiniteNumber(value);
  return numeric !== null ? `${numeric.toFixed(1)} km` : 'n/a';
};

const formatMinutes = (value: number | string | null | undefined) => {
  const numeric = toFiniteNumber(value);
  return numeric !== null ? `${Math.round(numeric)} min` : 'n/a';
};

const formatCompact = (value: number | string | null | undefined) => {
  const numeric = toFiniteNumber(value);
  return numeric !== null
    ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(numeric)
    : 'n/a';
};

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

const getHospitalCoverageIndex = (gap: GapRegion) => clamp(toFiniteNumber(gap.supply_adequacy_score) ?? 0);

const getUnderservedPopulationProxy = (gap: GapRegion) => {
  const households = toFiniteNumber(gap.households_surveyed);
  const gapWeight = clamp(Number(gap.gap_score) || 0) / 100;
  return households !== null ? Math.round(households * gapWeight) : null;
};

const getTravelTimeMinutes = (gap: GapRegion) => {
  const distanceKm = toFiniteNumber(gap.nearest_hospital_km);
  return distanceKm !== null ? distanceKm * 1.5 : null;
};

const gapCardId = (key: string) => `gap-card-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

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
      return (
        values
          .slice(0, 3)
          .map((item) => formatToken(item, item))
          .join(', ') || 'No specialty data'
      );
    }
  } catch {
    // Keep the original string when JSON parsing fails.
  }

  return normalized.slice(0, 120);
};

const capabilitySignalRank: Record<CapabilityTrustSignal, number> = {
  'strong evidence': 0,
  'partial evidence': 1,
  'weak or suspicious evidence': 2,
  'no claim': 3,
};

const capabilitySignalTone: Record<CapabilityTrustSignal, string> = {
  'strong evidence': 'border-emerald-700/20 bg-emerald-50 text-emerald-900',
  'partial evidence': 'border-sky-700/20 bg-sky-50 text-sky-900',
  'weak or suspicious evidence': 'border-amber-700/20 bg-amber-50 text-amber-950',
  'no claim': 'border-[#0B2026]/10 bg-[#F9F7F4] text-[#0B2026]/60',
};

const sourceLabel = (source: CapabilityEvidence['source']) =>
  ({
    facility_type_id: 'Type',
    specialties: 'Specialty',
    capability: 'Capability',
    description: 'Description',
    doctors: 'Doctors',
  })[source];

const capabilityTrustDescription =
  'Capability trust score is an evidence-weighted total. Capability field matches add 3 points, specialties and facility type add 2, and description or doctors add 1. The current maximum is 9 if all five fields support the same capability. Strong evidence requires a capability claim plus support, two structured sources, or 5+ points; partial evidence usually means one structured source or 3+ points; narrative-only evidence is weak.';

const confidenceFactorTone: Record<ConfidenceFactor['severity'], string> = {
  high: 'border-[#FF3621]/25 bg-[#FF3621]/10 text-[#8A1F13]',
  medium: 'border-amber-500/30 bg-amber-50 text-amber-900',
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

async function saveJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

const toFormValue = (value: string | null | undefined) => {
  if (!value || value === 'null') return '';
  return value;
};

const toNullableFormValue = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const buildFacilityForm = (facility: Facility): FacilityEditForm => ({
  name: toFormValue(facility.name),
  description: toNullableFormValue(toFormValue(facility.description)),
  facility_type_id: toNullableFormValue(toFormValue(facility.facility_type_id)),
  operator_type_id: toNullableFormValue(toFormValue(facility.operator_type_id)),
  address_city: toNullableFormValue(toFormValue(facility.address_city)),
  address_state_or_region: toNullableFormValue(toFormValue(facility.address_state_or_region)),
  official_phone: toNullableFormValue(toFormValue(facility.official_phone)),
  official_website: toNullableFormValue(toFormValue(facility.official_website)),
  specialties: toNullableFormValue(toFormValue(facility.specialties)),
  capability: toNullableFormValue(toFormValue(facility.capability)),
  doctors: toNullableFormValue(toFormValue(facility.doctors)),
  latitude: toNullableFormValue(toFormValue(facility.latitude)),
  longitude: toNullableFormValue(toFormValue(facility.longitude)),
  note: '',
});

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('gaps');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [states, setStates] = useState<StateOption[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [query, setQuery] = useState('');
  const [state, setState] = useState('');
  const [sort, setSort] = useState('anaemia');
  const [healthLoading, setHealthLoading] = useState(true);
  const [districtsLoading, setDistrictsLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [gaps, setGaps] = useState<GapRegion[]>([]);
  const [gapLevel, setGapLevel] = useState<'state' | 'district'>('state');
  const [gapQuery, setGapQuery] = useState('');
  const [gapState, setGapState] = useState('');
  const [minConfidence, setMinConfidence] = useState('0');
  const [mapMetric, setMapMetric] = useState<MapMetric>('gap');
  const [selectedGapKey, setSelectedGapKey] = useState<string | null>(null);
  const [gapLoading, setGapLoading] = useState(true);
  const [gapError, setGapError] = useState<string | null>(null);

  const [facilityOverview, setFacilityOverview] = useState<FacilityOverview | null>(null);
  const [facilityDataQuality, setFacilityDataQuality] = useState<FacilityDataQuality | null>(null);
  const [facilityOptions, setFacilityOptions] = useState<FacilityOptions>({ states: [], types: [] });
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilityQuery, setFacilityQuery] = useState('');
  const [facilityState, setFacilityState] = useState('');
  const [facilityType, setFacilityType] = useState('');
  const [, setFacilityLoading] = useState(false);
  const [facilityDataQualityLoading, setFacilityDataQualityLoading] = useState(false);
  const [facilitiesLoading, setFacilitiesLoading] = useState(false);
  const [facilityError, setFacilityError] = useState<string | null>(null);
  const [editRevision, setEditRevision] = useState(0);

  useEffect(() => {
    Promise.all([fetchJson<Overview>('/api/health/overview'), fetchJson<StateOption[]>('/api/health/states')])
      .then(([overviewData, stateData]) => {
        setOverview(overviewData);
        setStates(stateData);
      })
      .catch((err) => setHealthError(err instanceof Error ? err.message : 'Failed to load health data'))
      .finally(() => setHealthLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab !== 'facilities') return;

    setFacilityLoading(true);
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
  }, [activeTab, editRevision]);

  useEffect(() => {
    if (activeTab !== 'facilities') return;

    setFacilityDataQualityLoading(true);
    fetchJson<FacilityDataQuality>('/api/facilities/data-quality')
      .then((dataQualityData) => setFacilityDataQuality(dataQualityData))
      .catch((err) =>
        setFacilityError(err instanceof Error ? err.message : 'Failed to load facility data quality diagnostics')
      )
      .finally(() => setFacilityDataQualityLoading(false));
  }, [activeTab, editRevision]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    params.set('level', gapLevel);
    params.set('minConfidence', minConfidence);
    if (gapQuery.trim()) params.set('q', gapQuery.trim());
    if (gapState) params.set('state', gapState);

    async function loadGaps() {
      setGapLoading(true);
      try {
        const response = await fetch(`/api/gaps/regions?${params.toString()}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        const nextGaps = (await response.json()) as GapRegion[];
        setGaps(nextGaps);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setGapError(err instanceof Error ? err.message : 'Failed to load care gaps');
      } finally {
        setGapLoading(false);
      }
    }

    void loadGaps();

    return () => controller.abort();
  }, [editRevision, gapLevel, gapQuery, gapState, minConfidence]);

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
    if (activeTab !== 'facilities') return;

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
  }, [activeTab, editRevision, facilityQuery, facilityState, facilityType]);

  const selectedStateCount = useMemo(() => {
    if (!state) return states.reduce((sum, item) => sum + Number(item.district_count), 0);
    return states.find((item) => item.state_ut === state)?.district_count ?? 0;
  }, [state, states]);

  const selectedFacilityStateCount = useMemo(() => {
    if (!facilityState) return facilityOverview?.facility_count ?? 0;
    return facilityOptions.states.find((item) => item.value === facilityState)?.facility_count ?? 0;
  }, [facilityOverview?.facility_count, facilityOptions.states, facilityState]);

  const gapSummary = useMemo(() => {
    const realGaps = gaps.filter((gap) => gap.evidence_label === 'Likely real gap');
    const dataPoor = gaps.filter((gap) => gap.evidence_label === 'Data-poor');
    const topGap = gaps[0];

    return {
      realGapCount: realGaps.length,
      dataPoorCount: dataPoor.length,
      topGap,
      highConfidenceCount: gaps.filter((gap) => gap.confidence_label === 'High').length,
    };
  }, [gaps]);

  const selectedGap = useMemo(
    () => gaps.find((gap) => gap.geography_key === selectedGapKey) ?? null,
    [gaps, selectedGapKey]
  );

  useEffect(() => {
    if (selectedGapKey && !gaps.some((gap) => gap.geography_key === selectedGapKey)) {
      setSelectedGapKey(null);
    }
  }, [gaps, selectedGapKey]);

  const selectGapFromMap = (gap: GapRegion) => {
    setSelectedGapKey(gap.geography_key);
    window.setTimeout(() => {
      document.getElementById(gapCardId(gap.geography_key))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  const handleFacilitySaved = (updatedFacility: Facility) => {
    setFacilities((current) =>
      current.map((facility) => (facility.unique_id === updatedFacility.unique_id ? updatedFacility : facility))
    );
    setEditRevision((revision) => revision + 1);
  };

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
              <h1 className="text-3xl font-bold tracking-normal md:text-5xl">Care gap confidence planner</h1>
              <p className="max-w-2xl text-base leading-7 text-[#0B2026]/70">
                Trust-weighted facility evidence and district health burden combined by geography, so planners can
                separate likely gaps in care from places where the data is too thin to call.
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

          {healthError && <InlineError message={healthError} />}
          {facilityError && facilityError !== healthError && <InlineError message={facilityError} />}
          {gapError && gapError !== healthError && gapError !== facilityError && <InlineError message={gapError} />}

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
              icon={<Target className="h-5 w-5" />}
              label="Likely real gaps"
              value={gapLoading ? null : formatCount(gapSummary.realGapCount)}
              detail="High need with sparse supply"
            />
            <MetricCard
              icon={<Gauge className="h-5 w-5" />}
              label="High-confidence regions"
              value={gapLoading ? null : formatCount(gapSummary.highConfidenceCount)}
              detail={`${formatCount(gapSummary.dataPoorCount)} data-poor in current rank`}
            />
          </div>
        </div>
      </section>

      <section className="border-b border-[#0B2026]/10 bg-[#F9F7F4]">
        <div className="mx-auto max-w-7xl px-5 py-4 md:px-8">
          <div
            className="grid gap-2 rounded-md border border-[#0B2026]/10 bg-white p-1 shadow-sm sm:grid-cols-2 lg:grid-cols-4"
            role="tablist"
            aria-label="Planning sections"
          >
            <TabButton
              active={activeTab === 'gaps'}
              icon={<Target className="h-4 w-4" />}
              label="Gaps"
              onClick={() => setActiveTab('gaps')}
            />
            <TabButton
              active={activeTab === 'health'}
              icon={<Activity className="h-4 w-4" />}
              label="Health indicators"
              onClick={() => setActiveTab('health')}
            />
            <TabButton
              active={activeTab === 'facilities'}
              icon={<Stethoscope className="h-4 w-4" />}
              label="Facilities"
              onClick={() => setActiveTab('facilities')}
            />
            <TabButton
              active={activeTab === 'genie'}
              icon={<Bot className="h-4 w-4" />}
              label="Genie"
              onClick={() => setActiveTab('genie')}
            />
          </div>
        </div>
      </section>

      {activeTab === 'gaps' && (
        <section className="mx-auto grid max-w-7xl gap-5 px-5 py-6 md:px-8 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-4">
            <Card className="rounded-md border-[#0B2026]/10 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Gap controls</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <label className="block space-y-2 text-sm font-medium">
                  <span>Geography</span>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={gapLevel}
                    onChange={(event) => setGapLevel(event.target.value as 'state' | 'district')}
                  >
                    <option value="state">State</option>
                    <option value="district">District</option>
                  </select>
                </label>

                <label className="block space-y-2 text-sm font-medium">
                  <span>State or region</span>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={gapState}
                    onChange={(event) => setGapState(event.target.value)}
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
                  <span>Search geography</span>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#0B2026]/45" />
                    <Input
                      className="pl-9"
                      value={gapQuery}
                      onChange={(event) => setGapQuery(event.target.value)}
                      placeholder="Search locations"
                    />
                  </div>
                </label>

                <label className="block space-y-2 text-sm font-medium">
                  <span>Minimum confidence</span>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={minConfidence}
                    onChange={(event) => setMinConfidence(event.target.value)}
                  >
                    <option value="0">Any confidence</option>
                    <option value="50">Medium or high</option>
                    <option value="75">High confidence</option>
                  </select>
                </label>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setGapLevel('state');
                    setGapState('');
                    setGapQuery('');
                    setMinConfidence('0');
                    setSelectedGapKey(null);
                  }}
                >
                  Reset gap controls
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-md border-[#0B2026]/10 shadow-sm">
              <CardContent className="space-y-3 pt-6 text-sm">
                <div className="flex items-center gap-2 font-semibold">
                  <Layers className="h-4 w-4 text-[#FF3621]" />
                  Evidence model
                </div>
                <p className="leading-6 text-[#0B2026]/65">
                  Need combines anaemia, sanitation, insurance, institutional births, child stunting, and high blood
                  pressure. Supply is down-weighted when facilities lack type, location, contact, or service details.
                  Pincode coverage adds geographic access pressure from remote post-office areas and distance to the
                  nearest hospital.
                </p>
              </CardContent>
            </Card>
          </aside>

          <div className="space-y-4">
            <InsightLayersPanel gaps={gaps} selectedGap={selectedGap} loading={gapLoading} />

            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Highest-risk gaps in care</h2>
                <p className="text-sm text-[#0B2026]/65">
                  Ranked by high health burden, low trust-weighted facility evidence, and filtered by confidence.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[420px]">
                <div className="rounded-md border border-[#0B2026]/10 bg-white px-4 py-3 text-sm shadow-sm">
                  <div className="text-xs text-[#0B2026]/55">Current top gap</div>
                  <div className="font-semibold">
                    {gapLoading ? 'Loading' : gapSummary.topGap ? gapSummary.topGap.geography_name : 'No match'}
                  </div>
                </div>
                <div className="rounded-md border border-[#0B2026]/10 bg-white px-4 py-3 text-sm shadow-sm">
                  <div className="text-xs text-[#0B2026]/55">Selected region</div>
                  <div className="font-semibold">{selectedGap ? selectedGap.geography_name : 'Click a heat point'}</div>
                </div>
              </div>
            </div>

            {gapLoading ? (
              <div className="grid gap-3">
                <Skeleton className="h-[520px] rounded-md" />
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="h-44 rounded-md" />
                ))}
              </div>
            ) : (
              <div className="grid gap-4">
                <Card className="rounded-md border-[#0B2026]/10 bg-white shadow-sm">
                  <CardContent className="space-y-4 p-5">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold">Geographic heat map</h3>
                        <p className="text-sm text-[#0B2026]/65">
                          Heat bubbles use pincode centroids for each {gapLevel}; click a region to open its details.
                        </p>
                      </div>
                      <div className="inline-grid rounded-md border border-[#0B2026]/10 bg-[#F9F7F4] p-1 text-sm sm:grid-cols-2">
                        <MapMetricButton
                          active={mapMetric === 'gap'}
                          label="Gaps"
                          onClick={() => setMapMetric('gap')}
                        />
                        <MapMetricButton
                          active={mapMetric === 'need'}
                          label="Needs"
                          onClick={() => setMapMetric('need')}
                        />
                      </div>
                    </div>

                    <GapHeatMap
                      gaps={gaps}
                      metric={mapMetric}
                      selectedKey={selectedGapKey}
                      onSelect={selectGapFromMap}
                    />
                  </CardContent>
                </Card>

                {gaps.map((gap) => (
                  <GapCard key={gap.geography_key} gap={gap} selected={gap.geography_key === selectedGapKey} />
                ))}
                {gaps.length === 0 && (
                  <div className="rounded-md border border-[#0B2026]/10 bg-white p-8 text-center text-[#0B2026]/65">
                    No regions match the current confidence and geography filters.
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === 'health' && (
        <section className="border-t border-[#0B2026]/10 bg-white">
          <div className="mx-auto grid max-w-7xl gap-5 px-5 py-6 md:px-8 lg:grid-cols-[320px_1fr]">
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
                  <p className="text-sm text-[#0B2026]/65">
                    Showing up to 80 districts sorted by the selected indicator.
                  </p>
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
          </div>
        </section>
      )}

      {activeTab === 'facilities' && (
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

              <FacilityDataQualityPanel diagnostics={facilityDataQuality} loading={facilityDataQualityLoading} />

              {facilitiesLoading ? (
                <div className="grid gap-3">
                  {Array.from({ length: 5 }, (_, index) => (
                    <Skeleton key={index} className="h-40 rounded-md" />
                  ))}
                </div>
              ) : (
                <div className="grid gap-3">
                  {facilities.map((facility) => (
                    <FacilityCard key={facility.unique_id} facility={facility} onSaved={handleFacilitySaved} />
                  ))}
                  {facilities.length === 0 && (
                    <div className="rounded-md border border-[#0B2026]/10 bg-white p-8 text-center text-[#0B2026]/65">
                      No facilities match the current filters. If this table was just synced, the initial Lakebase
                      snapshot may still be finishing.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {activeTab === 'genie' && (
        <section className="border-t border-[#0B2026]/10 bg-white">
          <div className="mx-auto max-w-7xl px-5 py-6 md:px-8">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Ask Genie</h2>
                <p className="text-sm text-[#0B2026]/65">
                  Ask questions across the health indicators, facility directory, and access evidence tables.
                </p>
              </div>
              <div className="inline-flex w-fit items-center gap-2 rounded-md bg-[#0B2026] px-3 py-2 text-sm text-white">
                <Bot className="h-4 w-4 text-[#FF3621]" />
                Databricks AI/BI Genie
              </div>
            </div>
            <div className="h-[720px] overflow-hidden rounded-md border border-[#0B2026]/10 bg-white shadow-sm">
              <GenieChat alias="default" />
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`flex h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors ${
        active ? 'bg-[#0B2026] text-white shadow-sm' : 'text-[#0B2026]/68 hover:bg-[#0B2026]/6 hover:text-[#0B2026]'
      }`}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
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

function MapMetricButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`h-9 rounded px-4 font-semibold transition-colors ${
        active ? 'bg-[#0B2026] text-white shadow-sm' : 'text-[#0B2026]/65 hover:bg-white hover:text-[#0B2026]'
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function GapHeatMap({
  gaps,
  metric,
  selectedKey,
  onSelect,
}: {
  gaps: GapRegion[];
  metric: MapMetric;
  selectedKey: string | null;
  onSelect: (gap: GapRegion) => void;
}) {
  const plotted = gaps
    .map((gap) => {
      const latitude = Number(gap.centroid_latitude);
      const longitude = Number(gap.centroid_longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

      const value = metric === 'gap' ? gap.gap_score : gap.need_score;
      return {
        gap,
        value,
        x: INDIA_MAP_BOUNDS.offsetX + (longitude - INDIA_MAP_BOUNDS.minLon) * INDIA_MAP_BOUNDS.scale,
        y: INDIA_MAP_BOUNDS.offsetY + (INDIA_MAP_BOUNDS.maxLat - latitude) * INDIA_MAP_BOUNDS.scale,
      };
    })
    .filter((point): point is { gap: GapRegion; value: number; x: number; y: number } => Boolean(point))
    .filter((point) => point.x >= -4 && point.x <= 104 && point.y >= -4 && point.y <= 104);

  const topRegions = [...plotted].sort((a, b) => b.value - a.value).slice(0, 5);
  const legendLabel = metric === 'gap' ? 'Gap score' : 'Need score';

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="relative min-h-[420px] overflow-hidden rounded-md border border-[#0B2026]/10 bg-[#E8F0ED]">
        <svg
          className="h-full min-h-[420px] w-full"
          viewBox="0 0 100 100"
          role="img"
          aria-label={`${legendLabel} heat map`}
        >
          <defs>
            <linearGradient id="map-water" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#F8FAF7" />
              <stop offset="100%" stopColor="#D9E8E5" />
            </linearGradient>
            <radialGradient id="heat-red">
              <stop offset="0%" stopColor="#FF3621" stopOpacity="0.88" />
              <stop offset="70%" stopColor="#FF8A00" stopOpacity="0.36" />
              <stop offset="100%" stopColor="#FF8A00" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="heat-blue">
              <stop offset="0%" stopColor="#0B6E99" stopOpacity="0.82" />
              <stop offset="70%" stopColor="#24A3B5" stopOpacity="0.34" />
              <stop offset="100%" stopColor="#24A3B5" stopOpacity="0" />
            </radialGradient>
          </defs>

          <rect width="100" height="100" fill="url(#map-water)" />
          {INDIA_BOUNDARY_PATHS.map((path) => (
            <path
              key={`fill-${path}`}
              d={path}
              fill="#F7F5EF"
              stroke="#0B2026"
              strokeOpacity="0.14"
              strokeWidth="0.24"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {plotted.map(({ gap, value, x, y }) => {
            const radius = 2.2 + Math.max(0, Math.min(100, value)) * 0.045;
            const selected = selectedKey === gap.geography_key;

            return (
              <g key={gap.geography_key}>
                <circle
                  cx={x}
                  cy={y}
                  r={radius * 2.15}
                  fill={metric === 'gap' ? 'url(#heat-red)' : 'url(#heat-blue)'}
                  className="pointer-events-none"
                />
                <circle
                  cx={x}
                  cy={y}
                  r={selected ? radius * 0.65 : radius * 0.48}
                  fill={metric === 'gap' ? '#FF3621' : '#0B6E99'}
                  fillOpacity={selected ? 1 : 0.82}
                  stroke={selected ? '#0B2026' : '#ffffff'}
                  strokeWidth={selected ? 0.95 : 0.45}
                  className="cursor-pointer transition-opacity hover:opacity-90"
                  data-map-point
                  role="button"
                  tabIndex={0}
                  aria-label={`${gap.geography_name}, ${legendLabel} ${formatScore(value)}`}
                  onClick={() => onSelect(gap)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') onSelect(gap);
                  }}
                >
                  <title>{`${gap.geography_name}, ${gap.state_name}: ${legendLabel} ${formatScore(value)}`}</title>
                </circle>
              </g>
            );
          })}

          {INDIA_BOUNDARY_PATHS.map((path) => (
            <path
              key={`stroke-${path}`}
              d={path}
              fill="none"
              stroke="#0B2026"
              strokeOpacity="0.34"
              strokeWidth="0.34"
              vectorEffect="non-scaling-stroke"
              className="pointer-events-none"
            />
          ))}
        </svg>

        <div className="absolute bottom-3 left-3 rounded-md border border-[#0B2026]/10 bg-white/95 px-3 py-2 text-xs shadow-sm">
          <div className="mb-1 font-semibold text-[#0B2026]">{legendLabel}</div>
          <div className="flex items-center gap-2">
            <span>Low</span>
            <span
              className={`block h-2 w-28 rounded-full ${
                metric === 'gap'
                  ? 'bg-gradient-to-r from-[#FFE2D7] via-[#FF8A00] to-[#FF3621]'
                  : 'bg-gradient-to-r from-[#DDF5EF] via-[#24A3B5] to-[#0B6E99]'
              }`}
            />
            <span>High</span>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-[#0B2026]/10 bg-[#F9F7F4] p-4">
        <div className="mb-3 text-sm font-semibold">Top mapped {metric === 'gap' ? 'gaps' : 'needs'}</div>
        <div className="space-y-2">
          {topRegions.map(({ gap, value }, index) => (
            <button
              type="button"
              key={gap.geography_key}
              className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                selectedKey === gap.geography_key
                  ? 'border-[#0B2026] bg-white'
                  : 'border-[#0B2026]/10 bg-white/70 hover:border-[#0B2026]/25 hover:bg-white'
              }`}
              onClick={() => onSelect(gap)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">
                  {index + 1}. {gap.geography_name}
                </span>
                <span>{formatScore(value)}</span>
              </div>
              <div className="mt-1 text-xs text-[#0B2026]/58">
                {gap.state_name} · {gap.evidence_label}
              </div>
            </button>
          ))}
          {plotted.length === 0 && (
            <div className="rounded-md border border-[#0B2026]/10 bg-white p-4 text-sm text-[#0B2026]/65">
              No centroid coordinates are available for the current filters.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function finiteValues(values: Array<number | null | undefined>) {
  return values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
}

function buildHistogramBins(values: number[], binCount: number, domainMin: number, domainMax: number) {
  const max = domainMax > domainMin ? domainMax : domainMin + 1;
  const bins = Array.from({ length: binCount }, () => 0);

  values.forEach((value) => {
    const normalized = clamp((value - domainMin) / (max - domainMin), 0, 1);
    const index = Math.min(binCount - 1, Math.floor(normalized * binCount));
    bins[index] += 1;
  });

  return {
    bins,
    domainMin,
    domainMax: max,
    maxCount: Math.max(1, ...bins),
  };
}

function InsightLayersPanel({
  gaps,
  selectedGap,
  loading,
}: {
  gaps: GapRegion[];
  selectedGap: GapRegion | null;
  loading: boolean;
}) {
  const activeGap = selectedGap ?? gaps[0] ?? null;
  const coverageValues = useMemo(() => finiteValues(gaps.map(getHospitalCoverageIndex)), [gaps]);
  const underservedValues = useMemo(() => finiteValues(gaps.map(getUnderservedPopulationProxy)), [gaps]);
  const travelValues = useMemo(() => finiteValues(gaps.map(getTravelTimeMinutes)), [gaps]);
  const underservedMax = Math.max(1, ...underservedValues);
  const travelMax = Math.max(30, ...travelValues);

  return (
    <div className="rounded-md border border-[#0B2026]/10 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 border-b border-[#0B2026]/10 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-[#0B2026]/50">
            <Layers className="h-4 w-4 text-[#FF3621]" />
            Insight layers
          </div>
          <div className="mt-1 text-sm font-semibold">
            {activeGap ? activeGap.geography_name : 'No region selected'}
          </div>
        </div>
        <div className="text-xs text-[#0B2026]/55">Current filters, selected-region marker</div>
      </div>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-3">
          <Skeleton className="h-36 rounded-md" />
          <Skeleton className="h-36 rounded-md" />
          <Skeleton className="h-36 rounded-md" />
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-3">
          <div className="rounded-md border border-sky-500/80 bg-white p-3 shadow-sm">
            <HistogramMetric
              label="Hospital Coverage Index"
              unit="0-100"
              values={coverageValues}
              selectedValue={activeGap ? getHospitalCoverageIndex(activeGap) : null}
              domainMin={0}
              domainMax={100}
              tone="green"
              lowLabel="Poor"
              highLabel="Excellent"
              formatter={formatScore}
              description="Uses the app's supply adequacy score: hospital, clinic, mapped, contactable, and described facility evidence per surveyed households."
            />
          </div>

          <div className="rounded-md border border-sky-500/80 bg-white p-3 shadow-sm">
            <HistogramMetric
              label="Amount of Population Underserved"
              unit="weighted households"
              values={underservedValues}
              selectedValue={activeGap ? getUnderservedPopulationProxy(activeGap) : null}
              domainMin={0}
              domainMax={underservedMax}
              tone="red"
              lowLabel="Min"
              highLabel="Max"
              formatter={formatCompact}
              description="Proxy from surveyed households weighted by the gap score. It ranks relative underserved demand because the current route does not expose population density."
            />
          </div>

          <div className="rounded-md border border-[#0B2026]/10 bg-white p-3 shadow-sm">
            <HistogramMetric
              label="Travel time to nearest hospital"
              unit="minutes"
              values={travelValues}
              selectedValue={activeGap ? getTravelTimeMinutes(activeGap) : null}
              domainMin={0}
              domainMax={travelMax}
              tone="gray"
              lowLabel="Fast access"
              highLabel="Delayed access"
              formatter={formatMinutes}
              description="Estimated as nearest-hospital distance multiplied by 1.5 minutes per kilometer."
            />
          </div>
        </div>
      )}
    </div>
  );
}

function HistogramMetric({
  label,
  unit,
  values,
  selectedValue,
  domainMin,
  domainMax,
  tone,
  lowLabel,
  highLabel,
  formatter,
  description,
}: {
  label: string;
  unit: string;
  values: number[];
  selectedValue: number | null | undefined;
  domainMin: number;
  domainMax: number;
  tone: 'green' | 'red' | 'gray';
  lowLabel: string;
  highLabel: string;
  formatter: (value: number | string | null | undefined) => string;
  description: string;
}) {
  const histogram = buildHistogramBins(values, 32, domainMin, domainMax);
  const selectedNumber = selectedValue === null || selectedValue === undefined ? Number.NaN : Number(selectedValue);
  const selectedPercent = Number.isFinite(selectedNumber)
    ? clamp(((selectedNumber - histogram.domainMin) / (histogram.domainMax - histogram.domainMin)) * 100)
    : null;
  const colors = {
    green: ['#DDF5E5', '#7CC99A', '#1F7A5A', '#0B4B49'],
    red: ['#FFE1D4', '#FF9A6B', '#E85B42', '#A92924'],
    gray: ['#E6E7E4', '#C3C6C3', '#8B908E', '#5D6463'],
  }[tone];

  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <span>{label}</span>
            <MetricInfo label={label} description={description} />
          </div>
          <div className="mt-1 text-xs text-[#0B2026]/55">
            Selected: {formatter(Number.isFinite(selectedNumber) ? selectedNumber : null)}
          </div>
        </div>
        <div className="shrink-0 text-xs text-[#0B2026]/45">{unit}</div>
      </div>

      <div className="relative h-24 border-b border-[#0B2026]/25">
        <div className="absolute inset-x-0 bottom-0 flex h-20 items-end gap-1">
          {histogram.bins.map((count, index) => {
            const colorIndex = Math.min(colors.length - 1, Math.floor((index / histogram.bins.length) * colors.length));
            const height = Math.max(4, (count / histogram.maxCount) * 78);
            const binStart = histogram.domainMin + ((histogram.domainMax - histogram.domainMin) * index) / histogram.bins.length;

            return (
              <div
                key={`${label}-${binStart.toFixed(3)}`}
                className="min-w-0 flex-1 rounded-t-sm"
                style={{
                  height,
                  backgroundColor: count > 0 ? colors[colorIndex] : '#EEF0ED',
                  opacity: count > 0 ? 1 : 0.55,
                }}
              />
            );
          })}
        </div>

        {selectedPercent !== null && (
          <div
            className="absolute bottom-0 top-1 w-0.5 rounded-full bg-[#2F6BFF]"
            style={{ left: `${selectedPercent}%` }}
            aria-hidden="true"
          />
        )}
        <span className="absolute -bottom-1 left-0 h-3 w-3 rounded-full border-2 border-[#6C9DFF] bg-white" />
        <span className="absolute -bottom-1 right-0 h-3 w-3 rounded-full border-2 border-[#6C9DFF] bg-white" />
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-start gap-2 text-[11px] text-[#0B2026]/55">
        <div>
          <div>{lowLabel}</div>
          <div className="mt-1 font-medium text-[#0B2026]/70">{formatter(histogram.domainMin)}</div>
        </div>
        <div className="text-center text-[#0B2026]/40">{formatCount(values.length)} regions</div>
        <div className="text-right">
          <div>{highLabel}</div>
          <div className="mt-1 font-medium text-[#0B2026]/70">{formatter(histogram.domainMax)}</div>
        </div>
      </div>
    </div>
  );
}

function GapCard({ gap, selected = false }: { gap: GapRegion; selected?: boolean }) {
  return (
    <Card
      id={gapCardId(gap.geography_key)}
      className={`rounded-md bg-white shadow-sm ${
        selected ? 'border-[#0B2026] ring-2 ring-[#FF3621]/35' : 'border-[#0B2026]/10'
      }`}
    >
      <CardContent className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3 lg:flex-1">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold">{gap.geography_name}</h3>
                <ConfidenceBadge label={gap.confidence_label} />
                <span className="rounded-md bg-[#0B2026]/6 px-2.5 py-1 text-xs font-medium text-[#0B2026]">
                  {gap.evidence_label}
                </span>
              </div>
              <p className="text-sm text-[#0B2026]/65">
                {gap.state_name}
                {gap.district_count > 1 ? `, ${formatCount(gap.district_count)} districts` : ''}
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              <ScoreBar label="Gap score" value={gap.gap_score} tone="red" />
              <ScoreBar label="Need" value={gap.need_score} tone="dark" />
              <ScoreBar label="Supply adequacy" value={gap.supply_adequacy_score} tone="green" />
              <ScoreBar label="Access pressure" value={gap.geographic_access_score} tone="blue" />
              <ScoreBar label="Confidence" value={gap.confidence_score} tone="blue" />
            </div>
          </div>

          <div className="grid gap-2 text-sm sm:grid-cols-2 lg:min-w-[300px] lg:grid-cols-1">
            <MiniStat
              label="Facilities"
              value={`${formatCount(gap.facility_count)} total, ${formatCount(gap.hospital_count)} hospitals`}
            />
            <MiniStat
              label="Evidence density"
              value={`${formatScore(gap.facility_evidence_per_10k_households)} per 10k surveyed households`}
            />
            <MiniStat
              label="Pincode access"
              value={`${formatCount(gap.pincode_count)} pincodes, ${formatScore(gap.facilities_per_100_pincodes)} facilities per 100`}
            />
            <MiniStat
              label="Facility trust signals"
              value={`${formatCount(gap.geocoded_count)} mapped, ${formatCount(gap.contactable_count)} contactable`}
            />
            <MiniStat label="Nearest hospital" value={formatKm(gap.nearest_hospital_km)} />
            <MiniStat
              label="Survey support"
              value={`${formatCount(gap.households_surveyed)} households, ${formatCount(gap.women_interviewed)} women`}
            />
          </div>
        </div>

        <ConfidenceFactors factors={gap.confidence_factors} />

        <div className="mt-4 grid gap-2 border-t border-[#0B2026]/10 pt-4 text-sm sm:grid-cols-2 lg:grid-cols-6">
          <MiniStat label="Anaemia" value={formatPct(gap.anaemia_pct)} />
          <MiniStat label="Sanitation" value={formatPct(gap.sanitation_pct)} />
          <MiniStat label="Insurance" value={formatPct(gap.insurance_pct)} />
          <MiniStat label="Institutional births" value={formatPct(gap.institutional_birth_pct)} />
          <MiniStat label="Child stunting" value={formatPct(gap.stunting_pct)} />
          <MiniStat label="High BP, women" value={formatPct(gap.high_bp_women_pct)} />
          <MiniStat
            label="Mapped pincodes"
            value={`${formatCount(gap.geocoded_pincode_count)} of ${formatCount(gap.post_office_count)}`}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ConfidenceFactors({ factors }: { factors: ConfidenceFactor[] | null | undefined }) {
  const visibleFactors = factors?.slice(0, 4) ?? [];

  if (visibleFactors.length === 0) {
    return (
      <div className="mt-4 rounded-md border border-emerald-700/15 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        No major data quality factor is lowering this confidence score.
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-md border border-[#0B2026]/10 bg-[#F9F7F4] p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <AlertCircle className="h-4 w-4 text-[#FF3621]" />
        Confidence factors
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {visibleFactors.map((factor) => (
          <div
            key={`${factor.label}-${factor.detail}`}
            className={`rounded-md border px-3 py-2 text-sm ${confidenceFactorTone[factor.severity]}`}
          >
            <div className="font-semibold">{factor.label}</div>
            <div className="mt-0.5 text-xs opacity-80">{factor.detail}</div>
          </div>
        ))}
      </div>
      {factors && factors.length > visibleFactors.length && (
        <div className="mt-2 text-xs text-[#0B2026]/55">
          {formatCount(factors.length - visibleFactors.length)} more confidence factors not shown.
        </div>
      )}
    </div>
  );
}

function ConfidenceBadge({ label }: { label: GapRegion['confidence_label'] }) {
  const toneClass = {
    High: 'bg-emerald-50 text-emerald-800',
    Medium: 'bg-amber-50 text-amber-800',
    Low: 'bg-[#FF3621]/10 text-[#8A1F13]',
  }[label];

  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${toneClass}`}>
      <CheckCircle2 className="h-3.5 w-3.5" />
      {label} confidence
    </span>
  );
}

function MetricInfo({ label, description }: { label: string; description: string }) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        data-metric-info
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[#0B2026]/45 transition-colors hover:bg-[#0B2026]/6 hover:text-[#0B2026] focus:outline-none focus:ring-2 focus:ring-[#0B2026]/25"
        aria-label={`${label}: ${description}`}
        title={description}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-6 z-20 hidden w-72 max-w-[calc(100vw-3rem)] -translate-x-1/2 rounded-md border border-[#0B2026]/10 bg-[#0B2026] px-3 py-2 text-left text-xs font-normal leading-5 text-white shadow-lg group-focus-within:block group-hover:block"
      >
        {description}
      </span>
    </span>
  );
}

function ScoreBar({
  label,
  value,
  tone,
}: {
  label: ScoreMetricLabel;
  value: number;
  tone: 'red' | 'green' | 'blue' | 'dark';
}) {
  const toneClass = {
    red: 'bg-[#FF3621]',
    green: 'bg-emerald-600',
    blue: 'bg-sky-600',
    dark: 'bg-[#0B2026]',
  }[tone];
  const width = `${Math.max(0, Math.min(100, Number(value) || 0))}%`;

  return (
    <div className="rounded-md border border-[#0B2026]/10 p-3" data-score-bar>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm">
        <span className="flex min-w-0 items-center gap-1.5 text-[#0B2026]/65">
          <span className="truncate" data-score-label>
            {label}
          </span>
          <MetricInfo label={label} description={metricDescriptions[label]} />
        </span>
        <span className="min-w-10 text-right font-semibold" data-score-value>
          {formatScore(value)}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#0B2026]/10">
        <div className={`h-full rounded-full ${toneClass}`} style={{ width }} />
      </div>
    </div>
  );
}

function FacilityDataQualityPanel({
  diagnostics,
  loading,
}: {
  diagnostics: FacilityDataQuality | null;
  loading: boolean;
}) {
  if (!loading && !diagnostics) {
    return (
      <div className="rounded-md border border-[#0B2026]/10 bg-white p-5 text-sm text-[#0B2026]/65 shadow-sm">
        Data quality diagnostics are unavailable.
      </div>
    );
  }

  const geographyQualityCounts = diagnostics?.geography_quality_counts ?? [];
  const mappedCount = geographyQualityCounts
    .filter((item) => item.geography_quality !== 'unmapped_state')
    .reduce((sum, item) => sum + Number(item.facility_count || 0), 0);
  const topUnmapped = diagnostics?.unmapped_facility_state_samples.slice(0, 4) ?? [];
  const topAmbiguous = diagnostics?.ambiguous_district_samples.slice(0, 4) ?? [];

  return (
    <Card className="rounded-md border-[#0B2026]/10 bg-white shadow-sm">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Database className="h-4 w-4 text-[#FF3621]" />
              Data quality diagnostics
            </div>
            <p className="mt-1 text-sm leading-6 text-[#0B2026]/65">
              Facility geography is normalized before search and gap scoring, while missing coordinates and unresolved
              mappings stay visible for remediation.
            </p>
          </div>
          <div className="rounded-md border border-emerald-700/20 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {diagnostics ? (
              <>
                <span className="font-semibold">
                  {formatCount(diagnostics.raw_facility_state_distinct_count)} raw states
                </span>
                <span className="mx-2 text-emerald-700">to</span>
                <span className="font-semibold">
                  {formatCount(diagnostics.normalized_facility_state_distinct_count)} normalized
                </span>
              </>
            ) : (
              <Skeleton className="h-5 w-44 rounded" />
            )}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <QualityMetric
            label="Unmapped facility states"
            value={diagnostics?.unmapped_facility_state_count ?? null}
            detail="Rows still missing a state match"
            tone={(diagnostics?.unmapped_facility_state_count ?? 0) > 0 ? 'red' : 'green'}
          />
          <QualityMetric
            label="Ambiguous districts"
            value={diagnostics?.ambiguous_district_mapping_count ?? null}
            detail="District names matching multiple states"
            tone={(diagnostics?.ambiguous_district_mapping_count ?? 0) > 0 ? 'amber' : 'green'}
          />
          <QualityMetric
            label="Missing facility coordinates"
            value={diagnostics?.missing_facility_coordinate_count ?? null}
            detail="Facilities without latitude or longitude"
            tone={(diagnostics?.missing_facility_coordinate_count ?? 0) > 0 ? 'amber' : 'green'}
          />
          <QualityMetric
            label="Missing pincode coordinates"
            value={diagnostics?.missing_pincode_coordinate_count ?? null}
            detail="Post office rows without coordinates"
            tone={(diagnostics?.missing_pincode_coordinate_count ?? 0) > 0 ? 'amber' : 'green'}
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-md border border-[#0B2026]/10 bg-[#F9F7F4] p-3 text-sm">
            <div className="mb-2 font-semibold">Geography match quality</div>
            <div className="space-y-2">
              {geographyQualityCounts.map((item) => (
                <div key={item.geography_quality} className="flex items-center justify-between gap-3">
                  <span className="text-[#0B2026]/65">{formatToken(item.geography_quality)}</span>
                  <span className="font-semibold">{formatCount(item.facility_count)}</span>
                </div>
              ))}
              {loading && geographyQualityCounts.length === 0 && (
                <>
                  <Skeleton className="h-4 rounded" />
                  <Skeleton className="h-4 rounded" />
                  <Skeleton className="h-4 rounded" />
                </>
              )}
              {!loading && geographyQualityCounts.length === 0 && (
                <div className="text-[#0B2026]/60">No geography classifications returned.</div>
              )}
              {mappedCount > 0 && (
                <div className="border-t border-[#0B2026]/10 pt-2 text-xs text-[#0B2026]/55">
                  {formatCount(mappedCount)} facilities have at least one normalized geography signal.
                </div>
              )}
            </div>
          </div>

          <QualitySampleList
            title="Top unmapped raw states"
            emptyLabel="No unmapped state values"
            loading={loading}
            samples={topUnmapped.map((item) => ({
              label: normalizeText(item.raw_state, 'Unknown'),
              value: formatCount(item.facility_count),
            }))}
          />

          <QualitySampleList
            title="Ambiguous district keys"
            emptyLabel="No ambiguous district mappings"
            loading={loading}
            samples={topAmbiguous.map((item) => ({
              label: normalizeText(item.district_name, normalizeText(item.district_key, 'Unknown')),
              value: `${formatCount(item.state_match_count)} states`,
            }))}
            footer={
              diagnostics
                ? `${formatCount(diagnostics.missing_facility_type_count)} missing facility types, ${formatCount(
                    diagnostics.farmacy_type_count
                  )} farmacy spellings`
                : undefined
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

function QualityMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: number | null;
  detail: string;
  tone: 'green' | 'amber' | 'red';
}) {
  const toneClass = {
    green: 'border-emerald-700/20 bg-emerald-50 text-emerald-900',
    amber: 'border-amber-700/20 bg-amber-50 text-amber-950',
    red: 'border-[#FF3621]/25 bg-[#FF3621]/10 text-[#8A1F13]',
  }[tone];

  return (
    <div className={`rounded-md border px-3 py-3 ${toneClass}`}>
      <div className="text-xs opacity-75">{label}</div>
      <div className="mt-1 text-xl font-semibold">
        {value === null ? <Skeleton className="h-7 w-16" /> : formatCount(value)}
      </div>
      <div className="mt-1 text-xs opacity-75">{detail}</div>
    </div>
  );
}

function QualitySampleList({
  title,
  emptyLabel,
  loading = false,
  samples,
  footer,
}: {
  title: string;
  emptyLabel: string;
  loading?: boolean;
  samples: Array<{ label: string; value: string }>;
  footer?: string;
}) {
  return (
    <div className="rounded-md border border-[#0B2026]/10 bg-[#F9F7F4] p-3 text-sm">
      <div className="mb-2 font-semibold">{title}</div>
      <div className="space-y-2">
        {samples.map((sample) => (
          <div key={`${sample.label}-${sample.value}`} className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-[#0B2026]/65">{sample.label}</span>
            <span className="shrink-0 font-semibold">{sample.value}</span>
          </div>
        ))}
        {loading && samples.length === 0 && (
          <>
            <Skeleton className="h-4 rounded" />
            <Skeleton className="h-4 rounded" />
            <Skeleton className="h-4 rounded" />
          </>
        )}
        {!loading && samples.length === 0 && <div className="text-[#0B2026]/60">{emptyLabel}</div>}
      </div>
      {footer && <div className="mt-3 border-t border-[#0B2026]/10 pt-2 text-xs text-[#0B2026]/55">{footer}</div>}
    </div>
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
              {formatCount(district.households_surveyed)} households surveyed,{' '}
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
          <MiniStat
            label="High BP, women"
            value={district.w15_plus_with_high_bp_sys_gte_140_mmhg_and_or_dia_gte_90_mm_pct}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function FacilityCard({ facility, onSaved }: { facility: Facility; onSaved: (facility: Facility) => void }) {
  const city = normalizeText(facility.address_city);
  const state = normalizeText(facility.address_state_or_region);
  const website = normalizeText(facility.official_website, '');
  const phone = normalizeText(facility.official_phone, '');
  const capabilitySignals = useMemo(
    () =>
      [...(facility.capability_trust_signals ?? [])].sort((a, b) => {
        const signalRank = capabilitySignalRank[a.signal] - capabilitySignalRank[b.signal];
        return signalRank !== 0 ? signalRank : b.score - a.score;
      }),
    [facility.capability_trust_signals]
  );
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FacilityEditForm>(() => buildFacilityForm(facility));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditLog, setAuditLog] = useState<FacilityAuditLog[]>([]);

  useEffect(() => {
    setForm(buildFacilityForm(facility));
  }, [facility]);

  const updateForm = (field: keyof FacilityEditForm, value: string) => {
    setForm((current) => ({
      ...current,
      [field]: field === 'name' || field === 'note' ? value : toNullableFormValue(value),
    }));
  };

  const loadAuditLog = async () => {
    setAuditLoading(true);
    setSaveError(null);
    try {
      const rows = await fetchJson<FacilityAuditLog[]>(
        `/api/facilities/${encodeURIComponent(facility.unique_id)}/audit`
      );
      setAuditLog(rows);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to load audit log');
    } finally {
      setAuditLoading(false);
    }
  };

  const handleAuditToggle = () => {
    const nextOpen = !auditOpen;
    setAuditOpen(nextOpen);
    if (nextOpen) {
      void loadAuditLog();
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const result = await saveJson<{ facility: Facility }>(
        `/api/facilities/${encodeURIComponent(facility.unique_id)}`,
        form
      );
      onSaved(result.facility);
      setEditing(false);
      setForm(buildFacilityForm(result.facility));
      if (auditOpen) {
        void loadAuditLog();
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save facility');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="rounded-md border-[#0B2026]/10 bg-white shadow-sm">
      <CardContent className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold">{facility.name}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#0B2026]/60">
                    <Badge>{formatToken(facility.facility_type_id)}</Badge>
                    <Badge>{formatToken(facility.operator_type_id)}</Badge>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button type="button" variant="outline" className="h-9 gap-2" onClick={() => setEditing(true)}>
                    <Edit3 className="h-4 w-4" />
                    Edit
                  </Button>
                  <Button type="button" variant="outline" className="h-9 gap-2" onClick={handleAuditToggle}>
                    <History className="h-4 w-4" />
                    Audit
                  </Button>
                </div>
              </div>
            </div>

            {editing ? (
              <div className="space-y-4 rounded-md border border-[#0B2026]/10 bg-[#F9F7F4] p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <EditField label="Facility name" value={form.name} onChange={(value) => updateForm('name', value)} />
                  <EditField
                    label="Facility type"
                    value={toFormValue(form.facility_type_id)}
                    onChange={(value) => updateForm('facility_type_id', value)}
                  />
                  <EditField
                    label="Operator type"
                    value={toFormValue(form.operator_type_id)}
                    onChange={(value) => updateForm('operator_type_id', value)}
                  />
                  <EditField
                    label="City"
                    value={toFormValue(form.address_city)}
                    onChange={(value) => updateForm('address_city', value)}
                  />
                  <EditField
                    label="State or region"
                    value={toFormValue(form.address_state_or_region)}
                    onChange={(value) => updateForm('address_state_or_region', value)}
                  />
                  <EditField
                    label="Phone"
                    value={toFormValue(form.official_phone)}
                    onChange={(value) => updateForm('official_phone', value)}
                  />
                  <EditField
                    label="Website"
                    value={toFormValue(form.official_website)}
                    onChange={(value) => updateForm('official_website', value)}
                  />
                  <EditField
                    label="Latitude"
                    value={toFormValue(form.latitude)}
                    onChange={(value) => updateForm('latitude', value)}
                  />
                  <EditField
                    label="Longitude"
                    value={toFormValue(form.longitude)}
                    onChange={(value) => updateForm('longitude', value)}
                  />
                  <EditField
                    label="Doctors"
                    value={toFormValue(form.doctors)}
                    onChange={(value) => updateForm('doctors', value)}
                  />
                </div>
                <EditArea
                  label="Description"
                  value={toFormValue(form.description)}
                  onChange={(value) => updateForm('description', value)}
                />
                <EditArea
                  label="Specialties"
                  value={toFormValue(form.specialties)}
                  onChange={(value) => updateForm('specialties', value)}
                />
                <EditArea
                  label="Capabilities"
                  value={toFormValue(form.capability)}
                  onChange={(value) => updateForm('capability', value)}
                />
                <EditArea
                  label="Change note"
                  value={form.note}
                  onChange={(value) => updateForm('note', value)}
                  rows={2}
                />
                {saveError && <InlineError message={saveError} />}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={() => {
                      setForm(buildFacilityForm(facility));
                      setEditing(false);
                      setSaveError(null);
                    }}
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    className="gap-2"
                    onClick={() => {
                      void handleSave();
                    }}
                    disabled={saving || !form.name.trim()}
                  >
                    <Save className="h-4 w-4" />
                    {saving ? 'Saving' : 'Save'}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm leading-6 text-[#0B2026]/72">
                  {normalizeText(facility.description, 'No description available.')}
                </p>

                <div className="grid gap-2 text-sm text-[#0B2026]/72 sm:grid-cols-2">
                  <MetaLine
                    icon={<MapPin className="h-4 w-4" />}
                    text={`${city}${state !== 'n/a' ? `, ${state}` : ''}`}
                  />
                  <MetaLine icon={<Phone className="h-4 w-4" />} text={phone || 'No phone listed'} />
                  <MetaLine icon={<Globe className="h-4 w-4" />} text={website || 'No website listed'} />
                  <MetaLine icon={<Stethoscope className="h-4 w-4" />} text={parseListPreview(facility.specialties)} />
                </div>

                <CapabilityTrustPanel signals={capabilitySignals} />
              </>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[240px] lg:grid-cols-1">
            <MiniStat label="Directory ID" value={facility.unique_id.slice(0, 8)} />
            <MiniStat label="Capabilities" value={parseListPreview(facility.capability)} />
            <MiniStat label="Doctors" value={parseListPreview(facility.doctors)} />
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
        {auditOpen && (
          <div className="mt-4 border-t border-[#0B2026]/10 pt-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <History className="h-4 w-4 text-[#FF3621]" />
              Audit log
            </div>
            {auditLoading ? (
              <Skeleton className="h-20 rounded-md" />
            ) : (
              <div className="space-y-2">
                {auditLog.map((entry) => (
                  <div key={entry.id} className="rounded-md border border-[#0B2026]/10 bg-[#F9F7F4] p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{entry.changed_by}</span>
                      <span className="text-xs text-[#0B2026]/55">{new Date(entry.changed_at).toLocaleString()}</span>
                    </div>
                    <div className="mt-1 text-[#0B2026]/65">
                      {entry.changed_fields.map((field) => formatToken(field)).join(', ')}
                    </div>
                    {entry.change_note && <div className="mt-2 text-[#0B2026]/72">{entry.change_note}</div>}
                  </div>
                ))}
                {auditLog.length === 0 && (
                  <div className="rounded-md border border-[#0B2026]/10 bg-[#F9F7F4] p-3 text-sm text-[#0B2026]/65">
                    No saved edits yet.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CapabilityTrustPanel({ signals }: { signals: CapabilityTrustScore[] }) {
  const claimedSignals = signals.filter((signal) => signal.signal !== 'no claim');
  const noClaimCount = signals.length - claimedSignals.length;
  const visibleSignals = claimedSignals.slice(0, 4);

  return (
    <div className="rounded-md border border-[#0B2026]/10 bg-[#F9F7F4] p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-[#FF3621]" />
          Capability trust
        </div>
        <span className="text-xs text-[#0B2026]/55">
          {claimedSignals.length > 0
            ? `${formatCount(claimedSignals.length)} evidence-bearing claims`
            : 'No evidence-bearing claims'}
        </span>
      </div>

      <div className="grid gap-2 xl:grid-cols-2">
        {visibleSignals.map((signal) => (
          <div key={signal.capability} className={`rounded-md border px-3 py-2 ${capabilitySignalTone[signal.signal]}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">{signal.label}</div>
                <div className="mt-0.5 text-xs capitalize opacity-80">{signal.signal}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1 text-xs font-semibold">
                <span>Score {formatScore(signal.score)}</span>
                <MetricInfo label={`${signal.label} capability trust score`} description={capabilityTrustDescription} />
              </div>
            </div>
            <div className="mt-2 space-y-1.5 text-xs leading-5">
              {signal.evidence.slice(0, 2).map((evidence) => (
                <div key={`${signal.capability}-${evidence.source}-${evidence.excerpt}`} className="text-current/80">
                  <span className="font-semibold">{sourceLabel(evidence.source)}:</span> {evidence.excerpt}
                </div>
              ))}
            </div>
          </div>
        ))}

        {visibleSignals.length === 0 && (
          <div className="rounded-md border border-[#0B2026]/10 bg-white px-3 py-2 text-sm text-[#0B2026]/60">
            No ICU, maternity, emergency, oncology, trauma, NICU, dialysis, or surgery evidence was found in the
            current facility fields.
          </div>
        )}
      </div>

      {noClaimCount > 0 && (
        <div className="mt-2 text-xs text-[#0B2026]/55">
          {formatCount(noClaimCount)} taxonomy capabilities have no claim in the available fields.
        </div>
      )}
    </div>
  );
}

function EditField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium">
      <span>{label}</span>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function EditArea({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label className="block space-y-1.5 text-sm font-medium">
      <span>{label}</span>
      <textarea
        className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-[#0B2026]/20"
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
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
  return <span className="rounded-full bg-[#0B2026]/6 px-2.5 py-1 font-medium text-[#0B2026]">{children}</span>;
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
