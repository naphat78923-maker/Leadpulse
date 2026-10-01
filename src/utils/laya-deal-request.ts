// ─── The exact /score request for a deal — shared by the worker and the app ───
// No crypto and no Node built-ins, so the browser can import it. The worker hashes
// the body with node:crypto (laya-worker.ts); the app hashes the same body with Web
// Crypto (laya-freshness.ts) to tell a fresh saved judgment from a stale one.

import type { Deal } from '../types/crm.ts';
import { buildLayaBuyerResponseInput, LAYA_ALL_FROZEN_QUESTIONS } from './laya-buyer-response.ts';

export type RequestDeal = Pick<Deal, 'product' | 'buyer_reply' | 'last_outcome'>;

export interface DealScoreRequest {
  sent: { state: string; questions: Record<string, unknown> };
  /** JSON.stringify(sent) — the exact bytes POSTed and hashed */
  body: string;
}

/** The deal-set request for a verbatim reply, or null when there is none to judge. */
export function dealScoreRequest(deal: RequestDeal): DealScoreRequest | null {
  const built = buildLayaBuyerResponseInput({ deal });
  if (!built?.verbatim) return null;
  const sent = { state: built.state, questions: LAYA_ALL_FROZEN_QUESTIONS as Record<string, unknown> };
  return { sent, body: JSON.stringify(sent) };
}
