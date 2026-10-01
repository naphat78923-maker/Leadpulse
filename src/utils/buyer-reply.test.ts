import { describe, expect, it } from 'vitest';
import { buyerReplyUpdate } from './buyer-reply';

describe('buyerReplyUpdate', () => {
  it('writes pasted words, trimmed only at the ends', () => {
    expect(buyerReplyUpdate(null, '  Please quote 20 kg.\nThanks  ')).toEqual({ buyer_reply: 'Please quote 20 kg.\nThanks' });
  });

  it('replaces an older saved reply with the new words', () => {
    expect(buyerReplyUpdate('Old reply', 'We chose another supplier.')).toEqual({ buyer_reply: 'We chose another supplier.' });
  });

  it('writes nothing when the words are unchanged', () => {
    expect(buyerReplyUpdate('Please quote 20 kg.', ' Please quote 20 kg. ')).toEqual({});
  });

  it('clears an out-of-date saved reply when a new reply is logged without words', () => {
    expect(buyerReplyUpdate('Please quote 20 kg.', '')).toEqual({ buyer_reply: null });
    expect(buyerReplyUpdate('Please quote 20 kg.', '   ')).toEqual({ buyer_reply: null });
    expect(buyerReplyUpdate('Please quote 20 kg.', null)).toEqual({ buyer_reply: null });
  });

  it('writes nothing when there is neither a saved reply nor new words', () => {
    expect(buyerReplyUpdate(null, '')).toEqual({});
    expect(buyerReplyUpdate(undefined, undefined)).toEqual({});
  });
});
