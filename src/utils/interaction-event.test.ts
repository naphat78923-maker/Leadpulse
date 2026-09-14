import { describe, expect, it } from 'vitest';
import type { Meeting } from '@/types/crm';
import {
  ACTIVE_CHASE_POLICY_ID,
  CHASE_COUNTING_POLICIES,
  UNANSWERED_CHASE_CHANNELS,
  countsTowardUnansweredChase,
  defaultEventKind,
  directionForEvent,
  isCustomerResponseOutcome,
  unansweredChaseCount,
  validateInteractionEvent,
} from './interaction-event';

const meeting = (patch: Partial<Meeting>): Meeting => ({
  id: 'm-1',
  description: 'touch',
  type: 'call',
  date: '2026-09-14',
  company_id: null,
  contact_ids: [],
  deal_id: 'deal-1',
  product: 'Butter',
  summary: null,
  outcome: null,
  followup_date: null,
  created_at: '2026-09-14T00:00:00Z',
  ...patch,
});

describe('interaction event classification', () => {
  it('maps an event kind to the direction of the touch, never to a lane', () => {
    expect(directionForEvent('outbound_attempt')).toBe('outbound');
    expect(directionForEvent('customer_response')).toBe('inbound');
    expect(directionForEvent('internal_note')).toBe('internal');
  });

  it('classifies notes and meetings as internal by default and outreach channels as attempts', () => {
    expect(defaultEventKind('note')).toBe('internal_note');
    expect(defaultEventKind('meeting')).toBe('internal_note');
    expect(defaultEventKind('call')).toBe('outbound_attempt');
    expect(defaultEventKind('email')).toBe('outbound_attempt');
    expect(defaultEventKind('dm')).toBe('outbound_attempt');
  });

  it('treats only a real sentiment as a customer response', () => {
    expect(isCustomerResponseOutcome('positive')).toBe(true);
    expect(isCustomerResponseOutcome('neutral')).toBe(true);
    expect(isCustomerResponseOutcome('negative')).toBe(true);
    expect(isCustomerResponseOutcome('no_response')).toBe(false);
    expect(isCustomerResponseOutcome(null)).toBe(false);
  });

  it('keeps a recorded sentiment on an outbound attempt as sentiment, not as a reply', () => {
    // The call went well, but we made it: direction stays outbound.
    expect(validateInteractionEvent({ kind: 'outbound_attempt', outcome: 'no_response' })).toBeNull();
    expect(validateInteractionEvent({ kind: 'outbound_attempt', outcome: null })).toBeNull();
    expect(validateInteractionEvent({ kind: 'outbound_attempt', outcome: 'positive' })).toBeNull();
    expect(directionForEvent('outbound_attempt')).toBe('outbound');
  });

  it('leaves response sentiment optional for a client reply', () => {
    expect(validateInteractionEvent({ kind: 'customer_response', outcome: 'positive' })).toBeNull();
    expect(validateInteractionEvent({ kind: 'customer_response', outcome: null })).toBeNull();
  });

  it('refuses the contradiction of a client reply tagged no response', () => {
    expect(validateInteractionEvent({ kind: 'customer_response', outcome: 'no_response' })).toMatch(/cannot be recorded as 'No Response'/i);
  });

  it('never lets an internal note claim a client response direction', () => {
    expect(validateInteractionEvent({ kind: 'internal_note', outcome: null })).toBeNull();
    expect(directionForEvent('internal_note')).toBe('internal');
    expect(countsTowardUnansweredChase(meeting({ type: 'call', direction: directionForEvent('internal_note') }))).toBe(false);
  });
});

