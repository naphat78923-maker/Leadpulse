import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Deal } from '@/types/crm';
import { buildLayaBuyerResponseInput } from '@/utils/laya-buyer-response';
import { LayaTerminal, LayaTerminalOpenButton, type LayaTerminalPrefill } from './LayaTerminal';

const deal: Deal = {
  id: 'deal-1',
  title: 'Butter · Bakery',
  stage: 'contacted',
  product: 'Butter',
  client: 'Private bakery name',
  company_id: null,
  contact_ids: [],
  value: 30000,
  priority: 'medium',
  next_action: null,
  draft_primary_ask: null,
  followup_date: null,
  last_outcome: 'Asked for a sample price',
  buyer_reply: 'Please send us a quotation for 20 kg.',
  nudge_count: 0,
  workflow_action: null,
  nudge_stage: null,
  sample_status: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
};

const built = buildLayaBuyerResponseInput({
  deal: { product: deal.product, buyer_reply: deal.buyer_reply },
})!;

const success = () => ({
  ok: true,
  status: 200,
  json: async () => ({
    question: 'buyer_response',
    recommendation: 'requested_next_step',
    confidence: 0.4,
    probabilities: { requested_next_step: 0.4, deferred: 0.2, declined: 0.2, no_commitment: 0.1, unclear: 0.1 },
    usage: { input_tokens: 93, output_tokens: 0 },
    trace: {
      // Echo the actual request body, exactly like the worker's trace does.
      scored_input: JSON.parse(String(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.body)),
      model: {
        repository: 'aac6fef/laya-multilingual-coreml-ane',
        source_revision: '052592a',
        package_sha256: '53ba84d9',
        engine: 'cpu_ne',
      },
      scored_at: '2026-09-23T04:05:06+00:00',
    },
  }),
});

function openPanel() {
  render(<LayaTerminal />);
  fireEvent.click(screen.getByRole('button', { name: 'Laya terminal' }));
}

function typeStateAndRun(state: string) {
  fireEvent.change(screen.getByLabelText('State input'), { target: { value: state } });
  fireEvent.click(screen.getByRole('button', { name: 'Run' }));
}

