# LeadPulse P1 uniform action-board hierarchy

Status: Pat authorized P1 implementation in chat after approving and deploying the P0 card repair. Local first; production deploy requires a separate explicit trigger.

## Product reference
- Use the supplied Folk dashboard as a reference for uniform rows and predictable identity hierarchy.
- Preserve LeadPulse's warm night-desk design, fixed mascot PNGs, contact-first semantics, action-first body, explicit missing-contact state, and drag/Open/Move behavior.

## Scope
1. **Missing-contact hierarchy**
   - Keep an explicit accessible `Contact not identified` state.
   - Reduce it from the dominant large identity heading to a quiet warning label.
   - Make the known company the primary readable identity when no person is linked.
   - Keep stored company logo / `?` fallback behavior unchanged.
   - Keep named contacts primary and retain role/company rows.
2. **Identity consistency**
   - Keep long Thai/English contact names bounded to a deliberate two-line preview with a title containing the full label.
   - Keep company and role in separate rows; no mixed role/company line.
3. **Lane-header uniformity**
   - Separate lane title/mascot from count/value stats so they cannot collide.
   - Let description/stat content reflow at narrow lanes and enlarged text.
   - Keep the existing lane descriptions and criteria, with no workflow changes.

## Explicit non-goals
- No schema/data changes, new workflow, scoring changes, global reskin, lane reorder, or DnD implementation changes.
- No CRM writes. No production deploy in this slice unless Pat says `deploy` after review.

## Acceptance criteria
- Missing-contact cards show a small explicit warning, then a readable company identity.
- Named-contact cards still lead with the named contact; no company logo replaces a named avatar.
- Long Thai/English identity previews do not overlap, escape or squeeze company identity; full labels remain available via title/open.
- Every desktop/mobile lane header keeps title, description, criteria and count/value inside its lane at 320, 390, 1024, 1440, 1536 and 1920 widths, light/dark, full/compact and 100/125/200% root text.
- Card-wide Open, adjacent Move and drag affordances remain usable and siblings remain separate.
- Run focused tests, full tests, TypeScript, production build, browser geometry and read-only interaction smoke.

## Execution order
1. Add failing component and browser assertions.
2. Implement minimum component and lane-header changes.
3. Run focused RED -> GREEN, full suite, TypeScript/build.
4. Inspect real local screenshots and report; do not deploy without a later explicit request.

## Verified result
- Component RED: missing-contact test could not find company as heading while the warning was still the h3.
- Component GREEN: 6 focused tests passed; missing-contact warning is a small explicit paragraph and stored company is the primary h3.
- Browser RED: pre-P1 build exposed no measurable lane-header structure.
- Final browser geometry: 72 configurations, 9,192 card checks, 360 lane-header checks, zero failures. Viewports 320/390/1024/1440/1536/1920, light/dark, full/compact, root text 100/125/200%.
- Full suite: 77 tests passed; TypeScript and production build passed.
- Read-only interaction smoke: desktop/mobile Open, mobile Move without opening detail, and pointer drag cancellation passed. No CRM mutations attempted.
- Clean screenshot: `/Users/pat/.hermes/profiles/jarvis/cache/leadpulse-p1-final/after.png`. Interaction screenshots: `/Users/pat/.hermes/profiles/jarvis/cache/leadpulse-p1-verified/desktop.png` and `mobile.png`.
- Production deployment: `dpl_J3A3sBVKS8XzMMxFL1YqcBcycN89` is Ready at `https://leadpulse-one-ashen.vercel.app`; `vercel inspect` confirmed the canonical alias, `vercel curl` read back `/deals`, and the served production JavaScript contained `data-card-contact-warning`, `data-lane-header`, `data-lane-stats`, and `min-w-50`.