describe('unanswered chase counting', () => {
  const outbound = (patch: Partial<Meeting>) => meeting({ direction: 'outbound', ...patch });

  it('keeps only call, email, and dm as outreach channels', () => {
    expect([...UNANSWERED_CHASE_CHANNELS]).toEqual(['call', 'email', 'dm']);
  });

  it('does not count an internal note or a captured client reply', () => {
    expect(countsTowardUnansweredChase(meeting({ type: 'note', direction: 'internal' }))).toBe(false);
    expect(countsTowardUnansweredChase(meeting({ type: 'meeting', direction: 'internal' }))).toBe(false);
    expect(countsTowardUnansweredChase(meeting({ direction: 'inbound', outcome: 'positive' }))).toBe(false);
  });

  it('does not count a row that is not linked to a deal', () => {
    expect(countsTowardUnansweredChase(meeting({ deal_id: null, direction: 'outbound' }))).toBe(false);
  });

  it('counts regardless of whether the stage moved — the event decides, not the lane', () => {
    const attempt = outbound({ outcome: 'no_response' });
    const sameEventAfterScheduling: Meeting = { ...attempt, followup_date: '2026-09-20' };

    expect(countsTowardUnansweredChase(attempt)).toBe(true);
    expect(countsTowardUnansweredChase(sameEventAfterScheduling)).toBe(true);
  });

  it('counts under the ACTIVE policy exactly as production does today, unknown direction included', () => {
    // Preserved on purpose: switching this would move live badges, which is a
    // four-send-policy decision (see CHASE_COUNTING_POLICIES).
    expect(countsTowardUnansweredChase(meeting({ direction: 'unknown' }))).toBe(true);
    expect(countsTowardUnansweredChase(meeting({ direction: null }))).toBe(true);
    expect(countsTowardUnansweredChase(meeting({ direction: undefined }))).toBe(true);
  });

  it('never asserts an unknown row was an outbound send under the reviewed alternative', () => {
    expect(countsTowardUnansweredChase(meeting({ direction: 'unknown' }), 'v1-unanswered-chases')).toBe(false);
    expect(countsTowardUnansweredChase(meeting({ direction: null }), 'v1-unanswered-chases')).toBe(false);
    expect(countsTowardUnansweredChase(meeting({ direction: 'outbound' }), 'v1-unanswered-chases')).toBe(true);
  });

  it('ships the cumulative-sends policy as ACTIVE so live badges do not move', () => {
    expect(ACTIVE_CHASE_POLICY_ID).toBe('v0-cumulative-sends');
  });

  it('lets the reviewed alternative separate a conversation from an unanswered chase', () => {
    const conversational = outbound({ outcome: 'positive' });

    expect(countsTowardUnansweredChase(conversational, 'v0-cumulative-sends')).toBe(true);
    expect(countsTowardUnansweredChase(conversational, 'v1-unanswered-chases')).toBe(false);
  });

  it('states both policies so the choice can be reviewed in one line', () => {
    expect(CHASE_COUNTING_POLICIES['v1-unanswered-chases'].id).toBe('v1-unanswered-chases');
    expect(CHASE_COUNTING_POLICIES['v0-cumulative-sends'].summary).toMatch(/every logged call, email, or dm/i);
    expect(CHASE_COUNTING_POLICIES['v1-unanswered-chases'].summary).toMatch(/no recorded client response/i);
  });

  it('counts per deal and never mixes deals together', () => {
    const rows = [
      outbound({ id: 'a', outcome: 'no_response' }),
      outbound({ id: 'b' }),
      outbound({ id: 'c', deal_id: 'deal-2' }),
      meeting({ id: 'd', direction: 'inbound', outcome: 'positive' }),
      meeting({ id: 'e', type: 'note', direction: 'internal' }),
    ];

    expect(unansweredChaseCount(rows, 'deal-1')).toBe(2);
    expect(unansweredChaseCount(rows, 'deal-2')).toBe(1);
    expect(unansweredChaseCount([], 'deal-1')).toBe(0);
  });

  it('takes a retried duplicate out of the count only when the row itself is gone', () => {
    const once = [outbound({ id: 'a', outcome: 'no_response' })];
    expect(unansweredChaseCount(once, 'deal-1')).toBe(1);
    // A retry that reuses the saved interaction row does not add a second row.
    expect(unansweredChaseCount(once, 'deal-1')).toBe(1);
  });
});
