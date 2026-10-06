// The morning digest: what This week would show, as one short message.
// Pure text building; loading lives in lib/digest-data.ts and sending in lib/telegram.ts.

import type { AttentionCandidate } from './followup-policy';
import type { ThisWeekQueue } from './this-week-queue';
import { checkInSplit, daysOverdue } from './this-week-stats';

export interface DigestWaiting {
  name: string;
  /** e.g. "Buyer replied 3 days ago, nothing sent since" */
  label: string;
}

export interface DailyDigest {
  /** Telegram HTML (b, a) with every value escaped. */
  text: string;
  /** Nothing is waiting, overdue, due today or up for a check-in: no message is sent. */
  isEmpty: boolean;
  counts: { waiting: number; overdue: number; dueToday: number; checkIns: number; needsReview: number };
}

/** How many rows each list shows before "and N more". */
const LIST_LIMIT = 5;

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function headerDate(today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

const nameOf = (item: AttentionCandidate) => item.companyName || item.dealTitle || 'Deal';

function list(title: string, rows: string[], total: number): string[] {
  if (rows.length === 0) return [];
  const more = total - rows.length;
  return ['', `<b>${title}</b>`, ...rows.map(row => `• ${row}`), ...(more > 0 ? [`…and ${more} more`] : [])];
}

function followupRow(item: AttentionCandidate, lead?: string): string {
  const action = item.nextAction?.trim();
  return [`<b>${escapeHtml(nameOf(item))}</b>`, lead, action && escapeHtml(action)].filter(Boolean).join(' · ');
}

export function buildDailyDigest(input: {
  queue: ThisWeekQueue;
  waiting: readonly DigestWaiting[];
  today: string;
  /** Link back to This week; omitted when unknown. */
  appUrl?: string | null;
}): DailyDigest {
  const { queue, waiting, today } = input;
  // A held contact is a decision, not a chase: it is counted under "need a decision" only.
  const contactable = (item: AttentionCandidate) => item.holds.length === 0;
  const overdue = queue.overdue.filter(contactable).sort((a, b) => daysOverdue(b.dueDate, today) - daysOverdue(a.dueDate, today));
  const dueToday = queue.dueThisWeek.filter(item => contactable(item) && item.dueDate === today);
  const split = checkInSplit(queue.checkIns);

  const counts = {
    waiting: waiting.length,
    overdue: overdue.length,
    dueToday: dueToday.length,
    checkIns: queue.checkIns.length,
    needsReview: queue.needsReview.length,
  };
  const isEmpty = Object.values(counts).every(count => count === 0);

  const summary = [
    counts.waiting > 0 && `${counts.waiting} waiting on you`,
    counts.dueToday > 0 && `${counts.dueToday} due today`,
    counts.overdue > 0 && `${counts.overdue} overdue`,
    counts.checkIns > 0 && `${counts.checkIns} ${counts.checkIns === 1 ? 'check-in' : 'check-ins'}`,
    counts.needsReview > 0 && `${counts.needsReview} need a decision`,
  ].filter(Boolean).join(' · ');

  const checkInDetail = [split.at_risk && `${split.at_risk} at-risk`, split.dormant && `${split.dormant} dormant`, split.watch && `${split.watch} watch`]
    .filter(Boolean).join(' · ');

  const lines = [
    `<b>LeadPulse · ${headerDate(today)}</b>`,
    summary || 'Nothing due today.',
    ...list(
      'Waiting on you',
      waiting.slice(0, LIST_LIMIT).map(item => `<b>${escapeHtml(item.name)}</b> · ${escapeHtml(item.label)}`),
      waiting.length,
    ),
    ...list('Due today', dueToday.slice(0, LIST_LIMIT).map(item => followupRow(item)), dueToday.length),
    ...list(
      'Overdue',
      overdue.slice(0, LIST_LIMIT).map(item => followupRow(item, `${daysOverdue(item.dueDate, today)}d`)),
      overdue.length,
    ),
    ...(counts.checkIns > 0
      ? ['', `<b>Customer check-ins</b>`, `${counts.checkIns} due${checkInDetail ? ` (${checkInDetail})` : ''}`]
      : []),
    ...(input.appUrl ? ['', `<a href="${escapeHtml(input.appUrl)}">Open This week</a>`] : []),
  ];

  return { text: lines.join('\n'), isEmpty, counts };
}
