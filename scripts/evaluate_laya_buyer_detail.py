#!/usr/bin/env python3
"""Offline, synthetic-only audit of the buyer questions against labelled replies.

Scores each question variant over scripts/fixtures/laya_buyer_detail.audit.json
(labels written before inference; a null label skips that case for that question)
and prints per-question accuracy next to the majority-class baseline, so a question
that always gives the same answer cannot look good.

Variants:
  current   — the frozen `terminal` set in src/utils/laya-questions.json
  plain     — short yes/no rewrites with no criteria (model default wording)
  criteria  — the same questions with short one-line true/false criteria, as the
              Laya README advises ("criteria-less forms bias toward no")

The sample and obstacle Choices are also tested as one yes/no per type; their labels
are derived from the fixture's own sample_trial_report / obstacle_kind labels.

Loads the pinned local bundle directly (never the live worker).

Usage (repo root, laya-coreml venv):
  /Users/pat/laya-coreml/.venv/bin/python scripts/evaluate_laya_buyer_detail.py [--variant current|plain|criteria|all] [-v]
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import laya_coreml as laya  # noqa: E402
from laya_input import check_input_budget  # noqa: E402

DEFAULT_MODEL = "/Users/pat/laya-coreml/models/typed-decisions"
NOUL_THRESHOLD = 0.5

# (question, true criterion, false criterion). `plain` drops the criteria.
CANDIDATES = {
    "next_step_commitment": (
        "Does the buyer say they will do something next, such as test, order, pay, visit, or reply by a certain time?",
        "the buyer says what they will do next",
        "the buyer does not say what they will do next"),
    "commercial_info_request": (
        "Does the buyer ask about price, a quotation, minimum order, stock, pack size, or ordering terms?",
        "the buyer asks about price or ordering terms",
        "the buyer asks nothing about price or ordering terms"),
    "quantity_stated": (
        "Does the buyer mention how much they want to order, such as kilograms, cases, or an amount per month?",
        "the buyer names an order amount",
        "the buyer names no order amount"),
    "current_supplier": (
        "Does the buyer say they currently buy this kind of product from another supplier?",
        "the buyer mentions their current supplier",
        "the buyer does not mention a current supplier"),
    "timeline_stated": (
        "Does the buyer give a date or time frame for ordering, delivery, testing, or a decision?",
        "the buyer gives a date or time frame",
        "the buyer gives no date or time frame"),
    "trial_reported": (
        "Does the buyer say they received, are testing, or tested our sample?",
        "the buyer reports on our sample",
        "the buyer says nothing about receiving or testing a sample"),
    "trial_positive": (
        "Does the buyer say our sample worked well in their test?",
        "the buyer reports a good test result",
        "the buyer reports no good test result"),
    "trial_negative": (
        "Does the buyer say our sample did not work well in their test?",
        "the buyer reports a bad test result",
        "the buyer reports no bad test result"),
    "concern_price": (
        "Is the buyer concerned about price or payment terms?",
        "the buyer raises a price concern",
        "the buyer raises no price concern"),
    "concern_technical": (
        "Is the buyer concerned about how the product performs, tastes, or works in their recipes?",
        "the buyer raises a product performance concern",
        "the buyer raises no product performance concern"),
    "concern_delivery": (
        "Is the buyer concerned about delivery, stock, or lead time?",
        "the buyer raises a delivery concern",
        "the buyer raises no delivery concern"),
    "concern_approval": (
        "Does the buyer need someone else's approval before going ahead?",
        "the buyer needs someone else's approval",
        "the buyer does not mention needing approval"),
    "concern_timing": (
        "Does the buyer say now is not the right time, or ask to wait until later?",
        "the buyer asks to wait or says the timing is wrong",
        "the buyer does not ask to wait"),
}


def candidate_questions(with_criteria: bool) -> dict:
    questions = {}
    for qid, (instructions, true_text, false_text) in CANDIDATES.items():
        question = {"type": "noul", "instructions": instructions}
        if with_criteria:
            question["criteria"] = {"false": false_text, "true": true_text}
        questions[qid] = question
    return questions


def derived_labels(case: dict) -> dict:
    """Per-type yes/no labels from the fixture's Choice labels; None = ambiguous, skipped."""
    sample, obstacle = case.get("sample_trial_report"), case.get("obstacle_kind")
    labels = {
        "trial_reported": None if sample is None else sample != "not_established",
        "trial_positive": None if sample in (None, "mixed_result") else sample == "positive_result",
        "trial_negative": None if sample in (None, "mixed_result") else sample == "negative_result",
    }
    for qid, kind in [("concern_price", "price_terms"), ("concern_technical", "application_technical"),
                      ("concern_delivery", "delivery"), ("concern_approval", "internal_approval"),
                      ("concern_timing", "timing")]:
        labels[qid] = None if obstacle in (None, "unclear") else obstacle == kind
    return labels


