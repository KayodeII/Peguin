#!/usr/bin/env bash
# Builds a self-contained whisper-server (static libs, Metal shaders embedded)
# into build/whisper/ for packaging. Needs the source from setup-whisper.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=vendor/whisper.cpp
[ -d "$SRC" ] || { echo "Run npm run setup:whisper first"; exit 1; }
command -v cmake >/dev/null || export PATH="$PWD/vendor/venv/bin:$PATH"
cmake -S "$SRC" -B "$SRC/build-release" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
  -DGGML_METAL_EMBED_LIBRARY=ON -DWHISPER_BUILD_TESTS=OFF -DCMAKE_OSX_DEPLOYMENT_TARGET=12.0 >/dev/null
cmake --build "$SRC/build-release" -j --config Release --target whisper-server >/dev/null
mkdir -p build/whisper
cp "$SRC/build-release/bin/whisper-server" build/whisper/
# Only system libraries may remain.
if otool -L build/whisper/whisper-server | tail -n +2 | grep -v -E "^\s+(/usr/lib|/System/Library)"; then
  echo "whisper-server links non-system libraries (above); it won't run on other Macs" >&2; exit 1
fi
echo "build/whisper/whisper-server ready ($(du -h build/whisper/whisper-server | cut -f1))"
