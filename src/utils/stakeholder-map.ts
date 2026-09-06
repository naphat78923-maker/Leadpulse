import type { Company } from '@/types/crm';

export type StakeholderMapStatus = 'unknown' | 'partial' | 'complete';

export type StakeholderRole = 'champion' | 'decision_maker' | 'blocker';

/** Derive map completeness.
 *  Unknown = nothing tagged; Partial = some roles; Complete = champion + DM + blocker.
 */
export function deriveMapStatus(company: Pick<
  Company,
  'champion_contact_id' | 'decision_maker_contact_id' | 'blocker_contact_id' | 'blocker_label'
> | null | undefined): StakeholderMapStatus {
  if (!company) return 'unknown';
  const champion = !!company.champion_contact_id;
  const dm = !!company.decision_maker_contact_id;
  const blocker = !!company.blocker_contact_id || !!(company.blocker_label || '').trim();
  const any = champion || dm || blocker;
  if (!any) return 'unknown';
  if (champion && dm && blocker) return 'complete';
  return 'partial';
}

/** Soft labels — never shout UNKNOWN. */
export function mapStatusLabel(status: StakeholderMapStatus): string {
  switch (status) {
    case 'complete':
      return 'Complete';
    case 'partial':
      return 'Partial';
    case 'unknown':
    default:
      return 'Unknown';
  }
}
