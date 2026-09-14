# LeadPulse — Trustworthy Action Flow, slices 0–2

**Status:** slices 0, 1 and 2 implemented and tested on branch `feat/trustworthy-action-flow`.
Local only: nothing pushed, merged, deployed, migrated, or written to production data.
**Base commit:** `237e3f4` (= `origin/main` = the production deployment Vercel built on 2026-09-14 02:32Z, confirmed from the build log's `Cloning … Commit: 237e3f4`).
**Worktree:** `/Users/pat/Projects/LeadPulse/.worktrees/trustworthy-action-flow` (the primary checkout is 23 commits behind `main`, parked on `feat/nudge-send-gauge`, and was not touched).

## Slice 0 — Reproduce and map the real implementation

### Repository and deployed revision

| Question | Answer | Evidence |
|---|---|---|
| Owning repository | `/Users/pat/Projects/LeadPulse` (remote `naphat78923-maker/Leadpulse`) | `git status`, `git worktree list` |
| Production source | `origin/main` @ `237e3f4` | Vercel build log for the newest Production deployment: `Cloning … (Branch: main, Commit: 237e3f4)` |
| Branch under work | `feat/trustworthy-action-flow` (from `origin/main`), worktree `trustworthy-action-flow` | `git worktree add … origin/main` |
| Baseline gates | `tsc` clean; **327 tests / 32 files** passing; `npm test` = `vitest run` (`vitest.config.mts`, happy-dom) | `npx tsc --noEmit`, `npx vitest run` |

### File map (state owners, not guesses)

| Concern | File |
|---|---|
| Deal detail + editor form (Edit deal / Save) | `src/components/DealDetail.tsx` |
| Interaction form and its save path | `src/components/LogInteractionModal.tsx` |
| Post-interaction lane transition rules (pure) | `src/utils/interaction-workflow.ts` |
| Board, drag/drop, lane gate confirm | `src/app/deals/page.tsx` (drag `handleDragEnd` → `LaneGateModal` → `handleGateConfirm`) |
| Drag gate form | `src/components/LaneGateModal.tsx` |
| Lane/exit definitions, nudge ladder, send counting | `src/utils/deal-workflow.ts` |
| Record store + `refresh()` | `src/components/CrmProvider.tsx` |
| Persistence adapter | `src/lib/crm.ts` (`updateDeal`, `updateDealIfUnchanged`, `createMeeting`, `getMeetings`) |
| Types | `src/types/crm.ts` |

### Transition / data-flow map

```
DealDetail ──Log touch──▶ LogInteractionModal ──onSave──▶ CrmProvider.addMeeting ──▶ crm.createMeeting (meetings row)
                                    │                              └─▶ refresh()  → deals/meetings state replaced
                                    └──buildInteractionWorkflowUpdate──▶ crm.updateDealIfUnchanged (deals row, version-checked)
Board drag ──▶ LaneGateModal ──handleGateConfirm──▶ crm.updateDeal + addMeeting + refresh
DealDetail (Edit deal) ──persistSave──▶ crm.updateDeal  ◀── the whole-record snapshot write (the defect)
```

Stored lane values are `deals.workflow_action` (`outreach | reply | sample | testing | reschedule | parked | success`), which is exactly the UI's lane set; `deals.stage` is the separate sales stage. `outcome` in the UI maps to `meetings.outcome`; the label "outcome history" in the detail is the `deals.last_outcome` text journal (entries split on `\n---\n`), **not** the interactions list.

### Confirmed defects (each reproduced by a red test before the fix)

| # | Defect | Root cause proven in code | Owning slice |
|---|---|---|---|
| D1 | Opening Edit deal after an interaction-driven lane change showed the **old lane and old history** until reload | `DealDetail` seeded `editData` once in `useState` from the mount-time `deal` prop and never re-derived it; the edit-mode history render read `editData.last_outcome` | 1 |
| D2 | Editing one field could **revert** newer data | `persistSave` wrote a **whole-record payload** (`product, priority, value, workflow_action, nudge_stage, sample_status, next_action, draft_primary_ask, followup_date, last_outcome`) taken from that stale snapshot | 1 |
| D3 | No conflict protection on the editor path | Editor used unguarded `crm.updateDeal` while the version-checked `updateDealIfUnchanged` existed and was used only by the modal | 1 |
| D4 | **No Response blocked "Move into Waiting on reply"**, while a positive reply allowed it | `buildInteractionWorkflowUpdate` required a non-`no_response` outcome for target `reply` — the lane's meaning was coupled to a reply having happened | 2 |
| D5 | Lane choice **redefined the event**: a recorded client reply was labelled `inbound` only because the lane moved | `LogInteractionModal`: `isCustomerReply = selectedAction === 'reply' && isChangingLane` | 2 |
| D6 | Drag path and modal enforced **different rules** for the same lane move | Board gate accepted `outreach_logged`; the modal demanded an outcome | 2 |
| D7 | Board-created rows carried **no `direction`**, so a captured client reply was counted by the send ladder | `handleGateConfirm`'s `meetingToLog` omitted `direction` while the counting rule skipped only `inbound` | 2 |
| D8 | A recorded reply was not distinguishable from an unanswered chase | counting rule was `direction !== 'inbound'` with no notion of "a response was recorded" | 2 (policy-gated) |

### Isolated fixture

No production row is used as a write target. Tests build synthetic deals/meetings inline (the repo's existing convention) and the two new pure modules have their own suites. The live `TEST` deal (`…8f264b2c`, Closed Won) was **not** read for tests and was not mutated.

### Test commands (discovered, not assumed)

```
npm test                 # vitest run
npx vitest run <path>    # single suite
npx tsc --noEmit         # typecheck
npm run lint             # eslint — hundreds of pre-existing no-explicit-any errors
npm run build            # next build
npm run dev              # next dev (preview: use a free port; 3001 is often held by another server)
```

## Slice 1 — Make reads and edits agree after saves

- `src/utils/deal-edit-draft.ts` (new, pure): `dealToEditDraft` is the single source of editor defaults; `mergeDraft` lays the user's unsaved edits over the **latest** record; `detectDraftConflicts` names a field the record moved on since the user began editing it; `buildDealEditPayload` emits **only** the edited fields (plus the explicit lane move with its stage/sample fields).
- `DealDetail` now derives the form at render time from the latest record + the user's edits (no mount-time snapshot, no ref read during render), keeps a conflict notice with a "Use the latest saved values" escape, writes through the version-checked `updateDealIfUnchanged`, and treats an empty payload as a no-op (`No changes to save`) rather than a success.
- The Outcome history panel now always renders the record's journal and shows a pending entry separately, so it can never show history the deal has already left behind.

## Slice 2 — Separate outreach, replies, and nudges

- `src/utils/interaction-event.ts` (new, pure): the event kind (`outbound_attempt` / `customer_response` / `internal_note`) is chosen explicitly and is the **only** input to `direction`; `validateInteractionEvent` blocks a reply carrying no sentiment contradiction.
- `interaction-workflow.ts`: lane targets are derived per event (`laneTargetOptions`), so an outbound attempt can enter Waiting on reply with no fabricated outcome, a recorded reply can never be logged as a wait, Follow-up is reachable directly without inventing sample/testing events, and an internal note offers no journey move.
- `LogInteractionModal`: new "What happened?" control (direction is shown back to the user), lane-move radios relabelled by meaning ("Log outreach and wait for reply", "Record reply and schedule the follow-up"), event validation before any write, and the deprecated nudge-stage picker removed (nudges are derived).
- Board drag: created rows now carry an explicit direction (`outbound` for outreach/sample dispatch, `inbound` for a captured reply).
- Counting is unchanged in production behaviour: `outboundSendCountForDeal` delegates to a versioned policy whose ACTIVE value is the cumulative-sends rule already live. See the separate policy note — the reviewed alternative is implemented and tested, deliberately **not** switched on.

## Actual test output

```
npx tsc --noEmit          → clean
npx vitest run            → Test Files 34 passed (34) | Tests 376 passed (376)   [baseline 327/32]
npm run build             → see the completion report
eslint (touched files)    → error counts identical to the HEAD copy of each file (no new issues)
```

## Remaining gaps and non-verification

- **Browser evidence is not in this slice.** No screenshot, keyboard, or mobile pass was run; that is slice 6 scope.
- Slice 2's "a customer response does not increment an unanswered nudge" depends on the policy decision in `2026-09-14-nudge-counting-policy-decision.md`. Until Pat decides, the live ladder keeps its current (cumulative) meaning and untouched numbers.
- Slices 3 (one reliable next-action date), 4 (card answer), 5 (truthful close) are untouched: follow-up dates still persist only through the deal editor, and the Won flow still claims "first order recorded".
- `handleExitConfirm` and `handleUndo` in `DealDetail` still use the unguarded `updateDeal`; they were left alone to keep this change reviewable.
