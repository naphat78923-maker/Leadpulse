import type { ContactIdentityQuality, OutreachLanguage, OutreachLanguageBasis } from '@/types/crm';

export const CONTACT_IDENTITY_OPTIONS: { value: ContactIdentityQuality; label: string }[] = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'named', label: 'Named contact' },
  { value: 'role_only', label: 'Role only · name unknown' },
  { value: 'company_route', label: 'Company route only' },
];

export const OUTREACH_LANGUAGE_OPTIONS: { value: OutreachLanguage; label: string }[] = [
  { value: 'autodetect', label: 'Auto-detect' },
  { value: 'thai', label: '🇹🇭 Thai' },
  { value: 'english', label: '🇬🇧 English' },
];

const LANGUAGE_LABELS: Record<OutreachLanguage, string> = {
  autodetect: '🔄 Auto-detect',
  thai: '🇹🇭 Thai',
  english: '🇬🇧 English',
};

const BASIS_LABELS: Record<OutreachLanguageBasis, string> = {
  autodetect: 'Auto-detect',
  last_inbound: 'From last inbound',
  pat_override: 'Pat override',
};

const NAME_FIELD_COPY: Record<ContactIdentityQuality, { label: string; placeholder: string }> = {
  unknown: {
    label: 'Name or contact label *',
    placeholder: 'e.g., John, Head Chef, or company LINE',
  },
  named: {
    label: 'Full name *',
    placeholder: 'e.g., John Smith',
  },
  role_only: {
    label: 'Role or contact label *',
    placeholder: 'e.g., Head Chef, name unknown',
  },
  company_route: {
    label: 'Company route label *',
    placeholder: 'e.g., Buarys general LINE',
  },
};

export function contactNameFieldCopy(identityQuality: ContactIdentityQuality) {
  return NAME_FIELD_COPY[identityQuality];
}

/**
 * A company route (general LINE, info@ email, front-desk phone) is a way to reach an
 * account, not a person. Lists of people and "the contact" on a deal skip these.
 */
export function isCompanyRoute(contact: { identity_quality?: ContactIdentityQuality | null }): boolean {
  return contact.identity_quality === 'company_route';
}

export function contactIdentityLabel(identityQuality?: ContactIdentityQuality | null) {
  return CONTACT_IDENTITY_OPTIONS.find(option => option.value === (identityQuality ?? 'unknown'))?.label ?? 'Unknown';
}

export function outreachLanguageLabel(language?: OutreachLanguage | null) {
  return LANGUAGE_LABELS[language ?? 'autodetect'] ?? '🔄 Auto-detect';
}

export function outreachLanguageBasisLabel(basis?: OutreachLanguageBasis | null) {
  return BASIS_LABELS[basis ?? 'autodetect'] ?? 'Auto-detect';
}

export function outreachLanguageBadgeColor(language?: OutreachLanguage | null) {
  switch (language) {
    case 'thai': return 'border-clay-ochre/30 bg-clay-ochre/10 text-clay-ochre';
    case 'english': return 'border-clay-lavender/30 bg-clay-lavender/10 text-clay-lavender';
    case 'autodetect':
    default: return 'border-clay-coral/30 bg-clay-coral/10 text-clay-coral';
  }
}
