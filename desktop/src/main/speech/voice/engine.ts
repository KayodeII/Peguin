// Chatterbox Turbo through onnxruntime-node: text in the owner's voice, on
// their Mac. The generation loop follows Resemble's ONNX example; the choices
// around it (sampling, one sentence at a time, checking each sentence by ear
// with whisper) come from spikes/voice.
import { Tokenizer } from "@huggingface/tokenizers";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as ort from "onnxruntime-node";
import { fade, joinSentences, level, SAMPLE_RATE, trimSilence } from "./audio.js";
import { voiceModelDir } from "./model.js";
import { rng, sampleToken } from "./sampling.js";
import { respell, sentences, wordError } from "./text.js";

const START = 6561, STOP = 6562, SILENCE = 4299;
const KV_HEADS = 16, HEAD_DIM = 64;
/** The model only listens to the first 10-15 s of the sample. */
const MAX_REFERENCE_S = 15;

type Sessions = Record<"speech_encoder" | "embed_tokens" | "language_model" | "conditional_decoder", ort.InferenceSession>;
/** The encoded voice: computed once from the sample, reused for every line. */
export type Voice = { cond: ort.Tensor; prompt: ort.Tensor; speakerEmbedding: ort.Tensor; speakerFeatures: ort.Tensor };

export type SpeakOptions = {
  /** Spellings the model says right, e.g. { Peguin: "Peh-gwin" }. */
  pronounce?: Record<string, string>;
  /** How speech recognition hears names ("mujib" -> "mujeeb"), so an accent isn't a mistake. */
  aliases?: Record<string, string>;
  /** Transcribes 24 kHz audio; when given, a sentence that comes back wrong is generated again. */
  check?: (wav: Float32Array) => Promise<string>;
  /** Attempts per sentence when checking. */
  takes?: number;
  seed?: number;
};

/** Accented but correct speech still scores 0.1-0.2 against off-the-shelf recognition. */
const ACCEPT_ERROR = 0.2;

const i64 = (values: number[], dims: number[]) => new ort.Tensor("int64", BigInt64Array.from(values.map(BigInt)), dims);

export class VoiceEngine {
  private constructor(private readonly s: Sessions, private readonly tokenizer: Tokenizer, private readonly kv: { name: string; type: "float32" | "float16" }[]) {}

  static async load(dir = voiceModelDir()): Promise<VoiceEngine> {
    const open = (name: string) => ort.InferenceSession.create(path.join(dir, "onnx", `${name}.onnx`), { executionProviders: ["cpu"] });
    const [speech_encoder, embed_tokens, language_model, conditional_decoder] = await Promise.all(
      ["speech_encoder", "embed_tokens", "language_model", "conditional_decoder"].map(open),
    );
    const read = (f: string) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as object;
    const tokenizer = new Tokenizer(read("tokenizer.json"), read("tokenizer_config.json"));
    const kv = language_model!.inputMetadata
      .filter((m) => m.name.includes("past_key_values"))
      .map((m) => ({ name: m.name, type: (m.isTensor && m.type === "float16" ? "float16" : "float32") as "float32" | "float16" }));
    return new VoiceEngine({ speech_encoder: speech_encoder!, embed_tokens: embed_tokens!, language_model: language_model!, conditional_decoder: conditional_decoder! }, tokenizer, kv);
  }

  /** Encodes the owner's sample (24 kHz mono). About half a second; do it once. */
  async encodeVoice(sample: Float32Array): Promise<Voice> {
    const ref = sample.subarray(0, SAMPLE_RATE * MAX_REFERENCE_S);
    const out = await this.s.speech_encoder.run({ audio_values: new ort.Tensor("float32", Float32Array.from(ref), [1, ref.length]) });
    const [cond, prompt, speakerEmbedding, speakerFeatures] = this.s.speech_encoder.outputNames.map((n) => out[n]!);
    return { cond: cond!, prompt: prompt!, speakerEmbedding: speakerEmbedding!, speakerFeatures: speakerFeatures! };
  }

