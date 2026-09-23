#!/bin/sh
set -eu

PYTHON="${LAYA_COREML_PYTHON:-/Users/pat/laya-coreml/.venv/bin/python}"
MODEL="${LAYA_COREML_MODEL_PATH:-/Users/pat/laya-coreml/models/ane}"

if [ ! -x "$PYTHON" ]; then
  printf '%s\n' "Laya Python was not found: $PYTHON" >&2
  printf '%s\n' 'Set LAYA_COREML_PYTHON to the Python environment where laya-coreml is installed.' >&2
  exit 1
fi

if [ ! -d "$MODEL" ]; then
  printf '%s\n' "Laya model was not found: $MODEL" >&2
  printf '%s\n' 'Set LAYA_COREML_MODEL_PATH to the downloaded local model directory.' >&2
  exit 1
fi

export LAYA_COREML_MODEL_PATH="$MODEL"
exec "$PYTHON" scripts/laya_score_server.py
