import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildCustomerEvidenceFolder,
  CUSTOMER_EVIDENCE_MAX_INPUT_BYTES,
} from '@/utils/customer-evidence';
import type { LayaScoreTransportResponse } from '@/utils/laya-customer-signals';
import LayaCustomerSignalsPanel, {
  formatProbability,
  layaResultHeadline,
  type LayaRunRequest,
} from './LayaCustomerSignalsPanel';

const BUYER_TEXT = 'Please send the product list.';

function folderWithBuyerReply(buyerReply: string | null) {
  return buildCustomerEvidenceFolder({
    entityId: 'synthetic-deal-1',
    deal: {
      id: 'synthetic-deal-1',
      company_id: 'synthetic-company-1',
      buyer_reply: buyerReply,
      next_action: 'Call customer tomorrow.',
      followup_date: '2026-09-27',
      stage: 'contacted',
      value_type: 'estimated',
    },
    meetings: [],
    accountEvents: [],
    sourceAvailability: { deal: 'loaded', meetings: 'loaded', accountEvents: 'loaded' },
    maxInputBytes: CUSTOMER_EVIDENCE_MAX_INPUT_BYTES,
  });
}

/** Build a strictly valid customer_signals_v2 response from the actual request body. */
function scoredResponse(body: string, overrides: Record<string, unknown> = {}): LayaScoreTransportResponse {
  const request = JSON.parse(body) as { state: string; questions: Record<string, unknown> };
  return {
    ok: true,
    status: 200,
    payload: {
      customer_signal_schema: 'customer_signals_v2',
      answers: {
        possible_contact_stop: { type: 'noul', noul: 0.9, confidence: 0.9 },
        requested_deferral: { type: 'noul', noul: 0.05, confidence: 0.95 },
        unresolved_problem: { type: 'noul', noul: 0.2, confidence: 0.8 },
        main_customer_need: {
          type: 'choice',
          choice: 'answer_question',
          confidence: 0.7,
          probabilities: {
            answer_question: 0.7,
            resolve_problem: 0.1,
            arrange_sample: 0.05,
            order_request: 0.05,
            reconnect_later: 0.05,
            unclear: 0.05,
          },
        },
      },
      trace: {
        scored_input: { state: request.state, questions: request.questions },
        scored_at: '2026-09-27T03:00:00.000Z',
        model: {
          repository: 'synthetic/local-repo',
          source_revision: 'synthetic-revision',
          package_sha256: 'a'.repeat(64),
          engine: 'synthetic-engine',
        },
      },
      usage: { input_tokens: 120, output_tokens: 24 },
      ...overrides,
    },
  };
}

const readyFolder = () => folderWithBuyerReply(BUYER_TEXT);

