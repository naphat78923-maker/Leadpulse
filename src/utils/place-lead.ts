// A business found by name (Google Places), reduced to what an account needs.
// Pure mapping; the request itself lives in lib/places.ts.

import type { PageLead } from './page-extract';

export interface PlaceMatch {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  /** e.g. "Bakery", "Hotel"; shown on the match and offered as the industry */
  kind: string | null;
  mapsUrl: string | null;
}

type Json = Record<string, unknown>;
const text = (value: unknown): string | null => {
  const raw = value && typeof value === 'object' ? (value as Json).text : value;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
};

/** One entry of a Places "searchText" response; null when it has no usable name. */
export function placeMatch(place: unknown): PlaceMatch | null {
  if (!place || typeof place !== 'object') return null;
  const p = place as Json;
  const id = text(p.id);
  const name = text(p.displayName);
  if (!id || !name) return null;
  return {
    id,
    name,
    address: text(p.formattedAddress),
    phone: text(p.internationalPhoneNumber) ?? text(p.nationalPhoneNumber),
    website: text(p.websiteUri),
    kind: text(p.primaryTypeDisplayName),
    mapsUrl: text(p.googleMapsUri),
  };
}

/**
 * The account details for a chosen match, topped up with what its own website says.
 * The listing wins for name, address and phone; the website supplies the rest.
 */
export function leadFromPlace(match: PlaceMatch, page: PageLead | null): PageLead {
  return {
    name: match.name,
    address: match.address ?? page?.address ?? null,
    phone: match.phone ?? page?.phone ?? null,
    website: match.website ?? page?.website ?? match.mapsUrl,
    description: page?.description ?? null,
    email: page?.email ?? null,
    line: page?.line ?? null,
    instagram: page?.instagram ?? null,
    facebook: page?.facebook ?? null,
    logoUrl: page?.logoUrl ?? null,
  };
}
