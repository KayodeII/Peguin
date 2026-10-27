// Voice control, the words part (pure): is a line from the owner's mic meant for
// Peguin ("Hey Peguin, ..."), what does the command ask for, and which thing on
// screen does a spoken name mean. No AI: a fixed set of commands, like macOS
// Voice Control, so it's instant, free and nothing leaves the Mac.

export type Target =
  | { by: "label"; label: string }
  | { by: "number"; n: number }
  | { by: "cursor" };

export type Shape = "circle" | "box" | "arrow" | "underline" | "highlight";

export type Action =
  | { kind: "click"; target: Target; button: "left" | "right"; count: 1 | 2 }
  | { kind: "point"; target: Target }
  | { kind: "scroll"; dir: "up" | "down" | "left" | "right"; amount: number }
  | { kind: "type"; text: string }
  | { kind: "key"; combo: string; say: string }
  | { kind: "find"; text: string }
  | { kind: "open-url"; url: string }
  | { kind: "search"; query: string }
  | { kind: "open-app"; name: string }
  | { kind: "quit-app"; name: string }
  | { kind: "browser" }
  | { kind: "numbers"; on: boolean }
  | { kind: "draw"; shape: Shape | "pen"; target: Target }
  | { kind: "clear" }
  | { kind: "screenshot"; of: "screen" | "window" }
  | { kind: "stop" }
  | { kind: "unknown"; text: string };

export type Heard =
  /** Said the wake phrase and a command. */
  | { command: string; called: boolean; bare?: boolean }
  /** Said only the wake phrase: the next line is the command. */
  | { armed: true; bare?: boolean }
  | null;

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9'.\s-]/g, " ").replace(/\s+/g, " ").trim();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** How whisper writes "Peguin" when it gets it wrong. */
const SOUNDS_LIKE = ["peguin", "penguin", "penguins", "pegwin", "peg win", "pinguin", "pengwin", "pequin"];
const SEP = "[\\s,.!?:;-]+";

/**
 * A line meant for Peguin starts with the wake phrase: "Hey Peguin, scroll down".
 * `called` is true when a greeting came first ("hey", "ok"); a bare "Peguin ..."
 * only counts if what follows is a known command (see `parse`), so talk about
 * penguins doesn't act. `names` are the owner's wake words (Settings). The
 * command keeps the owner's capitals and punctuation, for typing.
 */
export function wake(text: string, names: string[] = ["Peguin"], hey = false): Heard {
  const named = wakeNamed(text, names);
  if (named || !hey) return named;
  // "Hey" on its own (the owner's choice in Settings): "Hey, open Music", or "Hey." and the request next.
  // `bare` marks it: a greeting to a person ("Hey John, ...") also looks like this, so it's treated with care.
  const m = text.match(new RegExp(`^[\\s,.!?"'“”]*hey(?:${SEP}|$)([\\s\\S]*)$`, "i"));
  if (!m) return null;
  const rest = (m[1] ?? "").replace(/^(please|can you|could you|would you)[\s,]+/i, "").trim();
  if (!/[a-z0-9]/i.test(rest)) return { armed: true, bare: true };
  return { command: rest, called: true, bare: true };
}

function wakeNamed(text: string, names: string[]): Heard {
  const all = [...new Set([...names.map(norm), ...SOUNDS_LIKE])].filter(Boolean).sort((a, b) => b.length - a.length)
    .map((n) => n.split(" ").map(escape).join(SEP));
  const m = text.match(new RegExp(`^[\\s,.!?"'“”]*(?:(hey|hi|okay|ok|yo|hello)${SEP})?(?:${all.join("|")})(?:${SEP}|$)([\\s\\S]*)$`, "i"));
  if (!m) return null;
  const rest = (m[2] ?? "").replace(/^(please|can you|could you|would you)[\s,]+/i, "").trim();
  if (!/[a-z0-9]/i.test(rest)) return m[1] ? { armed: true } : null;
  // "Hey Peguin. Hey Peguin, open Music": the name said twice; what follows the second one is the command.
  const again = wakeNamed(rest, names);
  if (again) return "armed" in again ? (m[1] ? again : null) : { command: again.command, called: again.called || !!m[1] };
  return { command: rest, called: !!m[1] };
}

