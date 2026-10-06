// Reads a business's public web page into account details: name, description, contact
// routes and social handles. Pure string work, so it runs anywhere and is easy to test.
// Only what the page states is returned; nothing is guessed beyond a name from the domain.

export interface PageLead {
  name: string | null;
  description: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  line: string | null;
  instagram: string | null;
  facebook: string | null;
  address: string | null;
  logoUrl: string | null;
}

const EMPTY: PageLead = {
  name: null, description: null, website: null, email: null, phone: null,
  line: null, instagram: null, facebook: null, address: null, logoUrl: null,
};

const decode = (value: string) => value
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/\s+/g, ' ').trim();

const clip = (value: string | null | undefined, max: number) => {
  const text = value ? decode(value) : '';
  return text ? (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text) : null;
};

function attr(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return match ? (match[2] ?? match[3] ?? match[4] ?? '') : null;
}

function meta(html: string, key: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const id = (attr(tag, 'property') ?? attr(tag, 'name') ?? '').toLowerCase();
    if (id === key) return attr(tag, 'content');
  }
  return null;
}

function absolute(href: string | null, base: string): string | null {
  if (!href) return null;
  try {
    const url = new URL(decode(href), base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Pages on these hosts are profiles, not paths worth keeping as a handle. */
const SOCIAL_SKIP = new Set(['p', 'reel', 'reels', 'explore', 'stories', 'tv', 'sharer', 'sharer.php', 'share', 'share.php', 'tr', 'plugins', 'dialog', 'login', 'policies', 'help', 'privacy', 'legal', 'accounts']);

function socialHandle(url: URL, hosts: string[]): string | null {
  const host = url.hostname.replace(/^(www|m|web)\./, '').toLowerCase();
  if (!hosts.includes(host)) return null;
  const first = url.pathname.split('/').filter(Boolean)[0];
  if (!first || SOCIAL_SKIP.has(first.toLowerCase())) return null;
  return decodeURIComponent(first).replace(/^@/, '');
}

function lineId(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  if (host === 'lin.ee' && parts[0]) return url.toString();
  if (host !== 'line.me' && host !== 'page.line.me') return null;
  // line.me/R/ti/p/@handle, line.me/ti/p/~id, page.line.me/handle
  const last = parts.at(-1);
  if (!last || ['r', 'ti', 'p'].includes(last.toLowerCase())) return null;
  return decodeURIComponent(last).replace(/^~/, '');
}

type Json = Record<string, unknown>;

function* jsonLdNodes(html: string): Generator<Json> {
  const blocks = html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of blocks) {
    let parsed: unknown;
    try { parsed = JSON.parse(block[1]); } catch { continue; }
    const queue: unknown[] = [parsed];
    while (queue.length > 0) {
      const node = queue.shift();
      if (Array.isArray(node)) queue.push(...node);
      else if (node && typeof node === 'object') {
        yield node as Json;
        const graph = (node as Json)['@graph'];
        if (graph) queue.push(graph);
      }
    }
  }
}

const BUSINESS_TYPE = /Organization|LocalBusiness|Restaurant|Bakery|Cafe|Store|Hotel|FoodEstablishment|Corporation|Brand/i;

function addressText(value: unknown): string | null {
  if (typeof value === 'string') return clip(value, 200);
  if (!value || typeof value !== 'object') return null;
  const a = value as Json;
  const parts = [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode, a.addressCountry]
    .map(part => (typeof part === 'string' ? part : part && typeof part === 'object' ? (part as Json).name : null))
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '');
  return parts.length > 0 ? clip(parts.join(', '), 200) : null;
}

const str = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** "maison-verte.co.th" → "Maison Verte" */
export function nameFromHost(hostname: string): string {
  const label = hostname.replace(/^www\./, '').split('.')[0] ?? '';
  return label.split(/[-_]/).filter(Boolean).map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
}

const TITLE_SPLIT = /\s+[|–—·•:-]\s+/;

/**
 * A link that is itself a social profile (Instagram, Facebook, LINE) needs no fetch:
 * the handle is the lead. Returns null for any other URL.
 */
export function leadFromSocialUrl(input: string): PageLead | null {
  let url: URL;
  try { url = new URL(input); } catch { return null; }
  const instagram = socialHandle(url, ['instagram.com']);
  const facebook = socialHandle(url, ['facebook.com', 'fb.com']);
  const line = lineId(url);
  if (!instagram && !facebook && !line) return null;
  const handle = instagram ?? facebook;
  return {
    ...EMPTY,
    name: handle ? handle.split(/[._-]+/).filter(Boolean).map(word => word[0].toUpperCase() + word.slice(1)).join(' ') : null,
    website: url.toString(),
    instagram,
    facebook,
    line,
  };
}

export function extractLeadFromHtml(html: string, pageUrl: string): PageLead {
  const url = new URL(pageUrl);
  const lead: PageLead = { ...EMPTY, website: url.origin };

  // 1. Structured data the business published about itself.
  for (const node of jsonLdNodes(html)) {
    const type = Array.isArray(node['@type']) ? node['@type'].join(' ') : String(node['@type'] ?? '');
    if (!BUSINESS_TYPE.test(type)) continue;
    lead.name ??= clip(str(node.name), 120);
    lead.description ??= clip(str(node.description), 300);
    lead.phone ??= clip(str(node.telephone), 40);
    lead.email ??= str(node.email)?.replace(/^mailto:/i, '').toLowerCase() ?? null;
    lead.address ??= addressText(node.address);
    const logo = node.logo && typeof node.logo === 'object' ? (node.logo as Json).url : node.logo;
    lead.logoUrl ??= absolute(str(logo), pageUrl);
    const sameAs = Array.isArray(node.sameAs) ? node.sameAs : node.sameAs ? [node.sameAs] : [];
    for (const link of sameAs) {
      try {
        const target = new URL(String(link));
        lead.instagram ??= socialHandle(target, ['instagram.com']);
        lead.facebook ??= socialHandle(target, ['facebook.com', 'fb.com']);
        lead.line ??= lineId(target);
      } catch { /* not a URL */ }
    }
  }

  // 2. Links on the page: mailto, tel and social profiles.
  for (const tag of html.match(/<a\b[^>]*>/gi) ?? []) {
    const href = attr(tag, 'href');
    if (!href) continue;
    const value = decode(href);
    if (/^mailto:/i.test(value)) {
      lead.email ??= decodeURIComponent(value.slice(7).split('?')[0]).trim().toLowerCase() || null;
    } else if (/^tel:/i.test(value)) {
      lead.phone ??= decodeURIComponent(value.slice(4)).trim() || null;
    } else {
      try {
        const target = new URL(value, pageUrl);
        lead.instagram ??= socialHandle(target, ['instagram.com']);
        lead.facebook ??= socialHandle(target, ['facebook.com', 'fb.com']);
        lead.line ??= lineId(target);
      } catch { /* not a URL */ }
    }
  }

  // 3. An email written out in the text, when no mailto link exists. Image names look like emails.
  if (!lead.email) {
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ');
    const found = text.match(/[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+/gi) ?? [];
    lead.email = found.find(email => !/\.(png|jpe?g|gif|webp|svg|css|js)$/i.test(email) && !/sentry|wixpress|example\./i.test(email))?.toLowerCase() ?? null;
  }

  // 4. Meta tags and the title fill whatever is still blank.
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  lead.name ??= clip(meta(html, 'og:site_name'), 120)
    ?? clip((meta(html, 'og:title') ?? title)?.split(TITLE_SPLIT)[0], 120)
    ?? (nameFromHost(url.hostname) || null);
  lead.description ??= clip(meta(html, 'og:description') ?? meta(html, 'description'), 300);
  if (!lead.logoUrl) {
    const icons = (html.match(/<link\b[^>]*>/gi) ?? []).filter(tag => /icon/i.test(attr(tag, 'rel') ?? ''));
    const best = icons.find(tag => /apple-touch-icon/i.test(attr(tag, 'rel') ?? '')) ?? icons[0];
    lead.logoUrl = absolute(best ? attr(best, 'href') : null, pageUrl);
  }
  return lead;
}
