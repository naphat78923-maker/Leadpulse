#!/usr/bin/env python3
"""Offline audit: order quantity tiers, Laya Choice vs a deterministic code rule.

Tiers (Pat, 2026-10-01): small < 5 kg, moderate 5-15 kg, large > 15 kg, or none_stated.
Fixture: scripts/fixtures/laya_quantity.audit.json (labels written before inference).

  choice — one Laya Choice over the four tiers
  code   — read the amount from the text (kg / g / กิโล / กก. / half a kilo, "two 10 kg
           cases"), ignoring sample amounts, then bucket it in code

Usage (repo root, laya-coreml venv):
  /Users/pat/laya-coreml/.venv/bin/python scripts/evaluate_laya_quantity.py [-v]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

DEFAULT_MODEL = "/Users/pat/laya-coreml/models/typed-decisions"
TIERS = ["none_stated", "small", "moderate", "large"]

QUANTITY_CHOICE = {
    "quantity_tier": {
        "type": "choice",
        "instructions": "How much does the buyer say they want to order?",
        "criteria": {
            "none_stated": "no order amount is mentioned; a sample amount is not an order",
            "small": "under 5 kg",
            "moderate": "5 to 15 kg",
            "large": "over 15 kg",
        },
    }
}

NUMBER_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "ten": 10}
KG_UNIT = r"(?:kg|kgs|kilo|kilos|kilogram|kilograms|กิโลกรัม|กิโล|กก\.?)"
G_UNIT = r"(?:g|gram|grams|กรัม)"


def kilograms_stated(text: str) -> float | None:
    """The order amount in kg stated in the text, or None.

    Sentences that mention a sample are skipped: a sample amount is not an order, but
    "We tested the sample. Please quote 40 kg" still states an order of 40 kg.
    """
    sentences = re.split(r"(?<=[.!?])\s+|\n+", text.lower())
    lowered = " ".join(s for s in sentences if not re.search(r"\bsamples?\b|ตัวอย่าง", s))
    if not lowered.strip():
        return None
    if re.search(r"half\s+a?\s*kilo|ครึ่งกิโล", lowered):
        return 0.5
    # "two 10 kg cases" -> 2 x 10
    multiplied = re.search(rf"\b({'|'.join(NUMBER_WORDS)}|\d+)\s+(\d+(?:\.\d+)?)\s*{KG_UNIT}", lowered)
    if multiplied:
        count = NUMBER_WORDS.get(multiplied.group(1)) or float(multiplied.group(1))
        return count * float(multiplied.group(2))
    kg = re.search(rf"(\d+(?:\.\d+)?)\s*{KG_UNIT}", lowered)
    if kg:
        return float(kg.group(1))
    grams = re.search(rf"(\d+(?:\.\d+)?)\s*{G_UNIT}\b", lowered)
    if grams:
        return float(grams.group(1)) / 1000
    return None


def tier_of(kg: float | None) -> str:
    if kg is None:
        return "none_stated"
    if kg < 5:
        return "small"
    return "moderate" if kg <= 15 else "large"


def state_of(reply: str) -> str:
    return f'We supply Butter to this account. The buyer\'s latest reply: "{reply}"'


def report(name: str, predicted: list[str], cases: list[dict], verbose: bool) -> None:
    labels = [c["quantity"] for c in cases]
    correct = sum(p == l for p, l in zip(predicted, labels))
    baseline = Counter(labels).most_common(1)[0][1]
    print(f"\n== {name}: {correct}/{len(cases)} correct (baseline {baseline}/{len(cases)})")
    for tier in TIERS:
        idx = [i for i, l in enumerate(labels) if l == tier]
        hit = sum(predicted[i] == tier for i in idx)
        print(f"   {tier:12} {hit}/{len(idx)}")
    for c, p in zip(cases, predicted):
        if p != c["quantity"] and verbose:
            print(f"   miss {c['id']:28} expected {c['quantity']:12} got {p}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--fixtures", default=str(ROOT / "scripts/fixtures/laya_quantity.audit.json"))
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    cases = [c for c in json.loads(Path(args.fixtures).read_text(encoding="utf-8"))["cases"] if c["quantity"]]
    report("code rule", [tier_of(kilograms_stated(c["reply"])) for c in cases], cases, args.verbose)

    import laya_coreml as laya
    from laya_input import check_input_budget

    manifest = json.loads((Path(args.model) / "coreml_config.json").read_text(encoding="utf-8"))
    engine = {"laya-coreml-ane": "cpu_ne", "laya-coreml": "cpu_gpu"}[manifest["format"]]
    agent = laya.load(args.model, local_files_only=True, compute_units=engine)
    predicted = []
    for case in cases:
        state = state_of(case["reply"])
        check_input_budget(agent, state, QUANTITY_CHOICE)
        predicted.append(agent.predict(state, QUANTITY_CHOICE)["answers"]["quantity_tier"]["choice"])
    report("Laya Choice", predicted, cases, args.verbose)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