/**
 * Whisper's prompt for the owner's mic. Measured on spoken commands and noise
 * (docs/features/voice-control.md): a meeting-style prompt lost the leading
 * "Hey Peguin" on 19 of 48 commands; one "Hey <name>, ..." example kept all of
 * them. On loud noise whisper repeats its prompt, so the example must do
 * nothing: "hello there" isn't a command, and an exact copy is dropped anyway.
 */
export const commandPrompt = (name: string) => `Hey ${name}, open WhatsApp and send hi. Hello there.`;

/**
 * Whisper often turns a spoken "hi" into "aye", "I", "eye" or "high". Soften those
 * when they sit where a short message would (pure).
 */
export function softenSpeech(text: string): string {
  let t = text.replace(/\b(send|sent|say)\s+(aye|eye|i|high|hai)\b/gi, "$1 hi");
  t = t.replace(/\bsay\s+(aye|eye|i|high|hai)\s+to\b/gi, "say hi to");
  t = t.replace(/\bsaying\s+(aye|eye|i|high|hai)\b/gi, "saying hi");
  if (/^(aye|eye|i|high|hai)\.?$/i.test(t.trim())) return "hi";
  return t;
}

/**
 * A scrap rather than a request (pure): trailing off ("I'm...") or a single word
 * that isn't a command. Used only when the line didn't start with "Hey Peguin".
 */
export function fragment(text: string): boolean {
  const t = text.trim();
  if (/(\.\.\.|…|-)$/.test(t)) return true;
  return t.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length < 2;
}

