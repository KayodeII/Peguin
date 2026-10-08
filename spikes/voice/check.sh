#!/usr/bin/env bash
# Transcribes every clip in a folder with Peguin's own whisper, to check the words.
#   bash check.sh gen/v2-fp32
set -euo pipefail
cd "$(dirname "$0")"
ROOT=../../desktop
"$ROOT/build/whisper/whisper-server" -m "$ROOT/vendor/whisper.cpp/models/ggml-base.en.bin" --port 8178 >/dev/null 2>&1 &
pid=$!; trap 'kill $pid' EXIT
mkdir -p gen/16k
vendor/venv/bin/python - "$1" <<'PY'
import glob, os, sys, librosa, soundfile as sf
for f in sorted(glob.glob(f"{sys.argv[1]}/*.wav")):
    y, _ = librosa.load(f, sr=16000)
    sf.write(f"gen/16k/{os.path.basename(f)}", y, 16000, subtype="PCM_16")
PY
sleep 2
for f in "$1"/*.wav; do
  printf "%-14s" "$(basename "$f" .wav)"
  curl -s -F file=@"gen/16k/$(basename "$f")" -F response_format=text http://127.0.0.1:8178/inference | tr '\n' ' '; echo
done
