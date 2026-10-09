// Runs in the page's own world (every frame) when the owner is in their own
// meeting with the private copilot. One job: hear everyone else. The owner's
// mic and camera are left alone (they're in the call as themselves); only
// other people's audio is tapped, from WebRTC tracks (Meet, Teams) or, as a
// fallback, from whatever the page plays through Web Audio (Zoom's browser
// client), and streamed to the main process as 16 kHz mono PCM16.
(() => {
  const bridge = window.__peguinCopilot;
  if (!bridge || window.__peguinCopilotInjected) return;
  window.__peguinCopilotInjected = true;
  const frame = window === window.top ? "top" : `frame:${location.hostname}`;
  const log = (msg) => bridge.log(frame === "top" ? msg : `[${frame}] ${msg}`);
  const ctx = new AudioContext({ sampleRate: 48000 });
  const mix = ctx.createGain();

  const seen = new Set();
  const Orig = window.RTCPeerConnection;
  if (Orig) {
    function Hooked(...a) {
      const pc = new Orig(...a);
      pc.addEventListener("track", (e) => {
        if (e.track.kind !== "audio" || seen.has(e.track.id)) return;
        seen.add(e.track.id);
        ctx.createMediaStreamSource(new MediaStream([e.track])).connect(mix);
        log(`listening to remote audio track #${seen.size}`);
      });
      return pc;
    }
    Hooked.prototype = Orig.prototype;
    Object.setPrototypeOf(Hooked, Orig);
    window.RTCPeerConnection = Hooked;
  }

  const tapped = new WeakMap();
  const origConnect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    const out = origConnect.call(this, dest, ...rest);
    try {
      if (dest instanceof AudioDestinationNode && this.context !== ctx && !tapped.has(this.context)) {
        const tap = this.context.createMediaStreamDestination();
        tapped.set(this.context, tap);
        ctx.createMediaStreamSource(tap.stream).connect(mix);
        log("listening to page audio output (Web Audio)");
      }
      const tap = tapped.get(this.context);
      if (tap && dest instanceof AudioDestinationNode) origConnect.call(this, tap);
    } catch { /* never break the page */ }
    return out;
  };

  // ScriptProcessor rather than an AudioWorklet: meeting pages' CSP can block worklet blob URLs.
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const sink = ctx.createGain();
  sink.gain.value = 0;
  mix.connect(proc); proc.connect(sink); sink.connect(ctx.destination);
  proc.onaudioprocess = (e) => {
    const ch = e.inputBuffer.getChannelData(0); // 48 kHz: average every 3 samples
    const out = new Int16Array(Math.floor(ch.length / 3));
    for (let i = 0; i < out.length; i++) {
      const v = (ch[3 * i] + ch[3 * i + 1] + ch[3 * i + 2]) / 3;
      out[i] = Math.max(-1, Math.min(1, v)) * 0x7fff;
    }
    bridge.pcm(out.buffer);
  };
  // Autoplay rules can start the context suspended; resume on the first interaction too.
  const resume = () => { if (ctx.state !== "running") void ctx.resume(); };
  resume();
  addEventListener("pointerdown", resume, true);
  addEventListener("keydown", resume, true);
})();
