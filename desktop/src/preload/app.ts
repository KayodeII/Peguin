// Preload for the main window: the only API the React UI can call.
import { contextBridge, ipcRenderer } from "electron";

const api = {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (s: unknown) => ipcRenderer.invoke("settings:save", s),
  getDraft: () => ipcRenderer.invoke("draft:get"),
  prepareDraft: () => ipcRenderer.invoke("draft:prepare"),
  nextStandup: () => ipcRenderer.invoke("standup:next"),
  join: (url: string) => ipcRenderer.invoke("meeting:join", url),
  leave: () => ipcRenderer.invoke("meeting:leave"),
  getAccount: () => ipcRenderer.invoke("account:get"),
  signIn: () => ipcRenderer.invoke("account:signin"),
  signOut: () => ipcRenderer.invoke("account:signout"),
  onEvent: (cb: (e: unknown) => void) => {
    const h = (_e: unknown, ev: unknown) => cb(ev);
    ipcRenderer.on("app:event", h);
    return () => { ipcRenderer.removeListener("app:event", h); };
  },
};
contextBridge.exposeInMainWorld("penguin", api);
export type PeguinApi = typeof api;
