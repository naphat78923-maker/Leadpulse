// Finds a business by name with Google Places (Text Search). Server only: the key stays
// in the host's environment and is never sent to the browser.

import { placeMatch, type PlaceMatch } from '@/utils/place-lead';

const FIELDS = ['id', 'displayName', 'formattedAddress', 'internationalPhoneNumber', 'websiteUri', 'primaryTypeDisplayName', 'googleMapsUri']
  .map(field => `places.${field}`).join(',');

export function placesConfigured(): boolean {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}

/** Up to five businesses matching the name. Thailand is preferred, not required. */
export async function searchPlaces(query: string): Promise<PlaceMatch[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error('Name lookup is not configured');
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key, 'x-goog-fieldmask': FIELDS },
    body: JSON.stringify({ textQuery: query, maxResultCount: 5, regionCode: 'TH' }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Places answered ${response.status}`);
  const body = await response.json();
  const places: unknown[] = Array.isArray(body?.places) ? body.places : [];
  return places.map(placeMatch).filter((match): match is PlaceMatch => match !== null);
}
