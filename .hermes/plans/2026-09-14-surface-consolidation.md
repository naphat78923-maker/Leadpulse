# LeadPulse surface consolidation — proposal

**Status:** proposal. No retirements executed. Needs Pat's call.
**Evidence:** git commit counts and last-modified dates per page, taken 2026-09-14 from the
primary tree. Structural evidence only — **not** usage data. Do not delete a live surface
because it looks dormant in git.

## Section liveness

| Section | Commits | Last touched | Read |
|---|---|---|---|
| `deals` | 19 | 2026-09-06 | Unambiguously the live working surface |
| `activity` | 8 | 2026-08-20 | Kept, but stale — and it is the touch log |
| `contacts` | 6 | 2026-09-02 | Supporting |
| `nudges` | 5 | 2026-09-06 | The live attention surface |
| `retention` | 5 | 2026-09-06 | Live, blocked on the reorder-policy decision |
| `companies` | 5 | 2026-09-02 | Supporting |
| `meetings` | 4 | 2026-08-21 | Under-invested, see below |
| `pipeline` | 2 | 2026-08-20 | Duplicate of `deals` |
| `signals` | 2 | 2026-08-23 | Duplicate of `nudges` |
| `analytics` | 2 | 2026-08-21 | Dormant and unverifiable |
| `add` | 1 | 2026-08-20 | Fold into companies/contacts |

## The structural finding

LeadPulse carries **two generations of intelligence code**, with the new one dormant:

- Active: `lead-scoring`, `accountHealth`, `retentionCadence`, `deal-board`
- Dormant in production: `prospectFit`, `campaignArchetypes`, `reorderPolicy` — held inert by
  `ACTIVE_REORDER_POLICY = v0-legacy`, and imported by no screen.

The reorder-policy flip is the single decision that either activates or retires that work. It
has been pending for days, and until it is made the newer code is dead weight that looks like
progress.

## Recommendation

### Retire or merge

- **`pipeline` → merge into `deals`.** Two deal boards; `deals` has 19 commits, `pipeline` 2.
  Keep the "Deal Action Board" as the single deal surface.
- **`signals` → remove, keep `nudges`.** Both answer "what needs attention"; `nudges` is the
  one still being developed (5 commits, most recent) and `signals` is not (2 commits). Two
  attention surfaces means neither is checked reliably.
- **`add` → fold into `companies`/`contacts`.** One commit, and entity creation belongs with
  the entity.

### Gate, do not delete

- **`analytics`** — dormant *and* publishing metrics the data cannot support (win rate by lead
  source, while active customers hold order history and no recorded won deal). A wrong metric
  is worse than a missing one. **Either gate it behind a data-integrity check or label every
  figure as unverified** until deals and outcomes are recorded consistently.

### Invest, do not retire

- **`meetings`** — only 4 commits and untouched since 2026-08-21, yet the personal meeting is
  the closing event in Pat's own closed accounts, and a free sample without a meeting is the
  known stall pattern. This section is under-built relative to its importance.
- **`activity`** — 8 commits but stale since 2026-08-20. It is the touch log, and touch count
  is the closing mechanism. If logging coverage is thin, every touch-based signal is
  unreliable. **Measure coverage before building anything on top of it.**
- **`deals`** — 1114 lines. Split it; it is too large to change safely.

## Order of operations

1. **Decide the `deals` vs `pipeline` merge and the `nudges` vs `signals` merge.** Nothing else
   should be built until the target surfaces are settled.
2. **Measure activity-logging coverage** — what fraction of accounts with orders or samples
   have logged interactions. This gates the touch-based signals.
3. **Make the reorder-policy call** (`v0-legacy` vs the new classifier, and the 47 rows). This
   either activates or retires the newer intelligence work.
4. **Then** build the revenue signal detector into the surviving surfaces.

**Do not build the detector before step 1.** Building it into a surface that is about to be
retired is how the existing duplication happened.

## What I could not determine

- **Actual usage.** Git activity is a proxy, not behaviour. If `pipeline`, `signals`, or
  `analytics` are read daily despite few commits, that changes the retirement call — worth
  knowing before anything is deleted.
- **Test coverage is thin**: 20 test files across 94 source files. Consolidating is riskier
  than it looks, so merges should be additive first (new surface absorbs the old) and removal
  last, after a period of both existing.
