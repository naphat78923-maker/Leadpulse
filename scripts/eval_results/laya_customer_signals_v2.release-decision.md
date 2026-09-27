# Customer-signal reader: bounded revision and release decision

## Decision
**Do not enable or deploy the customer-signal advisory.** The reader contract and tests are complete for this bounded pass, but the current local model/contract failed the new safety gate and has inadequate positive-case detection. CUSTOMER_SIGNAL_ADVISORY_ENABLED remains false; Today has no new review-action wiring. Existing schedules and evidence display are unchanged.

## Implemented
- Versioned customer_signals_v2 with one targeted revision of deferral and unresolved-problem wording; matching worker contract updated. No repeated tuning on the fresh holdout.
- Derive manual timing-review requirement from unknown evidence timestamps even if a caller omits the caveat.
- Keep callback-date extraction opt-in and inactive in the evaluated base reader.
- Correct evaluation accounting for allowed Choice alternatives and blocked/unscored safety cases; add evaluator regression tests.
- Preserve original v1 results. Original v1 development and holdout examples become a v2 regression corpus, not a fresh holdout.

## Real inference
Pinned local multilingual Core ML model; no cloud calls or model downloads. Exact model identity/questions, raw answers, token checks, errors and timings are in the linked JSON artifacts.
Fresh heldout: 30 synthetic cases; language counts: {"en": 10, "th": 10, "mixed": 10}. Labels were fixed by the subagent before inference; the parent read the full texts and expected labels separately. These are agent-reviewed synthetic labels, NOT owner/independent human annotations and NOT production accuracy. Multi-concern cases permit a documented unclear alternative.

| Judgment | Correct/total | True positives | False negatives | False positives |
|---|---:|---:|---:|---:|
| possible_contact_stop | 25/30 | 0 | 3 | 2 |
| requested_deferral | 21/30 | 4 | 2 | 7 |
| unresolved_problem | 23/30 | 1 | 5 | 2 |

Main need: 17/30 including accepted alternatives; exact match 14/30.
System opt-out holds: 1/3; missed fresh_th_stop, fresh_mixed_stop; false holds 2. Safety acceptance: FAILED. The opt-out Noul alone missed all explicit stop cases in this corpus; aggregate accuracy is misleading here.
Boundary controls passed: 2/2. No outreach clearance was granted; clearance is deliberately not provided by this reader, so this is a policy invariant rather than evidence of semantic quality.

Fresh examples expose existing deterministic precheck coverage gaps in Thai/mixed messages. Do not patch a growing phrase list merely to pass these fixtures. Any opt-out guard hardening requires its own reviewed scope; do not describe the existing precheck as comprehensive.

## Regression rerun
- possible_contact_stop: 27/30 correct.
- requested_deferral: 18/30 correct.
- unresolved_problem: 24/30 correct.
- Main need: 12/30 correct.
- The first regression run was interrupted at 20 rows; retain that partial JSONL as incomplete evidence, not a completed evaluation. The regression-complete files are the finished rerun.
- Regression evaluator exit 0 indicates it ran; it is NOT a release-quality verdict. The fresh heldout evaluator exited 2 for its failed safety gate.

## Verification run by parent
- npm test: 63 files / 723 tests passed.
- ./node_modules/.bin/tsc --noEmit: passed.
- npm run build: passed.
- Python worker unittest suite: 55 tests passed.
- Python evaluator accounting suite: 2 tests passed.
- Reader focused suite: 16 tests passed.
- No browser/UI release test: reader remains disabled and is not wired to Today. No deployment, CRM mutation, commit, push, or access change.

## Artifacts
- scripts/eval_results/laya_customer_signals_v2.heldout.jsonl
- scripts/eval_results/laya_customer_signals_v2.heldout.summary.json
- scripts/eval_results/laya_customer_signals_v2.regression-complete.jsonl
- scripts/eval_results/laya_customer_signals_v2.regression-complete.summary.json
- scripts/fixtures/laya_customer_signals_v2.heldout.json
- scripts/fixtures/laya_customer_signals_v2.regression.json

## Stop condition
The agreed one-revision experiment is finished. Keep the deterministic queue and customer-evidence folder. Operational AI advice remains undelivered because the evaluated model/questions are inadequate, not because the TypeScript plumbing is unfinished. Further model/question experimentation is a new scope decision, not a reason to enable this implementation.
