import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Deal } from '@/types/crm';
import { buildLayaBuyerResponseInput, LAYA_ALL_FROZEN_QUESTIONS } from '@/utils/laya-buyer-response';
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

// Exactly what the prefill hands the terminal: the buyer text, nothing else.
const built = buildLayaBuyerResponseInput({
  deal: { product: deal.product, buyer_reply: deal.buyer_reply },
})!;

const buyerProbabilities = {
  requested_next_step: 0.4, deferred: 0.2, declined: 0.2, no_commitment: 0.1, unclear: 0.1,
};

// Uniform probabilities across a choice's frozen criteria: valid by
// construction whatever the option count is.
function uniform(criteria: object): Record<string, number> {
  const keys = Object.keys(criteria);
  return Object.fromEntries(keys.map((key) => [key, 1 / keys.length]));
}

const obstacleStrengthLegend = Object.fromEntries(
  LAYA_ALL_FROZEN_QUESTIONS.obstacle_strength.criteria.map((text, index) => [String(index), text]),
);

// The subset of the /score payload the corruption cases mutate. Deep leaves
// stay `unknown` so a test can put anything there — including something wrong.
interface MutableScorePayload {
  answers: Record<string, Record<string, unknown>>;
  trace: { scored_input: { state: string; questions: Record<string, Record<string, unknown>> } };
}

// The worker echoes every answer — the exact /score shape for the combined
// seven-question run.
// `mutate` corrupts a copy so one payload shape covers every rejection case.
const success = (mutate?: (payload: MutableScorePayload) => void) => ({
  ok: true,
  status: 200,
  json: async () => {
    // The trace echoes the request body, so it is built here — when json() is
    // read, after this run's fetch call exists — then `mutate` corrupts it.
    const payload = {
      answers: {
        buyer_response: {
          choice: 'requested_next_step',
          confidence: 0.4,
          probabilities: buyerProbabilities,
        },
        next_step_commitment: { type: 'noul', noul: 0.7, confidence: 0.7 },
        sample_trial_report: {
          type: 'choice',
          choice: 'testing_planned',
          confidence: 0.55,
          probabilities: uniform(LAYA_ALL_FROZEN_QUESTIONS.sample_trial_report.criteria),
        },
        commercial_info_request: { type: 'noul', noul: 0.62, confidence: 0.62 },
        obstacle_kind: {
          type: 'choice',
          choice: 'price_terms',
          confidence: 0.42,
          probabilities: uniform(LAYA_ALL_FROZEN_QUESTIONS.obstacle_kind.criteria),
        },
        obstacle_strength: {
          type: 'score',
          score: 1.3,
          confidence: 0.5,
          legend: obstacleStrengthLegend,
          probabilities: { '0': 0.1, '1': 0.6, '2': 0.2, '3': 0.1 },
        },
      },
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
    };
    mutate?.(payload);
    return payload;
  },
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

    // The prefill is buildLayaBuyerResponseInput's own state sentence — no
    // deal value: deal size is bucketed in code, never asked of the model.
    const textarea = screen.getByLabelText('State input') as HTMLTextAreaElement;
    expect(textarea.value).toBe(built.state);
    expect(textarea.value).toContain('We supply Butter');
    expect(textarea.value).toContain('Please send us a quotation for 20 kg.');
    expect(textarea.value).not.toContain('Deal value');
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

    // Same bytes the builder's questions ship; laya-buyer-response.contract.test.ts
    // pins those to the worker's frozen questions, so the pane is byte-identical
    // to what the worker accepts (and refuses anything else).
    expect(screen.getByTestId('laya-terminal-questions').textContent).toBe(
      JSON.stringify(LAYA_ALL_FROZEN_QUESTIONS, null, 2)
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

    // The request is exactly { state, questions } with every frozen question.
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(request.body as string);
    expect(Object.keys(body)).toEqual(['state', 'questions']);
    expect(body.state).toBe(built.state);
    expect(JSON.stringify(body.questions)).toBe(JSON.stringify(LAYA_ALL_FROZEN_QUESTIONS));
  });

  it('renders all five buyer-detail rows from the one combined run', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(success()));
    openPanel();
    typeStateAndRun(built.state);

    await screen.findByTestId('laya-terminal-result-buyer_response');
    const rows: Record<string, string> = {};
    for (const id of [
      'next_step_commitment',
      'sample_trial_report',
      'commercial_info_request',
      'obstacle_kind',
      'obstacle_strength',
    ]) {
      rows[id] = screen.getByTestId(`laya-terminal-result-${id}`).textContent ?? '';
    }
    // Noul rows show the raw value and both sides — never a decision.
    expect(rows.next_step_commitment).toContain('noul 0.7000');
    expect(rows.next_step_commitment).toContain('true 70% / false 30%');
    expect(rows.commercial_info_request).toContain('noul 0.6200');
    // Choice rows show the pretty option label from the frozen criteria.
    expect(rows.sample_trial_report).toContain('Testing planned');
    expect(rows.sample_trial_report).toContain('Not established');
    expect(rows.obstacle_kind).toContain('Price / terms');
    expect(rows.obstacle_kind).toContain('No obstacle stated');
    // The score row names the winning rubric level and the scale.
    expect(rows.obstacle_strength).toContain('Minor friction');
    expect(rows.obstacle_strength).toContain('expected score 1.3 on a 0–3 scale');
    expect(rows.obstacle_strength).toContain('Explicit blocker');
  });

  it('never renders a payload with a missing, extra, unknown, or malformed answer', async () => {
    const corruptions: Array<[string, (payload: MutableScorePayload) => void]> = [
      ['missing answer', (p) => { delete p.answers.next_step_commitment; }],
      ['extra answer', (p) => { p.answers.stray_question = { noul: 0.1, confidence: 0.9 }; }],
      ['unknown choice option', (p) => { p.answers.sample_trial_report.choice = 'loved_it'; }],
      ['noul confidence off its value', (p) => { p.answers.next_step_commitment.confidence = 0.9; }],
      ['choice probability key missing',
        (p) => { delete (p.answers.obstacle_kind.probabilities as Record<string, unknown>).timing; }],
      ['score out of step with its legend', (p) => { p.answers.obstacle_strength.score = 3; }],
      ['frozen question removed from the trace', (p) => { delete p.trace.scored_input.questions.obstacle_kind; }],
    ];

    for (const [name, corrupt] of corruptions) {
      cleanup();
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(success(corrupt)));
      openPanel();
      typeStateAndRun(built.state);

      const alert = await screen.findByRole('alert');
      expect(alert.textContent, name).toContain('invalid score');
      expect(screen.queryByTestId('laya-terminal-result-buyer_response'), name).toBeNull();
      expect(screen.queryByTestId('laya-terminal-result-obstacle_kind'), name).toBeNull();
    }
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

