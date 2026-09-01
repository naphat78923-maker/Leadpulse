import type { ContactIdentityQuality } from '@/types/crm';

export const CONTACT_IDENTITY_OPTIONS: { value: ContactIdentityQuality; label: string }[] = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'named', label: 'Named contact' },
  { value: 'role_only', label: 'Role only · name unknown' },
  { value: 'company_route', label: 'Company route only' },
];

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

export function contactIdentityLabel(identityQuality?: ContactIdentityQuality | null) {
  return CONTACT_IDENTITY_OPTIONS.find(option => option.value === (identityQuality ?? 'unknown'))?.label ?? 'Unknown';
}
