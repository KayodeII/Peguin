#!/usr/bin/env bash
# Developer setup only: builds whisper.cpp and fetches a speech model into
# ./vendor (gitignored). Nothing is installed system-wide. End users never run
# this: the shipped app bundles a prebuilt binary and downloads the model on
# first launch.
set -euo pipefail
cd "$(dirname "$0")"
MODEL="${WHISPER_MODEL:-base.en}"
mkdir -p vendor

if ! command -v cmake >/dev/null; then
  [ -x vendor/venv/bin/cmake ] || { python3 -m venv vendor/venv && vendor/venv/bin/pip install -q cmake; }
  export PATH="$PWD/vendor/venv/bin:$PATH"
fi

[ -d vendor/whisper.cpp ] || git clone -q --depth 1 https://github.com/ggml-org/whisper.cpp vendor/whisper.cpp
cmake -S vendor/whisper.cpp -B vendor/whisper.cpp/build -DCMAKE_BUILD_TYPE=Release -DWHISPER_BUILD_TESTS=OFF >/dev/null
cmake --build vendor/whisper.cpp/build -j --config Release --target whisper-server >/dev/null

[ -f "vendor/whisper.cpp/models/ggml-$MODEL.bin" ] || bash vendor/whisper.cpp/models/download-ggml-model.sh "$MODEL"
echo "whisper ready: vendor/whisper.cpp/build/bin/whisper-server + models/ggml-$MODEL.bin"
