// Smart drive (pure): the owner's AI works the Mac the way a person would, one
// visible step at a time. Each step it gets the goal, what's been done and what
// is on screen (names and places from the accessibility tree; no screenshots),
// and answers with one action as JSON. No I/O here.
import type { Element } from "./commands.js";
import { site, type Tab } from "./tabs.js";

export type Seen = Element & { area?: "window" | "menu" | "dock" };

export type Step =
  | { action: "click" | "double_click" | "right_click"; id: number; why?: string }
  | { action: "type"; text: string; why?: string }
  | { action: "key"; combo: string; why?: string }
  | { action: "scroll"; dir: "up" | "down"; id?: number; why?: string }
  | { action: "open_url"; url: string; why?: string }
  | { action: "open_app"; name: string; why?: string }
  | { action: "quit_app"; name: string; why?: string }
  | { action: "close_tab" | "switch_tab"; tab: string; why?: string }
  | { action: "ask"; question: string }
  | { action: "wait"; why?: string }
  | { action: "done"; say?: string }
  | { action: "stop"; say: string };

/** Most steps any one request may take before Peguin gives up. */
export const MAX_STEPS = 12;
/** Elements shown to the AI per step: an open menu, the Dock, the window, then the menu bar; enough to act, small enough to be quick. */
const MAX_SEEN = 160;

/** What's on screen, numbered, in the order that matters for acting: an open menu, the Dock, the window, the menu bar. */
export function observe(elements: Seen[]): { list: string; byId: Map<number, Seen> } {
  // An open menu's items come first: the AI opened it to pick one.
  const rank = (e: Seen) => (e.area === "menu" && e.role === "AXMenuItem" ? 0 : e.area === "dock" ? 1 : e.area === "menu" ? 3 : 2);
  const useful = elements.filter((e) => e.label.trim() || e.role === "AXTextField" || e.role === "AXSearchField");
  const ordered = [...useful].sort((a, b) => rank(a) - rank(b)).slice(0, MAX_SEEN);
  const byId = new Map<number, Seen>();
  const lines = ordered.map((e, i) => {
    byId.set(i + 1, e);
    const role = e.role.replace(/^AX/, "");
    return `[${i + 1}] ${e.area ?? "window"} ${role} "${e.label.replace(/\s+/g, " ").slice(0, 60)}" at ${Math.round(e.x + e.w / 2)},${Math.round(e.y + e.h / 2)}`;
  });
  return { list: lines.join("\n") || "(nothing readable on screen)", byId };
}

/** What else Peguin knows besides the front window: open tabs, running apps, and the owner's last few requests. */
export type Context = { tabs?: Tab[]; apps?: string[]; earlier?: string[]; unread?: string[] };

/** Open tabs, numbered t1, t2…, with the site rather than the full address. */
export function listTabs(tabs: Tab[]): { list: string; byId: Map<string, Tab> } {
  const byId = new Map<string, Tab>();
  const lines = tabs.map((x, i) => {
    byId.set(`t${i + 1}`, x);
    return `[t${i + 1}] ${x.browser}, window ${x.w}${x.active ? " (showing)" : ""}: "${x.title.slice(0, 70)}" ${site(x.url)}`;
  });
  return { list: lines.join("\n"), byId };
}

