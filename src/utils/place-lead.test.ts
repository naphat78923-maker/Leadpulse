import { describe, expect, it } from 'vitest';
import { leadFromPlace, placeMatch } from './place-lead';
import type { PageLead } from './page-extract';

const place = {
  id: 'ChIJ123',
  displayName: { text: 'Maison Verte', languageCode: 'en' },
  formattedAddress: '12 Sukhumvit 49, Bangkok 10110, Thailand',
  internationalPhoneNumber: '+66 2 123 4567',
  websiteUri: 'https://maisonverte.co.th/',
  primaryTypeDisplayName: { text: 'Bakery' },
  googleMapsUri: 'https://maps.google.com/?cid=1',
};

describe('placeMatch', () => {
  it('reduces a Places result to account fields', () => {
    expect(placeMatch(place)).toEqual({
      id: 'ChIJ123',
      name: 'Maison Verte',
      address: '12 Sukhumvit 49, Bangkok 10110, Thailand',
      phone: '+66 2 123 4567',
      website: 'https://maisonverte.co.th/',
      kind: 'Bakery',
      mapsUrl: 'https://maps.google.com/?cid=1',
    });
  });

  it('keeps a result with only a name, and drops one without', () => {
    expect(placeMatch({ id: 'x', displayName: { text: 'Stall 9' } })).toMatchObject({ name: 'Stall 9', address: null, phone: null, website: null });
    expect(placeMatch({ id: 'x' })).toBeNull();
    expect(placeMatch(null)).toBeNull();
  });
});

describe('leadFromPlace', () => {
  const match = placeMatch(place)!;
  const page: PageLead = {
    name: 'MV | Home', description: 'Pastry made without dairy.', website: 'https://maisonverte.co.th',
    email: 'hello@maisonverte.co.th', phone: '02-000-0000', line: '@maisonverte', instagram: 'maisonverte.bkk',
    facebook: null, address: 'Somewhere else', logoUrl: 'https://maisonverte.co.th/touch.png',
  };

  it('lets the listing win for name, address and phone, and the website fill the rest', () => {
    expect(leadFromPlace(match, page)).toEqual({
      name: 'Maison Verte',
      address: '12 Sukhumvit 49, Bangkok 10110, Thailand',
      phone: '+66 2 123 4567',
      website: 'https://maisonverte.co.th/',
      description: 'Pastry made without dairy.',
      email: 'hello@maisonverte.co.th',
      line: '@maisonverte',
      instagram: 'maisonverte.bkk',
      facebook: null,
      logoUrl: 'https://maisonverte.co.th/touch.png',
    });
  });

  it('works from the listing alone, linking the map when there is no website', () => {
    const lead = leadFromPlace({ ...match, website: null }, null);
    expect(lead).toMatchObject({ name: 'Maison Verte', website: 'https://maps.google.com/?cid=1', email: null, logoUrl: null });
  });
});