  /** One sentence. Stops at ~3 speech tokens per character so sampling can't run away. */
  async sentence(text: string, voice: Voice, random: () => number): Promise<Float32Array> {
    const maxTokens = 3 * text.length + 40;
    let ids = this.tokenizer.encode(text).ids;
    const generated = [START];
    let past: Record<string, ort.Tensor> = Object.fromEntries(this.kv.map(({ name, type }) =>
      [name, new ort.Tensor(type, type === "float16" ? new Uint16Array(0) : new Float32Array(0), [1, KV_HEADS, 0, HEAD_DIM])]));
    let seq = 0;
    for (let i = 0; i < maxTokens; i++) {
      const embedOut = await this.s.embed_tokens.run({ input_ids: i64(ids, [1, ids.length]) });
      let embeds = embedOut[this.s.embed_tokens.outputNames[0]!]!;
      if (i === 0) embeds = concatSeq(voice.cond, embeds);
      const step = embeds.dims[1]!;
      const mask = i64(new Array(seq + step).fill(1), [1, seq + step]);
      const positions = i64(Array.from({ length: step }, (_, k) => seq + k), [1, step]);
      seq += step;
      const out = await this.s.language_model.run({ inputs_embeds: embeds, attention_mask: mask, position_ids: positions, ...past });
      const [logitsName, ...presentNames] = this.s.language_model.outputNames;
      const logits = out[logitsName!]!;
      const vocab = logits.dims[2]!;
      const last = (logits.data as Float32Array).subarray((step - 1) * vocab, step * vocab);
      const next = sampleToken(last, generated, random);
      generated.push(next);
      if (next === STOP) break;
      ids = [next];
      past = Object.fromEntries(this.kv.map(({ name }, j) => [name, out[presentNames[j]!]!]));
    }
    const speech = generated.slice(1, generated.at(-1) === STOP ? -1 : undefined);
    const prompt = Array.from(voice.prompt.data as BigInt64Array, Number);
    const tokens = [...prompt, ...speech, SILENCE, SILENCE, SILENCE];
    const dec = await this.s.conditional_decoder.run({
      speech_tokens: i64(tokens, [1, tokens.length]),
      speaker_embeddings: voice.speakerEmbedding,
      speaker_features: voice.speakerFeatures,
    });
    const wav = dec[this.s.conditional_decoder.outputNames[0]!]!.data as Float32Array;
    return fade(trimSilence(wav));
  }

  /**
   * A whole line in the owner's voice: one sentence at a time, each checked by
   * ear when `check` is given and regenerated if the words come back wrong,
   * joined with natural pauses and levelled.
   */
  async speak(text: string, voice: Voice, o: SpeakOptions = {}): Promise<Float32Array> {
    const random = rng(o.seed ?? Date.now());
    const meant = sentences(text);
    const said = sentences(respell(text, o.pronounce ?? {}));
    const parts: Float32Array[] = [];
    for (let i = 0; i < said.length; i++) {
      let best: Float32Array | null = null, bestError = Infinity;
      const takes = o.check ? Math.max(1, o.takes ?? 3) : 1;
      for (let t = 0; t < takes; t++) {
        const wav = await this.sentence(said[i]!, voice, random);
        if (!o.check) { best = wav; break; }
        const err = wordError(meant[i] ?? said[i]!, await o.check(wav).catch(() => ""), o.aliases);
        if (err < bestError) { best = wav; bestError = err; }
        if (err <= ACCEPT_ERROR) break;
      }
      parts.push(best!);
    }
    return level(joinSentences(parts));
  }
}

/** Concatenates two [1, seq, hidden] float tensors along seq. */
function concatSeq(a: ort.Tensor, b: ort.Tensor): ort.Tensor {
  const ad = a.data as Float32Array, bd = b.data as Float32Array;
  const out = new Float32Array(ad.length + bd.length);
  out.set(ad); out.set(bd, ad.length);
  return new ort.Tensor("float32", out, [1, a.dims[1]! + b.dims[1]!, a.dims[2]!]);
}
