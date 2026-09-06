# LeadPulse Draft-Review Language Safeguard — Implementation Plan

**Source:** `.hermes/design-briefs/2026-09-03_leadpulse-draft-language-safeguard.json` (v0.2.0, approved)
**Priority:** P1
**Depends on:** P0 Reply-lane hygiene (modal live, cleaning paused), P0 Unscheduled queue (post-experiment)

## Goal

Add a contact-level `outreach_language` (thai/english/autodetect) + `outreach_language_basis` (last_inbound/pat_override/autodetect) model, surface it as a language badge in the DealDetail drafting brief, and make Pat's draft-language choice automatically write the contact record.

## Work breakdown

### 1. Additive Supabase migration
- New file: `supabase/migrations/20260903_add_outreach_language.sql`
- Columns on `contacts`:
  - `outreach_language text not null default 'autodetect'` with check constraint `('thai', 'english', 'autodetect')`
  - `outreach_language_basis text not null default 'autodetect'` with check constraint `('last_inbound', 'pat_override', 'autodetect')`
- No backfill. Existing rows land on `autodetect` safely.

### 2. Type updates — `src/types/crm.ts`
- Add `OutreachLanguage = 'thai' | 'english' | 'autodetect'`
- Add `OutreachLanguageBasis = 'last_inbound' | 'pat_override' | 'autodetect'`
- Add optional fields to `Contact` interface.

### 3. Contact identity options — `src/utils/contact-identity.ts`
- Add `OUTREACH_LANGUAGE_OPTIONS` array.
- Add helper `outreachLanguageLabel()`.

### 4. Contact detail — `src/components/ContactDetail.tsx`
- Show language + basis in the detail panel (read-only when not editing).
- When editing: select dropdown for `outreach_language` (thai/english/autodetect).
- Basis is derived automatically (not user-editable).

### 5. Create modal — `src/components/CreateModal.tsx`
- Default new contacts to `outreach_language: 'autodetect'`, `basis: 'autodetect'`.

### 6. DealDetail drafting brief — `src/components/DealDetail.tsx`
- Add language badge (top-left of drafting brief section).
- Badge states: 🇹🇭 Thai / 🇬🇧 English / 🔄 Auto-detect.
- When `autodetect`: show "Draft in Thai" / "Draft in English" selector row.
- When `thai` or `english`: hide selector, show badge only.
- Clicking a selector button writes `outreach_language` + `outreach_language_basis = 'pat_override'` to the contact AND regenerates the draft.
- Add collapsed inbound context accordion.

### 7. CRM provider mapping — `src/components/CrmProvider.tsx`
- Map `outreach_language` and `outreach_language_basis` from Supabase rows.

### 8. Tests
- `contact-identity.test.ts`: add `outreachLanguageLabel` cases.
- `DealDetail.test.tsx`: add language badge + selector rendering, auto-write on draft choice.
- `CreateModal.test.tsx`: verify new contacts default to autodetect.
- `CrmProvider.test.tsx`: verify new fields map correctly.

## Verification

- `npx vitest run` — all tests pass.
- `npx tsc --noEmit` — clean.
- `npm run build` — production build succeeds.
- Preview on localhost:3001 before any prod push.
- Deploy only after Pat says "deploy".

## Out of scope

- No auto-send.
- No global app-language toggle.
- No deal-level language field.
- No blind auto-translation (case-by-case via Ebimaru only).
