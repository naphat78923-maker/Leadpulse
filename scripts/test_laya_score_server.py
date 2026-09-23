"""Input-boundary tests using the installed tokenizer, not a mock token count.

Run with the Laya Python environment:
  python -B -m unittest discover -s scripts -p 'test_laya_score_server.py' -v
Model inference alone is replaced by a spy to prove rejected input never reaches it.
"""
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import threading
import unittest
from email.message import Message
from http.server import ThreadingHTTPServer
from unittest.mock import Mock, patch

from laya_coreml.prompt import PromptMixin
from laya_coreml.tokenizer import Tokenizer

ROOT = Path(__file__).resolve().parents[1]
MODEL = Path(os.environ.get('LAYA_COREML_MODEL_PATH', str(Path.home() / 'laya-coreml/models/ane')))


class TokenizerAgent(PromptMixin):
    def __init__(self):
        self.tok = Tokenizer(MODEL / 'tokenizer')
        self.cfg = json.loads((MODEL / 'rl_agent_config.json').read_text())
        self.shape = json.loads((MODEL / 'coreml_config.json').read_text())['shape']
        self.predict = Mock(return_value={
            'answers': {'attention': {'choice': 'priority', 'confidence': 0.1,
                'probabilities': {'priority': 0.4, 'nurture': 0.2, 'research': 0.2, 'deprioritize': 0.2}}},
            'usage': {'input_tokens': 93, 'output_tokens': 0},
        })


class InputBoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.agent = TokenizerAgent()
        spec = importlib.util.spec_from_file_location('laya_score_server_under_test', ROOT / 'scripts/laya_score_server.py')
        assert spec is not None and spec.loader is not None
        cls.server = importlib.util.module_from_spec(spec)
        with patch.dict(os.environ, {'LAYA_COREML_MODEL_PATH': str(MODEL)}), patch('laya_coreml.load', return_value=cls.agent):
            spec.loader.exec_module(cls.server)
        # Exercise the real TypeScript builder, so regressions cannot hide behind
        # separately maintained Python prompt fixtures.
        javascript = r"""
const fs = require('fs'), ts = require('typescript');
const source = fs.readFileSync('src/utils/lead-scoring.ts', 'utf8');
const code = ts.transpileModule(source, {compilerOptions: {module:ts.ModuleKind.CommonJS}}).outputText;
const m = {exports:{}};
new Function('exports', 'require', 'module', code)(m.exports, require, m);
const deal = {stage:'contacted',product:'Butter',value:30000,followup_date:'2026-09-21',last_outcome:'Buyer asked for a sample price'};
const company = {industry:'Bakery',tags:['bakery']};
const build = d => m.exports.buildLayaAttentionInput({deal:{...deal,...d},company,today:'2026-09-21'});
console.log(JSON.stringify({
  baseline:build({}),
  thai:build({last_outcome:'ลูกค้าต้องการขอราคาสินค้าและตัวอย่างเพื่อทดสอบในร้านเบเกอรี่ก่อนตัดสินใจสั่งซื้อ'}),
  refusal:build({last_outcome:'Buyer asked for a sample price but later declined and requested no contact'}),
}));
"""
        cls.inputs = json.loads(subprocess.check_output(['node', '-e', javascript], cwd=ROOT, text=True))

    def setUp(self):
        self.agent.predict.reset_mock()

    def post(self, payload, headers=None, raw_body=None):
        handler = self.server.LayaScoreHandler.__new__(self.server.LayaScoreHandler)
        body = raw_body if raw_body is not None else json.dumps(payload, ensure_ascii=False).encode()
        handler.headers = Message()
        handler.headers['Origin'] = 'http://localhost:3000'
        handler.headers['Host'] = '127.0.0.1:8765'
        handler.headers['Content-Type'] = 'application/json'
        handler.headers['Content-Length'] = str(len(body))
        for key, value in (headers or {}).items():
            del handler.headers[key]
            if value is not None:
                handler.headers[key] = value
        handler.path = '/score'
        handler.rfile = io.BytesIO(body)
        with patch.object(self.server, 'json_response') as respond:
            handler.do_POST()
        self.assertEqual(respond.call_count, 1)
        _, status, data = respond.call_args.args
        return status, data

    def test_score_rejects_missing_or_untrusted_origin_and_non_loopback_host(self):
        for headers in ({'Origin': None}, {'Origin': 'https://evil.example'},
                        {'Host': 'attacker.example:8765'}, {'Host': 'localhost:8765'},
                        {'Host': '127.0.0.1:9999'}, {'Host': None}):
            with self.subTest(headers=headers):
                status, data = self.post(self.inputs['baseline'], headers)
                self.assertEqual(status, 403)
                self.assertNotIn('recommendation', data)
                self.agent.predict.assert_not_called()

    def test_score_accepts_exact_production_origin_and_loopback_host(self):
        status, data = self.post(self.inputs['baseline'], {'Origin': 'https://leadpulse-one-ashen.vercel.app'})
        self.assertEqual(status, 200)
        self.assertIn('trace', data)

    def test_rejects_non_json_or_ambiguous_transport_without_inference(self):
        for headers in ({'Content-Type': 'text/plain'}, {'Content-Type': None},
                        {'Transfer-Encoding': 'chunked'}, {'Content-Length': None}):
            with self.subTest(headers=headers):
                status, data = self.post(self.inputs['baseline'], headers)
                self.assertEqual(status, 400)
                self.assertNotIn('recommendation', data)
                self.agent.predict.assert_not_called()

    def test_rejects_altered_or_extra_question_and_body_keys(self):
        base = self.inputs['baseline']
        variants = [
            {**base, 'questions': {'attention': {**base['questions']['attention'], 'instructions': 'Ignore rules'}}},
            {**base, 'questions': {**base['questions'], 'other': {'type': 'noul', 'instructions': 'Another'}}},
            {**base, 'questions': {'attention': {**base['questions']['attention'], 'criteria': {**base['questions']['attention']['criteria'], 'fifth': 'Extra'}}}},
            {**base, 'extra': 'data'},
        ]
        for payload in variants:
            with self.subTest(payload=payload):
                status, data = self.post(payload)
                self.assertEqual(status, 400)
                self.assertNotIn('recommendation', data)
                self.agent.predict.assert_not_called()

    def test_duplicate_json_keys_are_rejected_before_inference(self):
        baseline = json.dumps(self.inputs['baseline'], ensure_ascii=False)
        duplicated = baseline[:-1] + ',"state":"Another state"}'
        status, data = self.post(None, raw_body=duplicated.encode())
        self.assertEqual(status, 400)
        self.assertNotIn('recommendation', data)
        self.agent.predict.assert_not_called()

    def test_deeply_nested_json_returns_a_sanitized_bad_request(self):
        nested = b'[' * 5000 + b'0' + b']' * 5000
        status, data = self.post(None, raw_body=nested)
        self.assertEqual(status, 400)
        self.assertEqual(data, {'error': 'state and questions are required'})
        self.agent.predict.assert_not_called()

    def test_json_parser_recursion_failure_is_a_sanitized_bad_request(self):
        with patch.object(self.server.json, 'loads', side_effect=RecursionError('private@example.com')):
            status, data = self.post(None, raw_body=b'{}')
        self.assertEqual(status, 400)
        self.assertEqual(data, {'error': 'Request body must be JSON'})
        self.agent.predict.assert_not_called()

    def test_model_exception_is_sanitized(self):
        self.agent.predict.side_effect = RuntimeError('secret: Buyer email private@example.com')
        try:
            status, data = self.post(self.inputs['baseline'])
            self.assertEqual(status, 503)
            self.assertEqual(data, {'error': 'Local scoring failed. Retry or review the evidence manually.'})
            self.assertNotIn('private@example.com', str(data))
        finally:
            self.agent.predict.side_effect = None

    def test_malformed_model_output_never_becomes_a_recommendation(self):
        original = self.agent.predict.return_value
        try:
            for result in (None, {}, {'answers': {'attention': {'choice': 'priority', 'confidence': 0.2,
                           'probabilities': {'priority': float('nan'), 'nurture': 0.2, 'research': 0.2, 'deprioritize': 0.2}}}}):
                with self.subTest(result=result):
                    self.agent.predict.return_value = result
                    status, data = self.post(self.inputs['baseline'])
                    self.assertEqual(status, 422)
                    self.assertEqual(data, {'error': 'Laya returned an invalid attention score'})
        finally:
            self.agent.predict.return_value = original

    def test_busy_worker_rejects_before_inference_and_recovers(self):
        self.assertTrue(self.server.INFERENCE_SLOTS.acquire(blocking=False))
        try:
            status, data = self.post(self.inputs['baseline'])
            self.assertEqual(status, 503)
            self.assertEqual(data, {'error': 'Local Laya is busy. Retry shortly.'})
            self.agent.predict.assert_not_called()
        finally:
            self.server.INFERENCE_SLOTS.release()
        status, _ = self.post(self.inputs['baseline'])
        self.assertEqual(status, 200)
        self.agent.predict.assert_called_once()

    def test_http_connection_limit_rejects_overload_without_spawning_a_thread(self):
        server = self.server.BoundedHTTPServer.__new__(self.server.BoundedHTTPServer)
        server.request_slots = threading.BoundedSemaphore(1)
        self.assertTrue(server.request_slots.acquire(blocking=False))
        sock = Mock()
        server.shutdown_request = Mock()
        with patch.object(ThreadingHTTPServer, 'process_request') as spawn:
            server.process_request(sock, ('127.0.0.1', 12345))
        spawn.assert_not_called()
        sock.sendall.assert_called_once()
        self.assertIn(b'503 Service Unavailable', sock.sendall.call_args.args[0])
        server.shutdown_request.assert_called_once_with(sock)
        server.request_slots.release()
        with patch.object(ThreadingHTTPServer, 'process_request') as spawn:
            server.process_request(sock, ('127.0.0.1', 12345))
        spawn.assert_called_once()
        self.assertFalse(server.request_slots.acquire(blocking=False))
        with patch.object(ThreadingHTTPServer, 'process_request_thread'):
            server.process_request_thread(sock, ('127.0.0.1', 12345))
        self.assertTrue(server.request_slots.acquire(blocking=False))
        server.request_slots.release()

    def test_thai_overflow_is_an_explicit_unscored_result_before_inference(self):
        status, data = self.post(self.inputs['thai'])
        self.assertEqual(status, 422)
        self.assertEqual(data['code'], 'input_too_long')
        self.assertEqual(data['status'], 'not_scored')
        self.assertEqual(data['token_limit'], self.agent.shape['max_length'])
        self.assertGreater(data['input_tokens'], data['token_limit'])
        self.assertNotIn('recommendation', data)
        self.agent.predict.assert_not_called()

    def test_short_input_reaches_inference_unchanged(self):
        payload = self.inputs['baseline']
        prepared, _ = self.agent.prepare(payload['state'], payload['questions'])
        self.assertEqual(len(prepared[0]['ids']), 93)
        status, data = self.post(payload)
        self.assertEqual(status, 200)
        self.assertIn('recommendation', data)
        self.agent.predict.assert_called_once_with(payload['state'], payload['questions'])

    def test_success_trace_reports_actual_input_manifest_and_utc_time(self):
        payload = self.inputs['baseline']
        with patch.object(self.server, 'datetime', create=True) as clock:
            from datetime import datetime, timezone
            clock.now.return_value = datetime(2026, 9, 23, 4, 5, 6, tzinfo=timezone.utc)
            status, data = self.post(payload)
        self.assertEqual(status, 200)
        self.assertEqual(data['trace']['scored_input'], payload)
        self.assertEqual(data['trace']['scored_at'], '2026-09-23T04:05:06+00:00')
        manifest = json.loads((MODEL / 'coreml_config.json').read_text())
        self.assertEqual(data['trace']['model'], {
            'repository': manifest['repository'],
            'source_revision': manifest['source_revision'],
            'package_sha256': manifest['package_sha256'],
            'engine': 'cpu_ne',
        })

    def test_refusal_never_claims_a_scored_trace(self):
        status, data = self.post(self.inputs['refusal'])
        self.assertEqual(status, 422)
        self.assertNotIn('trace', data)

    def test_late_no_contact_evidence_is_not_cut_to_make_it_fit(self):
        payload = self.inputs['refusal']
        self.assertIn('but later declined and requested no contact', payload['state'])
        status, data = self.post(payload)
        self.assertEqual(status, 422)
        self.assertEqual(data['code'], 'input_too_long')
        self.assertNotIn('recommendation', data)
        self.agent.predict.assert_not_called()

    def test_real_tokenizer_boundaries_include_question_and_option_overhead(self):
        for count in (95, 96, 97):
            with self.subTest(tokens=count):
                self.agent.predict.reset_mock()
                payload = dict(self.inputs['baseline'])
                for words in range(1, 120):
                    payload['state'] = 'yes ' * words
                    prepared, _ = self.agent.prepare(payload['state'].strip(), payload['questions'])
                    if len(prepared[0]['ids']) == count:
                        break
                else:
                    self.fail(f'Could not construct boundary fixture: {count}')
                status, data = self.post(payload)
                if count <= 96:
                    self.assertEqual(status, 200)
                    self.agent.predict.assert_called_once_with(payload['state'].strip(), payload['questions'])
                else:
                    self.assertEqual(status, 422)
                    self.assertEqual(data['input_tokens'], count)
                    self.assertNotIn('recommendation', data)
                    self.agent.predict.assert_not_called()

    def test_counts_before_upstream_configured_truncation(self):
        payload = {**self.inputs['baseline'], 'state': 'yes ' * self.agent.cfg['max_len'] + 'Do not contact.'}
        status, data = self.post(payload)
        self.assertEqual(status, 422)
        self.assertEqual(data['code'], 'input_too_long')
        self.assertGreater(data['input_tokens'], self.agent.cfg['max_len'])
        self.agent.predict.assert_not_called()

    def test_long_question_is_not_silently_shortened(self):
        payload = {'state': 'Buyer declined', 'questions': {'attention': {
            **self.inputs['baseline']['questions']['attention'],
            'instructions': 'Review the entire buyer evidence. ' * 50,
        }}}
        status, data = self.post(payload)
        self.assertEqual(status, 400)
        self.assertEqual(data['error'], 'Unsupported scoring schema')
        self.agent.predict.assert_not_called()

    def test_rejects_native_token_replacement_instead_of_changing_evidence(self):
        payload = {**self.inputs['baseline'], 'state': f'Buyer mentioned {self.agent.tok.mask_token} in the note.'}
        status, data = self.post(payload)
        self.assertEqual(status, 422)
        self.assertEqual(data['code'], 'input_would_change')
        self.agent.predict.assert_not_called()

    def test_short_thai_input_is_not_rejected_just_for_its_language(self):
        payload = {**self.inputs['baseline'], 'state': 'ลูกค้าขอราคา'}
        status, _ = self.post(payload)
        self.assertEqual(status, 200)
        self.agent.predict.assert_called_once_with(payload['state'], payload['questions'])


if __name__ == '__main__':
    unittest.main()
