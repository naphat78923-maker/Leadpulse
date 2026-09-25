// ─── Visible sales evidence for the Laya reviewer panel ───
// What the human sees next to a Laya result. Deliberately NOT part of the scored
// request: the buyer-response path sends only the product name and the buyer's
// own words (see laya-buyer-response.ts). Every field here is display-only and
// labels absent data as 'unknown' rather than inventing a value.

import { isCalendarDateKey } from '@/utils/business-time';
import type { Company, Deal } from '@/types/crm';

export interface LayaSalesEvidence {
  industry: string;
  tags: string;
  product: string;
  stage: Deal['stage'];
  value: string;
  valueType: string;
  followup: string;
  outcome: string;
}

/** Five plain-language states; 'invalid date' exists so a malformed key is never shown as a real one. */
function followupLabel(followupDate: string | null, today: string): string {
  if (!followupDate) return 'unscheduled';
  if (!isCalendarDateKey(followupDate)) return 'invalid date';
  if (followupDate === today) return 'today';
  if (followupDate < today) return 'overdue';
  return 'scheduled';
}

/** Visible CRM context for a human reviewer; deliberately not part of the Laya buyer-message request. */
export function buildLayaSalesEvidence(input: {
  deal: Pick<Deal, 'product' | 'stage' | 'value' | 'value_type' | 'followup_date' | 'last_outcome'>;
  company?: Pick<Company, 'industry' | 'tags'>;
  today: string;
}): LayaSalesEvidence {
  return {
    industry: input.company?.industry?.trim() || 'unknown',
    tags: input.company?.tags?.map(tag => tag.trim()).filter(Boolean).join(', ') || 'unknown',
    product: input.deal.product?.trim() || 'unknown',
    stage: input.deal.stage,
    value: input.deal.value == null ? 'unknown' : `THB ${input.deal.value.toLocaleString('en-US')}`,
    valueType: input.deal.value_type || 'unknown',
    followup: followupLabel(input.deal.followup_date, input.today),
    outcome: input.deal.last_outcome?.trim() || 'unknown',
  };
}
