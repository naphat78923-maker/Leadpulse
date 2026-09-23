'use client';

import { useEffect, useRef, useState } from 'react';
import { BrainCircuit, Loader2 } from 'lucide-react';
import type { Company, Deal } from '@/types/crm';
import { bangkokDateKey } from '@/utils/format';
import { buildLayaAttentionInput } from '@/utils/lead-scoring';
import { requestLocalLaya } from '@/utils/laya-transport';
import clsx from 'clsx';

const LABELS = {
  priority: 'Prioritise',
  nurture: 'Nurture',
  research: 'Research',
  deprioritize: 'Deprioritise',
} as const;

type AttentionLevel = keyof typeof LABELS;

type ScoreResult = {
  recommendation: AttentionLevel;
  confidence: number;
  probabilities: Record<AttentionLevel, number>;
  usage?: { input_tokens?: number | null; output_tokens?: number | null };
  trace: {
    scored_input: { state: string; questions: Record<string, unknown> };
    model: { repository: string; source_revision: string; package_sha256: string; engine: string };
    scored_at: string;
  };
};

function isProbability(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isScoreResult(value: unknown): value is ScoreResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<ScoreResult>;
  return (
    typeof result.recommendation === 'string' &&
    Object.prototype.hasOwnProperty.call(LABELS, result.recommendation) &&
    isProbability(result.confidence) &&
    !!result.probabilities &&
    Object.keys(LABELS).every(level => isProbability(result.probabilities?.[level as AttentionLevel])) &&
    !!result.trace && typeof result.trace === 'object' &&
    typeof result.trace.scored_input?.state === 'string' &&
    !!result.trace.scored_input?.questions &&
    typeof result.trace.model?.repository === 'string' &&
    typeof result.trace.model?.source_revision === 'string' &&
    typeof result.trace.model?.package_sha256 === 'string' &&
    result.trace.model?.engine === 'cpu_ne' &&
    typeof result.trace.scored_at === 'string' &&
    Number.isFinite(Date.parse(result.trace.scored_at))
  );
}

function LayaConnectionCheck() {
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => {
    active.current?.abort();
    active.current = null;
  }, []);

  const check = async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const isCurrent = () => active.current === controller && !controller.signal.aborted;
    setChecking(true);
    setMessage(null);
    setFailed(false);
    try {
      const { ok, payload } = await requestLocalLaya('/health', { signal: controller.signal });
      if (!isCurrent()) return;
      if (!ok || !payload || typeof payload !== 'object' || !('status' in payload) || payload.status !== 'ready' || !('engine' in payload) || payload.engine !== 'cpu_ne') {
        throw new Error('The local endpoint did not report a ready Laya worker. Check the worker and port, then retry.');
      }
      setMessage('Local worker responded to this check; not a score or a guarantee the next request will succeed.');
    } catch (reason) {
      if (!isCurrent()) return;
      setFailed(true);
      setMessage(reason instanceof Error ? reason.message : 'Could not check the local worker.');
    } finally {
      if (isCurrent()) {
        active.current = null;
        setChecking(false);
      }
    }
  };

  return (
    <div className="mt-2 text-[11px] text-clay-muted">
      <button type="button" disabled={checking} onClick={() => void check()} className="min-h-[36px] rounded-lg border border-clay-lavender/30 px-3 py-2 font-semibold disabled:opacity-60">
        {checking ? 'Checking local connection…' : 'Check local connection'}
      </button>
      {message && <p role={failed ? 'alert' : 'status'} className="mt-1">{message}</p>}
    </div>
  );
}


export default function LayaScoreCard({ deal, company }: { deal: Deal; company?: Company }) {
  const [today, setToday] = useState(() => bangkokDateKey());
  useEffect(() => {
    const refreshDay = () => setToday(bangkokDateKey());
    const timer = window.setInterval(refreshDay, 60_000);
    window.addEventListener('focus', refreshDay);
    document.addEventListener('visibilitychange', refreshDay);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshDay);
      document.removeEventListener('visibilitychange', refreshDay);
    };
  }, []);
  const ensureCurrentDay = () => {
    const now = bangkokDateKey();
    if (now === today) return true;
    setToday(now);
    return false;
  };
  const requestBody = JSON.stringify(buildLayaAttentionInput({ deal, company, today }));
  // Exact serialized identity, not a lossy hash. Remount before displaying any
  // state belonging to a different deal, linked company or encoded request.
  const identity = JSON.stringify([deal.id, deal.company_id, company?.id, today, requestBody]);
  return <LayaScoreRequest key={identity} requestBody={requestBody} ensureCurrentDay={ensureCurrentDay} />;
}

