# LeadPulse P0 card identity repair

Status: Pat authorized P0 implementation in chat, using the supplied Folk dashboard as a row-uniformity reference. Local only; no deploy or CRM writes.

## Scope
- Fix timing badge/contact overlap and clipped company identity in DealCardContent.
- Preserve contact-first semantics, missing-contact copy, existing logo/initial fallback, colors, body, workflow, and Open/Move wrappers.
- Put timing on a dedicated row; provide predictable identity width. Protect company from being displaced by long role text.
- Exclude lane header redesign, new workflows, global reskin, schema/data changes.

## Baseline
- Branch: clay-editorial-action-sheet, HEAD f41cf7d.
- Existing untracked sales-control components, migration, motion bundle and unrelated plan are out of scope and must remain untouched.

## Acceptance and verification
1. Browser geometry regression fails before fix for narrow desktop cards: timing must be below identity and never intersect name/company.
2. Company readable with missing contact; long Thai/English identity wraps/truncates deliberately without escaping its card. Full strings remain available through card opening/title.
3. Verify full/compact at desktop/mobile and enlarged text, light/dark.
4. Preserve card-wide Open and separate Move/drag controls; no live mutation tests.
5. Run component suite, full tests, TypeScript and production build. Inspect real local screenshot.

## Execution
- Read component, callers, global CSS and relevant Next guide.
- Establish browser RED test, patch component only, re-run GREEN.
- Add/adjust component regression checks for identity content.
- Report local preview and verified output; production remains unchanged.

## Verified result
- Browser RED: Mello Vegan company width 3.67px in a 172px card; timing shared identity row.
- Component GREEN: company and role independent; full identity labels preserved with title text.
- Expanded browser stress RED at 200% text exposed existing 2xl 150px lane floor and mobile Move contention. P0 repair includes rem-based 12.5rem lane floor and wrapping mobile/identity rows; no lane-header redesign.
- Final browser geometry: 72 configurations, 9,192 card checks, zero failures. Viewports 320/390/1024/1440/1536/1920, light/dark, full/compact, root text 100/125/200%. Mobile geometry covers current Outreach lane; desktop covers all loaded cards.
- 77 tests passed; TypeScript and production build passed.
- Real read-only smoke: desktop/mobile Open correct record, mobile Move opens picker without detail, pointer drag cancelled with Escape. No CRM mutations attempted.
- Separate existing issue observed: DnD config only uses PointerSensor despite generic keyboard instructions. Keyboard pickup support is not part of this visual repair.
- Live local production preview: http://localhost:3001/deals. No deployment. Existing port-3000 dev process left untouched after it stopped responding.
- Actual screenshots: /Users/pat/.hermes/profiles/jarvis/cache/leadpulse-p0-verified/desktop.png and mobile.png.
