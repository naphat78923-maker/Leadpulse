'use client';

// ─── Laya terminal — a playground over the same frozen /score contract ───
//
// Three panes, Braintrust-screenshot style: State (the exact text to score),
// Questions (the frozen questions that will be asked, read-only) and Response
// (the worker's answers plus their provenance trace). Everything is explicit:
// the section starts collapsed, "Open in terminal" only prefills the state
// box, and nothing is scored until Run is pressed.
//
// Run sends every frozen question — buyer_response (a choice) and the five
// buyer-detail additions (two nouls, two choices, a score) — in one inference
// pass. The response pane maps over a
// questionResults[] array with a per-type renderer, so a new question in
// laya-questions.json is a data change, not a layout change.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Loader2, Terminal } from 'lucide-react';
import clsx from 'clsx';
import type { Deal } from '@/types/crm';
import {
  buildLayaBuyerResponseInput,
  LAYA_ALL_FROZEN_QUESTIONS,
  type LayaBuyerResponseLevel,
} from '@/utils/laya-buyer-response';
import { parseLayaScore, type LayaAnswer, type LayaTrace } from '@/utils/laya-answers';
import { requestLocalLaya, type LayaConnection } from '@/utils/laya-transport';

const LABELS: Record<LayaBuyerResponseLevel, string> = {
  requested_next_step: 'Requested next step',
  deferred: 'Deferred',
  declined: 'Declined',
  no_commitment: 'No commitment',
  unclear: 'Unclear',
};

/**
 * A prefill handed down from a candidate row: just the state sentence and its
 * provenance. A fresh object per click — the terminal re-prefills (and drops
 * any previous result) whenever the reference changes.
 */
export interface LayaTerminalPrefill {
  state: string;
  /** false when the state paraphrases an outcome note instead of the buyer's verbatim reply */
  verbatim: boolean;
  /** deal title, shown on the state pane badge */
  source: string;
}

/**
 * One answered question in the Response pane. The union (and the per-type
 * renderer below) is the multi-question seam: /score answers 'choice', 'noul'
 * and 'score', and every frozen question maps onto its own row without layout
 * changes. The shapes mirror the worker's answer shapes.
 */
type QuestionResult =
  | {
      id: string;
      type: 'choice';
      label: string;
      winner: string;
      confidence: number;
      bars: ProbabilityBar[];
    }
  | {
      id: string;
      type: 'score';
      label: string;
      score: number;
      confidence: number;
      /** legend label of the highest-probability bucket */
      winner: string;
      legend: string[];
      bars: ProbabilityBar[];
    }
  | { id: string; type: 'noul'; label: string; value: string; confidence: number };

interface ProbabilityBar {
  key: string;
  label: string;
  value: number;
  winner: boolean;
}

interface ScoreRun {
  questionResults: QuestionResult[];
  usage: { input_tokens?: number | null; output_tokens?: number | null } | null;
  trace: LayaTrace;
}

interface NotScored {
  code: string | null;
  message: string;
  inputTokens: number | null;
  tokenLimit: number | null;
}

/** Pretty option labels per choice question; unlisted keys render as-is. */
const CHOICE_LABELS: Record<string, Record<string, string>> = {
  buyer_response: LABELS,
  sample_trial_report: {
    not_established: 'Not established',
    received: 'Received',
    testing_planned: 'Testing planned',
    positive_result: 'Positive result',
    negative_result: 'Negative result',
    mixed_result: 'Mixed result',
  },
  obstacle_kind: {
    no_obstacle_stated: 'No obstacle stated',
    application_technical: 'Application / technical',
    price_terms: 'Price / terms',
    delivery: 'Delivery',
    internal_approval: 'Internal approval',
    timing: 'Timing',
    unclear: 'Unclear',
  },
};

/** One frozen question, typed loosely so rows can dispatch per id. */
interface FrozenQuestionDef {
  type: 'choice' | 'noul' | 'score';
  instructions: string;
}

const FROZEN_QUESTIONS = LAYA_ALL_FROZEN_QUESTIONS as Record<string, FrozenQuestionDef>;

/** Row label: the id, then the question's own opening sentence, lowercased. */
function questionLabel(id: string, def: FrozenQuestionDef): string {
  const questionMark = def.instructions.indexOf('?');
  const opening = questionMark === -1 ? def.instructions : def.instructions.slice(0, questionMark + 1);
  return `${id} — ${opening.charAt(0).toLowerCase()}${opening.slice(1)}`;
}

