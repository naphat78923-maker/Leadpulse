# LeadPulse Night Desk 2.0 Sliced Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Improve the commercial polish and action-first speed of the LeadPulse Deal Action Board through small, independently reviewable slices, without changing CRM data, workflow rules, or explicit Save behavior.

**Architecture:** Preserve the approved warm night-desk identity and fixed mascot system. Concentrate the first redesign on `/deals`, where layout density currently delays the first actionable card. Each slice has its own visual checkpoint and can stop without requiring the later slices.

**Tech Stack:** Next.js 16.3.1 App Router, React 19, TypeScript, Tailwind CSS v4, Vitest, Testing Library, browser-based responsive verification.

---

## Product boundary

This plan refines the existing product. It does not expand LeadPulse into a generic CRM.

Preserve:
- Action-first deal lanes and lane validation.
- Pipeline stage as a separate concept from workflow action.
- Explicit Save, spinner, server confirmation, toast, green success ring, and undo.
- Warm cocoa dark mode, warm off-white text, grape action identity, mint success, ochre attention.
- Approved fixed PNG mascot family and mascot-job rules.
- Existing Supabase schema, queries, and CRM mutation behavior.
- The current Today screen as the visual north star.

Out of scope:
- Multi-tenancy, billing, authentication changes, native mobile packaging, onboarding, logo replacement, or pricing.
- New CRM fields, schema migrations, scoring-model changes, or lane-rule changes.
- Global navigation redesign or a bottom navigation bar.
- Deleting `public/assets/deal-lanes-hero.png`; the initial slice only stops rendering it on the operational board.
- Broad visual rollout to every route before the redesigned Deals board is approved.

Scope exception:
- Slice 1 is an intentional cross-app contrast-safety patch because the shared dark tokens are consumed across LeadPulse. It may change text color on other routes, but it must not change their layout, typography, workflow, or component structure.

## Measured baseline

Live production measurements from 2026-08-28:
- Mobile `390 × 844`: the first actionable deal starts at approximately `y=1031`.
- Desktop `1440 × 900`: the first visible deal starts at approximately `y=830` and is about 217px tall.
- Current mobile deal card height is about 186px.
- Dark-mode contrast findings:
  - `#706A5E` muted-soft on `#17120E`: 3.46:1.
  - `#D9543F` error text on `#262019`: 4.06:1.
  - Dark teal on the mint-tinted Won surface: approximately 1.35–1.60:1.

Final target:
- Mobile first actionable card begins at `y<=650` and its complete standard card remains visible above the usable viewport bottom.
- Desktop first actionable card is fully visible at `1440 × 900`.
- Default mobile card height is `<=150px`; compact mode is `<=88px`.
- Normal-size text reaches at least 4.5:1 contrast.

Measurement fixture for every before/after comparison:
- View: `Action board`.
- Attention filter: `All`.
- Search: blank.
- Product and priority: `All`.
- Secondary filters: collapsed.
- Compact mode: off.
- Data-hygiene review queue: closed.
- Mobile lane: the named lane containing the representative fixture deal; record the lane and deal ID in the review package.
- Measure the same deal with the same DOM selector before and after each slice. If production data changes, use a stable local fixture rather than silently changing the measured deal.

## Delivery rules

1. Implement only one slice at a time.
2. Run the slice-specific tests and the shared verification gate.
3. Capture desktop and mobile screenshots.
4. Stop for Pat’s visual approval before starting the next slice.
5. One slice equals one focused commit after the dirty-worktree safety check is resolved.
6. Do not deploy to production without explicit approval.
7. Do not include unrelated existing changes in any slice commit.

---

## Slice 0: Protect current work and establish the baseline

**Objective:** Ensure the redesign cannot overwrite the substantial uncommitted LeadPulse work already on `main`, and preserve objective before-state evidence.

**Files:**
- No application files changed.
- Reference only: `.hermes/plans/2026-08-28_091913-leadpulse-night-desk-redesign-slices.md`

**Step 1: Inspect the current worktree**

Run:
```bash
git status --short
git diff --stat
git branch --show-current
```

Expected:
- Branch is `main` unless Pat has moved it.
- Existing modified/untracked files are listed before redesign work begins.

**Step 2: Choose a safe implementation workspace**

