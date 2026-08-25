# LeadPulse safe interactions + “Do now” board

**Status:** Implemented and verified locally on 2026-08-25. Production deploy not performed; it requires Pat’s separate approval.

**Verification:** `npm test` (18 passed across pure workflow, board logic, modal retry/error preservation, provider refresh lifecycle, and optimistic concurrency), `npx tsc --noEmit` (passed), focused ESLint on new/touched workflow code and tests (passed), `npm run build` (passed), independent cycle-2 review (passed with no security or logic errors). Baseline-aware checks show unchanged lint counts in the older files touched for coordination: `deals/page.tsx` 4 errors + 1 warning, `CrmProvider.tsx` 31 errors, `lib/crm.ts` 11 errors, and `retention/page.tsx` 10 errors + 1 warning.

## Problem

`LogInteractionModal.handleSubmit` currently fires `onSave(...)` without awaiting it, then independently calls `crm.updateDeal(...).catch(...)`, resets the form, and closes. Any linked interaction also derives `NEXT_WORKFLOW` automatically. This lets an outbound email or no-response touch silently imply a client reply, and a second write can fail after the modal has already reported success by closing.

The deal board also calculates Due today but exposes only a non-interactive count. Cards retain insertion order, so urgent work is hard to find.

## Assumptions

- No database migration or production deploy is required for this slice.
- “Next action after this interaction” offers **Keep current lane** by default plus the deal’s normal forward lane. It never infers a lane from interaction type or outcome.
- If the forward lane requires structured data, the log modal collects it before saving: Sample requires sent/received; Testing requires a date; Successful requires explicit confirmation.
- “Needs review” means the deal’s current lane is incomplete or clearly contradicts its next action: Client reply lacks an outcome or still says it is waiting for a response; Sample lacks sent/received; Sample/Testing still contains a pre-contact research action; Testing lacks a date; Follow-up lacks date or nudge; Parked lacks revisit date; or Successful is not Closed Won.
- Writes are confirmed at the UI boundary by awaiting the interaction save and any explicitly selected deal update before reset/close. A true database transaction would require a Supabase RPC and is outside tonight’s no-migration fix.

## Implementation slices

1. Add focused tests for interaction transition resolution and board filtering/sorting.
2. Replace automatic `NEXT_WORKFLOW` mutation with an explicit keep/advance choice.
3. Await `onSave` and the optional deal update; disable duplicate submits; preserve form state and show an inline error on failure.
4. Add board helpers for status counts, Needs review, filters, search, product/priority filtering, and deterministic sort.
5. Add mobile-first Do now controls to `/deals` and apply the filtered/sorted collection consistently to lane counts and cards.
6. Verify focused tests, TypeScript, ESLint on touched files, and a production build. Review the final diff. Do not deploy without separate approval.

## Acceptance criteria

### Workflow correctness

- Logging any linked interaction keeps the current workflow lane by default.
- Outbound Email/DM/Call and No Response never imply a client reply.
- A lane changes only after the user explicitly selects the forward action.
- Required forward-lane data is validated before either save begins.
- The modal awaits the interaction write and optional deal write.
- The modal remains mounted through the provider refresh that follows an interaction save.
- The optional deal write is conditional on the original `updated_at`; a concurrent edit produces a review error instead of a stale overwrite.
- While saving, the submit button is disabled and shows progress.
- If either awaited operation rejects, the modal stays open, form values remain, and a visible error appears.
- The modal resets and closes only after all requested writes succeed.

### Do now board

- Clickable filters exist for All, Overdue, Due today, and Needs review, each with a count.
- Search matches client or deal title, case-insensitively.
- Product and priority filters can be combined with the status filter and search.
- Within every lane, cards sort deterministically by: overdue, due today, upcoming date, high priority, then remaining.
- Date ties use priority then client/title/id as stable tie-breakers.
- Filtered lane counts and empty states reflect the visible collection.
- Controls remain usable at mobile widths and legible in LeadPulse dark mode.