/** Map one validated answer onto its Response-pane row. */
function toQuestionResult(id: string, answer: LayaAnswer): QuestionResult {
  const label = questionLabel(id, FROZEN_QUESTIONS[id]);
  if (answer.type === 'noul') {
    // Raw value and both sides — the terminal never turns it into a decision.
    return {
      id,
      type: 'noul',
      label,
      value: `noul ${answer.noul.toFixed(4)} · true ${Math.round(answer.noul * 100)}% / false ${Math.round((1 - answer.noul) * 100)}%`,
      confidence: answer.confidence,
    };
  }
  if (answer.type === 'choice') {
    const labels = CHOICE_LABELS[id];
    return {
      id,
      type: 'choice',
      label,
      winner: answer.choice,
      confidence: answer.confidence,
      bars: Object.entries(answer.probabilities).map(([key, value]) => ({
        key,
        label: labels?.[key] ?? key,
        value,
        winner: key === answer.choice,
      })),
    };
  }
  let winnerIndex = 0;
  answer.probabilities.forEach((value, index) => {
    if (value > answer.probabilities[winnerIndex]) winnerIndex = index;
  });
  const bars = answer.legend.map((entry, index) => ({
    key: String(index),
    label: entry,
    value: answer.probabilities[index],
    winner: index === winnerIndex,
  }));
  return {
    id,
    type: 'score',
    label,
    score: answer.score,
    confidence: answer.confidence,
    winner: bars[winnerIndex].label,
    legend: answer.legend,
    bars,
  };
}

/**
 * Validate a /score payload against the exact request and map it onto
 * questionResults. A missing, extra, unknown, or malformed answer rejects the
 * whole payload — nothing partial renders.
 */
function parseScorePayload(payload: unknown, sent: { state: string; questions: Record<string, unknown> }): ScoreRun | null {
  const run = parseLayaScore(payload, sent);
  if (!run) return null;
  return {
    questionResults: Object.entries(run.answers).map(([id, answer]) => toQuestionResult(id, answer)),
    usage: run.usage,
    trace: run.trace,
  };
}

/**
 * The first deal whose product + buyer text the frozen builder can sentence-
 * ise — the same prefill contract the score card uses, so what lands in the
 * state box is exactly what a pre-filled run would send. The recorded deal
 * value comes along for the deal-amount question; the builder adds nothing
 * else.
 */
export function buildLayaTerminalPrefill(deals: Deal[]): LayaTerminalPrefill | null {
  for (const deal of deals) {
    const built = buildLayaBuyerResponseInput({ deal });
    if (built) return { state: built.state, verbatim: built.verbatim, source: deal.title || 'deal' };
  }
  return null;
}

/**
 * The candidate-row affordance. It prefills the terminal's state box (which
 * then expands and focuses) and never scores: the page stays explicit-action.
 */
export function LayaTerminalOpenButton({
  deals,
  onOpen,
}: {
  deals: Deal[];
  onOpen: (prefill: LayaTerminalPrefill) => void;
}) {
  const prefill = useMemo(() => buildLayaTerminalPrefill(deals), [deals]);
  if (!prefill) return null;
  return (
    <button
      type="button"
      onClick={() => onOpen({ ...prefill })}
      className="inline-flex min-h-[36px] items-center gap-2 rounded-lg border border-clay-lavender/40 bg-white px-3 py-2 text-xs font-semibold text-clay-lavender transition-colors hover:border-clay-lavender dark:bg-clay-card"
    >
      <Terminal className="h-3.5 w-3.5" />
      Open in terminal
    </button>
  );
}

