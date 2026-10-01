# Fit wording and cut-offs on Typed Decisions — 2026-10-01

Reproduce: `/Users/pat/laya-coreml/.venv/bin/python scripts/tune_laya_cutoffs.py`
(raw numbers: `2026-10-01-cutoffs.json`). Model: `laya-typed-decisions-coreml`, package `517a8071`.

Method: every wording and cut-off was chosen mechanically on the **dev** sets
(`laya_prospect_fit.dev.json`, 22 accounts; `laya_buyer_detail.audit.json`, 30 replies).
Fresh **holdout** sets (`laya_prospect_fit.holdout.json`, 24 accounts;
`laya_buyer_detail.holdout.json`, 30 replies, 22 English / 8 Thai) were labelled before any
run and scored once with the frozen choices. All sets are synthetic and self-labelled; several
questions have only 3–5 positives per set, so treat differences under ~0.05 as noise.

## Prospect fit

The current wording won or tied on dev for all three archetypes, so it stays. The cut-off
moves from 0.50 to **0.35** (Typed Decisions answers fit questions lower than the multilingual
model did).

| | Dev | Holdout |
|---|---|---|
| Correct fit (highest Noul ≥ 0.35, else no_fit) | 18/22 | **18/24** |

Holdout misses: Thai "jay" vegetarian kitchen → no_fit; supermarket chain → no_fit; health-food
store → no_fit; vegan bakery → plant-based (label debatable: both apply); dairy importer →
grocery; name-only "Siam Golden Trading Co." → bakery (false positive at the lower cut-off).

## Buyer questions (holdout)

| Question | Form | Cut-off | Holdout AUC | English acc. (baseline) | Thai acc. |
|---|---|---|---|---|---|
| trial_positive | criteria | 0.60 | **0.99** | **21/21** (19) | 7/8 |
| trial_negative | plain | 0.25 | **0.96** | 17/21 (19) | 2/8 |
| concern_price | criteria | 0.45 | **0.93** | **21/22** (19) | 7/8 |
| concern_technical | criteria | 0.35 | **0.93** | **20/22** (19) | 5/8 |
| trial_reported | criteria | 0.55 | **0.90** | **20/22** (15) | 5/8 |
| concern_delivery | plain | 0.55 | 0.86 | 18/22 (19) | 7/8 |
| concern_timing | plain | 0.45 | 0.86 | 19/22 (18) | 4/8 |
| next_step_commitment | plain | 0.60 | 0.83 | 19/22 (19) | 6/8 |
| commercial_info_request | plain | 0.20 | 0.75 | 15/22 (17) | 2/8 |
| concern_approval | criteria | 0.50 | 0.72 | 19/22 (19) | 3/8 |

`buyer_response` probabilities on holdout: P(requested_next_step) AUC 0.87, P(declined) 0.89,
P(deferred) 0.87; the single pick 11/26.

## Findings

1. **Rankings transfer; several cut-offs do not.** Every question still ranks holdout replies
   well above chance, but only five beat their baseline on English at the dev cut-off.
2. **Thai is the main failure.** On the English-tokenizer model, Thai scores bunch around
   0.3–0.55 whatever the reply says; most holdout misses are Thai.
3. **commercial_info_request regressed** (dev AUC 0.88 → holdout 0.75) and its dev cut-off
   (0.20) flags too much. **concern_approval** is weak on both sets.

## Recommendation for grade.ts

- **Use as yes/no signals (English):** trial_reported, trial_positive, concern_price,
  concern_technical, with the cut-offs above.
- **Use as weighted probabilities, no yes/no:** trial_negative, concern_delivery, concern_timing,
  next_step_commitment, and buyer_response P(requested_next_step) / P(declined) / P(deferred).
- **Display only until reworked:** commercial_info_request, concern_approval.
- **Thai replies:** detect Thai script in code and route those to human review rather than
  applying these cut-offs; or keep a multilingual model for Thai only.

## Decisions after Pat's review (applied)

- **Labels:** health-food store → no_fit; a vegan bakery counts as plant_based (dev and
  holdout); a dairy importer stays no_fit for the published archetypes and is noted for a
  future importer_exporter class. The fit holdout has now informed a decision and is no
  longer a clean holdout.
- **Fit cut-off 0.30** (not 0.35), wording unchanged: Pat's must-fit cases — a Thai "jay"
  kitchen (0.34) and a supermarket chain (0.34) — both pass, at 41/46 across dev and
  relabelled holdout. Remaining misses: Thai-script bakery, specialty retail → bakery,
  vague "food" account → grocery, health-food store → grocery, dairy importer → grocery.
- **Name-only accounts are not judged** (code rule): a bare trading-company name was called a
  bakery. 177/179 CRM prospects have an industry, so this skips almost nothing.
- **Thai replies route to Pat** (`buyerResponseSignal` → owner_review; `routing.thai_script`).
- Cut-offs and tiers live in `src/utils/laya-cutoffs.json`; the deal set in
  `laya-questions.json` now carries the tuned wording of all ten buyer Nouls.
