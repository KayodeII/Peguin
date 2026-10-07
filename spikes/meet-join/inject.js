// Runs in the meeting page's own world (every frame). Three jobs:
//  1. Penguin's voice and avatar replace the mic and camera (getUserMedia).
//     Same for every platform.
//  2. Everyone else's audio is tapped: from WebRTC tracks (Meet, Teams) or,
//     as a fallback, from whatever the page plays through Web Audio (Zoom's
//     browser client may decode audio itself). Same for every platform.
//  3. A per-platform driver fills in the name, joins and keeps our mic on.
(() => {
  const bridge = window.__penguin;
  if (!bridge || window.__penguinInjected) return;
  window.__penguinInjected = true;
  const { name, platform, debug } = bridge.config();
  const frame = window === window.top ? "top" : `frame:${location.hostname}`;
  const log = (msg) => bridge.log(frame === "top" ? msg : `[${frame}] ${msg}`);
  const ctx = new AudioContext({ sampleRate: 48000 });

  // 1. Fake mic + camera ------------------------------------------------------
  const voice = ctx.createMediaStreamDestination();
  const canvas = document.createElement("canvas");
  canvas.width = 640; canvas.height = 360;
  const g = canvas.getContext("2d");
  let speaking = false;
  const draw = () => {
    g.fillStyle = "#0f1720"; g.fillRect(0, 0, 640, 360);
    g.fillStyle = speaking ? "#f2a93b" : "#5ad1a0";
    g.beginPath(); g.arc(320, 140, 70, 0, Math.PI * 2); g.fill();
    g.textAlign = "center"; g.fillStyle = "#eef3f7"; g.font = "bold 32px sans-serif"; g.fillText(name, 320, 270);
    g.fillStyle = "#8fa3b5"; g.font = "20px sans-serif"; g.fillText("AI assistant", 320, 305);
  };
  draw(); setInterval(draw, 200);
  const camera = canvas.captureStream(5);

  const md = navigator.mediaDevices;
  if (md) {
    md.getUserMedia = async (c = {}) => {
      const s = new MediaStream();
      if (c.audio) voice.stream.getAudioTracks().forEach((t) => s.addTrack(t.clone()));
      if (c.video) camera.getVideoTracks().forEach((t) => s.addTrack(t.clone()));
      log(`page asked for ${[c.audio && "mic", c.video && "camera"].filter(Boolean).join(" + ")}; gave Penguin's`);
      return s;
    };
    const device = (deviceId, kind, label) => ({ deviceId, kind, label, groupId: "penguin", toJSON() { return this; } });
    md.enumerateDevices = async () => [
      device("penguin-mic", "audioinput", "Penguin voice"),
      device("penguin-cam", "videoinput", "Penguin camera"),
      device("penguin-out", "audiooutput", "Penguin speaker"),
    ];
  }

  // 2. Hear the call ----------------------------------------------------------
  const mix = ctx.createGain();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048; mix.connect(analyser);
  const seen = new Set();
  const pcs = [];
  const Orig = window.RTCPeerConnection;
  if (Orig) {
    function Hooked(...a) {
      const pc = new Orig(...a);
      pcs.push(pc);
      pc.addEventListener("track", (e) => {
        if (e.track.kind !== "audio" || seen.has(e.track.id)) return;
        seen.add(e.track.id);
        ctx.createMediaStreamSource(new MediaStream([e.track])).connect(mix);
        log(`tapped remote audio track #${seen.size} (WebRTC)`);
      });
      return pc;
    }
    Hooked.prototype = Orig.prototype;
    Object.setPrototypeOf(Hooked, Orig); // keep statics like generateCertificate
    window.RTCPeerConnection = Hooked;
  }

  // Fallback: anything the page sends to its speakers through Web Audio.
  let webAudioTaps = 0;
  const tapped = new WeakMap();
  const origConnect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    const out = origConnect.call(this, dest, ...rest);
    try {
      if (dest instanceof AudioDestinationNode && this.context !== ctx) {
        let tap = tapped.get(this.context);
        if (!tap) {
          tap = this.context.createMediaStreamDestination();
          tapped.set(this.context, tap);
          ctx.createMediaStreamSource(tap.stream).connect(mix);
          webAudioTaps++;
          log(`tapped page audio output #${webAudioTaps} (Web Audio)`);
        }
        origConnect.call(this, tap);
      }
    } catch { /* never break the page */ }
    return out;
  };

  // Stream the mix to the main process as 16 kHz mono PCM16 for speech-to-text.
  // ScriptProcessor rather than an AudioWorklet: worklets load from a blob URL,
  // which meeting pages' CSP can block.
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const sink = ctx.createGain();
  sink.gain.value = 0;
  mix.connect(proc); proc.connect(sink); sink.connect(ctx.destination); // must reach a destination to run
  proc.onaudioprocess = (e) => {
    if (state !== "in_call") return;
    const ch = e.inputBuffer.getChannelData(0); // 48 kHz: average every 3 samples
    const out = new Int16Array(Math.floor(ch.length / 3));
    for (let i = 0; i < out.length; i++) {
      const v = (ch[3 * i] + ch[3 * i + 1] + ch[3 * i + 2]) / 3;
      out[i] = Math.max(-1, Math.min(1, v)) * 0x7fff;
    }
    bridge.pcm(out.buffer);
  };

  const samples = new Float32Array(analyser.fftSize);
  setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const v of samples) sum += v * v;
    bridge.level(Math.sqrt(sum / samples.length), seen.size + webAudioTaps, frame);
  }, 1000);

  // DOM helpers ---------------------------------------------------------------
  const text = () => document.body?.innerText ?? "";
  const label = (el) => `${el.getAttribute("aria-label") ?? ""} ${el.textContent ?? ""}`.trim();
  const find = (re, sel = "button, [role=button], [role=switch], a") =>
    [...document.querySelectorAll(sel)].find((el) => re.test((el.textContent || "").trim()) || re.test(el.getAttribute("aria-label") || ""));
  const clickIf = (re, sel) => {
    const el = find(re, sel);
    if (el && !el.disabled) { el.click(); log(`clicked "${label(el).slice(0, 60)}"`); return true; }
    return false;
  };
  // Type like a keyboard (Electron insertText): React forms such as Teams'
  // ignore values set from script, leaving "Join now" disabled.
  // Find the name box by selector, else by its visible label ("Your Name"):
  // Zoom's field has no placeholder or helpful id.
  const nameInput = (selector) => {
    const direct = document.querySelector(selector);
    if (direct) return direct;
    const inputs = [...document.querySelectorAll("input:not([type]), input[type=text]")].filter((i) => i.offsetParent);
    return inputs.find((i) => {
      const lbl = (i.id && document.querySelector(`label[for="${CSS.escape(i.id)}"]`)) || i.closest("label");
      const near = i.parentElement?.parentElement?.textContent ?? "";
      return /name/i.test(lbl?.textContent ?? "") || /your name/i.test(near);
    });
  };
  let typedAt = 0;
  const fill = (selector, value) => {
    const el = nameInput(selector);
    if (!el) return false;
    if (el.value) return true;
    if (Date.now() - typedAt < 3000) return false; // give the last attempt time to land
    typedAt = Date.now();
    el.focus(); el.select?.();
    bridge.type(value);
    log("typed our name");
    return false; // join on the next tick, once the page has the value
  };

  // 3. Platform drivers ---------------------------------------------------------
  // state(): "in_call" | "waiting" | "blocked" | null (still joining)
  const drivers = {
    google_meet: {
      state: () => document.querySelector('[aria-label*="Leave call" i]') ? "in_call"
        : /asking to be let in|someone will let you in/i.test(text()) ? "waiting"
        : /you can't join this video call|denied your request/i.test(text()) ? "blocked" : null,
      join() {
        const hasName = fill('input[aria-label*="name" i], input[placeholder*="name" i]', name);
        return (hasName || !document.querySelector("input[type=text]")) && clickIf(/^(ask to join|join now|join anyway)$/i);
      },
      micOn: () => clickIf(/^turn on microphone/i, "[aria-label]"),
    },

    teams: {
      state: () => document.querySelector('#hangup-button, [data-tid="hangup-main-btn"], button[aria-label^="Leave" i]') ? "in_call"
        : /someone in the meeting should let you in|we've let people in the meeting know you're waiting|waiting for people to join|let you in soon/i.test(text()) ? "waiting"
        : /denied|you can't join|sorry, you've been removed|can't find this meeting/i.test(text()) ? "blocked" : null,
      join() {
        // Launcher page offers the desktop app first.
        if (clickIf(/^(continue on this browser|join on the web instead|use the web app instead)$/i)) return false;
        const hasName = fill('input[data-tid="prejoin-display-name-input"], input[placeholder*="name" i]', name);
        return hasName && clickIf(/^join now$/i);
      },
      micOn() {
        // Pre-join: a switch that's unchecked when the mic is off. In call: "Unmute".
        const sw = [...document.querySelectorAll('[role=switch], input[type=checkbox]')]
          .find((el) => /mic/i.test(label(el)) && (el.getAttribute("aria-checked") === "false" || el.checked === false));
        if (sw) { sw.click(); log("Teams had our mic off (pre-join); turned it on"); return true; }
        return clickIf(/^unmute/i, "button, [role=button]");
      },
    },

    zoom: {
      state: () => document.querySelector('.footer__leave-btn, button[aria-label^="Leave" i]') ? "in_call"
        : /host will let you in soon|waiting for the host|waiting room/i.test(text()) ? "waiting"
        : /meeting has been locked|invalid meeting id|link is invalid|removed you/i.test(text()) ? "blocked" : null,
      join() {
        if (clickIf(/^(i agree|agree|accept cookies|accept all cookies|got it)$/i)) return false;
        const hasName = fill('#input-for-name, input[placeholder*="name" i]', name);
        return hasName && clickIf(/^join$/i, "button");
      },
      micOn() {
        clickIf(/^got it$/i, "button"); // feature pop-ups cover the toolbar
        // Zoom's browser client may need "Join Audio" before the mic exists.
        if (clickIf(/^join audio( by computer)?$/i, "button")) return true;
        clickIf(/^start video$/i, "button"); // show Penguin's avatar card
        return clickIf(/^unmute/i, "button, [role=button]");
      },
    },
  };
  const driver = drivers[platform];
  if (!driver) { log(`no driver for platform "${platform}"`); return; }

  // Join pacing: platforms flag bot-like retry loops (a Microsoft account was
  // locked during Teams testing). One click per 15 s, at most 3 per meeting.
  const JOIN_GAP_MS = 15000, MAX_JOIN_CLICKS = 3;
  let joinClicks = 0, lastJoinClick = 0;
  let state = "joining";
  let lastMicTry = 0;
  setInterval(() => {
    const now = Date.now();
    const s = driver.state();
    if (s === "in_call") {
      if (state !== "in_call") { state = "in_call"; log("in the call"); bridge.inCall(); }
      if (now - lastMicTry > 3000) { lastMicTry = now; driver.micOn(); }
      return;
    }
    if (state === "in_call") { state = "ended"; bridge.ended(); return; }
    if (s === "blocked") {
      if (state !== "blocked") {
        state = "blocked";
        const why = text().split("\n").map((l) => l.trim()).find((l) => /locked|invalid|denied|can't join|can't find|removed|not exist|expired/i.test(l));
        log(`the meeting refused us: "${why ?? "unknown reason"}"`);
      }
      return;
    }
    if (s === "waiting") { if (state !== "waiting") { state = "waiting"; log("in the waiting room; someone needs to admit us"); } return; }
    if (now - lastMicTry > 3000) {
      lastMicTry = now; driver.micOn();
      if (debug) {
        const seenButtons = [...document.querySelectorAll("button, [role=button], [role=switch]")]
          .filter((b) => b.offsetParent).map((b) => `${label(b).slice(0, 40)}${b.disabled ? " (disabled)" : ""}`).filter(Boolean);
        log(`debug: buttons: ${seenButtons.join(" | ").slice(0, 600)}`);
      }
    }
    if (now - lastJoinClick < JOIN_GAP_MS) return;
    if (joinClicks >= MAX_JOIN_CLICKS) {
      if (state !== "gave_up") { state = "gave_up"; log(`gave up after ${MAX_JOIN_CLICKS} join attempts`); }
      return;
    }
    if (driver.join()) { joinClicks++; lastJoinClick = now; }
  }, 1000);

  // Speak ---------------------------------------------------------------------
  const voiceMeter = ctx.createAnalyser();
  voiceMeter.fftSize = 2048;
  const senders = () => pcs.flatMap((pc) => pc.getSenders())
    .filter((s) => s.track?.kind === "audio")
    .map((s) => `${s.track.enabled ? "enabled" : "DISABLED"}/${s.track.readyState}`);

  bridge.onSpeak(async (bytes) => {
    if (state !== "in_call") return; // only the frame that's in the meeting speaks
    try {
      driver.micOn();
      if (ctx.state === "suspended") await ctx.resume();
      log(`audio context: ${ctx.state}; outgoing WebRTC audio senders: ${senders().join(", ") || "none (may be non-WebRTC)"}`);
      const buf = await ctx.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      const src = ctx.createBufferSource();
      src.buffer = buf; src.connect(voice); src.connect(voiceMeter);
      speaking = true;
      let peak = 0;
      const meter = new Float32Array(voiceMeter.fftSize);
      const sample = setInterval(() => {
        voiceMeter.getFloatTimeDomainData(meter);
        for (const v of meter) peak = Math.max(peak, Math.abs(v));
      }, 100);
      src.onended = () => {
        clearInterval(sample); speaking = false;
        log(`our voice peak level was ${peak.toFixed(3)} (0 means silence went out)`);
        bridge.playbackEnded();
      };
      src.start();
    } catch (e) { log(`playback failed: ${e}`); bridge.playbackEnded(); }
  });
})();
