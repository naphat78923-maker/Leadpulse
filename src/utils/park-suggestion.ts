// ─── "Park this deal?" ───
// Pure. The nudge ladder stops at NUDGE_SEND_LIMIT sends. A deal that reaches it with no
// answer is offered for parking in the Needs attention menu and the morning digest. A
// suggestion only: nothing here parks a deal.
//
// "No answer" counts the sends since the buyer last replied (chaseStatusSinceReply), so a
// deal that came back to life is not offered over its earlier silence. The card's 4/4
// badge keeps its lifetime count.

import type { Deal } from '@/types/crm';
import { isOnJourneyBoard, NUDGE_SEND_LIMIT } from './deal-workflow';
import { chaseStatusSinceReply, type DatedChaseCountableMeeting } from './interaction-event';

export interface ParkSuggestion {
  deal: Deal;
  /** sends since the buyer's last reply, or since the first send when they never replied */
  sends: number;
  buyerReplied: boolean;
}

export function buildParkSuggestions(input: {
  deals: readonly Deal[];
  meetings: readonly DatedChaseCountableMeeting[];
}): ParkSuggestion[] {
  const meetings = [...input.meetings];
  return input.deals
    .filter(isOnJourneyBoard)
    .map(deal => {
      const { chases, buyerReplied } = chaseStatusSinceReply(meetings, deal.id);
      return { deal, sends: chases, buyerReplied };
    })
    .filter(item => item.sends >= NUDGE_SEND_LIMIT)
    .sort((a, b) => b.sends - a.sends || a.deal.client.localeCompare(b.deal.client));
}

/** e.g. "4 sends, no reply": one line for the board bar and the digest. */
export function parkSuggestionLabel(item: Pick<ParkSuggestion, 'sends' | 'buyerReplied'>): string {
  return item.buyerReplied ? `${item.sends} sends since their last reply` : `${item.sends} sends, no reply`;
}