export function drivePrompt(goal: string, frontApp: string, seen: string, history: string[], ctx: Context = {}): string {
  const tabs = ctx.tabs?.length ? listTabs(ctx.tabs).list : "";
  return `You are Peguin, an AI that works a Mac for its owner the way a person would: by moving a visible cursor, clicking, typing and scrolling. The owner watches every step.
Goal (spoken by the owner, may contain misheard or cut-off words; work out what they most likely mean): ${JSON.stringify(goal.slice(0, 400))}
${ctx.earlier?.length ? `Earlier requests, newest last (for "it", "that", "again"):\n${ctx.earlier.map((e) => `- ${e}`).join("\n")}\n` : ""}App in front: ${frontApp || "unknown"}
${ctx.apps?.length ? `Apps running: ${ctx.apps.join(", ")}\n` : ""}${tabs ? `Open browser tabs (id, browser, title, site):\n${tabs}\n` : ""}${ctx.unread?.length ? `(Tabs of ${ctx.unread.join(", ")} couldn't be read yet; for those, use what's on screen: the tab strip is in the window list.)\n` : ""}Done so far:
${history.length ? history.map((h, i) => `${i + 1}. ${h}`).join("\n") : "(nothing yet)"}
On screen now (id, where, kind, name, centre):
${seen}

Reply with ONE next step as JSON and nothing else:
{"action":"click","id":N,"why":"..."} | {"action":"double_click","id":N,"why":"..."} | {"action":"right_click","id":N,"why":"..."}
{"action":"type","text":"...","why":"..."} | {"action":"key","combo":"cmd+t","why":"..."} (keys: return, escape, tab, delete, up, down, left, right, cmd/shift/alt/ctrl + a key)
{"action":"scroll","dir":"down","id":N,"why":"..."} (id: the list or area to scroll) | {"action":"open_url","url":"https://...","why":"..."} | {"action":"wait","why":"..."}
{"action":"open_app","name":"Music","why":"..."} opens an app the way a person would: Peguin clicks it in the Dock (it finds it there itself, even when the Dock is hidden).
{"action":"quit_app","name":"Music","why":"..."} quits a whole app.
{"action":"close_tab","tab":"t3","why":"..."} closes one browser tab | {"action":"switch_tab","tab":"t3","why":"..."} brings that tab to the front.
{"action":"ask","question":"...?"} when you can't tell what the owner wants (their answer comes back to you with this same task).
{"action":"done","say":"short note"} when the goal is met | {"action":"stop","say":"why"} if it can't be done or isn't a request to do something on the computer.
Rules:
- Do it visibly, like a person. To open or switch to an app, use open_app (or click it in the Dock when you can see it there); to close or quit one, quit_app.
- A website ("my Gmail", "the YouTube video", "that GitHub page") is usually a browser tab: use the tabs list. Closing a site means close_tab, not quitting the browser. If several tabs match, pick the one showing, or ask.
- "Done" means the goal is met: closing something isn't done while it's still open. Read the goal's verb carefully.
- Only type after clicking into a text field in this task, or when something new (a search box, a dialog) has appeared in the list. You can't see Spotlight or other system pop-ups, so don't type into them.
- One small step at a time; after each step you'll see the screen again. Use ids only from the lists above.
- "why" is a few words the owner sees, like "Clicking Music in the Dock".
- Never send, post, delete, buy, pay, accept terms or share anything unless the goal asks for exactly that; stop and say so instead.
- Prefer acting over asking when one reading is clearly most likely; ask only when a wrong guess would be annoying.
- If the same step didn't work twice, try another way or stop.`;
}

/** The AI's step, read leniently (a code fence or a sentence around the JSON is fine). Null when there's no usable step. */
export function readStep(reply: string, known: Map<number, Seen>, tabs: Map<string, Tab> = new Map()): Step | null {
  const json = reply.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  let o: Record<string, unknown>;
  try { o = JSON.parse(json) as Record<string, unknown>; } catch { return null; }
  const why = typeof o.why === "string" ? o.why.slice(0, 80) : undefined;
  const id = typeof o.id === "number" ? o.id : Number(o.id);
  switch (o.action) {
    case "click": case "double_click": case "right_click":
      return known.has(id) ? { action: o.action, id, why } : null;
    case "type": return typeof o.text === "string" && o.text ? { action: "type", text: o.text.slice(0, 500), why } : null;
    case "key": return typeof o.combo === "string" && /^[a-z0-9+=\-[\]]+$/i.test(o.combo) ? { action: "key", combo: o.combo.toLowerCase(), why } : null;
    case "scroll": return o.dir === "up" || o.dir === "down" ? { action: "scroll", dir: o.dir, id: known.has(id) ? id : undefined, why } : null;
    case "open_url": return typeof o.url === "string" && /^https?:\/\/\S+$/.test(o.url) ? { action: "open_url", url: o.url, why } : null;
    case "open_app": case "quit_app": return typeof o.name === "string" && o.name.trim() ? { action: o.action, name: o.name.trim().slice(0, 60), why } : null;
    case "close_tab": case "switch_tab": return typeof o.tab === "string" && tabs.has(o.tab) ? { action: o.action, tab: o.tab, why } : null;
    case "ask": return typeof o.question === "string" && o.question.trim() ? { action: "ask", question: o.question.trim().slice(0, 160) } : null;
    case "wait": return { action: "wait", why };
    case "done": return { action: "done", say: typeof o.say === "string" ? o.say.slice(0, 120) : undefined };
    case "stop": return { action: "stop", say: typeof o.say === "string" ? o.say.slice(0, 160) : "I couldn't do that." };
    default: return null;
  }
}

