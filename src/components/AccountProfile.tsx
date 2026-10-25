'use client';

import { useState } from 'react';
import { ExternalLink, Loader2, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import * as crm from '@/lib/crm';
import { useToast } from '@/components/ToastProvider';
import { FIT_LABELS, percent, shortUrl, sourceChipLabel, type CompanyFit, type EvidenceRow } from '@/utils/account-profile';
import { PROPOSAL_FIELDS, displayQuote, proposalButtons, type EnrichmentProposal } from '@/utils/proposals';
import { FIT_THRESHOLD } from '@/utils/prospectFit';
import LogoImage from '@/components/LogoImage';

/** Laya's fit grade for the account: the chip, then all three grades as bars. */
export function FitCard({ fit }: { fit: CompanyFit }) {
  const best = FIT_LABELS[fit.best.archetype];
  return (
    <div className="mb-4 rounded-xl border border-clay-hairline p-3">
      <div className="flex items-center justify-between gap-2">
        <span
          className={clsx(
            'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
            fit.fits ? 'bg-clay-lavender/20 text-clay-ink' : 'bg-clay-card text-clay-muted',
          )}
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {fit.fits
            ? `Laya: ${best.short.toLowerCase()} fit ${percent(fit.best.noul)}`
            : `Laya: no fit · best ${best.short.toLowerCase()} ${percent(fit.best.noul)}`}
        </span>
        <span className="text-[11px] text-clay-muted-soft">fit from {percent(FIT_THRESHOLD)}</span>
      </div>
      <div className="mt-2.5 grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_2.5rem] items-center gap-x-2.5 gap-y-1.5 text-xs">
        {fit.grades.map((grade, index) => (
          <FitBar key={grade.archetype} label={FIT_LABELS[grade.archetype].long} noul={grade.noul} strong={index === 0 && fit.fits} />
        ))}
      </div>
    </div>
  );
}

function FitBar({ label, noul, strong }: { label: string; noul: number; strong: boolean }) {
  return (
    <>
      <span className={clsx('truncate', strong ? 'text-clay-ink' : 'text-clay-muted')}>{label}</span>
      <span className="h-1.5 overflow-hidden rounded-full bg-clay-card" role="img" aria-label={`${label} ${percent(noul)}`}>
        <span className={clsx('block h-full rounded-full', strong ? 'bg-clay-lavender' : 'bg-clay-lavender/50')} style={{ width: percent(noul) }} />
      </span>
      <span className={clsx('text-right tabular-nums', strong ? 'text-clay-ink' : 'text-clay-muted')}>{percent(noul)}</span>
    </>
  );
}

const TIER_LONG: Record<EnrichmentProposal['source_tier'], string> = {
  own_site: 'their own site',
  official_social: 'their official social account',
  official_listing: 'an official listing',
  press: 'a press interview, article or guide',
};

/** A logo found on the account's website, waiting for Use logo or Not theirs. */
export interface LogoProposal {
  url: string;
  /** "alicebakery.co.th", from the account's website */
  site: string | null;
  decide: (action: 'use' | 'reject') => Promise<void>;
}

/** Proposals for this account that are still waiting: the same Save / Not theirs as Telegram,
 *  and a logo found on their site. */
export function WaitingForYou({ proposals, logo, onDecided }: { proposals: EnrichmentProposal[]; logo?: LogoProposal | null; onDecided: () => void }) {
  const { addToast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  if (proposals.length === 0 && !logo) return null;

  const decideLogo = async (action: 'use' | 'reject') => {
    if (!logo) return;
    setBusy(`logo:${action}`);
    try {
      await logo.decide(action);
      addToast(action === 'use' ? 'Logo saved' : 'Not saved');
    } catch (err) {
      addToast(err instanceof Error ? `Could not save: ${err.message}` : 'Could not save. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const decide = async (proposal: EnrichmentProposal, action: 'save' | 'reject') => {
    setBusy(`${proposal.id}:${action}`);
    try {
      const result = await crm.decideProposalInApp(proposal.id, action);
      if (result.retry) addToast('Could not save. Try again.');
      else if (result.status === 'applied') addToast('Saved');
      else if (result.status === 'rejected') addToast('Not saved');
      else addToast(result.note ? `Not saved: ${result.note}` : 'Not saved');
      if (!result.retry) onDecided();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Could not save. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mb-4 rounded-xl bg-clay-warning/15 p-3">
      <h3 className="text-xs font-semibold text-clay-warning-strong dark:text-clay-ochre">Waiting for you</h3>
      <div className="mt-1 divide-y divide-clay-warning/25">
        {logo && (
          <div className="flex items-center gap-3 py-2.5">
            <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[22%]">
              <LogoImage src={logo.url} alt="Logo found on their site" onError={() => {}} />
            </span>
            <span className="min-w-0 flex-1 text-sm text-clay-ink">
              Logo
              {logo.site && <span className="block truncate text-[11px] text-clay-muted">{logo.site} · their own site</span>}
            </span>
            <span className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => decideLogo('use')}
                disabled={busy !== null}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-clay-ink px-3 text-xs font-medium text-clay-canvas active:opacity-85 disabled:opacity-60"
              >
                {busy === 'logo:use' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Use logo
              </button>
              <button
                type="button"
                onClick={() => decideLogo('reject')}
                disabled={busy !== null}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-clay-hairline bg-white px-3 text-xs font-medium text-clay-ink active:bg-clay-surface disabled:opacity-60 dark:bg-clay-card"
              >
                {busy === 'logo:reject' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Not theirs
              </button>
            </span>
          </div>
        )}
        {proposals.map((proposal) => {
          const [saveLabel, rejectLabel] = proposalButtons(proposal.id, proposal.field)[0].map((b) => b.text.replace(/^\S+\s/, ''));
          const role = proposal.details?.job_title;
          return (
            <div key={proposal.id} className="py-2.5">
              <p className="text-sm text-clay-ink">
                <span className="text-clay-muted">{PROPOSAL_FIELDS[proposal.field].label} </span>
                {proposal.field === 'website' ? (
                  <a href={proposal.value} target="_blank" rel="noreferrer" className="break-all underline decoration-clay-hairline">{shortUrl(proposal.value)}</a>
                ) : (
                  <span className="break-words">{proposal.value}{role ? ` — ${role}` : ''}</span>
                )}
              </p>
              <blockquote className="mt-1.5 rounded-lg bg-white/70 px-2.5 py-1.5 text-xs italic leading-relaxed text-clay-body dark:bg-clay-card">
                “{displayQuote(proposal.quote)}”
              </blockquote>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <a href={proposal.source_url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-[11px] text-clay-muted">
                  {shortUrl(proposal.source_url)} · {TIER_LONG[proposal.source_tier]}
                </a>
                <span className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => decide(proposal, 'save')}
                    disabled={busy !== null}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-clay-ink px-3 text-xs font-medium text-clay-canvas active:opacity-85 disabled:opacity-60"
                  >
                    {busy === `${proposal.id}:save` && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {saveLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => decide(proposal, 'reject')}
                    disabled={busy !== null}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-clay-hairline bg-white px-3 text-xs font-medium text-clay-ink active:bg-clay-surface disabled:opacity-60 dark:bg-clay-card"
                  >
                    {busy === `${proposal.id}:reject` && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {rejectLabel}
                  </button>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** "own site · 14 Oct": tap to show the exact quote and the page it came from. */
export function SourceChip({ source }: { source: EvidenceRow }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="ml-1.5 inline-flex shrink-0 items-center rounded-md border border-clay-hairline bg-clay-surface px-1.5 py-0.5 align-middle text-[11px] text-clay-muted active:bg-clay-card"
      >
        {sourceChipLabel(source)}
      </button>
      {open && (
        <span className="mt-1.5 block w-full basis-full rounded-lg bg-clay-surface px-2.5 py-1.5 text-xs italic leading-relaxed text-clay-body">
          “{displayQuote(source.quote)}”
          <a href={source.source_url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 not-italic text-clay-muted">
            {shortUrl(source.source_url)} <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </span>
      )}
    </>
  );
}
