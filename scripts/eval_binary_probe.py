#!/usr/bin/env python3
"""Dev-only probe: can the narrow buyer-response task be decomposed into binary
yes/no questions that the small model answers more reliably than one 5-class question?

Derivation rule (first match wins): request -> requested_next_step; refusal -> declined;
contact-later -> deferred; positive -> no_commitment; else unclear.

NOT production code and NOT a holdout run. Dev fixture only.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from evaluate_laya_buyer_response import (  # noqa: E402
    DEFAULT_MODEL, InputRejected, SEMANTIC_TO_HANDLING, _verbatim_state,
    check_input_budget, load_agent, safeguard)

BINARY_QUESTIONS = {
    "q_request": {"type": "choice",
                  "instructions": "Does the buyer's latest message ask for something concrete, "
                                  "such as a sample, quotation, order, meeting, or pricing?",
                  "criteria": {"yes": "the message asks for one of these",
                               "no": "the message asks for none of these"}},
    "q_refusal": {"type": "choice",
                  "instructions": "Does the buyer's latest message say they will not buy, "
                                  "that they are not interested, or that they chose another supplier?",
                  "criteria": {"yes": "the message refuses or rules out buying",
                               "no": "the message does not refuse"}},
    "q_later": {"type": "choice",
                "instructions": "Does the buyer's latest message ask to be contacted again "
                                "later or after a stated time?",
                "criteria": {"yes": "the message asks to revisit later",
                             "no": "the message does not ask to revisit later"}},
    "q_positive": {"type": "choice",
                   "instructions": "Does the buyer's latest message express interest in or "
                                   "a positive view of the product?",
                   "criteria": {"yes": "the message is positive or interested",
                                "no": "the message is neutral, negative, or absent"}},
}


def derive(answers: dict) -> str:
    if answers["q_request"]["choice"] == "yes":
        return "requested_next_step"
    if answers["q_refusal"]["choice"] == "yes":
        return "declined"
    if answers["q_later"]["choice"] == "yes":
        return "deferred"
    if answers["q_positive"]["choice"] == "yes":
        return "no_commitment"
    return "unclear"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixtures", default="scripts/fixtures/laya_buyer_response.dev.verbatim.json")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    args = parser.parse_args()

    data = json.loads(Path(args.fixtures).read_text(encoding="utf-8"))
    agent, _meta = load_agent(args.model)

    # Safeguard assertions must all pass before any scoring claim.
    bad = [c["id"] for c in data.get("safety", []) + data["scoreable"]
           if c.get("expected_handling") in ("needs_evidence", "not_scored_opt_out", "status_only")
           and safeguard(c) != c.get("expected_handling")]
    if bad:
        print(f"SAFEGUARD FAILURES: {bad}")
        return 1
    print("safeguards: all pass")

    rows, latencies = [], []
    for case in data["scoreable"]:
        if not case.get("expected_semantic"):
            continue
        state = _verbatim_state(case)
        started = time.perf_counter()
        try:
            check_input_budget(agent, state, BINARY_QUESTIONS)
        except InputRejected as exc:
            rows.append({"id": case["id"], "status": "refused", "code": exc.payload["code"]})
            continue
        answers = agent.predict(state, BINARY_QUESTIONS)["answers"]
        for key, spec in BINARY_QUESTIONS.items():
            ans = answers[key]
            assert ans["choice"] in spec["criteria"] and set(ans["probabilities"]) == set(spec["criteria"])
        latencies.append((time.perf_counter() - started) * 1000)
        got = derive(answers)
        expected = case["expected_semantic"]
        rows.append({"id": case["id"], "expected": expected, "got": got,
                     "semantic_match": got == expected,
                     "handling_match": SEMANTIC_TO_HANDLING.get(got) == case.get("expected_handling"),
                     "answers": {k: {"choice": v["choice"], "confidence": round(v["confidence"], 3)}
                                 for k, v in answers.items()}})

    scored = [r for r in rows if r.get("status") != "refused"]
    per_class: dict[str, list[bool]] = {}
    for r in scored:
        per_class.setdefault(r["expected"], []).append(bool(r["semantic_match"]))
    n_sem = sum(r["semantic_match"] for r in scored)
    n_hand = sum(r["handling_match"] for r in scored)
    confusion = Counter(f"{r['expected']} -> {r['got']}" for r in scored if not r["semantic_match"])
    print(f"\nsemantic: {n_sem}/{len(scored)} ({round(100 * n_sem / len(scored), 1)}%)   "
          f"handling: {n_hand}/{len(scored)} ({round(100 * n_hand / len(scored), 1)}%)")
    for k, v in sorted(per_class.items()):
        print(f"  {k}: {sum(v)}/{len(v)}")
    print("\nfailures:")
    for r in scored:
        if not r["semantic_match"]:
            print(f"  {r['id']:24s} {r['expected']:>20s} -> {r['got']:<20s} {r['answers']}")
    if latencies:
        latencies.sort()
        print(f"\nlatency ms p50={round(latencies[len(latencies)//2],1)} "
              f"p95={round(latencies[min(len(latencies)-1, int(len(latencies)*0.95))],1)} "
              f"(4 questions per case)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
