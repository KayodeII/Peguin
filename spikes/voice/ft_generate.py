"""Speaks the test lines with the fine-tuned (LoRA) Chatterbox Turbo, for comparison.
Run from vendor/chatterbox-finetuning so its src/ package and config resolve:

  cd vendor/chatterbox-finetuning && ../venv-ft/bin/python ../../ft_generate.py --out ../../gen/ft-21 [--ref ../../gen/me.wav]

Same settings as the app (temperature 0.6, repetition penalty 1.2), one sentence
at a time, with the toolkit's silence trim and a short pause between sentences.
"""
import argparse
import json
import os
import re
import sys
import time

import numpy as np
import soundfile as sf
import torch

sys.path.insert(0, os.getcwd())
import inference as kit  # the toolkit's inference.py: builds the base engine and loads the LoRA adapter

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__))))
from lines import LINES  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--ref", default="../../gen/me.wav")
    ap.add_argument("--device", default="mps" if torch.backends.mps.is_available() else "cpu")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    t0 = time.perf_counter()
    engine = kit.load_finetuned_engine_lora(args.device)
    load_s = time.perf_counter() - t0
    kit.set_seed(7)
    results = []
    for key, text in LINES.items():
        t = time.perf_counter()
        chunks = []
        for sent in [s for s in re.split(r"(?<=[.?!])\s+", text.strip()) if s.strip()]:
            sr, audio = kit.generate_sentence_audio(engine, sent, args.ref, temperature=0.6, repetition_penalty=1.2)
            if len(audio):
                chunks += [audio, np.zeros(int(sr * 0.32), dtype=np.float32)]
        wav = np.concatenate(chunks) if chunks else np.zeros(1, dtype=np.float32)
        sf.write(f"{args.out}/{key}.wav", wav, 24000)
        gen_s = time.perf_counter() - t
        results.append({"line": key, "audio_s": round(len(wav) / 24000, 2), "gen_s": round(gen_s, 2)})
        print(json.dumps(results[-1]), flush=True)
    with open(f"{args.out}/timing.json", "w") as f:
        json.dump({"model": "chatterbox-turbo + LoRA", "device": args.device, "load_s": round(load_s, 1), "lines": results}, f, indent=2)


if __name__ == "__main__":
    main()
