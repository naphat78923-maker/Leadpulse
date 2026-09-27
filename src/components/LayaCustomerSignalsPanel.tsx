'use client';

import { useEffect, useRef, useState } from 'react';
import type { CustomerEvidenceFolder } from '@/utils/customer-evidence';
import {
  buildLayaCustomerSignalsInput,
  parseLayaCustomerSignalsResponse,
} from '@/utils/laya-customer-signals';
import type {
  LayaCustomerSignalsInput,
  LayaCustomerSignalsReadyInput,
  LayaCustomerSignalsResult,
  LayaScoreTransportResponse,
} from '@/utils/laya-customer-signals';
import { requestLocalLaya } from '@/utils/laya-transport';

/**
 * Display-only, explicitly user-triggered panel for the local Laya worker.
 * It renders raw model output as UNVERIFIED hints beside the exact source
 * message, and never writes any CRM state: no saved dates, no queue ranking,
 * no cadence, no contact permission change.
 */

export type LayaPanelState =
  | { phase: 'idle' }
  | { phase: 'running'; entityId: string; requestKey: string }
  | { phase: 'blocked'; inputStatus: 'not_assessed' | 'needs_review'; reason: string }
  | { phase: 'result'; result: LayaCustomerSignalsResult };

export type LayaRunRequest = (
  body: string,
  signal: AbortSignal,
) => Promise<LayaScoreTransportResponse>;

const defaultRunRequest: LayaRunRequest = (body, signal) =>
  requestLocalLaya('/score', { signal, body });

const NOUL_QUESTION_LABELS: Record<string, string> = {
  possible_contact_stop: 'Possible stop-contact request',
  requested_deferral: 'Requested deferral (contact later)',
  unresolved_problem: 'Unresolved problem report',
};

export function formatProbability(value: number): string {
  // Deterministic percentage rendering; the raw probability is shown separately.
  return `${(value * 100).toFixed(1)}%`;
}

export function inputBlockedLabel(
  inputStatus: 'not_assessed' | 'needs_review',
  reason: string,
): string {
  if (inputStatus === 'needs_review') {
    if (reason === 'buyer_evidence_order_unknown') {
      return 'Not run: buyer-message order is uncertain, so the packet was not built. Review the evidence yourself.';
    }
    if (reason === 'duplicate_source_ref') {
      return 'Not run: evidence source identities conflict, so the packet was not built.';
    }
    if (reason === 'source_identity_mismatch') {
      return 'Not run: evidence source identity does not match this deal, so the packet was not built.';
    }
    return `Not run: the evidence packet needs manual review (${reason}).`;
  }
  if (reason === 'no_attributed_buyer_text') {
    return 'Not run: no verbatim buyer text is stored on this deal. This does not prove there was no reply.';
  }
  if (reason === 'invalid_model_input' || reason === 'ineligible_model_evidence') {
    return 'Not run: the collected evidence did not form a valid model input.';
  }
  if (reason === 'too_many_date_candidates') return 'Not run: too many date candidates in the evidence.';
  if (reason === 'request_too_large') return 'Not run: the request exceeded the local size limit.';
  if (reason === 'secure_request_id_unavailable') {
    return 'Not run: this browser could not create a secure request id.';
  }
  return `Not run: ${reason}.`;
}

/** Pure mapping of every result status to its on-screen headline. */
export function layaResultHeadline(result: LayaCustomerSignalsResult): string {
  switch (result.status) {
    case 'scored':
      return 'Local model returned a result. Treat it as an unverified hint only.';
    case 'disabled':
      return 'The automatic advisory path is disabled in this build (evaluation required); no automatic judgment ran.';
    case 'unavailable':
      if (result.reason === 'timeout') {
        return 'Unavailable: the local check timed out. The worker may be busy, offline, or blocked by browser local-network permissions.';
      }
      if (result.reason === 'cancelled') {
        return 'Cancelled: this request was replaced by a newer one; its response was ignored.';
      }
      if (result.reason === 'worker_busy') {
        return 'Unavailable: the local worker is busy. Wait a moment and run the check again.';
      }
      return 'Unavailable: the local worker could not be reached. Check that the Laya worker is running on this machine.';
    case 'invalid_result':
      return 'Invalid result: the response failed strict validation against the exact request, so nothing from it is shown.';
    case 'unsupported_schema':
      return 'Unsupported schema: the local worker does not accept the frozen customer-signals schema this build sends.';
    case 'held':
      return 'Not scored: the worker held this packet on a contact opt-out flag. Confirm the source message yourself.';
    case 'not_assessed':
      return `Not scored by the worker (${result.reason}). The evidence was not judged.`;
    default:
      return 'The evidence packet needs manual review before any local check can run.';
  }
}

function errorToUnavailable(
  error: unknown,
  request: LayaCustomerSignalsReadyInput,
): LayaCustomerSignalsResult {
  const name = typeof error === 'object' && error !== null && 'name' in error
    && typeof (error as { name?: unknown }).name === 'string'
    ? (error as { name: string }).name
    : '';
  const reason = name === 'TimeoutError'
    ? 'timeout' as const
    : name === 'AbortError'
      ? 'cancelled' as const
      : 'worker_unavailable' as const;
  return {
    status: 'unavailable',
    entityId: request.entityId,
    requestKey: request.requestKey,
    reason,
  };
}

function NoulAnswerRow({ label, answer }: { label: string; answer: { noul: number; confidence: number } }) {
  return (
    <li className="break-words">
      <strong>{label} (model, unverified):</strong> noul {answer.noul.toFixed(4)} ·
      {' '}true {formatProbability(answer.noul)} / false {formatProbability(1 - answer.noul)} ·
      {' '}model confidence {formatProbability(answer.confidence)}
    </li>
  );
}

