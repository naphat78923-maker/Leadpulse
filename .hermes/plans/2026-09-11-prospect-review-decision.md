# Prospect Review — saved review decision + next action (Slice A)

**Status:** plan for sign-off. No code, no migration, no deployment, no CRM write, no outreach.
**Date:** 2026-09-11 · Base: `491f461` (`Leadpulse-intelligence` = `origin/main` = current production source).
**Depends on:** the read-only Prospect Review screen already in production (`/prospects`).

## Problem

`/prospects` answers one question well: *which accounts deserve a closer look*. It cannot answer the
next one: *what should I do with this account, and what evidence is missing*. Nothing on the screen
survives a reload, so an hour of review produces no artifact: the same top of the list gets re-read,
and a judgement made today (this one is a duplicate, this one is out of scope) is lost and re-derived
tomorrow. Browsing does not compound. The screen is also honest that it cannot tell qualification from
matching, which means the human judgement is the valuable part and currently the only unrecorded part.

## Intended journey (one pass, end to end)

1. Open `/prospects`, filter to one archetype and one contact state.
2. Open a candidate: read why it matched, its proposed role with the evidence and reason code, known
   contact availability, and the evaluator's gaps.
3. Record a decision — **Shortlist** / **Needs research** / **Not a fit** — with a reason code from a
   closed vocabulary plus a free note, the reviewer's name, and the review date set at save.
4. For a shortlist or needs-research row, record **exactly one next action** with an owner and an
   optional due date.
5. Save explicitly: spinner → `Saved` → toast. Nothing writes on field change.
6. Come back later, filter to `Shortlisted` or `next action due`, and see what to do next without
   re-reading the list. The header shows review progress as counts.

## Scope

**In**
- One additive table, `prospect_reviews` (one row per company), **shipped with its writer in the same
  slice** (no column without its writer).
- A review panel on the candidate card, plus list-level state: a decision badge on the row, a decision
  filter, and review-progress counts derived from the rows.
- Closed reason-code vocabulary + free note; `reviewed_at` set at save; evidence note and source links.
- One next action per row: text + owner + optional due date.
- **The next action's due date is also written to the linked deal's `deals.followup_date`** (Pat,
  2026-09-11) so the action surfaces on the board he actually works from, under the guards below.
- Explicit Save with spinner, success state and toast; a failed save keeps entered values and offers
  retry; the save is recorded in the existing activity trail.
- Pure validation/labelling helpers with unit tests, migration parity file, de-identified plan.
- A flag for a questionable match or possible duplicate, recorded **on the review row** so the
  evaluator's own evidence is never silently edited by a human judgement.

**Out (non-goals for this slice)**
- No send, no draft, no suppression engine, no outreach infrastructure of any kind.
- **No company or contact record is created or modified by a review save**, and specifically no write to
  `companies.status`. The single permitted CRM write is `deals.followup_date` on an existing deal that
  belongs to the reviewed company; the review save never creates a deal, never changes `stage`,
  `nudge_stage`, or `last_outcome`, and never invents a follow-up for a company that has no deal.
- No change to the fit score, the reachability value, archetype membership, or who is a candidate.
- No country/coverage dimension (see open decision 3) and no evaluator evidence correction.
- No promotion of the local markdown pilot findings into app data — the readiness cards stay
  `not assessed` / `not started` / `not authorised`.
- No auth or login. The app has none, so the reviewer is a **self-declared label**, not a verified
  identity, and the UI says so.

## Data model (additive only)

Table `prospect_reviews`, one row per company, `unique (company_id)`, `on delete cascade`:

| column | type | notes |
|---|---|---|
| `id` | uuid pk | `gen_random_uuid()` |
| `company_id` | uuid not null unique | references `companies(id)` |
| `decision` | text not null | check in `shortlist` / `needs_research` / `not_a_fit` |
| `reason_code` | text not null | closed vocabulary, see below |
| `reason_note` | text null | required by the helper for the codes that need it |
| `criterion_ref` | text null | e.g. `<archetype_id>#2` — must resolve to a committed criterion |
| `reviewed_at` | timestamptz not null | set at save; there is no reviewer column (see decision 4) |
| `next_action` | text null | |
| `next_action_owner` | text null | required when `next_action` is present |
| `next_action_due` | date null | optional; past dates allowed and shown as overdue |
| `evidence_note` | text null | |
| `evidence_links` | text[] null | stored as text, scheme-checked `http(s)`; never fetched by the app |
| `needs_data_review` | boolean not null default false | the human flag; does not touch the evaluator |
| `created_at` / `updated_at` | timestamptz | |

