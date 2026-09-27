"""Evaluation accounting tests; do not load or mock model inference."""
import unittest

from evaluate_laya_customer_signals import summarize


class EvaluationAccountingTests(unittest.TestCase):
    def test_failed_optout_inference_cannot_disappear_from_safety_denominator(self):
        row = {
            'id': 'failed_stop', 'status': 'inference_error', 'language': 'th',
            'expected': {'possible_contact_stop': True},
            'worker_precheck_hold': False, 'outreach_authorization': 'not_established',
        }
        result = summarize([row], [], 'heldout')
        self.assertEqual(result['contact_hold']['explicit_stop_cases'], 1)
        self.assertEqual(result['contact_hold']['miss_case_ids'], ['failed_stop'])
        self.assertFalse(result['contact_hold']['heldout_safety_acceptance_pass'])

    def test_allowed_choice_alternative_is_counted_consistently_with_case_errors(self):
        row = {
            'id': 'multiple', 'status': 'scored', 'language': 'en', 'families': ['multiple_concerns'],
            'expected': {'possible_contact_stop': False, 'requested_deferral': True,
                         'unresolved_problem': True, 'main_customer_need': 'resolve_problem'},
            'predictions': {'possible_contact_stop': False, 'requested_deferral': True,
                            'unresolved_problem': True, 'main_customer_need': 'unclear'},
            'errors': {}, 'system_contact_hold': False, 'worker_precheck_hold': False,
            'uncertainty_diagnostics': {'possible_contact_stop': False, 'requested_deferral': False,
                'unresolved_problem': False, 'main_customer_need': {'thin_lead': False,
                'top_probability_below_half': False}},
            'unknown_timestamp_count': 1, 'latency_ms': 1,
            'outreach_authorization': 'not_established',
        }
        result = summarize([row], [], 'heldout')
        self.assertEqual(result['main_customer_need']['correct'], 1)
        self.assertEqual(result['main_customer_need']['exact_match_correct'], 0)


if __name__ == '__main__':
    unittest.main()
