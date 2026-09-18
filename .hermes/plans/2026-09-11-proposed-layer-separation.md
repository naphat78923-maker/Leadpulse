# Proposed: separate discovery fit, sales qualification, and outreach readiness

**Status:** proposal — no committed criterion is changed. **Approved direction:** documentation plus a
read-only report column first; no schema change and no new research sweep.
**Date:** 2026-09-11 · Supersedes the earlier draft of this file.

## Why the layers exist

Applying all four committed criteria at the discovery stage made that stage unwinnable: 27 of 48
criterion checks were never evaluated and no account reached *supported*. Three separate mistakes were
behind that, and two of them were in the first draft of this proposal.

- **Some criteria are later sales milestones, not discovery facts.** "Either already ordering, or has
  taken samples into a menu test" cannot be settled before contact because it describes a stage we
  create *with* the account. It does not require an earlier purchase, and it is not evidence of one —
  it is simply later in the process. Modelling it as circular was wrong.
- **Buying-process criteria are not knowable only through a relationship.** A published procurement or
  supplier page, a team page naming a head baker or pastry chef, or evidence already in the CRM may
  establish some of them without any contact. Treating them as relationship-only knowledge was wrong.
- **A verified procurement route does not establish centralised buying or purchasing authority.** Route
  verification answers one question — can a message reach the right desk — and nothing more. Route,
  authority and buying-process evidence are three different things and stay separate.

## The layers (assignment only; no criterion edited)

**Layer 1 — discovery fit.** Evaluable from public evidence plus CRM identity, before contact:
restaurant c1; bakery c1, c2, c3; retail c1, c3. Alongside the criteria: business identity and role,
market presence, and whether a relevant **product application** is plausible. *Unestablished* is a
valid, non-disqualifying state for product application.

**Layer 2 — sales qualification.** Evaluated when contact or CRM-internal knowledge allows, and never a
discovery gate: restaurant c2, c3, c4; bakery c4; retail c2, c4.

**Layer 3 — outreach readiness.** Per account: suppression review **completed and clear**; relationship
history **reviewed**; route quality; and explicit owner authorisation for that specific account.

## Rules

1. **No retrospective promotion.** Re-reading old evidence under this layering upgrades no account.
2. **A discovery rejection must cite a contradicted layer-1 criterion.** Layer-2 criteria may not be
   used to reject at discovery.
3. **Route verification is separate from authority and from buying-process evidence.** A verified route
   never certifies centralised buying, and an unknown buying process never invalidates a verified route.
4. **Relationship history is reviewed, not required:** `existing` / `none found` / `unknown`. Existing
   history informs the approach. It is neither a prerequisite nor permission to contact, and blocking on
   it would exclude every genuinely new prospect.
5. **Readiness requires suppression reviewed *and clear*.** A review that is merely completed does not
   qualify: if it finds an opt-out the account is blocked, and unknown stays blocked.
6. **Blockers are a list, never one state.** An account can be blocked several ways at once.

## Reporting states

- `discovery_fit`: supported | partial | unresolved | rejected
- `sales_qualification`: not_started | in_progress | qualified | disqualified
- `outreach_readiness`: a list drawn from `no_route_identified`, `suppression_review_not_completed`,
  `suppression_confirmed_opt_out`, `suppression_unknown`, `no_owner_authorization`

Never merge the three dimensions, and never let one imply another.

## Derived result for the 12-account pilot

Numbers only, generated from the per-account mapping so each pilot member is counted exactly once:

- **Discovery fit:** 3 supported · 6 partial · 1 unresolved · 2 rejected = 12.
- **Sales qualification:** not_started for all 12.
- **Outreach:** 12 carry `suppression_review_not_completed` + `no_owner_authorization`; 1 additionally
  carries `no_route_identified`. Every account has more than one blocker.
- **Relationship history:** 2 with logged interaction history, 10 with CRM records but no logged
  interaction, none unknown.

Per-account names and ids live only in the protected report
`.hermes/reports/2026-09-11-qualification-pilot-12.md`, produced by `generate-pilot-report.mjs`. This
proposal stays de-identified so it remains commit-ready.

## Open decision

Encode a `criterion_stage` field per criterion in `campaignArchetypes.ts`, or keep documentation plus the
report column? Recommendation, and the approved direction: **documentation and the report column first.**
