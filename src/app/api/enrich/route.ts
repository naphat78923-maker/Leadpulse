import { NextRequest, NextResponse } from 'next/server';
import { fetchPublicPage, UnsafeUrlError } from '@/lib/safe-fetch';
import { extractLeadFromHtml, leadFromSocialUrl } from '@/utils/page-extract';

// POST /api/enrich { url } → the account details a public page states about a business.
// Reads only; nothing is saved here. A social profile link is answered from the link itself.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const raw = typeof body?.url === 'string' ? body.url.trim() : '';
  if (!raw || raw.length > 2000) return NextResponse.json({ error: 'Paste a link first' }, { status: 400 });
  const link = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  const social = leadFromSocialUrl(link);
  if (social) return NextResponse.json({ lead: social, source: 'link' });

  try {
    const page = await fetchPublicPage(link);
    return NextResponse.json({ lead: extractLeadFromHtml(page.html, page.url), source: 'page' });
  } catch (err) {
    if (err instanceof UnsafeUrlError) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: 'That page could not be read. Fill in the details by hand.' }, { status: 502 });
  }
}
