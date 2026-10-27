// Preload for voice control's see-through overlay windows: events in, the
// owner's mic out (primary display only), and the end of freehand drawing.
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("peguinPointer", {
  onEvent: (fn: (e: unknown) => void) => { ipcRenderer.on("pointer:event", (_e, ev) => fn(ev)); },
  /** Overlay React is listening; main re-sends origin/mic so a late bind still starts dictation. */
  ready: () => ipcRenderer.send("pointer:ready"),
  pcm: (buf: ArrayBuffer) => ipcRenderer.send("pointer:pcm", buf),
  micError: (why: string) => ipcRenderer.send("pointer:mic-error", String(why)),
  penDone: () => ipcRenderer.send("pointer:pen-done"),
});
