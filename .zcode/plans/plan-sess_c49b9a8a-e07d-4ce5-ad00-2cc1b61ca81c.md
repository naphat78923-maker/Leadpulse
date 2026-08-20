# Fix the Add Deal form: action lane, contact picker, editable amount

Three changes, all in the deal creation/editing flow. No schema changes needed — `workflow_action`, `sample_status`, `nudge_stage`, and `value` already exist in the Supabase `deals` table.

## 1. Add the workflow action lane selector to the Add Deal form

**File: `src/components/CreateModal.tsx`**

- Add a "Current Action" `Select` to the deal form (between Priority/Value and Next Action), driven by `WORKFLOW_LANES` from `src/utils/deal-workflow.ts` — same source as the DealDetail drawer (`icon + label` options), default `outreach` (already in form state).
- Below it, show the lane's `description` helper text (via `WORKFLOW_BY_ID`).
- Conditional sub-fields, mirroring DealDetail's logic:
  - lane `sample` → Sample status select (`SAMPLE_STATUS_OPTIONS`)
  - lane `reschedule` → Nudge stage select (`NUDGE_OPTIONS`)
- Coupling rule from DealDetail, applied on lane change: picking `success` auto-sets Stage to `Closed Won` and clears follow-up date; switching away from a lane clears its sub-field.
- Submit validation (inline error message above the modal's save button, since none exists today): `testing`/`reschedule`/`parked` require a Follow-up Date; `reschedule` requires a nudge stage; `sample` requires a sample status.

## 2. Replace the contact chip wall with a searchable picker

**New file: `src/components/ContactPicker.tsx`**

- A search input with a dropdown list of matching contacts (filter by name, company name, email/phone; exclude nameless contacts that currently render as "-").
- Clicking a contact adds it as a removable chip (X button) shown above the input; chips remain visible when the search box is empty.
- When a Company is selected in the form, that company's contacts appear first in results under a "Company" hint (no auto-selection — user still chooses).
- Styling follows existing conventions: `px-3 py-3 border border-clay-hairline rounded-lg bg-white dark:bg-clay-card`, `min-h-[44px]` tap targets, `max-h` scrollable dropdown.
- `CreateModal.tsx` deal form swaps the flex-wrap chip block for `<ContactPicker contacts={contacts} companies={companies} selectedCompanyId={form.company_id} selectedIds={form.contact_ids} onChange={...} />`.

## 3. Make the deal amount editable after creation

**File: `src/components/DealDetail.tsx`**

- Add `value` to `editData` initial state and to the `crm.updateDeal` payload (currently missing from both — the amount is set-once at creation today).
- Add a "Value (THB)" input in the drawer next to the Priority editor, matching its inline-editor styling; parse to number on save, empty → null.

## 4. Fix amount/save robustness bugs found along the way

**Files: `src/components/CreateModal.tsx`, `src/lib/crm.ts`**

- CreateModal currently leaves `value` as `''` when empty (fails NUMERIC insert) and sends `notes: ''` for deals (no such column in the schema). Normalize in `createDeal`/`updateDeal` in `src/lib/crm.ts`: `value` string → parsed number, `''` → null; strip `notes` from deal payloads in the modal.

## Verification

- `npx tsc --noEmit` and `npm run build` for type/build checks.
- Manual check via `npm run dev`: create a deal with a lane other than Outreach (incl. sample/reschedule sub-fields), search-and-pick contacts, verify amount saves and is editable afterward in the drawer.

## Note

These changes are local — the live Vercel app won't get them until you redeploy (`vercel --prod`). I won't deploy without your go-ahead.