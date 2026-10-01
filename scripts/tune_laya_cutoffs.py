#!/usr/bin/env python3
"""Choose fit wording and per-question cut-offs on DEV sets, then score HOLDOUT sets once.

Every choice is made mechanically from dev data only; the holdout sets are scored after
the choices are frozen, so the holdout numbers are an honest estimate.

Dev:     scripts/fixtures/laya_prospect_fit.dev.json, laya_buyer_detail.audit.json
Holdout: scripts/fixtures/laya_prospect_fit.holdout.json, laya_buyer_detail.holdout.json

  fit    — per archetype, the wording with the best dev AUC; then one cut-off T for
           "highest fit Noul >= T, else no_fit", maximising dev accuracy
  buyer  — per question, plain or short-criteria wording by dev AUC; then the cut-off
           maximising dev balanced accuracy (sensitivity + specificity), so a rare yes
           is not traded away for "always no"

Writes scripts/eval_results/2026-10-01-cutoffs.json.

Usage (repo root, laya-coreml venv):
  /Users/pat/laya-coreml/.venv/bin/python scripts/tune_laya_cutoffs.py
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import laya_coreml as laya  # noqa: E402

MODEL = "/Users/pat/laya-coreml/models/typed-decisions"
FIX = ROOT / "scripts/fixtures"
ARCHETYPES = ["plant_based_restaurant_cafe", "modern_trade_specialty_retail", "bakery_patisserie_brands"]
GRID = [round(0.05 * i, 2) for i in range(1, 20)]

FIT_WORDINGS = {
    "plant_based_restaurant_cafe": [
        "Is this account a vegan or plant-based restaurant or cafe?",
        "Does this account serve vegan or plant-based food in a restaurant or cafe?",
        "Is this account a restaurant or cafe with a vegan or plant-based menu?",
    ],
    "modern_trade_specialty_retail": [
        "Is this account a grocery retailer?",
        "Is this account a supermarket, grocery store, or online grocery shop?",
        "Does this account sell groceries or packaged food to shoppers?",
        "Is this account a shop that sells food products to consumers?",
    ],
    "bakery_patisserie_brands": [
        "Is this account a bakery, patisserie, or dessert maker?",
        "Does this account bake its own bread, pastries, cakes, or desserts?",
        "Is this account a bakery, cake shop, or pastry brand?",
    ],
}
BUYER_QUESTIONS = [
    "commercial_info_request", "next_step_commitment",
    "trial_reported", "trial_positive", "trial_negative",
    "concern_price", "concern_technical", "concern_delivery", "concern_approval", "concern_timing",
]


def load_module(name: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / f"scripts/{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


detail = load_module("evaluate_laya_buyer_detail")
fitmod = load_module("evaluate_laya_prospect_fit")


def auc(scores, labels):
    return detail.auc(scores, labels)


def balanced_accuracy(scores, labels, cut):
    pos = [s for s, l in zip(scores, labels) if l]
    neg = [s for s, l in zip(scores, labels) if not l]
    tpr = sum(s >= cut for s in pos) / len(pos) if pos else 0.0
    tnr = sum(s < cut for s in neg) / len(neg) if neg else 0.0
    return (tpr + tnr) / 2


def best_cut(scores, labels, objective):
    """Best grid cut-off; ties resolve to the median of the tied cut-offs."""
    values = [objective(scores, labels, cut) for cut in GRID]
    top = max(values)
    tied = [cut for cut, v in zip(GRID, values) if v == top]
    return tied[len(tied) // 2], top


def noul(question: str) -> dict:
    return {"type": "noul", "instructions": question}


# ─── fit ──────────────────────────────────────────────────────────────────────

def fit_scores(agent, cases, wordings):
    questions = {f"fit_{a}": noul(wordings[a]) for a in ARCHETYPES}
    return [{a: agent.predict(fitmod.new_state(c), questions)["answers"][f"fit_{a}"]["noul"] for a in ARCHETYPES}
            for c in cases]


def fit_choice(support, cut):
    best = max(ARCHETYPES, key=lambda a: support[a])
    return best if support[best] >= cut else "no_fit"


def tune_fit(agent, dev, holdout):
    chosen = {}
    for archetype, options in FIT_WORDINGS.items():
        ranked = []
        for wording in options:
            q = {"q": noul(wording)}
            scores = [agent.predict(fitmod.new_state(c), q)["answers"]["q"]["noul"] for c in dev]
            labels = [archetype in c["supported"] for c in dev]
            ranked.append((auc(scores, labels), wording))
        ranked.sort(key=lambda r: -r[0])
        chosen[archetype] = ranked[0][1]
        print(f"fit {archetype}:")
        for value, wording in ranked:
            print(f"   AUC {value:.2f}  {wording}{'   <- chosen' if wording == chosen[archetype] else ''}")

    dev_support = fit_scores(agent, dev, chosen)
    accuracy = lambda _s, _l, cut: sum(fit_choice(s, cut) == c["archetype"] for s, c in zip(dev_support, dev))
    cut, dev_correct = best_cut(None, None, accuracy)
    hold_support = fit_scores(agent, holdout, chosen)
    hold_correct = sum(fit_choice(s, cut) == c["archetype"] for s, c in zip(hold_support, holdout))
    hold_misses = [f"{c['id']}={fit_choice(s, cut)}" for s, c in zip(hold_support, holdout) if fit_choice(s, cut) != c["archetype"]]
    print(f"fit cut-off {cut}: dev {dev_correct}/{len(dev)}, HOLDOUT {hold_correct}/{len(holdout)}")
    print(f"   holdout misses: {', '.join(hold_misses) or 'none'}")
    return {"wording": chosen, "cutoff": cut, "dev_correct": dev_correct, "dev_n": len(dev),
            "holdout_correct": hold_correct, "holdout_n": len(holdout), "holdout_misses": hold_misses}


# ─── buyer questions ─────────────────────────────────────────────────────────

def buyer_rows(agent, cases, questions, derive):
    rows = []
    for case in cases:
        labels = {**case, **(detail.derived_labels(case) if derive else {})}
        answers = agent.predict(detail.state_of(case["reply"]), questions)["answers"]
        rows.append((labels, answers))
    return rows


def tune_buyer(agent, dev_cases, hold_cases):
    plain = {q: v for q, v in detail.candidate_questions(False).items() if q in BUYER_QUESTIONS}
    crit = {q: v for q, v in detail.candidate_questions(True).items() if q in BUYER_QUESTIONS}
    dev_plain = buyer_rows(agent, dev_cases, plain, derive=True)
    dev_crit = buyer_rows(agent, dev_cases, crit, derive=True)

    results, final_questions = {}, {}
    for qid in BUYER_QUESTIONS:
        options = []
        for name, rows, questions in (("plain", dev_plain, plain), ("criteria", dev_crit, crit)):
            scored = [(l[qid], a[qid]["noul"]) for l, a in rows if l.get(qid) is not None]
            options.append((auc([s for _, s in scored], [l for l, _ in scored]), name, scored, questions[qid]))
        options.sort(key=lambda o: -o[0])
        dev_auc, form, scored, question = options[0]
        cut, dev_bal = best_cut([s for _, s in scored], [l for l, _ in scored], balanced_accuracy)
        final_questions[qid] = question
        results[qid] = {"form": form, "question": question, "cutoff": cut,
                        "dev_auc": round(dev_auc, 3), "dev_balanced_accuracy": round(dev_bal, 3),
                        "dev_positives": sum(l for l, _ in scored), "dev_n": len(scored)}

    hold = buyer_rows(agent, hold_cases, final_questions, derive=False)
    print(f"\n{'question':26} {'form':9} {'cut':>5} {'dev AUC':>8} {'HOLD AUC':>9} {'HOLD bal.acc':>12} {'HOLD acc':>9} {'pos':>4}")
    for qid in BUYER_QUESTIONS:
        r = results[qid]
        scored = [(l[qid], a[qid]["noul"]) for l, a in hold if l.get(qid) is not None]
        scores, labels = [s for _, s in scored], [l for l, _ in scored]
        hold_auc = auc(scores, labels)
        r.update({
            "holdout_auc": None if hold_auc is None else round(hold_auc, 3),
            "holdout_balanced_accuracy": round(balanced_accuracy(scores, labels, r["cutoff"]), 3),
            "holdout_accuracy": f"{sum((s >= r['cutoff']) == l for l, s in scored)}/{len(scored)}",
            "holdout_positives": sum(labels),
            "holdout_misses": [f"{l2['id']}={a[qid]['noul']:.2f}" for l2, a in hold
                               if l2.get(qid) is not None and (a[qid]["noul"] >= r["cutoff"]) != l2[qid]],
        })
        print(f"{qid:26} {r['form']:9} {r['cutoff']:5.2f} {r['dev_auc']:8.2f} "
              f"{(r['holdout_auc'] or 0):9.2f} {r['holdout_balanced_accuracy']:12.2f} {r['holdout_accuracy']:>9} {r['holdout_positives']:4}")
    return results


def buyer_response_holdout(agent, hold_cases):
    frozen = json.loads((ROOT / "src/utils/laya-questions.json").read_text(encoding="utf-8"))
    q = {"buyer_response": frozen["questions"]["buyer_response"]}
    cases = [c for c in hold_cases if c.get("buyer_response")]
    answers = [agent.predict(detail.state_of(c["reply"]), q)["answers"]["buyer_response"] for c in cases]
    out = {}
    for label in ("requested_next_step", "declined", "deferred"):
        scores = [a["probabilities"][label] for a in answers]
        labels = [c["buyer_response"] == label for c in cases]
        value = auc(scores, labels)
        out[f"P({label})"] = {"holdout_auc": None if value is None else round(value, 3), "positives": sum(labels)}
    out["pick_correct"] = f"{sum(a['choice'] == c['buyer_response'] for a, c in zip(answers, cases))}/{len(cases)}"
    print(f"\nbuyer_response on HOLDOUT: {json.dumps(out)}")
    return out


def main() -> int:
    agent = laya.load(MODEL, local_files_only=True, compute_units="cpu_gpu")
    fit_dev = json.loads((FIX / "laya_prospect_fit.dev.json").read_text(encoding="utf-8"))["cases"]
    fit_hold = json.loads((FIX / "laya_prospect_fit.holdout.json").read_text(encoding="utf-8"))["cases"]
    buyer_dev = json.loads((FIX / "laya_buyer_detail.audit.json").read_text(encoding="utf-8"))["cases"]
    buyer_hold = json.loads((FIX / "laya_buyer_detail.holdout.json").read_text(encoding="utf-8"))["cases"]

    report = {
        "model": "aac6fef/laya-typed-decisions-coreml @ f9ab0b22 (package 517a8071)",
        "grid": GRID,
        "fit": tune_fit(agent, fit_dev, fit_hold),
        "buyer": tune_buyer(agent, buyer_dev, buyer_hold),
        "buyer_response": buyer_response_holdout(agent, buyer_hold),
    }
    out = ROOT / "scripts/eval_results/2026-10-01-cutoffs.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nwrote {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
