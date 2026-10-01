'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Deal, Meeting } from '@/types/crm';
import * as crm from '@/lib/crm';
import type { LayaJudgmentRow } from '@/lib/crm';
import type { DealGrade } from '@/utils/grade';
import { dealInputSha256 } from '@/utils/laya-freshness';
import { buildLayaReviewList, gradeDealsWithReplies, type LayaReviewItem } from '@/utils/laya-review';

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; judgments: LayaJudgmentRow[]; currentShas: Map<string, string | null> };

/** Saved judgments plus the current input hash of every reply, re-read when replies change. */
function useLayaJudgmentState(deals: Deal[]): State {
  const [state, setState] = useState<State>({ status: 'loading' });
  const replies = useMemo(() => deals.filter(d => d.buyer_reply?.trim()), [deals]);
  const key = useMemo(() => JSON.stringify(replies.map(d => [d.id, d.buyer_reply, d.product])), [replies]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // Nothing to judge: skip the network read entirely.
      if (replies.length === 0) return { judgments: [], currentShas: new Map<string, string | null>() };
      const [judgments, shas] = await Promise.all([
        crm.getLatestDealJudgments(),
        Promise.all(replies.map(async d => [d.id, await dealInputSha256(d)] as const)),
      ]);
      return { judgments, currentShas: new Map(shas) };
    };
    load()
      .then(result => { if (!cancelled) setState({ status: 'ready', ...result }); })
      .catch(() => { if (!cancelled) setState({ status: 'error' }); });
    return () => { cancelled = true; };
    // `key` covers the reply fields the hashes are built from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

/** Laya's grade for every deal with a verbatim reply (absent = no reply to grade). */
export function useLayaGrades(deals: Deal[], meetings: Meeting[]): { grades: Map<string, DealGrade>; status: State['status'] } {
  const state = useLayaJudgmentState(deals);
  const grades = useMemo(
    () => (state.status === 'ready'
      ? gradeDealsWithReplies({ deals, meetings, judgments: state.judgments, currentShas: state.currentShas })
      : new Map<string, DealGrade>()),
    [state, deals, meetings],
  );
  return { grades, status: state.status };
}

/** Open deals Laya routed to Pat. */
export function useLayaReviewList(deals: Deal[], meetings: Meeting[]): { items: LayaReviewItem[]; status: State['status'] } {
  const state = useLayaJudgmentState(deals);
  const items = useMemo(
    () => (state.status === 'ready'
      ? buildLayaReviewList({ deals, meetings, judgments: state.judgments, currentShas: state.currentShas })
      : []),
    [state, deals, meetings],
  );
  return { items, status: state.status };
}