function LayaScoreRequest({ requestBody, ensureCurrentDay }: { requestBody: string; ensureCurrentDay: () => boolean }) {
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasScored, setHasScored] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => () => {
    activeRequest.current?.abort();
    activeRequest.current = null;
  }, []);

  const score = async () => {
    if (!ensureCurrentDay()) return;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const isCurrent = () => activeRequest.current === controller && !controller.signal.aborted && ensureCurrentDay();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { ok, payload } = await requestLocalLaya('/score', {
        body: requestBody,
        signal: controller.signal,
      });
      if (!isCurrent()) return;
      if (!ok) {
        const detail = payload && typeof payload === 'object' && 'error' in payload ? String(payload.error) : 'Could not score this deal.';
        throw new Error(detail);
      }
      if (!isScoreResult(payload)) throw new Error('Laya returned an incomplete score.');
      if (JSON.stringify(payload.trace.scored_input) !== requestBody) {
        throw new Error('Laya’s reported scored input did not match the request. No recommendation shown.');
      }
      setResult(payload);
      setHasScored(true);
    } catch (reason) {
      if (!isCurrent()) return;
      setResult(null);
      setError(reason instanceof Error ? reason.message : 'Could not score this deal.');
    } finally {
      if (isCurrent()) {
        activeRequest.current = null;
        setLoading(false);
      }
    }
  };

  return (
    <section className="rounded-xl border border-clay-lavender/30 bg-clay-lavender/10 p-3" aria-label="Laya attention recommendation">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-wider text-clay-lavender">LAYA ATTENTION RECOMMENDATION</p>
          <p className="mt-1 text-xs text-clay-muted">Recommendation only. It does not change this deal.</p>
        </div>
        <BrainCircuit className="h-5 w-5 shrink-0 text-clay-lavender" aria-hidden="true" />
      </div>

      <div className="mt-3 space-y-1 text-[11px] text-clay-muted">
        <p>Mac-local only: Laya must run on the same Mac as this browser. Vercel does not run the model.</p>
        <p>A phone or another computer cannot reach your Mac through this connection.</p>
        <details>
          <summary className="cursor-pointer font-semibold">Local setup &amp; connection help</summary>
          <p className="mt-2">In the LeadPulse project on this Mac, run <code>npm run laya:serve</code> and wait for the ready message.</p>
          <p>If prompted, allow local-network access for this trusted LeadPulse site in your browser. A connection failure can mean a stopped worker, blocked permission, or incompatible browser policy.</p>
          <p>No cloud fallback or automatic scoring. CRM features work without Laya.</p>
        </details>
      </div>

      <LayaConnectionCheck />

      {result && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] text-clay-muted">Choice option probabilities, not purchase probabilities.</p>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-clay-lavender/25 bg-white/70 px-3 py-2 dark:bg-clay-card">
            <span className="text-sm font-semibold text-clay-ink">{LABELS[result.recommendation]}</span>
            <span className="text-xs font-medium text-clay-lavender">{Math.round(result.probabilities[result.recommendation] * 100)}%</span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-clay-muted">
            {(Object.keys(LABELS) as AttentionLevel[]).map(level => (
              <span key={level} className={clsx(level === result.recommendation && 'font-semibold text-clay-ink')}>
                {LABELS[level]} {Math.round(result.probabilities[level] * 100)}%
              </span>
            ))}
          </div>
          {result.usage?.input_tokens != null && (
            <p className="text-[10px] text-clay-muted-soft">Local Laya · {result.usage.input_tokens} input tokens · 0 output tokens</p>
          )}
          <details className="text-[11px] text-clay-muted">
            <summary className="cursor-pointer font-semibold">Scoring trace</summary>
            <div className="mt-2 space-y-2 break-words">
              <p>Exact state scored by the local worker:</p>
              <p className="whitespace-pre-wrap rounded-lg bg-white/70 p-2 dark:bg-clay-card">{result.trace.scored_input.state}</p>
              <p>Question, instructions and choice criteria sent to the model:</p>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-white/70 p-2 dark:bg-clay-card">{JSON.stringify(result.trace.scored_input.questions, null, 2)}</pre>
              <p>Omitted by the input recipe: all other CRM fields, including deal and company names, IDs, contacts, addresses, URLs, company notes, company size, deal title, priority, next action, nudge history, and full activity history. Only the displayed state and question were scored. Free-text outcomes and tags can still contain personal information; this is not anonymization.</p>
              <p>Model: {result.trace.model.repository} · source revision {result.trace.model.source_revision} · package SHA-256 {result.trace.model.package_sha256} · {result.trace.model.engine}</p>
              <p>Scored at (UTC): {result.trace.scored_at}</p>
              <p>This is an input and provenance trace, not an explanation of why the model chose an option.</p>
            </div>
          </details>
        </div>
      )}
        <button
          type="button"
          onClick={() => void score()}
          disabled={loading}
          className="mt-3 inline-flex min-h-[36px] items-center gap-2 rounded-lg border border-clay-lavender/40 bg-white px-3 py-2 text-xs font-semibold text-clay-lavender transition-colors hover:border-clay-lavender disabled:cursor-wait disabled:opacity-70 dark:bg-clay-card"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BrainCircuit className="h-3.5 w-3.5" />}
          {loading ? 'Scoring locally…' : hasScored ? 'Re-score with Laya' : 'Score with Laya'}
        </button>

      {error && <p role="alert" className="mt-2 text-xs text-clay-error">{error}</p>}
    </section>
  );
}
