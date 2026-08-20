# Slice 1 — Operational CRM Foundation (Close-lost + Archive/Delete + undo parity)

**Goal:** Make LeadPulse a *real* operational CRM. Today the schema supports `closed_lost`
(pipeline counts it) but there is **no UI to set it**, and nothing can be deleted/undone
beyond deal moves. This violates Pat's explicit save/confirm/undo safeguard rule.

## Build order

### A. Close-lost + won management in DealDetail
- Add a `status: 'open' | 'won' | 'lost'` selector (UI-only derived from `stage`, not a new column).
- When set to `lost`: stage → `closed_lost`, followup_date → null, confirm via the
  existing `confirmSuccess`-style gate ("Mark this deal lost?").
- Already-supported `won` path stays; both log an `edit` activity with a full-field
  `undoPayload` (same shape as success) so they are undoable in Activity.
- Acceptance: setting lost/won persists to Supabase, appears in Pipeline "Closed" tab,
  leaves the action board (`actionBoardDeals` filters `closed_lost`), and is undoable.

### B. Soft-delete with confirm + undo (recoverable, not hard delete)
New migration `supabase/migrations/20260821_add_soft_delete.sql`:
```sql
ALTER TABLE companies ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE contacts  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE deals     ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE meetings  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
-- indexes for filtered queries
CREATE INDEX IF NOT EXISTS idx_companies_deleted ON companies(deleted_at);
CREATE INDEX IF NOT EXISTS idx_contacts_deleted  ON contacts(deleted_at);
CREATE INDEX IF NOT EXISTS idx_deals_deleted     ON deals(deleted_at);
CREATE INDEX IF NOT EXISTS idx_meetings_deleted  ON meetings(deleted_at);
```
- `lib/crm.ts`: add `softDelete(entity, id)` (UPDATE ... SET deleted_at=now()) and
  `restore(entity, id)` (SET deleted_at=null). All list fetches add
  `.is('deleted_at', null)` so deleted rows vanish from the UI but remain in DB.
- `CrmProvider`: add `deleteEntity(entity, id)` + `restoreEntity(entity, id)`; both
  call `softDelete`/`restore`, then `logActivity({ type:'delete'|'create', entity,
  entityId, label, undoPayload: { kind:'restore', ... } })`, then `refresh()`.
  Extend `undoActivity` to handle `delete` events (restore via undoPayload).
- Acceptance: delete hides the row everywhere (board, lists, detail, radar, pulse);
  an "Undo" link appears on the delete activity and recovers it; row still exists in Supabase.

### C. Confirm + delete UI on detail drawers
- `DealDetail`, `ContactDetail`, `CompanyDetail`: add a quiet "Archive" (trash) button
  in the header. Clicking opens a confirm mini-sheet ("Archive {name}? You can undo this.")
  with Confirm / Cancel. On confirm → `deleteEntity`, toast "Archived — tap Undo",
  and the toast becomes an *actionable* toast (undo) — fall back to the Activity feed Undo.
- Acceptance: no delete happens on a single tap; confirm required; every delete is recoverable.

### D. Create undo parity
- `createCompany` / `createContact` / `createDeal` in CrmProvider already call
  `refresh()`; wrap them to also `logActivity({ type:'create', entity, entityId: created.id,
  undoPayload:{ kind:'delete', id } })` (delete = softDelete). The Activity Undo then restores+deletes.
- Acceptance: creating a company/contact/deal shows a "Undo" on the new activity entry
  that removes it.

## Guardrails
- Null-safe: deleted_at writes use `now()` server-side; never empty string.
- No destructive `DELETE FROM`; only `UPDATE ... SET deleted_at`.
- Keep the clay design tokens (do NOT touch zams→clay rename here — that's Slice 4).
- Build must pass: `npm run build`.

## Verification
1. `npm run build` succeeds.
2. Dev: create a deal → Undo appears in Activity and removes it.
3. Open a deal → set Lost → confirm → disappears from board, shows in Pipeline Closed,
   Undo in Activity restores it.
4. Delete a contact/company → confirm → gone everywhere → Undo recovers.
5. Supabase: deleted rows present with `deleted_at` set, not gone.
