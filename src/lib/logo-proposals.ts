// Finding an account's logo on its own website and leaving it for Pat to approve. Server only.
// Tries the site's touch icon, then og:image, then favicon (utils/page-extract logoCandidates),
// turns the first good one into a square WebP and stores it at logos/proposed/<id>.webp in the
// logo bucket. Nothing is written to the company: Pat's Use logo moves it into place.

import sharp, { type Sharp } from 'sharp';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { fetchPublicImage, fetchPublicPage } from '@/lib/safe-fetch';
import { logoCandidates, type LogoCandidate } from '@/utils/page-extract';
import { largestIcoImage } from '@/utils/ico';
import {
  COMPANY_LOGO_BUCKET,
  PROPOSED_LOGO_DIR,
  REJECTED_LOGO_DIR,
  companyIdOfLogoFile,
  proposedLogoPath,
} from '@/utils/logo-paths';

/** A picture at least this many pixels on its short side is taken at once. */
const GOOD_SIDE = 64;
/** Smaller than this is a dot, not a logo. */
const SMALLEST_SIDE = 16;
/** Stored at most this square (the bucket allows 256 KB). */
const STORED_SIDE = 256;
const BUCKET_LIMIT = 262_144;
/** A site rarely offers more than a handful; stop before a long list costs time. */
const MAX_TRIES = 8;

export interface FoundLogo {
  webp: Buffer;
  source: LogoCandidate;
  /** the picture's own size before it was squared */
  width: number;
  height: number;
}

export interface LogoFetchers {
  page: (url: string) => Promise<{ html: string; url: string }>;
  image: (url: string) => Promise<{ bytes: Buffer; type: string; url: string }>;
}

const liveFetchers: LogoFetchers = { page: fetchPublicPage, image: fetchPublicImage };

interface Decoded { png: Buffer; width: number; height: number }

/** Any picture a site may serve as an icon, as PNG with its size; null when it won't decode. */
async function decode(bytes: Buffer, type: string, url: string): Promise<Decoded | null> {
  try {
    let input: Sharp;
    if (/icon|ico$/i.test(type) || /\.ico$/i.test(new URL(url).pathname)) {
      const ico = largestIcoImage(bytes);
      if (ico?.kind === 'png') input = sharp(Buffer.from(ico.bytes));
      else if (ico?.kind === 'rgba') input = sharp(Buffer.from(ico.pixels), { raw: { width: ico.width, height: ico.height, channels: 4 } });
      else input = sharp(bytes, { limitInputPixels: 25_000_000 });
    } else if (/svg/i.test(type)) {
      // An SVG has no pixel size of its own; draw it large enough to scale down cleanly.
      input = sharp(bytes, { density: 300, limitInputPixels: 25_000_000 });
    } else {
      input = sharp(bytes, { limitInputPixels: 25_000_000 });
    }
    const { data, info } = await input.png().toBuffer({ resolveWithObject: true });
    return { png: data, width: info.width, height: info.height };
  } catch {
    return null;
  }
}

/** The picture squared on a transparent background, no larger than it was (a 32px icon stays
 *  32px rather than being blown up into a blur), as WebP under the bucket limit. */
async function square({ png, width, height }: Decoded): Promise<Buffer> {
  const side = Math.min(STORED_SIDE, Math.max(width, height));
  for (const quality of [85, 70, 50]) {
    const webp = await sharp(png)
      .resize(side, side, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality })
      .toBuffer();
    if (webp.byteLength <= BUCKET_LIMIT) return webp;
  }
  throw new Error('The logo would not fit the bucket limit');
}

