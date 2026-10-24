// What the owner chose, in chrome.storage.local. API keys are sealed with an
// AES-GCM key that never leaves this browser profile: it's created
// non-extractable and kept in IndexedDB, so the stored keys are ciphertext.
import type { Provider } from "./ai.js";
import type { Priority } from "./merge.js";
import type { CopilotMode } from "../../src/core/brain/prompts.js";

export type WhisperModel = "base" | "turbo";

export type Settings = {
  name: string;
  provider: Provider;
  models: Partial<Record<Provider, string>>;
  mode: CopilotMode;
  /** One fact per line: what the copilot may say about the owner's own work. */
  notes: string;
  web: boolean;
  hearing: { captions: boolean; audio: boolean; priority: Priority; whisper: WhisperModel };
};

export const DEFAULTS: Settings = {
  name: "", provider: "anthropic", models: {}, mode: "work", notes: "", web: false,
  hearing: { captions: true, audio: true, priority: "auto", whisper: "base" },
};

export async function loadSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get("settings");
  const s = (settings ?? {}) as Partial<Settings>;
  return { ...DEFAULTS, ...s, hearing: { ...DEFAULTS.hearing, ...s.hearing }, models: { ...s.models } };
}

export const saveSettings = (s: Settings) => chrome.storage.local.set({ settings: s });

/** The facts the copilot answers from (pure). */
export const factsOf = (notes: string) => notes.split("\n").map((l) => l.replace(/^[-*•]\s*/, "").trim()).filter(Boolean);

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("peguin", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("keys");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function sealingKey(): Promise<CryptoKey> {
  const d = await db();
  const get = () => new Promise<CryptoKey | undefined>((resolve, reject) => {
    const r = d.transaction("keys").objectStore("keys").get("seal");
    r.onsuccess = () => resolve(r.result as CryptoKey | undefined);
    r.onerror = () => reject(r.error);
  });
  const existing = await get();
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction("keys", "readwrite");
    tx.objectStore("keys").put(key, "seal");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return key;
}

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function saveApiKey(provider: Provider, apiKey: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await sealingKey(), new TextEncoder().encode(apiKey)));
  await chrome.storage.local.set({ [`key:${provider}`]: `${b64(iv)}.${b64(sealed)}` });
}

export async function loadApiKey(provider: Provider): Promise<string | null> {
  const stored = (await chrome.storage.local.get(`key:${provider}`))[`key:${provider}`] as string | undefined;
  if (!stored) return null;
  try {
    const [iv, data] = stored.split(".");
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv!) }, await sealingKey(), unb64(data!));
    return new TextDecoder().decode(plain);
  } catch { return null; } // the sealing key was cleared with the site data: ask again
}

export const forgetApiKey = (provider: Provider) => chrome.storage.local.remove(`key:${provider}`);
