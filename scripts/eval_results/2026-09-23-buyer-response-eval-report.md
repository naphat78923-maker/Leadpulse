# Buyer-response classifier — offline evaluation (dev set, 2026-09-23)

Implements Tasks 1–2 of `.hermes/plans/2026-09-23_214214-laya-evidence-first-proposed-fix.md`,
with the review amendment (state-rendering format as an explicit test variable).

## Setup

- Model: `aac6fef/laya-multilingual-coreml` @ `052592a1`, loaded directly in this
  synthetic-only process (`models/multilingual-1024`, cpu_gpu). The live worker and
  its fixed question allowlist were not touched.
- Every case passed the production `check_input_budget` preflight — **zero refusals
  across all variants**; the 5-option head (instructions + 5 options + masks) fits the
  bundle's 256-token head budget intact.
- Safeguards (opt-out regex, closed/parked status, missing evidence): **9/9 PASS,
  with zero model calls**. No outreach-positive output on any opt-out fixture.
- Fixture labels are draft and still pending Pat/independent review.
- The 40-case holdout set was **not run** — wording never converged on dev, and the
  plan permits a single holdout run only after wording is frozen.

## Results (dev, 25 inferable cases; semantic = 5-class label, handling = app vocabulary)

| variant | semantic top-1 | top-2 | handling | req. next step | en | th | p50 ms |
|---|---|---|---|---|---|---|---|
| old_attention (baseline) | n/a | — | **8/25 (32%)** | — | — | — | 298 |
| cand_labeled | 12/25 (48%) | 15/25 | 15/25 | 2/8 | 10/20 | 2/5 | 307 |
| cand_json | 12/25 (48%) | 17/25 | 14/25 | 3/8 | 11/20 | 1/5 | 308 |
| cand_convo | 11/25 (44%) | 14/25 | 12/25 | 1/8 | 9/20 | 2/5 | 312 |
| cand_note_only | 12/25 (48%) | 15/25 | 13/25 | 2/8 | 10/20 | 2/5 | 346 |
| cand_convo_revopts | 11/25 (44%) | 15/25 | 14/25 | 1/8 | 9/20 | 2/5 | 337 |
| w2_reply / neutral / revopts | 11 / 8 / 11 | 15 / 12 / 13 | 13 / 9 / 11 | 1 / 0 / 1 of 8 | | | ~310 |
| w3_exact (proven 9/10 phrasing) | 11/25 | 14/25 | 12/25 | 1/8 | 8/20 | 3/5 | 352 |
| w3_exact_revopts | 11/25 | 14/25 | 13/25 | 2/8 | 9/20 | 2/5 | 357 |
| w3_exact_4opt (no unclear) | 11/25 | 15/25 | 13/25 | 2/8 | 9/20 | 2/5 | 257 |
| w4_reported / revopts | 9 / 12 of 25 | 15 / 18 | 13 / 14 | 0 / 2 of 8 | | | ~330 |

## Findings

1. **Candidate beats the old question decisively** on the same cases: 44–48% semantic /
   52–60% handling vs 32% handling end-to-end, with per-class coverage the old question
   never had (declined 5/5 in most variants). But absolute accuracy is far below shippable.
2. **The dominant variable is the voice of the scored text.** These fixtures are
   third-person CRM notes ("Buyer … asked for a quotation"), and `requested_next_step`
   never exceeds 2/8 in any of 12 wording/state/option-order variants. A probe rewriting
   the same facts as first-person buyer messages ("Please send us a quotation for 20 kg…")
   fixed 4/7 probed misses immediately. The 9/10 result in `laya-coreml/experiments/lead_triage`
   used first-person replies; that gap transfers, the wording does not.
3. **State format was not decisive here** (labeled/JSON/conversational all within noise),
   because every candidate state is short and flat; the earlier "JSON kills it" finding
   came from deeply nested state. Keeping plain-sentence states remains good practice.
4. **`declined` is over-selected** on ambiguous/mixed notes (it absorbs unclear, deferrals,
   and some requests). `deferred` is the weakest boundary after `requested_next_step`,
   confirming the plan's risk note. Option-order reversal shifts ±2 cases — noisy, not stable.
5. Thai tracks English (no systematic language penalty); both languages share the
   `requested_next_step` failure mode.

## Recommendation (per plan gate: "if accuracy does not improve, stop and report")

**Do not ship the 5-class question against third-person notes.** Evidence points at
the data, not the wording:

- Preferred: score the buyer's **verbatim reply** (first-person) rather than the
  paraphrased `last_outcome` note — capture it as a dedicated CRM field. The model
  demonstrably handles that input (9/10 in the earlier experiment; probe confirms).
