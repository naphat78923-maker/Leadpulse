'use client';

// ─── LeadPulse Intelligence — Prospects: the review queue ───
//
// A candidate list you work through, not a dashboard explaining how the list was built.
// The evaluator's own diagnostics (counts of excluded accounts, per-archetype breakdown,
// reconciliation, source attribution) still exist — they live under "How matching works"
// at the foot of the page instead of above the list, so the queue starts where the page
// starts.
//
// Four things this screen deliberately does NOT do:
//   1. It does not fall back to src/data mock arrays when the database returns empty
//      (every other list page does). A candidate list built from seed data would be
//      indistinguishable from real pipeline, so an empty corpus shows an empty state.
//   2. It does not show pilot findings. The richer dimensions from the local pilot
//      (route quality, serviceability, relationship history, blockers) have no
//      approved structured source, so they render as "not assessed" and say so.
//   3. It does not show a bare score in a row. Match scores are heuristic, so they are
//      only shown in the detail panel, labelled "Match score", next to the sentence
//      that says what they are not.
//   4. It does not repeat the campaign archetype on every row. The archetype a candidate
//      matched is named in its detail, and the per-archetype breakdown is in the help.
//
// Every count is computed at runtime from live CRM rows by the shared evaluator, and the
// saved review decision is loaded and written through the existing review module.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronDown, ExternalLink, Info, Loader2, Search, Target } from 'lucide-react';
import clsx from 'clsx';
import { useCrm } from '@/components/CrmProvider';
import { PageTransition } from '@/components/motion';
import { buildProspectFitReport, type ProspectFit } from '@/utils/prospectFit';
import {
  buildProspectSourceRows,
  classificationFor,
  contactAvailability,
  filterProspects,
  roleLabel,
  READINESS_DIMENSIONS,
  segmentForRole,
  segmentOptions,
  type ReviewContact,
} from '@/utils/prospectReview';
import ProspectReviewPanel from '@/components/ProspectReviewPanel';
import { loadProspectReviews, type ProspectReviewRow, type ReviewsLoad } from '@/lib/prospectReviews';
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

