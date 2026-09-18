# Revenue Signal Detector — implementation contract (rev 2)

**Owner:** Jarvis (implementation). Pat (business rules).
**Status:** spec — not yet implemented. Supersedes rev 1.
**Purpose:** surface revenue already in the CRM that is not being worked.

**Change in rev 2:** this is no longer a standalone module. LeadPulse already has a
deal-attention system (`src/utils/deal-board.ts`: `ReviewReason` + `REVIEW_LABEL` +
`REVIEW_FIX`). The new signals **extend that system** rather than becoming a fifth parallel
intelligence module. Adding a new module was how the existing duplication happened.

Privacy: this file is deliberately **de-identified** so it is safe to commit. Do not add
account names, contact routes, or customer detail.

## Hard rules for the implementer

- **Read-only.** No CRM writes, inserts, updates, or deletes. A report and a JSON artifact only.
- **No outreach.** Never send, queue, schedule, or draft a client message.
- **Never invent history.** Do not backfill won deals, order dates, or outcomes to make
  signals resolve. Report the contradiction.
- **Never infer a buyer's motive.** Report what is recorded, not why.
- **`unknown` is a valid output.** Never substitute a guess.
- **No thresholds hardcoded in signal logic.** One config block at the top of the module.
- **Do not create a parallel implementation** of anything in `src/utils/` — reuse
  `deal-board`, `retentionCadence`, and the existing order/account utilities.

## Two levels, one shape

The existing `ReviewReason` system is **deal-level**. Two of the new signals are
**account-level** (a customer with no active deal). Do not force account signals into the deal
union, and do not build a second module — add a sibling reason set that uses the **same shape**
(typed union + label map + fix map).

### Deal-level — extend `ReviewReason` in `src/utils/deal-board.ts`

| New reason | Trigger | Fix string |
|---|---|---|
| `meeting-not-booked` | Recorded interest (reply, application/menu question, stated requirement) **and** ≥ `min_touches_to_escalate` logged touches (default 3) **and** no meeting ever booked | Ask for the meeting directly. |
| `sample-stalled-no-meeting` | **Free/comped** sample delivered, no meeting booked, ≥ `sample_stall_days` (default 14) since delivery | Recover the meeting. Sample without a meeting is stalled. |
| `paid-test-no-conversion` | **Paid test order at retail** (not comped, not discounted) with no dated commercial follow-up | Convert the validation into a commercial order. |

`paid-test-no-conversion` is **highest priority of all signals.**

**Paid vs free is the critical distinction.** Determine it from order value and any
comp/discount flag. If it cannot be determined from the data, emit
`payment_status: unknown` and rank at reduced confidence. **Never default to free.**

`sample_status` already exists on `Deal` (`SampleStatus`, sent/received). It does **not**
record payment. If no payment indicator exists in the schema, report that as a **blocking
schema gap** for Pat rather than inferring payment from order value alone.

### Account-level — new sibling reason set

| New reason | Trigger | Rationale |
|---|---|---|
| `reorder-gap` | Active customer, ≥ 3 orders, current silence > `reorder_gap_multiplier` × their own median inter-order interval (default 1.5) | The longest silence from a formerly regular buyer is the highest-value signal in a repeat-purchase business. |
| `customer-no-won-deal` | Active customer with order history but no recorded won deal | The pipeline cannot see a customer who is demonstrably buying. |
| `status-hides-customer` | Account holds a **won deal** but its status makes it invisible to retention (e.g. still `prospect`) | Missed reorders. |

Next steps: `customer-no-won-deal` → report the contradiction; propose a review, **never** a
retroactive win. `status-hides-customer` → propose the status correction; requires Pat's
approval as a write.

## Ranking

Rank by a stated **revenue-at-risk** estimate: account's trailing median order value × a
signal-specific weight. Publish the formula in the report header. Never present a rank without
showing what produced it. Report deal-level and account-level separately as well as combined —
their next steps differ.

## Output

1. A terminal-readable ranked report.
2. A JSON artifact with timestamp and the threshold config used.
3. Counts per reason, and an explicit **`insufficient_data`** list. Silent exclusion is a
   defect: every account is either signalled or listed as insufficient.

Report output goes to the existing gitignored reports path. No new files inside tracked
source directories.

## Acceptance criteria

- New reasons added to the typed unions with label and fix maps, following the existing pattern.
- Thresholds in one config block.
- **Synthetic fixture** exercising every reason, including paid-vs-free and at least one
  `insufficient_data` case. No live customer data in tests or fixtures.
- Tests pass, `tsc` clean, build succeeds.
- Live run produces report + JSON artifact with **no CRM writes** (verify: no mutation queries
  on the code path).
- Paid/free is **proved** against at least one real account, or explicitly reported
  indeterminate.
- Existing `ReviewReason` consumers still behave unchanged for the six original reasons —
  prove it, do not assume it.

## Prohibited

- Creating a new standalone intelligence module alongside `deal-board`.
- Writing to the CRM, or proposing an automatic write.
- Treating a paid test as a stalled free sample.
- Collapsing paid and free into one "sample stage".
- Creating or modifying deal, contact, or order records.
- Committing live customer data, reports, or contact routes to git.
- Adding a dependency where an existing utility covers it.

## Scope boundary (important)

The surface consolidation (`deals` vs `pipeline`, `nudges` vs `signals`) is **not yet decided**.
This contract is deliberately **surface-independent**, so implementation can proceed without
betting on which page survives:

- **In scope now:** the reason codes, the account-level sibling reason set, detection logic,
  fixtures, tests, the ranked report, and the JSON artifact. None of it depends on a page.
- **Out of scope until Pat decides:** wiring the new reasons into any specific UI section. Do
  not add them to `signals`, `nudges`, or any page. Do not remove or restyle a surface.

Build the logic and the contract. Wiring is trivial once the surviving surface is chosen, and
building into a page about to be retired is how the existing duplication happened.

## Open questions for Pat

1. Default thresholds (`sample_stall_days: 14`, `reorder_gap_multiplier: 1.5`,
   `min_touches_to_escalate: 3`) are the author's defaults, **not** measured from Pat's data.
2. Is there a payment/comp indicator on orders, or is `SampleStatus` all that exists?
3. Touch counting depends on interaction logging being complete. Today's evidence suggests
   activity logging is thin. **Verify data completeness before trusting the touch signals** —
   and report coverage rather than assuming it.
