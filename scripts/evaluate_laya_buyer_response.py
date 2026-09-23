#!/usr/bin/env python3
"""Offline, synthetic-only evaluation of the narrow buyer-response question.

Loads the pinned local Laya bundle directly (never the live worker), scores
fixture cases through the production input-budget guard, and writes incremental
per-case JSONL plus a programmatic summary. No fixture text is shortened to fit.

Usage (from the repo root, with the laya-coreml venv):
  /Users/pat/laya-coreml/.venv/bin/python scripts/evaluate_laya_buyer_response.py \
      --fixtures scripts/fixtures/laya_buyer_response.dev.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import laya_coreml as laya  # noqa: E402
from laya_input import InputRejected, check_input_budget, has_explicit_contact_opt_out  # noqa: E402

DEFAULT_MODEL = "/Users/pat/laya-coreml/models/multilingual-1024"

OLD_QUESTION = {"attention": {
    "type": "choice", "instructions": "Best sales attention?",
    "criteria": {
        "priority": "Reply soon. Clear fit and signal.",
        "nurture": "Keep warm. No immediate signal.",
        "research": "Need fit or buyer info.",
        "deprioritize": "Weak or negative signal.",
    },
}}

CANDIDATE_INSTRUCTIONS = (
    "What does the note explicitly report about the buyer response? "
    "Use a later response only when its order is stated. "
    "An internal sales plan is not a buyer request. "
    "If the response is missing or conflicting, choose unclear."
)
CANDIDATE_CRITERIA = {
    "requested_next_step": "The buyer requests pricing, a sample, a meeting, or an order-related next step.",
    "deferred": "The buyer explicitly postpones until later but does not decline.",
    "declined": "The buyer explicitly rejects the offer, supplier, or product.",
    "no_commitment": "The buyer acknowledges or shows interest but no next step.",
    "unclear": "No buyer response is stated, or responses conflict without a stated order.",
}

def candidate_question(reverse_options: bool = False) -> dict:
    criteria = dict(reversed(CANDIDATE_CRITERIA.items())) if reverse_options else dict(CANDIDATE_CRITERIA)
    return {"buyer_response": {"type": "choice", "instructions": CANDIDATE_INSTRUCTIONS, "criteria": criteria}}


# W2: reworded from the proven experiments/lead_triage phrasing (verb-first,
# concrete options; short instructions; proven option order). Dev-set iteration
# only, per the plan.
W2_INSTRUCTIONS = (
    "Which option best describes the buyer's response in the note? "
    "Use the latest response only when its order is stated; otherwise choose unclear."
)
W2_CRITERIA = {
    "requested_next_step": "requests a sample, quotation, order, contract, meeting, or pricing to proceed with a purchase",
    "deferred": "asks us to come back later or after a stated time, without saying no",
    "declined": "says no, not interested, too expensive, or that they chose another supplier",
    "no_commitment": "thanks us, acknowledges us, or shows interest, but makes no request or commitment",
    "unclear": "contains no buyer response, or the responses conflict and no order is stated",
}

def w2_question(reverse_options: bool = False) -> dict:
    criteria = dict(reversed(W2_CRITERIA.items())) if reverse_options else dict(W2_CRITERIA)
    return {"buyer_response": {"type": "choice", "instructions": W2_INSTRUCTIONS, "criteria": criteria}}


# W3 ablations: strip back toward the proven experiments/lead_triage wording.
W3_INSTRUCTIONS = "Which option best describes the buyer's latest message?"
W3_CRITERIA = {
    "requested_next_step": "requests a sample, quotation, order, contract, or pricing to proceed with a purchase",
    "deferred": "asks to revisit later or after a stated time, without declining",
    "declined": "says no, not interested, or that they chose another supplier",
    "no_commitment": "only acknowledges or shows interest, with no request",
    "unclear": "no buyer response is stated, or responses conflict with no stated order",
}
W3_CRITERIA_4OPT = {k: v for k, v in W3_CRITERIA.items() if k != "unclear"}

# W5: targets the decline-over-prediction seen in v_verbatim — requires explicit refusal
# for declined and explicitly excludes refusal from no_commitment/deferred.
W5_CRITERIA = {
    "requested_next_step": "requests a sample, quotation, order, contract, or pricing to proceed with a purchase",
    "deferred": "asks to be contacted again later or after a stated time, without saying no",
    "declined": "explicitly refuses to buy, says no or not interested, or states they chose another supplier",
    "no_commitment": "thanks us or shows interest, without requesting anything and without refusing",
    "unclear": "no substantive buyer response, or statements conflict with no stated order",
}


def w5_question(reverse_options: bool = False) -> dict:
    criteria = dict(reversed(W5_CRITERIA.items())) if reverse_options else dict(W5_CRITERIA)
    return {"buyer_response": {"type": "choice", "instructions": W3_INSTRUCTIONS, "criteria": criteria}}

def w3_question(reverse_options: bool = False, four_options: bool = False) -> dict:
    src = W3_CRITERIA_4OPT if four_options else W3_CRITERIA
    criteria = dict(reversed(src.items())) if reverse_options else dict(src)
    return {"buyer_response": {"type": "choice", "instructions": W3_INSTRUCTIONS, "criteria": criteria}}


# W4: tuned for third-person CRM notes (production last_outcome fields are
# reported speech, not the buyer's own words).
W4_INSTRUCTIONS = "According to the sales note, what did the buyer say or do?"
W4_CRITERIA = {
    "requested_next_step": "the buyer asks for a quotation, sample, order, contract, meeting, or pricing",
    "deferred": "the buyer asks to wait or be contacted later, without saying no",
    "declined": "the buyer says no, declines, or chose another supplier",
    "no_commitment": "the buyer only thanks or shows interest, making no request",
    "unclear": "the note records no buyer response, or the responses conflict with no stated order",
}

def w4_question(reverse_options: bool = False) -> dict:
    criteria = dict(reversed(W4_CRITERIA.items())) if reverse_options else dict(W4_CRITERIA)
    return {"buyer_response": {"type": "choice", "instructions": W4_INSTRUCTIONS, "criteria": criteria}}

# Draft mapping from the plan: semantic class -> shared application vocabulary.
SEMANTIC_TO_HANDLING = {
    "requested_next_step": "priority",
    "deferred": "nurture",
    "declined": "deprioritize",
    "no_commitment": "nurture",
    "unclear": "research",
}
CLOSED_STAGES = {"closed_won", "closed_lost"}


def old_attention_state(case: dict) -> str:
    """Replica of buildLayaAttentionInput in src/utils/lead-scoring.ts."""
    product = (case.get("product") or "Butter").strip() or "unknown"
    stage = case.get("stage") or "contacted"
    value = case.get("value")
    value = "unknown" if value is None else f"THB {value}"
    outcome = (case.get("outcome") or "").strip() or "unknown"
    return " ".join([
        f"Industry: {case.get('industry') or 'unknown'}.",
        f"Tags: {', '.join(case.get('tags') or []) or 'unknown'}.",
        f"Product: {product}.",
        f"Stage: {stage}.",
        f"Value: {value}.",
        f"Follow-up: {case.get('followup') or 'today'}.",
        f"Outcome: {outcome}.",
    ])


def note_of(case: dict) -> str:
    return (case.get("outcome") or "").strip() or "unknown"



def reply_of(case: dict) -> str:
    return (case.get("buyer_reply") or "").strip()


def safeguard(case: dict) -> str | None:
    """Worker-order pre-inference safeguards; returns a handling code or None."""
    if case.get("workflow") == "parked" or case.get("stage") in CLOSED_STAGES:
        return "status_only"
    reply, note = reply_of(case), (case.get("outcome") or "").strip()
    if not reply and not note:
        return "needs_evidence"
    if has_explicit_contact_opt_out(reply or note):
        return "not_scored_opt_out"
    return None


def _convo_state(c: dict) -> str:
    return (f"We supply {(c.get('product') or 'Butter')} to this account. "
            f"The latest recorded outcome note says: \"{note_of(c)}\"")


def _verbatim_state(c: dict) -> str:
    """Exact replica of buildLayaBuyerResponseInput in src/utils/lead-scoring.ts."""
    product = (c.get("product") or "").strip() or "our products"
    reply = reply_of(c)
    if reply:
        return f"We supply {product} to this account. The buyer's latest reply: \"{reply}\""
    return f"We supply {product} to this account. The latest recorded outcome note says: \"{note_of(c)}\""


VARIANTS = {
    # Baseline: the current production question end-to-end.
    "old_attention": (old_attention_state, lambda: OLD_QUESTION),
    # Candidate question across state-rendering formats (state format is an explicit test variable).
    "cand_labeled": (lambda c: f"Product: {(c.get('product') or 'Butter')}. Outcome note: {note_of(c)}",
                     candidate_question),
    "cand_json": (lambda c: json.dumps({"product": c.get("product") or "Butter",
                                        "outcome_note": note_of(c)}, ensure_ascii=False),
                  candidate_question),
    "cand_convo": (_convo_state, candidate_question),
    "cand_note_only": (lambda c: f"Outcome note: {note_of(c)}", candidate_question),
    # Robustness: reversed option order, same conversational state.
    "cand_convo_revopts": (_convo_state, lambda: candidate_question(reverse_options=True)),
    # W2 rewording (proven experiments/lead_triage phrasing), two state framings.
    "w2_reply": (lambda c: f"We sell {(c.get('product') or 'Butter')}. "
                           f"The note records the buyer's reply: \"{note_of(c)}\"", w2_question),
    "w2_neutral": (lambda c: f"We sell {(c.get('product') or 'Butter')}. "
                             f"The latest outcome note says: \"{note_of(c)}\"", w2_question),
    "w2_reply_revopts": (lambda c: f"We sell {(c.get('product') or 'Butter')}. "
                                   f"The note records the buyer's reply: \"{note_of(c)}\"",
                         lambda: w2_question(reverse_options=True)),
    # W3 ablations: exact proven state framing; chronology clause removed; 4-option control.
    "w3_exact": (lambda c: f"We sell {(c.get('product') or 'Butter')}. "
                           f"The buyer replied to our outreach: \"{note_of(c)}\"", w3_question),
    "w3_exact_revopts": (lambda c: f"We sell {(c.get('product') or 'Butter')}. "
                                   f"The buyer replied to our outreach: \"{note_of(c)}\"",
                         lambda: w3_question(reverse_options=True)),
    "w3_exact_4opt": (lambda c: f"We sell {(c.get('product') or 'Butter')}. "
                                f"The buyer replied to our outreach: \"{note_of(c)}\"",
                      lambda: w3_question(four_options=True)),
    # W4: reported-speech wording for third-person CRM notes.
    "w4_reported": (lambda c: f"Sales note for this account: \"{note_of(c)}\"", w4_question),
    "w4_reported_revopts": (lambda c: f"Sales note for this account: \"{note_of(c)}\"",
                            lambda: w4_question(reverse_options=True)),
    # V: the production buildLayaBuyerResponseInput state — verbatim reply preferred,
    # paraphrased note as fallback — with the W3 (production-code) question wording.
    "v_verbatim": (_verbatim_state, w3_question),
    "v_verbatim_revopts": (_verbatim_state, lambda: w3_question(reverse_options=True)),
    # W5 wording on the production state: explicit-refusal criteria to counter decline bias.
    "v5_verbatim": (_verbatim_state, w5_question),
    "v5_verbatim_revopts": (_verbatim_state, lambda: w5_question(reverse_options=True)),
}


def run_variant(agent, variant: str, cases: list[dict], out) -> dict:
    state_fn, question_fn = VARIANTS[variant]
    questions = question_fn()
    qkey = next(iter(questions))
    options = set(questions[qkey]["criteria"])
    latencies, rows = [], []
    for case in cases:
        started = time.perf_counter()
        state = state_fn(case)
        row = {"variant": variant, "id": case["id"], "lang": case.get("lang"),
               "expected_semantic": case.get("expected_semantic"),
               "expected_handling": case.get("expected_handling")}
        try:
            check_input_budget(agent, state, questions)  # production guard; never shorten
        except InputRejected as exc:
            row.update(status="refused", code=exc.payload["code"],
                       input_tokens=exc.payload["input_tokens"], token_limit=exc.payload["token_limit"])
        else:
            result = agent.predict(state, questions)
            answer = result["answers"][qkey]
            choice, probabilities = answer["choice"], answer["probabilities"]
            if choice not in options or set(probabilities) != options:
                row.update(status="invalid_output")
            else:
                handling = SEMANTIC_TO_HANDLING.get(choice, choice)
                row.update(status="scored", choice=choice, confidence=answer["confidence"],
                           probabilities=probabilities, handling=handling,
                           semantic_match=choice == case.get("expected_semantic"),
                           handling_match=handling == case.get("expected_handling"))
        row["latency_ms"] = round((time.perf_counter() - started) * 1000, 1)
        if row["status"] == "scored":
            latencies.append(row["latency_ms"])
        rows.append(row)
        out.write(json.dumps(row, ensure_ascii=False) + "\n")
        out.flush()
    return {"rows": rows, "latencies": sorted(latencies)}


def summarize(name: str, result: dict) -> dict:
    rows = result["rows"]
    scored = [r for r in rows if r["status"] == "scored"]
    refused = [r for r in rows if r["status"] == "refused"]
    lat = result["latencies"]
    labelled = [r for r in scored if r.get("expected_semantic")]

    def pct(n: int, d: int) -> float:
        return round(100 * n / d, 1) if d else 0.0

    per_class: dict[str, list[bool]] = {}
    for r in labelled:
        per_class.setdefault(r["expected_semantic"], []).append(bool(r["semantic_match"]))
    return {
        "variant": name,
        "scored": len(scored),
        "refused": len(refused),
        "semantic_matches": sum(1 for r in labelled if r["semantic_match"]),
        "semantic_accuracy_pct": pct(sum(1 for r in labelled if r["semantic_match"]), len(labelled)),
        "handling_matches": sum(1 for r in scored if r.get("handling_match")),
        "handling_accuracy_pct": pct(sum(1 for r in scored if r.get("handling_match")), len(scored)),
        "per_class_accuracy": {k: f"{sum(v)}/{len(v)}" for k, v in sorted(per_class.items())},
        "latency_ms": {"p50": lat[len(lat) // 2] if lat else None,
                       "p95": lat[min(len(lat) - 1, int(len(lat) * 0.95))] if lat else None},
        "failures": [{"id": r["id"], "choice": r.get("choice"),
                      "expected_semantic": r.get("expected_semantic"),
                      "expected_handling": r.get("expected_handling")}
                     for r in scored if not (r.get("semantic_match") or r.get("handling_match"))],
        "refusals": [{"id": r["id"], "code": r["code"]} for r in refused],
    }



def load_agent(model_path: str):
    manifest = json.loads((Path(model_path) / "coreml_config.json").read_text(encoding="utf-8"))
    engine = {"laya-coreml-ane": "cpu_ne", "laya-coreml": "cpu_gpu"}.get(manifest.get("format"))
    if engine is None:
        raise ValueError("Unsupported local Laya bundle format")
    return laya.load(model_path, local_files_only=True, compute_units=engine), manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixtures", required=True)
    parser.add_argument("--model", default=os.environ.get("LAYA_COREML_MODEL_PATH", DEFAULT_MODEL))
    parser.add_argument("--variants", default=",".join(VARIANTS))
    parser.add_argument("--out", default=None, help="JSONL results path (summary written alongside)")
    args = parser.parse_args()

    fixture_path = Path(args.fixtures)
    data = json.loads(fixture_path.read_text(encoding="utf-8"))
    scoreable, safety = data["scoreable"], data.get("safety", [])
    out_path = Path(args.out) if args.out else Path(
        f"scripts/eval_results/{fixture_path.stem}.{time.strftime('%Y%m%d-%H%M%S')}.jsonl")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    agent, manifest = load_agent(args.model)
    meta = {"model": args.model, "repository": manifest.get("repository"),
            "source_revision": manifest.get("source_revision"),
            "package_sha256": manifest.get("package_sha256")}

    # Safeguarded cases never reach the model; assert the pipeline produces exactly
    # the expected handling and no outreach-positive recommendation.
    safeguard_rows = []
    for case in safety + [c for c in scoreable if c.get("expected_handling") in
                          ("needs_evidence", "not_scored_opt_out", "status_only")]:
        got = safeguard(case)
        ok = got == case["expected_handling"]
        safeguard_rows.append({"id": case["id"], "expected": case["expected_handling"],
                               "got": got, "pass": ok})
    safeguard_pass = all(r["pass"] for r in safeguard_rows)

    selected = [v.strip() for v in args.variants.split(",") if v.strip()]
    unknown = set(selected) - set(VARIANTS)
    if unknown:
        raise SystemExit(f"Unknown variants: {sorted(unknown)}; choose from {sorted(VARIANTS)}")

    # needs_evidence cases must not reach the model either.
    inferable = [c for c in scoreable if c.get("expected_handling") != "needs_evidence"]

    summaries = []
    with out_path.open("w", encoding="utf-8") as out:
        for variant in selected:
            result = run_variant(agent, variant, inferable, out)
            summaries.append(summarize(variant, result))

    # Integrity: every requested case appears exactly once per variant in the results file.
    seen: dict[str, list[str]] = {}
    for line in out_path.read_text(encoding="utf-8").splitlines():
        row = json.loads(line)
        seen.setdefault(row["variant"], []).append(row["id"])
    for variant in selected:
        got = seen.get(variant, [])
        assert sorted(got) == sorted(c["id"] for c in inferable), f"{variant}: case coverage mismatch"
        assert len(got) == len(set(got)), f"{variant}: duplicate case rows"

    report = {"meta": meta, "fixtures": str(fixture_path),
              "safeguards": {"pass": safeguard_pass, "rows": safeguard_rows},
              "variants": summaries}
    summary_path = out_path.with_suffix(".summary.json")
    summary_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"model: {meta['repository']} @ {meta['source_revision']}")
    print(f"safeguards: {'PASS' if safeguard_pass else 'FAIL'} ({len(safeguard_rows)} cases, no model calls)")
    for r in safeguard_rows:
        if not r["pass"]:
            print(f"  SAFEGUARD MISS: {r['id']} expected={r['expected']} got={r['got']}")
    for s in summaries:
        print(f"\n[{s['variant']}] scored={s['scored']} refused={s['refused']} "
              f"semantic={s['semantic_matches']} ({s['semantic_accuracy_pct']}%) "
              f"handling={s['handling_matches']} ({s['handling_accuracy_pct']}%) "
              f"p50={s['latency_ms']['p50']}ms p95={s['latency_ms']['p95']}ms")
        for cls, acc in s["per_class_accuracy"].items():
            print(f"    {cls}: {acc}")
        for f in s["failures"]:
            print(f"    FAIL {f['id']}: chose {f['choice']}, expected {f['expected_semantic'] or f['expected_handling']}")
    print(f"\nresults: {out_path}\nsummary: {summary_path}")
    return 0 if safeguard_pass else 1


if __name__ == "__main__":
    raise SystemExit(main())

