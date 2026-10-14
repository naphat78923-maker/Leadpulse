// Sending enrichment proposals to Telegram and acting on Pat's tap. Server only.
// A Save writes exactly one allowlisted field, only if it still holds what the proposal saw,
// reads it back, and records the source in enrichment_evidence. Nothing else is written.

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { answerTelegramCallback, editTelegramMessage, sendTelegramMessage, type InlineButton } from '@/lib/telegram';
import {
  PROPOSAL_FIELDS,
  PROPOSALS_PER_SEND,
  decisionText,
  parseProposalCallback,
  proposalButtons,
  proposalMessage,
  stillAsProposed,
  type EnrichmentProposal,
  type ProposalStatus,
} from '@/utils/proposals';

export interface TelegramOps {
  send: (html: string, buttons?: InlineButton[][]) => Promise<number>;
  edit: (messageId: number, html: string) => Promise<void>;
  answer: (callbackId: string, text: string) => Promise<void>;
}

const telegram: TelegramOps = { send: sendTelegramMessage, edit: editTelegramMessage, answer: answerTelegramCallback };

async function companyName(db: SupabaseClient, companyId: string): Promise<string> {
  const { data } = await db.from('companies').select('name').eq('id', companyId).maybeSingle();
  return (data?.name as string | undefined) || 'this account';
}

/** Pending proposals not yet sent, oldest first, at most PROPOSALS_PER_SEND. */
export async function pendingUnsent(db: SupabaseClient = supabase): Promise<EnrichmentProposal[]> {
  const { data, error } = await db
    .from('enrichment_proposals')
    .select('*')
    .eq('status', 'pending')
    .is('sent_at', null)
    .order('proposed_at', { ascending: true })
    .limit(PROPOSALS_PER_SEND);
  if (error) throw new Error(`Could not read proposals: ${error.message}`);
  return (data ?? []) as EnrichmentProposal[];
}

/** Sends each unsent proposal with Save / Not theirs buttons and records the message id. */
export async function sendPendingProposals(db: SupabaseClient = supabase, tg: TelegramOps = telegram): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const proposal of await pendingUnsent(db)) {
    try {
      const name = await companyName(db, proposal.company_id);
      const messageId = await tg.send(proposalMessage(proposal, name), proposalButtons(proposal.id));
      const { error } = await db.from('enrichment_proposals')
        .update({ telegram_message_id: messageId, sent_at: new Date().toISOString() })
        .eq('id', proposal.id).eq('status', 'pending');
      if (error) throw new Error(error.message);
      sent += 1;
    } catch {
      failed += 1; // left unsent; the next cron run tries again
    }
  }
  return { sent, failed };
}

