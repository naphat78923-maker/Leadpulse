# LeadPulse detail-field hierarchy cleanup

## Approved scope
Apply the accepted UX verdict without changing CRM status enums or production data:

1. Keep `next_action`, `draft_primary_ask`, and `identity_quality` as distinct facts.
2. Remove the redundant auto-generated Deal name row from the deal drawer body.
3. Move Product, Priority, and Value into a collapsed Commercial details section.
4. Show Primary client ask inside an Ebimaru drafting brief only for outreach, reply, or reschedule workflows, while keeping any existing non-empty ask visible so it can be cleared.
5. Centralize contact-quality labels and dynamic contact-name field copy.
6. Change the contact-name label by identity quality.
7. Rename Second Phone to Alternate phone.

## Explicit non-scope
- Do not change `ContactStatus`, database constraints, or existing status data.
- Do not remove Replied or No response yet; that remains a separate migration decision.
- Do not change Ebimaru cron configuration in this slice.

## Acceptance criteria
- Deal drawer no longer renders a separate Deal name row.
- Commercial details are collapsed by default and contain Product, Priority, and Value.
- Outreach, reply, and reschedule deals expose the Ebimaru drafting brief.
- Testing, sample, parked, and successful deals with no stored ask do not show the drafting brief.
- A stored ask remains visible outside those lanes so it is never orphaned.
- Contact create/edit labels adapt for named, role-only, company-route, and unknown contacts.
- UI copy says Alternate phone everywhere touched by the create/detail flows.
- Identity-quality choices come from one TypeScript source of truth.
- Existing explicit Save, confirmation, toast, and undo behavior remains intact.
- Tests, TypeScript, and production build pass before requesting deployment approval.
