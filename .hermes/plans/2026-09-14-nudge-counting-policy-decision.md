# Decision needed: what does the 4-send nudge ladder count?

**Raised by:** slice 2 of the assigned action-flow brief, which requires "customer responses do not
increment unanswered nudges" while also stating that any change to the four-send/park policy needs a
separately documented decision. This is that document. **Nothing live has changed: the ACTIVE policy is
the behaviour production already serves.**

## The two candidate rules, in one line each

| | Rule | Today |
|---|---|---|
| **v0 — cumulative sends** | Every logged call/email/DM on the deal counts as a send. A captured inbound reply never counts. | **ACTIVE** — this is what production serves, and what the badges on the board show now. |
| **v1 — unanswered chases** | Only an explicitly **outbound** call/email/DM with **no recorded client response** counts. A conversation is not a chase; an unknown direction stays unknown instead of being asserted as outbound. | Implemented and tested, not switched on. |

Both live behind one constant, `ACTIVE_CHASE_POLICY_ID` in `src/utils/interaction-event.ts`, with the
rule text carried in `CHASE_COUNTING_POLICIES` and covered by tests in `interaction-event.test.ts`.

## Measured impact of switching to v1 (read-only, live corpus 2026-09-14)

- Corpus read: **80 `meetings` rows**, **174 `deals` rows**, via the app's own read path. No writes.
- Every one of the 80 rows already carries an explicit direction (`outbound` 53, `internal` 25,
  `inbound` 2). **No row has an unknown or absent direction**, so the "unknown stays unknown" half of
  v1 has **no effect on any live number** — it only removes a future silent assumption.
- Switching to v1 would change the badge on **17 deals**. Most of those drop to no badge at all
  (for example a deal that reads `2/4 Remind` would read `0/4`), because every touch logged against
  them carries a recorded client response — i.e. they are conversations, not unanswered chases.
- Case-level detail (account names, ids, before/after badges) is in the protected report area, not in
  this commit: `.hermes/reports/2026-09-14-nudge-policy-impact.md`.

## Why I did not switch it

The observed defect — "a positive follow-up call increased the nudge badge while keeping the stage" —
is a symptom of v0, not of a bug in the code path. Under v0 that behaviour is *by design*: any
outbound call/email/DM is a send, cumulative, and a later reply does not reset the count. Making
recorded conversations stop counting is a change to what the ladder measures, which the brief
explicitly reserves for a separate decision. Everything else in slice 2 (classification, direction
independence, internal notes, reply handling, drag/modal consistency) shipped without it.

## What the decision changes

- **Choose v0 (keep):** badges stay exactly as they are. The ladder keeps measuring "how many times
  have I reached out", including touches that got an answer. The observed complaint stands.
- **Choose v1 (switch):** the ladder measures "how many reaches have gone unanswered". A positive
  call stops advancing the count, and 17 live deals show a lower (often absent) badge. The four-send
  park rule keeps its threshold; only what feeds it changes. Historical rows are never rewritten.

Either way, no backfill and no reclassification of historical rows is proposed, and the boundary in
the brief ("direction is never inferred from a channel") is preserved in both.
