"""Guided recording for fine-tuning: one sentence at a time, ~60 sentences,
about 8 minutes of your voice. Saves gen/dataset/wavs/NNNN.wav and
gen/dataset/metadata.csv (LJSpeech format: id|text|text). Nothing leaves this Mac.

  vendor/venv/bin/python record_dataset.py

Keys: Enter starts recording, Enter again stops. Then: Enter = keep and go on,
r = redo, s = skip, q = quit (run again later to continue where you stopped).
Read naturally, the way you'd talk in standup, in a quiet room.
"""
import os
import sys

import numpy as np
import sounddevice as sd
import soundfile as sf

SR = 24000
OUT = os.path.join(os.path.dirname(__file__), "gen", "dataset")
NAME = os.environ.get("PEGUIN_NAME", "Mujeeb")

# Harvard sentences (public domain, phonetically balanced) + the kind of thing Peguin says.
SENTENCES = [
    "The birch canoe slid on the smooth planks.",
    "Glue the sheet to the dark blue background.",
    "It's easy to tell the depth of a well.",
    "These days a chicken leg is a rare dish.",
    "Rice is often served in round bowls.",
    "The juice of lemons makes fine punch.",
    "The box was thrown beside the parked truck.",
    "The hogs were fed chopped corn and garbage.",
    "Four hours of steady work faced us.",
    "A large size in stockings is hard to sell.",
    "The boy was there when the sun rose.",
    "A rod is used to catch pink salmon.",
    "The source of the huge river is the clear spring.",
    "Kick the ball straight and follow through.",
    "Help the woman get back to her feet.",
    "A pot of tea helps to pass the evening.",
    "Smoky fires lack flame and heat.",
    "The soft cushion broke the man's fall.",
    "The salt breeze came across from the sea.",
    "The girl at the booth sold fifty bonds.",
    "The small pup gnawed a hole in the sock.",
    "The fish twisted and turned on the bent hook.",
    "Press the pants and sew a button on the vest.",
    "The swan dive was far short of perfect.",
    "The beauty of the view stunned the young boy.",
    "Two blue fish swam in the tank.",
    "Her purse was full of useless trash.",
    "The colt reared and threw the tall rider.",
    "It snowed, rained, and hailed the same morning.",
    "Read verse out loud for pleasure.",
    f"Hi everyone, I'm Peguin, {NAME}'s AI assistant.",
    f"{NAME} is in another meeting, so I'm covering the update.",
    "Yesterday I added retries for payment webhooks.",
    "I also fixed the flaky invoice test that kept failing on main.",
    "Today I'm moving the users table over to the new login system.",
    "No blockers from me.",
    "It's in progress. There's no date yet, so I'll follow up after the call.",
    "Good question. I'll get back to you on that after standup.",
    "Thanks, will do.",
    "Pull request four eighty-two is merged, and the migration is at step one of three.",
    "I reviewed two pull requests and left comments on the refunds page.",
    "The deploy to staging went out at around ten this morning.",
    "We're seeing timeouts from the Postgres replica under load.",
    "I'm pairing with the design team on the onboarding emails this afternoon.",
    "The Redis cache was evicting keys too early, so I bumped the memory limit.",
    "Kubernetes rolled back the release after the health check failed.",
    "I'll have a draft of the API changes ready by Thursday.",
    "The dashboard filters are done, but the export button still needs tests.",
    "Can someone share the staging link with the product team?",
    "I'm blocked on access to the analytics bucket; I've asked infra for it.",
    "Let's take that offline after the call.",
    "Quick update from me: mostly code review and a few small bug fixes.",
    "The authentication schema change needs a careful rollout, probably next week.",
    "Monday, Tuesday, Wednesday, Thursday, Friday.",
    "One, two, three, four, five, six, seven, eight, nine, ten.",
    "Could you repeat the question? I want to make sure I answer it properly.",
    "I'm not sure about that one, so I'd rather not guess.",
    "Great work everyone, see you tomorrow.",
    f"{NAME} will follow up on anything else after the call.",
    "That's everything from me. Over to you.",
]


# One microphone stream for the whole session. Stopping and restarting a CoreAudio
# stream for every sentence sometimes hangs inside AudioDeviceStop on macOS.
_chunks: list = []
_recording = False


def _on_audio(indata, frames, t, status):
    if _recording:
        _chunks.append(indata.copy())


def record_until_enter():
    global _recording, _chunks
    _chunks = []
    _recording = True
    try:
        input("  ● recording, press Enter to stop ")
    finally:
        _recording = False
    return np.concatenate(_chunks)[:, 0] if _chunks else np.zeros(0, dtype=np.float32)


def trim(audio):
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    if peak < 0.02:
        return None
    voiced = np.where(np.abs(audio) > peak * 0.05)[0]
    a = audio[max(0, voiced[0] - SR // 10): voiced[-1] + SR // 5]
    return a / peak * 0.9


def main():
    os.makedirs(os.path.join(OUT, "wavs"), exist_ok=True)
    meta_path = os.path.join(OUT, "metadata.csv")
    done = {}
    if os.path.exists(meta_path):
        for line in open(meta_path, encoding="utf-8"):
            parts = line.rstrip("\n").split("|")
            if len(parts) >= 2:
                done[parts[0]] = parts[1]
    for i, text in enumerate(SENTENCES, 1):
        sid = f"{i:04d}"
        if sid in done:
            continue
        while True:
            print(f"\n[{i}/{len(SENTENCES)}]  {text}")
            key = input("  press Enter to record (s = skip, q = quit) ").strip().lower()
            if key == "q":
                return finish(meta_path)
            if key == "s":
                break
            audio = trim(record_until_enter())
            if audio is None:
                print("  That was nearly silent. Check the microphone and try again.")
                continue
            if input(f"  {len(audio) / SR:.1f}s. Enter = keep, r = redo ").strip().lower() == "r":
                continue
            sf.write(os.path.join(OUT, "wavs", f"{sid}.wav"), audio, SR)
            with open(meta_path, "a", encoding="utf-8") as f:
                f.write(f"{sid}|{text}|{text}\n")
            break
    finish(meta_path)


def finish(meta_path):
    n = sum(1 for _ in open(meta_path, encoding="utf-8")) if os.path.exists(meta_path) else 0
    print(f"\n{n} of {len(SENTENCES)} sentences saved in gen/dataset. Run again to continue or redo skipped ones.")


if __name__ == "__main__":
    stream = sd.InputStream(samplerate=SR, channels=1, dtype="float32", callback=_on_audio)
    stream.start()
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped. Run again to continue.")
    finally:
        # Abort rather than stop: no waiting on CoreAudio at exit.
        stream.abort(ignore_errors=True)
        stream.close(ignore_errors=True)
