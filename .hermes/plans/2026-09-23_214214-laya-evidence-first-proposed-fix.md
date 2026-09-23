# Laya Evidence-First Judgment Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task, if available; otherwise load the relevant implementation and review skills explicitly. This document is a proposal, not approval to implement or deploy.

**Goal:** Replace the unreliable broad sales-attention judgment with a tested, narrow buyer-response classification and explicit application rules, including honest abstention.

**Architecture:** Laya interprets the meaning of one attributed outcome note; ordinary code handles record status, evidence availability, source/time verification, and whether to show an actionable suggestion. Preserve the separate opt-out gate, exact-input trace, local-only inference, and no CRM writes. Validate the narrow classifier before adding richer data or changing production.

**Tech Stack:** Existing Next.js/React/TypeScript app, Python loopback worker, multilingual Core ML 1,024-token bundle, Vitest, Python unittest.

---

## Status and observed evidence

Planning only. No code, worker, database, or deployment change is authorized by this plan request.

The prior small local comparison used ten synthetic scoreable deals with assistant-defined expectations and two separately gated opt-out cases. The existing attention question matched three expectations; the expanded wording matched four. The sample was neither a real-deal accuracy estimate nor a blinded holdout. The expanded prompt improved some negative cases but damaged straightforward positive ones. Preserve those fixtures as regression/development examples, not unseen validation data.

Artifacts: `/Users/pat/.hermes/cache/scratch/laya-wording-comparison/` (temporary test inputs and raw outputs). Copy reviewed synthetic fixtures into repository tests during implementation; do not depend on a scratch directory long term.

Both exported bundles identify the same trained source weights. Larger capacity does not establish improved judgment. The installed prompt builder also has a 256-token head budget and slices each rendered option at 48 tokens. Verify full native token identity, not only total tokens, for every accepted request.

The current state builder passes industry, tags, product, stage, value, relative follow-up status, and complete `last_outcome`. It does not provide an authoritative timestamp or provenance for that outcome. `Deal.updated_at` must not be treated as buyer-response time. Meeting records have date/direction fields, but their existence in a type does not prove usable, current data for a particular deal.

## Proposed behavior

### 1. Ask about evidence, not the entire sales decision

Candidate only, untested:

```ts
const BUYER_RESPONSE_QUESTION = {
  buyer_response: {
    type: 'choice',
    instructions:
      'What does the note explicitly report about the buyer response? ' +
      'Use a later response only when its order is stated. ' +
      'An internal sales plan is not a buyer request. ' +
      'If the response is missing or conflicting, choose unclear.',
    criteria: {
      requested_next_step:
        'Buyer requests pricing, a sample, a meeting, or an order-related next step.',
      deferred:
        'Buyer explicitly postpones consideration until later, rather than declining.',
      declined:
        'Buyer explicitly rejects the offer, product, or proceeding with this deal.',
      no_commitment:
        'Buyer acknowledges or expresses interest but requests no next step and makes no commitment.',
      unclear:
        'No buyer response is stated, or conflicting responses have no clear order.',
    },
  },
};
```

The input is the complete outcome note, with a minimal product reference only if needed to resolve what the note is about. Do not send value, follow-up status, stage, or industry to this narrow classifier: those are not evidence of what the buyer said. This is a hypothesis to test, not an assertion that a shorter state necessarily improves accuracy. Do not characterize salesperson notes as verified direct buyer quotes.

Do not ask the classifier whether the response is recent. It has no verified clock evidence in the initial version. Do not increase option lengths until the installed tokenizer/preparer confirms no truncation.

### 2. Keep deterministic decisions in code

Order of operations:

1. Validate fixed request/schema and local transport boundaries.
2. Inspect complete selected evidence for explicit no-contact phrases. A match means `not_scored/contact_opt_out`, no inference, no recommendation. Retain bounded-language coverage and conservative manual-review behavior.
3. Closed-won and closed-lost deals are outside this open-deal prospecting feature. Parked workflow is not a permission to resume outreach. Show an explicit non-model status and do not generate Priority. Do not silently conflate closed-won with negative buyer sentiment.
4. Empty/missing outcome means `needs_evidence`, without model inference or an invented negative finding.
5. Run full token-integrity preflight; reject overflow/altered tokens without clipping facts.
6. Classify the note only for eligible cases.
7. Unknown/malformed result, failure, or materially conflicting evidence means manual review; do not substitute a previous recommendation.

