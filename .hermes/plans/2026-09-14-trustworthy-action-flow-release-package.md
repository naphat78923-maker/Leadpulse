# Trustworthy Action Flow — release package (slices 0–6)

**Branch:** `feat/trustworthy-action-flow` → fast-forwarded onto `main`, deployed to production.
**Deployed revision:** `937ad60` (Vercel build log: `Cloning … (Branch: main, Commit: 937ad60)`).
**All wheels verified by served-bundle probe**, not by deployment status alone.

## Commits (production, oldest first)

| Commit | Slice | What |
|---|---|---|
| `bbdfb90` | 1 | Deal editor derives its form from the latest record and writes only what changed |
| `5366e75` | 2 | An outreach attempt, a client reply and an internal note are separate events |
| `c765869` | 0 | Slice-0 implementation map + the nudge-counting policy note |
| `210ea13` | 3 | One authoritative deal schedule, set from the log form |
| `d88e170` | 4 | The card answers why this, why now, and what next |
| `855437a` | 5 | Close a deal truthfully and stop manufacturing orders |
| `2021d7f` | — | Records Pat's **v0** decision on nudge counting |
| `0d2a50d` | 6 | A half-saved interaction stays visible and retryable |
| `937ad60` | 6 | End-to-end journey harness on an in-memory data layer |

## Changed files (`git diff --stat origin/main~9..HEAD`)

New: `src/utils/deal-edit-draft.ts`, `src/utils/interaction-event.ts`, `src/utils/deal-schedule.ts`,
`src/utils/business-time.ts`, `src/utils/deal-close.ts`, `src/components/DealCardPrimaryAction.tsx`,
`src/app/deals/journey.e2e.test.tsx` (+ one test file per module).
Modified: `src/components/DealDetail.tsx`, `src/components/LogInteractionModal.tsx`,
`src/components/LaneGateModal.tsx`, `src/components/ExitDealModal.tsx`, `src/components/exit-deal-helpers.ts`,
`src/components/DealCardContent.tsx`, `src/utils/deal-workflow.ts`, `src/utils/deal-board.ts`,
`src/utils/deal-card.ts`, `src/app/deals/page.tsx` (+ their test files).

## Gates, with actual output

```
npx tsc --noEmit                  → clean
npx vitest run                    → Test Files 38 passed (38) | Tests 425 passed (425)
                                    baseline on origin/main was 327 tests / 32 files
npm run build                     → exit 0, 16 routes
eslint (each touched file)        → error count identical to its HEAD copy (no new issues)
served bundle (production)        → 11 change literals PRESENT, 3 control literals PRESENT,
                                    'first order recorded' GONE
rendered board (local build)      → 24 cards, 24 next-action blocks, 24 primary actions,
                                    0 nested inside a card button
mobile 390px                      → documentElement.scrollWidth === clientWidth (0 px overflow)
search escape (local, live data)  → "1 deal matches "TEST" outside these filters" →
                                    "Searching every deal for "TEST" — 1 matching, 169 in total"
journey harness (in-memory)       → 6/6 pass, including the half-save retry and the stale write
```

## Migrations

**None proposed and none applied** by this work. The schema was not touched; no `comp_status` /
`paid_test_date` migration from an earlier session was applied either. No backfill, no reclassification.

## Production data

**Nothing was written, reset, or mutated.** The live Won test record was not read for fixtures and
not touched. The Won *write* path was deliberately not exercised against live data: to prove the guard
without mutating a deal the close dialog was driven with an empty post-sale action and confirmed
**blocked by validation**, then cancelled. The write path itself is covered by unit + harness tests,
not by a live close.

## Defects found during slice 6 (fixed before release)

1. **Half-save looked like success on the detail surface.** `DealDetail` closed the log modal from
   inside `onSave`, so a failed deal update unmounted the modal's error + retry UI and the user got a
   "Touch logged" toast with no error. Fixed in `0d2a50d`: the modal owns its completion and only
   reports success once the whole action is durable. The board path never had the bug; the unit tests
   missed it because they mock `onSave` without unmounting — the journey harness caught it.
