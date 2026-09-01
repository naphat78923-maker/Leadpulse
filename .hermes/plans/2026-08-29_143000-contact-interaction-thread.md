# Plan: LeadPulse Contact Interaction Thread (folk "realtime interactions" adaptation)

**Slice:** C (of three folk-inspired slices: A workspace views, B board value rollup, C contact interaction thread)
**Inspired by:** folk CRM video, the "realtime interactions on each contact profile" section.
**Status:** Proposed — awaiting Pat sign-off before code.

## Goal

Bring folk's "full context of each relationship on the profile" to LeadPulse. The contact profile currently shows static fields (email, phone, role, company, notes) and has **zero** interaction history. The data already exists in the `meetings` table (calls, emails, DMs, meetings, notes), linked by `contact_ids` and `company_id`. This plan renders that history read-only on the contact profile, with a one-tap way to log a new interaction pre-linked to the contact.

## Scope

### In
- Read-only **Interaction thread** inside `ContactDetail`, newest first.
- Each row: type icon (call/email/dm/meeting/note), relative date, counterparty name(s), outcome chip, summary line (truncated), follow-up date when set.
- Tap a row -> **read-only detail bottom-sheet** (full description, summary, outcome, date, follow-up, linked deal/company). No edit controls.
- **"New interaction"** button -> opens the existing `LogInteractionModal` pre-linked to this contact (`initialContactIds={[contact.id]}`). Saving runs through the existing `addMeeting` + activity/undo flow, then the thread refreshes.
- Mobile-first, locked `clay-*` tokens, 44px touch targets.
- Reuses existing `meetings` data. **No new table, no schema change.**

### Out (separate plans)
- AI recap / research assistant (needs an LLM; layers on top of this thread later).
- Company-level interaction thread (same pattern, separate pass).
- Workspace saved views (Slice A), board value rollup (Slice B).

## Files

### ADD `src/components/InteractionThread.tsx`
Pure presentational component. Receives the derived `meetings`, the contact, and lookup helpers (`contactName`, `dealById`, `companyById`). Renders:
- Empty state: "No interactions yet" + inline "Log the first one" prompt (reuses the New button; no generated art).
- The list of `InteractionRow`s.
- The read-only `InteractionDetailSheet` (bottom sheet, mirrors the existing modal shell: `fixed inset-0 bg-black/50`, slide-up on mobile, `max-h-[80vh]`).

### EDIT `src/components/ContactDetail.tsx`
- Already imports `useCrm`; read `meetings`, `deals`, `contacts`, `companies` from context (no new props needed).
- Import `InteractionThread` and `LogInteractionModal`.
- Add local `logOpen` state; render `LogInteractionModal` inside the component with `initialContactIds={[contact.id]}`, `onSave={addMeeting}`, `deals`/`contacts`/`companies` from context.
- Derive the thread (memoized):
  ```ts
  meetings.filter(m =>
    (m.contact_ids || []).includes(contact.id) ||
    (contact.company_id && m.company_id === contact.company_id && !(m.contact_ids || []).includes(contact.id))
  ).sort((a, b) => (b.date < a.date ? -1 : 1));
  ```
  The OR-without-duplicate rule shows both contact-linked and company-level context without double-counting.
- Render the **Interactions** section (with a "New interaction" header button) inside the existing modal body, placed after Notes.

No changes to `CrmProvider`, `LogInteractionModal`, `types/crm.ts`, or any route page beyond what `ContactDetail` already receives.

## Data flow (already exists)
- `CrmProvider` loads `meetings` and exposes them via `useCrm()`.
- `addMeeting` in `CrmProvider` writes the row, touches linked contacts/company, then `refresh()` -> thread updates automatically.
- Logging an interaction does **not** move a deal lane unless the user explicitly chooses a "next action" in the modal (existing `buildInteractionWorkflowUpdate` flow). The thread is purely read-only, so it cannot cause an auto-advance.

## Design rules (locked LeadPulse language)
- Tokens: `clay-card`, `clay-ink`, `clay-body`, `clay-muted`, `clay-muted-soft`, `clay-hairline`, `clay-surface`, `clay-success`, `clay-error`, `clay-ochre`, `clay-lavender`, `clay-mint`. Butter `#eec35a` for attention accents only.
- `clay-error` (tomato red) reserved for true danger; an outcome "negative" is a small chip, never a full red box.
- Outcome chip colors: positive -> `clay-success`, neutral -> `clay-card`/`clay-body`, negative -> `clay-error`, no_response -> `clay-muted`.
- Relative dates via `date-fns` `formatDistanceToNow`; fall back to the raw `date` string if parse fails.
- Touch: the New button and every tappable row are `min-h-[44px]`.
- Mascots: only the fixed PNG family. The empty state uses a small inline hint, no generated art and no clay-avatar generation.

## Acceptance criteria
1. Opening any contact in `/contacts` or `/activity` shows an **Interactions** section listing all related meetings (contact-linked + company-linked, no duplicates), newest first.
2. Rows render: type icon, relative date, counterparty name(s), outcome chip, truncated summary, follow-up date when present.
3. Tapping a row opens a read-only bottom-sheet with full description, summary, outcome, date, follow-up, and linked deal/company. No edit controls.
4. "New interaction" opens `LogInteractionModal` with the contact pre-selected; on save it runs the existing `addMeeting` + activity/undo flow and the thread updates.
5. Opening or tapping through the thread **never** moves a deal lane; the only way to change a lane remains the explicit "next action" choice inside the log modal.
6. Mobile: section full-width, button and rows >= 44px, detail sheet slides up from the bottom.
7. `npx tsc --noEmit` clean; existing vitest suite (18/18) green; `InteractionThread` gets a render test (empty + populated).

## Verification
- `npx tsc --noEmit` after changes.
- `npm test` green (add InteractionThread tests).
- Manual: run dev server (Pat previews on `localhost:3001`), open a contact that has existing meetings, confirm the thread; log a new interaction and confirm it appears; confirm no deal lane changed unless explicitly chosen in the modal.

## Deploy
- Per Pat's standing rule: **do not deploy** unless he says "deploy". Local preview only. This plan covers build + local verification.
