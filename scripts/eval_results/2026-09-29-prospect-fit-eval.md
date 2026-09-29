# Prospect fit — offline evaluation (dev set, 2026-09-29)

Reproduce: `/Users/pat/laya-coreml/.venv/bin/python scripts/evaluate_laya_prospect_fit.py`
Model: `aac6fef/laya-multilingual-coreml` @ `052592a1`, `models/multilingual-1024`, cpu_gpu.
Fixtures: `scripts/fixtures/laya_prospect_fit.dev.json` — 22 synthetic accounts, labels
written before any inference, self-assigned (draft; not independently reviewed).

## Why this changed

- `role_support` asked whether "the assigned archetype" was unsupported, but the state
  never named an assigned archetype and parallel questions cannot see
  `archetype_select`'s answer. Measured: it returned > 0.5 ("unsupported") on **every**
  case — a constant, not a signal.
- `archetype_select` (one Choice over three archetypes + `no_fit`) matched **10/22** and
  chose `no_fit` **0/10** times: every restaurant, hotel, school or distributor landed on
  `modern_trade_specialty_retail`.

## What was tried (all on this dev set)

| State | Question | Per-archetype labels correct (of 66) |
|---|---|---|
| lists archetype ids | "Do the supplied name, industry and tags establish …" + custom criteria | 14 (answered yes to everything) |
| no list | same | 14 |
| plain sentence | same | 17 |
| plain sentence | short "Is this account a …?" + custom false/true criteria | 31 |
| plain sentence | short "Is this account a …?", default yes/no wording (kept) | **61** |

Two causes, both in the input: **naming the archetypes in the state** made the model read
them as evidence, and **long hedged instructions with custom criteria** pushed every Noul
toward yes. A control question ("Is this account a car dealership?") answered no on 21/22,
so the yes-bias was the prompt, not the model.

Retail was the hardest wording: "supermarket or grocery store, online or physical" fired on
restaurants; "shop that sells groceries to take home" said no to everything. "Is this
account a grocery retailer?" was kept. Iteration stopped there to avoid fitting 22 cases.

## Result

```
case                               expected                       old choice                     new fit                        plant/retail/bakery
clear-bakery                       bakery_patisserie_brands       bakery_patisserie_brands       bakery_patisserie_brands       0.01/0.10/0.82
clear-patisserie                   bakery_patisserie_brands       modern_trade_specialty_retail  bakery_patisserie_brands       0.03/0.82/0.85
dessert-brand                      bakery_patisserie_brands       bakery_patisserie_brands       bakery_patisserie_brands       0.01/0.28/0.80
thai-bakery                        bakery_patisserie_brands       plant_based_restaurant_cafe    modern_trade_specialty_retail  0.02/0.84/0.81
clear-vegan-cafe                   plant_based_restaurant_cafe    plant_based_restaurant_cafe    plant_based_restaurant_cafe    0.84/0.01/0.01
vegan-kitchen                      plant_based_restaurant_cafe    plant_based_restaurant_cafe    plant_based_restaurant_cafe    0.67/0.06/0.23
thai-jay                           plant_based_restaurant_cafe    modern_trade_specialty_retail  plant_based_restaurant_cafe    0.67/0.37/0.34
clear-grocery                      modern_trade_specialty_retail  modern_trade_specialty_retail  modern_trade_specialty_retail  0.01/0.95/0.48
online-grocery                     modern_trade_specialty_retail  modern_trade_specialty_retail  no_fit                         0.01/0.50/0.13
specialty-retail                   modern_trade_specialty_retail  modern_trade_specialty_retail  modern_trade_specialty_retail  0.05/0.87/0.15
vegan-bakery                       bakery_patisserie_brands       bakery_patisserie_brands       plant_based_restaurant_cafe    0.69/0.15/0.23
bakery-in-grocery                  modern_trade_specialty_retail  modern_trade_specialty_retail  modern_trade_specialty_retail  0.01/0.94/0.47
generic-restaurant                 no_fit                         plant_based_restaurant_cafe    modern_trade_specialty_retail  0.02/0.54/0.19
steakhouse                         no_fit                         modern_trade_specialty_retail  no_fit                         0.01/0.04/0.21
hotel                              no_fit                         modern_trade_specialty_retail  no_fit                         0.00/0.00/0.04
distributor                        no_fit                         modern_trade_specialty_retail  no_fit                         0.04/0.32/0.16
school                             no_fit                         modern_trade_specialty_retail  no_fit                         0.00/0.00/0.00
thin-name-only                     no_fit                         modern_trade_specialty_retail  no_fit                         0.00/0.00/0.05
vague-food                         no_fit                         modern_trade_specialty_retail  no_fit                         0.01/0.03/0.10
coffee-chain                       no_fit                         modern_trade_specialty_retail  no_fit                         0.01/0.06/0.38
name-says-bakery-industry-other    no_fit                         modern_trade_specialty_retail  no_fit                         0.02/0.07/0.30
tags-only-bakery                   bakery_patisserie_brands       bakery_patisserie_brands       bakery_patisserie_brands       0.01/0.23/0.79

archetype matches expected — old archetype_select: 10/22, new fit Nouls + code: 18/22
old role_support agrees with the labels on the chosen archetype: 12/22
new per-archetype fit labels correct: 61/66 (always answering no would score 52)
```

Misses: `thai-bakery` (retail 0.84 edges bakery 0.81), `online-grocery` (retail Noul just
under 0.5), `vegan-bakery` (label is debatable — both archetypes apply), and
`generic-restaurant` (retail 0.54).

## Caveats

- **The wording was chosen on this same set**, so 18/22 is optimistic. A fresh holdout set,
  labelled before running, is required before anything beyond the review-only /lab queue
  relies on these numbers.
- Synthetic accounts, self-labelled. Real CRM identities are messier (empty industry,
  Thai-only names, tags copied from other accounts).
- `FIT_THRESHOLD = 0.5` (`src/utils/prospectFit.ts`) is a default, not a tuned value.