- Fallback: if only third-person notes exist, route model output through a
  confidence-gated human-review step and treat `requested_next_step` as unverified,
  or drop to a hierarchical/keyword+model hybrid. Re-evaluate on dev before any
  holdout run.

## Artifacts

- `scripts/fixtures/laya_buyer_response.dev.json` (27 scoreable + 7 safety)
- `scripts/fixtures/laya_buyer_response.holdout.json` (40 scoreable + 6 safety, **unused**)
- `scripts/evaluate_laya_buyer_response.py` (harness; variants selectable via `--variants`)
- `scripts/eval_results/laya_buyer_response.dev{,.w2,.w3,.w4}.jsonl` + `.summary.json`

## Follow-up (same day): verbatim-reply evaluation

Implemented the report's preferred path and evaluated it on a full 25-case dev set
(`laya_buyer_response.dev.verbatim.json` — first-person `buyer_reply` twins of every
dev case, same labels; the production `buildLayaBuyerResponseInput` state, replicated
exactly in the harness).

| variant | semantic | handling | notes |
|---|---|---|---|
| v_verbatim (W3 question) | 52.0% (13/25) | 60.0% | decline over-prediction |
| v_verbatim_revopts | 60.0% (15/25) | 68.0% | option-order sensitive (+8pts) |
| v5_verbatim (explicit-refusal criteria) | 36.0% | 44.0% | rewording made it worse |
| v5_verbatim_revopts | 56.0% | 60.0% | bias persists |
| binary probe (4 yes/no questions) | 44.0% | 52.0% | worse; decomposition doesn't help |
| ANE bundle | refused | — | 96-token limit rejects all inputs |

- All **safeguards pass 100%** in every configuration (opt-out, needs_evidence, status_only).
- The failure mode is not wording: the model is **confidently wrong** (e.g. 0.97
  `declined` on "Thank you for the introduction. The butter sounds good."), so
  confidence-margin gating cannot rescue it.
- The earlier "9/10 verbatim" probe was a small sample; on the full dev set the
  model detects *requests* (6–8/8) and *refusals* (4–5/5) reliably, but collapses
  `deferred` / `no_commitment` / `unclear` into `declined` (~1/4 each).
- Both local bundles are the same weights (rev `052592a`); there is no larger
  local model to raise the ceiling.

**Verdict: the bar is not cleared. Wording not frozen; holdout NOT run (one-shot preserved).**

### Options for Pat

1. **Ship a 2-class slice only**: `requested_next_step` vs everything else is
   reliable (revopts: 8/8 requests, only 2 non-request cases misread as requests).
   UI: "buyer asked for something → priority", everything else → manual triage.
2. **Collapse to 3 classes** (`requested_next_step | declined | other`): measured
   ~68% on dev — still weak, and loses the deferral-timing signal.
3. **Use a larger model** for this question (a 1.7B-class instruct model scored
   ~88% in the earlier wording experiment lineage). Worker/bundles unchanged in shape.
4. **Ship as human-assist only**: keep `buyer_reply` capture + safeguards + the
   current pipeline, but always label output "suggestion — review manually" (no
   auto-handling). Safeguards already hard-block opt-outs.

Recommendation: option 1 now (high-precision priority flag), option 3 later if
on-device quality matters more than size.

## Decision (2026-09-23): option 1 shipped — wording frozen

Pat selected **option 1: ship the 2-class slice only**. Frozen configuration:

- Question wording + **reversed option order** (`v_verbatim_revopts`, the
  measured-best config) frozen in `buildLayaBuyerResponseInput`
  (`src/utils/lead-scoring.ts`) and mirrored byte-identically in the worker
  allowlist (`scripts/laya_score_server.py`); the boundary test keeps them
  locked together.
- App handling is `buyerResponseSignal(level, verbatim)`: only a **verbatim**
  `requested_next_step` raises the `buyer_requested` priority flag
  ("Buyer asked for something — prioritize this deal"). Every other class, and
  every paraphrased outcome note (`verbatim: false`), routes to manual triage
  with no model label. Safeguards unchanged (opt-out / needs_evidence /
  closed-parked stay hard code-layer blocks).
- **Holdout still unspent**: `laya_buyer_response.holdout.json` has no
  `buyer_reply` fields (it predates the verbatim pivot), so running the frozen
  verbatim config against it would measure the discredited third-person mode.
  Next evidence step: author verbatim twins of the 40 holdout cases (same
  labels), then spend the single holdout run on `v_verbatim_revopts`.
