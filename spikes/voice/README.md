# Voice spike: speaking in the owner's voice

Throwaway. Finds out whether Peguin can speak in the account holder's own voice,
on their Mac, with a licence we can ship, fast enough for meetings.

Rules from `docs/DECISIONS.md` apply to the real feature: opt-in, only your own
voice recorded live with a consent sentence (no uploads), disclosure stays and
says "speaking in <name>'s voice", deletable, falls back to the standard voice.

## Candidates

| Model | Licence | Why it's here |
|---|---|---|
| Chatterbox Turbo (Resemble AI), ONNX | MIT | Official ONNX export, so it can run in Electron through onnxruntime-node with no Python. Clones from ~5-10 s. Built-in Perth watermark. |
| OmniVoice (k2-fsa) | Apache 2.0 | Quality comparison; PyTorch only, so not shippable as is. |

## Run

```bash
python3 -m venv vendor/boot && vendor/boot/bin/pip install uv
UV_PYTHON_INSTALL_DIR=$PWD/vendor/python vendor/boot/bin/uv venv --python 3.11 vendor/venv
vendor/boot/bin/uv pip install --python vendor/venv/bin/python "onnxruntime>=1.20" huggingface_hub "transformers>=4.46" librosa soundfile numpy sounddevice

vendor/venv/bin/python record.py                       # your voice -> gen/me.wav
HF_HOME=$PWD/vendor/hf vendor/venv/bin/python turbo_onnx.py --ref gen/me.wav --dtype fp32
```

Outputs land in `gen/<model>/` (git-ignored) with `timing.json`. `lines.py` holds
the five test lines: the update, an answer, a deferral, an acknowledgement and
one with numbers.

## Findings (Apple M5, 16 GB, CPU only)

Speed is RTF: seconds of compute per second of audio (below 1 is faster than real time).

| Variant | Download | RTF (own voice) | 4 s answer | 25 s update |
|---|---|---|---|---|
| fp32 | 3.3 GB | 0.77-1.0 | 3.3 s | 15 s |
| q4 | 721 MB | 0.61-0.76 | 3.0 s | 15 s |
| q8 | 1.1 GB | 3.3 (stand-in voice) | 13 s | 70 s |
| fp16 | - | no fp16 language model in the repo | | |

- The voice is encoded once in about 0.4 s and can be cached; the first audio token
  arrives in about 0.25 s, so streaming could start speech well before a line is done.
- The update is generated before the meeting, so its 15 s doesn't matter. Answers take
  about 3 s today without streaming.

Intelligibility, checked by transcribing the clips with whisper base.en (which also
misheard the original recording in places):

- fp32 is clearly better than q4: "merged the payment webhook retries" and "step 1 of 3"
  come back exactly with fp32 and garbled with q4.
- Names are the weak spot in both: "Peguin" came back as "Bagwing"/"Pegg Nguyen", "Ada" as
  "Eda". Needs phonetic respelling in the text we send ("Peh-gwin"), tested by ear.
- Very short lines are unreliable ("Thanks, will do." became "Tungs. We'll do." / "We do.").
  Avoid lines under about five words, or fall back to the standard voice for them.
- Watermarking (Perth) wasn't applied in this spike; the reference package needs PyTorch.
  The shipped version has to apply it, or we document why not.

## v2: making it sound human (`turbo_v2.py`)

Owner's verdict on v1: it sounds like their accent, but pronunciation and pauses
need work. v2 changes, each from Resemble's reference code or the test results:

