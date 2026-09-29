'use client';

// ─── LeadPulse Intelligence — Laya lab: prospect fit judgments ───
//
// Not in the nav. Everyday prospect review lives on Pipeline → Prospects
// (components/ProspectsTab); this page keeps the Laya fit judging, the terminal
// and the evaluator diagnostics for experiments.
//
// A candidate list you work through, not a dashboard explaining how the list was built.
// Membership is deterministic: three pre-gates (buying evidence, status, institutional
// identity) decide who is a candidate, and nothing is scored to get there. Archetype
// fit is a Laya JUDGMENT a human presses for, one candidate at a time or in a batch,
// against the frozen archetype_select + role_support questions.
//
// The evaluator's own diagnostics (counts of excluded accounts, judgment counts,
// reconciliation, source attribution) live under "How matching works" at the foot of
// the page instead of above the list, so the queue starts where the page starts.
//
// Five things this screen deliberately does NOT do:
//   1. It does not fall back to src/data mock arrays when the database returns empty
//      (every other list page does). A candidate list built from seed data would be
//      indistinguishable from real pipeline, so an empty corpus shows an empty state.
//   2. It does not show pilot findings. The richer dimensions from the local pilot
//      (route quality, serviceability, relationship history, blockers) have no
//      approved structured source, so they render as "not assessed" and say so.
//   3. It does not score anything without an explicit press. Judgments are made only
//      when a button is pressed; this page never judges on load or on expand.
//   4. It does not show a bare model number in a row. The archetype and the
//      probabilities live in the detail panel, next to the sentence that says what
//      they are not.
//   5. It does not repeat the campaign archetype on every row.
//
// Judgments are SESSION-ONLY: they are not persisted anywhere, a reload returns every
// candidate to "not judged", and the detail says so. Every count is computed at
// runtime from live CRM rows by the shared evaluator, and the saved review decision
// is loaded and written through the existing review module.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowUpDown, ChevronDown, ExternalLink, Info, Loader2, Search, Target, X } from 'lucide-react';
import clsx from 'clsx';
import { useCrm } from '@/components/CrmProvider';
import { PageTransition } from '@/components/motion';
import {
  buildProspectFitReport,
  judgmentFromAnswers,
  orderCandidates,
  type ProspectCandidate,
  type ProspectJudgment,
} from '@/utils/prospectFit';
import {
  buildProspectSourceRows,
  contactAvailability,
  filterProspects,
  judgmentOptions,
  READINESS_DIMENSIONS,
  type ReviewContact,
} from '@/utils/prospectReview';
import { buildLayaProspectFitInput } from '@/utils/laya-buyer-response';
import { fitAnswersFromRun, parseLayaScore } from '@/utils/laya-answers';
import { requestLocalLaya } from '@/utils/laya-transport';
import { TAXONOMY_VERSION } from '@/utils/companyRole';
import ProspectReviewPanel from '@/components/ProspectReviewPanel';
import { loadProspectReviews, type ProspectReviewRow, type ReviewsLoad } from '@/lib/prospectReviews';
import type { Company, Deal } from '@/types/crm';
import LayaLeadTierBadge from '@/components/LayaLeadTierBadge';
import LayaBuyerSignalsSection from '@/components/LayaBuyerSignalsSection';
import { LayaTerminal, LayaTerminalOpenButton, type LayaTerminalPrefill } from '@/components/LayaTerminal';
import { bestLeadSignal, type LeadSignal } from '@/utils/lead-scoring';
import {
  decisionSpec,
  isOverdue,
  summariseReviews,
  type FollowupDeal,
  type ReviewDecision,
} from '@/utils/prospectReviewDecision';

const SOURCE = 'live CRM via this app: companies, deals, meetings, account_events, contacts';

const CAUTION = 'Candidates only. Qualification and outreach approval pending.';

/** The review queue's tabs. `All` is the way back to every candidate. */
type ReviewTab = 'unreviewed' | ReviewDecision | 'all';

const TABS: { id: ReviewTab; label: string }[] = [
  { id: 'unreviewed', label: 'Unreviewed' },
  { id: 'shortlist', label: 'Shortlisted' },
  { id: 'needs_research', label: 'Needs research' },
  { id: 'not_a_fit', label: 'Not a fit' },
  { id: 'all', label: 'All' },
];

function tabLabel(tab: ReviewTab): string {
  const found = TABS.find((t) => t.id === tab);
  if (found) return found.label;
  return String(tab);
}

function reachLabel(r: ProspectCandidate['reachability']): string {
  if (r === 'named_contact') return 'Named contact';
  if (r === 'route_only') return 'Route only, no name';
  return 'No route found';
}

