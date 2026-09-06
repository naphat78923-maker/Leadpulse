import type { Company } from '@/types/crm';

export type StakeholderMapStatus = 'unknown' | 'partial' | 'complete';

export type StakeholderRole = 'champion' | 'decision_maker' | 'blocker';

/** Derive map completeness. Complete = all three set; Partial = any missing. */
export function deriveMapStatus(company: Pick<
  Company,
  'champion_contact_id' | 'decision_maker_contact_id' | 'blocker_contact_id' | 'blocker_label'
> | null | undefined): StakeholderMapStatus {
  if (!company) return 'partial';
  const champion = !!company.champion_contact_id;
  const dm = !!company.decision_maker_contact_id;
  const blocker = !!company.blocker_contact_id || !!(company.blocker_label || '').trim();
  if (champion && dm && blocker) return 'complete';
  return 'partial';
}

export function mapStatusLabel(status: StakeholderMapStatus): string {
  switch (status) {
    case 'complete':
      return 'Complete';
    case 'partial':
      return 'Partial';
    default:
      return 'Partial';
  }
}
