// Preload for the meeting page in the private copilot (every frame). Exposes a
// tiny bridge, then runs resources/copilot-inject.js in the page's own world.
import { contextBridge, ipcRenderer, webFrame } from "electron";

contextBridge.exposeInMainWorld("__peguinCopilot", {
  log: (msg: unknown) => ipcRenderer.send("cop:log", String(msg)),
  pcm: (buf: ArrayBuffer) => ipcRenderer.send("cop:pcm", buf),
});

void webFrame.executeJavaScript(ipcRenderer.sendSync("cop:inject"));
