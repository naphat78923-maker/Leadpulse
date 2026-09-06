"""Read-only Open, Move, drag-cancel smoke checks and actual local screenshots."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

out = Path('/Users/pat/.hermes/profiles/jarvis/cache/leadpulse-p1-verified')
out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 1440, 'height': 900}, device_scale_factor=2)
    mutations = []
    def guard(route):
        r = route.request
        if r.method not in ('GET', 'HEAD', 'OPTIONS'):
            mutations.append(r.method)
            route.abort()
        else:
            route.continue_()
    page.route('**/*', guard)
    page.goto('http://localhost:3001/deals', wait_until='domcontentloaded')
    def card():
        return page.locator('button').filter(has=page.locator('h3')).filter(has_text='Open Mello Vegan').filter(visible=True)
    card().wait_for(timeout=60000)
    card().click()
    expect(page.locator('h2').filter(has_text='Mello Vegan')).to_be_visible()
    page.get_by_role('button', name='Close', exact=True).click()
    expect(page.locator('h2').filter(has_text='Mello Vegan')).to_have_count(0)
    box = card().bounding_box()
    page.mouse.move(box['x'] + box['width'] / 2, box['y'] + 20)
    page.mouse.down()
    page.mouse.move(box['x'] + box['width'] / 2 + 20, box['y'] + 40, steps=5)
    expect(page.locator('[role="status"]')).to_contain_text('moved over droppable area outreach')
    page.keyboard.press('Escape')
    page.mouse.up()
    expect(page.locator('[role="status"]')).to_contain_text('cancelled')
    page.evaluate('document.documentElement.classList.add("dark")')
    page.evaluate('document.querySelector("main").scrollTop = 520')
    page.wait_for_function('''() => [...document.images].filter(i => { const r=i.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0; }).every(i => i.complete)''', timeout=60000)
    page.screenshot(path=str(out / 'desktop.png'))
    page.set_viewport_size({'width':390,'height':844})
    card().click()
    expect(page.locator('h2').filter(has_text='Mello Vegan')).to_be_visible()
    page.get_by_role('button', name='Close', exact=True).click()
    page.get_by_role('button', name='Move Mello Vegan to another lane', exact=True).click()
    expect(page.get_by_text('Move deal', exact=True)).to_be_visible()
    expect(page.get_by_role('button', name='Edit deal', exact=True)).to_have_count(0)
    page.get_by_text('Move deal', exact=True).locator('../..').get_by_role('button').click()
    expect(page.get_by_text('Move deal', exact=True)).to_have_count(0)
    card().evaluate('(el) => { const main=document.querySelector("main"); main.scrollTop += el.getBoundingClientRect().top - 100; }')
    page.screenshot(path=str(out / 'mobile.png'))
    assert not mutations, mutations
    print(json.dumps({'desktopOpen': 'passed', 'mobileOpen': 'passed', 'mobileMoveWithoutOpeningDetail': 'passed', 'pointerDragEscapeCancel': 'passed', 'mutations': mutations, 'screenshots': [str(out/'desktop.png'), str(out/'mobile.png')]}))
    browser.close()
