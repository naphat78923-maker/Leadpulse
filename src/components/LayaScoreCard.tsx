'use client';

import { useEffect, useRef, useState } from 'react';
import { BrainCircuit, Loader2 } from 'lucide-react';
import type { Company, Deal } from '@/types/crm';
import { bangkokDateKey } from '@/utils/format';
import { buildLayaAttentionInput } from '@/utils/lead-scoring';
import { requestLocalLaya, type LayaConnection } from '@/utils/laya-transport';
import clsx from 'clsx';

const LABELS = {
  priority: 'Prioritise',
  nurture: 'Nurture',
  research: 'Research',
  deprioritize: 'Deprioritise',
} as const;

type AttentionLevel = keyof typeof LABELS;
const LOCAL_ENGINES = ['cpu_ne', 'cpu_gpu'] as const;
function isLocalEngine(value: unknown): boolean {
  return typeof value === 'string' && LOCAL_ENGINES.some(engine => engine === value);
}

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
    isLocalEngine(result.trace.model?.engine) &&
    typeof result.trace.scored_at === 'string' &&
    Number.isFinite(Date.parse(result.trace.scored_at))
  );
}

export default function LayaScoreCard({ deal, company }: { deal: Deal; company?: Company }) {
  const [today, setToday] = useState(() => bangkokDateKey());
  const [connection, setConnection] = useState<LayaConnection>('local');
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
  const identity = JSON.stringify([deal.id, deal.company_id, company?.id, today, requestBody, connection]);
  return <>
    <label className="mb-2 block text-xs text-clay-muted">
      Laya connection
      <select className="ml-2 rounded border border-clay-lavender/40 bg-white p-1 dark:bg-clay-card" value={connection}
        onChange={event => setConnection(event.target.value as LayaConnection)}>
        <option value="local">This Mac</option>
        <option value="tailnet">Private phone (Tailscale)</option>
      </select>
    </label>
    <LayaScoreRequest key={identity} requestBody={requestBody} connection={connection} ensureCurrentDay={ensureCurrentDay} />
  </>;
}

function LayaScoreRequest({ requestBody, connection, ensureCurrentDay }: { requestBody: string; connection: LayaConnection; ensureCurrentDay: () => boolean }) {
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasScored, setHasScored] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
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
        connection,
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
      setShowHelp(false);
    } catch (reason) {
      if (!isCurrent()) return;
      setResult(null);
      const message = reason instanceof Error ? reason.message : 'Could not score this deal.';
      setError(message);
      // Mac-local setup help only for connection-level failures; a reachable
      // worker's refusal (opt-out, invalid reply) is not a setup problem.
      setShowHelp(/local worker|Cannot reach Laya/i.test(message));
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

      {showHelp && (
        <div className="mt-3 space-y-1.5 rounded-lg border border-clay-hairline bg-white/60 p-2.5 text-[11px] text-clay-muted dark:bg-clay-card">
          <p>{connection === 'local' ? 'This Mac mode uses 127.0.0.1 on the browsing device. On a phone, switch to Private phone (Tailscale).' : 'Private phone mode needs Tailscale connected on this phone and the Mac. It uses a private HTTPS connection to the Mac, not a public tunnel.'}</p>
          <p>
            On the Mac, run <code>npm run laya:serve</code> and keep the worker and Tailscale Serve running. If prompted, allow network access for this trusted LeadPulse site.
            A connection failure can mean a stopped worker, disconnected Tailscale, blocked browser permission, or incompatible browser policy. CRM features work without Laya.
          </p>
        </div>
      )}
    </section>
  );
}