/** The first good logo the site offers, else the largest small one; null when there is none. */
export async function findSiteLogo(website: string, fetchers: LogoFetchers = liveFetchers): Promise<FoundLogo | null> {
  const link = /^https?:\/\//i.test(website.trim()) ? website.trim() : `https://${website.trim()}`;
  let home: string;
  try { home = new URL(link).toString(); } catch { return null; }
  // A page that can't be read still has the usual icon paths worth trying.
  const page = await fetchers.page(home).catch(() => null);
  const candidates = logoCandidates(page?.html ?? '', page?.url ?? home).slice(0, MAX_TRIES);

  let fallback: { decoded: Decoded; source: LogoCandidate } | null = null;
  for (const source of candidates) {
    const image = await fetchers.image(source.url).catch(() => null);
    if (!image) continue;
    const decoded = await decode(image.bytes, image.type, image.url);
    if (!decoded) continue;
    const short = Math.min(decoded.width, decoded.height);
    if (short >= GOOD_SIDE) return { webp: await square(decoded), source, width: decoded.width, height: decoded.height };
    if (short >= SMALLEST_SIDE && (!fallback || short > Math.min(fallback.decoded.width, fallback.decoded.height))) {
      fallback = { decoded, source };
    }
  }
  if (!fallback) return null;
  const { decoded, source } = fallback;
  return { webp: await square(decoded), source, width: decoded.width, height: decoded.height };
}

export type ProposeResult =
  | { status: 'proposed'; companyId: string; url: string; source: LogoCandidate }
  | { status: 'none' | 'no_website' | 'has_logo' | 'unknown'; companyId: string }
  | { status: 'failed'; companyId: string; reason: string };

/** Looks for one account's logo on its site and stores it as a proposal. */
export async function proposeLogo(companyId: string, db: SupabaseClient = supabase, fetchers: LogoFetchers = liveFetchers): Promise<ProposeResult> {
  const { data: company, error } = await db
    .from('companies')
    .select('id, website, logo_url')
    .eq('id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(`Could not read the account: ${error.message}`);
  if (!company) return { status: 'unknown', companyId };
  if (company.logo_url) return { status: 'has_logo', companyId };
  if (!company.website?.trim()) return { status: 'no_website', companyId };

  const found = await findSiteLogo(company.website, fetchers);
  if (!found) return { status: 'none', companyId };
  const path = proposedLogoPath(companyId);
  const { error: uploadError } = await db.storage.from(COMPANY_LOGO_BUCKET).upload(path, found.webp, {
    upsert: true,
    contentType: 'image/webp',
    cacheControl: '60',
    metadata: { source_url: found.source.url, source_kind: found.source.kind },
  });
  if (uploadError) throw new Error(`Could not store the logo: ${uploadError.message}`);
  const { data } = db.storage.from(COMPANY_LOGO_BUCKET).getPublicUrl(path);
  return { status: 'proposed', companyId, url: `${data.publicUrl}?v=${Date.now()}`, source: found.source };
}

/** Company ids that already have a file in a logo folder. */
export async function companiesWithLogoFile(dir: string, db: SupabaseClient = supabase): Promise<Set<string>> {
  const { data, error } = await db.storage.from(COMPANY_LOGO_BUCKET).list(dir, { limit: 1000 });
  if (error) throw new Error(`Could not list ${dir}: ${error.message}`);
  return new Set((data ?? []).map((file) => companyIdOfLogoFile(file.name)).filter((id): id is string => Boolean(id)));
}

/** Every live account with a website and no logo that has neither a waiting nor a turned-down
 *  proposal, looked up a few at a time. */
export async function proposeMissingLogos(db: SupabaseClient = supabase, fetchers: LogoFetchers = liveFetchers): Promise<ProposeResult[]> {
  const { data, error } = await db
    .from('companies')
    .select('id, website')
    .is('deleted_at', null)
    .is('logo_url', null)
    .not('website', 'is', null);
  if (error) throw new Error(`Could not read accounts: ${error.message}`);
  const [waiting, declined] = await Promise.all([companiesWithLogoFile(PROPOSED_LOGO_DIR, db), companiesWithLogoFile(REJECTED_LOGO_DIR, db)]);
  const queue = (data ?? [])
    .filter((c) => (c.website as string | null)?.trim() && !waiting.has(c.id) && !declined.has(c.id))
    .map((c) => c.id as string);

  const results: ProposeResult[] = [];
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      const companyId = id;
      results.push(await proposeLogo(companyId, db, fetchers).catch((err: unknown) => ({
        status: 'failed' as const, companyId, reason: err instanceof Error ? err.message : 'Unknown error',
      })));
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return results;
}