describe('LayaCustomerSignalsPanel', () => {
  afterEach(cleanup);

  it('renders idle with the always-visible unverified notice and sends nothing', () => {
    const runRequest = vi.fn();
    render(<LayaCustomerSignalsPanel folder={readyFolder()} runRequest={runRequest} />);

    expect(screen.getAllByText(/Experimental · unverified — confirm yourself\./).length).toBeGreaterThan(0);
    expect(screen.getByText(/display-only hint/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Run experimental local check' })).toBeTruthy();
    expect(screen.queryByText(/running the local check/i)).toBeNull();
    expect(runRequest).not.toHaveBeenCalled();
  });

  it('shows a running state while the local request is in flight', async () => {
    const runRequest: LayaRunRequest = () => new Promise(() => {});
    render(<LayaCustomerSignalsPanel folder={readyFolder()} runRequest={runRequest} />);

    fireEvent.click(screen.getByRole('button', { name: 'Run experimental local check' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/running the local check/i));
    expect(screen.getByRole('button', { name: 'Running local check…' })).toBeTruthy();
  });

  it('renders scored output as raw probabilities with percentages beside the source message', async () => {
    const runRequest: LayaRunRequest = (body) => Promise.resolve(scoredResponse(body));
    render(<LayaCustomerSignalsPanel folder={readyFolder()} runRequest={runRequest} />);

    fireEvent.click(screen.getByRole('button', { name: 'Run experimental local check' }));
    const scored = await screen.findByTestId('laya-scored-result');

    expect(scored.textContent).toContain('noul 0.9000');
    expect(scored.textContent).toContain('true 90.0% / false 10.0%');
    expect(scored.textContent).toContain('true 5.0% / false 95.0%');
    expect(scored.textContent).toContain('true 20.0% / false 80.0%');
    expect(scored.textContent).toContain('Main customer need (model, unverified): answer_question · 70.0%');
    expect(scored.textContent).toContain('answer_question 70.0% · resolve_problem 10.0% · arrange_sample 5.0%');
    expect(scored.textContent).toContain('customer_signals_v2');
    // Exact source message is shown beside the outputs.
    expect(scored.textContent).toContain(BUYER_TEXT);
    // Unverified framing is present in the result view itself.
    expect(scored.textContent).toContain('Experimental · unverified — confirm yourself.');
    expect(scored.textContent).toContain('never changes saved dates, queue ranking, cadence, or contact permission');
  });

  it('maps a timeout to the distinct unavailable state', async () => {
    const runRequest: LayaRunRequest = () => {
      const error = new Error('timed out');
      error.name = 'TimeoutError';
      return Promise.reject(error);
    };
    render(<LayaCustomerSignalsPanel folder={readyFolder()} runRequest={runRequest} />);

    fireEvent.click(screen.getByRole('button', { name: 'Run experimental local check' }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('Unavailable: the local check timed out'),
    );
    expect(screen.queryByTestId('laya-scored-result')).toBeNull();
  });

  it('maps an unreachable worker to its own unavailable wording', async () => {
    const runRequest: LayaRunRequest = () => Promise.reject(new Error('connection refused'));
    render(<LayaCustomerSignalsPanel folder={readyFolder()} runRequest={runRequest} />);

    fireEvent.click(screen.getByRole('button', { name: 'Run experimental local check' }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('the local worker could not be reached'),
    );
  });

  it('maps a schema-invalid payload to the distinct invalid-result state and shows nothing from it', async () => {
    const runRequest: LayaRunRequest = () =>
      Promise.resolve({ ok: true, status: 200, payload: { customer_signal_schema: 'customer_signals_v9' } });
    render(<LayaCustomerSignalsPanel folder={readyFolder()} runRequest={runRequest} />);

    fireEvent.click(screen.getByRole('button', { name: 'Run experimental local check' }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('Invalid result: the response failed strict validation'),
    );
    expect(screen.queryByTestId('laya-scored-result')).toBeNull();
    expect(screen.queryByText(/noul/)).toBeNull();
  });

  it('does not send a request when the packet has no attributed buyer text', async () => {
    const runRequest = vi.fn<LayaRunRequest>();
    render(<LayaCustomerSignalsPanel folder={folderWithBuyerReply(null)} runRequest={runRequest} />);

    fireEvent.click(screen.getByRole('button', { name: 'Run experimental local check' }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('Not run: no verbatim buyer text'),
    );
    expect(runRequest).not.toHaveBeenCalled();
  });

  it('ignores a stale response after the user re-runs the check (entityId + requestKey binding)', async () => {
    let calls = 0;
    const runRequest: LayaRunRequest = (body, signal) => {
      calls += 1;
      if (calls === 1) {
        return new Promise<LayaScoreTransportResponse>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true });
        });
      }
      return Promise.resolve(scoredResponse(body));
    };
    render(<LayaCustomerSignalsPanel folder={readyFolder()} runRequest={runRequest} />);

    fireEvent.click(screen.getByRole('button', { name: 'Run experimental local check' }));
    await waitFor(() => expect(calls).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: 'Running local check…' }));
    await screen.findByTestId('laya-scored-result');

    // The superseded request must not overwrite or flash its cancelled state.
    expect(screen.queryByText(/this request was replaced by a newer one/i)).toBeNull();
    expect(screen.getByTestId('laya-scored-result').textContent).toContain(BUYER_TEXT);
  });

  it('formats probabilities deterministically', () => {
    expect(formatProbability(0.9)).toBe('90.0%');
    expect(formatProbability(0.055)).toBe('5.5%');
    expect(formatProbability(0)).toBe('0.0%');
    expect(formatProbability(1)).toBe('100.0%');
  });

  it('labels every non-scored result status distinctly, including disabled', () => {
    const entityId = 'synthetic-deal-1';
    const requestKey = 'synthetic-request-key';
    expect(layaResultHeadline({
      status: 'disabled', entityId, requestKey, reason: 'evaluation_required',
    })).toContain('disabled in this build (evaluation required)');
    expect(layaResultHeadline({
      status: 'unavailable', entityId, requestKey, reason: 'worker_busy',
    })).toContain('local worker is busy');
    expect(layaResultHeadline({
      status: 'unavailable', entityId, requestKey, reason: 'worker_unavailable',
    })).toContain('could not be reached');
    expect(layaResultHeadline({ status: 'invalid_result', entityId, requestKey }))
      .toContain('failed strict validation');
    expect(layaResultHeadline({ status: 'unsupported_schema', entityId, requestKey }))
      .toContain('Unsupported schema');
    expect(layaResultHeadline({
      status: 'held', entityId, requestKey,
      reason: 'contact_opt_out', contactHold: 'review_required', outreachAuthorization: 'not_established',
    })).toContain('Not scored');
    expect(layaResultHeadline({
      status: 'not_assessed', entityId, requestKey, reason: 'input_too_long',
    })).toContain('Not scored by the worker (input_too_long)');
  });
});