The dirty work is not independent of this redesign. The current `src/app/deals/page.tsx`, `src/utils/deal-board.ts`, and their tests already contain Do now filters, review handling, due-versus-Strength hierarchy, mobile Move behavior, and natural-height board fixes that later slices depend on. A worktree created from the current committed `HEAD` would omit those prerequisites.

Do not create a branch, stash, commit, or worktree automatically. Present the live status to Pat and agree on the exact baseline. Recommended sequence:
1. Finish and verify the current data-hygiene, Do now, and board-card work.
2. Commit that work as a focused named baseline after Pat approves the file boundary.
3. Create the Night Desk redesign branch/worktree from that exact baseline commit.

If Pat does not approve a baseline commit, stop. Do not continue in place across the overlapping Deals and board-utility files.

**Step 3: Verify the current baseline**

Run:
```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Record any pre-existing failures. Do not attribute baseline failures to the redesign.

**Step 4: Capture before screenshots**

Capture `/deals` at:
- `390 × 844`, dark mode.
- `1440 × 900`, dark mode.
- `390 × 844`, light mode.

Also capture `/` at `390 × 844` as the reference for the approved Today visual language.

**Step 5: Measure first-action position**

Using the measurement fixture above, record the representative deal card’s full bounding rectangle at both target sizes, including `top`, `bottom`, `height`, and the usable viewport bottom after safe-area or persistent navigation space.

**Slice 0 acceptance criteria:**
- Existing work is preserved.
- The redesign baseline includes the current Do now, review, card-hierarchy, Move, and board-layout prerequisites.
- Baseline test state is recorded honestly.
- Before screenshots exist.
- No application file changed.

**Stop/go checkpoint:** Pat confirms the safe workspace before Slice 1.

---

## Slice 1: Dark-mode contrast safety

**Objective:** Fix the objectively failing shared dark-mode text states without changing layout or product behavior. This is an intentional cross-app accessibility patch, not a cross-app redesign.

**Files:**
- Modify: `src/app/globals.css:79-114`
- Modify after visual approval: `docs/visual-system-spec.md:40-70`

**Step 1: Add a contrast verification note or script for the exact token pairs**

No package dependency is required. Use a small one-off Node/Python calculation during verification for:
- Normal text on canvas.
- Normal text on cards.
- Error text on cards.
- Won text on the mint-tinted surface.

**Step 2: Update dark-mode tokens only**

Proposed starting values:
```css
.dark {
  --color-clay-muted-soft: #918b7f;
  --color-clay-error: #e76f5b;
  --color-clay-teal: #7fc9a8;
}
```

Keep the existing canvas, surface, card, ink, body, muted, lavender, ochre, and mint values.

**Step 3: Verify semantic states visually**

Inspect:
- Deals overdue pills, dates, and card markers.
- Won stat card.
- Today overdue copy.
- Disabled/secondary metadata.
- Activity call/create states.
- Analytics mint success/value states.
- LaneGateModal and ReviewFixModal.
- Light mode, which must remain unchanged.

**Step 4: Run the shared verification gate**

Run:
```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

**Slice 1 acceptance criteria:**
- All normal-size dark-mode text is at least 4.5:1 against its actual surface.
- Won reads as successful, not disabled.
- Error remains visually distinct from ochre and mint.
- Today, Deals, Activity, Analytics, LaneGateModal, and ReviewFixModal have dark-mode smoke screenshots.
- No spacing, typography, layout, workflow, or data behavior changes.
- Light mode has no regression.

**Stop/go checkpoint:** Pat reviews dark-mode screenshots before layout work starts.

---

## Slice 2: Compress the Deals page shell

**Objective:** Remove marketing-style duplication from the operational board and reclaim vertical space before touching filters or cards.

**Files:**
- Modify: `src/app/deals/page.tsx:453-498`
- Reference: `public/assets/deal-lanes-hero.png` (do not delete)
- Update after approval: `docs/visual-system-spec.md:149-166`

**Step 1: Preserve existing board behavior with a baseline test run**

Run:
```bash
npx vitest run src/utils/deal-board.test.ts
```

Expected: existing board behavior tests pass.

**Step 2: Replace the repeated title treatment**

Use one operational heading:
- Eyebrow: `Deals`
- Heading: `Action board`
- Optional desktop subtitle: `One deal, one next action.`
- Hide the explanatory subtitle on small mobile screens.

