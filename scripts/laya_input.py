"""Fail-closed input preflight for the installed Laya tokenizer and model.

Do not shorten evidence to fit. Count the full encoded question, including every
option, marker and separator, before Laya's own prompt builder can truncate it.
"""
import re
from typing import Any

from laya_coreml.common import render_options, serialize_state

# A conservative, explicit-language gate, not a complete consent classifier.
# Check the full selected state, including the end of the outcome, before inference.
_OPT_OUT_PATTERNS = (
    re.compile(r"\b(?:do not|don't|dont|never)\s+(?:contact|call|email|message|reach out(?: to)?)\b", re.I),
    re.compile(r"\b(?:asked|requested|requests?|wants?|prefers?|said|told us)\s+(?:us\s+)?(?:for\s+)?(?:no\s+(?:further\s+)?(?:contact|outreach)|not\s+to\s+(?:be\s+)?(?:contact(?:ed)?|call|email|message))\b", re.I),
    re.compile(r"\b(?:asked|requested|requests?|wants?|prefers?|said|told us)\s+(?:us\s+)?(?:to\s+)?stop\s+(?:calling|contacting|emailing|messaging)\b", re.I),
    re.compile(r"\b(?:stop|cease)\s+(?:all\s+)?(?:contacting|contact|outreach|messaging|emails?)\b", re.I),
    re.compile(r"\b(?:unsubscribe|unsubscribed|opted[\s-]+out)\b", re.I),
    re.compile(r"(?:ไม่ต้อง|อย่า|ห้าม|งด|ขอไม่ให้|ไม่ต้องการ(?:ให้)?)\s*(?:ติดต่อ|ทัก|โทร)"),
)

def has_explicit_contact_opt_out(state: str) -> bool:
    return any(pattern.search(state) for pattern in _OPT_OUT_PATTERNS)


class InputRejected(ValueError):
    def __init__(self, code: str, message: str, input_tokens: int, token_limit: int):
        super().__init__(message)
        self.payload = {
            'status': 'not_scored', 'code': code, 'error': message,
            'input_tokens': input_tokens, 'token_limit': token_limit,
        }


def effective_input_limit(agent) -> int:
    """Respect both the native prompt default and the exported collate shape cap."""
    return min(agent.shape['max_length'], agent.cfg.get('max_len', 512))


def check_input_budget(agent, state: Any, questions: dict) -> None:
    tok = agent.tok
    limit = effective_input_limit(agent)
    state_ids = tok(serialize_state(state), add_special_tokens=False)['input_ids']
    complete = []
    for definition in questions.values():
        question = agent._to_internal(definition)
        # Match upstream's template without its head, option or state slices.
        ids = [tok.cls_token_id]
        ids += tok(f"{question['t']} question: {question['ins']}", add_special_tokens=False)['input_ids']
        ids.append(tok.sep_token_id)
        for option in render_options(question):
            ids.append(tok.mask_token_id)
            ids += tok(' ' + option, add_special_tokens=False)['input_ids']
        ids += [tok.sep_token_id] + state_ids + [tok.sep_token_id]
        complete.append(ids)

    longest = max((len(ids) for ids in complete), default=0)
    if longest > limit:
        raise InputRejected(
            'input_too_long',
            f'Not scored: full input needs {longest} tokens; this model supports {limit}. '
            'Nothing was shortened and no recommendation was made. Review the full evidence manually.',
            longest, limit,
        )

    # Guard against upstream prompt normalization/truncation changing the counted
    # input (including reserved mask text). Never infer from a different token set.
    prepared, _ = agent.prepare(state, questions)
    if [item['ids'] for item in prepared] != complete:
        raise InputRejected(
            'input_would_change',
            'Not scored: the model would alter the supplied input. Review the full evidence manually.',
            longest, limit,
        )
