export const LOST_REASON_OPTIONS = [
  { value: 'price', label: 'Price' },
  { value: 'taste', label: 'Taste' },
  { value: 'timing', label: 'Timing' },
  { value: 'vendor_list', label: 'Vendor list' },
  { value: 'no_reply', label: 'No reply' },
  { value: 'other', label: 'Other' },
] as const;

export type LostReason = (typeof LOST_REASON_OPTIONS)[number]['value'];

export function localDateKeySafe() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
