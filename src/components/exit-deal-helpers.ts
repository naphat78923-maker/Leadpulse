import { businessDateKey } from '@/utils/business-time';

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
  // Business calendar, not the device's: a close date must agree with the board's day.
  return businessDateKey();
}