Keep the `New deal` control and add `aria-label="New deal"` when the visible label is hidden.

**Step 3: Stop rendering the brand banner**

Remove the banner block that renders:
- `Win · Lost · Follow up`
- `One deal, one next action.`
- `/assets/deal-lanes-hero.png`

Do not delete the asset in this slice. This is a reversible operational-layout decision.

**Step 4: Convert the four stat cards to one quiet strip**

Show four compact values:
- Active
- Overdue
- Needs review
- Won

Requirements:
- Hairline separators rather than four large slabs.
- Overdue and Needs review remain tappable focus controls.
- No large colored panels.
- Horizontal overflow on small screens gets a visible fade or affordance.
- `Due today` remains available as an attention chip, and `Parked` remains available as a lane count; they are intentionally demoted from the summary rather than removed.

**Step 5: Keep view tabs compact**

Retain `Action board`, `Closed`, and `Table`, but reduce the surrounding vertical margin. Do not change their behavior.

**Step 6: Measure the intermediate result**

At the same target viewports, record:
- Top of the Do now section.
- Top of the first lane selector.
- Top of the first deal.

**Step 7: Run the shared verification gate**

**Slice 2 acceptance criteria:**
- The decorative banner no longer appears on `/deals`.
- Heading/positioning copy is not repeated.
- The four new summary values remain visible: Active, Overdue, Needs review, and Won.
- Due today remains one-tap available as an attention chip, and Parked remains visible as a lane count.
- Active filters still work.
- At `390 × 844`, the representative first-deal position improves by at least 200px from the `y=1031` baseline or reaches `y<=800`, whichever is stricter for the preserved fixture.
- No card or filter redesign is bundled into this slice.

**Stop/go checkpoint:** Pat approves the compressed shell before controls are changed.

---

## Slice 3: Compact the Do now controls

**Objective:** Keep high-frequency filters immediately available while hiding secondary controls until needed, so the first deal becomes reachable within the first mobile screen.

**Files:**
- Create: `src/components/DealBoardFilters.tsx`
- Create: `src/components/DealBoardFilters.test.tsx`
- Modify: `src/app/deals/page.tsx:500-639`
- Reuse without behavior changes: `src/utils/deal-board.ts`

**Step 1: Write failing component tests**

Cover:
- Attention filters display their counts.
- Active attention filter exposes `aria-pressed=true`.
- Search input calls its controlled callback.
- Mobile `Filters` button exposes `aria-expanded`.
- Product and priority controls are hidden while collapsed and available when expanded.
- Active secondary filters show a count and remain visible when the panel is collapsed.
- Clear resets all filter controls through the supplied callback.

Run:
```bash
npx vitest run src/components/DealBoardFilters.test.tsx
```

Expected: FAIL because the component does not exist.

**Step 2: Extract the existing filter behavior into a controlled component**

The new component receives values, counts, product options, and callbacks. Do not duplicate sorting/filter logic; `filterAndSortBoardDeals()` remains the source of truth.

**Step 3: Implement the mobile control hierarchy**

Mobile order:
1. Attention chips: All, Overdue, Due today, Needs review.
2. Search field plus a `Filters` button.
3. Collapsible product and priority controls.
4. Active-filter count/summary when secondary filters are applied.

Desktop order:
- Attention chips.
- Search, product, and priority on one row.

**Step 4: Add overflow affordance to attention chips**

Use the existing board overflow pattern:
- Edge fade when more chips are available.
- No clipped control with no visual indication.
- Every chip reachable within one horizontal swipe.

**Step 5: Demote the drag instruction**

On mobile, replace the large pre-board instruction row with a small `How lanes work` disclosure after the lane selector or near the lane heading. Keep the full one-line instruction on desktop.

Do not persist dismissal state in this slice.

**Step 6: Run the new tests, board utility tests, and shared gate**

Run:
```bash
npx vitest run src/components/DealBoardFilters.test.tsx src/utils/deal-board.test.ts
npm test
npm run lint
npx tsc --noEmit
npm run build
```

