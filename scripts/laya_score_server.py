#!/usr/bin/env python3
"""Local-only HTTP bridge between LeadPulse and the installed Laya Core ML model."""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import laya_coreml as laya
from laya_input import InputRejected, check_input_budget, has_explicit_contact_opt_out

HOST = "127.0.0.1"
PORT = int(os.environ.get("LAYA_SCORE_PORT", "8765"))
TAILNET_HOST = os.environ.get("LAYA_SCORE_TAILNET_HOST", "")
MODEL_PATH = Path(os.environ["LAYA_COREML_MODEL_PATH"]).expanduser().resolve()
MAX_BODY_BYTES = 16_384
manifest = json.loads((MODEL_PATH / "coreml_config.json").read_text(encoding="utf-8"))

def model_engine(model_manifest: dict[str, Any]) -> str:
    model_format = model_manifest.get("format")
    if model_format == "laya-coreml-ane":
        return "cpu_ne"
    if model_format == "laya-coreml":
        return "cpu_gpu"
    raise ValueError("Unsupported local Laya bundle format")

MODEL_ENGINE = model_engine(manifest)
INFERENCE_SLOTS = threading.BoundedSemaphore(1)
# Must match LAYA_BUYER_RESPONSE_QUESTION in src/utils/lead-scoring.ts exactly —
# the boundary test builds the request through the real TypeScript builder.
BUYER_RESPONSE_QUESTION = {"buyer_response": {
    "type": "choice",
    "instructions": "Which option best describes the buyer's latest message?",
    "criteria": {
        "unclear": "no buyer response is stated, or responses conflict with no stated order",
        "no_commitment": "only acknowledges or shows interest, with no request",
        "declined": "says no, not interested, or that they chose another supplier",
        "deferred": "asks to revisit later or after a stated time, without declining",
        "requested_next_step": "requests a sample, quotation, order, contract, or pricing to proceed with a purchase",
    },
}}
ALLOWED_QUESTIONS = (BUYER_RESPONSE_QUESTION,)
DEFAULT_ALLOWED_ORIGINS = {
    "https://leadpulse-one-ashen.vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
}
ALLOWED_ORIGINS = {
    origin.strip()
    for origin in os.environ.get("LAYA_SCORE_ALLOWED_ORIGINS", ",".join(DEFAULT_ALLOWED_ORIGINS)).split(",")
    if origin.strip()
}


def origin_is_allowed(handler: BaseHTTPRequestHandler) -> bool:
    origins = handler.headers.get_all("Origin", [])
    return len(origins) == 1 and origins[0] in ALLOWED_ORIGINS

def host_is_allowed(handler: BaseHTTPRequestHandler) -> bool:
    hosts = handler.headers.get_all("Host", [])
    return len(hosts) == 1 and hosts[0] in ({f"{HOST}:{PORT}", TAILNET_HOST} if TAILNET_HOST else {f"{HOST}:{PORT}"})

def unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON key")
        result[key] = value
    return result

def reject_non_json_number(_value: str) -> None:
    raise ValueError("Non-JSON number")


def add_cors_headers(handler: BaseHTTPRequestHandler) -> None:
    origin = handler.headers.get("Origin")
    if origin in ALLOWED_ORIGINS:
        handler.send_header("Access-Control-Allow-Origin", origin)
        handler.send_header("Vary", "Origin")


def json_response(handler: BaseHTTPRequestHandler, status: HTTPStatus, payload: dict[str, Any]) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    add_cors_headers(handler)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def load_agent():
    if not MODEL_PATH.is_dir():
        raise RuntimeError(f"LAYA_COREML_MODEL_PATH is not a model directory: {MODEL_PATH}")
    return laya.load(str(MODEL_PATH), local_files_only=True, compute_units=MODEL_ENGINE)


AGENT = load_agent()
MODEL_IDENTITY = {
    "repository": manifest["repository"],
    "source_revision": manifest["source_revision"],
    "package_sha256": manifest["package_sha256"],
    "engine": MODEL_ENGINE,
}


class LayaScoreHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:
        if not host_is_allowed(self) or not origin_is_allowed(self):
            json_response(self, HTTPStatus.FORBIDDEN, {"error": "Request origin or host is not allowed"})
            return
        if self.path != "/score":
            json_response(self, HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return
        self.send_response(HTTPStatus.NO_CONTENT)
        add_cors_headers(self)
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        if self.headers.get("Access-Control-Request-Private-Network") == "true":
            self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_GET(self) -> None:
        if not host_is_allowed(self) or (self.headers.get("Origin") is not None and not origin_is_allowed(self)):
            json_response(self, HTTPStatus.FORBIDDEN, {"error": "Request origin or host is not allowed"})
            return
        if self.path != "/health":
            json_response(self, HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return
        json_response(self, HTTPStatus.OK, {"status": "ready", "engine": MODEL_ENGINE})

    def do_POST(self) -> None:
        if not host_is_allowed(self) or not origin_is_allowed(self):
            json_response(self, HTTPStatus.FORBIDDEN, {"error": "Request origin or host is not allowed"})
            return
        if self.path != "/score":
            json_response(self, HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return

        if (self.headers.get_all("Content-Type", []) != ["application/json"] or
                self.headers.get("Transfer-Encoding") is not None or
                len(self.headers.get_all("Content-Length", [])) != 1):
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "Expected a JSON body with Content-Length"})
            return
        content_length = self.headers.get("Content-Length")
        try:
            length = int(content_length or "0")
        except ValueError:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "Invalid Content-Length"})
            return
        if length <= 0 or length > MAX_BODY_BYTES:
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "Request must be between 1 and 16384 bytes"})
            return

        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"),
                                 object_pairs_hook=unique_object, parse_constant=reject_non_json_number)
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError, RecursionError):
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "Request body must be JSON"})
            return

        state = payload.get("state") if isinstance(payload, dict) else None
        questions = payload.get("questions") if isinstance(payload, dict) else None
        if not isinstance(state, str) or not state.strip() or not isinstance(questions, dict):
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "state and questions are required"})
            return
        if set(payload) != {"state", "questions"} or not any(questions == allowed for allowed in ALLOWED_QUESTIONS):
            json_response(self, HTTPStatus.BAD_REQUEST, {"error": "Unsupported scoring schema"})
            return
        question_key = next(iter(questions))
        expected_options = set(questions[question_key]["criteria"])

        scored_state = state.strip()
        if has_explicit_contact_opt_out(scored_state):
            json_response(self, HTTPStatus.UNPROCESSABLE_ENTITY, {
                "status": "not_scored", "code": "contact_opt_out",
                "error": "Not scored: possible no-contact request in the deal evidence. Review manually; do not initiate outreach from this recommendation.",
            })
            return
        if not INFERENCE_SLOTS.acquire(blocking=False):
            json_response(self, HTTPStatus.SERVICE_UNAVAILABLE, {"error": "Local Laya is busy. Retry shortly."})
            return
        try:
            check_input_budget(AGENT, scored_state, questions)
            result = AGENT.predict(scored_state, questions)
            scored_at = datetime.now(timezone.utc).isoformat()
        except InputRejected as error:
            json_response(self, HTTPStatus.UNPROCESSABLE_ENTITY, error.payload)
            return
        except Exception:  # Model exceptions can embed CRM input; never echo or log them.
            json_response(self, HTTPStatus.SERVICE_UNAVAILABLE, {"error": "Local scoring failed. Retry or review the evidence manually."})
            return
        finally:
            INFERENCE_SLOTS.release()

        try:
            answer = result["answers"][question_key]
            probabilities = answer["probabilities"]
            choice = answer["choice"]
            confidence = answer["confidence"]
            if (choice not in expected_options or not isinstance(probabilities, dict) or
                    set(probabilities) != expected_options or
                    not all(isinstance(p, (int, float)) and not isinstance(p, bool) and 0 <= p <= 1 for p in probabilities.values()) or
                    not isinstance(confidence, (int, float)) or isinstance(confidence, bool) or not 0 <= confidence <= 1):
                raise ValueError("Invalid model result")
        except (KeyError, TypeError, ValueError):
            json_response(self, HTTPStatus.UNPROCESSABLE_ENTITY, {"error": "Laya returned an invalid score"})
            return
        json_response(self, HTTPStatus.OK, {
            "question": question_key,
            "recommendation": choice, "confidence": confidence,
            "probabilities": probabilities, "usage": result.get("usage", {}),
            "trace": {"scored_input": {"state": scored_state, "questions": questions},
                      "model": MODEL_IDENTITY, "scored_at": scored_at},
        })

    def log_message(self, format: str, *_args: Any) -> None:
        # The worker handles CRM-derived text. Do not log request paths or payloads.
        _ = format
        return


class BoundedHTTPServer(ThreadingHTTPServer):
    """Limit concurrent sockets as well as concurrent model calls."""

    request_queue_size = 4

    def __init__(self, address, handler):
        super().__init__(address, handler)
        self.request_slots = threading.BoundedSemaphore(4)

    def get_request(self):
        sock, address = super().get_request()
        sock.settimeout(10)
        return sock, address

    def process_request(self, request: Any, client_address: Any):
        if not self.request_slots.acquire(blocking=False):
            try:
                body = b'{"error":"Local Laya is busy. Retry shortly."}'
                request.sendall(b"HTTP/1.1 503 Service Unavailable\r\n"
                                b"Content-Type: application/json\r\n"
                                b"Connection: close\r\nContent-Length: " + str(len(body)).encode() +
                                b"\r\n\r\n" + body)
            except OSError:
                pass
            finally:
                self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.request_slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.request_slots.release()

    def handle_error(self, request, client_address):
        # Default socketserver behavior prints exception tracebacks. No CRM data in logs.
        return


def main() -> None:
    server = BoundedHTTPServer((HOST, PORT), LayaScoreHandler)
    print(f"Laya local scoring service ready at http://{HOST}:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
