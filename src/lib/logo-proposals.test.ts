// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { findSiteLogo, proposeLogo, proposeMissingLogos, type LogoFetchers } from './logo-proposals';

const png = (width: number, height = width) =>
  sharp({ create: { width, height, channels: 4, background: { r: 200, g: 40, b: 40, alpha: 1 } } }).png().toBuffer();

/** A site whose home page has `html` and whose images are `images` (url → bytes). */
function site(html: string | null, images: Record<string, Buffer>): LogoFetchers & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    page: async (url) => {
      if (html === null) throw new Error('unreadable');
      return { html, url };
    },
    image: async (url) => {
      asked.push(url);
      const bytes = images[url];
      if (!bytes) throw new Error('The site answered 404');
      return { bytes, type: url.endsWith('.ico') ? 'image/x-icon' : 'image/png', url };
    },
  };
}

describe('findSiteLogo', () => {
  it('skips a tiny touch icon for a good og:image, in the agreed order', async () => {
    const fetchers = site('<link rel="apple-touch-icon" href="/touch.png"><meta property="og:image" content="/og.png">', {
      'https://alice.test/touch.png': await png(32),
      'https://alice.test/og.png': await png(300, 150),
    });
    const found = await findSiteLogo('alice.test', fetchers);
    expect(found?.source).toEqual({ url: 'https://alice.test/og.png', kind: 'og_image' });
    expect(fetchers.asked).toEqual(['https://alice.test/touch.png', 'https://alice.test/apple-touch-icon.png', 'https://alice.test/og.png']);
    const meta = await sharp(found!.webp).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 256, 256]);
  });

  it('falls back to the largest small icon, kept at its own size', async () => {
    const found = await findSiteLogo('https://alice.test/', site('<link rel="icon" href="/a.png"><link rel="apple-touch-icon" href="/t.png">', {
      'https://alice.test/t.png': await png(32),
      'https://alice.test/a.png': await png(48),
    }));
    expect(found?.source.url).toBe('https://alice.test/a.png');
    expect((await sharp(found!.webp).metadata()).width).toBe(48);
  });

  it('still tries the usual icon paths when the home page cannot be read', async () => {
    const found = await findSiteLogo('alice.test', site(null, { 'https://alice.test/apple-touch-icon.png': await png(180) }));
    expect(found?.source).toEqual({ url: 'https://alice.test/apple-touch-icon.png', kind: 'touch_icon' });
  });

  it('returns nothing when no candidate decodes', async () => {
    expect(await findSiteLogo('alice.test', site('<p>hi</p>', { 'https://alice.test/favicon.ico': Buffer.from('not an icon') }))).toBeNull();
    expect(await findSiteLogo('not a site', site('', {}))).toBeNull();
  });
});

/** A Supabase stand-in: one companies row source and a logo bucket that records uploads. */
function fakeDb(rows: Array<Record<string, unknown>>, folders: Record<string, string[]> = {}) {
  const uploads: Array<{ path: string; options: Record<string, unknown> }> = [];
  const query = () => {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => { filters.push((r) => r[column] === value); return builder; },
      is: (column: string, value: unknown) => { filters.push((r) => (r[column] ?? null) === value); return builder; },
      not: (column: string) => { filters.push((r) => r[column] != null); return builder; },
      maybeSingle: async () => ({ data: rows.filter((r) => filters.every((f) => f(r)))[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => void) => resolve({ data: rows.filter((r) => filters.every((f) => f(r))), error: null }),
    };
    return builder;
  };
  const db = {
    from: vi.fn(() => query()),
    storage: {
      from: () => ({
        upload: async (path: string, _body: unknown, options: Record<string, unknown>) => { uploads.push({ path, options }); return { error: null }; },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/${path}` } }),
        list: async (dir: string) => ({ data: (folders[dir] ?? []).map((id) => ({ name: `${id}.webp` })), error: null }),
      }),
    },
  };
  return { db: db as never, uploads };
}

const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

describe('proposeLogo', () => {
  it('stores a found logo as a proposal and leaves the company alone', async () => {
    const { db, uploads } = fakeDb([{ id: ID(1), website: 'https://alice.test', logo_url: null, deleted_at: null }]);
    const result = await proposeLogo(ID(1), db, site('', { 'https://alice.test/apple-touch-icon.png': await png(180) }));
    expect(result).toMatchObject({ status: 'proposed', source: { kind: 'touch_icon' } });
    expect(uploads).toEqual([expect.objectContaining({ path: `logos/proposed/${ID(1)}.webp` })]);
    expect(uploads[0].options).toMatchObject({ upsert: true, contentType: 'image/webp', metadata: { source_kind: 'touch_icon' } });
  });

  it('does nothing for an account that has a logo or no website', async () => {
    const { db, uploads } = fakeDb([
      { id: ID(1), website: 'https://a.test', logo_url: 'https://x/l.webp', deleted_at: null },
      { id: ID(2), website: '  ', logo_url: null, deleted_at: null },
    ]);
    expect((await proposeLogo(ID(1), db, site('', {}))).status).toBe('has_logo');
    expect((await proposeLogo(ID(2), db, site('', {}))).status).toBe('no_website');
    expect((await proposeLogo(ID(3), db, site('', {}))).status).toBe('unknown');
    expect(uploads).toEqual([]);
  });
});

describe('proposeMissingLogos', () => {
  it('skips accounts with a logo, no website, a waiting proposal or a turned-down one', async () => {
    const { db, uploads } = fakeDb([
      { id: ID(1), website: 'https://one.test', logo_url: null, deleted_at: null },
      { id: ID(2), website: 'https://two.test', logo_url: null, deleted_at: null },
      { id: ID(3), website: 'https://three.test', logo_url: null, deleted_at: null },
      { id: ID(4), website: 'https://four.test', logo_url: 'https://x/l.webp', deleted_at: null },
      { id: ID(5), website: null, logo_url: null, deleted_at: null },
    ], { 'logos/proposed': [ID(2)], 'logos/rejected': [ID(3)] });
    const icon = await png(180);
    const fetchers = site('', { 'https://one.test/apple-touch-icon.png': icon });
    const results = await proposeMissingLogos(db, fetchers);
    expect(results).toEqual([expect.objectContaining({ status: 'proposed', companyId: ID(1) })]);
    expect(uploads.map((u) => u.path)).toEqual([`logos/proposed/${ID(1)}.webp`]);
  });
});