1. Sampling (temperature 0.6, top-p 0.95, top-k 1000, repetition penalty 1.2) instead of
   always taking the top token. 0.8 (Resemble's default) dropped more words.
2. One sentence at a time, silence trimmed, joined with 0.32 s pauses; loudness levelled;
   short fades at joins.
3. Resemble's `punc_norm`, and a pronunciation list for names. Respelling "Ada" as "Ah-dah"
   made it worse, so only "Peguin" -> "Peh-gwin" stays; names need testing by ear.
4. Each sentence is transcribed with whisper small.en and regenerated (up to 3 takes)
   if the words come back wrong. base.en was useless as a judge: it misheard the owner's
   real recording. Even small.en does ("Pergian", "new blockers"), so the bar is a word
   error of 0.2, not zero: accented but correct speech scores 0.1-0.2.
5. A length cap (3 speech tokens per character) stops runaway sentences that sampling
   occasionally causes.

v4 result (fp32, 3 takes): every test sentence came back right within three takes except
"merged the payment webhook retries", a stack of technical nouns. That's for the update
prompt to avoid: write for the ear, short sentences, no noun stacks, numbers as words.

Cost: the update takes ~30 s with retries (fine, it's made before the meeting); a live
answer ~4-6 s with one retry. In the app, answers should take one checked attempt and
stream, and the update can afford three.

The model copies pace and pauses from the reference clip. A sample spoken naturally, as
if giving a standup, with real pauses, should help more than any setting.

Still open: CoreML, chunked streaming, Perth watermarking without PyTorch, and the
OmniVoice comparison if similarity isn't good enough.

## v3: training a personal voice (fine-tuning), in progress (2026-10-08)

The owner wants speech that's as close to perfect as possible. Zero-shot cloning (the
shipped feature) copies the accent but not pronunciation and rhythm, so this tests
LoRA fine-tuning Chatterbox Turbo on the owner's own recordings, against two newer
zero-shot models. Nothing here is in the app yet.

### Data
- `record_dataset.py`: guided recorder, 60 sentences (30 Harvard sentences + 30
  standup-style lines with the owner's name, "Peguin", numbers and tech words), one at
  a time, saved as LJSpeech (`gen/dataset/wavs/NNNN.wav`, `gen/dataset/metadata.csv`).
  Resumable. **21 of 60 recorded so far**; about 8 minutes total is the target.

### Toolkit
`vendor/chatterbox-finetuning` (git-ignored) is [gokhaneraslan/chatterbox-finetuning](https://github.com/gokhaneraslan/chatterbox-finetuning)
in its own venv (`vendor/venv-ft`, torch 2.6, MPS). Patches made locally, needed to reproduce:
- `src/config.py`: Turbo + LoRA; dataset/output paths point at `../../gen/...`;
  batch 2 with grad accumulation 2; 0 dataloader workers; env overrides for
  `FT_MODEL_DIR`, `FT_VOCAB`, `FT_LORA_R`, `FT_LORA_ALPHA`, `FT_LR`, `FT_SAVE_MODULES`
  (comma list, empty = freeze text embeddings), `FT_EPOCHS`, `FT_PRE`, `FT_OUT`, `FT_PREPROCESS`.
- `train.py`: use `mps` when available; fp32 (no bf16); no pinned memory or persistent workers.
- `src/preprocess_ljspeech.py`: read metadata with `dtype=str` (ids like `0001` were
  parsed as numbers, so every file was silently skipped).
- `setuptools<80` in the venv: Resemble's Perth watermarker imports `pkg_resources`.
- `setup.py`'s downloader breaks on long files; the weights were fetched with
  `curl --retry -C -` instead (`t3_turbo_v1` 1,915,480,052 bytes, `s3gen_meanflow` 1,064,875,036).
- `pretrained_en/`: the same weights (symlinks) with the **original** Turbo tokenizer
  (50,276 tokens). The toolkit's `setup.py` rewrites the tokenizer in `pretrained_models/`
  to 52,260 tokens for teaching new languages, which English doesn't need.

### Results so far (21 sentences, ~2 minutes of audio, M5 16 GB)
- Training is fast: 10 epochs in 65-85 s on MPS.
- **Run 1, toolkit defaults** (extended vocab, LoRA r=128, lr 1e-4, text embeddings
  trained): **gibberish**, and clips 2-3x too long. Peak memory 19.9 GB (swapped).
  Cause: retraining text embeddings for 2,400 new tokens from 21 sentences.
- **Run 2, English settings** (`FT_MODEL_DIR=./pretrained_en FT_VOCAB=50276 FT_SAVE_MODULES=""
  FT_LORA_R=16 FT_LORA_ALPHA=32 FT_LR=5e-5 FT_EPOCHS=10`): trained, peak 10.7 GB. **Intelligible and natural length**, one take per
  sentence, no re-checking (`gen/ft-en-21/`, small.en): the answer, the numbers line and the
  whole ear-friendly update came back exactly; the jargon sentence came back as "met the
  payment webhook, retries" (zero-shot garbled it even with 3 takes). Still off:
  "Peguin" -> "Beguin"/"Peg Nguyen", "auth" -> "Aft", "Thanks, will do" -> "Thanks, we do".
  PyTorch generation on MPS is slow (113 s for a 22 s update); irrelevant if shipped via ONNX.
- **Run 3, all 60 sentences (3.8 min of audio)**, same settings, `FT_PRE=../../gen/dataset/preprocess-en-60
  FT_OUT=../../gen/finetune-en-60`: 150 steps in 157 s, loss 14.6 -> 10.7, peak 12.4 GB. Clips in
  `gen/ft-en-60/`. Word check, one take per sentence: about the same as run 2 with different slips
  ("Thanks, will do" now exact; "payment to a Kooks" for "payment webhooks", "after the code",
  "Peguin" -> "begging"/"Peking"). With single takes the differences look like sampling noise; the
  app's per-sentence whisper re-check would catch most of them, and "Peguin" needs a pronunciation
  entry. Similarity to the owner has to be judged by ear (gen/mujeeb vs ft-en-21 vs ft-en-60).
- Reproduce run 2: `cd vendor/chatterbox-finetuning`, then those env vars plus
  `FT_PRE=../../gen/dataset/preprocess-en FT_OUT=../../gen/finetune-en PYTORCH_ENABLE_MPS_FALLBACK=1 ../venv-ft/bin/python train.py`;
  generate with the same env and `../venv-ft/bin/python ../../ft_generate.py --out ../../gen/ft-en-21`;
  check words with `bash check.sh gen/ft-en-21` (whisper small.en; base.en is useless for this accent).

### Shipping path: patch the trained weights into the ONNX files (works)
The owner judged run 3 (60 sentences) "natural; flow and intonation need work, but good for a start".
- `patch_onnx.py` merges the LoRA into Turbo's weights, then finds each changed weight in
  Resemble's ONNX initializers **by content** (as is, transposed, or a q/k/v third of GPT-2's
  fused c_attn) and swaps in the trained values. The graphs are untouched, so the app's
  onnxruntime engine runs it as is. 96 of 97 changed weights matched (144 initializers).
  The one miss is `cond_enc.spkr_enc` (1024x256): Resemble's export has no such initializer
  (folded into the speech encoder's computation); leaving it at base values doesn't audibly hurt.
- Patched clips (`gen/onnx-ft-60-clips/`, via `turbo_v2.py --model-dir gen/onnx-ft-60`, one take):
  real-time (RTF 0.71-0.86, same as zero-shot) and clear. "merged the payment webhook retries"
  came back **exactly** for the first time. Still: "Peguin" ("Penguin", "Peckwan"), "will do"
  -> "we do", "merged" -> "masked" once.
- Intonation tests on the patched voice (`gen/tone-A..D`, ear-friendly update, one take):
  A = 2 sentences per generation, temperature 0.6: smoother, but **dropped two sentences**;
  B = 1 per generation, 0.75: added "um..." and garbled a phrase; C = 2 per generation, 0.75:
  mostly right, moved a sentence break; D = 3 per generation, 0.75, 0.22 s pause: more slips.
  Higher temperature costs accuracy; grouping can drop content (the app's whisper re-check
  would catch a dropped sentence as a large word error). Waiting on the owner's ears.
- Gotcha: `turbo_v2.py` hangs at start-up when Hugging Face is unreachable (tokenizer check, no
  timeout). Run with `HF_HUB_OFFLINE=1`.

### Fair comparison (`eval_ab.py`, `run_ab.sh`, `run_ab_gentle.sh`), 2026-10-08
5 lines x 8 seeds = 40 clips per variant, one take per sentence, no re-check, whisper small.en,
owner's name spellings ignored. Per-line errors: answer / defer / "Thanks, will do" / numbers / update.

| Variant | Word error | Word-perfect | Per line (%) |
|---|---|---|---|
| **natural**: zero-shot from ~15 s of the owner's standup-style recordings | **3.9% +/- 0.9** | **72%** | 0 / 4 / 0 / 12 / 4 |
| natavg: natural + fingerprint averaged over 60 recordings | 4.6% +/- 1.1 | 65% | 0 / 1 / 4 / 12 / 6 |
| base: zero-shot from the consent read-through (what ships today) | 7.5% +/- 1.5 | 38% | 6 / 6 / 8 / 11 / 7 |
| avgvoice: base + averaged fingerprint | 8.5% +/- 2.0 | 45% | 5 / 4 / 17 / 10 / 6 |
| ft: LoRA r=16 on 60 sentences, patched ONNX | 10.7% +/- 2.2 | 38% | 3 / 2 / 29 / 10 / 9 |
| head: output layer only, patched ONNX | 13.8% +/- 3.0 | 40% | 5 / 3 / 39 / 16 / 6 |

Conclusions:
- **The reference clip is the lever.** Natural standup talk roughly halves errors vs a read script,
  with no training. Product change: record the sample as natural talk (or pick the best natural
  stretch from what the owner records).
- Averaging the speaker fingerprint (single-clip fingerprints agree only at cosine 0.60-0.85;
  averaged and rescaled to the fixed norm 13.856) doesn't help.
- Both trained variants break very short lines ("Thanks, will do"); otherwise competitive, not better.
- Blind listening set for naturalness: `gen/blind/NN-A.wav` / `NN-B.wav` (7 pairs: natural vs ft,
  natural vs base, ft vs base, same update, shuffled); answers in `gen/blind-key.json`.

### Zero-shot comparison (same sample, same lines)
- `zeroshot.py --model omnivoice|qwen`: OmniVoice (k2-fsa, Apache 2.0) in `vendor/venv-zs`,
  Qwen3-TTS 1.7B Base (Apache 2.0) in `vendor/venv-qwen` (their `transformers` versions
  conflict, so separate venvs). Qwen officially targets CUDA; MPS/CPU untested.
- OmniVoice's model download stalled once (Hugging Face); resumed with `snapshot_download`.
  Not yet generated.

### Open questions
- Does run 2 sound better than zero-shot, by ear and by the word check? With all 60 sentences?
- **Shipping**, only if fine-tuning wins: the app runs ONNX. A per-user LoRA would need
  merging into Turbo's weights and re-exporting `language_model.onnx` per user (no export
  script yet), or bundling PyTorch. Training itself would also have to run inside the app
  (Python + torch, ~2 GB). Neither exists yet.
