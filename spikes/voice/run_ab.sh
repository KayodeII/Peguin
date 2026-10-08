#!/usr/bin/env bash
# Runs the whole comparison in sequence (they'd fight over memory in parallel).
set -uo pipefail
cd "$(dirname "$0")"
export HF_HOME=$PWD/vendor/hf HF_HUB_OFFLINE=1
mkdir -p gen/ab
for v in base ft natural avgvoice natavg; do
  echo "=== $v $(date +%H:%M)"
  vendor/venv/bin/python eval_ab.py --variant "$v" --seeds 8 2>&1 | grep -E "^seed|mean_error|Traceback|Error"
done
echo "=== head-only training $(date +%H:%M)"
( cd vendor/chatterbox-finetuning && \
  export FT_MODEL_DIR=./pretrained_en FT_VOCAB=50276 FT_TARGETS=spkr_enc FT_SAVE_MODULES=speech_head FT_LORA_R=1 FT_LORA_ALPHA=2 \
         FT_LR=1e-4 FT_EPOCHS=10 FT_PREPROCESS=0 FT_PRE=../../gen/dataset/preprocess-en-60 FT_OUT=../../gen/finetune-head-60 PYTORCH_ENABLE_MPS_FALLBACK=1 && \
  ../venv-ft/bin/python train.py > ../../gen/train-head.log 2>&1 && \
  ../venv-ft/bin/python ../../patch_onnx.py --base ../models/chatterbox-turbo --out ../../gen/onnx-head-60 > ../../gen/patch-head.log 2>&1 )
grep -E "changed by training|patched|unmatched" gen/patch-head.log
echo "=== head $(date +%H:%M)"
vendor/venv/bin/python eval_ab.py --variant head --seeds 8 2>&1 | grep -E "^seed|mean_error|Traceback|Error"
echo "=== done $(date +%H:%M)"
