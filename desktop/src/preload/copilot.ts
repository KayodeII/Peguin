// Preload for the meeting page in the private copilot (every frame). Exposes a
// tiny bridge, then runs resources/copilot-inject.js in the page's own world.
import { contextBridge, ipcRenderer, webFrame } from "electron";

contextBridge.exposeInMainWorld("__peguinCopilot", {
  log: (msg: unknown) => ipcRenderer.send("cop:log", String(msg)),
  pcm: (buf: ArrayBuffer) => ipcRenderer.send("cop:pcm", buf),
  /** The main process asks for the AI notice in the meeting chat; reply with "" when it's posted, or the reason it isn't. */
  onDisclose: (fn: (text: string) => Promise<string | null>) => {
    ipcRenderer.on("cop:disclose", (_e, text: string) => {
      void fn(String(text)).then((error) => { if (error !== null) ipcRenderer.send("cop:disclosed", error); });
    });
  },
});

void webFrame.executeJavaScript(ipcRenderer.sendSync("cop:inject"));
