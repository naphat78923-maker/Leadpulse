import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { LayaStatus } from '@/utils/laya-status';
import LayaStatusLine from './LayaStatusLine';

const NOW = Date.parse('2026-10-02T12:00:00Z');
const status = (over: Partial<LayaStatus>): LayaStatus => ({
  withReply: 0, graded: 0, needsReview: 0, thai: 0, waiting: 0, oldestWaitingMinutes: null, lastJudgedAt: null, health: 'idle', ...over,
});

describe('LayaStatusLine', () => {
  afterEach(cleanup);

  it('renders nothing while loading', () => {
    const { container } = render(<LayaStatusLine status={null} load="loading" now={NOW} missingReplyWords={0} />);
    expect(container.textContent).toBe('');
  });

  it('says so when judgments cannot be read', () => {
    render(<LayaStatusLine status={null} load="error" now={NOW} missingReplyWords={0} />);
    expect(screen.getByTestId('laya-status').textContent).toMatch(/could not read saved judgments/);
  });

  it('points at logged replies without exact words when nothing is pasted yet', () => {
    render(<LayaStatusLine status={status({})} load="ready" now={NOW} missingReplyWords={3} />);
    expect(screen.getByTestId('laya-status').textContent).toMatch(/no pasted replies to grade yet/);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/deals?missing=reply-words');
    expect(link.textContent).toMatch(/3 logged replies have no exact words pasted/);
  });

  it('summarises the counts and the age of the last judgment', () => {
    render(<LayaStatusLine
      status={status({ withReply: 4, graded: 2, needsReview: 1, thai: 1, waiting: 1, oldestWaitingMinutes: 3, lastJudgedAt: '2026-10-02T11:40:00Z', health: 'waiting' })}
      load="ready" now={NOW} missingReplyWords={0} />);
    const line = screen.getByTestId('laya-status');
    expect(line.textContent).toMatch(/2 graded · 1 for your review \(1 Thai\) · 1 waiting for the worker · last judgment 20 min ago/);
    expect(line.getAttribute('data-health')).toBe('waiting');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('warns when a reply has waited too long', () => {
    render(<LayaStatusLine status={status({ withReply: 1, waiting: 1, oldestWaitingMinutes: 40, health: 'stalled' })} load="ready" now={NOW} missingReplyWords={0} />);
    expect(screen.getByRole('status').textContent).toMatch(/1 reply has waited over 15 minutes.*probably stopped/);
  });
});
