export const capabilityTaxonomy = [
  'icu',
  'maternity',
  'emergency',
  'oncology',
  'trauma',
  'nicu',
  'dialysis',
  'surgery',
] as const;

export type CapabilityId = (typeof capabilityTaxonomy)[number];
export type CapabilityTrustSignal = 'strong evidence' | 'partial evidence' | 'weak or suspicious evidence' | 'no claim';

export interface FacilityClaimInput {
  facility_type_id?: unknown;
  specialties?: unknown;
  capability?: unknown;
  description?: unknown;
  doctors?: unknown;
}

export interface CapabilityEvidence {
  source: keyof FacilityClaimInput;
  excerpt: string;
  weight: number;
}

export interface CapabilityTrustScore {
  capability: CapabilityId;
  label: string;
  signal: CapabilityTrustSignal;
  score: number;
  evidence: CapabilityEvidence[];
}

interface CapabilityDefinition {
  id: CapabilityId;
  label: string;
  patterns: RegExp[];
  searchTerms: string[];
}

const definitions: CapabilityDefinition[] = [
  {
    id: 'icu',
    label: 'ICU',
    patterns: [/\bicu\b/i, /\bintensive care\b/i, /\bcritical care\b/i],
    searchTerms: ['icu', 'intensive care', 'critical care'],
  },
  {
    id: 'maternity',
    label: 'Maternity',
    patterns: [/\bmaternity\b/i, /\bobstetric/i, /\bobgyn\b/i, /\bgynaec/i, /\bgynec/i, /\bdelivery\b/i],
    searchTerms: ['maternity', 'obstetric', 'obgyn', 'gynaec', 'gynec', 'delivery'],
  },
  {
    id: 'emergency',
    label: 'Emergency',
    patterns: [/\bemergency\b/i, /\ber\b/i, /\bcasualty\b/i, /\btrauma emergency\b/i],
    searchTerms: ['emergency', 'casualty', 'trauma emergency'],
  },
  {
    id: 'oncology',
    label: 'Oncology',
    patterns: [/\boncology\b/i, /\bcancer\b/i, /\bchemotherapy\b/i, /\bradiation therapy\b/i],
    searchTerms: ['oncology', 'cancer', 'chemotherapy', 'radiation therapy'],
  },
  {
    id: 'trauma',
    label: 'Trauma',
    patterns: [/\btrauma\b/i, /\baccident\b/i, /\borthopaedic trauma\b/i, /\bemergency surgery\b/i],
    searchTerms: ['trauma', 'accident', 'orthopaedic trauma', 'emergency surgery'],
  },
  {
    id: 'nicu',
    label: 'NICU',
    patterns: [/\bnicu\b/i, /\bneonatal intensive care\b/i, /\bneonatal icu\b/i],
    searchTerms: ['nicu', 'neonatal intensive care', 'neonatal icu'],
  },
  {
    id: 'dialysis',
    label: 'Dialysis',
    patterns: [/\bdialysis\b/i, /\bhemodialysis\b/i, /\bhaemodialysis\b/i, /\bnephrology\b/i],
    searchTerms: ['dialysis', 'hemodialysis', 'haemodialysis', 'nephrology'],
  },
  {
    id: 'surgery',
    label: 'Surgery',
    patterns: [/\bsurgery\b/i, /\bsurgical\b/i, /\boperation theatre\b/i, /\bot\b/i, /\blaparoscopy\b/i],
    searchTerms: ['surgery', 'surgical', 'operation theatre', 'laparoscopy'],
  },
];

const sourceWeights: Record<keyof FacilityClaimInput, number> = {
  capability: 3,
  specialties: 2,
  facility_type_id: 2,
  description: 1,
  doctors: 1,
};

const structuredSources = new Set<keyof FacilityClaimInput>(['capability', 'specialties', 'facility_type_id']);

const normalizePrimitive = (value: unknown): string[] => {
  if (value === null || value === undefined) return [];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === 'null') return [];

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed) || (parsed && typeof parsed === 'object')) return normalizePrimitive(parsed);
    } catch {
      // Keep non-JSON strings as-is.
    }

    return [trimmed];
  }
  if (typeof value === 'number' || typeof value === 'boolean') return [`${value}`];
  if (Array.isArray(value)) return value.flatMap((item) => normalizePrimitive(item));
  if (typeof value === 'object') return Object.values(value).flatMap((item) => normalizePrimitive(item));
  return [];
};

const compactExcerpt = (text: string, pattern: RegExp) => {
  const match = text.match(pattern);
  if (!match || match.index === undefined) return text.slice(0, 140);

  const start = Math.max(0, match.index - 42);
  const end = Math.min(text.length, match.index + match[0].length + 58);
  const excerpt = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '...' : ''}${excerpt}${end < text.length ? '...' : ''}`;
};

const collectEvidence = (facility: FacilityClaimInput, definition: CapabilityDefinition): CapabilityEvidence[] =>
  (Object.keys(sourceWeights) as Array<keyof FacilityClaimInput>).flatMap((source) => {
    const values = normalizePrimitive(facility[source]);
    const matched = values.find((value) => definition.patterns.some((pattern) => pattern.test(value)));
    if (!matched) return [];

    const pattern = definition.patterns.find((candidate) => candidate.test(matched)) ?? definition.patterns[0];
    return [
      {
        source,
        excerpt: compactExcerpt(matched, pattern),
        weight: sourceWeights[source],
      },
    ];
  });

const classifySignal = (evidence: CapabilityEvidence[]): CapabilityTrustSignal => {
  if (evidence.length === 0) return 'no claim';

  const score = evidence.reduce((sum, item) => sum + item.weight, 0);
  const structuredCount = evidence.filter((item) => structuredSources.has(item.source)).length;
  const hasCapabilityField = evidence.some((item) => item.source === 'capability');
  const hasSupportingSource = evidence.length > 1;

  if ((hasCapabilityField && hasSupportingSource) || structuredCount >= 2 || score >= 5) return 'strong evidence';
  if (structuredCount >= 1 || score >= 3) return 'partial evidence';
  return 'weak or suspicious evidence';
};

export const scoreFacilityCapabilities = (facility: FacilityClaimInput): CapabilityTrustScore[] =>
  definitions.map((definition) => {
    const evidence = collectEvidence(facility, definition);
    const signal = classifySignal(evidence);
    const score = evidence.reduce((sum, item) => sum + item.weight, 0);

    return {
      capability: definition.id,
      label: definition.label,
      signal,
      score,
      evidence,
    };
  });

export const getCapabilitySearchTerms = (capability: CapabilityId) =>
  definitions.find((definition) => definition.id === capability)?.searchTerms ?? [];

export const inferCapabilityFromText = (text: string): CapabilityId | null => {
  const normalized = text.trim();
  if (!normalized) return null;

  const match = definitions.find((definition) => definition.patterns.some((pattern) => pattern.test(normalized)));
  return match?.id ?? null;
};

export const getCapabilityLabel = (capability: CapabilityId) =>
  definitions.find((definition) => definition.id === capability)?.label ?? capability;
