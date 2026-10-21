#!/usr/bin/env bash
# Builds the helper that moves the mouse, types and reads button names for voice control, into build/pointer/.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build/pointer
swiftc -O -target arm64-apple-macos12.0 native/pointer.swift -o build/pointer/pointer-helper
echo "build/pointer/pointer-helper ready"
