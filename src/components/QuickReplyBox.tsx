'use client';

// ─── Deal panel: paste the buyer's reply, one step ───
// Paste, save. Records an inbound interaction and the deal's verbatim reply (the only
// text Laya judges) without opening the log form. Lane, schedule and next action stay.

import { useState } from 'react';
import type { Deal } from '@/types/crm';
import * as crm from '@/lib/crm';
import { useCrm } from '@/components/CrmProvider';
import { useToast } from '@/components/ToastProvider';
import ActionButton from '@/components/ActionButton';
import { localDateKey } from '@/utils/deal-board';
import { REPLY_CHANNELS, buildQuickReply, type ReplyChannel } from '@/utils/quick-reply';

export default function QuickReplyBox({ deal }: { deal: Deal }) {
  const { addMeeting, logActivity, refresh } = useCrm();
  const { addToast } = useToast();
  const [words, setWords] = useState('');
  const [channel, setChannel] = useState<ReplyChannel>('dm');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** shows the drawn tick until the next keystroke */
  const [saved, setSaved] = useState(false);

  const save = async () => {
    const reply = buildQuickReply(deal, words, channel, localDateKey());
    if (!reply || saving) return;
    setSaving(true);
    setError(null);
    try {
      await addMeeting(reply.meeting);
      if (Object.keys(reply.dealPatch).length > 0) {
        // The words are the point: if this write fails, say so rather than look saved.
        await crm.updateDealIfUnchanged(deal.id, deal.updated_at, reply.dealPatch);
        logActivity({ type: 'edit', entity: 'deal', entityId: deal.id, label: '💬 Reply pasted', description: `${deal.client} reply saved`, undoPayload: reply.before });
      }
      await refresh();
      setWords('');
      setSaved(true);
      addToast('Reply saved — Laya will grade it');
    } catch {
      setError('Could not save the reply. Check the deal and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label="Paste the buyer's reply" data-testid="quick-reply-box" className="rounded-lg border border-clay-hairline p-3">
      <label className="block text-xs font-medium text-clay-ink">
        Paste the buyer&rsquo;s reply
        <textarea
          value={words}
          onChange={event => { setWords(event.target.value); setSaved(false); }}
          rows={3}
          placeholder="Their exact words, as received"
          className="mt-1 w-full rounded-lg border border-clay-hairline bg-transparent px-3 py-2 text-sm font-normal text-clay-ink placeholder:text-clay-muted focus:outline-none focus:ring-2 focus:ring-clay-ink/10"
        />
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="text-xs text-clay-muted">
          <span className="sr-only">How the reply arrived</span>
          <select value={channel} onChange={event => setChannel(event.target.value as ReplyChannel)}
            className="h-8 rounded-lg border border-clay-hairline bg-transparent px-2 text-xs text-clay-body">
            {REPLY_CHANNELS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <ActionButton busy={saving} disabled={!words.trim()} onClick={save}>Save reply</ActionButton>
        {saved ? (
          <span role="status" className="lp-rise text-xs text-clay-success">Saved</span>
        ) : deal.buyer_reply ? <span className="text-[11px] text-clay-muted">Replaces the saved reply.</span> : null}
      </div>
      {error && <p role="alert" className="mt-1.5 text-xs text-clay-error">{error}</p>}
    </section>
  );
}
