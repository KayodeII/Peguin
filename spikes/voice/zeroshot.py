"""Zero-shot comparison: OmniVoice and Qwen3-TTS (both Apache 2.0) cloning the
owner's voice from the same sample Chatterbox uses, on the same lines.

  vendor/venv-zs/bin/python zeroshot.py --model omnivoice|qwen [--device mps|cpu]

Writes gen/<model>/<line>.wav and timing.json.
"""
import argparse
import json
import os
import time

import soundfile as sf
import torch

from lines import LINES

# What the owner read in gen/me.wav (record.py's script), for models that want the reference text.
REF_TEXT = ("I'm recording my own voice so Peguin can speak for me in meetings, always introduced as my AI assistant. "
            "Yesterday I finished the billing page and reviewed two pull requests. "
            "Today I'm on the onboarding emails. No blockers, and I'll share a demo on Friday.")


def load(model: str, device: str):
    if model == "omnivoice":
        from omnivoice import OmniVoice
        m = OmniVoice.from_pretrained("k2-fsa/OmniVoice", device_map=device)
        return lambda text: m.generate(text=text, ref_audio="gen/me.wav", ref_text=REF_TEXT), getattr(m, "sample_rate", 24000)
    from qwen_tts import Qwen3TTSModel
    m = Qwen3TTSModel.from_pretrained("Qwen/Qwen3-TTS-12Hz-1.7B-Base", device_map=device, dtype=torch.float32)
    def gen(text):
        wavs, sr = m.generate_voice_clone(text=text, language="English", ref_audio="gen/me.wav", ref_text=REF_TEXT)
        gen.sr = sr
        return wavs[0]
    return gen, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True, choices=["omnivoice", "qwen"])
    ap.add_argument("--device", default="mps", choices=["mps", "cpu"])
    args = ap.parse_args()
    out = f"gen/{args.model}"
    os.makedirs(out, exist_ok=True)
    t0 = time.perf_counter()
    gen, sr = load(args.model, args.device)
    load_s = time.perf_counter() - t0
    results = []
    for key, text in LINES.items():
        t = time.perf_counter()
        audio = gen(text)
        if isinstance(audio, (list, tuple)):
            audio = audio[0]
        if hasattr(audio, "detach"):
            audio = audio.detach().float().cpu().numpy()
        audio = audio.squeeze()
        rate = sr or getattr(gen, "sr", 24000)
        sf.write(f"{out}/{key}.wav", audio, rate)
        secs = len(audio) / rate
        gen_s = time.perf_counter() - t
        results.append({"line": key, "audio_s": round(secs, 2), "gen_s": round(gen_s, 2), "rtf": round(gen_s / secs, 2)})
        print(json.dumps(results[-1]), flush=True)
    with open(f"{out}/timing.json", "w") as f:
        json.dump({"model": args.model, "device": args.device, "load_s": round(load_s, 1), "lines": results}, f, indent=2)


if __name__ == "__main__":
    main()
