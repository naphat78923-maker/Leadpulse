// ─── Enrichment proposals: what Telegram shows and what a tap may do ───
// Pure. Hermes inserts a proposal only after its source check passed; Pat decides each one
// with a button. Loading, sending and saving live in lib/proposals-data.ts; the buttons
// arrive at app/api/telegram/webhook.

export type ProposalField = 'website';
export type ProposalStatus = 'pending' | 'applied' | 'rejected' | 'stale' | 'failed';
export type ProposalAction = 'save' | 'reject';

export interface EnrichmentProposal {
  id: string;
  entity_type: 'company' | 'contact';
  entity_id: string;
  company_id: string;
  field: ProposalField;
  value: string;
  current_value: string | null;
  source_url: string;
  source_tier: 'own_site' | 'official_social' | 'official_listing';
  quote: string;
  quote_check: 'passed';
  reason: string | null;
  status: ProposalStatus;
  decision_note: string | null;
  run_ref: string | null;
  proposed_at: string;
  telegram_message_id: number | null;
  sent_at: string | null;
  decided_at: string | null;
}

/** The only fields a tap may write, and where. Widened one field at a time, each reviewed. */
export const PROPOSAL_FIELDS: Record<ProposalField, { table: 'companies'; column: 'website'; label: string }> = {
  website: { table: 'companies', column: 'website', label: 'Website' },
};

/** How many proposals one cron run sends, so a big research run never floods the chat. */
export const PROPOSALS_PER_SEND = 8;

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const QUOTE_LIMIT = 220;

const TIER_LABEL: Record<EnrichmentProposal['source_tier'], string> = {
  own_site: 'their own site',
  official_social: 'their official social account',
  official_listing: 'an official listing',
};

/** "gateauxhouse.co.th" from "https://www.gateauxhouse.co.th/". */
export function displayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    const path = parsed.pathname.replace(/\/$/, '');
    return `${host}${path}`;
  } catch {
    return url;
  }
}

/** The Telegram message for one proposal (HTML, every value escaped). */
export function proposalMessage(proposal: EnrichmentProposal, companyName: string): string {
  const label = PROPOSAL_FIELDS[proposal.field].label;
  const quote = proposal.quote.replace(/\s+/g, ' ').trim();
  const shortQuote = quote.length > QUOTE_LIMIT ? `${quote.slice(0, QUOTE_LIMIT - 1)}…` : quote;
  const lines = [
    `<b>${escapeHtml(label)} for ${escapeHtml(companyName)}?</b>`,
    `<a href="${escapeHtml(proposal.value)}">${escapeHtml(displayUrl(proposal.value))}</a>`,
    '',
    `<i>“${escapeHtml(shortQuote)}”</i>`,
    `Source: <a href="${escapeHtml(proposal.source_url)}">${escapeHtml(displayUrl(proposal.source_url))}</a> (${TIER_LABEL[proposal.source_tier]})`,
    ...(proposal.reason ? [escapeHtml(proposal.reason)] : []),
    ...(proposal.current_value ? [`Replaces: ${escapeHtml(proposal.current_value)}`] : []),
  ];
  return lines.join('\n');
}

export function proposalButtons(proposalId: string) {
  return [[
    { text: '✅ Save', callback_data: `p:${proposalId}:s` },
    { text: '❌ Not theirs', callback_data: `p:${proposalId}:r` },
  ]];
}

const CALLBACK = /^p:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([sr])$/;

/** The proposal and action a button carries, or null for anything else. */
export function parseProposalCallback(data: unknown): { id: string; action: ProposalAction } | null {
  if (typeof data !== 'string') return null;
  const match = CALLBACK.exec(data);
  if (!match) return null;
  return { id: match[1], action: match[2] === 's' ? 'save' : 'reject' };
}

/** A Save may only fill what the proposal saw: the field must still hold current_value. */
export function stillAsProposed(proposal: Pick<EnrichmentProposal, 'current_value'>, liveValue: string | null | undefined): boolean {
  return (liveValue ?? '').trim() === (proposal.current_value ?? '').trim();
}

/** The line added under a decided proposal, and the toast shown on the tap. */
export function decisionText(status: ProposalStatus, note?: string | null): { footer: string; toast: string } {
  switch (status) {
    case 'applied': return { footer: '✅ <b>Saved to LeadPulse</b>', toast: 'Saved' };
    case 'rejected': return { footer: '❌ <b>Not saved</b>', toast: 'Not saved' };
    case 'stale': return { footer: `⚠️ <b>Not saved:</b> ${escapeHtml(note || 'the field changed since this was proposed')}`, toast: 'Changed since proposed: not saved' };
    case 'failed': return { footer: `⚠️ <b>Could not save:</b> ${escapeHtml(note || 'try again later')}`, toast: 'Could not save' };
    default: return { footer: '', toast: 'Still waiting' };
  }
}
