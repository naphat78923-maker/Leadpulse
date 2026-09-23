import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Company, Deal } from '@/types/crm';
import LayaScoreCard from './LayaScoreCard';

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
  nudge_count: 0,
  workflow_action: null,
  nudge_stage: null,
  sample_status: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
};

const success = (recommendation = 'priority') => ({
  ok: true,
  json: async () => ({ recommendation, confidence: 0.4,
    probabilities: { priority: 0.4, nurture: 0.2, research: 0.2, deprioritize: 0.2 },
    usage: { input_tokens: 93, output_tokens: 0 },
    trace: {
      scored_input: JSON.parse(String(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.body)),
      model: { repository: 'aac6fef/laya-multilingual-coreml-ane', source_revision: '052592a', package_sha256: '53ba84d9', engine: 'cpu_ne' },
      scored_at: '2026-09-23T04:05:06+00:00',
    },
  }),
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('LayaScoreCard', () => {
  it('does not contact the worker on render and keeps setup help hidden until a failure', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<LayaScoreCard deal={deal} />);
    expect(screen.queryByText(/same Mac as this browser/i)).toBeNull();
    expect(screen.queryByText(/npm run laya:serve/)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reveals Mac-local setup help after a failed score and hides it again after a success', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(success());
    vi.stubGlobal('fetch', fetchMock);
    render(<LayaScoreCard deal={deal} />);
    fireEvent.click(screen.getByRole('button', { name: 'Score with Laya' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/local.network permissions/i);
    expect(screen.getByText(/same Mac as this browser/i)).toBeTruthy();
    expect(screen.getByText(/npm run laya:serve/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Score with Laya' }));
    await screen.findByText('Prioritise');
    expect(screen.queryByText(/npm run laya:serve/)).toBeNull();
  });

  it('shows a verified scoring trace from the longer local CPU/GPU model', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      const response = success();
      const payload = await response.json();
      payload.trace.model.engine = 'cpu_gpu';
      payload.trace.model.repository = 'aac6fef/laya-multilingual-coreml';
      return { ok: true, json: async () => payload };
    }));
    render(<LayaScoreCard deal={deal} />);
    fireEvent.click(screen.getByRole('button', { name: 'Score with Laya' }));
    expect(await screen.findByText('Prioritise')).toBeTruthy();
  });

  it('times out scoring, releases retry, and ignores its late success', async () => {
    vi.useFakeTimers();
    const old = deferred<ReturnType<typeof success>>();
    const fetchMock = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(success('research'));
    vi.stubGlobal('fetch', fetchMock);
    render(<LayaScoreCard deal={deal} />);
    fireEvent.click(screen.getByRole('button', { name: 'Score with Laya' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(screen.getByRole('alert').textContent).toMatch(/timed out/i);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect((screen.getByRole('button', { name: 'Score with Laya' }) as HTMLButtonElement).disabled).toBe(false);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Score with Laya' })); });
    expect(screen.getByText('Research')).toBeTruthy();
    await act(async () => { old.resolve(success()); });
    expect(screen.queryByText('Prioritise')).toBeNull();
    expect(screen.getByText('Research')).toBeTruthy();
  });

  it('times out stalled score JSON without retaining a prior recommendation', async () => {
    vi.useFakeTimers();
    const body = deferred<unknown>();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(success()).mockResolvedValueOnce({ ok: true, json: () => body.promise }));
    render(<LayaScoreCard deal={deal} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Score with Laya' })); });
    expect(screen.getByText('Prioritise')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Re-score with Laya' })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(screen.getByRole('alert').textContent).toMatch(/timed out/i);
    expect(screen.queryByText('Prioritise')).toBeNull();
    await act(async () => { body.resolve(await success().json()); });
    expect(screen.queryByText('Prioritise')).toBeNull();
    expect((screen.getByRole('button', { name: 'Re-score with Laya' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('explains blocked connections without claiming the worker is stopped', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    render(<LayaScoreCard deal={deal} />);
    fireEvent.click(screen.getByRole('button', { name: 'Score with Laya' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/local.network permissions/i);
    expect(screen.getByRole('alert').textContent).not.toMatch(/is not running|is stopped/i);
    expect(screen.queryByText('Prioritise')).toBeNull();
  });

  it('discards a response crossing Bangkok midnight even before a clock refresh', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T16:59:59Z'));
    const pending = deferred<ReturnType<typeof success>>();
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending.promise));
    render(<LayaScoreCard deal={{ ...deal, followup_date: '2026-09-21' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Score with Laya' }));
    vi.setSystemTime(new Date('2026-09-21T17:00:01Z'));
    await act(async () => { pending.resolve(success()); });
    expect(screen.queryByText('Prioritise')).toBeNull();
    expect(screen.getByRole('button', { name: 'Score with Laya' })).toBeTruthy();
  });

  it('rechecks Bangkok day before sending: first rollover click resets, second sends updated input', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T16:59:59Z'));
    const fetchMock = vi.fn().mockResolvedValue(success());
    vi.stubGlobal('fetch', fetchMock);
    render(<LayaScoreCard deal={{ ...deal, followup_date: '2026-09-22' }} />);
    vi.setSystemTime(new Date('2026-09-22T17:00:01Z'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Score with Laya' })); });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText('Prioritise')).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Score with Laya' })); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).state).toContain('Follow-up: overdue.');
    expect(screen.getByText('Prioritise')).toBeTruthy();
  });

  it('invalidates a completed recommendation when the tab refocuses on a new Bangkok day', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T16:59:59Z'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(success()));
    render(<LayaScoreCard deal={{ ...deal, followup_date: '2026-09-21' }} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Score with Laya' })); });
    expect(screen.getByText('Prioritise')).toBeTruthy();
    vi.setSystemTime(new Date('2026-09-21T17:00:01Z'));
    fireEvent(window, new Event('focus'));
    expect(screen.queryByText('Prioritise')).toBeNull();
  });
  it('identifies the feature as Choice advice, not a readiness Score or purchase probability', async () => {
    const fetchMock = vi.fn().mockResolvedValue(success());
    vi.stubGlobal('fetch', fetchMock);
    render(<LayaScoreCard deal={deal} />);
    expect(screen.getByText('LAYA ATTENTION RECOMMENDATION')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Score with Laya' }));
    await screen.findByText('Prioritise');
    expect(screen.getByText(/not purchase probabilities/i)).toBeTruthy();
    const input = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(Object.keys(input.questions)).toEqual(['attention']);
    expect(input.questions.attention.type).toBe('choice');
  });

  it('reveals the exact worker-scored input, omissions, model identity and UTC timestamp', async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => ({
      ok: true,
      json: async () => ({
        ...(await success().json()),
        trace: {
          scored_input: JSON.parse(init.body as string),
          model: { repository: 'aac6fef/laya-multilingual-coreml-ane', source_revision: '052592a', package_sha256: '53ba84d9', engine: 'cpu_ne' },
          scored_at: '2026-09-23T04:05:06+00:00',
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    render(<LayaScoreCard deal={deal} />);
    fireEvent.click(screen.getByRole('button', { name: 'Score with Laya' }));
    await screen.findByText('Prioritise');
    fireEvent.click(screen.getByText('Scoring trace'));
    expect(screen.getByText(/Industry: unknown[\s\S]*Outcome: Asked for a sample price/)).toBeTruthy();
    expect(screen.getByText(/names, IDs, contacts, addresses, URLs, company notes/i)).toBeTruthy();
    expect(screen.getByText(/free-text outcomes and tags can still contain personal information/i)).toBeTruthy();
    expect(screen.getByText(/aac6fef\/laya-multilingual-coreml-ane/)).toBeTruthy();
    expect(screen.getByText(/052592a/)).toBeTruthy();
    expect(screen.getByText(/2026-09-23T04:05:06\+00:00/)).toBeTruthy();
    expect(screen.getByText(/Best sales attention\?/)).toBeTruthy();
  });

  it('rejects a score whose worker-reported input differs from the request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      ...(await success().json()),
      trace: { scored_input: { state: 'different', questions: {} }, model: { repository: 'laya', source_revision: 'rev', package_sha256: 'hash', engine: 'cpu_ne' }, scored_at: '2026-09-23T04:05:06+00:00' },
    }) }));
    render(<LayaScoreCard deal={deal} />);
    fireEvent.click(screen.getByRole('button', { name: 'Score with Laya' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/input did not match/i);
    expect(screen.queryByText('Prioritise')).toBeNull();
  });

  it('does not show an untraceable score from an older worker', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      recommendation: 'priority', confidence: 0.4,
      probabilities: { priority: 0.4, nurture: 0.2, research: 0.2, deprioritize: 0.2 },
    }) }));
    render(<LayaScoreCard deal={deal} />);
    fireEvent.click(screen.getByRole('button', { name: 'Score with Laya' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/incomplete score/i);
    expect(screen.queryByText('Prioritise')).toBeNull();
  });

  it.each(['constructor', 'toString', '__proto__'])('rejects inherited recommendation key %s', async recommendation => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(success(recommendation)));
    render(<LayaScoreCard deal={deal} />);
    fireEvent.click(screen.getByRole('button', { name: 'Score with Laya' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/incomplete score/i);
    expect(screen.queryByText(/NaN%/)).toBeNull();
    expect(screen.queryByText('Prioritise')).toBeNull();
  });

  it.each([NaN, Infinity, -0.1, 1.1])('rejects invalid option probability %s', async probability => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      ...(await success().json()),
      probabilities: { priority: probability, nurture: 0.2, research: 0.2, deprioritize: 0.2 },
    }) }));
    render(<LayaScoreCard deal={deal} />);
    fireEvent.click(screen.getByRole('button', { name: 'Score with Laya' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/incomplete score/i);
    expect(screen.queryByText('Prioritise')).toBeNull();
  });

  it.each([
    ['outcome', { last_outcome: 'Declined; do not contact' }],
    ['stage', { stage: 'closed_lost' as const }],
    ['value', { value: 45000 }],
    ['product', { product: 'Condensed milk' }],
    ['follow-up', { followup_date: '2099-01-01' }],
  ])('invalidates the same deal when its %s input changes', async (_name, change) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(success()));
    const { rerender } = render(<LayaScoreCard deal={deal} />);
    fireEvent.click(screen.getByRole('button', { name: 'Score with Laya' }));
    await screen.findByText('Prioritise');
    rerender(<LayaScoreCard deal={{ ...deal, ...change }} />);
    expect(screen.queryByText('Prioritise')).toBeNull();
    expect(screen.getByRole('button', { name: 'Score with Laya' })).toBeTruthy();
  });

  it('invalidates company evidence but preserves results across identical-object refreshes', async () => {
    const company = { id: 'company-1', industry: 'Bakery', tags: ['bakery'] } as Company;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(success()));
    const { rerender } = render(<LayaScoreCard deal={deal} company={company} />);
    fireEvent.click(screen.getByRole('button', { name: 'Score with Laya' }));
    await screen.findByText('Prioritise');
    rerender(<LayaScoreCard deal={{ ...deal }} company={{ ...company, tags: [...company.tags!] }} />);
    expect(screen.getByText('Prioritise')).toBeTruthy();
    rerender(<LayaScoreCard deal={deal} company={{ ...company, tags: ['bakery', 'not a buyer'] }} />);
    expect(screen.queryByText('Prioritise')).toBeNull();
  });

  it('invalidates a score when only the linked company identity changes', async () => {
    const first = { id: 'company-a', industry: 'Bakery', tags: ['bakery'] } as Company;
    const second = { ...first, id: 'company-b' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(success()));
    const { rerender } = render(<LayaScoreCard deal={{ ...deal, company_id: first.id }} company={first} />);
    fireEvent.click(screen.getByRole('button', { name: 'Score with Laya' }));
    await screen.findByText('Prioritise');
    rerender(<LayaScoreCard deal={{ ...deal, company_id: second.id }} company={second} />);
    expect(screen.queryByText('Prioritise')).toBeNull();
    expect(screen.getByRole('button', { name: 'Score with Laya' })).toBeTruthy();
  });

  it('aborts an in-flight score when company ID changes without changing evidence text', async () => {
    const old = deferred<ReturnType<typeof success>>();
    const fetchMock = vi.fn().mockReturnValue(old.promise);
    vi.stubGlobal('fetch', fetchMock);
    const { rerender } = render(<LayaScoreCard deal={{ ...deal, company_id: 'company-a' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Score with Laya' }));
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    rerender(<LayaScoreCard deal={{ ...deal, company_id: 'company-b' }} />);
    expect(signal.aborted).toBe(true);
    await act(async () => { old.resolve(success()); });
    expect(screen.queryByText('Prioritise')).toBeNull();
    expect(screen.getByRole('button', { name: 'Score with Laya' })).toBeTruthy();
  });

  it('does not resurrect a discarded response after switching A to B to A', async () => {
    const old = deferred<ReturnType<typeof success>>();
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(old.promise));
    const { rerender } = render(<LayaScoreCard deal={deal} />);
    fireEvent.click(screen.getByRole('button', { name: 'Score with Laya' }));
    rerender(<LayaScoreCard deal={{ ...deal, id: 'deal-2' }} />);
    rerender(<LayaScoreCard deal={deal} />);
    await act(async () => { old.resolve(success()); });
    expect(screen.queryByText('Prioritise')).toBeNull();
    expect(screen.getByRole('button', { name: 'Score with Laya' })).toBeTruthy();
  });

  it('ignores obsolete errors without ending the new request loading state', async () => {
    const old = deferred<ReturnType<typeof success>>();
    const fresh = deferred<ReturnType<typeof success>>();
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise));
    const { rerender } = render(<LayaScoreCard deal={deal} />);
    fireEvent.click(screen.getByRole('button', { name: 'Score with Laya' }));
    rerender(<LayaScoreCard deal={{ ...deal, last_outcome: 'Declined' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Score with Laya' }));
    await act(async () => { old.reject(new Error('Old failure')); });
    expect(screen.queryByRole('alert')).toBeNull();
    expect((screen.getByRole('button', { name: 'Scoring locally…' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { fresh.resolve(success('deprioritize')); });
    expect(screen.getByText('Deprioritise')).toBeTruthy();
  });

  it('ignores an obsolete response whose JSON body completes after the input changes', async () => {
    const json = deferred<Awaited<ReturnType<ReturnType<typeof success>['json']>>>();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => json.promise });
    vi.stubGlobal('fetch', fetchMock);
    const { rerender } = render(<LayaScoreCard deal={deal} />);
    fireEvent.click(screen.getByRole('button', { name: 'Score with Laya' }));
    await act(async () => {});
    rerender(<LayaScoreCard deal={{ ...deal, value: 1 }} />);
    await act(async () => { json.resolve(await success().json()); });
    expect(screen.queryByText('Prioritise')).toBeNull();
  });

  it('aborts on unmount and can retry after a failed re-score without showing the old result', async () => {
    const pending = deferred<ReturnType<typeof success>>();
    const fetchMock = vi.fn().mockResolvedValueOnce(success()).mockRejectedValueOnce(new Error('Worker unavailable')).mockReturnValueOnce(pending.promise);
    vi.stubGlobal('fetch', fetchMock);
    const { unmount } = render(<LayaScoreCard deal={deal} />);
    fireEvent.click(screen.getByRole('button', { name: 'Score with Laya' }));
    await screen.findByText('Prioritise');
    fireEvent.click(screen.getByRole('button', { name: 'Re-score with Laya' }));
    await screen.findByRole('alert');
    expect(screen.queryByText('Prioritise')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Re-score with Laya' }));
    const signal = fetchMock.mock.calls[2][1].signal as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => { pending.resolve(success()); });
  });
  it('keeps a re-score action and clears the old result while refreshing', async () => {
    const refreshed = deferred<ReturnType<typeof success>>();
    const fetchMock = vi.fn().mockResolvedValueOnce(success()).mockReturnValueOnce(refreshed.promise);
    vi.stubGlobal('fetch', fetchMock);
    render(<LayaScoreCard deal={deal} />);
    fireEvent.click(screen.getByRole('button', { name: 'Score with Laya' }));
    await screen.findByText('Prioritise');
    fireEvent.click(screen.getByRole('button', { name: 'Re-score with Laya' }));
    expect(screen.queryByText('Prioritise')).toBeNull();
    expect((screen.getByRole('button', { name: 'Scoring locally…' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { refreshed.resolve(success('nurture')); });
    expect(screen.getByText('Nurture')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Re-score with Laya' })).toBeTruthy();
    expect(fetchMock.mock.calls[0][1].body).toBe(fetchMock.mock.calls[1][1].body);
  });
  it('aborts obsolete requests and ignores late responses even when fetch ignores abort', async () => {
    const old = deferred<ReturnType<typeof success>>();
    const fetchMock = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(success('research'));
    vi.stubGlobal('fetch', fetchMock);
    const { rerender } = render(<LayaScoreCard deal={deal} />);
    fireEvent.click(screen.getByRole('button', { name: 'Score with Laya' }));
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    rerender(<LayaScoreCard deal={{ ...deal, id: 'deal-2' }} />);
    expect(signal?.aborted).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Score with Laya' }));
    await screen.findByText('Research');
    await act(async () => { old.resolve(success()); });
    expect(screen.queryByText('Prioritise')).toBeNull();
    expect(screen.getByText('Research')).toBeTruthy();
  });
  it('invalidates a result when switching deals even with identical input text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(success()));
    const { rerender } = render(<LayaScoreCard deal={deal} />);
    fireEvent.click(screen.getByRole('button', { name: 'Score with Laya' }));
    await screen.findByText('Prioritise');
    rerender(<LayaScoreCard deal={{ ...deal, id: 'deal-2' }} />);
    expect(screen.queryByText('Prioritise')).toBeNull();
    expect(screen.getByRole('button', { name: 'Score with Laya' })).toBeTruthy();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows an opt-out refusal without displaying a recommendation and sends the complete outcome', async () => {
    const message = 'Not scored: possible no-contact request in the deal evidence. Review manually; do not initiate outreach from this recommendation.';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ status: 'not_scored', code: 'contact_opt_out', error: message }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const outcome = 'Buyer asked for a sample price but later declined and requested no contact';
    render(<LayaScoreCard deal={{ ...deal, last_outcome: outcome }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Score with Laya' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(message));
    expect(screen.queryByText('Prioritise')).toBeNull();
    expect(screen.queryByText('Nurture')).toBeNull();
    expect(screen.getByRole('button', { name: 'Score with Laya' })).toBeTruthy();
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(request.body as string).state).toContain(outcome);
  });

  it('shows a local Laya recommendation and sends only the declared scoring fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...(await success().json()),
        recommendation: 'priority', confidence: 0.4376,
        probabilities: { priority: 0.4376, nurture: 0.0548, research: 0.2244, deprioritize: 0.2831 },
        usage: { input_tokens: 93, output_tokens: 0 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<LayaScoreCard deal={deal} company={{ id: 'company-1', name: 'Private bakery name', industry: 'Bakery', size: 'B', tags: ['bakery', 'plant-based'], created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' } as Company} />);

    fireEvent.click(screen.getByRole('button', { name: 'Score with Laya' }));

    await waitFor(() => expect(screen.getByText('Prioritise')).toBeTruthy());
    expect(screen.getByText(/93 input tokens/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:8765/score');

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const input = JSON.parse(request.body as string) as { state: string };
    expect(input.state).toContain('Industry: Bakery.');
    expect(input.state).not.toContain('Private bakery name');
  });
});
