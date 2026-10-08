#!/usr/bin/env bash
# Builds the EventKit helper that reads the Mac's calendars into build/calendar/.
# Its Info.plist (with the calendar usage text) is embedded in the binary.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build/calendar
swiftc -O -target arm64-apple-macos12.0 native/calendar.swift -o build/calendar/calendar-helper \
  -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker native/Info.plist
echo "build/calendar/calendar-helper ready"
