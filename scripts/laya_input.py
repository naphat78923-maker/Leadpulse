"""Fail-closed input preflight for the installed Laya tokenizer and model.

Do not shorten evidence to fit. Count the full encoded question, including every
option, marker and separator, before Laya's own prompt builder can truncate it.
"""
from laya_coreml.common import render_options


class InputRejected(ValueError):
    def __init__(self, code: str, message: str, input_tokens: int, token_limit: int):
        super().__init__(message)
        self.payload = {
            'status': 'not_scored', 'code': code, 'error': message,
            'input_tokens': input_tokens, 'token_limit': token_limit,
        }


def check_input_budget(agent, state: str, questions: dict) -> None:
    tok = agent.tok
    limit = min(agent.shape['max_length'], agent.cfg.get('max_len', 512))
    state_ids = tok(state, add_special_tokens=False)['input_ids']
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
