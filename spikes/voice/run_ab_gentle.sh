#!/usr/bin/env bash
# The rest of the comparison, one step at a time, with a cool-down before each
# step: at least 5 minutes, and until macOS isn't throttling the CPU for heat.
set -uo pipefail
cd "$(dirname "$0")"
export HF_HOME=$PWD/vendor/hf HF_HUB_OFFLINE=1 PEGUIN_ORT_THREADS=4
cooldown() {
  echo "--- cooling down $(date +%H:%M)"
  sleep 300
  while pmset -g therm | grep -qE "CPU_Speed_Limit\s*=\s*([0-9]|[1-9][0-9])$"; do sleep 60; done
  echo "--- cool $(date +%H:%M)"
}
step_eval() { echo "=== $1 $(date +%H:%M)"; vendor/venv/bin/python eval_ab.py --variant "$1" --seeds 8 2>&1 | grep -E "^seed 8|mean_error|Traceback|Error"; }
step_eval avgvoice
cooldown
step_eval natavg
cooldown
echo "=== head-only training $(date +%H:%M)"
( cd vendor/chatterbox-finetuning && \
  export FT_MODEL_DIR=./pretrained_en FT_VOCAB=50276 FT_TARGETS=spkr_enc FT_SAVE_MODULES=speech_head FT_LORA_R=1 FT_LORA_ALPHA=2 \
         FT_LR=1e-4 FT_EPOCHS=10 FT_PREPROCESS=0 FT_PRE=../../gen/dataset/preprocess-en-60 FT_OUT=../../gen/finetune-head-60 PYTORCH_ENABLE_MPS_FALLBACK=1 && \
  ../venv-ft/bin/python train.py > ../../gen/train-head.log 2>&1 )
cooldown
( cd vendor/chatterbox-finetuning && \
  export FT_MODEL_DIR=./pretrained_en FT_VOCAB=50276 FT_TARGETS=spkr_enc FT_SAVE_MODULES=speech_head FT_LORA_R=1 FT_LORA_ALPHA=2 FT_OUT=../../gen/finetune-head-60 && \
  ../venv-ft/bin/python ../../patch_onnx.py --base ../models/chatterbox-turbo --out ../../gen/onnx-head-60 > ../../gen/patch-head.log 2>&1 )
grep -E "changed by training|patched|unmatched" gen/patch-head.log
cooldown
step_eval head
echo "=== done $(date +%H:%M)"