def state_of(reply: str) -> str:
    """Byte-for-byte buildLayaBuyerResponseInput for a verbatim reply."""
    return f'We supply Butter to this account. The buyer\'s latest reply: "{reply}"'


def answer_value(question: dict, answer: dict):
    if question["type"] == "noul":
        return answer["noul"] >= NOUL_THRESHOLD
    if question["type"] == "choice":
        return answer["choice"]
    probabilities = answer["probabilities"]
    return int(max(probabilities, key=lambda level: probabilities[level]))


def auc(scores: list[float], labels: list[bool]) -> float | None:
    positives = [s for s, l in zip(scores, labels) if l]
    negatives = [s for s, l in zip(scores, labels) if not l]
    if not positives or not negatives:
        return None
    wins = sum((p > n) + 0.5 * (p == n) for p in positives for n in negatives)
    return wins / (len(positives) * len(negatives))


def run(agent, name: str, questions: dict, cases: list[dict], verbose: bool) -> None:
    rows = []
    for case in cases:
        state = state_of(case["reply"])
        check_input_budget(agent, state, questions)
        rows.append(({**case, **derived_labels(case)}, agent.predict(state, questions)["answers"]))

    print(f"\n== {name}")
    print(f"{'question':26} {'correct':>9} {'baseline':>9} {'AUC':>5}  misses")
    for qid, question in questions.items():
        scored = [(c, a) for c, a in rows if c.get(qid) is not None]
        if not scored:
            continue
        predicted = [answer_value(question, a[qid]) for _, a in scored]
        labels = [c[qid] for c, _ in scored]
        correct = sum(p == l for p, l in zip(predicted, labels))
        baseline = Counter(labels).most_common(1)[0][1]
        misses = [f"{c['id']}={p}" for (c, _), p, l in zip(scored, predicted, labels) if p != l]
        ranking = "  -  "
        if question["type"] == "noul":
            value = auc([a[qid]["noul"] for _, a in scored], labels)
            ranking = f"{value:5.2f}" if value is not None else "  -  "
        extra = ""
        if question["type"] == "score":
            within = sum(abs(p - l) <= 1 for p, l in zip(predicted, labels))
            extra = f" (within 1: {within})"
        print(f"{qid:26} {correct:>4}/{len(scored):<4} {baseline:>4}/{len(scored):<4} {ranking}{extra}  "
              f"{', '.join(misses) if verbose else len(misses)}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--fixtures", default=str(ROOT / "scripts/fixtures/laya_buyer_detail.audit.json"))
    parser.add_argument("--variant", choices=["current", "plain", "criteria", "all"], default="all")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    frozen = json.loads((ROOT / "src/utils/laya-questions.json").read_text(encoding="utf-8"))
    current = {qid: frozen["questions"][qid] for qid in frozen["sets"]["terminal"]}
    manifest = json.loads((Path(args.model) / "coreml_config.json").read_text(encoding="utf-8"))
    engine = {"laya-coreml-ane": "cpu_ne", "laya-coreml": "cpu_gpu"}[manifest["format"]]
    agent = laya.load(args.model, local_files_only=True, compute_units=engine)
    cases = json.loads(Path(args.fixtures).read_text(encoding="utf-8"))["cases"]

    if args.variant in ("current", "all"):
        run(agent, "current (frozen terminal set)", current, cases, args.verbose)
    if args.variant in ("plain", "all"):
        run(agent, "plain yes/no, no criteria", candidate_questions(False), cases, args.verbose)
    if args.variant in ("criteria", "all"):
        run(agent, "yes/no with short true/false criteria", candidate_questions(True), cases, args.verbose)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
