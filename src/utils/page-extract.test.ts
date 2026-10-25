import { describe, expect, it } from 'vitest';
import { extractLeadFromHtml, leadFromSocialUrl, logoCandidates, nameFromHost } from './page-extract';

const PAGE = `<!doctype html><html><head>
<title>Maison Verte | Plant-based bakery in Bangkok</title>
<meta property="og:site_name" content="Maison Verte">
<meta name="description" content="Croissants &amp; pastry made without dairy.">
<link rel="icon" href="/favicon.ico">
<link rel="apple-touch-icon" href="/touch.png">
</head><body>
<a href="mailto:Hello@MaisonVerte.co.th?subject=Hi">Email us</a>
<a href="tel:+6621234567">02 123 4567</a>
<a href="https://www.instagram.com/maisonverte.bkk/">Instagram</a>
<a href="https://www.instagram.com/p/Cabc123/">A post</a>
<a href="https://www.facebook.com/sharer/sharer.php?u=x">Share</a>
<a href="https://facebook.com/maisonvertebkk">Facebook</a>
<a href="https://line.me/R/ti/p/@maisonverte">LINE</a>
</body></html>`;

describe('extractLeadFromHtml', () => {
  it('reads name, description, contact routes, socials and icon', () => {
    expect(extractLeadFromHtml(PAGE, 'https://www.maisonverte.co.th/contact')).toEqual({
      name: 'Maison Verte',
      description: 'Croissants & pastry made without dairy.',
      website: 'https://www.maisonverte.co.th',
      email: 'hello@maisonverte.co.th',
      phone: '+6621234567',
      line: '@maisonverte',
      instagram: 'maisonverte.bkk',
      facebook: 'maisonvertebkk',
      address: null,
      logoUrl: 'https://www.maisonverte.co.th/touch.png',
    });
  });

  it('prefers what the business states in structured data', () => {
    const html = `<title>Home</title><script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [{
        '@type': ['Bakery', 'LocalBusiness'],
        name: 'Oat & Rye',
        telephone: '081 234 5678',
        email: 'mailto:orders@oatrye.com',
        address: { streetAddress: '12 Sukhumvit 49', addressLocality: 'Bangkok', postalCode: '10110', addressCountry: { name: 'Thailand' } },
        logo: { url: '/logo.png' },
        sameAs: ['https://instagram.com/oatandrye'],
      }],
    })}</script>`;
    const lead = extractLeadFromHtml(html, 'https://oatrye.com/');
    expect(lead).toMatchObject({
      name: 'Oat & Rye',
      phone: '081 234 5678',
      email: 'orders@oatrye.com',
      address: '12 Sukhumvit 49, Bangkok, 10110, Thailand',
      logoUrl: 'https://oatrye.com/logo.png',
      instagram: 'oatandrye',
    });
  });

  it('finds a written-out email but not an image file name', () => {
    const lead = extractLeadFromHtml('<img src="logo@2x.png"><p>Write to sales@bakehouse22.com</p><script>var a="x@sentry.io"</script>', 'https://bakehouse22.com');
    expect(lead.email).toBe('sales@bakehouse22.com');
  });

  it('falls back to the title, then the domain, for a name', () => {
    expect(extractLeadFromHtml('<title>Bake House 22 - Wholesale</title>', 'https://bh22.com').name).toBe('Bake House 22');
    expect(extractLeadFromHtml('<p>hi</p>', 'https://plant-pantry.com').name).toBe('Plant Pantry');
  });

  it('survives broken structured data', () => {
    expect(extractLeadFromHtml('<script type="application/ld+json">{oops</script><title>Ok</title>', 'https://ok.com').name).toBe('Ok');
  });
});

describe('leadFromSocialUrl', () => {
  it('reads an Instagram profile link without fetching it', () => {
    expect(leadFromSocialUrl('https://www.instagram.com/maison.verte_bkk/?hl=en')).toMatchObject({
      name: 'Maison Verte Bkk',
      instagram: 'maison.verte_bkk',
      website: 'https://www.instagram.com/maison.verte_bkk/?hl=en',
    });
  });

  it('ignores posts and ordinary websites', () => {
    expect(leadFromSocialUrl('https://www.instagram.com/p/Cabc123/')).toBeNull();
    expect(leadFromSocialUrl('https://maisonverte.co.th')).toBeNull();
    expect(leadFromSocialUrl('not a url')).toBeNull();
  });
});

describe('nameFromHost', () => {
  it('title-cases the first label', () => {
    expect(nameFromHost('www.maison-verte.co.th')).toBe('Maison Verte');
  });
});

describe('logoCandidates', () => {
  it('tries the largest touch icon, then og:image, then the largest favicon, then root paths', () => {
    const html = `<link rel="icon" href="/fav-32.png" sizes="32x32"><link rel="icon" href="/fav-192.png" sizes="192x192">
      <link rel="apple-touch-icon" href="/touch-120.png" sizes="120x120"><link rel="apple-touch-icon" href="/touch-180.png" sizes="180x180">
      <meta property="og:image" content="https://cdn.alice.test/og.jpg"><link rel="stylesheet" href="/icons.css">`;
    expect(logoCandidates(html, 'https://alice.test/en/')).toEqual([
      { url: 'https://alice.test/touch-180.png', kind: 'touch_icon' },
      { url: 'https://alice.test/touch-120.png', kind: 'touch_icon' },
      { url: 'https://alice.test/apple-touch-icon.png', kind: 'touch_icon' },
      { url: 'https://cdn.alice.test/og.jpg', kind: 'og_image' },
      { url: 'https://alice.test/fav-192.png', kind: 'favicon' },
      { url: 'https://alice.test/fav-32.png', kind: 'favicon' },
      { url: 'https://alice.test/favicon.ico', kind: 'favicon' },
    ]);
  });

  it('falls back to the root paths when the page declares nothing, without repeats', () => {
    expect(logoCandidates('<p>hi</p>', 'https://plain.test/')).toEqual([
      { url: 'https://plain.test/apple-touch-icon.png', kind: 'touch_icon' },
      { url: 'https://plain.test/favicon.ico', kind: 'favicon' },
    ]);
    expect(logoCandidates('<link rel="shortcut icon" href="/favicon.ico">', 'https://plain.test/').filter((c) => c.kind === 'favicon')).toHaveLength(1);
  });
});
