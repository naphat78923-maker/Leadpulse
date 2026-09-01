# LeadPulse explicit outbound fields, approved slice

## Scope
Apply the two approved lean additions only:

1. Add `deals.draft_primary_ask`, a nullable client-facing ask kept separate from the internal `next_action`.
2. Add `contacts.identity_quality`, classified as `named`, `role_only`, `company_route`, or `unknown`.

## Product behavior
- New and existing deals expose **Primary client ask** beside the renamed **CRM next action** label.
- New and existing contacts expose **Contact quality**.
- Existing records remain valid: `draft_primary_ask` is nullable and `identity_quality` defaults to `unknown`.
- Save behavior remains explicit and uses the existing spinner, saved state, toast, and undo patterns.
- No readiness queue, Ebimaru endpoint, channel fields, product-phrase fields, commitments, draft ledger, production migration, or deploy in this slice.

## Implementation
1. Add a local additive Supabase migration for the two columns and the identity-quality check constraint.
2. Extend `Contact` and `Deal` TypeScript types and provider row mapping.
3. Add create-form controls in `CreateModal`.
4. Add edit/read controls in `ContactDetail` and `DealDetail`.
5. Include `draft_primary_ask` in deal save/undo snapshots.
6. Add tests first for create-form payload behavior.
7. Run targeted tests, full tests, TypeScript, lint, and production build.
8. Review the diff without touching the pre-existing uncommitted deal-board work.

## Acceptance criteria
- Creating a deal can persist a distinct primary client ask without changing `next_action`.
- Editing a deal can save and undo `draft_primary_ask`.
- Creating and editing a contact can persist one of the four explicit identity-quality values.
- Existing contacts map missing values to `unknown`; existing deals map missing primary asks to `null`.
- The migration is additive and re-runnable.
- No live database migration or Vercel production deploy occurs without a separate production approval.
