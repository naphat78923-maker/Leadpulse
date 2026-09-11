'use client';

// ─── LeadPulse Intelligence — Prospect Review (READ-ONLY) ───
//
// A candidate list, not an outbound queue. This screen creates nothing: no prospect
// record, no deal, no contact, no send, no CRM write of any kind.
//
// Two things this screen deliberately does NOT do:
//   1. It does not fall back to src/data mock arrays when the database returns empty
//      (every other list page does). A candidate list built from seed data would be
//      indistinguishable from real pipeline, so an empty corpus shows an empty state.
//   2. It does not show pilot findings. The richer dimensions from the local pilot
//      (route quality, serviceability, relationship history, blockers) have no
//      approved structured source, so they render as "not assessed" and say so.
//
// Every displayed block names its source, and every count is computed at runtime by
// the shared evaluator from live CRM rows.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Search,
  Loader2,
  AlertTriangle,
  Target,
  ChevronDown,
  ExternalLink,
  ShieldAlert,
  Info,
} from 'lucide-react';
import clsx from 'clsx';
import { useCrm } from '@/components/CrmProvider';
import { PageTransition } from '@/components/motion';
import { buildProspectFitReport, type ProspectFit } from '@/utils/prospectFit';
import {
  archetypeOptions,
  buildProspectSourceRows,
  classificationFor,
  contactAvailability,
  filterProspects,
  roleLabel,
  READINESS_DIMENSIONS,
  type ReviewContact,
} from '@/utils/prospectReview';

const SOURCE = 'live CRM via this app: companies, deals, meetings, account_events, contacts';

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

