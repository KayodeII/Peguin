// Preload for the preferences window: the only API the React UI can call.
import { contextBridge, ipcRenderer } from "electron";

const api = {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (s: unknown) => ipcRenderer.invoke("settings:save", s),
  join: (url: string) => ipcRenderer.invoke("meeting:join", url),
  leave: () => ipcRenderer.invoke("meeting:leave"),
  onMeetingEvent: (cb: (e: unknown) => void) => {
    const h = (_e: unknown, ev: unknown) => cb(ev);
    ipcRenderer.on("meeting:event", h);
    return () => { ipcRenderer.removeListener("meeting:event", h); };
  },
};
contextBridge.exposeInMainWorld("penguin", api);
export type PenguinApi = typeof api;