Suggested mapping, explicitly policy rather than a model explanation:

- `requested_next_step`: “Buyer request reported. Review response.” It is not automatically “reply now.”
- `deferred`: “Buyer timing is later. Review/reschedule.” A follow-up overdue in CRM must not override that signal automatically.
- `declined`: “Decline reported. Do not prioritise this offer.” This is not a durable contact-wide opt-out flag.
- `no_commitment`: “No next step reported. Keep warm for manual review.” Not authorization to send a message.
- `unclear`: “Insufficient or conflicting evidence. Research/review.”

For the initial release, remove immediate-outreach recommendations rather than manufacture recency. A verified response timestamp and provenance are prerequisites to reintroducing a time-sensitive Priority rule. Determine a freshness policy with Pat before coding a number of days. A follow-up date is scheduling metadata, not consent or proof of current interest. Do not set a guessed confidence cutoff: distributions are not calibrated correctness or permission. Calibrate any later abstention threshold on development data, freeze it, and assess coverage alongside quality.

### 3. Display evidence and policy separately

Proposed card title: “Laya buyer-response assessment”. Show:
- Model assessment and its option distribution, labeled experimental until validated.
- Exact note and source status (for initial use: latest CRM outcome note; buyer authorship/time not verified).
- Rule-based handling message, labeled “LeadPulse rule”, without calling it Laya reasoning.
- Exact input/question, model identity, schema/policy versions, and UTC score time.

Preserve in-memory-only behavior, stale-response guards, user-initiated scoring, and no changes to CRM priority, stage, nudge workflow, contact preferences, or sends. Never show old four-option probabilities as if they described the new five-option classifier.

## Implementation sequence, after approval

### Task 1: Freeze the evaluation contract before implementation

**Create:** `scripts/fixtures/laya_buyer_response.dev.json`, `scripts/fixtures/laya_buyer_response.holdout.json`, `scripts/evaluate_laya_buyer_response.py`.

Record expected semantic class separately from expected application handling. Review labels with Pat or an independent reviewer before model outputs. Include quotation/sample requests, explicit deferrals, acknowledgements, missing data, declines, old-positive/new-negative chronology, unclear chronology, internal plans, English/Thai phrasing, opt-outs, and closed/parked records.

Use development fixtures for wording changes. Hold out 40 new scoreable examples, balanced across the five semantic classes, plus separate safety fixtures. Freeze tests before selecting a candidate. If the holdout drives prompt edits, retire it as holdout and create a fresh set. Preserve every candidate and raw output, including errors/refusals; do not hand-repair results.

### Task 2: Run the narrow question offline first

Load the same pinned local model directly in a separate synthetic-only process. Do not relax the live worker's fixed-question allowlist. Use the production input-budget guard and actual tokenizer. Write incremental per-case JSON results; compute counts programmatically and verify that every requested case is present exactly once per variant.

Compare the old attention system and candidate end-to-end on shared application expectations. Compare the new semantic classification against its own labels separately; do not compare incompatible labels as if they were the same task. Inspect errors by class and language. Include paraphrases and option-order variants as robustness checks. Record latency and refusal rate.

**Stop here if the candidate is unreliable.** Do not wire an unproven classifier into the UI merely because the adapter works. An acceptable fallback is displaying the raw evidence/manual-review state rather than model-generated advice. A cloud comparison would require separate privacy approval for any real CRM data.

### Task 3: Define a versioned, single-source contract using TDD

**Create:** `src/data/laya-buyer-response-v2.json` (canonical fixed question/schema).
**Modify:** `src/utils/lead-scoring.ts`, `scripts/laya_score_server.py`.
**Tests:** `src/utils/lead-scoring.laya.test.ts`, `scripts/test_laya_score_server.py`.

Write failing tests that both TypeScript and Python load the same exact published schema and reject arbitrary instructions/extra keys. Keep old attention types distinct from the new buyer-response enum. Include schema_version in the request identity and trace; change health metadata so UI compatibility is testable. Derive a contract fingerprint in code if used, never transcribe a guessed checksum. Count untruncated tokens and compare prepared tokens before any inference.

### Task 4: Implement preconditions and application mapping with TDD

**Create:** `src/utils/laya-buyer-response-policy.ts`, `src/utils/laya-buyer-response-policy.test.ts`.
**Modify:** `scripts/laya_input.py`, `scripts/laya_score_server.py`, `scripts/test_laya_score_server.py`.

