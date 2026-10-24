// Runs on Google Meet. Reads Meet's live captions (the owner's own lines come
// as "You"), turns captions on when asked, posts the AI notice in the meeting
// chat, and reports whether the owner is in the call. It never touches the
// owner's mic, camera or audio, and sends nothing until the panel starts.
import { CaptionTracker, splitBlock } from "./captions.js";
import type { FromMeet, MeetState, ToMeet } from "./messages.js";

const send = (m: FromMeet) => chrome.runtime.sendMessage(m).catch(() => { /* panel closed */ });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const visible = (el: Element | null | undefined): el is HTMLElement => !!el && el.getClientRects().length > 0;
async function until<T>(fn: () => T | null | undefined, ms: number): Promise<T | null> {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(250)) { const v = fn(); if (v) return v; }
  return null;
}
const button = (re: RegExp) => [...document.querySelectorAll<HTMLElement>("button, [role=button]")]
  .find((b) => visible(b) && !(b as HTMLButtonElement).disabled && (re.test(b.getAttribute("aria-label") ?? "") || re.test((b.textContent ?? "").trim())));

// Captions ----------------------------------------------------------------

const captionRegion = () => [...document.querySelectorAll<HTMLElement>('[role="region"]')]
  .find((r) => /caption/i.test(r.getAttribute("aria-label") ?? "") && visible(r));

/** The smallest elements reading "Name\nwords": one per caption block. */
function captionBlocks(region: HTMLElement): HTMLElement[] {
  const all = [...region.querySelectorAll<HTMLElement>("div")].filter((d) => splitBlock(d.innerText));
  return all.filter((d) => !all.some((o) => o !== d && d.contains(o)));
}

const tracker = new CaptionTracker();
const keys = new WeakMap<Element, string>();
let seen = new Map<string, Element>();
let blockSeq = 0;
let active = false;

function readCaptions(now: number) {
  const region = captionRegion();
  const current = new Map<string, Element>();
  for (const el of region ? captionBlocks(region) : []) {
    let key = keys.get(el);
    if (!key) { key = `b${++blockSeq}`; keys.set(el, key); }
    const parsed = splitBlock(el.innerText);
    if (!parsed) continue;
    current.set(key, el);
    tracker.observe(key, parsed.speaker, parsed.text, now);
  }
  const heard = [...seen.keys()].filter((k) => !current.has(k)).flatMap((k) => tracker.gone(k, now));
  seen = current;
  heard.push(...tracker.tick(now));
  if (heard.length) void send({ type: "meet:heard", heard });
}

async function captionsOn(on: boolean) {
  const has = !!captionRegion();
  if (has === on) return;
  const b = button(on ? /^turn on captions/i : /^turn off captions/i);
  b?.click();
  await until(() => !!captionRegion() === on || null, 3000);
}

// Meeting state -----------------------------------------------------------

const HANG_UP = '[aria-label="Leave call" i], button[aria-label^="Leave" i]';
let state: MeetState = "lobby";
let hangUpGoneSince = 0;

function readState(): MeetState {
  if ([...document.querySelectorAll(HANG_UP)].some(visible)) { hangUpGoneSince = 0; return "in-call"; }
  if (/you (have |'ve )?left the meeting|the call (has )?ended|removed from the meeting/i.test(document.body.innerText.slice(0, 4000))) return "ended";
  if (state !== "in-call") return state;
  // The controls can hide for a moment (full screen, a dialog); only a long absence means the call is over.
  hangUpGoneSince ||= Date.now();
  return Date.now() - hangUpGoneSince > 8000 ? "ended" : "in-call";
}

// The AI notice -----------------------------------------------------------

const composer = () => [...document.querySelectorAll<HTMLElement>('textarea, [contenteditable="true"], [role=textbox]')]
  .find((el) => visible(el) && /message|chat|send/i.test(["aria-label", "placeholder", "aria-placeholder", "data-placeholder"].map((a) => el.getAttribute(a) ?? "").join(" ")));

function inChatLog(snippet: string, box: Element): boolean {
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.nodeValue?.includes(snippet) && !box.contains(n)) return true;
  return false;
}

/** Posts the notice from the owner's account. "" once it shows up in the chat, otherwise why not. */
async function postNotice(text: string): Promise<string> {
  try {
    let box: HTMLElement | null | undefined = composer();
    if (box && inChatLog(text.slice(0, 40), box)) return ""; // already there (posted earlier, or by hand)
    if (!box) {
      button(/^(chat with everyone|chat|open (the )?chat( panel)?)\b/i)?.click();
      box = await until(composer, 5000);
      if (!box) return "Peguin couldn't open the meeting chat. Open it and try again.";
      if (inChatLog(text.slice(0, 40), box)) return "";
    }
    box.focus();
    if (box instanceof HTMLTextAreaElement) {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box, text);
      box.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      document.execCommand("selectAll");
      document.execCommand("insertText", false, text);
    }
    await sleep(300);
    const sendButton = button(/^send( a)?( message)?$/i);
    if (sendButton) sendButton.click();
    else box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
    const posted = await until(() => inChatLog(text.slice(0, 40), box!), 6000);
    return posted ? "" : "Peguin typed the notice, but it didn't appear in the chat.";
  } catch (e) {
    return `Chat error: ${e instanceof Error ? e.message : e}`;
  }
}

// Wiring ------------------------------------------------------------------

chrome.runtime.onMessage.addListener((m: ToMeet, _sender, reply) => {
  if (m.type === "meet:hello") { state = readState(); reply({ state, captions: !!captionRegion() }); return; }
  if (m.type === "meet:captions") { active = m.on; void captionsOn(m.on).then(() => reply({ captions: !!captionRegion() })); return true; }
  if (m.type === "meet:notice") { void postNotice(m.text).then(reply); return true; }
  if (m.type === "meet:stop") { active = false; reply({}); }
});

setInterval(() => {
  const now = Date.now();
  const next = readState();
  if (next !== state) { state = next; void send({ type: "meet:state", state, captions: !!captionRegion() }); }
  if (active) readCaptions(now);
}, 250);