**Slice 3 acceptance criteria:**
- At `390 × 844`, the representative first actionable deal starts at `y<=650`, and the complete standard card remains visible above the usable viewport bottom.
- Search and attention filters remain one-tap available.
- Product and priority are available within one additional tap.
- Active hidden filters cannot be mistaken for inactive filters.
- Keyboard and screen-reader state is explicit.
- Filtering and sorting results are unchanged.

**Stop/go checkpoint:** Pat reviews the above-fold mobile board before card styling changes.

---

## Slice 4: Simplify deal-card signal hierarchy

**Objective:** Make cards shorter and easier to scan while preserving all decision-critical information and explicit lane movement.

**Files:**
- Create: `src/components/DealActionCard.tsx`
- Create: `src/components/DealActionCard.test.tsx`
- Modify: `src/app/deals/page.tsx:350-450` and mobile/desktop card wrappers
- Modify: `src/app/globals.css` to prevent the mobile global `.line-clamp-2` override from expanding deal-card copy to three lines
- Modify: `src/utils/deal-board.ts`
- Modify: `src/utils/deal-board.test.ts`

**Step 1: Add pure helper tests**

Add tests for:
- `3d overdue` style timing label from a known local date.
- `Due today` label.
- No timing label for no due date.
- Additive reason for missing lane data.
- Additive reason for a high-priority slipped follow-up.
- No tautological `Why now: Follow-up is overdue` fallback.

Run:
```bash
npx vitest run src/utils/deal-board.test.ts
```

Expected: new tests fail before helper implementation.

**Step 2: Move timing/reason derivation into pure utilities**

Keep the score model untouched. The card should consume derived display data instead of rebuilding rules inline.

**Step 3: Write failing DealActionCard tests**

Cover:
- Due cards show timing and do not show Strength.
- No-due cards may show Strength with `Commercial potential, not urgency` context.
- Client name appears once.
- Product/stage metadata does not repeat the client name.
- Ordinary overdue cards omit a redundant Why now line.
- A real additive reason is rendered.
- Compact mode has only the intended fields.
- The card exposes an accessible Open action.
- A parent harness can render Move as a sibling action without nesting one button inside another.
- Clicking Move does not invoke Open, and clicking Open does not invoke Move.

**Step 4: Implement the presentational component**

`DealActionCard` receives `onOpen`, but not `onMove`. The page composes Move as a sibling control on mobile and retains the existing gated drag/move path on desktop. Do not place an interactive control inside the card-wide Open button.

Default card order:
1. Timing pill or `No due date` plus optional Strength.
2. Client name.
3. Product and stage metadata.
4. Additive reason only when available.
5. Next action, maximum two lines.
6. Compact footer with priority, date, and deal value when present.

Required default-card information is: client, product, pipeline stage, next action when present, priority, and follow-up timing/date. Value is shown only when non-null. Lane-specific sample/nudge detail may appear only when it adds information not already supplied by the lane heading or additive reason.

**Step 5: Restore the approved urgency treatment**

Use:
- Neutral card border.
- Restrained left-edge urgent marker.
- Timing pill.

Do not use a full red outline on every overdue card.

**Step 6: Integrate the Move action without changing gate behavior**

The Move control must call the existing lane-move/gate path. It must not auto-save or bypass required fields.

**Step 7: Verify card dimensions**

Target:
- Standard mobile fixture `<=150px`: one-line client, one-line metadata, two-line next action, and no additive reason.
- Compact card `<=88px`.
- Touch targets `>=44px`.
- Two-line names/actions end at word boundaries with `word-break: normal` and an appropriate overflow-wrap fallback.

Verify three fixtures rather than one convenient card:
1. Standard: one-line client, normal metadata, two-line action.
2. Additive reason: overdue plus a genuine extra reason.
3. Stress: long Thai/English company name and long next action.

The additive-reason and stress fixtures may exceed 150px when necessary to preserve required information and 44px touch targets, but they must not clip, split grapheme clusters, or create horizontal overflow. The existing global mobile rule that changes `.line-clamp-2` to three lines must be removed or bypassed with a component-specific two-line utility.

**Step 8: Run component, utility, and shared tests**

Run:
```bash
npx vitest run src/components/DealActionCard.test.tsx src/utils/deal-board.test.ts
npm test
npm run lint
npx tsc --noEmit
npm run build
```