Test opt-out precedence, missing outcome, closed-won, closed-lost, parked state, contradictory evidence, deferred timing versus overdue scheduling, unverified timestamps, unexpected options, and sanitized failures. The worker remains authoritative for opt-out and pre-inference checks; duplicate UI checks are only presentation, not the safety boundary. Add only explicit structured fields required by policy and reject missing/invalid enum values rather than inferring them from prose. Keep the selected full note available to the opt-out guard even when classifier input is minimized.

The first meaningful unit test must fail on behavior before implementation. Run red/green one behavior at a time. Do not create a CRM schema migration or new persistent contact preference without a separate design and approval.

### Task 5: Wire the card and preserve trace integrity with TDD

**Modify:** `src/components/LayaScoreCard.tsx`, `src/components/LayaScoreCard.test.tsx`, and `src/components/DealDetail.tsx` only if required by the new structured preconditions.

Test all new enums, rules versus model labels, schema compatibility, opt-out refusal, finite distributions, invalid keys, mismatched trace, score retries, record switches, A→B→A, and stale results. Bangkok rollover remains relevant for any schedule policy. If source/timestamp support is later added, tie it to the exact selected evidence and invalidate the result when it changes. Do not reuse `updated_at`, borrow a timestamp from an unrelated meeting, or silently add all activity history.

### Task 6: Verification and release decision

Likely commands from a clean release worktree:

```sh
npm ci
npm test
npx tsc --noEmit
npm run build
npx eslint src/components/LayaScoreCard.tsx src/components/LayaScoreCard.test.tsx src/utils/laya-buyer-response-policy.ts src/utils/laya-buyer-response-policy.test.ts
/Users/pat/laya-coreml/.venv/bin/python -B -m unittest discover -s scripts -p 'test_laya_score_server.py' -v
npm audit --omit=dev
```

Run the evaluation harness with explicit model, fixture, and output paths. Measure the real local worker, not only mocked inference. Exercise exactly-at-limit acceptance, just-over-limit refusal, English/Thai opt-out rejection, invalid protocol versions, and restart/rollback on a separate port. Record runtime warnings rather than claiming pristine output if there are any.

Proposed gates to agree before the experiment, not observed results:
- At least 36 exact semantic matches on the 40 frozen scoreable holdout examples; report each class separately.
- Report abstention/refusal counts and action-eligible coverage, not only accuracy on the easiest accepted cases. Do not count manual-review abstentions as correct substantive classifications.
- No immediate outreach/priority suggestion on any designated opt-out, closed/parked, decline, unknown, or unresolved-chronology safety fixture.
- All deterministic tests pass; no silent truncation, stale response, malformed-number, schema, or trace regression.
- Normal synthetic inference remains within the existing 30-second UI request budget on this Mac.
- Independent review and real browser-path verification, or clearly label any browser test blocked and defer completion of that criterion.

Passing a small holdout is a provisional release gate, not proof of production-wide reliability. If it fails, keep manual review and report the evidence. Do not endlessly tune to the same test set.

**Modify docs:** `README.md` after semantics are implemented and verified.

## Rollout and rollback

Ask before deployment. Preserve unrelated local `src/app/*` edits. Existing working-tree Laya modifications correspond to the prior release; reconcile against current `origin/main` before starting, without resetting user files.

Use a coordinated versioned rollout with brief scoring downtime: stop old worker, deploy compatible UI, verify Git SHA/production READY/canonical alias, then start new worker and verify exact model, schema, safe refusal, and browser rendering. Keep the previous package/commit as rollback artifacts. Do not restore the old unguarded worker as a shortcut.

## Risks and decisions

- Narrower classification may still fail; the evaluation gate comes before UI integration.
- Reducing irrelevant inputs is a hypothesis, not proof that model sensitivity is fixed.
- Free-text opt-out detection has false negatives and conservative false positives. It is not a complete consent system.
- The supplied types do not establish complete event attribution or verified recency. Start with unknown provenance rather than guessing.
- More questions and larger prompts increase latency. Start with one semantic question; defer fit judgments, multiple Noul calls, and enrichment until evidence justifies them.
- A higher model probability is not reliable correctness; it cannot authorize outreach.

**Recommended first approval:** implement only Tasks 1–2, producing a reviewed synthetic evaluation and an explicit go/no-go for integration. No live prompt change until that result is reviewed.
