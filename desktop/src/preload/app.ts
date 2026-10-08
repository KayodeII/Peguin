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
  getUpdate: () => ipcRenderer.invoke("update:get"),
  openUpdate: () => ipcRenderer.invoke("update:open"),
  voiceStatus: () => ipcRenderer.invoke("voice:status"),
  voiceDownload: () => ipcRenderer.invoke("voice:download"),
  voiceMic: () => ipcRenderer.invoke("voice:mic"),
  voiceSave: (pcm: ArrayBuffer) => ipcRenderer.invoke("voice:save", pcm),
  voiceDelete: () => ipcRenderer.invoke("voice:delete"),
  voiceDeleteModel: () => ipcRenderer.invoke("voice:delete-model"),
  voicePreview: () => ipcRenderer.invoke("voice:preview"),
  meetings: () => ipcRenderer.invoke("meetings:list"),
  calendarStatus: () => ipcRenderer.invoke("calendar:status"),
  calendarMacConnect: () => ipcRenderer.invoke("calendar:mac-connect"),
  calendarMacDisconnect: () => ipcRenderer.invoke("calendar:mac-disconnect"),
  calendarAddLink: (link: string) => ipcRenderer.invoke("calendar:add-link", link),
  calendarRemoveLink: (index: number) => ipcRenderer.invoke("calendar:remove-link", index),
  calendarSetCalendly: (token: string | null) => ipcRenderer.invoke("calendar:set-calendly", token),
  calendarUpcoming: (fresh?: boolean) => ipcRenderer.invoke("calendar:upcoming", fresh),
  setFollowUp: (id: string, index: number, done: boolean) => ipcRenderer.invoke("meetings:follow-up", id, index, done),
  deleteMeeting: (id: string) => ipcRenderer.invoke("meetings:delete", id),
  deleteAllMeetings: () => ipcRenderer.invoke("meetings:delete-all"),
  voiceSayWord: (word: string) => ipcRenderer.invoke("voice:say-word", word),
  onEvent: (cb: (e: unknown) => void) => {
    const h = (_e: unknown, ev: unknown) => cb(ev);
    ipcRenderer.on("app:event", h);
    return () => { ipcRenderer.removeListener("app:event", h); };
  },
};
contextBridge.exposeInMainWorld("penguin", api);
export type PeguinApi = typeof api;
