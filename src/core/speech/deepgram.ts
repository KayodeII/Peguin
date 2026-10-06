import WebSocket from "ws";
import { config, requireKey } from "../config.js";

export type TranscriptEvent = { text: string; isFinal: boolean; speechFinal: boolean; speaker: number | null };

/** Streaming speech-to-text over one WebSocket per meeting.
 *  Input: 16 kHz mono 16-bit PCM. Diarization gives speaker numbers. */
export function openListener(opts: {
  keywords: string[];
  onTranscript: (e: TranscriptEvent) => void;
  onUtteranceEnd: () => void;
  onError: (err: Error) => void;
}) {
  const params = new URLSearchParams({
    model: config.DEEPGRAM_STT_MODEL,
    encoding: "linear16",
    sample_rate: "16000",
    channels: "1",
    interim_results: "true",
    smart_format: "true",
    diarize: "true",
    endpointing: "400",
    utterance_end_ms: "1200",
    vad_events: "true",
  });
  // Boost the user's name so it's recognised reliably.
  for (const k of opts.keywords) params.append("keyterm", k);

  const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, {
    headers: { Authorization: `Token ${requireKey("DEEPGRAM_API_KEY")}` },
  });
  const pending: Buffer[] = [];
  let open = false;

  ws.on("open", () => { open = true; for (const b of pending.splice(0)) ws.send(b); });
  ws.on("error", (e) => opts.onError(e as Error));
  ws.on("message", (raw) => {
    let m: any;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    if (m.type === "UtteranceEnd") return opts.onUtteranceEnd();
    if (m.type !== "Results") return;
    const alt = m.channel?.alternatives?.[0];
    const text: string = alt?.transcript ?? "";
    if (!text) return;
    const speaker = alt.words?.[0]?.speaker;
    opts.onTranscript({ text, isFinal: !!m.is_final, speechFinal: !!m.speech_final, speaker: typeof speaker === "number" ? speaker : null });
  });

  const keepAlive = setInterval(() => { if (open) ws.send(JSON.stringify({ type: "KeepAlive" })); }, 8000);

  return {
    send(pcm: Buffer) {
      if (open) ws.send(pcm);
      else if (pending.length < 200) pending.push(pcm);
    },
    close() {
      clearInterval(keepAlive);
      if (open) ws.send(JSON.stringify({ type: "CloseStream" }));
      setTimeout(() => ws.terminate(), 1000);
    },
  };
}

/** Text-to-speech. Returns MP3 bytes the agent page plays into the call. */
export async function speak(text: string): Promise<Buffer> {
  const res = await fetch(`https://api.deepgram.com/v1/speak?model=${encodeURIComponent(config.DEEPGRAM_TTS_MODEL)}&encoding=mp3`, {
    method: "POST",
    headers: { Authorization: `Token ${requireKey("DEEPGRAM_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Deepgram TTS failed: ${res.status} ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}
