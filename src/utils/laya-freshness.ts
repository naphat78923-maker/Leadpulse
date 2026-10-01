// ─── Is a saved judgment about the deal's CURRENT reply? (browser-safe) ───
// The worker stored sha256(JSON.stringify({ state, questions })) as input_sha256.
// Rebuilding the same request from the current CRM row and hashing it with Web
// Crypto says whether the saved answers still describe what the buyer wrote.

import { dealScoreRequest, type RequestDeal } from './laya-deal-request.ts';

async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** The input hash the worker would store for this deal now, or null when there is nothing to judge. */
export async function dealInputSha256(deal: RequestDeal): Promise<string | null> {
  const request = dealScoreRequest(deal);
  return request ? sha256Hex(request.body) : null;
}