/**
 * Closing a tab or quitting an app can't be undone by Peguin, so one of them ends
 * the request, unless the owner asked for more than one thing (pure). On
 * 2026-10-21 a drive closed the right tab, then a second, unrelated one while
 * still "looking for" the site.
 */
export function finishes(step: Step, goal: string): boolean {
  if (step.action !== "close_tab" && step.action !== "quit_app") return false;
  // The request, plus the owner's answer if Peguin asked them something ("all of them").
  const asked = `${goal.split("\n")[0]} ${goal.match(/heard: “([^”]*)”/)?.[1] ?? ""}`.toLowerCase();
  return !/\b(and|then|also|all|every|each|both|tabs|apps|windows|others?)\b/.test(asked);
}

/** The same step again on an unchanged screen: it didn't work the first time, so it won't now (pure). */
export const stuck = (step: Step, prev: Step | undefined, changed: boolean) =>
  !!prev && !changed && step.action !== "wait" && JSON.stringify({ ...step, why: undefined }) === JSON.stringify({ ...prev, why: undefined });

/** A short fingerprint of the screen, to tell whether a step changed anything. */
export const screenKey = (app: string, elements: Seen[]) => `${app}|${elements.length}|${elements.slice(0, 12).map((e) => e.label).join("|")}`;

const TEXT = new Set(["AXTextField", "AXTextArea", "AXSearchField", "AXComboBox"]);

/**
 * Typing is only safe into something the owner can see Peguin chose: right after
 * clicking a text field, or when something new has appeared since the last step.
 * Otherwise the keys could land in whatever app is in front (pure).
 */
export function canType(prev: Step | undefined, prevTarget: Seen | undefined, changed: boolean): boolean {
  if (prev && (prev.action === "click" || prev.action === "double_click") && prevTarget && TEXT.has(prevTarget.role)) return true;
  return changed && !!prev && prev.action !== "type";
}

/** One line for the history the AI sees next time, and the caption the owner sees now. */
export function stepLine(s: Step, byId: Map<number, Seen>, tabs: Map<string, Tab> = new Map()): string {
  const tab = (id: string) => { const x = tabs.get(id); return x ? `the “${x.title.slice(0, 40)}” tab` : "a tab"; };
  const name = (id?: number) => (id && byId.get(id) ? `“${byId.get(id)!.label.slice(0, 40)}”${byId.get(id)!.area === "dock" ? " in the Dock" : ""}` : "");
  switch (s.action) {
    case "click": return `clicked ${name(s.id)}`;
    case "double_click": return `double-clicked ${name(s.id)}`;
    case "right_click": return `right-clicked ${name(s.id)}`;
    case "type": return `typed “${s.text.slice(0, 40)}”`;
    case "key": return `pressed ${s.combo}`;
    case "scroll": return `scrolled ${s.dir}${s.id ? ` in ${name(s.id)}` : ""}`;
    case "open_url": return `opened ${s.url}`;
    case "open_app": return `opened ${s.name}`;
    case "quit_app": return `quit ${s.name}`;
    case "close_tab": return `closed ${tab(s.tab)}`;
    case "switch_tab": return `switched to ${tab(s.tab)}`;
    case "ask": return `asked: ${s.question}`;
    case "wait": return "waited";
    case "done": return "done";
    case "stop": return `stopped: ${s.say}`;
  }
}
