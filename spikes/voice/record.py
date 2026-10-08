"""Records your voice sample for the spike: 20 seconds, 24 kHz mono, to gen/me.wav.

  vendor/venv/bin/python record.py

It opens with the consent sentence the real feature will require, then a short
standup-style passage. Read at your normal meeting pace, in a quiet room.
"""
import sys
import time

import numpy as np
import sounddevice as sd
import soundfile as sf

SR = 24000
SECONDS = 20
SCRIPT = (
    "I'm recording my own voice so Peguin can speak for me in meetings, always introduced as my AI assistant.\n"
    "Yesterday I finished the billing page and reviewed two pull requests.\n"
    "Today I'm on the onboarding emails. No blockers, and I'll share a demo on Friday."
)

print("\nRead this aloud when recording starts:\n")
print(SCRIPT, "\n")
for n in (3, 2, 1):
    print(f"  starting in {n}...", end="\r", flush=True)
    time.sleep(1)
print("  ● recording (20 s)          ")
audio = sd.rec(int(SECONDS * SR), samplerate=SR, channels=1, dtype="float32")
for left in range(SECONDS, 0, -1):
    print(f"  {left:2d}s left", end="\r", flush=True)
    time.sleep(1)
sd.wait()

audio = audio[:, 0]
peak = float(np.max(np.abs(audio)))
if peak < 0.02:
    sys.exit("That was nearly silent. Check System Settings > Privacy & Security > Microphone for your terminal, then try again.")
# Trim leading and trailing silence, normalise to a sensible level.
voiced = np.where(np.abs(audio) > peak * 0.05)[0]
audio = audio[max(0, voiced[0] - SR // 10): voiced[-1] + SR // 5]
audio = audio / peak * 0.9
sf.write("gen/me.wav", audio, SR)
print(f"\nSaved gen/me.wav ({len(audio) / SR:.1f} s). Nothing leaves this Mac.")
