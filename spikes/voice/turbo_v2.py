"""Voice spike v2: same Chatterbox Turbo ONNX model, made to sound more human.

Changes from turbo_onnx.py (v1):
- Sampling (temperature 0.6, top-k 1000, top-p 0.95, repetition penalty 1.2)
  instead of always taking the most likely token, which sounds flat and slurs.
  Resemble uses 0.8; 0.6 drops fewer words.
- Each sentence is checked with whisper small.en and regenerated (up to --takes)
  when the words come back wrong. Generation stops at ~3 tokens per character.
- One sentence at a time, silence trimmed, joined with natural pauses.
- Text clean-up (Resemble's punc_norm) plus a pronunciation list for names.
- Loudness levelled across sentences, short fades so joins don't click.

  vendor/venv/bin/python turbo_v2.py --ref gen/me.wav [--dtype fp32] [--seed 7]
"""
import argparse
import difflib
import subprocess
import json
import os
import re
import time

import librosa
import numpy as np
import onnxruntime
import soundfile as sf
from huggingface_hub import hf_hub_download
import requests
from num2words import num2words
from transformers import AutoTokenizer

from lines import LINES

MODEL_ID = "ResembleAI/chatterbox-turbo-ONNX"
SR = 24000
START, STOP, SILENCE = 6561, 6562, 4299
NUM_KV_HEADS, HEAD_DIM = 16, 64

# How names should sound, written the way the model reads them. In the app the
# owner sets their own ("How do you say your name?").
PRONOUNCE = {"Peguin": "Peh-gwin"}

# Retry a sentence only for real slips: accented but correct speech still scores ~0.1-0.2.
ACCEPT_ERROR = 0.2
SENTENCE_PAUSE_S = 0.32
TAIL_PAUSE_S = 0.15


def punc_norm(text: str) -> str:
    """Resemble's punc_norm: tidy punctuation the model wasn't trained on."""
    text = text.strip()
    if not text:
        return text
    if text[0].islower():
        text = text[0].upper() + text[1:]
    text = " ".join(text.split())
    for a, b in [("...", ", "), ("…", ", "), (":", ","), (" - ", ", "), (";", ", "), ("—", ", "), ("–", ", "),
                 (" ,", ","), ("“", '"'), ("”", '"'), ("‘", "'"), ("’", "'")]:
        text = text.replace(a, b)
    if text[-1] not in ".!?-,":
        text += "."
    return text


def prepare(text: str) -> list[str]:
    for word, said in PRONOUNCE.items():
        text = re.sub(rf"\b{re.escape(word)}\b", said, text)
    sentences = re.split(r"(?<=[.!?])\s+", punc_norm(text))
    return [s for s in sentences if s.strip()]


def sample(logits, generated, rng, temperature=0.6, top_k=1000, top_p=0.95, penalty=1.2):
    logits = logits.astype(np.float64)
    # Repetition penalty on tokens already spoken.
    prev = np.unique(generated)
    vals = logits[prev]
    logits[prev] = np.where(vals < 0, vals * penalty, vals / penalty)
    logits = logits / temperature
    # Top-k, then nucleus (top-p) over a softmax.
    k = min(top_k, logits.shape[0])
    idx = np.argpartition(-logits, k - 1)[:k]
    idx = idx[np.argsort(-logits[idx])]
    probs = np.exp(logits[idx] - logits[idx].max())
    probs /= probs.sum()
    keep = np.searchsorted(np.cumsum(probs), top_p) + 1
    idx, probs = idx[:keep], probs[:keep] / probs[:keep].sum()
    return int(rng.choice(idx, p=probs))


def trim(wav, top_db=40):
    """Cut leading and trailing silence, keeping a few ms so consonants aren't clipped."""
    _, (a, b) = librosa.effects.trim(wav, top_db=top_db)
    pad = int(0.03 * SR)
    return wav[max(0, a - pad): min(len(wav), b + pad)]


