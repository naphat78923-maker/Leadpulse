import { describe, expect, it } from 'vitest';
import { actionChannel } from './action-channel';

describe('actionChannel', () => {
  it('reads the channel from the wording', () => {
    expect(actionChannel('Call chef about croissant test')).toBe('call');
    expect(actionChannel('Send price list by email')).toBe('email');
    expect(actionChannel('LINE to confirm sample arrived')).toBe('message');
    expect(actionChannel('Visit the kitchen for a tasting')).toBe('meeting');
  });

  it('reads Thai wording', () => {
    expect(actionChannel('โทรหาเชฟ')).toBe('call');
    expect(actionChannel('ส่งไลน์ถามผล')).toBe('message');
  });

  it('takes the first channel mentioned', () => {
    expect(actionChannel('Call, then email the quote')).toBe('call');
  });

  it('does not match inside other words', () => {
    expect(actionChannel('Recall the pricing and outline next steps')).toBeNull();
    expect(actionChannel('Check the deadline')).toBeNull();
  });

  it('returns null when unclear or empty', () => {
    expect(actionChannel('Follow up on the sample')).toBeNull();
    expect(actionChannel(null)).toBeNull();
    expect(actionChannel('')).toBeNull();
  });
});
