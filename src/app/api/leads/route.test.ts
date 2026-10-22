// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { checkAccess, createRateLimiter } from '@/lib/website-lead-guard';

const capture = vi.fn();
vi.mock('@/lib/website-lead-data', () => ({ captureWebsiteLead: (...args: unknown[]) => capture(...args) }));

const { POST, OPTIONS } = await import('./route');

const SITE = 'https://www.vgsaveur.com';
let ip = 0;

function post(body: unknown, headers: Record<string, string> = {}) {
  ip += 1; // a fresh visitor per request, so the per-visitor limit only bites where tested
  return new NextRequest('https://leadpulse.example/api/leads', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SITE, 'x-forwarded-for': `10.0.0.${ip}`, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const valid = { business_name: 'Baan Khanom', phone: '0812345678', utm_source: 'facebook' };

beforeEach(() => {
  vi.stubEnv('LEAD_FORM_ORIGINS', `${SITE}, https://vgsaveur.com`);
  vi.stubEnv('LEAD_FORM_SECRET', 's3cret-key');
  capture.mockReset().mockResolvedValue({});
});
afterEach(() => vi.unstubAllEnvs());

describe('POST /api/leads', () => {
  it('saves an enquiry from the website and answers with CORS for its origin', async () => {
    const response = await POST(post({ ...valid, role: 'admin' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(SITE);
    expect(capture).toHaveBeenCalledWith(expect.objectContaining({ business_name: 'Baan Khanom', utm_source: 'facebook' }));
    expect(capture.mock.calls[0][0]).not.toHaveProperty('role');
  });

  it('refuses another origin, and accepts a server post that carries the key', async () => {
    expect((await POST(post(valid, { origin: 'https://evil.example' }))).status).toBe(403);
    expect((await POST(post(valid, { origin: 'https://evil.example', 'x-lead-form-key': 'wrong' }))).status).toBe(401);
    expect((await POST(post(valid, { origin: '', 'x-lead-form-key': 's3cret-key' }))).status).toBe(200);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('is closed until an origin or key is configured', async () => {
    vi.stubEnv('LEAD_FORM_ORIGINS', '');
    vi.stubEnv('LEAD_FORM_SECRET', '');
    expect((await POST(post(valid))).status).toBe(503);
  });

  it('says which field is wrong and saves nothing', async () => {
    const response = await POST(post({ business_name: 'Baan Khanom' }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ field: 'phone' });
    expect((await POST(post('{not json'))).status).toBe(400);
    expect(capture).not.toHaveBeenCalled();
  });

  it('thanks a bot that filled the honeypot without saving it', async () => {
    const response = await POST(post({ ...valid, company_fax: '02 000 0000' }));
    expect(response.status).toBe(200);
    expect(capture).not.toHaveBeenCalled();
  });

  it('refuses a body over the size limit', async () => {
    expect((await POST(post({ ...valid, message: 'x'.repeat(20_000) }))).status).toBe(413);
  });

  it('accepts a plain HTML form post', async () => {
    const request = new NextRequest('https://leadpulse.example/api/leads', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: SITE, 'x-forwarded-for': '10.1.0.1' },
      body: new URLSearchParams({ business_name: 'Baan Khanom', line_id: 'nok.bakes', fbclid: 'IwAR0' }).toString(),
    });
    expect((await POST(request)).status).toBe(200);
    expect(capture).toHaveBeenCalledWith(expect.objectContaining({ line_id: 'nok.bakes', fbclid: 'IwAR0' }));
  });

  it('limits one visitor to 5 enquiries an hour', async () => {
    const same = () => post(valid, { 'x-forwarded-for': '10.9.9.9' });
    for (let i = 0; i < 5; i++) expect((await POST(same())).status).toBe(200);
    expect((await POST(same())).status).toBe(429);
  });

  it('reports a failed save so the form can ask them to retry', async () => {
    capture.mockRejectedValue(new Error('db down'));
    expect((await POST(post(valid))).status).toBe(500);
  });

  it('answers the CORS preflight for the website only', async () => {
    const ok = OPTIONS(new NextRequest('https://leadpulse.example/api/leads', { method: 'OPTIONS', headers: { origin: SITE } }));
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-headers')).toContain('content-type');
    const other = OPTIONS(new NextRequest('https://leadpulse.example/api/leads', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }));
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('website-lead-guard', () => {
  it('matches origins without a trailing slash or case difference', () => {
    const request = new Request('https://x', { headers: { origin: 'https://VGSaveur.com' } });
    expect(checkAccess(request, { LEAD_FORM_ORIGINS: 'https://vgsaveur.com/' })).toEqual({ ok: true });
  });

  it('opens a new window once the old one has passed', () => {
    let now = 0;
    const allow = createRateLimiter(2, 1000, () => now);
    expect([allow('a'), allow('a'), allow('a'), allow('b')]).toEqual([true, true, false, true]);
    now = 1000;
    expect(allow('a')).toBe(true);
  });
});
