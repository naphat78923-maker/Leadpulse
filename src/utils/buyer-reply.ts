// ─── deals.buyer_reply: what a newly logged client reply writes ───
// buyer_reply is the buyer's LATEST reply, verbatim — the only text Laya's buyer
// questions judge. Two rules, shared by every surface that records a reply:
//
//   1. Pasted words replace the saved reply (trimmed at the ends, otherwise untouched).
//   2. A new reply logged WITHOUT words clears the saved one. The old text is no
//      longer the latest reply, and Laya must never judge an out-of-date message
//      as if it were current. Callers keep the old value in their undo snapshot.
//
// Returns only the change to write, so an unchanged reply adds nothing to the patch.

import type { Deal } from '@/types/crm';

export function buyerReplyUpdate(
  current: string | null | undefined,
  words: string | null | undefined
): Pick<Deal, 'buyer_reply'> | Record<string, never> {
  const text = words?.trim();
  if (text) return text === current ? {} : { buyer_reply: text };
  return current ? { buyer_reply: null } : {};
}
