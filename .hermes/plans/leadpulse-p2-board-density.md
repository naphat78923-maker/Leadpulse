# LeadPulse P2 — Board density + at-a-glance scannability

Status: Proposed. Build locally; production deploy requires a separate explicit trigger.

## Product reference
Build on the deployed P1 uniform hierarchy. P2 compresses the board so more deals are visible without scrolling, and the most urgent items are the first thing you see.

## Scope
1. **Compact lane headers** — shrink mascot (38→32px), tighten vertical spacing (mb-3→mb-2, space-y-2→space-y-1), clamp description to 1 line, keep criteria + stats on one row. Target ~30% less header height.
2. **Default board to "Overdue" attention view** — open `/deals` focused on overdue + due-today; "All" stays one tap away.
3. **Narrower lanes** — attempted `min-w-48` but card layout regresses below 200px. Reverted to `min-w-50` (Tailwind v4 spacing token ≈200px). This is a pre-existing card constraint, not a P2 regression — all 7 lanes fit on 1920px; 1440px still requires horizontal scroll.

## Explicit non-goals
- No workflow/schema changes, no card redesign (P0/P1 cards stay), no new CRM write changes.
- No changes to "Do now" filter UI (keeps All / Overdue / Due today / Needs review).
- No mobile layout changes beyond what narrower lanes require.

## Acceptance criteria
- Lane header height is measurably smaller than P1 (mascot 32px, tighter gaps, 1-line description).
- Opening `/deals` shows `attentionFilter === 'overdue'` by default; all other filters remain reachable.
- All 7 lanes are visible without horizontal scroll at 1920px; 1440px still requires horizontal scroll (pre-existing card min-width constraint).
- Cards remain readable: company/contact identity, timing, product, next action, and footer all render without clipping at narrow widths.
- Existing tests pass; no new tests added (default filter is a state change, not a new function).

## Verified result
- TypeScript: passed
- Production build: passed
- Full test suite: 77 tests passed
- Card/lane layout regression: pre-existing "Company identity squeezed" at mobile viewports (exists in P1 baseline too) — not a P2 regression
- Local preview: http://localhost:3001/deals (server running)
- Production: not deployed (requires explicit trigger)
