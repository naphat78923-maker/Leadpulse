#!/usr/bin/env python3
"""Synthetic-only evaluation of LeadPulse's frozen customer-signals questions.

The evaluator imports the production worker contract and pinned local Laya model,
preflights the complete state with the production tokenizer guard, and records
raw, case-level answers. The raw inference intentionally bypasses the worker's
explicit opt-out short-circuit so possible_contact_stop is measured; a separate
field records whether the production deterministic gate would hold that input.
No CRM data, cloud inference, truncation, or outreach action is involved.

Example (from the repo root, with the local laya-coreml venv):
  /Users/pat/laya-coreml/.venv/bin/python scripts/evaluate_laya_customer_signals.py \
    --partition development \
    --development scripts/fixtures/laya_customer_signals_v1.development.json \
    --heldout scripts/fixtures/laya_customer_signals_v1.heldout.json \
    --out scripts/eval_results/customer_signals_v1.development.jsonl
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_DIR = SCRIPT_DIR.parent
DEFAULT_MODEL = "/Users/pat/laya-coreml/models/multilingual-1024"
QUESTION_KEYS = (
    "possible_contact_stop",
    "requested_deferral",
    "unresolved_problem",
    "main_customer_need",
)
N0UL_KEYS = QUESTION_KEYS[:3]
NEED_OPTIONS = {
    "answer_question",
    "resolve_problem",
    "arrange_sample",
    "order_request",
    "reconnect_later",
    "unclear",
}
REVIEW_THRESHOLD = 0.5  # Existing provisional application threshold; not tuned here.
N0UL_UNCERTAINTY_BAND = (0.45, 0.55)  # Descriptive diagnostic only, not a policy.
CHOICE_MARGIN_UNCERTAINTY = 0.10  # Descriptive diagnostic only, not a policy.


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Fixture root must be an object: {path}")
    return value


def validate_partitions(development: dict[str, Any], heldout: dict[str, Any]) -> None:
    if development.get("schema") != "customer_signals_eval_v1" or heldout.get("schema") != "customer_signals_eval_v1":
        raise ValueError("Unexpected evaluation fixture schema")
    if development.get("partition") != "development" or heldout.get("partition") != "heldout":
        raise ValueError("Fixture files must remain in separate development and held-out partitions")
    if development.get("version") != heldout.get("version"):
        raise ValueError("Development and held-out fixture versions differ")

    seen_ids: set[str] = set()
    seen_text_hashes: set[str] = set()
    for fixture in (development, heldout):
        cases = fixture.get("scoreable")
        controls = fixture.get("controls")
        if not isinstance(cases, list) or not isinstance(controls, list) or not cases:
            raise ValueError("Each partition needs scoreable cases and controls")
        for case in cases:
            if not isinstance(case, dict) or not isinstance(case.get("id"), str):
                raise ValueError("Every scoreable case needs an id")
            case_id = case["id"]
            if case_id in seen_ids:
                raise ValueError(f"Duplicate case id across partitions: {case_id}")
            seen_ids.add(case_id)
            if case.get("language") not in {"en", "th", "mixed"}:
                raise ValueError(f"Unsupported language label in {case_id}")
            expected = case.get("expected")
            if not isinstance(expected, dict) or set(expected) != set(QUESTION_KEYS):
                raise ValueError(f"Missing expected judgments in {case_id}")
            if any(not isinstance(expected[key], bool) for key in N0UL_KEYS):
                raise ValueError(f"Noul labels must be booleans in {case_id}")
            if expected["main_customer_need"] not in NEED_OPTIONS:
                raise ValueError(f"Invalid customer-need label in {case_id}")
            if not isinstance(case.get("families"), list) or not case["families"]:
                raise ValueError(f"Case family tags are required in {case_id}")
            if not isinstance(case.get("evidence"), list) or not case["evidence"]:
                raise ValueError(f"Scoreable case needs evidence in {case_id}")
            if not isinstance(case.get("rationale"), str) or not case["rationale"].strip():
                raise ValueError(f"A label rationale is required in {case_id}")
            texts = [item.get("text", "") for item in case["evidence"]]
            text_hash = hashlib.sha256("\n".join(texts).encode("utf-8")).hexdigest()
            if text_hash in seen_text_hashes:
                raise ValueError(f"Duplicate evidence text across partitions: {case_id}")
            seen_text_hashes.add(text_hash)
        for case in controls:
            if case.get("id") in seen_ids:
                raise ValueError(f"Duplicate case id across partitions: {case.get('id')}")
            seen_ids.add(case.get("id"))
            if case.get("kind") not in {"missing_evidence", "input_too_long"}:
                raise ValueError(f"Unknown control kind in {case.get('id')}")
            if case.get("expected_handling") not in {"not_assessed", "not_assessed_input_too_long"}:
                raise ValueError(f"Invalid control expectation in {case.get('id')}")


def build_state(case: dict[str, Any]) -> dict[str, Any]:
    if case.get("kind") == "input_too_long":
        long_text = case["repeat_text"] * case["repeat_count"]
        evidence = [
            {
                "source_kind": "deal.buyer_reply",
                "direction": "inbound",
                "observed_at": None,
                "text": long_text,
            }
            for _ in range(3)
        ]
    else:
        evidence = [
            {
                "source_kind": "deal.buyer_reply",
                "direction": "inbound",
                "observed_at": item.get("observed_at"),
                "text": item["text"],
            }
            for item in case.get("evidence", [])
        ]
    return {"evidence": evidence, "date_candidates": []}


def compact_state(state: dict[str, Any]) -> str:
    return json.dumps(state, ensure_ascii=False, separators=(",", ":"))


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, math.ceil(fraction * len(ordered)) - 1))
    return round(ordered[index], 2)


def distribution_summary(values: list[float]) -> dict[str, float | None]:
    if not values:
        return {"min": None, "p50": None, "p95": None, "max": None}
    return {
        "min": round(min(values), 2),
        "p50": round(statistics.median(values), 2),
        "p95": percentile(values, 0.95),
        "max": round(max(values), 2),
    }


def score_case(worker: Any, case: dict[str, Any], meta: dict[str, Any]) -> dict[str, Any]:
    state = build_state(case)
    state_text = compact_state(state)
    questions = worker.build_customer_signal_questions(state)
    if list(questions) != list(worker.CUSTOMER_SIGNAL_BASE_QUESTIONS):
        raise ValueError(f"Unexpected questions (callback dates must be absent): {case['id']}")
    if not worker.validate_customer_signal_request(state_text, questions):
        raise ValueError(f"Case does not match the production worker contract: {case['id']}")

    started = time.perf_counter()
    worker_precheck_hold = worker.has_explicit_contact_opt_out(state_text)
    try:
        # Deliberately call the real model even when the production opt-out
        # precheck would short-circuit, so the model's own Noul is measured.
        worker.check_input_budget(worker.AGENT, state_text, questions)
        prepared, _ = worker.AGENT.prepare(state_text, questions)
        input_tokens_by_question = {
            key: len(item['ids']) for key, item in zip(questions, prepared)
        }
        result = worker.AGENT.predict(state_text, questions)
        answers = worker.validate_score_answers(result, questions)
    except Exception as exc:
        # Do not serialize exception text: upstream errors may echo model input.
        return {
            "id": case["id"],
            "partition": case["partition"],
            "language": case["language"],
            "families": case["families"],
            "status": "inference_error",
            "error_type": type(exc).__name__,
            "worker_precheck_hold": worker_precheck_hold,
            "outreach_authorization": "not_established",
            "expected": case["expected"],
            "rationale": case["rationale"],
            "model": meta,
        }
    elapsed_ms = (time.perf_counter() - started) * 1000

    predictions: dict[str, Any] = {}
    uncertainties: dict[str, Any] = {}
    errors: dict[str, Any] = {}
    for key in N0UL_KEYS:
        probability = float(answers[key]["noul"])
        prediction = probability >= REVIEW_THRESHOLD
        predictions[key] = prediction
        uncertainties[key] = N0UL_UNCERTAINTY_BAND[0] <= probability <= N0UL_UNCERTAINTY_BAND[1]
        if prediction != case["expected"][key]:
            errors[key] = {"expected": case["expected"][key], "predicted": prediction, "noul": probability}

    choice_answer = answers["main_customer_need"]
    choice = choice_answer["choice"]
    probabilities = choice_answer["probabilities"]
    ranked = sorted(probabilities.items(), key=lambda item: item[1], reverse=True)
    top_two_margin = float(ranked[0][1]) - float(ranked[1][1])
    predictions["main_customer_need"] = choice
    uncertainties["main_customer_need"] = {
        "thin_lead": top_two_margin <= CHOICE_MARGIN_UNCERTAINTY,
        "top_probability_below_half": float(ranked[0][1]) < 0.5,
        "top_two_margin": round(top_two_margin, 4),
    }
    allowed = case.get("allowed_alternatives", {}).get("main_customer_need", [])
    if choice != case["expected"]["main_customer_need"] and choice not in allowed:
        errors["main_customer_need"] = {
            "expected": case["expected"]["main_customer_need"],
            "allowed_alternatives": allowed,
            "predicted": choice,
            "probabilities": probabilities,
        }

    system_contact_hold = worker_precheck_hold or predictions["possible_contact_stop"]
    return {
        "id": case["id"],
        "partition": case["partition"],
        "language": case["language"],
        "families": case["families"],
        "status": "scored",
        "state_sha256": hashlib.sha256(state_text.encode("utf-8")).hexdigest(),
        "unknown_timestamp_count": sum(item["observed_at"] is None for item in state["evidence"]),
        "date_candidates": state["date_candidates"],
        "worker_precheck_hold": worker_precheck_hold,
        "model_was_run_despite_precheck": worker_precheck_hold,
        "expected": case["expected"],
        "predictions": predictions,
        "raw_answers": answers,
        "usage": result["usage"],
        "scored_input": {"state": state_text, "questions": questions},
        "scored_at": datetime.now(timezone.utc).isoformat(),
        "input_tokens_by_question": input_tokens_by_question,
        "complete_token_sequence_verified": True,
        "errors": errors,
        "uncertainty_diagnostics": uncertainties,
        "system_contact_hold": system_contact_hold,
        "outreach_authorization": "not_established",
        "latency_ms": round(elapsed_ms, 2),
        "rationale": case["rationale"],
        "model": meta,
    }


def evaluate_controls(worker: Any, controls: list[dict[str, Any]], meta: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for case in controls:
        if case["kind"] == "missing_evidence":
            state = build_state(case)
            questions = worker.build_customer_signal_questions(state)
            passed = not worker.validate_customer_signal_request(compact_state(state), questions)
            got = "not_assessed" if passed else "control_failed"
            rows.append({
                "id": case["id"], "status": got, "expected_handling": case["expected_handling"],
                "passed": passed, "model_called": False, "outreach_authorization": "not_established",
                "rationale": case["rationale"], "model": meta,
            })
            continue

        state = build_state(case)
        state_text = compact_state(state)
        questions = worker.build_customer_signal_questions(state)
        schema_valid = worker.validate_customer_signal_request(state_text, questions)
        if not schema_valid:
            got = "invalid_fixture"
            passed = False
            token_count = None
            code = None
        else:
            try:
                worker.check_input_budget(worker.AGENT, state_text, questions)
                got = "not_assessed_under_budget"
                passed = False
                token_count = None
                code = None
            except worker.InputRejected as exc:
                code = exc.payload["code"]
                token_count = exc.payload["input_tokens"]
                got = "not_assessed_input_too_long" if code == "input_too_long" else f"not_assessed_{code}"
                passed = got == case["expected_handling"]
        rows.append({
            "id": case["id"], "status": got, "expected_handling": case["expected_handling"],
            "passed": passed, "model_called": False, "input_tokens": token_count,
            "token_limit": worker.EFFECTIVE_INPUT_LIMIT, "preflight_code": code,
            "outreach_authorization": "not_established", "rationale": case["rationale"],
            "model": meta,
        })
    return rows


def summarize(rows: list[dict[str, Any]], controls: list[dict[str, Any]], partition: str) -> dict[str, Any]:
    scored = [row for row in rows if row.get("status") == "scored"]
    per_judgment: dict[str, Any] = {}
    for key in N0UL_KEYS:
        expected = [row["expected"][key] for row in scored]
        predicted = [row["predictions"][key] for row in scored]
        tp = sum(a and b for a, b in zip(expected, predicted))
        fp = sum((not a) and b for a, b in zip(expected, predicted))
        tn = sum((not a) and (not b) for a, b in zip(expected, predicted))
        fn = sum(a and (not b) for a, b in zip(expected, predicted))
        uncertain_ids = [row["id"] for row in scored if row["uncertainty_diagnostics"][key]]
        per_judgment[key] = {
            "correct": sum(a == b for a, b in zip(expected, predicted)),
            "total": len(scored),
            "accuracy": round(sum(a == b for a, b in zip(expected, predicted)) / len(scored), 4) if scored else None,
            "true_positive": tp, "false_positive": fp, "true_negative": tn, "false_negative": fn,
            "false_hold_case_ids": [row["id"] for row in scored if not row["expected"][key] and row["predictions"][key]],
            "miss_case_ids": [row["id"] for row in scored if row["expected"][key] and not row["predictions"][key]],
            "near_threshold_case_ids": uncertain_ids,
        }

    need_expected = [row["expected"]["main_customer_need"] for row in scored]
    need_predicted = [row["predictions"]["main_customer_need"] for row in scored]
    needs = sorted(NEED_OPTIONS)
    confusion = {
        expected: {predicted: sum(e == expected and p == predicted for e, p in zip(need_expected, need_predicted)) for predicted in needs}
        for expected in needs
    }
    need_uncertain = [row["id"] for row in scored if row["uncertainty_diagnostics"]["main_customer_need"]["thin_lead"] or row["uncertainty_diagnostics"]["main_customer_need"]["top_probability_below_half"]]

    safety_cases = [row for row in rows if row["expected"]["possible_contact_stop"]]
    safety_misses = [row["id"] for row in safety_cases if not row.get("system_contact_hold", row.get("worker_precheck_hold", False))]
    false_contact_holds = [row["id"] for row in scored if not row["expected"]["possible_contact_stop"] and row["system_contact_hold"]]
    unclear_conflicting = [
        row for row in scored
        if row["expected"]["main_customer_need"] == "unclear"
        or "conflicting_evidence" in row["families"]
    ]
    clearance_cases = [row["id"] for row in unclear_conflicting if row["outreach_authorization"] != "not_established"]
    latencies = [row["latency_ms"] for row in scored if isinstance(row.get("latency_ms"), (int, float))]
    language_counts = {
        language: sum(row["language"] == language for row in scored)
        for language in ("en", "th", "mixed")
    }
    all_control_pass = all(row["passed"] for row in controls)
    safety_pass = not safety_misses and not clearance_cases and len(scored) == len(rows)
    return {
        "partition": partition,
        "scoreable_count": len(scored),
        "inference_error_ids": [row["id"] for row in rows if row.get("status") != "scored"],
        "language_counts": language_counts,
        "unknown_timestamp_evidence_items": sum(row["unknown_timestamp_count"] for row in scored),
        "per_judgment": per_judgment,
        "main_customer_need": {
            "correct": sum("main_customer_need" not in row["errors"] for row in scored),
            "exact_match_correct": sum(e == p for e, p in zip(need_expected, need_predicted)),
            "total": len(scored),
            "accuracy": round(sum("main_customer_need" not in row["errors"] for row in scored) / len(scored), 4) if scored else None,
            "confusion_matrix_expected_rows": confusion,
            "uncertain_or_flat_distribution_case_ids": need_uncertain,
        },
        "contact_hold": {
            "explicit_stop_cases": len(safety_cases),
            "system_holds": len(safety_cases) - len(safety_misses),
            "miss_case_ids": safety_misses,
            "false_hold_count": len(false_contact_holds),
            "false_hold_case_ids": false_contact_holds,
            "heldout_safety_acceptance_pass": safety_pass if partition == "heldout" else None,
        },
        "unclear_or_conflicting_cases": len(unclear_conflicting),
        "unclear_or_conflicting_outreach_clearance_case_ids": clearance_cases,
        "outreach_clearance_count": sum(row["outreach_authorization"] != "not_established" for row in rows),
        "controls": {"passed": all_control_pass, "total": len(controls), "rows": controls},
        "latency_ms": distribution_summary(latencies),
        "uncertainty_diagnostics": {
            "noul_near_threshold_band": list(N0UL_UNCERTAINTY_BAND),
            "main_need_thin_margin_cutoff": CHOICE_MARGIN_UNCERTAINTY,
            "note": "Descriptive bands only, not calibrated confidence or decision policy.",
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--partition", choices=("development", "heldout"), required=True)
    parser.add_argument("--development", type=Path, required=True)
    parser.add_argument("--heldout", type=Path, required=True)
    parser.add_argument("--model", default=os.environ.get("LAYA_COREML_MODEL_PATH", DEFAULT_MODEL))
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    development = load_json(args.development)
    heldout = load_json(args.heldout)
    validate_partitions(development, heldout)
    fixture = development if args.partition == "development" else heldout
    fixture_path = args.development if args.partition == "development" else args.heldout
    out_path = args.out
    summary_path = out_path.with_suffix(".summary.json")
    if out_path.exists() or summary_path.exists():
        raise SystemExit("Refusing to overwrite evaluation output; choose a new path")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    os.environ["LAYA_COREML_MODEL_PATH"] = str(Path(args.model).expanduser().resolve())
    sys.path.insert(0, str(SCRIPT_DIR))
    import laya_score_server as worker  # noqa: E402  # loads the pinned local model only

    meta = {
        "repository": worker.MODEL_IDENTITY["repository"],
        "source_revision": worker.MODEL_IDENTITY["source_revision"],
        "package_sha256": worker.MODEL_IDENTITY["package_sha256"],
        "engine": worker.MODEL_ENGINE,
        "effective_input_limit": worker.EFFECTIVE_INPUT_LIMIT,
    }
    cases = fixture["scoreable"]
    rows: list[dict[str, Any]] = []
    controls = evaluate_controls(worker, fixture["controls"], meta)
    started_at = datetime.now(timezone.utc).isoformat()

    with out_path.open("x", encoding="utf-8") as output:
        for case in cases:
            annotated = {**case, "partition": args.partition}
            row = score_case(worker, annotated, meta)
            rows.append(row)
            output.write(json.dumps(row, ensure_ascii=False, allow_nan=False) + "\n")
            output.flush()

    summary = {
        "schema": "customer_signals_eval_result_v1",
        "fixture_schema": fixture["schema"],
        "fixture_version": fixture["version"],
        "partition": args.partition,
        "partition_role": fixture.get("partition_role", args.partition),
        "fixture_path": str(fixture_path),
        "fixture_sha256": hashlib.sha256(fixture_path.read_bytes()).hexdigest(),
        "fixture_labeling": "Synthetic labels authored for this bounded evaluation; not independently reviewed.",
        "fixture_description": fixture.get("description"),
        "worker_sha256": hashlib.sha256((SCRIPT_DIR / "laya_score_server.py").read_bytes()).hexdigest(),
        "reader_sha256": hashlib.sha256((REPO_DIR / "src/utils/laya-customer-signals.ts").read_bytes()).hexdigest(),
        "evaluator_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "questions": worker.CUSTOMER_SIGNAL_BASE_QUESTIONS,
        "model": meta,
        "schema_version": worker.CUSTOMER_SIGNAL_SCHEMA_VERSION,
        "question_keys": list(worker.CUSTOMER_SIGNAL_BASE_QUESTIONS),
        "decision_threshold": REVIEW_THRESHOLD,
        "threshold_provenance": "Existing provisional application threshold; not tuned on this partition.",
        "started_at": started_at,
        "results_path": str(out_path),
        "case_rows": len(rows),
        "summary": summarize(rows, controls, args.partition),
    }
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")

    summary_view = summary["summary"]
    print(f"partition: {args.partition} ({len(rows)} synthetic cases, {len(controls)} controls)")
    print(f"model: {meta['repository']} @ {meta['source_revision']} ({meta['engine']})")
    print(f"schema: {worker.CUSTOMER_SIGNAL_SCHEMA_VERSION}; no callback-date question was present")
    for key, result in summary_view["per_judgment"].items():
        print(f"{key}: {result['correct']}/{result['total']} correct; FP={result['false_positive']} FN={result['false_negative']}; near-boundary={len(result['near_threshold_case_ids'])}")
    need = summary_view["main_customer_need"]
    print(f"main_customer_need: {need['correct']}/{need['total']} correct; uncertain/flat={len(need['uncertain_or_flat_distribution_case_ids'])}")
    holds = summary_view["contact_hold"]
    print(f"contact holds: explicit={holds['explicit_stop_cases']}, held={holds['system_holds']}, misses={holds['miss_case_ids']}, false_holds={holds['false_hold_count']}")
    print(f"unclear/conflicting outreach clearances: {len(summary_view['unclear_or_conflicting_outreach_clearance_case_ids'])}")
    print(f"controls: {sum(row['passed'] for row in controls)}/{len(controls)} passed; latency ms p50={summary_view['latency_ms']['p50']} p95={summary_view['latency_ms']['p95']}")
    for row in rows:
        if row.get("errors"):
            print(f"ERROR {row['id']}: {json.dumps(row['errors'], ensure_ascii=False, separators=(',', ':'))}")
    for row in controls:
        if not row["passed"]:
            print(f"CONTROL FAIL {row['id']}: expected={row['expected_handling']} got={row['status']} tokens={row.get('input_tokens')}/{row.get('token_limit')}")
    print(f"results: {out_path}")
    print(f"summary: {summary_path}")

    if any(row.get("status") != "scored" for row in rows) or not summary_view["controls"]["passed"]:
        return 1
    if args.partition == "heldout" and not holds["heldout_safety_acceptance_pass"]:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
