// Loads what the This week page loads and builds the same queue, on the server,
// for the morning digest. Read-only.

import type { Company, Contact, Deal, Meeting } from '@/types/crm';
import * as crm from '@/lib/crm';
import { fetchReorderSignalRows, rankSignals } from '@/lib/historical';
import { buildDailyDigest, type DailyDigest } from '@/utils/daily-digest';
import { buildFollowupActions, deriveRetentionDueSignals, existingRetentionReferenceDate } from '@/utils/followup-policy';
import { buildThisWeekQueue } from '@/utils/this-week-queue';
import { buildWaitingOnYou, waitingLabel } from '@/utils/waiting-on-you';

export async function loadDailyDigest(today: string, appUrl?: string | null): Promise<DailyDigest> {
  const [companies, contacts, dealRows, meetingRows, accountEvents, signalRows] = await Promise.all([
    crm.getCompanies(),
    crm.getContacts(),
    crm.getDeals(),
    crm.getMeetings(),
    // Sales history and reorder signals are extras: without them check-ins are thinner, not wrong.
    crm.getAccountEvents().then(data => ({ data, unavailable: false })).catch(() => ({ data: [], unavailable: true })),
    fetchReorderSignalRows().catch(() => []),
  ]);
  // Same defaults CrmProvider applies in the browser.
  const deals = (dealRows as Deal[]).map(deal => ({ ...deal, contact_ids: deal.contact_ids || [] }));
  const meetings = (meetingRows as Meeting[]).map(meeting => ({ ...meeting, contact_ids: meeting.contact_ids || [], direction: meeting.direction ?? null }));

  const retentionDue = deriveRetentionDueSignals({
    today,
    retentionCalculationDate: existingRetentionReferenceDate(),
    companies: companies as Company[],
    deals,
    meetings,
    accountEvents: accountEvents.data,
    accountEventsUnavailable: accountEvents.unavailable,
  });
  const candidates = buildFollowupActions({ today, deals, companies: companies as Company[], contacts: contacts as Contact[], retentionDue });
  const signals = rankSignals(
    signalRows,
    meetings as unknown as Parameters<typeof rankSignals>[1],
    deals as unknown as Parameters<typeof rankSignals>[2],
    {},
  );
  const queue = buildThisWeekQueue({ candidates, retentionDue, signals, today });

  const companyName = new Map((companies as Company[]).map(company => [company.id, company.name]));
  // Laya's grades are left out here, so a waiting deal is never marked as "asked"; it is still listed.
  const waiting = buildWaitingOnYou({ deals, meetings, today })
    .sort((a, b) => b.daysWaiting - a.daysWaiting)
    .map(item => ({
      name: (item.deal.company_id && companyName.get(item.deal.company_id)) || item.deal.client || item.deal.title || 'Deal',
      label: `Buyer replied ${waitingLabel(item.daysWaiting)}, nothing sent since`,
    }));

  return buildDailyDigest({ queue, waiting, today, appUrl });
}
