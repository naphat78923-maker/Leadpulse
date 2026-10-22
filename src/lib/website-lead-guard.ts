// Who may post to /api/leads, and how often. Server only.
//
// Two ways in, either is enough:
// - LEAD_FORM_SECRET: the x-lead-form-key header, for a website that posts from its own server.
// - LEAD_FORM_ORIGINS: a comma-separated list of the website's origins, for a form that posts
//   straight from the visitor's browser (a key in browser code is public, so it proves nothing).
// With neither set the route is closed.

import { timingSafeEqual } from 'node:crypto';

type Env = Record<string, string | undefined>;

export const SECRET_HEADER = 'x-lead-form-key';

/** The largest body read, in bytes: every field at its limit fits well inside. */
export const MAX_BODY_BYTES = 16_000;

const list = (value: string | undefined) => (value ?? '').split(',').map(v => v.trim().replace(/\/$/, '').toLowerCase()).filter(Boolean);

export function allowedOrigins(env: Env = process.env): string[] {
  return list(env.LEAD_FORM_ORIGINS);
}

/** The request's Origin when it is one of the website's, for the CORS reply. */
export function allowedOrigin(request: Request, env: Env = process.env): string | null {
  const origin = request.headers.get('origin')?.trim();
  return origin && allowedOrigins(env).includes(origin.toLowerCase()) ? origin : null;
}

function secretMatches(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type Access = { ok: true } | { ok: false; status: 401 | 403 | 503 };

export function checkAccess(request: Request, env: Env = process.env): Access {
  const secret = env.LEAD_FORM_SECRET?.trim();
  if (!secret && allowedOrigins(env).length === 0) return { ok: false, status: 503 };
  if (secretMatches(request.headers.get(SECRET_HEADER), secret)) return { ok: true };
  if (allowedOrigin(request, env)) return { ok: true };
  return { ok: false, status: request.headers.get(SECRET_HEADER) ? 401 : 403 };
}

/** The visitor's address as Vercel reports it. */
export function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * A fixed-window limit per key, held in this server instance's memory. It stops one visitor
 * (or a script) from filling the pipeline; it is not shared between Vercel instances.
 */
export function createRateLimiter(limit: number, windowMs: number, clock: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const now = clock();
    const recent = (hits.get(key) ?? []).filter(t => now - t < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5_000) for (const [k, times] of hits) if (times.every(t => now - t >= windowMs)) hits.delete(k);
    return true;
  };
}

const HOUR = 60 * 60 * 1000;
/** 5 enquiries an hour from one address; 60 an hour in all. */
export const perVisitor = createRateLimiter(5, HOUR);
export const overall = createRateLimiter(60, HOUR);