2. **My own module bug caught by its test:** the default "action complete" resolution was clearing a
   *parked* deal's revisit date. The action resolution is now scoped to the Won exit.

## Rollback

- **Code:** `git revert --no-edit 937ad60 0d2a50d` (or reset `main` to `2021d7f`) and push; the
  Vercel project is git-connected, so production returns to the previous revision in ~30 s.
  The revision before this work is `237e3f4`.
- **Data:** no rollback needed — no production rows were written by this work. If a future change
  writes test data, it needs its own approved cleanup, not an ad-hoc deletion.
- **Policy:** the nudge ladder stays `v0-cumulative-sends`. Reverting the counting policy is a
  one-constant change (`ACTIVE_CHASE_POLICY_ID`) and is *not* part of any rollback here.

## Independent review (slice 6 requirement)

Two read-only reviewers audited the branch against the acceptance criteria. Their findings were
reproduced in the code before any change; nine were real and are fixed in `44787d5`.

**Fixed — major**

| Finding | Consequence before the fix |
|---|---|
| A sample-status edit was dropped when the lane did not move (`buildDealEditPayload` wrote it only inside `if (laneChanged)`) | Editing sent→received on an existing Sample deal produced "No changes to save" and lost the edit |
| The drag gate fabricated a client reply from "No response" and stamped the row inbound | The board asserted engagement that never happened — the contradiction the modal refuses |
| The drag gate wrote the deal with an unversioned update | Two concurrent moves could silently overwrite one another |
| The Activity page decided "overdue" on the UTC day | For the first seven hours of a Bangkok day a deal was overdue on the board but absent from open loops |
| The close dialog prefilled the pipeline estimate into the order-value field | Marking won could record a sale signal for a number nobody asserted as an order |

**Fixed — minor:** undo snapshots omitted fields the writes clear; the interaction modal could be
dismissed with a half-save unresolved; the close dialog could stick on a spinner; one card printed
"Set next action" twice; the reschedule move claimed a date change it did not make; the business
calendar had two implementations; one test only passed at UTC+7.

**Reported, not fixed — needs a decision or a schema change**

1. **A meetings-row insert has no idempotency key.** If the insert lands server-side while the client
   sees a network failure, a full re-submit inserts a duplicate interaction (and double-counts a
   chase). The *retry* path inside the modal is safe and tested (it re-sends only the deal update);
   this is the separate "user presses Save again" case. Fixing it properly means a dedupe key or a
   uniqueness constraint — a migration, which requires Pat's approval. The client-side guard I could
   write (read-then-skip if an identical row exists) is a partial measure I did not want to ship as if
   it were the guarantee.
2. **The deal editor rebuilds its payload on every attempt,** so after a lost response that the server
   did apply, the retried journal timestamp differs and the version check reports a spurious conflict.
   The log modal avoids this by reusing one stored request; the editor should do the same.
3. **The in-memory harness flatters one branch:** its fake throws before mutating, so the
   "already applied, safe to retry" path is never exercised; `now()` is constant; and `getDeals`
   returns the live array. The harness proves the journey and the guards, not that specific retry
   branch.


- **No browser-driven journey against the app's own backend** — impossible without writing to live
  data. The harness covers the state machine and the persistence contract; it does not prove the
  rendering of a real reload after a real write.
- **Screenshots were not eyeballed** for slices 3–6 (the vision service returned 404 mid-session).
  Slice 1–2 screenshots were reviewed by eye; slices 3–5 rest on DOM measurements.
- **Keyboard-only navigation** through the new schedule and close controls was not exercised.
- Two probe artefacts, unresolved and not reproduced as defects: an `Exit · Won` eyebrow string
  check returned false while the dialog was demonstrably open, and the board search input is
  `type="search"` (the query is preserved in state and echoed in the table note; the input itself is
  not rendered in the table view).