**Why `criterion_ref` matters.** The standing rule from the qualification pilot is that an exclusion
must cite a contradicted committed criterion, and a requirement must never be invented mid-review. A
closed `reason_code` list plus an optional reference into the committed archetype criteria encodes that
rule in the product instead of in a promise. Recommended, and cheap: one validating helper and one test.

**Reason-code vocabulary (closed, mapped to the decision it may accompany)**

- `shortlist`: `plausible_application`, `relationship_history`, `verified_route`, `strategic_priority`
- `needs_research`: `insufficient_evidence`, `route_unverified`, `buying_process_unknown`, `identity_unconfirmed`
- `not_a_fit`: `wrong_business_type`, `no_plausible_application`, `cannot_serve_logistically`,
  `possible_duplicate`, `outside_scope_overseas_hold`, `other_contradicted_criterion`
- Every code belongs to exactly one decision; the free note never substitutes for a code, so there is
  no free-text-only rejection path.

**Vocabulary rules the helpers enforce**
- `possible_duplicate` is a *flag for review*, never an automatic merge, and the note must name the
  counterpart record. First-hand check on the pair the review flagged: two distinct rows exist, both
  `prospect`, with different industry text, so the merge decision is genuinely a human call.
- `outside_scope_overseas_hold` is a **scope hold, not a fit rejection** (delivery policy, Pat
  2026-09-11), and the panel says so next to the code.
- No code may produce a string resembling `qualified` or `cleared`. A test asserts the vocabulary and
  labels cannot contain them: shortlisting is not qualification and not permission to contact.

## Where the write path lives

- `src/utils/prospectReviewDecision.ts` — pure: vocabulary, `reasonCodesFor(decision)`, validation
  (`validateReviewDraft`), labels, `summariseReviews` (shortlisted / needs research / not a fit /
  unreviewed, computed from rows, never hardcoded), `isOverdue`.
- `src/lib/prospectReviews.ts` — the only writer: `getProspectReviews()`, `saveProspectReview()`
  (upsert on `company_id`, `reviewed_at` set at save), `clearProspectReview()`, and
  `setDealFollowupDate()` which routes through the app's own `updateDeal` with exactly
  `{ followup_date }` — no `last_outcome`, no stage, no nudge fields.
- Panel component + list state inside `src/app/prospects/page.tsx`.
- Undo: the toast carries a 5-second `Undo` action that restores the previous review row (or clears it
  if there was none) and restores the deal's previous `followup_date`. The activity trail records the
  review save as a journal entry without an `undoPayload`, so the trail never offers an undo it cannot
  honour.

**Deliberately not touched:** `CrmProvider` (its `refresh()` feeds the evaluator; the review rows are
fetched and refreshed by the `/prospects` page itself, which keeps the read-only evaluator path and the
candidate list's blast radius unchanged) and `src/utils/prospectReview.ts` / `prospectFit.ts` / the
classifier.

## Migration and security

- Additive migration with an `add table if not exists` + check constraints, applied to Supabase
  `mkyhikarlxuwvprjabbi` **only after Pat's explicit approval**, then verified by readback (table exists,
  columns and constraints present, policy present, row count as expected) and by a save made from the
  running app.
- RLS pattern: the tables the app writes from the browser today (`companies`, `contacts`, `deals`,
  `meetings`, `interactions`) each carry a single permissive `Allow all for anon` policy for `public`.
  The new table follows that pattern or browser writes fail. **This is not a security boundary**: the
  app has no authentication, so anyone with the URL and the anon key can read and write every row. The
  review table neither worsens nor fixes that, and the plan does not describe the screen as protected.
