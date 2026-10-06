'use client';

// "Add from a link": paste a website or Instagram link and the server reads the account's
// public details from it (POST /api/enrich). Nothing is saved here; the form using this
// decides what to keep.

import { useEffect, useRef, useState } from 'react';
import { Link2, Loader2 } from 'lucide-react';
import type { PageLead } from '@/utils/page-extract';
import { leadDetailCount } from '@/utils/lead-apply';

export async function fetchLead(link: string): Promise<PageLead> {
  const response = await fetch('/api/enrich', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: link }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.lead) throw new Error(body?.error || 'That page could not be read. Fill in the details by hand.');
  return body.lead as PageLead;
}

export default function LinkFill({ initialLink, onLead }: { initialLink?: string | null; onLead: (lead: PageLead) => void }) {
  const [link, setLink] = useState(initialLink ?? '');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const started = useRef(false);

  const fill = async (value: string) => {
    if (!value.trim() || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const lead = await fetchLead(value.trim());
      onLead(lead);
      const count = leadDetailCount(lead);
      setStatus({ tone: 'ok', text: `Found ${count} ${count === 1 ? 'detail' : 'details'}. Check them, then save.` });
    } catch (err) {
      setStatus({ tone: 'error', text: err instanceof Error ? err.message : 'That page could not be read.' });
    } finally {
      setBusy(false);
    }
  };

  // A link handed in from outside (shared from the phone) is read straight away, once.
  useEffect(() => {
    if (!initialLink || started.current) return;
    started.current = true;
    void fill(initialLink);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLink]);

  return (
    <div className="rounded-xl bg-clay-lavender/15 p-3">
      <label htmlFor="link-fill" className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-clay-ink">
        <Link2 className="h-3.5 w-3.5" aria-hidden="true" /> Add from a link
      </label>
      <div className="flex gap-2">
        <input
          id="link-fill"
          type="text"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          value={link}
          onChange={event => setLink(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void fill(link); } }}
          placeholder="Website or Instagram link"
          className="min-w-0 flex-1 rounded-lg border border-clay-hairline bg-white px-3 py-2.5 text-base text-clay-ink focus:outline-none focus:ring-2 focus:ring-clay-lavender dark:bg-clay-card"
        />
        <button
          type="button"
          onClick={() => void fill(link)}
          disabled={busy || !link.trim()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-clay-hairline bg-white px-3 text-sm font-medium text-clay-ink transition-colors hover:border-clay-lavender disabled:text-clay-muted dark:bg-clay-card"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          Fill details
        </button>
      </div>
      {status && (
        <p role="status" className={status.tone === 'error' ? 'mt-1.5 text-xs text-clay-error' : 'mt-1.5 text-xs text-clay-body'}>{status.text}</p>
      )}
    </div>
  );
}
