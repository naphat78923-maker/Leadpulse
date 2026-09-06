import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import NudgeLadderRail from './NudgeLadderRail';
import { nudgeLadderIndex, stageFromSilenceDays, SEND_LADDER_RUNGS } from '@/utils/deal-workflow';

afterEach(() => cleanup());

describe('nudge ladder helpers', () => {
  it('maps silence days to Warm → Remind → Firm → Parking', () => {
    expect(stageFromSilenceDays(2)).toBeNull();
    expect(stageFromSilenceDays(3)).toBe('warm');
    expect(stageFromSilenceDays(7)).toBe('remind');
    expect(stageFromSilenceDays(14)).toBe('firm');
    expect(stageFromSilenceDays(21)).toBe('parking');
    expect(stageFromSilenceDays(40)).toBe('parking');
  });

  it('indexes ladder stages', () => {
    expect(nudgeLadderIndex(null)).toBe(-1);
    expect(nudgeLadderIndex('warm')).toBe(0);
    expect(nudgeLadderIndex('parking')).toBe(3);
  });
});

describe('NudgeLadderRail', () => {
  it('renders nothing without a stage', () => {
    const { container } = render(<NudgeLadderRail stage={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders full rail with rung labels', () => {
    render(<NudgeLadderRail stage="remind" variant="full" />);
    expect(screen.getByRole('img', { name: /Remind 7d/i })).toBeTruthy();
    expect(screen.getByText('Warm 3d')).toBeTruthy();
    expect(screen.getByText('Remind 7d')).toBeTruthy();
    expect(screen.getByText('Firm 14d')).toBeTruthy();
    expect(screen.getByText('Parking 21d')).toBeTruthy();
    expect(document.querySelector('[data-nudge-ladder="full"]')).toBeTruthy();
  });

  it('renders send-count rungs when overridden', () => {
    render(<NudgeLadderRail stage="remind" rungs={SEND_LADDER_RUNGS} variant="full" />);
    expect(screen.getByRole('img', { name: /2nd send/i })).toBeTruthy();
    expect(screen.getByText('1st send')).toBeTruthy();
    expect(screen.getByText('2nd send')).toBeTruthy();
    expect(screen.getByText('3rd send')).toBeTruthy();
    expect(screen.getByText('4th send → Park')).toBeTruthy();
  });

  it('renders compact mini segments', () => {
    render(<NudgeLadderRail stage="firm" variant="mini" />);
    expect(screen.getByRole('img', { name: /Firm/i })).toBeTruthy();
    expect(document.querySelector('[data-nudge-ladder="mini"]')).toBeTruthy();
  });
});
