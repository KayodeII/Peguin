"""Bakes a fine-tuned (LoRA) Chatterbox Turbo into Resemble's ONNX files, so the
app's existing onnxruntime engine can speak in the trained voice without PyTorch.

LoRA changes weight values, not the graph. For every weight the training changed,
this finds the ONNX initializer holding the ORIGINAL values (by content: as is,
transposed, or as one of the q/k/v thirds of GPT-2's fused c_attn) and replaces it
with the trained values. Nothing is matched by name, so anonymous initializers
(the speech encoder's) are found too. Unmatched weights are reported, not ignored.

Run from vendor/chatterbox-finetuning with the same FT_* env as training:
  ../venv-ft/bin/python ../../patch_onnx.py --base ../models/chatterbox-turbo --out ../../gen/onnx-ft-60
"""
import argparse
import hashlib
import os
import shutil
import sys

import numpy as np
import onnx
from onnx import numpy_helper

sys.path.insert(0, os.getcwd())
import inference as kit  # noqa: E402

GRAPHS = ["language_model", "speech_encoder", "embed_tokens", "conditional_decoder"]


def digest(a: np.ndarray) -> str:
    return hashlib.sha1(np.ascontiguousarray(a, dtype=np.float32).tobytes()).hexdigest()


def candidates(w0: np.ndarray, w1: np.ndarray):
    """(original, trained) pairs in every layout the exporter may have used."""
    yield w0, w1
    if w0.ndim == 2:
        yield w0.T, w1.T
        if w0.shape[1] % 3 == 0:  # GPT-2 Conv1D c_attn: [in, 3*out] -> q, k, v
            for a, b in zip(np.split(w0, 3, axis=1), np.split(w1, 3, axis=1)):
                yield a, b
                yield a.T, b.T


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True, help="folder with onnx/*.onnx(+_data) and tokenizer files")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    # Original and merged (LoRA baked in) T3 weights.
    engine = kit.load_finetuned_engine_lora("cpu")
    merged = engine.t3.merge_and_unload()
    after = {k: v.detach().float().cpu().numpy() for k, v in merged.state_dict().items()}
    from src.chatterbox_.tts_turbo import ChatterboxTurboTTS
    base_engine = ChatterboxTurboTTS.from_local(kit.BASE_MODEL_DIR, device="cpu")
    before = {k: v.detach().float().cpu().numpy() for k, v in base_engine.t3.state_dict().items()}
    changed = [k for k in after if k in before and after[k].shape == before[k].shape and not np.array_equal(after[k], before[k])]
    print(f"{len(changed)} weights changed by training", flush=True)

    # Index every ONNX initializer by content.
    models, index = {}, {}
    for g in GRAPHS:
        m = onnx.load(os.path.join(args.base, "onnx", f"{g}.onnx"), load_external_data=True)
        models[g] = m
        for i, t in enumerate(m.graph.initializer):
            if t.data_type == onnx.TensorProto.FLOAT:
                index.setdefault(digest(numpy_helper.to_array(t)), []).append((g, i))

    patched, missing = 0, []
    for k in changed:
        hits = 0
        for orig, new in candidates(before[k], after[k]):
            for g, i in index.get(digest(orig), []):
                t = models[g].graph.initializer[i]
                t.CopyFrom(numpy_helper.from_array(np.ascontiguousarray(new, dtype=np.float32), t.name))
                hits += 1
        patched += hits
        if not hits:
            missing.append(k)
    print(f"patched {patched} initializers; unmatched: {len(missing)}", flush=True)
    for k in missing[:20]:
        print("  unmatched:", k, before[k].shape)

    os.makedirs(os.path.join(args.out, "onnx"), exist_ok=True)
    for g, m in models.items():
        onnx.save_model(m, os.path.join(args.out, "onnx", f"{g}.onnx"), save_as_external_data=True,
                        all_tensors_to_one_file=True, location=f"{g}.onnx_data", size_threshold=1024)
    for f in os.listdir(args.base):
        if f.startswith("tokenizer"):
            shutil.copy(os.path.join(args.base, f), args.out)
    print("written", args.out)


if __name__ == "__main__":
    main()