function SourceNote({ children }: { children: React.ReactNode }) {
  // Deliberately not 10px uppercase muted text: at that size and contrast the source
  // attribution was the hardest thing on the page to read, which defeats its purpose.
  return <p className="mt-1 text-[11px] leading-snug text-clay-body/80">source: {children}</p>;
}

function Chip({ children, tone = 'plain' }: { children: React.ReactNode; tone?: 'plain' | 'decision' }) {
  return (
    <span
      className={clsx(
        'inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        tone === 'decision' ? 'bg-clay-lavender/15 text-clay-ink' : 'bg-clay-surface text-clay-muted'
      )}
    >
      {children}
    </span>
  );
}

/**
 * The three readiness dimensions, kept visibly separate and un-assessed, inside the
 * candidate it applies to. The pilot produced richer values for these in markdown and
 * they are deliberately NOT promoted into app data.
 */
function ReadinessBlock() {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-clay-muted">
        Readiness — three separate things
      </h3>
      <p className="mt-2 text-xs text-clay-body">
        None of these is established for any candidate. They are kept apart on purpose: matching an
        archetype says nothing about whether you can deliver, whether the account is qualified, or
        whether you have approved contact.
      </p>
      <dl className="mt-2 space-y-2">
        {READINESS_DIMENSIONS.map((d) => (
          <div key={d.key} className="rounded-xl border border-clay-hairline bg-clay-canvas p-3">
            <dt className="text-xs font-medium text-clay-ink">{d.label}</dt>
            <dd className="mt-1">
              <Chip>{d.state.replace('_', ' ')}</Chip>
              <SourceNote>{d.source}</SourceNote>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function CandidateDetail({
  fit,
  evidenceContacts,
  contactSummary,
  judgment,
  judging,
  judgeError,
  onJudge,
  review,
  companyDeals,
  layaDeals,
  company,
  onReviewChanged,
  onOpenTerminal,
}: {
  fit: ProspectCandidate;
  evidenceContacts: ReviewContact[];
  contactSummary: { named: number; routeOnly: number; none: number; total: number } | undefined;
  judgment: ProspectJudgment | null;
  judging: boolean;
  judgeError: string | null;
  onJudge: () => void;
  review: ProspectReviewRow | null;
  companyDeals: FollowupDeal[];
  layaDeals: Deal[];
  company: Company | undefined;
  onReviewChanged: () => Promise<void> | void;
  onOpenTerminal: (prefill: LayaTerminalPrefill) => void;
}) {
  const judgmentInput = useMemo(
    () => buildLayaProspectFitInput({
      name: fit.name,
      industry: fit.industry,
      tags: fit.tags,
      taxonomyVersion: TAXONOMY_VERSION,
    }),
    [fit.name, fit.industry, fit.tags]
  );
  return (
    <div className="border-t border-clay-hairline bg-clay-canvas px-4 py-4 text-sm">
      <div className="grid gap-4 lg:grid-cols-3">
        {/* The model's judgment — the numbers live HERE, never in the row */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-clay-muted">Laya fit judgment</h3>
          {judgment ? (
            <div className="mt-2 space-y-2 text-xs">
              <p className="text-clay-ink font-semibold">{judgment.archetype_name ?? judgment.archetype_id}</p>
              <div className="flex flex-wrap gap-2">
                <Chip>archetype confidence {judgment.archetype_confidence.toFixed(2)}</Chip>
                <Chip>{judgment.role_support < 0.5 ? 'identity supports this' : 'goes beyond the identity'}</Chip>
              </div>
              <ul className="space-y-0.5 text-clay-body">
                {(Object.entries(judgment.probabilities) as [string, number][]).map(([id, p]) => (
                  <li key={id} className={clsx(id === judgment.archetype_id && 'font-medium text-clay-ink')}>
                    · {id}: {p.toFixed(2)}
                  </li>
                ))}
              </ul>
              <p className="text-clay-body">
                role_support {judgment.role_support.toFixed(2)} —{' '}
                {judgment.role_support < 0.5
                  ? 'the name, industry and tags support the assigned archetype'
                  : 'the assigned archetype goes beyond what the name, industry and tags establish'}
                .
              </p>
              <SourceNote>
                local Laya worker (frozen archetype_select + role_support), judged {judgment.judged_at} · this
                session only, not saved
              </SourceNote>
              <p className="text-[10px] uppercase tracking-wide text-clay-muted">
                model judgment, not a qualification and not a verified business fact
              </p>
              <button
                onClick={onJudge}
                disabled={judging}
                className="inline-flex items-center gap-1.5 rounded-lg border border-clay-hairline bg-clay-card px-2.5 py-1.5 text-xs font-medium text-clay-ink motion-press disabled:opacity-60"
              >
                {judging && <Loader2 className="w-3 h-3 animate-spin" />}
                {judging ? 'Judging…' : 'Judge again'}
              </button>
            </div>
          ) : (
            <div className="mt-2 space-y-2 text-xs">
              <p className="text-clay-body">
                Not judged yet. One press sends this account&apos;s name, industry and tags to the local Laya
                worker, which answers the frozen archetype and support questions in a single inference pass.
              </p>
              <button
                onClick={onJudge}
                disabled={judging}
                className="inline-flex items-center gap-1.5 rounded-lg border border-clay-hairline bg-clay-card px-2.5 py-1.5 text-xs font-medium text-clay-ink motion-press disabled:opacity-60"
              >
                {judging && <Loader2 className="w-3 h-3 animate-spin" />}
                {judging ? 'Judging…' : 'Judge fit with Laya'}
              </button>
              <SourceNote>explicit action only — expanding a candidate never judges it</SourceNote>
              <p className="text-[10px] uppercase tracking-wide text-clay-muted">
                advisory, not a qualification, not a delivery-coverage check, not an approval
              </p>
            </div>
          )}
          {judgeError && (
            <p role="alert" className="mt-2 text-xs text-clay-error">
              {judgeError}
            </p>
          )}
        </div>

        {/* The exact text a judge press sends — transparency, nothing else */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-clay-muted">What Laya is asked</h3>
          {judgmentInput ? (
            <>
              <p className="mt-2 rounded-xl border border-clay-hairline bg-clay-card p-2 text-xs leading-snug text-clay-body">
                {judgmentInput.state}
              </p>
              <p className="mt-2 text-xs text-clay-muted">
                Two frozen questions: <span className="font-mono text-[11px]">archetype_select</span> (which
                published archetype fits, or <span className="font-mono text-[11px]">no_fit</span>) and{' '}
                <span className="font-mono text-[11px]">role_support</span> (is that assignment supported by
                the identity?).
              </p>
              <SourceNote>the exact payload a judge press sends; nothing else leaves this app</SourceNote>
            </>
          ) : (
            <p className="mt-2 text-xs text-clay-muted">
              Nothing would be sent: this account states no name, industry or tags to judge.
            </p>
          )}
        </div>

        {/* Readiness, contact availability and the explicit unknowns */}
        <div className="space-y-4">
          <ReadinessBlock />

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-clay-muted">
              Known contact availability
            </h3>
            <p className="mt-2 text-xs text-clay-body">
              {reachLabel(fit.reachability)}
              {contactSummary ? ` · ${contactSummary.total} contact record(s)` : ''}
            </p>
            {contactSummary && (
              <p className="mt-1 text-xs text-clay-muted">
                {contactSummary.named} named · {contactSummary.routeOnly} route without a name ·{' '}
                {contactSummary.none} with nothing usable
              </p>
            )}
            {evidenceContacts.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-clay-body">
                {evidenceContacts.map((c, i) => (
                  <li key={`${c.name ?? 'contact'}-${i}`}>
                    · {c.name || 'unnamed'}
                    {c.job_title ? ` — ${c.job_title}` : ''} ·{' '}
                    <span className="text-clay-muted">
                      identity {c.identity_quality ?? 'unknown'}
                      {c.email ? ' · has email' : ''}
                      {c.phone ? ' · has phone' : ''}
                      {c.line ? ' · has LINE' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <SourceNote>this app&apos;s contacts table (route kinds only; values are not shown here)</SourceNote>
            <p className="mt-2 text-xs text-clay-muted">
              {fit.already_touched
                ? 'Interaction log: this account has at least one logged row (any type, including internal workflow).'
                : 'Interaction log: no rows logged for this account in this CRM.'}
            </p>
            <Link
              href={`/companies?company=${fit.company_id}`}
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-clay-lavender hover:underline"
            >
              Open the company record <ExternalLink className="w-3 h-3" />
            </Link>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-clay-muted">Unknowns and gaps</h3>
            {fit.gaps.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs text-clay-body">
                {fit.gaps.map((g) => (
                  <li key={g}>· {g}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-clay-muted">The evaluator raised no row-fact gaps for this account.</p>
            )}
            <p className="mt-2 text-xs text-clay-muted">
              Serviceability, sales qualification and outreach authorisation are all shown above as
              not assessed. They are not inferred from this judgment.
            </p>
          </div>
        </div>
      </div>

      {/* Laya buyer signals — verbatim buyer replies on this account's open deals,
          scored on demand only (this section never triggers a model call). */}
      <LayaBuyerSignalsSection deals={layaDeals} companyFor={() => company} />

      {/* Prefills the top-of-page terminal with this account's buyer text —
          opens and focuses the box, but never scores (explicit action only). */}
      <LayaTerminalOpenButton deals={layaDeals} onOpen={onOpenTerminal} />

      {/* The saved review. Keyed by company so one account's draft can never be saved
          onto another when the user expands a different candidate. The archetypeId
          comes from the model's judgment when there is one: before that, no published
          criteria can be cited, and the panel says so by offering none. */}
      <ProspectReviewPanel
        key={fit.company_id}
        companyId={fit.company_id}
        companyName={fit.name}
        archetypeId={judgment && judgment.archetype_id !== 'no_fit' ? judgment.archetype_id : ''}
        deals={companyDeals}
        review={review}
        onChanged={onReviewChanged}
      />
    </div>
  );
}

/**
 * Everything the queue no longer shows on its face, kept available and un-deleted:
 * what membership and judging actually do, what is still unestablished for every
 * candidate, the shared evaluator's own accounting, and the review-count
 * reconciliation.
 */
function HowMatchingWorks({
  report,
  judgments,
  droppedNotFit,
  reviewSummary,
  reviewsError,
}: {
  report: NonNullable<ReturnType<typeof buildProspectFitReport>>;
  judgments: Record<string, ProspectJudgment | undefined>;
  droppedNotFit: number;
  reviewSummary: ReturnType<typeof summariseReviews>;
  reviewsError: string | null;
}) {
  const judged = Object.values(judgments).filter((j) => j && j.archetype_id !== 'no_fit').length;
  const unjudged = report.corpus.candidates - Object.keys(judgments).length;
  return (
    <details className="mt-6 rounded-xl border border-clay-hairline bg-clay-card p-3">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-clay-muted">
        How matching works
      </summary>
      <div className="mt-3 space-y-3 text-xs leading-snug text-clay-body">
        <p>
          Membership is deterministic: an account is a candidate when it has no buying evidence, its
          status is &quot;prospect&quot;, and its stated industry is not an institutional identity (a school
          or college is never a commercial prospect, so it is never sent to the model). Nothing is scored
          to get this far.
        </p>
        <p>
          Archetype fit is a Laya judgment, made only when you press a judge button — one account at a
          time, or the batch button above the list. One local inference pass answers two frozen questions:
          which published archetype fits (or <span className="font-mono text-[11px]">no_fit</span>), and
          whether the name, industry and tags actually support that assignment. Judgments are session-only
          — they are not saved — and advisory: nothing here is qualified, cleared for outreach, or
          confirmed serviceable. No contact is verified, and no suppression check exists in this app.
        </p>
        <p>
          The list keeps judged candidates first, ranked by the model&apos;s archetype confidence (name
          breaks ties), then unjudged candidates by name. A candidate judged not to fit any published
          archetype leaves the queue rather than staying on as filler.
        </p>
        <p>
          Readiness is three separate dimensions — serviceability, sales qualification, outreach
          authorisation — and none of them is established by a judgment. Each candidate states its own
          three states in its detail.
        </p>

        <div>
          <p className="font-semibold text-clay-ink">Judgments this session</p>
          <ul className="mt-1 space-y-1">
            <li>· Judged and in the queue: {judged}</li>
            <li>· Not judged yet: {unjudged}</li>
            <li>· Judged no_fit (left the queue): {droppedNotFit}</li>
          </ul>
          <SourceNote>local Laya worker · held for this session only, never written anywhere</SourceNote>
        </div>

        <div>
          <p className="font-semibold text-clay-ink">Evaluator accounting</p>
          <ul className="mt-1 space-y-1">
            <li>· Accounts reviewed: {report.corpus.accounts}</li>
            <li>· Candidates: {report.corpus.candidates}</li>
            <li>· Already buying: {report.corpus.excluded_already_buying}</li>
            <li>· Status is not a prospect: {report.corpus.excluded_not_a_prospect}</li>
            <li>· Institutional identity: {report.corpus.excluded_institutional}</li>
          </ul>
          <SourceNote>
            computed live by the shared evaluator{' '}
            {report.reconciliation.ok ? '· reconciliation OK' : '· RECONCILIATION FAILED'}
          </SourceNote>
          {!report.reconciliation.ok && (
            <ul className="mt-1 space-y-1">
              {report.reconciliation.problems.map((p) => (
                <li key={p}>· {p}</li>
              ))}
            </ul>
          )}
          <p className="mt-1">
            {report.excluded.length} account(s) are excluded with a stated reason rather than dropped.
          </p>
        </div>

        <div>
          <p className="font-semibold text-clay-ink">Review counts</p>
          <p className="mt-1">
            Shortlisted {reviewSummary.shortlist} · needs research {reviewSummary.needs_research} · not a
            fit {reviewSummary.not_a_fit} · unreviewed {reviewSummary.unreviewed} · candidates{' '}
            {reviewSummary.total}.
          </p>
          <SourceNote>
            computed from the saved review rows against the candidate set (a different source from the
            evaluator counts above){' '}
            {reviewSummary.reconciles ? '· reconciliation OK' : '· RECONCILIATION FAILED'}
          </SourceNote>
          {reviewSummary.outside_candidates > 0 && (
            <p className="mt-1">
              {reviewSummary.outside_candidates} saved review(s) belong to accounts that are no longer
              candidates (they may have become customers). They are kept out of the counts above rather
              than silently dropped.
            </p>
          )}
          {reviewsError && (
            <p className="mt-1">Saved reviews were unreadable in this session: {reviewsError}</p>
          )}
        </div>
      </div>
    </details>
  );
}

export default function ProspectsPage() {
  const { companies, deals, meetings, accountEvents, contacts, loading, refresh } = useCrm();
  const [query, setQuery] = useState('');
  const [judgmentFilter, setJudgmentFilter] = useState<string>('');
  const [reachability, setReachability] = useState<string>('');
  const [tab, setTab] = useState<ReviewTab>('unreviewed');
  const [expanded, setExpanded] = useState<string | null>(null);
  // Saved reviews live outside the CRM corpus on purpose: the evaluator must never
  // read them, so the candidate list stays a pure function of CRM rows.
  const [reviews, setReviews] = useState<Record<string, ProspectReviewRow>>({});
  const [reviewsError, setReviewsError] = useState<string | null>(null);
  const [reviewsMissingTable, setReviewsMissingTable] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // A row's "Open in terminal" hands the terminal a fresh prefill object; the
  // terminal treats each one as a deliberate snapshot (no auto-rescoring).
  const [terminalPrefill, setTerminalPrefill] = useState<LayaTerminalPrefill | null>(null);
  // Fit judgments are SESSION state, never persisted: nothing is written, and a
  // reload returns every candidate to "not judged". A judgment only ever appears
  // after an explicit press — this page never judges on load or on expand.
  const [judgments, setJudgments] = useState<Record<string, ProspectJudgment>>({});
  const [judgingId, setJudgingId] = useState<string | null>(null);
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  const [judgeErrors, setJudgeErrors] = useState<Record<string, string>>({});
  const abortRef = useRef<AbortController | null>(null);

  const input = useMemo(
    () => ({ companies, deals, meetings, events: accountEvents, contacts }),
    [companies, deals, meetings, accountEvents, contacts]
  );

  const { report, error } = useMemo(() => {
    try {
      const r = buildProspectSourceRows(input);
      const rep = buildProspectFitReport(r, { source: SOURCE, now: new Date() });
      return { report: rep, error: null as string | null };
    } catch (e) {
      return { report: null, error: (e as Error).message };
    }
  }, [input]);

  /**
   * One judge press = one local inference pass over the candidate's own identity
   * fields. Returns a failure message, or null on success (the judgment is
   * stored). Mirrors the terminal's error handling: a refusal is named, and a
   * malformed payload is never rendered as a result.
   */
  const judgeOne = useCallback(
    async (candidate: ProspectCandidate, signal: AbortSignal): Promise<string | null> => {
      const fitInput = buildLayaProspectFitInput({
        name: candidate.name,
        industry: candidate.industry,
        tags: candidate.tags,
        taxonomyVersion: report?.taxonomy_version ?? TAXONOMY_VERSION,
      });
      if (!fitInput) return 'Nothing to send: this account states no name, industry or tags.';
      try {
        const sent = { state: fitInput.state, questions: fitInput.questions };
        const { ok, status, payload } = await requestLocalLaya('/score', {
          signal,
          body: JSON.stringify(sent),
        });
        if (!ok) {
          const p = payload as { status?: unknown; error?: unknown } | null;
          const message =
            typeof p?.error === 'string' && p.error
              ? p.error
              : `The local worker refused this judgment (HTTP ${status}).`;
          return p?.status === 'not_scored' || status === 422 ? `Not judged: ${message}` : message;
        }
        const answers = fitAnswersFromRun(parseLayaScore(payload, sent));
        if (!answers) {
          return 'Laya returned an invalid score. A malformed payload is never rendered as a result.';
        }
        setJudgments((prev) => ({
          ...prev,
          [candidate.company_id]: judgmentFromAnswers(candidate.company_id, answers),
        }));
        return null;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return 'Judging cancelled.';
        return err instanceof Error ? err.message : 'Cannot reach the local Laya worker.';
      }
    },
    [report?.taxonomy_version]
  );

  const handleJudge = useCallback(
    async (candidate: ProspectCandidate) => {
      if (judgingId || batch) return;
      setJudgingId(candidate.company_id);
      const message = await judgeOne(candidate, new AbortController().signal);
      setJudgingId(null);
      setJudgeErrors((prev) => {
        const next = { ...prev };
        if (message) next[candidate.company_id] = message;
        else delete next[candidate.company_id];
        return next;
      });
    },
    [batch, judgeOne, judgingId]
  );

  /** Batch judging is sequential and cancellable: one press, visible progress. */
  const handleJudgeAll = useCallback(async () => {
    if (judgingId || batch) return;
    const pending = (report?.candidates ?? []).filter((c) => !judgments[c.company_id]);
    if (pending.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBatch({ done: 0, total: pending.length });
    let done = 0;
    for (const candidate of pending) {
      const message = await judgeOne(candidate, controller.signal);
      if (message) {
        setJudgeErrors((prev) => ({ ...prev, [candidate.company_id]: message }));
        break;
      }
      done += 1;
      setBatch({ done, total: pending.length });
    }
    abortRef.current = null;
    setBatch(null);
  }, [batch, judgeOne, judgments, report, judgingId]);

  // Cancel an in-flight batch if the page unmounts; nothing is written either way.
  useEffect(() => () => abortRef.current?.abort(), []);

  // The queue: judged candidates first (model confidence, then name), unjudged by
  // name, and no_fit judgments dropped out with their count stated in the help.
  const { queue, droppedNoFit } = useMemo(
    () => orderCandidates(report?.candidates ?? [], judgments),
    [report, judgments]
  );

  // Deterministic Laya lead-tier rollup per candidate account (hottest open
  // deal). This is the deal signal, computed client-side with no model call —
  // separate from the fit judgment above it.
  const signalByCompanyId = useMemo(() => {
    const map = new Map<string, LeadSignal>();
    for (const candidate of queue) {
      const signal = bestLeadSignal(deals.filter((d) => d.company_id === candidate.company_id));
      if (signal) map.set(candidate.company_id, signal);
    }
    return map;
  }, [queue, deals]);

  const availability = useMemo(() => contactAvailability(contacts as ReviewContact[]), [contacts]);
  const filterOptions = useMemo(() => judgmentOptions(queue, judgments), [queue, judgments]);

  const visible = useMemo(() => {
    if (!report) return [];
    const base = filterProspects(
      queue,
      {
        query,
        judgment: judgmentFilter || null,
        reachability: reachability || null,
      },
      judgments
    );
    if (tab === 'all') return base;
    if (tab === 'unreviewed') return base.filter((f) => !reviews[f.company_id]);
    return base.filter((f) => reviews[f.company_id]?.decision === tab);
  }, [report, queue, judgments, query, judgmentFilter, reachability, tab, reviews]);

  const applyReviews = useCallback((res: ReviewsLoad) => {
    if (res.ok) {
      setReviews(Object.fromEntries(res.rows.map((r) => [r.company_id, r])));
      setReviewsError(null);
      setReviewsMissingTable(false);
    } else {
      setReviewsError(res.error);
      setReviewsMissingTable(res.tableMissing);
    }
  }, []);

  const reloadReviews = useCallback(async () => {
    applyReviews(await loadProspectReviews());
  }, [applyReviews]);

  useEffect(() => {
    // A one-shot reference load, not a subscription: the state is applied in the
    // promise callback rather than synchronously in the effect body.
    let cancelled = false;
    loadProspectReviews()
      .then((res) => {
        if (!cancelled) applyReviews(res);
      })
      .catch(() => {
        /* loadProspectReviews reports its own failures as a value, never by throwing */
      });
    return () => {
      cancelled = true;
    };
  }, [applyReviews]);

  // A saved review may have moved a deal's follow-up date, so the CRM is refreshed too.
  const handleReviewChanged = useCallback(async () => {
    await reloadReviews();
    await refresh();
  }, [reloadReviews, refresh]);

  // Review counts partition the QUEUE (post-judgment), so a saved review on an
  // account judged no_fit is reported as outside the queue rather than silently
  // counted in a tab whose row is not shown.
  const candidateIds = useMemo(() => queue.map((c) => c.company_id), [queue]);
  const reviewSummary = useMemo(
    () => summariseReviews(Object.values(reviews), candidateIds),
    [reviews, candidateIds]
  );

  const tabCounts: Record<ReviewTab, number> = {
    unreviewed: reviewSummary.unreviewed,
    shortlist: reviewSummary.shortlist,
    needs_research: reviewSummary.needs_research,
    not_a_fit: reviewSummary.not_a_fit,
    all: reviewSummary.total,
  };

  const filtered = Boolean(query.trim() || judgmentFilter || reachability);

  function handleTabKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = TABS.length - 1;
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    else if (e.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    if (next === null) return;
    e.preventDefault();
    setTab(TABS[next].id);
    tabRefs.current[next]?.focus();
  }

  const pendingCount = report
    ? report.candidates.filter((c) => !judgments[c.company_id]).length
    : 0;

  const emptyMessage = !report || report.corpus.candidates === 0
    ? 'No companies loaded, or no account passes the deterministic pre-gates (buying evidence, status, institutional identity). This screen never falls back to sample data.'
    : queue.length === 0
      ? 'Every candidate was judged not to fit a published archetype this session, so the queue is empty. Judgments are session-only: reload to judge them again.'
      : !filtered && tab === 'unreviewed' && reviewSummary.unreviewed === 0
        ? 'This queue is clear: every shown candidate carries a saved review decision. Open All to see them.'
        : 'No candidate matches the current search or filters.';

  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-8">
        {/* Header: the heading, one live summary line, one caution */}
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 shrink-0 text-clay-lavender" />
          <h1 className="font-serif text-2xl text-clay-ink">Laya lab</h1>
        </div>
        {!loading && !error && report ? (
          <p className="mt-1 text-sm text-clay-body">
            <span className="font-semibold text-clay-ink">{queue.length}</span> candidates ·{' '}
            <span className="font-semibold text-clay-ink">{pendingCount}</span> not judged ·{' '}
            <span className="font-semibold text-clay-ink">{reviewSummary.unreviewed}</span> unreviewed
          </p>
        ) : (
          <p className="mt-1 text-sm text-clay-muted">Prospect accounts awaiting a Laya fit judgment.</p>
        )}
        <p className="mt-1 flex items-start gap-1.5 text-xs text-clay-muted">
          <Info className="mt-0.5 w-3.5 h-3.5 shrink-0" />
          <span>{CAUTION}</span>
        </p>

        {/* Laya terminal — collapsed by default; candidate rows can prefill its
            state box, but a score only ever happens on an explicit Run. */}
        <LayaTerminal prefill={terminalPrefill} />

        {/* Loading. The list is deliberately NOT rendered until the first load settles:
            a candidate list built from partially loaded data would understate the pipeline. */}
        {loading && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-clay-hairline bg-clay-card p-6 text-sm text-clay-muted">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading CRM data for the candidate list…
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-2xl border border-clay-hairline bg-clay-card p-6"
          >
            <AlertTriangle className="mt-0.5 w-4 h-4 shrink-0 text-clay-muted" />
            <div>
              <p className="text-sm font-semibold text-clay-ink">The candidate list could not be built.</p>
              <p className="mt-1 text-xs text-clay-body">{error}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-clay-muted">
                nothing was written; reload to try again
              </p>
            </div>
          </div>
        )}

        {!loading && !error && report && (
          <>
            {/* Tabs and filters. Both sit above the list, so the queue is the page. */}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 text-clay-muted" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search candidates"
                  aria-label="Search candidates"
                  className="w-full rounded-xl border border-clay-hairline bg-clay-card py-2 pl-9 pr-3 text-sm text-clay-ink placeholder:text-clay-muted focus:outline-none focus:ring-1 focus:ring-clay-lavender"
                />
              </div>
              <select
                value={judgmentFilter}
                onChange={(e) => setJudgmentFilter(e.target.value)}
                aria-label="Filter by judgment"
                className="rounded-xl border border-clay-hairline bg-clay-card px-3 py-2 text-sm text-clay-ink"
              >
                <option value="">Any judgment state</option>
                {filterOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label} ({o.count})
                  </option>
                ))}
              </select>
              <select
                value={reachability}
                onChange={(e) => setReachability(e.target.value)}
                aria-label="Filter by contact availability"
                className="rounded-xl border border-clay-hairline bg-clay-card px-3 py-2 text-sm text-clay-ink"
              >
                <option value="">Any contact state</option>
                <option value="named_contact">Named contact</option>
                <option value="route_only">Route only, no name</option>
                <option value="none">No route found</option>
              </select>
            </div>

            {/* Judging controls. One explicit press either judges the next pending
                account or the whole pending set, sequentially, with a cancel. */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {batch ? (
                <>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-clay-ink">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Judging {batch.done} / {batch.total}…
                  </span>
                  <button
                    onClick={() => abortRef.current?.abort()}
                    className="inline-flex items-center gap-1 rounded-lg border border-clay-hairline bg-clay-card px-2.5 py-1.5 text-xs font-medium text-clay-ink motion-press"
                  >
                    <X className="w-3 h-3" /> Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => void handleJudgeAll()}
                    disabled={pendingCount === 0 || judgingId !== null}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-clay-hairline bg-clay-card px-2.5 py-1.5 text-xs font-medium text-clay-ink motion-press disabled:opacity-60"
                  >
                    <ArrowUpDown className="w-3 h-3" />
                    Judge all {pendingCount > 0 ? pendingCount : ''} not-judged with Laya
                  </button>
                  <span className="text-[11px] leading-snug text-clay-muted">
                    one local inference pass each, judged in sequence · session only, nothing is saved
                  </span>
                </>
              )}
            </div>

            <div role="tablist" aria-label="Review state" className="mt-3 flex flex-wrap gap-1.5">
              {TABS.map((t, i) => {
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    ref={(el) => {
                      tabRefs.current[i] = el;
                    }}
                    role="tab"
                    id={`prospects-tab-${t.id}`}
                    aria-selected={active}
                    aria-controls="prospects-queue"
                    tabIndex={active ? 0 : -1}
                    onClick={() => setTab(t.id)}
                    onKeyDown={(e) => handleTabKeyDown(e, i)}
                    className={clsx(
                      'rounded-lg border px-2.5 py-1.5 text-xs font-semibold motion-press',
                      active
                        ? 'border-clay-lavender bg-clay-lavender/10 text-clay-ink'
                        : 'border-clay-hairline bg-clay-card text-clay-body hover:text-clay-ink'
                    )}
                  >
                    {t.label}{' '}
                    <span className={clsx('font-normal', active ? 'text-clay-body' : 'text-clay-muted')}>
                      {tabCounts[t.id]}
                    </span>
                  </button>
                );
              })}
            </div>

            {reviewsError && (
              <p className="mt-2 text-xs text-clay-body">
                {reviewsMissingTable
                  ? 'Saved reviews are unavailable until the prospect_reviews migration is applied. The candidate list is unaffected.'
                  : 'Saved reviews are unavailable in this session. The candidate list is unaffected.'}
              </p>
            )}

            <div
              role="tabpanel"
              id="prospects-queue"
              aria-labelledby={`prospects-tab-${tab}`}
              tabIndex={-1}
              className="mt-3"
            >
              <p className="text-xs text-clay-muted">
                Showing {visible.length} of {queue.length} candidates ({tabLabel(tab)})
                {droppedNoFit.length > 0 ? ` · ${droppedNoFit.length} judged no_fit this session, dropped from the queue` : ''}
                .
              </p>

              {visible.length === 0 ? (
                <div className="mt-2 rounded-2xl border border-clay-hairline bg-clay-card p-6 text-sm text-clay-muted">
                  {emptyMessage}
                </div>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {visible.map((f) => {
                    const isOpen = expanded === f.company_id;
                    const summary = availability.get(f.company_id);
                    const evidenceContacts = (contacts as ReviewContact[]).filter(
                      (c) => c.company_id === f.company_id
                    );
                    const review = reviews[f.company_id] ?? null;
                    const overdue = review ? isOverdue(review.next_action_due, new Date()) : false;
                    return (
                      <li
                        key={f.company_id}
                        className="overflow-hidden rounded-xl border border-clay-hairline bg-clay-card"
                      >
                        <button
                          onClick={() => setExpanded(isOpen ? null : f.company_id)}
                          aria-expanded={isOpen}
                          className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left motion-press"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-clay-ink">{f.name}</p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-clay-muted">
                              <span>{judgments[f.company_id] ? 'judged' : 'not judged'}</span>
                              <span aria-hidden="true">·</span>
                              <span>{reachLabel(f.reachability)}</span>
                              <LayaLeadTierBadge signal={signalByCompanyId.get(f.company_id) ?? null} />
                              {review && (
                                <Chip tone="decision">{decisionSpec(review.decision).short}</Chip>
                              )}
                              {overdue && <span className="text-clay-error">follow-up overdue</span>}
                            </p>
                          </div>
                          <ChevronDown
                            className={clsx(
                              'w-4 h-4 shrink-0 text-clay-muted transition-transform',
                              isOpen && 'rotate-180'
                            )}
                          />
                        </button>
                        {isOpen && (
                          <CandidateDetail
                            fit={f}
                            evidenceContacts={evidenceContacts}
                            contactSummary={summary}
                            judgment={judgments[f.company_id] ?? null}
                            judging={judgingId === f.company_id}
                            judgeError={judgeErrors[f.company_id] ?? null}
                            onJudge={() => void handleJudge(f)}
                            review={review}
                            companyDeals={(deals as unknown as FollowupDeal[]).filter(
                              (d) => d.company_id === f.company_id
                            )}
                            layaDeals={deals.filter((d) => d.company_id === f.company_id)}
                            company={companies.find((c) => c.id === f.company_id)}
                            onReviewChanged={handleReviewChanged}
                            onOpenTerminal={setTerminalPrefill}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <HowMatchingWorks
              report={report}
              judgments={judgments}
              droppedNotFit={droppedNoFit.length}
              reviewSummary={reviewSummary}
              reviewsError={reviewsError}
            />
          </>
        )}
      </div>
    </PageTransition>
  );
}