export function LayaTerminal({ prefill }: { prefill?: LayaTerminalPrefill | null }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [origin, setOrigin] = useState<LayaTerminalPrefill | null>(null);
  const [edited, setEdited] = useState(false);
  const [connection, setConnection] = useState<LayaConnection>('local');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScoreRun | null>(null);
  const [notScored, setNotScored] = useState<NotScored | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // A prefill is a deliberate snapshot: applied during render (React's
  // props-change adjustment pattern), it replaces the box, drops any stale
  // result and opens the section — it never scores anything by itself.
  const [appliedPrefill, setAppliedPrefill] = useState<LayaTerminalPrefill | null>(null);
  if (prefill && prefill !== appliedPrefill) {
    setAppliedPrefill(prefill);
    setOpen(true);
    setText(prefill.state);
    setOrigin(prefill);
    setEdited(false);
    setResult(null);
    setNotScored(null);
    setError(null);
    setElapsedMs(null);
  }

  // Focus once the textarea has actually mounted (it lives inside the open pane).
  useEffect(() => {
    if (!open || !appliedPrefill) return;
    textareaRef.current?.focus();
  }, [open, appliedPrefill]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const stateToSend = text.trim();

  async function run() {
    if (!stateToSend || loading) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    setResult(null);
    setNotScored(null);
    setElapsedMs(null);
    const startedAt = Date.now();
    try {
      const sent = { state: stateToSend, questions: LAYA_ALL_FROZEN_QUESTIONS };
      const body = JSON.stringify(sent);
      const { ok, status, payload } = await requestLocalLaya('/score', {
        signal: controller.signal,
        body,
        connection,
      });
      setElapsedMs(Date.now() - startedAt);
      if (!ok) {
        const p = payload as {
          status?: unknown;
          code?: unknown;
          error?: unknown;
          input_tokens?: unknown;
          token_limit?: unknown;
        } | null;
        const message =
          typeof p?.error === 'string' && p.error
            ? p.error
            : `The local worker refused this input (HTTP ${status}).`;
        if (p?.status === 'not_scored' || status === 422) {
          // contact_opt_out and input-budget rejections: explicit "not scored".
          setNotScored({
            code: typeof p?.code === 'string' ? p.code : null,
            message,
            inputTokens: typeof p?.input_tokens === 'number' ? p.input_tokens : null,
            tokenLimit: typeof p?.token_limit === 'number' ? p.token_limit : null,
          });
          setShowHelp(false);
        } else {
          setError(message);
          setShowHelp(true);
        }
        return;
      }
      const parsed = parseScorePayload(payload, sent);
      if (!parsed) {
        setError('Laya returned an invalid score. A malformed payload is never rendered as a result.');
        setShowHelp(false);
        return;
      }
      setResult(parsed);
      setShowHelp(false);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Cannot reach the local Laya worker.');
      setShowHelp(true);
    } finally {
      setLoading(false);
    }
  }

  const stateBadge = !origin
    ? 'pasted or typed'
    : edited
      ? `${origin.source} · edited by hand`
      : origin.verbatim
        ? `${origin.source} · verbatim reply`
        : `${origin.source} · paraphrased note`;

  // The Questions pane shows what will be (or was) sent: the trace's own copy
  // after a run, byte-identical to the frozen constants before one.
  const questionsShown: unknown = result ? result.trace.scored_input.questions : LAYA_ALL_FROZEN_QUESTIONS;

  return (
    <section data-testid="laya-terminal" className="mt-4 rounded-xl border border-clay-hairline bg-clay-card">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Laya terminal"
        className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left motion-press"
      >
        <Terminal className="w-4 h-4 shrink-0 text-clay-lavender" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-clay-ink">Laya terminal</p>
          <p className="mt-0.5 text-[11px] text-clay-muted">
            Paste buyer text and run the frozen questions against the local worker. Explicit action
            only — nothing here scores on its own.
          </p>
        </div>
        <ChevronDown
          className={clsx('w-4 h-4 shrink-0 text-clay-muted transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="border-t border-clay-hairline px-3.5 py-3">
          <div className="grid gap-3 lg:grid-cols-3">
            {/* State — the exact text that will be sent, and nothing else */}
            <div className="rounded-xl border border-clay-hairline bg-clay-canvas p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-clay-muted">State</h3>
                <span className="max-w-[60%] truncate rounded-full border border-clay-hairline bg-white px-2 py-0.5 text-[10px] text-clay-muted dark:bg-clay-card">
                  {stateBadge}
                </span>
              </div>
              <textarea
                ref={textareaRef}
                aria-label="State input"
                rows={7}
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  setEdited(true);
                }}
                placeholder="Paste the buyer's message here…"
                className="mt-2 w-full resize-y rounded-lg border border-clay-hairline bg-white p-2 font-mono text-xs text-clay-ink focus:outline-none focus:ring-1 focus:ring-clay-lavender dark:bg-clay-card"
              />
              <p className="mt-1.5 text-[10px] leading-snug text-clay-muted">
                Only this text and the frozen questions are sent. A row prefill may add “Deal value
                on record: ฿…” when the CRM has one, for the deal-amount question — nothing else:
                no company or deal names, IDs, industry, stage, dates or history. Free text can
                still contain personal information; this is not anonymization.
              </p>
            </div>

            {/* Questions — read-only, the frozen contract as the worker compares it */}
            <div className="rounded-xl border border-clay-hairline bg-clay-canvas p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-clay-muted">
                  Questions
                </h3>
                <span className="rounded-full border border-clay-hairline bg-white px-2 py-0.5 text-[10px] text-clay-muted dark:bg-clay-card">
                  frozen schema; contract-tested
                </span>
              </div>
              <pre
                data-testid="laya-terminal-questions"
                className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white p-2 font-mono text-[11px] text-clay-body dark:bg-clay-card"
              >
                {JSON.stringify(questionsShown, null, 2)}
              </pre>
              <p className="mt-1.5 text-[10px] leading-snug text-clay-muted">
                Read-only. The worker accepts exactly these questions byte-for-byte and refuses any
                other schema with 400 “Unsupported scoring schema”. This panel is not editable on
                purpose.
              </p>
            </div>
            {/* Response — built from the /score payload, question by question */}
            <div className="rounded-xl border border-clay-hairline bg-clay-canvas p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-clay-muted">Response</h3>
              {notScored ? (
                <div
                  data-testid="laya-terminal-not-scored"
                  className="mt-2 rounded-lg border border-clay-error/40 bg-white/70 p-2.5 dark:bg-clay-card"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-clay-error">
                    Not scored
                  </p>
                  <p className="mt-1 text-xs text-clay-body">{notScored.message}</p>
                  {notScored.code && (
                    <p className="mt-1 text-[10px] text-clay-muted">
                      code {notScored.code}
                      {notScored.inputTokens != null && notScored.tokenLimit != null
                        ? ` · ${notScored.inputTokens} tokens needed / ${notScored.tokenLimit} supported`
                        : ''}
                    </p>
                  )}
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-clay-muted">
                    no recommendation was made
                  </p>
                </div>
              ) : result ? (
                <div className="mt-2 space-y-3">
                  {result.questionResults.map((questionResult) => (
                    <QuestionResultCard key={questionResult.id} result={questionResult} />
                  ))}
                  <p className="text-[10px] text-clay-muted-soft">
                    {result.usage?.input_tokens != null
                      ? `Local Laya · ${result.usage.input_tokens} input tokens · ${result.usage.output_tokens ?? 0} output tokens`
                      : 'Local Laya'}
                    {elapsedMs != null ? ` · elapsed ${elapsedMs} ms` : ''}
                  </p>
                  <details className="text-[11px] text-clay-muted">
                    <summary className="cursor-pointer font-semibold">Scoring trace</summary>
                    <div className="mt-2 space-y-2 break-words">
                      <p>Exact state sent to the local worker:</p>
                      <p className="whitespace-pre-wrap rounded-lg bg-white/70 p-2 dark:bg-clay-card">
                        {result.trace.scored_input.state}
                      </p>
                      <p>Question, instructions and choice criteria sent to the model:</p>
                      <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-white/70 p-2 dark:bg-clay-card">
                        {JSON.stringify(result.trace.scored_input.questions, null, 2)}
                      </pre>
                      <p>
                        Model: {result.trace.model.repository} · source revision{' '}
                        {result.trace.model.source_revision} · package SHA-256{' '}
                        {result.trace.model.package_sha256} · {result.trace.model.engine}
                      </p>
                      <p>Scored at (UTC): {result.trace.scored_at}</p>
                      <p>
                        This is an input and provenance trace, not an explanation of why the model
                        chose an option.
                      </p>
                    </div>
                  </details>
                </div>
              ) : (
                <p className="mt-2 text-xs text-clay-muted">
                  Not run yet — nothing is scored until Run is pressed.
                </p>
              )}
            </div>
          </div>
          {/* Actions: a score is always a deliberate, visible press */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void run()}
              disabled={loading || !stateToSend}
              className="inline-flex min-h-[36px] items-center gap-2 rounded-lg border border-clay-lavender/40 bg-white px-3 py-2 text-xs font-semibold text-clay-lavender transition-colors hover:border-clay-lavender disabled:cursor-wait disabled:opacity-70 dark:bg-clay-card"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Terminal className="h-3.5 w-3.5" />}
              {loading ? 'Scoring locally…' : 'Run'}
            </button>
            <label className="text-[11px] text-clay-muted">
              Connection{' '}
              <select
                aria-label="Laya connection"
                value={connection}
                onChange={(event) => {
                  setConnection(event.target.value as LayaConnection);
                  // An old result belongs to the route that produced it.
                  setResult(null);
                  setNotScored(null);
                  setElapsedMs(null);
                }}
                className="rounded-lg border border-clay-hairline bg-clay-card px-2 py-1.5 text-xs text-clay-ink"
              >
                <option value="local">This Mac (127.0.0.1)</option>
                <option value="tailnet">Private phone (Tailscale)</option>
              </select>
            </label>
            {elapsedMs != null && (
              <span className="text-[10px] text-clay-muted-soft">elapsed {elapsedMs} ms</span>
            )}
          </div>

          {error && (
            <p role="alert" className="mt-2 text-xs text-clay-error">
              {error}
            </p>
          )}

          {showHelp && (
            <div className="mt-3 space-y-1.5 rounded-lg border border-clay-hairline bg-white/60 p-2.5 text-[11px] text-clay-muted dark:bg-clay-card">
              <p>
                {connection === 'local'
                  ? 'This Mac mode uses 127.0.0.1 on the browsing device. On a phone, switch to Private phone (Tailscale).'
                  : 'Private phone mode needs Tailscale connected on this phone and the Mac. It uses a private HTTPS connection to the Mac, not a public tunnel.'}
              </p>
              <p>
                On the Mac, run <code>npm run laya:serve</code> and keep the worker and Tailscale
                Serve running. If prompted, allow network access for this trusted LeadPulse site. A
                connection failure can mean a stopped worker, disconnected Tailscale, blocked browser
                permission, or incompatible browser policy — on a phone without Tailscale, Mac mode
                is unreachable by design. CRM features work without Laya.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** The screenshot-style distribution: one bar per option or bucket. */
function ProbabilityBars({ bars }: { bars: ProbabilityBar[] }) {
  return (
    <div className="mt-2 space-y-1.5">
      {bars.map((bar) => (
        <div key={bar.key} className="flex items-center gap-2 text-[11px]">
          <span
            className={clsx(
              'w-28 shrink-0 truncate',
              bar.winner ? 'font-semibold text-clay-ink' : 'text-clay-muted'
            )}
          >
            {bar.label}
          </span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-clay-lavender/20">
            <span
              className={clsx('block h-full rounded-full', bar.winner ? 'bg-clay-lavender' : 'bg-clay-lavender/40')}
              style={{ width: `${bar.value * 100}%` }}
            />
          </span>
          <span
            className={clsx(
              'w-8 shrink-0 text-right tabular-nums',
              bar.winner ? 'text-clay-ink' : 'text-clay-muted'
            )}
          >
            {Math.round(bar.value * 100)}%
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Per-type renderer for one answered question. 'choice', 'noul' and 'score'
 * are the shapes /score produces; the next frozen question only needs payload
 * wiring.
 */
function QuestionResultCard({ result }: { result: QuestionResult }) {
  if (result.type === 'choice') {
    const winnerLabel = result.bars.find((bar) => bar.winner)?.label ?? result.winner;
    return (
      <div data-testid={`laya-terminal-result-${result.id}`}>
        <p className="text-[10px] uppercase tracking-wide text-clay-muted">{result.label}</p>
        <p className="mt-1 text-sm">
          <span className="font-semibold text-clay-ink">{winnerLabel}</span>
          <span className="text-clay-muted"> · confidence {Math.round(result.confidence * 100)}%</span>
        </p>
        <ProbabilityBars bars={result.bars} />
      </div>
    );
  }
  if (result.type === 'score') {
    return (
      <div data-testid={`laya-terminal-result-${result.id}`}>
        <p className="text-[10px] uppercase tracking-wide text-clay-muted">{result.label}</p>
        <p className="mt-1 text-sm">
          <span className="font-semibold text-clay-ink">{result.winner}</span>
          <span className="text-clay-muted"> · confidence {Math.round(result.confidence * 100)}%</span>
        </p>
        <p className="text-[11px] text-clay-muted">
          expected score {result.score} on a 0–{result.legend.length - 1} scale
        </p>
        <ProbabilityBars bars={result.bars} />
      </div>
    );
  }
  return (
    <div data-testid={`laya-terminal-result-${result.id}`}>
      <p className="text-[10px] uppercase tracking-wide text-clay-muted">{result.label}</p>
      <p className="mt-1 text-sm text-clay-ink">{result.value}</p>
    </div>
  );
}