function reachLabel(r: ProspectFit['reachability']): string {
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
  classification,
  review,
  companyDeals,
  onReviewChanged,
}: {
  fit: ProspectFit;
  evidenceContacts: ReviewContact[];
  contactSummary: { named: number; routeOnly: number; none: number; total: number } | undefined;
  classification: ReturnType<typeof classificationFor>;
  review: ProspectReviewRow | null;
  companyDeals: FollowupDeal[];
  onReviewChanged: () => Promise<void> | void;
}) {
  return (
    <div className="border-t border-clay-hairline bg-clay-canvas px-4 py-4 text-sm">
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Why it matched — the score lives HERE, never in the row */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-clay-muted">Why it matched</h3>
          <p className="mt-2 text-sm text-clay-ink">
            <span className="font-semibold">Match score {fit.fit_score}</span>
            <span className="text-clay-muted">
              {' '}
              / 100{fit.fit_score >= 100 ? ' · capped at 100' : ''}
            </span>
          </p>
          <p className="mt-1 text-[11px] leading-snug text-clay-muted">
            A heuristic keyword score over industry and tags. It is not a qualification, not a
            delivery-coverage check, not an approval, and not a probability of a sale.
          </p>
          <ul className="mt-2 space-y-1 text-xs text-clay-body">
            {fit.fit_reasons.map((r) => (
              <li key={r}>· {r}</li>
            ))}
          </ul>
          <SourceNote>the shared evaluator (keyword signals over industry and tags)</SourceNote>
          {fit.signal_hits.length > 0 && (
            <p className="mt-2 text-xs text-clay-muted">
              Criteria signals matched: <span className="text-clay-body">{fit.signal_hits.join(', ')}</span>{' '}
              — textual matches, not verified facts.
            </p>
          )}
          <p className="mt-2 text-xs text-clay-muted">
            Matched archetype: <span className="text-clay-body">{fit.archetype_name}</span>
          </p>
        </div>

        {/* Classified role + method + evidence */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-clay-muted">
            Proposed role and how it was decided
          </h3>
          {classification ? (
            <div className="mt-2 space-y-2 text-xs">
              <p className="text-clay-ink">
                <span className="font-semibold">{roleLabel(classification.role)}</span>
                <span className="text-clay-muted"> ({classification.role})</span>
              </p>
              <div className="flex flex-wrap gap-2">
                <Chip>{classification.reason_code}</Chip>
                <Chip>confidence {classification.confidence}</Chip>
                {classification.ambiguous && <Chip>ambiguous</Chip>}
              </div>
              <p className="text-clay-body">{classification.reason}</p>
              {classification.evidence.length > 0 ? (
                <ul className="space-y-1 text-clay-body">
                  {classification.evidence.map((e, i) => (
                    <li key={`${e.rule}-${i}`}>
                      · matched <span className="font-mono text-[11px]">{e.matched_text}</span> in{' '}
                      <span className="font-medium">{e.field}</span> (rule {e.rule})
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-clay-muted">No textual evidence produced this role.</p>
              )}
              <SourceNote>classifier taxonomy {classification.taxonomy_version} over name, industry, tags</SourceNote>
              <p className="text-[10px] uppercase tracking-wide text-clay-muted">
                heuristic confidence, not a verified business fact
              </p>
            </div>
          ) : (
            <p className="mt-2 text-xs text-clay-muted">Classification unavailable for this row.</p>
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
              <p className="mt-2 text-xs text-clay-muted">The evaluator raised no gaps for this row.</p>
            )}
            <p className="mt-2 text-xs text-clay-muted">
              Serviceability, sales qualification and outreach authorisation are all shown above as
              not assessed. They are not inferred from this fit.
            </p>
          </div>
        </div>
      </div>

      {/* The saved review. Keyed by company so one account's draft can never be saved
          onto another when the user expands a different candidate. */}
      <ProspectReviewPanel
        key={fit.company_id}
        companyId={fit.company_id}
        companyName={fit.name}
        archetypeId={fit.archetype_id}
        deals={companyDeals}
        review={review}
        onChanged={onReviewChanged}
      />
    </div>
  );
}

/**
 * Everything the queue no longer shows on its face, kept available and un-deleted:
 * what matching actually does, what is still unestablished for every candidate, the
 * shared evaluator's own accounting, and the review-count reconciliation.
 */
function HowMatchingWorks({
  report,
  reviewSummary,
  reviewsError,
}: {
  report: NonNullable<ReturnType<typeof buildProspectFitReport>>;
  reviewSummary: ReturnType<typeof summariseReviews>;
  reviewsError: string | null;
}) {
  return (
    <details className="mt-6 rounded-xl border border-clay-hairline bg-clay-card p-3">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-clay-muted">
        How matching works
      </summary>
      <div className="mt-3 space-y-3 text-xs leading-snug text-clay-body">
        <p>
          Companies are compared against the published campaign archetypes by keyword signals over
          free-text fields (industry and tags). These are candidates, not qualified accounts: nothing
          here is qualified, cleared for outreach, or confirmed serviceable. No contact is verified,
          and no suppression check exists in this app. The list keeps the evaluator&apos;s order:
          highest match score first, then name.
        </p>
        <p>
          Readiness is three separate dimensions — serviceability, sales qualification, outreach
          authorisation — and none of them is established by a match. Each candidate states its own
          three states in its detail.
        </p>

        <div>
          <p className="font-semibold text-clay-ink">Candidates per archetype</p>
          <ul className="mt-1 space-y-1">
            {report.by_archetype.map((a) => (
              <li key={a.archetype_id}>
                · {a.name}: {a.candidates} candidate(s) · {a.with_named_contact} with a named contact ·{' '}
                {a.untouched} with no logged interaction
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="font-semibold text-clay-ink">Evaluator accounting</p>
          <ul className="mt-1 space-y-1">
            <li>· Accounts reviewed: {report.corpus.accounts}</li>
            <li>· Candidates: {report.corpus.candidates}</li>
            <li>· Already buying: {report.corpus.excluded_already_buying}</li>
            <li>· Status is not a prospect: {report.corpus.excluded_not_a_prospect}</li>
            <li>· Outside every published archetype: {report.corpus.excluded_no_archetype}</li>
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
  const [segment, setSegment] = useState<string>('');
  const [reachability, setReachability] = useState<string>('');
  const [tab, setTab] = useState<ReviewTab>('unreviewed');
  const [expanded, setExpanded] = useState<string | null>(null);
  // Saved reviews live outside the CRM corpus on purpose: the evaluator must never
  // read them, so the candidate list stays a pure function of CRM rows.
  const [reviews, setReviews] = useState<Record<string, ProspectReviewRow>>({});
  const [reviewsError, setReviewsError] = useState<string | null>(null);
  const [reviewsMissingTable, setReviewsMissingTable] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const input = useMemo(
    () => ({ companies, deals, meetings, events: accountEvents, contacts }),
    [companies, deals, meetings, accountEvents, contacts]
  );

  const { rows, report, error } = useMemo(() => {
    try {
      const r = buildProspectSourceRows(input);
      const rep = buildProspectFitReport(r, { source: SOURCE, now: new Date() });
      return { rows: r, report: rep, error: null as string | null };
    } catch (e) {
      return { rows: [], report: null, error: (e as Error).message };
    }
  }, [input]);

  const availability = useMemo(() => contactAvailability(contacts as ReviewContact[]), [contacts]);
  const segments = useMemo(() => segmentOptions(report?.fits ?? []), [report]);

  const visible = useMemo(() => {
    if (!report) return [];
    const base = filterProspects(report.fits, {
      query,
      segment: segment || null,
      reachability: reachability || null,
    });
    if (tab === 'all') return base;
    if (tab === 'unreviewed') return base.filter((f) => !reviews[f.company_id]);
    return base.filter((f) => reviews[f.company_id]?.decision === tab);
  }, [report, query, segment, reachability, tab, reviews]);

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

  const candidateIds = useMemo(() => (report ? report.fits.map((f) => f.company_id) : []), [report]);
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

  const filtered = Boolean(query.trim() || segment || reachability);

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

  const emptyMessage = !report || report.corpus.candidates === 0
    ? 'No companies loaded, or no account currently matches a published archetype. This screen never falls back to sample data.'
    : !filtered && tab === 'unreviewed' && reviewSummary.unreviewed === 0
      ? 'This queue is clear: every candidate carries a saved review decision. Open All to see them.'
      : 'No candidate matches the current search or filters.';

  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-8">
        {/* Header: the heading, one live summary line, one caution */}
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 shrink-0 text-clay-lavender" />
          <h1 className="font-serif text-2xl text-clay-ink">Prospects</h1>
        </div>
        {!loading && !error && report ? (
          <p className="mt-1 text-sm text-clay-body">
            <span className="font-semibold text-clay-ink">{report.corpus.candidates}</span> candidates ·{' '}
            <span className="font-semibold text-clay-ink">{reviewSummary.unreviewed}</span> unreviewed
          </p>
        ) : (
          <p className="mt-1 text-sm text-clay-muted">Companies that match a published campaign archetype.</p>
        )}
        <p className="mt-1 flex items-start gap-1.5 text-xs text-clay-muted">
          <Info className="mt-0.5 w-3.5 h-3.5 shrink-0" />
          <span>{CAUTION}</span>
        </p>

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
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                aria-label="Filter by segment"
                className="rounded-xl border border-clay-hairline bg-clay-card px-3 py-2 text-sm text-clay-ink"
              >
                <option value="">All segments</option>
                {segments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} ({s.count})
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
                Showing {visible.length} of {report.corpus.candidates} candidates ({tabLabel(tab)}).
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
                              <span>{segmentForRole(f.role)}</span>
                              <span aria-hidden="true">·</span>
                              <span>{reachLabel(f.reachability)}</span>
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
                            classification={classificationFor(f, rows)}
                            review={review}
                            companyDeals={(deals as unknown as FollowupDeal[]).filter(
                              (d) => d.company_id === f.company_id
                            )}
                            onReviewChanged={handleReviewChanged}
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
              reviewSummary={reviewSummary}
              reviewsError={reviewsError}
            />
          </>
        )}
      </div>
    </PageTransition>
  );
}
