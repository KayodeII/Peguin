// Runs before Meet's scripts. Exposes a tiny bridge, then injects inject.js
// into the page's own world so it can replace getUserMedia and hook WebRTC.
const { contextBridge, ipcRenderer, webFrame } = require("electron");

contextBridge.exposeInMainWorld("__penguin", {
  config: () => ipcRenderer.sendSync("config"),
  log: (msg) => ipcRenderer.send("log", String(msg)),
  inCall: () => ipcRenderer.send("in-call"),
  ended: () => ipcRenderer.send("ended"),
  level: (rms, tracks, frame) => ipcRenderer.send("level", { rms, tracks, frame }),
  type: (text) => ipcRenderer.send("type", String(text)),
  playbackEnded: () => ipcRenderer.send("playback-ended"),
  onSpeak: (cb) => ipcRenderer.on("speak", (_e, buf) => cb(buf)),
});

webFrame.executeJavaScript(ipcRenderer.sendSync("inject-code"));