async function settle(db: SupabaseClient, id: string, status: ProposalStatus, note: string | null): Promise<boolean> {
  const { data, error } = await db.from('enrichment_proposals')
    .update({ status, decision_note: note, decided_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'pending')
    .select('id');
  return !error && (data?.length ?? 0) === 1;
}

/** Applies one decision. Transient failures leave the proposal pending so the tap can be retried. */
export async function decideProposal(
  db: SupabaseClient,
  id: string,
  action: 'save' | 'reject',
): Promise<{ status: ProposalStatus; note: string | null; proposal: EnrichmentProposal | null; retry?: boolean }> {
  const { data: row, error } = await db.from('enrichment_proposals').select('*').eq('id', id).maybeSingle();
  if (error) return { status: 'pending', note: 'could not read the proposal', proposal: null, retry: true };
  if (!row) return { status: 'failed', note: 'proposal not found', proposal: null };
  const proposal = row as EnrichmentProposal;
  if (proposal.status !== 'pending') return { status: proposal.status, note: proposal.decision_note, proposal };

  if (action === 'reject') {
    const ok = await settle(db, id, 'rejected', null);
    return ok ? { status: 'rejected', note: null, proposal } : { status: 'pending', note: 'could not record', proposal, retry: true };
  }

  const target = PROPOSAL_FIELDS[proposal.field];
  if (!target || proposal.entity_type !== 'company' || proposal.entity_id !== proposal.company_id) {
    await settle(db, id, 'failed', 'field is not on the allowlist');
    return { status: 'failed', note: 'field is not on the allowlist', proposal };
  }

  const { data: live, error: readError } = await db.from(target.table).select(`id, ${target.column}`).eq('id', proposal.entity_id).maybeSingle();
  if (readError) return { status: 'pending', note: 'could not read the account', proposal, retry: true };
  const liveValue = (live as Record<string, string | null> | null)?.[target.column] ?? null;
  if (!live || !stillAsProposed(proposal, liveValue)) {
    const note = !live ? 'the account no longer exists' : `${target.label.toLowerCase()} is now ${liveValue || 'empty'}`;
    await settle(db, id, 'stale', note);
    return { status: 'stale', note, proposal };
  }

  // Conditional write: only while the field still holds what the proposal saw.
  let update = db.from(target.table).update({ [target.column]: proposal.value }).eq('id', proposal.entity_id);
  update = proposal.current_value
    ? update.eq(target.column, proposal.current_value)
    : update.or(`${target.column}.is.null,${target.column}.eq.`);
  const { data: written, error: writeError } = await update.select(`id, ${target.column}`);
  if (writeError) return { status: 'pending', note: 'could not save', proposal, retry: true };
  if ((written?.length ?? 0) !== 1) {
    await settle(db, id, 'stale', 'the field changed while saving');
    return { status: 'stale', note: 'the field changed while saving', proposal };
  }
  const { data: back } = await db.from(target.table).select(target.column).eq('id', proposal.entity_id).maybeSingle();
  if ((back as Record<string, string | null> | null)?.[target.column] !== proposal.value) {
    await settle(db, id, 'failed', 'saved value did not read back');
    return { status: 'failed', note: 'saved value did not read back', proposal };
  }

  await db.from('enrichment_evidence').insert({
    entity_type: 'company', entity_id: proposal.entity_id, company_id: proposal.company_id,
    field: proposal.field, value: proposal.value, source_url: proposal.source_url,
    source_tier: proposal.source_tier, quote: proposal.quote, quote_check: 'passed',
    outcome: 'applied', method: 'telegram approval', fetched_at: proposal.proposed_at,
    run_ref: proposal.run_ref ? `${proposal.run_ref}; approved ${proposal.id}` : `approved ${proposal.id}`,
  });
  await settle(db, id, 'applied', null);
  return { status: 'applied', note: null, proposal };
}

interface CallbackUpdate {
  callback_query?: {
    id: string;
    data?: string;
    from?: { id?: number };
    message?: { message_id: number; chat?: { id?: number } };
  };
}

/**
 * One Telegram update. Only a button press from the configured chat on a proposal is acted
 * on; everything else is ignored. Returns what happened, for the route's log line.
 */
export async function handleTelegramUpdate(
  update: CallbackUpdate,
  chatId: string,
  db: SupabaseClient = supabase,
  tg: TelegramOps = telegram,
): Promise<string> {
  const query = update.callback_query;
  if (!query) return 'ignored: not a button press';
  if (String(query.message?.chat?.id ?? '') !== chatId) return 'ignored: another chat';
  const parsed = parseProposalCallback(query.data);
  if (!parsed) {
    await tg.answer(query.id, 'Unknown button');
    return 'ignored: unknown button';
  }
  const result = await decideProposal(db, parsed.id, parsed.action);
  const { footer, toast } = decisionText(result.status, result.note);
  if (result.retry) {
    await tg.answer(query.id, `Could not ${parsed.action === 'save' ? 'save' : 'record'} — tap again`);
    return `retry: ${result.note}`;
  }
  await tg.answer(query.id, toast);
  if (result.proposal && query.message?.message_id && footer) {
    const name = await companyName(db, result.proposal.company_id);
    await tg.edit(query.message.message_id, `${proposalMessage(result.proposal, name)}\n\n${footer}`).catch(() => undefined);
  }
  return `${parsed.action}: ${result.status}`;
}