describe('Laya terminal', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('starts collapsed and never scores on its own; a row button prefills, expands and focuses', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    function Harness() {
      const [prefill, setPrefill] = useState<LayaTerminalPrefill | null>(null);
      return (
        <>
          <LayaTerminalOpenButton deals={[deal]} onOpen={setPrefill} />
          <LayaTerminal prefill={prefill} />
        </>
      );
    }
    render(<Harness />);

    // Collapsed: no panes, no worker traffic.
    expect(screen.queryByLabelText('State input')).toBeNull();
    expect(screen.getByRole('button', { name: 'Laya terminal' }).getAttribute('aria-expanded')).toBe('false');
    expect(fetchSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Open in terminal' }));

    // The prefill is buildLayaBuyerResponseInput's own state sentence.
    const textarea = screen.getByLabelText('State input') as HTMLTextAreaElement;
    expect(textarea.value).toBe(built.state);
    expect(textarea.value).toContain('We supply Butter');
    expect(textarea.value).toContain('Please send us a quotation for 20 kg.');
    expect(document.activeElement).toBe(textarea);
    expect(screen.getByRole('button', { name: 'Laya terminal' }).getAttribute('aria-expanded')).toBe('true');
    // Provenance stays visible: verbatim reply, not a paraphrased note.
    expect(screen.getByText(/verbatim reply/)).toBeTruthy();
    // Prefill never scores — the page stays explicit-action-only.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByText(/Not run yet/)).toBeTruthy();
  });
  it('renders the frozen question byte-for-byte and the scored distribution from a mocked payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(success());
    vi.stubGlobal('fetch', fetchMock);
    openPanel();

    // Same bytes the builder emits; laya-buyer-response.contract.test.ts pins
    // those to the worker's BUYER_RESPONSE_QUESTION, so the pane is byte-
    // identical to what the worker accepts (and refuses anything else).
    expect(screen.getByTestId('laya-terminal-questions').textContent).toBe(
      JSON.stringify(built.questions, null, 2)
    );
    // Nothing to score yet: Run stays disabled until the box holds text.
    expect(screen.getByRole('button', { name: 'Run' }).hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByLabelText('State input'), { target: { value: built.state } });
    expect(screen.getByRole('button', { name: 'Run' }).hasAttribute('disabled')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    const card = await screen.findByTestId('laya-terminal-result-buyer_response');
    // Winner + confidence…
    expect(card.textContent).toContain('Requested next step');
    expect(card.textContent).toContain('confidence 40%');
    // …and the full per-option distribution.
    for (const pct of ['40%', '20%', '10%']) expect(card.textContent).toContain(pct);
    for (const label of ['Deferred', 'Declined', 'No commitment', 'Unclear']) {
      expect(card.textContent).toContain(label);
    }
    // Usage, client-side elapsed time, and the honesty copy on the trace.
    expect(screen.getByText(/93 input tokens/)).toBeTruthy();
    expect(screen.getAllByText(/elapsed \d+ ms/).length).toBeGreaterThan(0);
    expect(screen.getByText(/input and provenance trace, not an explanation/)).toBeTruthy();
    expect(screen.getByText(/source revision 052592a/)).toBeTruthy();

    // The request is exactly { state, questions } with the frozen question.
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(request.body as string);
    expect(Object.keys(body)).toEqual(['state', 'questions']);
    expect(body.state).toBe(built.state);
    expect(JSON.stringify(body.questions)).toBe(JSON.stringify(built.questions));
  });

  it('drops an old result when the connection route changes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(success()));
    openPanel();
    typeStateAndRun(built.state);
    await screen.findByTestId('laya-terminal-result-buyer_response');
    fireEvent.change(screen.getByLabelText('Laya connection'), { target: { value: 'tailnet' } });
    expect(screen.queryByTestId('laya-terminal-result-buyer_response')).toBeNull();
  });

  it('shows an opt-out refusal as an explicit not-scored state with no recommendation', async () => {
    const message =
      'Not scored: possible no-contact request in the deal evidence. Review manually; do not initiate outreach from this recommendation.';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ status: 'not_scored', code: 'contact_opt_out', error: message }),
    });
    vi.stubGlobal('fetch', fetchMock);
    openPanel();

    const optOutState = 'The buyer replied: "Please do not contact us again."';
    typeStateAndRun(optOutState);

    const block = await screen.findByTestId('laya-terminal-not-scored');
    expect(block.textContent).toContain('Not scored');
    expect(block.textContent).toContain(message);
    expect(block.textContent).toContain('contact_opt_out');
    expect(block.textContent).toContain('no recommendation was made');
    expect(screen.queryByTestId('laya-terminal-result-buyer_response')).toBeNull();
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(request.body as string).state).toBe(optOutState);
  });

  it('shows an input-budget rejection as not-scored with the counted tokens', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          status: 'not_scored',
          code: 'input_too_long',
          error:
            'Not scored: full input needs 600 tokens; this model supports 512. Nothing was shortened and no recommendation was made. Review the full evidence manually.',
          input_tokens: 600,
          token_limit: 512,
        }),
      })
    );
    openPanel();
    typeStateAndRun('A very long buyer message that will not fit the model.');

    const block = await screen.findByTestId('laya-terminal-not-scored');
    expect(block.textContent).toContain('input_too_long');
    expect(block.textContent).toContain('600 tokens needed / 512 supported');
    expect(block.textContent).toContain('no recommendation was made');
    expect(screen.queryByTestId('laya-terminal-result-buyer_response')).toBeNull();
  });

  it('surfaces a transport failure as an alert with worker-down guidance, hidden again after a success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(success())
    );
    openPanel();
    typeStateAndRun(built.state);

    expect((await screen.findByRole('alert')).textContent).toMatch(/Mac worker is running/i);
    expect(screen.getByText(/npm run laya:serve/)).toBeTruthy();
    expect(screen.getByText(/switch to Private phone \(Tailscale\)/)).toBeTruthy();
    // The documented phone-without-Tailscale case lives in the help too.
    expect(screen.getByText(/unreachable by design/)).toBeTruthy();

    // A later success clears the failure help.
    typeStateAndRun(built.state);
    await screen.findByTestId('laya-terminal-result-buyer_response');
    expect(screen.queryByText(/npm run laya:serve/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