**Slice 4 acceptance criteria:**
- One primary state signal per card.
- No duplicate client name.
- No due/Strength conflict.
- No tautological Why now copy.
- Open and Move are sibling actions with no nested interactive element or cross-trigger.
- Move still opens the correct gated flow.
- Opening a card still opens the correct detail.
- Standard and compact target heights are met without hiding required information; documented stress cases remain readable without overflow.

**Stop/go checkpoint:** Pat approves normal and compact card screenshots before visual-system cleanup.

---

## Slice 5: Align Deals typography and primary actions

**Objective:** Make the approved Deals screen internally consistent without yet reskinning every LeadPulse route.

**Files:**
- Modify: `src/app/globals.css:17-77, 174-202, 262-340`
- Modify: `src/app/deals/page.tsx`
- Modify: `src/components/LaneGateModal.tsx:282-292`
- Modify: `src/components/ReviewFixModal.tsx:227-233`
- Create: `src/components/LaneGateModal.test.tsx`
- Create: `src/components/ReviewFixModal.test.tsx`
- Do not modify yet: `src/app/layout.tsx`

**Step 1: Define explicit semantic action roles**

Deals scope:
- Primary action: the existing accessible grape `#7B5CD6` with white text; its measured contrast is approximately 4.83:1.
- Success confirmation: mint.
- Warning: ochre.
- Urgent/error: accessible coral/red.
- Secondary action: warm card/outline treatment.

Do not make green the generic brand/action color.

Add one semantic token instead of another hardcoded near-duplicate purple:
```css
--color-clay-action: #7b5cd6;
```

**Step 2: Write failing modal safety tests**

Cover both LaneGateModal and ReviewFixModal:
- Confirm invokes the supplied callback exactly once.
- Missing or invalid required fields prevent confirmation.
- Saving state disables repeated submission and shows immediate progress.
- Cancel remains a separate action.
- Choosing a lane destination does not auto-save.
- Review fixes submit only the explicitly supplied fields required by the flagged reasons.

Run:
```bash
npx vitest run src/components/LaneGateModal.test.tsx src/components/ReviewFixModal.test.tsx
```

Expected: FAIL before the safety coverage and shared action treatment exist.

**Step 3: Add one shared primary action class for the Deals flow**

Use it for:
- New deal.
- Move deal confirmation.
- Save fix confirmation.

Preserve immediate loading spinner, disabled state, server-confirmed success, toast, and success ring.

**Step 4: Use operational sans typography on Deals**

Use DM Sans through the existing font variable/class for:
- Deals page heading.
- Section headings.
- Controls and card copy.

Do not use Lustria on the operational board. Lustria remains on the Today briefing and hero greeting.

**Step 5: Verify focus, hover, active, disabled, and loading states**

Every state must work in light and dark mode. Focus rings must not depend on color alone.

**Step 6: Run modal tests and shared verification**

Run:
```bash
npx vitest run src/components/DealDetail.test.tsx src/components/LaneGateModal.test.tsx src/components/ReviewFixModal.test.tsx
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Also verify LaneGateModal and ReviewFixModal visually in light and dark mode; automated behavior coverage does not replace state-by-state visual review.

**Slice 5 acceptance criteria:**
- Deals has one primary-action treatment.
- The action treatment uses the single `--color-clay-action: #7b5cd6` token with white text.
- Green/mint is reserved for successful outcomes and save confirmation.
- Lustria no longer appears on the operational board.
- Today retains its approved briefing typography.
- No save or lane-gate behavior changes.
- Modal safety tests prove validation, single submission, loading, cancel, and no auto-save behavior.

**Stop/go checkpoint:** Pat approves Deals as the reference screen before any system-wide rollout.

---

## Slice 6: Responsive, accessibility, and documentation closeout

**Objective:** Prove the redesign works across target devices and leave an implementation-ready visual reference.

**Files:**
- Modify only as needed from QA findings: `src/app/deals/page.tsx`
- Modify only as needed: `src/components/DealBoardFilters.tsx`
- Modify only as needed: `src/components/DealActionCard.tsx`
- Modify: `src/app/globals.css`
- Modify: `docs/visual-system-spec.md`
- Modify: `.hermes/design-briefs/2026-08-27_teardown-redesign.md` to link to the approved replacement direction

**Step 1: Add reduced-motion handling**

Ensure card landing, mascot motion, and active-scale effects respect `prefers-reduced-motion: reduce`.

