#!/usr/bin/env bash
set -euo pipefail

TEMP="$(mktemp -d)"
trap 'rm -rf "$TEMP"' EXIT
curl -fsS -H 'Content-Type: application/json' \
  --data '{"text":"Проверяем распознавание русской речи.","voice":"eugene","sample_rate":24000}' \
  http://127.0.0.1:4050/synthesize > "$TEMP/control.wav"
ffmpeg -loglevel error -i "$TEMP/control.wav" -c:a libopus "$TEMP/control.webm"
curl -fsS -H 'Content-Type: audio/webm' --data-binary "@$TEMP/control.webm" \
  http://127.0.0.1:4060/transcribe > "$TEMP/result.json"
python3 - "$TEMP/result.json" <<'PY'
import json
import sys

result = json.load(open(sys.argv[1], encoding="utf-8"))
assert result["provider"] == "gigaam_v3_ctc"
assert result["text"].strip()
assert result["duration_seconds"] > 0
print(result["text"])
PY
