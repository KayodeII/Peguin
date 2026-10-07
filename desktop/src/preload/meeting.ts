// Preload for the meeting window (every frame). Exposes a tiny bridge, then
// runs resources/meeting-inject.js in the page's own world so it can replace
// getUserMedia and tap WebRTC audio.
import { contextBridge, ipcRenderer, webFrame } from "electron";

contextBridge.exposeInMainWorld("__penguin", {
  config: () => ipcRenderer.sendSync("mtg:config"),
  log: (msg: unknown) => ipcRenderer.send("mtg:log", String(msg)),
  inCall: () => ipcRenderer.send("mtg:in-call"),
  ended: () => ipcRenderer.send("mtg:ended"),
  level: (rms: number, taps: number, frame: string) => ipcRenderer.send("mtg:level", { rms, taps, frame }),
  pcm: (buf: ArrayBuffer) => ipcRenderer.send("mtg:pcm", buf),
  type: (text: string) => ipcRenderer.send("mtg:type", String(text)),
  playbackEnded: () => ipcRenderer.send("mtg:playback-ended"),
  onSpeak: (cb: (buf: Uint8Array) => void) => ipcRenderer.on("mtg:speak", (_e, buf: Uint8Array) => cb(buf)),
});

void webFrame.executeJavaScript(ipcRenderer.sendSync("mtg:inject"));