function DimensionPosture() {
  return (
    <section
      aria-label="Readiness dimensions, all separate"
      className="rounded-2xl border border-clay-hairline bg-clay-card p-4"
    >
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-clay-muted" />
        <h2 className="text-sm font-semibold text-clay-ink">Readiness is three separate things</h2>
      </div>
      <p className="mt-1 text-xs text-clay-muted">
        None of these is established for any candidate. They are kept apart on purpose: matching an
        archetype says nothing about whether you can deliver, whether the account is qualified, or
        whether you have approved contact.
      </p>
      <dl className="mt-3 grid gap-2 sm:grid-cols-3">
        {READINESS_DIMENSIONS.map((d) => (
          <div key={d.key} className="rounded-xl border border-clay-hairline bg-clay-canvas p-3">
            <dt className="text-xs font-medium text-clay-ink">{d.label}</dt>
            <dd className="mt-1">
              <span className="inline-block rounded-md bg-clay-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-clay-muted">
                {d.state.replace('_', ' ')}
              </span>
              <SourceNote>{d.source}</SourceNote>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function CandidateDetail({
  fit,
  evidenceContacts,
  contactSummary,
  classification,
}: {
  fit: ProspectFit;
  evidenceContacts: ReviewContact[];
  contactSummary: { named: number; routeOnly: number; none: number; total: number } | undefined;
  classification: ReturnType<typeof classificationFor>;
}) {
  return (
    <div className="border-t border-clay-hairline bg-clay-canvas px-4 py-4 text-sm">
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Why it matched */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-clay-muted">Why it matched</h3>
          <p className="mt-2 text-lg font-semibold text-clay-ink">
            {fit.fit_score}
            <span className="text-xs font-normal text-clay-muted">
              {' '}/100 · heuristic{fit.fit_score >= 100 ? ' · capped at 100' : ''}
            </span>
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
                <span className="rounded-md bg-clay-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-clay-muted">
                  {classification.reason_code}
                </span>
                <span className="rounded-md bg-clay-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-clay-muted">
                  confidence {classification.confidence}
                </span>
                {classification.ambiguous && (
                  <span className="rounded-md bg-clay-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-clay-muted">
                    ambiguous
                  </span>
                )}
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

        {/* Contact availability + explicit unknowns */}
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
          <SourceNote>this app's contacts table (route kinds only; values are not shown here)</SourceNote>

          <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-clay-muted">
            Unknowns and gaps
          </h3>
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
          <p className="mt-1 text-[10px] uppercase tracking-wide text-clay-muted">
            not assessed: no approved structured source in this app
          </p>
          <Link
            href={`/companies?company=${fit.company_id}`}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-clay-lavender hover:underline"
          >
            Open the company record <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ProspectReviewPage() {
  const { companies, deals, meetings, accountEvents, contacts, loading } = useCrm();
  const [query, setQuery] = useState('');
  const [archetypeId, setArchetypeId] = useState<string>('');
  const [reachability, setReachability] = useState<string>('');
  const [expanded, setExpanded] = useState<string | null>(null);

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
  const archetypes = useMemo(() => archetypeOptions(), []);

  const visible = useMemo(
    () => (report ? filterProspects(report.fits, { query, archetypeId: archetypeId || null, reachability: reachability || null }) : []),
    [report, query, archetypeId, reachability]
  );

  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-clay-lavender" />
              <h1 className="font-serif text-2xl text-clay-ink">Prospect Review</h1>
            </div>
            <p className="mt-1 text-sm text-clay-muted">
              Companies that match a published campaign archetype and are not already buying.
            </p>
          </div>
          <span className="rounded-lg border border-clay-hairline bg-clay-card px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-clay-ink">
            Read-only
          </span>
        </div>

        {/* The single most important label on the page */}
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-clay-hairline bg-clay-card p-3">
          <Info className="mt-0.5 w-4 h-4 shrink-0 text-clay-muted" />
          <p className="text-xs text-clay-body">
            <span className="font-semibold text-clay-ink">These are candidates, not qualified accounts.</span>{' '}
            Nothing here is qualified, cleared for outreach, or confirmed serviceable. Matching is
            keyword-based over free-text fields, no contact is verified, and no suppression check
            exists in this app.
          </p>
        </div>

        {/* Loading. The list is deliberately NOT rendered until the first load settles:
            a candidate list built from partially loaded data would understate the pipeline. */}
        {loading && (
          <div className="mt-6 flex items-center gap-2 rounded-2xl border border-clay-hairline bg-clay-card p-6 text-sm text-clay-muted">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading CRM data for the candidate list…
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div
            role="alert"
            className="mt-6 flex items-start gap-2 rounded-2xl border border-clay-hairline bg-clay-card p-6"
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
            {/* Posture */}
            <div className="mt-6">
              <DimensionPosture />
            </div>

            {/* Counts, all computed at runtime */}
            <div className="mt-4 grid gap-2 sm:grid-cols-4">
              {[
                { label: 'Accounts reviewed', value: report.corpus.accounts },
                { label: 'Candidates', value: report.corpus.candidates },
                { label: 'Already buying', value: report.corpus.excluded_already_buying },
                { label: 'Outside archetypes', value: report.corpus.excluded_no_archetype },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-clay-hairline bg-clay-card p-3">
                  <p className="text-xl font-semibold text-clay-ink">{s.value}</p>
                  <p className="text-[11px] uppercase tracking-wide text-clay-muted">{s.label}</p>
                </div>
              ))}
            </div>
            <SourceNote>
              computed live by the shared evaluator {report.reconciliation.ok ? '· reconciliation OK' : '· RECONCILIATION FAILED'}
            </SourceNote>
            {!report.reconciliation.ok && (
              <ul className="mt-1 text-xs text-clay-body">
                {report.reconciliation.problems.map((p) => (
                  <li key={p}>· {p}</li>
                ))}
              </ul>
            )}

            {/* Filters */}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
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
                value={archetypeId}
                onChange={(e) => setArchetypeId(e.target.value)}
                aria-label="Filter by archetype"
                className="rounded-xl border border-clay-hairline bg-clay-card px-3 py-2 text-sm text-clay-ink"
              >
                <option value="">All archetypes</option>
                {archetypes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
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
                <option value="route_only">Route only</option>
                <option value="none">No route</option>
              </select>
            </div>

            <p className="mt-2 text-xs text-clay-muted">
              Showing {visible.length} of {report.corpus.candidates} candidates.
            </p>

            {/* Candidates */}
            {visible.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-clay-hairline bg-clay-card p-6 text-sm text-clay-muted">
                {report.corpus.candidates === 0
                  ? 'No companies loaded, or no account currently matches a published archetype. This screen never falls back to sample data.'
                  : 'No candidate matches the current search or filters.'}
              </div>
            ) : (
              <ul className="mt-4 space-y-2">
                {visible.map((f) => {
                  const isOpen = expanded === f.company_id;
                  const summary = availability.get(f.company_id);
                  const evidenceContacts = (contacts as ReviewContact[]).filter((c) => c.company_id === f.company_id);
                  return (
                    <li key={f.company_id} className="overflow-hidden rounded-2xl border border-clay-hairline bg-clay-card">
                      <button
                        onClick={() => setExpanded(isOpen ? null : f.company_id)}
                        aria-expanded={isOpen}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left motion-press"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-clay-ink">{f.name}</p>
                          <p className="mt-0.5 truncate text-xs text-clay-muted">
                            {roleLabel(f.role)} · {f.archetype_name} · {reachLabel(f.reachability)}
                            {f.already_touched ? ' · has logged interaction' : ''}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-md bg-clay-surface px-2 py-1 text-xs font-semibold text-clay-body">
                          {f.fit_score}
                        </span>
                        <ChevronDown
                          className={clsx('w-4 h-4 shrink-0 text-clay-muted transition-transform', isOpen && 'rotate-180')}
                        />
                      </button>
                      {isOpen && (
                        <CandidateDetail
                          fit={f}
                          evidenceContacts={evidenceContacts}
                          contactSummary={summary}
                          classification={classificationFor(f, rows)}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </PageTransition>
  );
}
