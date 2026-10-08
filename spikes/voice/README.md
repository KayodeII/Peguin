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
