"""Fair comparison of voice variants: the same lines, N seeds each, one take per
sentence (no re-check), every clip transcribed with whisper small.en and scored.

  HF_HUB_OFFLINE=1 vendor/venv/bin/python eval_ab.py --variant base --seeds 8

Variants:
  base     zero-shot from gen/me.wav (what the app ships today)
  ft       fine-tuned on 60 sentences, patched into ONNX (gen/onnx-ft-60)
  natural  zero-shot from ~15 s of the owner's standup-style recordings instead of the read-through
  avgvoice zero-shot from gen/me.wav with the speaker fingerprint averaged over all 60 recordings
  natavg   natural + averaged fingerprint
  head     output-layer-only fine-tune, patched (gen/onnx-head-60)
Writes gen/ab/<variant>/<line>-s<seed>.wav and gen/ab/<variant>.json.
"""
import argparse
import glob
import json
import os
import re
import time

import librosa
import numpy as np
import soundfile as sf

import turbo_v2 as tv
from lines import LINES

LINE_KEYS = ["2-answer", "3-defer", "4-ack", "5-numbers", "6-update-spoken"]
DATASET = "gen/dataset"


def natural_reference(seconds=15.0):
    """The owner's standup-style recordings (sentences 31-60), joined with short gaps, up to `seconds`."""
    meta = [l.split("|") for l in open(f"{DATASET}/metadata.csv", encoding="utf-8")]
    parts, total = [], 0.0
    for sid, *_ in sorted(meta):
        if int(sid) < 31:
            continue
        a, _ = librosa.load(f"{DATASET}/wavs/{sid}.wav", sr=tv.SR)
        parts += [a, np.zeros(int(0.25 * tv.SR), dtype=np.float32)]
        total += len(a) / tv.SR + 0.25
        if total >= seconds:
            break
    return np.concatenate(parts)[: int(seconds * tv.SR)]


def averaged_fingerprint(model):
    """Mean speaker embedding over every recording, rescaled to the encoder's fixed norm."""
    embs = []
    for f in sorted(glob.glob(f"{DATASET}/wavs/*.wav")):
        a, _ = librosa.load(f, sr=tv.SR)
        embs.append(model.s["speech_encoder"].run(None, {"audio_values": a[None, : tv.SR * 15].astype(np.float32)})[2])
    e = np.mean(np.concatenate(embs), axis=0, keepdims=True)
    norm = float(np.linalg.norm(embs[0]))
    return (e / np.linalg.norm(e) * norm).astype(np.float32)


def encode(model, audio):
    return model.s["speech_encoder"].run(None, {"audio_values": audio[None, : tv.SR * 15].astype(np.float32)})


def name_tolerant(text):
    # Every variant says the owner's name; recognition spells it many ways. Score the rest.
    return re.sub(r"\b(m[ouae][a-z]{0,2}[jg][a-z]{0,4}b?|mojave)\b", "mujeeb", text, flags=re.I)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant", required=True, choices=["base", "ft", "natural", "avgvoice", "natavg", "head"])
    ap.add_argument("--seeds", type=int, default=8)
    args = ap.parse_args()
    model_dir = {"ft": "gen/onnx-ft-60", "head": "gen/onnx-head-60"}.get(args.variant)
    model = tv.Turbo("fp32", model_dir)
    me, _ = librosa.load("gen/me.wav", sr=tv.SR)
    ref = natural_reference() if args.variant in ("natural", "natavg") else me
    voice = list(encode(model, ref))
    if args.variant in ("avgvoice", "natavg"):
        voice[2] = averaged_fingerprint(model)
    voice = tuple(voice)

    checker = tv.Whisper()
    out = f"gen/ab/{args.variant}"
    os.makedirs(out, exist_ok=True)
    rows = []
    t0 = time.perf_counter()
    try:
        for seed in range(1, args.seeds + 1):
            rng = np.random.default_rng(seed)
            for key in LINE_KEYS:
                wav = model.line(LINES[key], voice, rng, checker=None, takes=1, temperature=0.6)
                sf.write(f"{out}/{key}-s{seed}.wav", wav, tv.SR)
                heard = checker(wav)
                err = tv.word_error(name_tolerant(LINES[key]), name_tolerant(heard))
                rows.append({"seed": seed, "line": key, "error": round(err, 3), "heard": heard})
            print(f"seed {seed}: mean error so far {np.mean([r['error'] for r in rows]):.3f}", flush=True)
    finally:
        checker.close()
    errs = np.array([r["error"] for r in rows])
    summary = {"variant": args.variant, "n": len(rows), "mean_error": round(float(errs.mean()), 4),
               "stderr": round(float(errs.std(ddof=1) / np.sqrt(len(errs))), 4),
               "perfect_share": round(float((errs <= 0.05).mean()), 3),
               "per_line": {k: round(float(np.mean([r["error"] for r in rows if r["line"] == k])), 3) for k in LINE_KEYS},
               "minutes": round((time.perf_counter() - t0) / 60, 1), "rows": rows}
    json.dump(summary, open(f"gen/ab/{args.variant}.json", "w"), indent=2)
    print(json.dumps({k: v for k, v in summary.items() if k != "rows"}))


if __name__ == "__main__":
    main()
