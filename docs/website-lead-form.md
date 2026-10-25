# Website lead form → LeadPulse

The VG Saveur website's enquiry form posts to `POST /api/leads`. Each enquiry arrives in
LeadPulse already tagged with where it came from, and Pat gets a Telegram alert from the
LeadPulse bot.

## What LeadPulse does with it

- **Source.** `companies.acquisition_source` is `meta_ad` when the landing URL had
  `utm_source` facebook / instagram / meta / fb / ig, or an `fbclid`; otherwise
  `inbound_other`. `acquisition_campaign` is `utm_campaign`, then `utm_content`
  (`Croissant Oct · video 2`). Unfilled Meta placeholders like `{{campaign.name}}` are dropped.
- **Known business.** Linked, not duplicated: same name (ignoring "Co., Ltd."), an alias Pat
  recorded with "Same as …", or a contact with the same phone, email or LINE. Its recorded
  source is kept (an outbound account stays outbound); the enquiry is added to its notes.
- **New business.** A `prospect` with lead source "Website form", the person who wrote as a
  contact, and a Research deal "<name> — Butter" due **today** with next step "Reply to their
  website enquiry", so it is on This week straight away.
- **One open deal per account.** A known account with an open deal keeps that deal.

## Setup (Vercel env)

| Variable | Value |
| --- | --- |
| `LEAD_FORM_ORIGINS` | The website's origins, comma-separated: `https://vgsaveur.com,https://www.vgsaveur.com` |
| `LEAD_FORM_SECRET` | Optional. Only for a site that posts **from its own server**; sent as `x-lead-form-key`. Never put it in browser code. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Already set for the digest; the alert uses the same bot. |

With neither `LEAD_FORM_ORIGINS` nor `LEAD_FORM_SECRET` set, the route answers 503.

## The request

`Content-Type: application/json` (or a plain `application/x-www-form-urlencoded` form post).
Only these fields are read; anything else is ignored.

| Field | Max | |
| --- | --- | --- |
| `business_name` | 120 | required |
| `contact_name` | 80 | |
| `phone` | 30 | one of phone / `line_id` / `email` is required |
| `line_id` | 60 | |
| `email` | 120 | |
| `message` | 2000 | |
| `utm_source`, `utm_medium` | 100 | from the landing URL |
| `utm_campaign`, `utm_content` | 150 | from the landing URL |
| `fbclid` | 500 | from the landing URL |
| `company_fax` | — | **honeypot**: a hidden input people never fill. Must be empty. |

Answers: `200 {ok:true}` · `400 {error, field}` · `403` wrong origin · `413` body over 16 KB ·
`429` more than 5 an hour from one visitor (60 an hour in all, per server instance) · `500`
could not save (ask them to retry or message on LINE).

## Website snippet

Meta adds `fbclid` and your `utm_*` values to the **landing** URL only. Visitors often move
to another page before filling in the form, so read them on arrival and keep them for the
visit in `sessionStorage`.

Put this on every page (or in the site layout):

```html
<script>
  (function () {
    var KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'fbclid'];
    var params = new URLSearchParams(location.search);
    // Only a URL that carries tracking replaces what was kept, so moving between pages keeps the ad's values.
    if (KEYS.some(function (k) { return params.get(k); })) {
      var kept = {};
      KEYS.forEach(function (k) { var v = params.get(k); if (v) kept[k] = v.slice(0, 500); });
      try { sessionStorage.setItem('vg_attribution', JSON.stringify(kept)); } catch (e) {}
    }
  })();
</script>
```

The form, with the hidden honeypot:

```html
<form id="enquiry">
  <input name="business_name" required maxlength="120" placeholder="Bakery / business name">
  <input name="contact_name" maxlength="80" placeholder="Your name">
  <input name="phone" maxlength="30" placeholder="Phone">
  <input name="line_id" maxlength="60" placeholder="LINE ID">
  <input name="email" type="email" maxlength="120" placeholder="Email">
  <textarea name="message" maxlength="2000" placeholder="What do you need?"></textarea>
  <!-- Honeypot: hidden from people, filled by bots. Keep the name. -->
  <div style="position:absolute;left:-9999px" aria-hidden="true">
    <input name="company_fax" tabindex="-1" autocomplete="off">
  </div>
  <button type="submit">Send</button>
  <p id="enquiry-status" role="status"></p>
</form>

<script>
  document.getElementById('enquiry').addEventListener('submit', async function (event) {
    event.preventDefault();
    var form = event.currentTarget;
    var status = document.getElementById('enquiry-status');
    var button = form.querySelector('button');
    var kept = {};
    try { kept = JSON.parse(sessionStorage.getItem('vg_attribution') || '{}'); } catch (e) {}
    var body = Object.assign({}, kept, Object.fromEntries(new FormData(form)));

    button.disabled = true;
    try {
      var response = await fetch('https://YOUR-LEADPULSE-DOMAIN/api/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      var result = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(result.error || 'Please try again');
      form.reset();
      status.textContent = 'Thank you! We will contact you shortly.';
    } catch (error) {
      status.textContent = error.message;
      button.disabled = false;
    }
  });
</script>
```

Replace `YOUR-LEADPULSE-DOMAIN` with the LeadPulse Vercel domain, and make sure the
website's origin is in `LEAD_FORM_ORIGINS`.

### Meta ad URL parameters

In Ads Manager → Ad → Tracking → URL parameters, use:

```
utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}
```

Use `utm_source=instagram` on Instagram-only ads if you want to tell them apart in the notes;
both count as Meta ads. Meta adds `fbclid` by itself.

## Limits to know

- The rate limit lives in each server instance's memory, so it is a brake, not a wall. For a
  real flood, add a Vercel Firewall rate-limit rule on `/api/leads`.
- `Origin` proves a browser request came from the website; a script can fake it. The honeypot,
  the limits and the field checks are what stop junk from such a script.