function ScoredResultView({
  result,
  sourceMessages,
}: {
  result: Extract<LayaCustomerSignalsResult, { status: 'scored' }>;
  sourceMessages: string[];
}) {
  const need = result.answers.main_customer_need;
  const distribution = Object.entries(need.probabilities)
    .map(([option, probability]) => `${option} ${formatProbability(probability)}`)
    .join(' · ');
  return (
    <div data-testid="laya-scored-result" className="space-y-2">
      <p className="font-semibold text-clay-ink">{layaResultHeadline(result)}</p>
      <p className="break-words">
        Schema <code className="break-all">{result.schemaVersion}</code> · scored{' '}
        {result.evaluatedAt} · model <code className="break-all">{result.model.engine}</code>{' '}
        (local worker, unverified)
      </p>
      <div className="rounded-md border border-clay-ochre/40 bg-clay-ochre/5 px-2 py-1.5 font-semibold text-clay-ink">
        Experimental · unverified — confirm yourself.
        {' '}This display never changes saved dates, queue ranking, cadence, or contact permission.
      </div>
      <div>
        <p className="font-semibold">Exact source message the model read:</p>
        {sourceMessages.length === 0 ? (
          <p>No eligible buyer text was in the packet.</p>
        ) : (
          sourceMessages.map((message, index) => (
            <blockquote
              key={index}
              className="mt-1 whitespace-pre-wrap break-words border-l-2 border-clay-lavender/50 pl-2 text-clay-body"
            >
              {message}
            </blockquote>
          ))
        )}
      </div>
      <ul className="space-y-1">
        <NoulAnswerRow label={NOUL_QUESTION_LABELS.possible_contact_stop} answer={result.answers.possible_contact_stop} />
        <NoulAnswerRow label={NOUL_QUESTION_LABELS.requested_deferral} answer={result.answers.requested_deferral} />
        <NoulAnswerRow label={NOUL_QUESTION_LABELS.unresolved_problem} answer={result.answers.unresolved_problem} />
      </ul>
      <p className="break-words">
        <strong>Main customer need (model, unverified):</strong> {need.choice} ·{' '}
        {formatProbability(need.probabilities[need.choice])} · model confidence{' '}
        {formatProbability(need.confidence)}
      </p>
      <p className="break-words">Choice distribution: {distribution}</p>
      {result.requiresHumanReview && (
        <p className="font-semibold">
          The model output suggests human review. That suggestion is itself unverified model
          behaviour — check the source message directly.
        </p>
      )}
    </div>
  );
}

export default function LayaCustomerSignalsPanel({
  folder,
  runRequest,
}: {
  folder: CustomerEvidenceFolder;
  /** Injectable transport for tests; production uses requestLocalLaya('/score'). */
  runRequest?: LayaRunRequest;
}) {
  const [state, setState] = useState<LayaPanelState>({ phase: 'idle' });
  const abortRef = useRef<AbortController | null>(null);
  const pendingKeyRef = useRef<string | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const runCheck = async () => {
    abortRef.current?.abort();
    const input: LayaCustomerSignalsInput = buildLayaCustomerSignalsInput(folder.judgmentPacket);
    if (input.status !== 'ready') {
      pendingKeyRef.current = null;
      setState({ phase: 'blocked', inputStatus: input.status, reason: input.reason });
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    // Bind this run to entityId + requestKey; any later response that does not
    // carry the still-pending key is stale and is discarded.
    pendingKeyRef.current = input.requestKey;
    setState({ phase: 'running', entityId: input.entityId, requestKey: input.requestKey });
    const transport = runRequest ?? defaultRunRequest;
    try {
      const response = await transport(input.body, controller.signal);
      if (pendingKeyRef.current !== input.requestKey) return;
      pendingKeyRef.current = null;
      const result = parseLayaCustomerSignalsResponse(response.payload, input, response.status);
      setState({ phase: 'result', result });
    } catch (error) {
      if (pendingKeyRef.current !== input.requestKey) return;
      pendingKeyRef.current = null;
      setState({ phase: 'result', result: errorToUnavailable(error, input) });
    }
  };

  const sourceMessages = folder.judgmentPacket.evidence
    .filter((item) => item.eligibleForCustomerJudgment)
    .map((item) => item.text);

  const running = state.phase === 'running';

  return (
    <section
      data-testid="laya-customer-signals-panel"
      aria-label="Experimental local Laya check"
      className="space-y-2 border-t border-clay-hairline pt-2"
    >
      <p className="font-semibold text-clay-ink">Experimental · unverified — confirm yourself.</p>
      <p className="break-words">
        This check sends the verbatim buyer text below to the Laya worker running on this
        machine only when you press the button. Output is a display-only hint: it never
        changes saved dates, queue ranking, cadence, or contact permission.
      </p>
      <button
        type="button"
        data-testid="laya-run-check"
        onClick={() => { void runCheck(); }}
        className="min-h-11 w-fit rounded-md border border-clay-hairline px-3 py-2 text-xs font-semibold text-clay-ink hover:border-clay-lavender focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay-lavender"
      >
        {running ? 'Running local check…' : 'Run experimental local check'}
      </button>
      {running && (
        <p role="status" aria-live="polite">
          Running the local check… scores are not saved anywhere.
        </p>
      )}
      {state.phase === 'blocked' && (
        <p role="status" className="font-semibold">{inputBlockedLabel(state.inputStatus, state.reason)}</p>
      )}
      {state.phase === 'result' && state.result.status !== 'scored' && (
        <p role="status" className="font-semibold">{layaResultHeadline(state.result)}</p>
      )}
      {state.phase === 'result' && state.result.status === 'scored' && (
        <ScoredResultView result={state.result} sourceMessages={sourceMessages} />
      )}
    </section>
  );
}
