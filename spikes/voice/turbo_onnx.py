"""Voice spike: Chatterbox Turbo (MIT) through ONNX Runtime, the path that could
ship inside the Electron app via onnxruntime-node (no Python).

Generation loop follows the official example on
huggingface.co/ResembleAI/chatterbox-turbo-ONNX, plus timing.

  vendor/venv/bin/python turbo_onnx.py --ref gen/ref.wav [--dtype q8] [--out gen/turbo-q8]
"""
import argparse
import json
import os
import time

import librosa
import numpy as np
import onnxruntime
import soundfile as sf
from huggingface_hub import hf_hub_download
from transformers import AutoTokenizer

from lines import LINES

MODEL_ID = "ResembleAI/chatterbox-turbo-ONNX"
SAMPLE_RATE = 24000
START_SPEECH_TOKEN = 6561
STOP_SPEECH_TOKEN = 6562
SILENCE_TOKEN = 4299
NUM_KV_HEADS = 16
HEAD_DIM = 64


def repetition_penalty(input_ids, scores, penalty):
    score = np.take_along_axis(scores, input_ids, axis=1)
    score = np.where(score < 0, score * penalty, score / penalty)
    out = scores.copy()
    np.put_along_axis(out, input_ids, score, axis=1)
    return out


def download(name, dtype):
    filename = f"{name}{'' if dtype == 'fp32' else '_quantized' if dtype == 'q8' else f'_{dtype}'}.onnx"
    # Real files in one folder: onnxruntime rejects external data reached through cache symlinks.
    local = os.path.join(os.path.dirname(__file__), "vendor", "models", "chatterbox-turbo")
    graph = hf_hub_download(MODEL_ID, subfolder="onnx", filename=filename, local_dir=local)
    data = hf_hub_download(MODEL_ID, subfolder="onnx", filename=f"{filename}_data", local_dir=local)
    return graph, os.path.getsize(graph) + os.path.getsize(data)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ref", required=True)
    ap.add_argument("--dtype", default="q8", choices=["fp32", "fp16", "q8", "q4", "q4f16"])
    ap.add_argument("--out", default=None)
    ap.add_argument("--max-new-tokens", type=int, default=1500)
    ap.add_argument("--provider", default="cpu", choices=["cpu", "coreml"])
    ap.add_argument("--only", default=None, help="comma-separated line keys")
    args = ap.parse_args()
    out = args.out or f"gen/turbo-{args.dtype}-{args.provider}"
    os.makedirs(out, exist_ok=True)

    t0 = time.perf_counter()
    paths, total_bytes = {}, 0
    for name in ["conditional_decoder", "speech_encoder", "embed_tokens", "language_model"]:
        paths[name], size = download(name, args.dtype)
        total_bytes += size
    opts = onnxruntime.SessionOptions()
    providers = ["CoreMLExecutionProvider", "CPUExecutionProvider"] if args.provider == "coreml" else ["CPUExecutionProvider"]
    s = {k: onnxruntime.InferenceSession(p, opts, providers=providers) for k, p in paths.items()}
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    load_s = time.perf_counter() - t0

    ref, _ = librosa.load(args.ref, sr=SAMPLE_RATE)
    ref = ref[np.newaxis, :].astype(np.float32)

    # The voice is encoded once and reused for every line (what the app would cache).
    t = time.perf_counter()
    cond_emb, prompt_token, speaker_embeddings, speaker_features = s["speech_encoder"].run(None, {"audio_values": ref})
    encode_s = time.perf_counter() - t

    results = []
    for key, text in LINES.items():
        if args.only and key not in args.only.split(","):
            continue
        t = time.perf_counter()
        input_ids = tokenizer(text, return_tensors="np")["input_ids"].astype(np.int64)
        generated = np.array([[START_SPEECH_TOKEN]], dtype=np.int64)
        first_token_s = None
        for i in range(args.max_new_tokens):
            embeds = s["embed_tokens"].run(None, {"input_ids": input_ids})[0]
            if i == 0:
                embeds = np.concatenate((cond_emb, embeds), axis=1)
                b, seq, _ = embeds.shape
                past = {
                    x.name: np.zeros([b, NUM_KV_HEADS, 0, HEAD_DIM], dtype=np.float16 if x.type == "tensor(float16)" else np.float32)
                    for x in s["language_model"].get_inputs() if "past_key_values" in x.name
                }
                mask = np.ones((b, seq), dtype=np.int64)
                pos = np.arange(seq, dtype=np.int64).reshape(1, -1)
            logits, *present = s["language_model"].run(None, dict(inputs_embeds=embeds, attention_mask=mask, position_ids=pos, **past))
            if first_token_s is None:
                first_token_s = time.perf_counter() - t
            logits = repetition_penalty(generated, logits[:, -1, :], 1.2)
            input_ids = np.argmax(logits, axis=-1, keepdims=True).astype(np.int64)
            generated = np.concatenate((generated, input_ids), axis=-1)
            if (input_ids.flatten() == STOP_SPEECH_TOKEN).all():
                break
            mask = np.concatenate([mask, np.ones((b, 1), dtype=np.int64)], axis=1)
            pos = pos[:, -1:] + 1
            for j, k in enumerate(past):
                past[k] = present[j]

        tokens = np.concatenate([prompt_token, generated[:, 1:-1], np.full((1, 3), SILENCE_TOKEN, dtype=np.int64)], axis=1)
        wav = s["conditional_decoder"].run(None, dict(speech_tokens=tokens, speaker_embeddings=speaker_embeddings, speaker_features=speaker_features))[0].squeeze(0)
        gen_s = time.perf_counter() - t
        audio_s = len(wav) / SAMPLE_RATE
        sf.write(f"{out}/{key}.wav", wav, SAMPLE_RATE)
        results.append({"line": key, "audio_s": round(audio_s, 2), "gen_s": round(gen_s, 2), "rtf": round(gen_s / audio_s, 2), "first_token_s": round(first_token_s, 2)})
        print(json.dumps(results[-1]), flush=True)

    summary = {"model": f"chatterbox-turbo-onnx/{args.dtype}/{args.provider}", "download_mb": round(total_bytes / 1e6), "load_s": round(load_s, 1), "voice_encode_s": round(encode_s, 2), "lines": results}
    with open(f"{out}/timing.json", "w") as f:
        json.dump(summary, f, indent=2)
    print(json.dumps({k: v for k, v in summary.items() if k != "lines"}))


if __name__ == "__main__":
    main()