/** What whisper writes for silence and noise; never a command, even right after "Hey Peguin". */
export function isFiller(text: string, name = "Peguin"): boolean {
  const t = norm(text).replace(/[.,!?]/g, "").trim();
  // Whisper's loop on noise: one short word over and over ("Oh, oh, oh, oh", "hey hey hey hey").
  if (/^(\S{1,6})( \1){2,}$/.test(t)) return true;
  return !t || /^(thank you|thanks|okay|ok|bye|you|you're welcome|hello|no|yes|um|uh|hmm)$/.test(t) || t === norm(commandPrompt(name)).replace(/[.,!?]/g, "");
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  // Heard instead of a lone number after "click".
  to: 2, too: 2, for: 4, won: 1, ate: 8,
};

/** "7", "seven", "number 12", "twenty three" -> the number, else null. */
export function spokenNumber(s: string): number | null {
  const t = norm(s).replace(/^(number|no\.?|#)\s*/, "").replace(/-/g, " ").trim();
  if (/^\d{1,3}$/.test(t)) return Number(t);
  const words = t.split(" ");
  if (words.length === 1 && words[0]! in NUMBER_WORDS) return NUMBER_WORDS[words[0]!]!;
  if (words.length === 2) {
    const [a, b] = [NUMBER_WORDS[words[0]!], NUMBER_WORDS[words[1]!]];
    if (a && b && a >= 20 && a % 10 === 0 && b < 10 && !["to", "too", "for"].includes(words[1]!)) return a + b;
  }
  return null;
}

const HERE = /^(this|that|here|there|it|this one|that one|where i am|where my (mouse|cursor) is)$/;

function target(s: string): Target {
  let t = norm(s).replace(/[.,]+/g, " ").trim().replace(/^(on|at|to|onto|over)\s+/, "").replace(/^the\s+/, "").trim();
  t = t.replace(/\s+(button|link|icon)$/, "") || t; // "the sign in button" -> "sign in"
  if (!t || HERE.test(t)) return { by: "cursor" };
  const n = spokenNumber(t);
  if (n !== null) return { by: "number", n };
  return { by: "label", label: t };
}

/** Keyboard shortcuts with their spoken names (macOS). */
const KEYS: [RegExp, string, string][] = [
  [/^(open )?(a )?new tab$/, "cmd+t", "New tab"],
  [/^close (the |this )?tab$/, "cmd+w", "Closing the tab"],
  [/^close (the |this )?window$/, "cmd+shift+w", "Closing the window"],
  [/^(re ?open|bring back) (the )?(last |closed )?tab$/, "cmd+shift+t", "Reopening the tab"],
  [/^(new|open a new) window$/, "cmd+n", "New window"],
  [/^(next|switch) tab$/, "ctrl+tab", "Next tab"],
  [/^(previous|last) tab$/, "ctrl+shift+tab", "Previous tab"],
  [/^(go )?back$/, "cmd+[", "Back"],
  [/^(go )?forward$/, "cmd+]", "Forward"],
  [/^(reload|refresh)( (the |this )?page)?$/, "cmd+r", "Reloading"],
  [/^copy( (that|this|it))?$/, "cmd+c", "Copied"],
  [/^paste( (that|this|it))?$/, "cmd+v", "Pasted"],
  [/^cut( (that|this|it))?$/, "cmd+x", "Cut"],
  [/^undo( (that|this|it))?$/, "cmd+z", "Undo"],
  [/^redo( (that|this|it))?$/, "cmd+shift+z", "Redo"],
  [/^select all$/, "cmd+a", "Selected all"],
  [/^save( (it|this|that))?$/, "cmd+s", "Saved"],
  [/^zoom in$/, "cmd+=", "Zooming in"],
  [/^zoom out$/, "cmd+-", "Zooming out"],
  [/^(address bar|go to (the )?address bar)$/, "cmd+l", "Address bar"],
  [/^(switch apps?|other app)$/, "cmd+tab", "Switching apps"],
  [/^(go to |scroll to )?(the )?top( of (the )?page)?$/, "cmd+up", "Top"],
  [/^(go to |scroll to )?(the )?bottom( of (the )?page)?$/, "cmd+down", "Bottom"],
];

const PRESS: Record<string, string> = {
  enter: "return", return: "return", escape: "escape", esc: "escape", tab: "tab", space: "space", "space bar": "space", spacebar: "space",
  delete: "delete", backspace: "delete", "back space": "delete", up: "up", down: "down", left: "left", right: "right",
  "page up": "pageup", "page down": "pagedown", home: "home", end: "end",
};

const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/;

/** "github dot com", "github.com", "news.ycombinator.com/item?id=1" -> https URL; else null. */
export function spokenUrl(s: string): string | null {
  const t = s.trim().toLowerCase().replace(/\s+dot\s+/g, ".").replace(/\s+slash\s+/g, "/").replace(/^https?:\/\//, "").replace(/[.,!?]+$/, "");
  const squeezed = t.replace(/\s+(?=[a-z0-9-]*\.[a-z]{2,}$)/g, ""); // "git hub.com" -> "github.com"
  return DOMAIN.test(squeezed) ? `https://${squeezed}` : null;
}

const SHAPES: Record<string, Shape> = {
  circle: "circle", ring: "circle", round: "circle", box: "box", square: "box", rectangle: "box", frame: "box",
  arrow: "arrow", pointer: "arrow", underline: "underline", line: "underline", highlight: "highlight",
};

/** What a command asks for. `unknown` when it isn't one Peguin knows. */
/** Spoken padding around a command: "can you ...", "please ...", "I need you to ...", "... for me". */
export function unpad(text: string): string {
  let t = text.trim(), prev = "";
  while (t !== prev) {
    prev = t;
    t = t.replace(/^(so|um+|uh+|and|then|also|now|okay|ok|alright)[,\s]+/i, "")
      .replace(/^(can|could|would|will) you( please)?[,\s]+/i, "")
      .replace(/^(please|kindly|just|go ahead and|help me|quickly)[,\s]+/i, "")
      .replace(/^(i need|i want|i'd like|i would like) (you )?to[,\s]+/i, "");
    // Typed text is the owner's own words: its ending stays.
    if (!/^(type|write|enter|input)\b/i.test(t)) t = t.replace(/[,\s]+(for me|please|now|right now|thanks|thank you|quickly)([.?!]*)$/i, "$2").replace(/\?+$/, "");
  }
  return t.trim();
}

/** Each sentence or clause of what was said, the whole line first ("type Hello, World!" stays whole). */
function clauses(text: string): string[] {
  const parts = text.split(/(?<=[.?!])\s+|,\s*(?:and\s+)?(?:then\s+)?|\s+and then\s+/).map((x) => x.trim()).filter(Boolean);
  return [...new Set([text.trim(), ...parts])];
}

/**
 * What the owner asked for. Polite padding is dropped, and when they said a few
 * things in one breath ("I need you to open the Chrome tab, open the Chrome browser"),
 * the first clause that's a command wins.
 */
export function parse(command: string): Action {
  let first: Action | null = null;
  for (const c of clauses(command)) {
    const a = parseOne(unpad(c));
    if (a.kind !== "unknown") return a;
    first ??= a;
  }
  return first ?? { kind: "unknown", text: command.trim() };
}

/** An app name as said: "the Chrome browser" is Chrome. */
const appName = (s: string) => {
  let t = s.trim(), prev = "";
  while (t !== prev) { prev = t; t = t.replace(/^(the|my|a|an)\s+/i, "").replace(/\s+(app|application|browser|tab|window|program)$/i, "").trim(); }
  return t;
};

/** An app's name as the Dock shows it, which can differ from the installed one ("iTerm2" for iTerm). */
export function dockLabel(name: string, labels: string[]): string | undefined {
  const n = name.toLowerCase();
  return labels.find((l) => l.toLowerCase() === n) ?? matchApp(name, labels) ?? labels.find((l) => l.toLowerCase().startsWith(n));
}

/**
 * The installed app a spoken name means (pure): exact name first, then an app
 * whose name contains the word ("Chrome" is Google Chrome), then a close spelling.
 */
export function matchApp(spoken: string, installed: string[]): string | null {
  const s = norm(appName(spoken));
  if (!s) return null;
  const by = (f: (n: string) => boolean) => installed.filter((n) => f(norm(n)));
  const exact = by((n) => n === s);
  if (exact.length) return exact[0]!;
  const word = by((n) => new RegExp(`(^|\\s)${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(n)).sort((a, b) => a.length - b.length);
  if (word.length) return word[0]!;
  const close = installed.map((n) => ({ n, sc: labelScore(s, n) })).filter((x) => x.sc >= 0.8).sort((a, b) => b.sc - a.sc);
  if (close[0]) return close[0].n;
  // Heard slightly wrong ("notez"): one letter off for short names, two for longer ones.
  const near = installed.map((n) => ({ n, d: edits(s, norm(n)) })).filter((x) => x.d <= (s.length >= 8 ? 2 : 1) && s.length >= 4).sort((a, b) => a.d - b.d);
  return near[0]?.n ?? null;
}

/** Levenshtein distance. */
function edits(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length]!;
}

function parseOne(command: string): Action {
  const said = command.trim();
  const raw = said.replace(/[.!?]+$/, "");
  const t = norm(raw).replace(/[.,]+$/, "").replace(/,/g, "").replace(/\s+(please|now|for me)$/, "").trim();
  let m: RegExpMatchArray | null;

  if (/^(stop|cancel|never mind|nevermind|abort|halt|that's all|done|exit)$/.test(t)) return { kind: "stop" };
  if (/^(clear|erase|wipe|remove)( (it|that|the|my|all|everything))*( (drawings?|ink|annotations?|marks?|screen))?$/.test(t)) return { kind: "clear" };
  // Screenshot / snap / capture the screen or the front window (saved on the Desktop).
  if (/^(take\s+(a\s+)?)?(screen\s*shot|screenshot|screen\s*capture|capture)(\s+(of\s+)?(the\s+)?(screen|display|desktop|window|front( window)?|app( in front)?|.+))?$/.test(t)
    || /^(snap|grab)( (a )?(picture|photo|image))?( of .+)?$/.test(t)) {
    const of = /\b(window|app|whatsapp|front)\b/i.test(t) ? "window" as const : "screen" as const;
    return { kind: "screenshot", of };
  }
  if (/^(show|display) (the )?(numbers|labels|hints)$|^number (everything|things)$/.test(t)) return { kind: "numbers", on: true };
  if (/^(hide|remove|clear) (the )?(numbers|labels|hints)$/.test(t)) return { kind: "numbers", on: false };

  if ((m = t.match(/^(right[- ]click|double[- ]click|click|tap|press|select|choose|open)\s*(on\s+)?(.*)$/))) {
    const verb = m[1]!, rest = m[3] ?? "";
    // "press enter", "open github.com", "open Slack" are handled below.
    const pressable = verb === "press" && (rest in PRESS || /^(cmd|command|control|ctrl|option|alt|shift)\b/.test(rest));
    const opening = verb === "open" && (!rest || !/^(number |#)?\d+$|^(this|that|it)$/.test(rest));
    if (!pressable && !opening && !(verb === "select" && rest === "all")) {
      const button = verb.startsWith("right") ? "right" : "left";
      return { kind: "click", target: target(rest), button, count: verb.startsWith("double") ? 2 : 1 };
    }
  }
  if ((m = t.match(/^(?:move(?: the (?:mouse|cursor|pointer))?|point|hover)\s+(?:to|at|on|over)\s+(.+)$/))) return { kind: "point", target: target(m[1]!) };

  if ((m = t.match(/^scroll( (up|down|left|right))?( (a (bit|little)|a lot|more|way (up|down)|all the way( (up|down))?))?$/))) {
    const dir = (m[2] ?? (/up/.test(m[3] ?? "") ? "up" : "down")) as "up" | "down" | "left" | "right";
    const amount = /a (bit|little)/.test(m[3] ?? "") ? 3 : /lot|way/.test(m[3] ?? "") ? 25 : 8;
    return { kind: "scroll", dir, amount };
  }
  if ((m = t.match(/^page (up|down)$/))) return { kind: "scroll", dir: m[1] as "up" | "down", amount: 15 };

  for (const [re, combo, say] of KEYS) if (re.test(t)) return { kind: "key", combo, say };
  if (t in PRESS && t !== "tab") return { kind: "key", combo: PRESS[t]!, say: `Pressed ${t}` };
  if ((m = t.match(/^(press|hit)( the)? (.+?)( key)?$/))) {
    const k = m[3]!;
    if (k in PRESS) return { kind: "key", combo: PRESS[k]!, say: `Pressed ${k}` };
    const combo = k.replace(/\b(command)\b/g, "cmd").replace(/\b(control)\b/g, "ctrl").replace(/\b(option)\b/g, "alt").replace(/\s*(\+|plus)\s*|\s+/g, "+");
    if (/^((cmd|ctrl|alt|shift)\+)+[a-z0-9=\-[\]]+$/.test(combo)) return { kind: "key", combo, say: `Pressed ${k}` };
  }

  // Typed text keeps the owner's own capitals and punctuation.
  // Whisper ends every line with a full stop; a "!" or "?" was probably meant.
  // "close Music", "quit Spotify", "close the music up": the app (checked against the installed ones when it runs).
  if ((m = t.match(/^(?:close|quit|exit|shut(?: down)?|kill)\s+(?:the\s+)?(.+?)(?:\s+(?:app|application))?(?:\s+(?:up|down))?$/))) {
    const name = appName(m[1]!);
    if (name && name.split(/\s+/).length <= 4 && !/^(it|this|that|everything|all)$/.test(name.toLowerCase())) return { kind: "quit-app", name };
  }
  if ((m = said.match(/^(?:type|write|enter|input)[\s,:]+(?:in\s+)?(.+?)\.?$/i))) return { kind: "type", text: m[1]!.trim() };
  if (/^((go|switch|take me) to|open|show( me)?|bring up)( (my|the))? (web )?browser$|^browser$/.test(t)) return { kind: "browser" };
  if ((m = raw.match(/^(?:search(?: the web| google| online)?(?: for)?|google|look up|research|find out(?: about)?)\s+(.+)$/i))) return { kind: "search", query: m[1]!.trim() };
  if ((m = raw.match(/^(?:find|look for) (?:on (?:the|this) page )?(.+?)(?: on (?:the|this) page)?$/i))) return { kind: "find", text: m[1]!.trim() };
  if ((m = t.match(/^((go|navigate|take me|head|switch) to|open|visit|load|launch|start)\s+(.+)$/))) {
    const url = spokenUrl(m[3]!);
    if (url) return { kind: "open-url", url };
    // "open Slack", "go to Chrome", "switch to Notes": an app (checked against the installed ones when it runs).
    const name = appName(raw.replace(/^\S+(\s+to)?\s+/i, ""));
    if (name && name.split(/\s+/).length <= 4) return { kind: "open-app", name };
    return { kind: "unknown", text: raw };
  }

  if ((m = t.match(/^(draw|put|add|make)( me)?( an?| the)? (.+?)( (around|on|over|under|at|here|there|this|that|it).*)?$/))) {
    const word = m[4]!.replace(/s$/, "");
    if (word === "draw" || /^(freehand|with (the )?pen|pen)$/.test(word)) return { kind: "draw", shape: "pen", target: { by: "cursor" } };
    const shape = SHAPES[word];
    if (shape) return { kind: "draw", shape, target: m[5] ? target(m[5].replace(/^\s*(around|on|over|under|at)\s+/, "")) : { by: "cursor" } };
  }
  if (/^(draw|sketch|annotate|let me draw|pen)$/.test(t)) return { kind: "draw", shape: "pen", target: { by: "cursor" } };
  if ((m = t.match(/^(circle|highlight|underline|box) (.+)$/))) return { kind: "draw", shape: SHAPES[m[1]!]!, target: target(m[2]!) };

  return { kind: "unknown", text: raw };
}

/** Something on screen that can be clicked, as the Mac's accessibility tree describes it (points, top-left origin). */
export type Element = { label: string; role: string; x: number; y: number; w: number; h: number };

const ROLE_RANK: Record<string, number> = { AXButton: 3, AXLink: 3, AXMenuItem: 3, AXMenuBarItem: 2, AXTab: 3, AXRadioButton: 2, AXCheckBox: 2, AXPopUpButton: 2, AXTextField: 2, AXTextArea: 1, AXComboBox: 2, AXCell: 1, AXRow: 1, AXImage: 0, AXStaticText: 0 };

const words = (s: string) => norm(s).replace(/[.'-]/g, " ").split(" ").filter(Boolean);

/** How well an on-screen label fits what was said, 0 to 1 (pure). */
export function labelScore(said: string, label: string): number {
  const a = words(said).join(" "), b = words(label).join(" ");
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (b.startsWith(`${a} `) || b.endsWith(` ${a}`)) return 0.85;
  if (` ${b} `.includes(` ${a} `)) return 0.75;
  const wa = new Set(words(said)), wb = new Set(words(label));
  let shared = 0;
  for (const w of wa) if (wb.has(w) || [...wb].some((x) => x.length > 3 && (x.startsWith(w) || w.startsWith(x)))) shared++;
  const dice = (2 * shared) / (wa.size + wb.size);
  return dice >= 0.5 ? dice * 0.7 : 0;
}

export type Match = { element: Element } | { choices: Element[] } | null;

/**
 * The element a spoken name means. One clear best match wins; several equally
 * good ones come back as `choices` so Peguin can number them and ask; none, null.
 */
export function matchTarget(said: string, elements: Element[]): Match {
  const scored = elements
    .map((e) => ({ e, s: labelScore(said, e.label) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s || (ROLE_RANK[y.e.role] ?? 0) - (ROLE_RANK[x.e.role] ?? 0));
  const best = scored[0];
  if (!best) return null;
  const inside = (a: Element, b: Element) => a !== b && a.x >= b.x - 2 && a.y >= b.y - 2 && a.x + a.w <= b.x + b.w + 2 && a.y + a.h <= b.y + b.h + 2;
  // One button often appears twice (a row and the button in it): keep the outer one.
  const tied = scored.filter((x) => x.s === best.s && (ROLE_RANK[x.e.role] ?? 0) === (ROLE_RANK[best.e.role] ?? 0))
    .filter((x, _, all) => !all.some((y) => inside(x.e, y.e)));
  if (tied.length === 1) return { element: best.e };
  return { choices: tied.slice(0, 9).map((x) => x.e) };
}

/** Where a click on an element lands: its middle (pure). */
export const centre = (e: Pick<Element, "x" | "y" | "w" | "h">) => ({ x: Math.round(e.x + e.w / 2), y: Math.round(e.y + e.h / 2) });

/** A short caption for the overlay while an action runs. */
export function describe(a: Action): string {
  const t = (x: Target) => (x.by === "label" ? `“${x.label}”` : x.by === "number" ? `${x.n}` : "here");
  switch (a.kind) {
    case "click": return `${a.count === 2 ? "Double-clicking" : a.button === "right" ? "Right-clicking" : "Clicking"} ${t(a.target)}`;
    case "point": return `Pointing at ${t(a.target)}`;
    case "scroll": return `Scrolling ${a.dir}`;
    case "type": return `Typing “${a.text.length > 40 ? `${a.text.slice(0, 40)}…` : a.text}”`;
    case "key": return a.say;
    case "find": return `Finding “${a.text}”`;
    case "open-url": return `Opening ${a.url.replace(/^https:\/\//, "")}`;
    case "search": return `Searching for “${a.query}”`;
    case "open-app": return `Opening ${a.name}`;
    case "quit-app": return `Quitting ${a.name}`;
    case "browser": return "Opening your browser";
    case "numbers": return a.on ? "Say “click” and a number" : "Numbers hidden";
    case "draw": return a.shape === "pen" ? "Draw with your mouse. Say “Hey Peguin, done” when you're finished" : `Drawing a ${a.shape}`;
    case "clear": return "Cleared";
    case "screenshot": return a.of === "window" ? "Screenshot of the front window" : "Screenshot";
    case "stop": return "Stopped";
    case "unknown": return `I don't know “${a.text}” yet`;
  }
}

/** The search page for a query, from the owner's search address (Settings) with %s for the words (pure). */
export const searchUrl = (template: string, query: string) =>
  template.includes("%s") ? template.replace("%s", encodeURIComponent(query)) : `${template}${encodeURIComponent(query)}`;

/** Mostly the same words (pure): a line from the mic that the meeting just played through the speakers. */
export function sameWords(a: string, b: string): boolean {
  const wa = new Set(words(a)), wb = new Set(words(b));
  if (!wa.size || !wb.size) return false;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return (2 * shared) / (wa.size + wb.size) >= 0.6;
}

/**
 * What the meeting said recently (the copilot hears the other people). A wake
 * phrase from the mic that matches one of these came out of the speakers, so it
 * isn't the owner's command.
 */
export class Echo {
  private lines: { text: string; at: number }[] = [];
  constructor(private keepMs = 10_000) {}
  said(text: string, now: number) {
    this.lines = this.lines.filter((l) => now - l.at < this.keepMs);
    this.lines.push({ text, at: now });
  }
  heard(text: string, now: number): boolean {
    return this.lines.some((l) => now - l.at < this.keepMs && sameWords(l.text, text));
  }
}
