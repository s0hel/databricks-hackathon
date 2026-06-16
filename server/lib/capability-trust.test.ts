import { describe, expect, it } from 'vitest';
import { inferCapabilityFromText, scoreFacilityCapabilities } from './capability-trust';

const signalFor = (facility: Parameters<typeof scoreFacilityCapabilities>[0], capability: string) => {
  const score = scoreFacilityCapabilities(facility).find((item) => item.capability === capability);
  if (!score) throw new Error(`Missing capability ${capability}`);
  return score;
};

describe('scoreFacilityCapabilities', () => {
  it('scores structured capability plus supporting specialty as strong evidence', () => {
    const icu = signalFor(
      {
        capability: 'ICU, emergency care',
        specialties: 'critical care and anaesthesia',
        description: 'Multispecialty hospital',
      },
      'icu'
    );

    expect(icu.signal).toBe('strong evidence');
    expect(icu.evidence.map((item) => item.source)).toEqual(expect.arrayContaining(['capability', 'specialties']));
  });

  it('scores a single structured source as partial evidence', () => {
    const maternity = signalFor({ specialties: 'maternity and child health' }, 'maternity');

    expect(maternity.signal).toBe('partial evidence');
    expect(maternity.score).toBe(2);
  });

  it('scores narrative-only evidence as weak or suspicious', () => {
    const dialysis = signalFor({ description: 'Dialysis support mentioned in the facility profile.' }, 'dialysis');

    expect(dialysis.signal).toBe('weak or suspicious evidence');
    expect(dialysis.evidence).toHaveLength(1);
  });

  it('does not treat generic 24/7 scheduling as emergency evidence', () => {
    const emergency = signalFor({ capability: 'Online appointment scheduling available 24/7' }, 'emergency');

    expect(emergency.signal).toBe('no claim');
  });

  it('returns no claim when no taxonomy terms match', () => {
    const oncology = signalFor({ facility_type_id: 'clinic', description: 'General outpatient services.' }, 'oncology');

    expect(oncology.signal).toBe('no claim');
    expect(oncology.evidence).toEqual([]);
  });
});

describe('inferCapabilityFromText', () => {
  it('maps coordinator care needs to the shared capability taxonomy', () => {
    expect(inferCapabilityFromText('dialysis near Jaipur')).toBe('dialysis');
    expect(inferCapabilityFromText('oncology consultation')).toBe('oncology');
    expect(inferCapabilityFromText('general checkup')).toBeNull();
  });
});