def fade(wav, ms=12):
    n = min(len(wav) // 2, int(SR * ms / 1000))
    if n:
        ramp = np.linspace(0, 1, n, dtype=np.float32)
        wav[:n] *= ramp
        wav[-n:] *= ramp[::-1]
    return wav


def level(wav, target_rms=0.08):
    rms = float(np.sqrt(np.mean(wav ** 2))) or 1.0
    out = wav * (target_rms / rms)
    peak = float(np.max(np.abs(out))) or 1.0
    return out / peak * 0.95 if peak > 0.95 else out


class Turbo:
    def __init__(self, dtype: str):
        local = os.path.join(os.path.dirname(__file__), "vendor", "models", "chatterbox-turbo")
        paths = {}
        for name in ["conditional_decoder", "speech_encoder", "embed_tokens", "language_model"]:
            filename = f"{name}{'' if dtype == 'fp32' else '_quantized' if dtype == 'q8' else f'_{dtype}'}.onnx"
            paths[name] = hf_hub_download(MODEL_ID, subfolder="onnx", filename=filename, local_dir=local)
            hf_hub_download(MODEL_ID, subfolder="onnx", filename=f"{filename}_data", local_dir=local)
        self.s = {k: onnxruntime.InferenceSession(p, providers=["CPUExecutionProvider"]) for k, p in paths.items()}
        self.tok = AutoTokenizer.from_pretrained(MODEL_ID)
        self.kv = [x for x in self.s["language_model"].get_inputs() if "past_key_values" in x.name]

    def voice(self, ref_path):
        ref, _ = librosa.load(ref_path, sr=SR)
        ref = ref[np.newaxis, : SR * 15].astype(np.float32)  # the model only uses the first 10-15 s
        return self.s["speech_encoder"].run(None, {"audio_values": ref})

    def sentence(self, text, voice, rng, temperature=0.6):
        # Speech tokens run at 25 per second; a sentence never needs more than ~3 per character.
        max_tokens = 3 * len(text) + 40
        cond_emb, prompt_token, spk_emb, spk_feat = voice
        input_ids = self.tok(text, return_tensors="np")["input_ids"].astype(np.int64)
        generated = [START]
        for i in range(max_tokens):
            embeds = self.s["embed_tokens"].run(None, {"input_ids": input_ids})[0]
            if i == 0:
                embeds = np.concatenate((cond_emb, embeds), axis=1)
                seq = embeds.shape[1]
                past = {x.name: np.zeros([1, NUM_KV_HEADS, 0, HEAD_DIM], dtype=np.float16 if x.type == "tensor(float16)" else np.float32) for x in self.kv}
                mask = np.ones((1, seq), dtype=np.int64)
                pos = np.arange(seq, dtype=np.int64).reshape(1, -1)
            logits, *present = self.s["language_model"].run(None, dict(inputs_embeds=embeds, attention_mask=mask, position_ids=pos, **past))
            nxt = sample(logits[0, -1], np.array(generated), rng, temperature=temperature)
            generated.append(nxt)
            if nxt == STOP:
                break
            input_ids = np.array([[nxt]], dtype=np.int64)
            mask = np.concatenate([mask, np.ones((1, 1), dtype=np.int64)], axis=1)
            pos = pos[:, -1:] + 1
            for j, k in enumerate(past):
                past[k] = present[j]
        speech = np.array([generated[1:-1] if generated[-1] == STOP else generated[1:]], dtype=np.int64)
        tokens = np.concatenate([prompt_token, speech, np.full((1, 3), SILENCE, dtype=np.int64)], axis=1)
        wav = self.s["conditional_decoder"].run(None, dict(speech_tokens=tokens, speaker_embeddings=spk_emb, speaker_features=spk_feat))[0].squeeze(0)
        return fade(trim(wav.astype(np.float32)))

    def line(self, text, voice, rng, checker=None, takes=3, temperature=0.6, log=None):
        parts = []
        spoken = [s for s in re.split(r"(?<=[.!?])\s+", punc_norm(text)) if s.strip()]
        for i, (sent, said) in enumerate(zip(prepare(text), spoken)):
            if i:
                parts.append(np.zeros(int(SR * SENTENCE_PAUSE_S), dtype=np.float32))
            best, best_err = None, 2.0
            for take in range(takes if checker else 1):
                wav = self.sentence(sent, voice, rng, temperature)
                if not checker:
                    best = wav
                    break
                heard = checker(wav)
                err = word_error(said, heard)
                if log is not None:
                    log.append({"sentence": said, "take": take + 1, "heard": heard, "error": round(err, 2)})
                if err < best_err:
                    best, best_err = wav, err
                if err <= ACCEPT_ERROR:
                    break
            parts.append(best)
        parts.append(np.zeros(int(SR * TAIL_PAUSE_S), dtype=np.float32))
        return level(np.concatenate(parts))


def words(text: str) -> list[str]:
    text = re.sub(r"\d+", lambda m: " " + num2words(int(m.group())) + " ", text.lower())
    return re.findall(r"[a-z]+", text.replace("-", " "))


def word_error(target: str, heard: str) -> float:
    """1 - similarity of the word sequences (0 = every word right)."""
    t, h = words(target), words(heard)
    return 1 - difflib.SequenceMatcher(None, t, h).ratio() if t else 0.0


class Whisper:
    """Peguin's own speech recognition, used to check each generated sentence."""

    def __init__(self, port=8178, model=None):
        root = os.path.join(os.path.dirname(__file__), "..", "..", "desktop")
        # small.en copes with accents much better than base.en (which misheard the owner's own recording).
        model = model or os.path.join(os.path.dirname(__file__), "vendor", "whisper", "ggml-small.en.bin")
        self.url = f"http://127.0.0.1:{port}/inference"
        self.proc = subprocess.Popen([os.path.join(root, "build/whisper/whisper-server"), "-m", model, "--port", str(port)],
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(50):
            try:
                requests.get(f"http://127.0.0.1:{port}/", timeout=0.5)
                break
            except requests.RequestException:
                time.sleep(0.2)

    def __call__(self, wav) -> str:
        import io
        buf = io.BytesIO()
        sf.write(buf, librosa.resample(wav, orig_sr=SR, target_sr=16000), 16000, format="WAV", subtype="PCM_16")
        r = requests.post(self.url, files={"file": ("s.wav", buf.getvalue())}, data={"response_format": "text"}, timeout=30)
        return r.text.strip()

    def close(self):
        self.proc.terminate()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ref", required=True)
    ap.add_argument("--dtype", default="fp32", choices=["fp32", "q8", "q4"])
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", default=None)
    ap.add_argument("--takes", type=int, default=3, help="regenerate a sentence up to N times until whisper hears the right words (1 = no check)")
    ap.add_argument("--temp", type=float, default=0.6)
    ap.add_argument("--only", default=None, help="comma-separated line keys")
    args = ap.parse_args()
    out = args.out or f"gen/v2-{args.dtype}"
    os.makedirs(out, exist_ok=True)
    timing = f"{out}/timing{'-' + args.only.replace(',', '-') if args.only else ''}.json"

    model = Turbo(args.dtype)
    voice = model.voice(args.ref)
    rng = np.random.default_rng(args.seed)
    checker = Whisper() if args.takes > 1 else None
    results, checks = [], []
    for key, text in LINES.items():
        if args.only and key not in args.only.split(","):
            continue
        t = time.perf_counter()
        wav = model.line(text, voice, rng, checker, args.takes, args.temp, checks)
        gen_s = time.perf_counter() - t
        sf.write(f"{out}/{key}.wav", wav, SR)
        results.append({"line": key, "sentences": prepare(text), "audio_s": round(len(wav) / SR, 2), "gen_s": round(gen_s, 2), "rtf": round(gen_s / (len(wav) / SR), 2)})
        print(json.dumps({k: v for k, v in results[-1].items() if k != "sentences"}), flush=True)
    with open(timing, "w") as f:
        json.dump({"model": f"chatterbox-turbo-onnx/{args.dtype}", "seed": args.seed, "temp": args.temp, "takes": args.takes, "lines": results, "checks": checks}, f, indent=2)
    if checker:
        checker.close()


if __name__ == "__main__":
    main()
