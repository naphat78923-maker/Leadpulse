import { NextRequest, NextResponse } from 'next/server';
import { placesConfigured, searchPlaces } from '@/lib/places';

// GET /api/enrich/search?q=<company name> → businesses with that name, for the New account form.
// Each call is a billed Places request, so it only answers the app's own pages and
// returns `configured: false` (no error) when no key is set.
export async function GET(request: NextRequest) {
  // Browsers send this on every fetch; anything not from our own pages is turned away.
  const site = request.headers.get('sec-fetch-site');
  if (site !== 'same-origin') return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  if (!placesConfigured()) return NextResponse.json({ configured: false, matches: [] });

  const query = (request.nextUrl.searchParams.get('q') ?? '').trim();
  if (query.length < 3 || query.length > 120) return NextResponse.json({ configured: true, matches: [] });

  try {
    return NextResponse.json({ configured: true, matches: await searchPlaces(query) });
  } catch {
    return NextResponse.json({ configured: true, matches: [], error: 'Lookup failed' }, { status: 502 });
  }
}
