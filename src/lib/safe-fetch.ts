// Fetches a public web page a user pasted, on the server. A pasted URL is untrusted, so
// this refuses anything that is not a plain public website: other schemes, odd ports,
// and hosts that resolve to this machine or a private network. Server only.

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8_000;

export class UnsafeUrlError extends Error {}

/** Loopback, private, link-local, CGNAT, multicast and reserved ranges. */
export function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const [a, b] = address.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || b === 0)) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    return true;
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPublicAddress(mapped[1]);
    if (lower === '::' || lower === '::1') return false;
    // fc00::/7 unique local, fe80::/10 link-local, ff00::/8 multicast, ::ffff:0:0/96 hex-mapped v4
    if (/^(f[cd]|fe[89ab]|ff)/.test(lower) || lower.startsWith('::ffff:')) return false;
    return true;
  }
  return false;
}

async function assertPublicUrl(url: URL): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new UnsafeUrlError('Only web links can be read');
  if (url.username || url.password) throw new UnsafeUrlError('Links with a login are not read');
  if (url.port && url.port !== '80' && url.port !== '443') throw new UnsafeUrlError('Only standard web ports are read');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map(entry => entry.address);
  if (addresses.length === 0 || !addresses.every(isPublicAddress)) throw new UnsafeUrlError('That link does not point to a public website');
}

/** The HTML of a public page, following a few redirects, or a thrown error. */
export async function fetchPublicPage(input: string): Promise<{ html: string; url: string }> {
  let url: URL;
  try { url = new URL(input); } catch { throw new UnsafeUrlError('That is not a link'); }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // Checked on every hop: a public page may redirect somewhere private.
    await assertPublicUrl(url);
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; LeadPulse/1.0)', accept: 'text/html,application/xhtml+xml' },
    });
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get('location');
      if (!next) throw new Error('The site redirected nowhere');
      url = new URL(next, url);
      continue;
    }
    if (!response.ok) throw new Error(`The site answered ${response.status}`);
    if (!/html/i.test(response.headers.get('content-type') ?? '')) throw new Error('That link is not a web page');

    const reader = response.body?.getReader();
    if (!reader) return { html: '', url: url.toString() };
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
    await reader.cancel().catch(() => {});
    return { html: Buffer.concat(chunks).subarray(0, MAX_BYTES).toString('utf8'), url: url.toString() };
  }
  throw new Error('The site redirected too many times');
}
