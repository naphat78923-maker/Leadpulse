'use client';

// Type a company name and, after a pause, the businesses with that name are offered
// underneath (GET /api/enrich/search). Picking one fills the account from its listing
// and then from its own website. Stays silent when lookup is not set up on the server.

import { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { fetchLead } from '@/components/LinkFill';
import type { PageLead } from '@/utils/page-extract';
import { leadFromPlace, type PlaceMatch } from '@/utils/place-lead';

const PAUSE_MS = 700;
const MIN_LENGTH = 3;

export default function NameLookup({ name, onPick }: { name: string; onPick: (lead: PageLead, kind: string | null) => void }) {
  const [matches, setMatches] = useState<PlaceMatch[]>([]);
  const [filling, setFilling] = useState<string | null>(null);
  /** Lookup is not configured, or the user said none match: stop asking for this form. */
  const off = useRef(false);
  /** The name as it stood when a match was picked or dismissed, so that text is not searched again. */
  const settled = useRef<string | null>(null);

  useEffect(() => {
    const query = name.trim();
    if (off.current || query.length < MIN_LENGTH || query === settled.current) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/enrich/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const body = await response.json();
        if (body?.configured === false) off.current = true;
        setMatches(Array.isArray(body?.matches) ? body.matches : []);
      } catch {
        // Aborted by more typing, or the lookup failed: typing by hand still works.
      }
    }, PAUSE_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [name]);

  const pick = async (match: PlaceMatch) => {
    setFilling(match.id);
    // Their own site adds email, LINE, socials and a logo; the listing alone is enough if it can't be read.
    const page = match.website ? await fetchLead(match.website).catch(() => null) : null;
    settled.current = match.name;
    setMatches([]);
    setFilling(null);
    onPick(leadFromPlace(match, page), match.kind);
  };

  const dismiss = () => {
    settled.current = name.trim();
    setMatches([]);
  };

  if (matches.length === 0 || name.trim().length < MIN_LENGTH) return null;

  return (
    <div className="-mt-2 rounded-xl border border-clay-hairline p-1.5" data-testid="name-lookup">
      <p className="px-2 pb-1 pt-0.5 text-xs text-clay-muted">Is it one of these? Pick one to fill in the rest.</p>
      <ul>
        {matches.map(match => (
          <li key={match.id}>
            <button
              type="button"
              onClick={() => void pick(match)}
              disabled={filling !== null}
              className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-clay-lavender/15 disabled:opacity-60"
            >
              {filling === match.id
                ? <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-clay-muted" aria-hidden="true" />
                : <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-clay-muted-soft" aria-hidden="true" />}
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-clay-ink">{match.name}</span>
                  {match.kind && <span className="shrink-0 rounded-md bg-clay-surface px-1.5 py-0.5 text-[11px] text-clay-muted">{match.kind}</span>}
                </span>
                {match.address && <span className="block truncate text-xs text-clay-muted">{match.address}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={dismiss} className="px-2 py-1 text-xs font-medium text-clay-muted hover:text-clay-ink">None of these</button>
    </div>
  );
}
