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
  // The AI notice in the meeting chat (Meet, Teams, Zoom web). Opens the chat if
  // it's closed, types the notice, sends it, and reports success only once the
  // text shows up in the chat log. A frame with no meeting UI stays quiet (null).
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const visible = (el) => !!el && el.getClientRects().length > 0;
  const until = async (fn, ms) => {
    for (const end = Date.now() + ms; Date.now() < end; await sleep(250)) { const v = fn(); if (v) return v; }
    return null;
  };
  const button = (re) => [...document.querySelectorAll("button, [role=button]")]
    .find((b) => visible(b) && !b.disabled && (re.test(b.getAttribute("aria-label") || "") || re.test((b.textContent || "").trim())));
  const composer = () => [...document.querySelectorAll('textarea, [contenteditable="true"], [role=textbox]')]
    .find((el) => visible(el) && /message|chat|type/i.test(["aria-label", "placeholder", "aria-placeholder", "data-placeholder"].map((a) => el.getAttribute(a) || "").join(" ")));
  const inLog = (snippet, box) => {
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.nodeValue.includes(snippet) && !box.contains(n)) return true;
    return false;
  };
  bridge.onDisclose(async (text) => {
    try {
      let box = composer();
      if (!box) {
        const open = button(/^(chat with everyone|chat|open (the )?chat( panel)?|show conversation)\b/i);
        if (!open) return frame === "top" ? "Peguin couldn't find the meeting's chat button." : null;
        open.click();
        box = await until(composer, 5000);
        if (!box) return "The chat opened, but Peguin couldn't find where to type.";
      }
      box.focus();
      if (box instanceof HTMLTextAreaElement) {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(box, text);
        box.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        document.execCommand("selectAll");
        document.execCommand("insertText", false, text);
      }
      await sleep(300);
      const send = button(/^send( a)?( message)?$/i);
      if (send) send.click();
      else box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
      const posted = await until(() => inLog(text.slice(0, 40), box), 6000);
      log(posted ? "AI notice posted in chat" : "AI notice not seen in chat");
      return posted ? "" : "Peguin typed the notice, but it didn't appear in the chat.";
    } catch (e) {
      return `Chat error: ${e && e.message ? e.message : e}`;
    }
  });

  // Leaving: click the meeting's own hang-up (Meet, Teams, Zoom web) so the
  // others see the owner leave at once, and confirm where Zoom asks.
  const HANG_UP = '[aria-label="Leave call" i], #hangup-button, [data-tid="hangup-main-btn"], .footer__leave-btn, button[aria-label^="Leave" i]';
  bridge.onLeave(async () => {
    const hangUp = [...document.querySelectorAll(HANG_UP)].find(visible);
    if (!hangUp) return false;
    hangUp.click();
    log("left the call");
    const confirm = await until(() => { const b = button(/^leave( meeting)?$/i); return b && b !== hangUp ? b : null; }, 1000);
    if (confirm) confirm.click();
    return true;
  });

  // Autoplay rules can start the context suspended; resume on the first interaction too.
  const resume = () => { if (ctx.state !== "running") void ctx.resume(); };
  resume();
  addEventListener("pointerdown", resume, true);
  addEventListener("keydown", resume, true);
})();
