# LeadPulse contact-first action card

**Date:** 2026-08-29
**Status:** Approved for implementation by Pat
**Route:** `/deals`
**Scope:** Deal-card information hierarchy only. No schema migration, lane logic, scoring, save behavior, or deployment.

## Goal

Make every action-board card answer, in order: who to contact, which customer, how urgent, for which product, what to do next, why now, and the quiet commercial metadata.

## Approved hierarchy

1. Contact person or explicit missing-contact state
2. Role and customer
3. Urgency and date, kept together
4. Product
5. Next action as the strongest body content
6. Why now as supporting context
7. Priority and pipeline stage in a quiet footer

## Data rules

- Resolve contacts only from the deal's ordered `contact_ids`; never choose an unrelated company contact.
- The first explicitly linked contact is the displayed contact. Show `+N` when more linked contacts exist.
- Resolve the company from `company_id`, then the displayed contact's company, then the deal's stored client label.
- When no linked contact exists, display `Contact not identified`; do not infer a person.
- When a contact has no role, display `Role unknown`.
- Keep the product separate from the stored, potentially redundant deal title.
- Preserve current Needs review, sample status, and nudge metadata without allowing them to compete with the next action.

## Acceptance checks

- [x] Contact is the strongest card identity.
- [x] Company is shown once and the redundant deal title is removed from the card.
- [x] Missing contact and missing role states are explicit.
- [x] Overdue/due-today/scheduled/no-date state and date occupy one top-right cluster.
- [x] Product is a short secondary line.
- [x] Next action has a labelled body section and honest empty state.
- [x] Why now is subordinate to the next action.
- [x] Priority and pipeline stage are in the footer.
- [x] Compact cards remain compact while leading with contact identity.
- [x] Card-wide Open and adjacent Move controls remain siblings; click and drag behavior is unchanged.
- [x] Pure presentation helpers are covered with failing-first tests.
- [x] Targeted tests, full test suite, TypeScript, and production build pass.
- [x] Local `/deals` preview confirms the hierarchy with real CRM data.

## Out of scope

- Adding `primary_contact_id`
- Reordering contacts in the editor
- Database writes or migrations
- Changing lane membership or due-date calculations
- Vercel deployment
