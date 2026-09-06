"""Read-only local browser regression: python3 scripts/verify-card-layout.py.
Uses the installed Python Playwright; never allows remote CRM mutations.
"""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://localhost:3001/deals')
parser.add_argument('--out', default='/tmp/leadpulse-p0')
parser.add_argument('--baseline', action='store_true')
args = parser.parse_args()
assert args.url.startswith(('http://localhost:', 'http://127.0.0.1:')) or args.url == 'https://leadpulse-one-ashen.vercel.app/deals', 'Only local preview or canonical LeadPulse deals page'
out = Path(args.out)
out.mkdir(parents=True, exist_ok=True)

MEASURE = r'''() => {
  const cards = [...document.querySelectorAll('button')].filter(b => b.querySelector('h3') && b.querySelector('.sr-only')?.textContent.startsWith('Open ') && b.getBoundingClientRect().width && b.getBoundingClientRect().height);
  return cards.map(card => {
    const name = card.querySelector('h3');
    const company = card.querySelector('[data-card-company]') || name;
    const timing = [...card.querySelectorAll('span')].find(s => /^(Overdue|Due today|Scheduled|No date)$/.test(s.textContent.trim()));
    const nr = name.getBoundingClientRect(), cr = company.getBoundingClientRect(), tr = timing.getBoundingClientRect(), br = card.getBoundingClientRect();
    const issues = [];
    if (tr.top < Math.max(nr.bottom, cr.bottom) - 1) issues.push('Timing is not below identity');
    if (cr.width < Math.min(120, br.width * .55)) issues.push('Company identity squeezed');
    for (const [label, r] of [['name', nr], ['company', cr], ['timing', tr]]) {
      if (r.left < br.left || r.right > br.right + 1) issues.push(label + ' escapes card');
    }
    return { label: card.querySelector('.sr-only').textContent, width: br.width, companyWidth: cr.width, issues };
  });
}'''

LANE_MEASURE = r'''() => {
  const lanes = [...document.querySelectorAll('[data-lane-id]')].filter(lane => {
    const r = lane.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  return lanes.map(lane => {
    const header = lane.querySelector('[data-lane-header]');
    const title = lane.querySelector('[data-lane-title]');
    const stats = lane.querySelector('[data-lane-stats]');
    const lr = lane.getBoundingClientRect();
    const hr = header?.getBoundingClientRect();
    const tr = title?.getBoundingClientRect();
    const sr = stats?.getBoundingClientRect();
    const issues = [];
    if (!header || !title || !stats) issues.push('Missing lane header structure');
    if (hr && (hr.left < lr.left || hr.right > lr.right + 1)) issues.push('Header escapes lane');
    if (tr && (tr.left < lr.left || tr.right > lr.right + 1)) issues.push('Title escapes lane');
    if (sr && (sr.left < lr.left || sr.right > lr.right + 1)) issues.push('Stats escape lane');
    if (tr && sr && tr.right > sr.left - 4 && Math.abs(tr.top - sr.top) < 20) issues.push('Title and stats compete on one row');
    return { id: lane.dataset.laneId, width: lr.width, issues };
  });
}'''

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1)
    blocked = []
    def guard(route):
        request = route.request
        if 'supabase.co' in request.url and request.method not in ('GET', 'HEAD', 'OPTIONS'):
            blocked.append(request.method)
            route.abort()
        else:
            route.continue_()
    page.route('**/*', guard)
    page.goto(args.url, wait_until='domcontentloaded')
    page.locator('button h3:visible').first.wait_for(timeout=60000)
    page.wait_for_function('''() => [...document.images].filter(image => image.src.includes('/assets/')).every(image => image.complete && image.naturalWidth > 0)''', timeout=60000)
    results = []
    for width in ([1440] if args.baseline else [1440, 1536, 1920, 1024, 390, 320]):
        page.set_viewport_size({'width': width, 'height': 1000})
        for dark in ([True] if args.baseline else [True, False]):
            page.evaluate('(dark) => document.documentElement.classList.toggle("dark", dark)', dark)
            for compact in ([False] if args.baseline else [False, True]):
                if compact:
                    page.get_by_role('button', name='Compact', exact=True).click()
                for scale in ([1] if args.baseline else [1, 1.25, 2]):
                    page.evaluate('(scale) => document.documentElement.style.fontSize = `${16 * scale}px`', scale)
                    page.evaluate('() => new Promise(requestAnimationFrame)')
                    measured = page.evaluate(MEASURE)
                    lanes = page.evaluate(LANE_MEASURE)
                    assert measured, 'No visible deal cards measured'
                    assert lanes, 'No visible lane headers measured'
                    failures = [c for c in measured if c['issues']]
                    lane_failures = [lane for lane in lanes if lane['issues']]
                    results.append({'width': width, 'dark': dark, 'compact': compact, 'textScale': scale, 'cards': len(measured), 'lanes': len(lanes), 'failures': failures, 'laneFailures': lane_failures})
                    if width == 1440 and dark and not compact and scale == 1:
                        page.locator('button h3:visible').first.scroll_into_view_if_needed()
                        page.screenshot(path=str(out / ('before.png' if args.baseline else 'after.png')))
                page.evaluate('document.documentElement.style.fontSize = "16px"')
                if compact:
                    page.get_by_role('button', name='Full cards', exact=True).click()
    (out / 'results.json').write_text(json.dumps(results, indent=2))
    print(json.dumps({'configurations': len(results), 'cardChecks': sum(r['cards'] for r in results), 'laneChecks': sum(r['lanes'] for r in results), 'failedChecks': sum(len(r['failures']) + len(r['laneFailures']) for r in results), 'sampleFailures': next((r['failures'][:3] + r['laneFailures'][:3] for r in results if r['failures'] or r['laneFailures']), []), 'blockedMutations': blocked, 'artifacts': str(out)}, indent=2))
    browser.close()
    assert not any(r['failures'] or r['laneFailures'] for r in results), 'Card/lane layout regression; see results.json'