**Step 2: Run keyboard-only review**

Verify:
- New deal.
- View tabs.
- Attention filters.
- Search and secondary filters.
- Lane selector.
- Deal open.
- Move action.
- Modal cancel/save.

No keyboard trap, invisible focus, or ambiguous accessible name.

**Step 3: Run target viewport review**

Required screenshots:
- `390 × 844`, dark and light.
- `430 × 932`, dark.
- `768 × 1024`, dark.
- `1440 × 900`, dark and light.

Required assertions:
- Mobile representative first deal begins at `y<=650`, and the complete standard card remains visible above the usable viewport bottom.
- Desktop first deal is fully visible at `1440 × 900`.
- No clipped filters without a scroll affordance.
- No horizontal page overflow.
- Long Thai/English company names wrap at word boundaries.

**Step 4: Run complete quality gate**

Run:
```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Expected: all pass, or any pre-existing baseline failure is clearly separated from redesign regressions.

**Step 5: Update the visual-system specification**

Document:
- Approved contrast-safe dark tokens.
- Operational DM Sans vs briefing-only Lustria boundary.
- Purple action vs mint success semantics.
- Left-edge urgency treatment.
- Deals above-fold acceptance metrics.
- The Deals banner is no longer part of the working surface.
- Fixed mascot family remains unchanged.

**Step 6: Produce an old/new review package**

Include:
- Before and after mobile screenshots.
- Before and after desktop screenshots.
- Measured first-card `top`, `bottom`, and `height`, plus usable viewport bottom, for the recorded fixture deal and selector.
- Test/build output.
- Known issues or intentionally deferred work.

**Slice 6 acceptance criteria:**
- Every named acceptance criterion is verified with real browser and command output.
- Documentation matches the shipped screen.
- No unrelated file is committed.
- Production deployment has not occurred without explicit approval.

**Stop/go checkpoint:** Pat decides whether to deploy the Deals redesign and whether to plan a separate cross-app rollout.

---

## Post-deployment product checkpoint

This checkpoint happens only after Pat explicitly approves and performs or authorizes a production deployment. It does not permit deployment by this plan.

Run the redesigned Deals board during seven real working days and record:
- Whether Pat can identify the next deal without vertical scrolling.
- Whether the correct deal can usually be opened or moved within roughly 10 seconds.
- Whether the Do now board catches missed follow-ups rather than merely reorganizing known work.
- Whether product and priority filters are used enough to justify their permanent place.
- Whether compact mode provides real value or adds an unnecessary preference.

Use the findings to decide whether to retain the screen unchanged, make a focused Deals correction, or plan a separate cross-app rollout. Do not infer commercial effectiveness from pixel targets alone.

---

## Deferred follow-on slices, not approved by this plan

Plan separately after Deals is proven:

1. **Cross-app typography and CTA rollout**
   - Potential files: `src/app/layout.tsx`, Activity, Contacts, Companies, Meetings, Analytics, Retention, Signals, Nudges, shared modal components.
   - Read before coding: `node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md` and `node_modules/next/dist/docs/01-app/01-getting-started/13-fonts.md`.

2. **Mobile navigation study**
   - Validate whether Today, Activity, Deals, Contacts, and More deserve a five-tab bottom navigation.
   - Do not copy Pipedrive’s navigation without usage evidence.

3. **Commercial brand shell**
   - Ownable LeadPulse mark, workspace identity, login/onboarding, empty-demo state, and pricing presentation.

4. **Commercialization infrastructure**
   - Multi-tenant authorization, billing, migrations, product analytics, support, export, and reliability.

These are separate product decisions, not visual cleanup tasks.

---

## Overall definition of done

The initial Night Desk 2.0 redesign is complete only when:
- The Deals board is visibly action-first at mobile and desktop target sizes.
- The representative first actionable deal begins at `y<=650`, and its complete standard card is visible above the usable mobile viewport bottom.
- Dark-mode small text passes contrast.
- Cards communicate one primary state and preserve required details.
- Open and Move remain separate accessible actions with no cross-trigger.
- Explicit Save and lane validation are unchanged.
- Today remains visually intact.
- Pat approves each slice before the next begins.
- Full tests, lint, typecheck, and build are verified.
- Production deployment occurs only after explicit approval.