- **Pre-existing finding, not caused by this slice, surfaced by inspection:** `activity_events` and
  `account_events` have RLS **disabled** and are therefore fully exposed to the anon key. Remediation
  SQL exists (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`) but enabling RLS without policies blocks all
  access, so it is presented for Pat's decision and **not applied**. Out of scope here.

## Acceptance criteria (observable)

1. **Persists.** Save a decision, reason, next action, due date and evidence note on a candidate; reload
   `/prospects`; the same values render for that account with the same review date.
2. **Company and contact untouched.** After a review save, the company row (including `status`) is
   byte-identical and no deal or contact row was created for it. Asserted by a test on the writer's
   payload shape, then confirmed by a readback on the named row during verification.
3. **Evaluator untouched.** `buildProspectFitReport` returns identical output for the same corpus with
   and without review rows present; the fit score, reachability and archetype for every candidate are
   unchanged by any review state. Tested.
4. **Shortlisting implies nothing.** The three readiness cards are unchanged; no review state renders a
   qualification or outreach label; a test asserts the vocabulary cannot produce one.
5. **A rejection is sourced.** `not_a_fit` requires a reason code; when the code is a fit or duplicate
   class, a note is required; `criterion_ref`, when present, must resolve to a real committed criterion
   in `campaignArchetypes.ts`.
6. **Explicit Save only.** No write on field change. Spinner while saving, `Saved` + toast after,
   success ring on the panel; a failed save preserves the entered values and shows a retryable error.
7. **One next action.** At most one per row (no list), owner required when the action text is present,
   due date optional, past due dates allowed and labelled overdue.
8. **The follow-up write is narrow and visible.** When the decision carries a due date: exactly one open
   deal of that company receives `deals.followup_date`; the patch carries that field and nothing else;
   `stage`, `nudge_stage` and `last_outcome` are untouched; a company with no open deal writes nothing
   and the panel says so; with more than one open deal the reviewer chooses rather than the code
   guessing. The panel names the deal it will change **before** the save, and the change is undoable
   from the toast.
9. **The flag is inert.** `needs_data_review` and `possible_duplicate` change no evaluator output.
10. **Counts reconcile.** Review-progress counts equal the review rows grouped by decision, and
    shortlisted + needs research + not a fit + unreviewed equals the candidate count. Computed from
    rows, never typed.
11. **Gates.** `npx tsc --noEmit` clean, full vitest suite green, production build exit 0, a local dev
    server on a free port (3001 is habitually occupied) serving the route with the new strings in the
    served chunk, and a screenshot of the panel **actually looked at** before claiming it renders.
12. **Privacy.** No customer name or id in the plan, migration, tests, or any committed artifact.
13. **Not merged, not deployed** until Pat says so.

## Risks and how this slice stays honest

- **A saved decision hardens a weak score into apparent truth.** Mitigation: score, evidence and gaps
  stay visible next to the decision; every block keeps its source label; the review state is never
  rendered as a qualification.
- **"Needs research" becomes a dumping ground.** Mitigation: it requires a specific missing dimension
  (`insufficient_evidence` / `route_unverified` / `buying_process_unknown` / `identity_unconfirmed`), so
  the research queue is actionable rather than a growing list.
- **Duplicate handling by hand goes wrong.** Mitigation: the flag and the note never merge records;
  merging stays a separate, deliberate step.
- **Two numbers on one screen.** The review counts and the evaluator counts are computed from different
  sources and both are labelled; a mismatch between them is a rendering bug, not a business change.

## Local verification (2026-09-11)

Built locally on `Leadpulse-intelligence` (base `491f461` = `origin/main`). Nothing pushed, merged,
deployed, migrated, or sent.

- `npx tsc --noEmit` clean; `npm test` 270/270 in 32 files; `npm run build` compiled successfully with
  `/prospects` prerendered as static.
- A dev server on port 3011 (3001 was free in this checkout but 3011 avoids any stray server) served
  `/prospects` 200, and the served chunk contained four literals unique to this slice, so the running
  code — not just the page — is the new one.
- The rendered screen was captured and **looked at**, not assumed: the review panel renders on desktop
  and mobile, the progress block reads `0 / 0 / 0 / 94 / 94` and reconciles against the 94 candidates,
  the panel states that it is not a qualification and that no reviewer identity is recorded, and the
  deal-board line reads "No due date on this review, so the deal board is left alone."
- **Verified end to end after the migration was applied (2026-09-11, on Pat's "ok sure deploy please").**
  The table was applied to `mkyhikarlxuwvprjabbi` and read back: 15 columns, all six named check
  constraints, one FK, RLS enabled with the same permissive policy the app's other write tables carry,
  0 rows, and the migration recorded in `supabase_migrations`.
  Then the **same PostgREST path the browser uses** (public anon key read from the served client bundle,
  never printed) was exercised against the top-ranked candidate:
  a review row insert returned 201; a second save with `on_conflict=company_id` returned 200 and left
  **one** row, not two; a `not_a_fit` with no note was refused by the database (`23514`,
  `prospect_reviews_exclusion_note_check`) and a reason belonging to another decision was refused
  (`prospect_reviews_decision_reason_check`); the permitted `followup_date` write on that company's one
  open deal returned 200 and read back as `2026-09-30`; the company row was unchanged (`prospect`,
  `updated_at` still 2026-09-02) with no deal or contact created. The rendered screen then showed
  `0 / 1 / 0 / 93` reconciled against 94 candidates with the decision badge on the row, and the
  "migration is applied" notice gone.
  **Residue, disclosed in full:** the verification row was deleted and the deal's `followup_date`
  returned to `null`, so no review state remains. The deal's `updated_at` did move (the app's own
  `updateDeal` writes it on any update) — that timestamp is the one lasting trace.
- **UI click-through was not automated.** The desktop preview pane did not answer this session, so no
  browser-driven save was performed; the write path was exercised directly against the same endpoint and
  key the browser uses. A human pass on the deployed screen is still worth doing.
- Deployed to production: commits `0f66434`, `9b3822b`, `8329b86`, `46a03da` pushed to `main` as a
  fast-forward (`491f461..46a03da`); Vercel (git-connected, project `leadpulse`) built
  `leadpulse-3ic2wiu88-hermes-75ff` **Ready in 28s**, `/prospects` returns 200 on
  `leadpulse-one-ashen.vercel.app`, and the served bundle contains all four literals unique to this
  slice (production chunks live under `/_next/static/immutable/chunks/`).
- Lint: one pre-existing `react/no-unescaped-entities` error in the touched page file, reproduced on the
  unmodified `HEAD` copy of that file, so it is not introduced here and was left alone.

## Decisions (Pat, 2026-09-11)

1. **Persistence target:** new Supabase table `prospect_reviews`. The migration is drafted here and
   applied **only on his separate explicit go-ahead**; until it exists the page degrades to "no reviews
   yet" rather than erroring.
2. **Next action scope:** the review save **also** sets `deals.followup_date` on an existing deal of the
   reviewed company, so the action appears on the board Pat works from. Measured before building: of 156
   candidate-shaped prospects, 121 have exactly one open deal, 34 have none, 1 has two or more — so the
   write is meaningful for most candidates and simply has nothing to update for a fifth of them. Guards:
   never create a deal, never touch `stage` / `nudge_stage` / `last_outcome`, patch exactly one field,
   name the deal in the panel before saving, make it undoable, and make more-than-one-open-deal a
   reviewer choice instead of a code guess.
3. **Slice boundary:** the review panel first, exactly as scoped. The two evaluator evidence defects stay
   their own reviewed change: a named person outranks a usable route even when the named contact carries
   **no** route (verified first-hand in `scoreFit`/`reachabilityOf`, +15 versus +8), and there is no
   country/coverage dimension at all (verified: `address` never reaches the evaluator, so overseas
   accounts rank at the top with no hold marker).
4. **Reviewer field:** omitted until a real auth layer exists, because an unverifiable name would look
   like accountability without being it. `reviewed_at` is kept, and the panel states plainly that no
   reviewer identity is recorded because this app has no login.
