import { app } from "electron";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour time like 09:30");

/** A word and how it should sound, spelled for the voice model: { word: "Mujeeb", sayAs: "Moo-jeeb" }. */
const Pronunciation = z.object({ word: z.string().trim().min(1).max(40), sayAs: z.string().trim().min(1).max(60) });

const Voice = z.object({
  mode: z.enum(["standard", "mine"]).default("standard"),
  /** The standard voice (not the owner's own): the Mac's built-in voice, or one of xAI's voices with the owner's xAI key. */
  standard: z.enum(["mac", "grok"]).default("mac"),
  /** Which xAI voice, when the standard voice is Grok. */
  grokVoice: z.string().trim().min(1).max(40).default("eve"),
  /** Where the owner's voice is made: on this Mac (private), or ElevenLabs with their own key (most natural; the sample and lines are sent there). */
  engine: z.enum(["mac", "elevenlabs"]).default("mac"),
  /** ElevenLabs models: one for lines prepared before the meeting, a faster one for live answers. */
  eleven: z.object({
    model: z.enum(["eleven_v4", "eleven_v4_turbo"]).default("eleven_v4"),
    liveModel: z.enum(["eleven_v4", "eleven_v4_turbo"]).default("eleven_v4_turbo"),
    /** Let Claude add a few delivery cues ([warmly], [thoughtfully]) that ElevenLabs performs. */
    cues: z.boolean().default(true),
  }).default(() => ({ model: "eleven_v4" as const, liveModel: "eleven_v4_turbo" as const, cues: true })),
  /** Names, products and terms the owner has taught Peguin to say. Nothing is built in. */
  pronunciations: z.array(Pronunciation).max(40).default([]),
  /** Silence between sentences, in seconds. */
  pause: z.number().min(0.1).max(1).default(0.32),
  /** 0.3 is steady and careful, 0.9 lively; higher drops more words. */
  expressiveness: z.number().min(0.3).max(0.9).default(0.6),
  /** How many times a prepared line is made again when a word comes back wrong (1 = no checking). */
  attempts: z.number().int().min(1).max(5).default(3),
  /**
   * Learn my voice: while voice control is listening, keep a few clean clips of
   * the owner talking for them to review; ticked clips become a fuller sample.
   * Off until the owner turns it on.
   */
  learn: z.object({
    enabled: z.boolean().default(false),
    perDay: z.number().int().min(1).max(30).default(8),
  }).default(() => ({ enabled: false, perDay: 8 })),
});

/** Peguin's own cursor. Every value is the owner's preference. */
const Cursor = z.object({
  /** "penguin": Peguin's head, the beak points and the eye looks around; "fin": a flipper; "arrow": a classic pointer. */
  shape: z.enum(["penguin", "fin", "arrow"]).default("penguin"),
  /** The glow (and the fin or arrow); the penguin's head is always black. */
  color: z.enum(["ink", "tomato", "blue", "green", "purple"]).default("tomato"),
  size: z.number().min(0.7).max(1.8).default(1),
  /** How long a move takes, in ms (slower is easier to follow). */
  glideMs: z.number().int().min(150).max(1200).default(450),
  /**
   * Between commands. "roam": it rests around the middle of the screen, drifts now and then away
   * from the owner's mouse, and looks at the window they're in when the work log notes it;
   * "island": back on the island after `returnAfterS`; "stay": it waits where it last worked.
   */
  home: z.enum(["roam", "island", "stay"]).default("roam"),
  returnAfterS: z.number().int().min(2).max(60).default(6),
});

/** Private by nature, so left out of the work log until the owner says otherwise. */
const SKIP_APPS = ["1Password", "Bitwarden", "Keychain Access", "Passwords", "Messages", "WhatsApp", "Signal", "Telegram", "Mail", "FaceTime", "Photos"];

/** Delivery cues only when the owner's voice is made by ElevenLabs and they've left cues on (pure). */
export const wantsCues = (s: { voice: { mode: string; engine: string; eleven: { cues: boolean } } }) =>
  s.voice.mode === "mine" && s.voice.engine === "elevenlabs" && s.voice.eleven.cues;

/** Older settings files: voice was "default", then { mode, namePronounced }. */
function migrate(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const raw = input as Record<string, unknown>;
  const voice = raw.voice;
  if (typeof voice === "string") return { ...raw, voice: { mode: "standard" } };
  if (voice && typeof voice === "object" && "namePronounced" in voice) {
    const { namePronounced, ...rest } = voice as { namePronounced?: unknown };
    const first = typeof raw.displayName === "string" ? raw.displayName.trim().split(/\s+/)[0] : "";
    const said = typeof namePronounced === "string" ? namePronounced.trim() : "";
    return { ...raw, voice: { ...rest, pronunciations: first && said ? [{ word: first, sayAs: said }] : [] } };
  }
  return input;
}

/** The few things Peguin needs; everything else it works out. */
export const Settings = z.preprocess(migrate, z.object({
  displayName: z.string().trim().max(40).default(""),
  aliases: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  timezone: z.string().default(Intl.DateTimeFormat().resolvedOptions().timeZone),
  /** The recurring standup Peguin attends for you. Calendar sync replaces this later. */
  standup: z.object({
    url: z.string().trim().default(""),
    time: Time.default("09:30"),
    days: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]), // 0 = Sunday
    auto: z.boolean().default(false),
  }).default({ url: "", time: "09:30", days: [1, 2, 3, 4, 5], auto: false }),
  sources: z.object({
    git: z.boolean().default(true),
    github: z.boolean().default(true),
    /** AI coding sessions on this Mac: the owner's prompts only. */
    claude_code: z.boolean().default(true),
    codex: z.boolean().default(true),
    cursor: z.boolean().default(true),
    gemini: z.boolean().default(true),
    copilot: z.boolean().default(true),
    continue: z.boolean().default(true),
    deepseek: z.boolean().default(true),
    /** Used only once connected in Sources (the keys live in trackers.sealed). */
    linear: z.boolean().default(true),
    jira: z.boolean().default(true),
  }).default({
    git: true, github: true,
    claude_code: true, codex: true, cursor: true, gemini: true, copilot: true, continue: true, deepseek: true,
    linear: true, jira: true,
  }),
  appearance: z.object({
    theme: z.enum(["system", "light", "dark", "midnight"]).default("system"),
    accent: z.enum(["blue", "purple", "green", "orange", "pink"]).default("blue"),
  }).default({ theme: "system", accent: "blue" }),
  /** "standard" is the built-in voice; "mine" is the owner's own (opt-in, recorded in Settings). Every value is the owner's preference. */
  voice: Voice.default(() => Voice.parse({})),
  /** Find standups in the owner's calendars instead of (or as well as) the fixed time above. */
  calendar: z.object({
    enabled: z.boolean().default(false),
    /** Read the Mac's Calendar (every account added to macOS). Links and Calendly live in calendar.bin, encrypted. */
    mac: z.boolean().default(false),
    /** A meeting counts as a standup when its title has one of these words. The owner's list. */
    words: z.array(z.string().trim().min(1).max(40)).max(20).default(["standup", "stand-up", "stand up", "daily", "scrum"]),
  }).default(() => ({ enabled: false, mac: false, words: ["standup", "stand-up", "stand up", "daily", "scrum"] })),
  /** After each meeting: a recap with follow-ups, kept encrypted on this Mac for `keepDays`. */
  recap: z.object({
    /** Ask Claude for a short summary and extra follow-ups (the transcript is sent, like answers are). */
    summarize: z.boolean().default(true),
    keepDays: z.number().int().min(1).max(365).default(30),
    /** Also recap meetings the owner joins themselves with the copilot (what others said, the questions and suggestions). */
    copilot: z.boolean().default(true),
  }).default(() => ({ summarize: true, keepDays: 30, copilot: true })),
  /** Stop speaking when someone talks over Peguin, and listen to them. */
  stopWhenInterrupted: z.boolean().default(true),
  runHidden: z.boolean().default(true),
  /**
   * The AI that writes the update, answers follow-ups, suggests copilot answers and
   * summarises recaps. Always the owner's own: their Claude Code sign-in, their
   * Codex CLI sign-in, or their xAI key. Peguin never pays for anyone's AI.
   */
  ai: z.enum(["claude", "codex", "grok"]).default("claude"),
  /** The private copilot: what kind of meeting it's helping in, and whether general answers are checked on the web. */
  copilot: z.object({
    mode: z.enum(["work", "interview"]).default("work"),
    /** After the quick answer, look it up on the web (about 15 s more) and replace it. */
    web: z.boolean().default(false),
  }).default(() => ({ mode: "work" as const, web: false })),
  /**
   * Voice control: "Hey Peguin, ..." from the owner's own mic moves the mouse,
   * clicks, types and draws on screen. Off until the owner turns it on; words are
   * heard on this Mac and nothing is sent anywhere.
   */
  pointer: z.object({
    enabled: z.boolean().default(false),
    /** What the owner calls Peguin after "Hey". */
    wakeWords: z.array(z.string().trim().min(2).max(30)).min(1).max(5).default(["Peguin"]),
    /**
     * "name": "Hey Peguin" wakes it. "hey": "Hey" on its own does too; then anything that isn't a
     * clear command goes to the owner's AI quietly and is dropped if it isn't a request (a "Hey John").
     * In meetings the name is always needed.
     */
    wake: z.enum(["name", "hey"]).default("name"),
    /** Seconds Peguin waits for the request after it's woken ("Hey Peguin" … "open Music"); talking keeps it waiting. */
    listenS: z.number().int().min(3).max(60).default(15),
    /** Seconds after a request that a follow-up ("now close it") needs no wake word. 0: always say it. */
    followS: z.number().int().min(0).max(120).default(30),
    /**
     * How to start a command. "hold" (default, like Clicky): hold Control+Option, speak, release to run.
     * "wake": “Hey Peguin” or the press shortcut. "both": either.
     */
    trigger: z.enum(["hold", "wake", "both"]).default("hold"),
    /** Press to give one command without the wake phrase (Electron accelerator). Empty: none. Used when trigger is wake or both. */
    shortcut: z.string().trim().max(60).default("Control+Alt+Space"),
    /** Where "search for ..." goes; %s is replaced by the words. */
    searchUrl: z.string().trim().url().default("https://www.google.com/search?q=%s"),
    /** Peguin's own cursor: how it looks, how fast it moves and where it rests. */
    cursor: Cursor.default(() => Cursor.parse({})),
    /**
     * When a line starts with "Hey Peguin" but the rest isn't a command Peguin knows, ask the owner's
     * AI (Settings > AI) what they meant. Only those words are sent, never audio or other talk.
     */
    askAi: z.boolean().default(true),
    /**
     * "smart": opening, finding, clicking and searching are planned by the owner's AI one visible step at a
     * time (Dock, Finder, scrolling, like a person); "quick": fixed commands only, done directly. Instant
     * things (scroll, keys, typing, drawing, stop) are always done directly.
     */
    drive: z.enum(["smart", "quick"]).default("smart"),
    /** The Dynamic Island at the top of the screen: what Peguin hears and does. */
    island: z.boolean().default(true),
  }).default(() => ({ enabled: false, wakeWords: ["Peguin"], wake: "name" as const, listenS: 15, followS: 30, trigger: "hold" as const, shortcut: "Control+Alt+Space", searchUrl: "https://www.google.com/search?q=%s", cursor: Cursor.parse({}), askAi: true, drive: "smart" as const, island: true })),
  /**
   * The work log: every few minutes, the app in front and its window title, so
   * the draft knows what the owner spent time on. Off until the owner turns it on;
   * encrypted on this Mac. Every value is the owner's preference.
   */
  watch: z.object({
    enabled: z.boolean().default(false),
    everyMinutes: z.number().int().min(1).max(30).default(5),
    keepDays: z.number().int().min(1).max(30).default(7),
    /** Apps (name or bundle id) and title words never noted. A starting list the owner edits. */
    skipApps: z.array(z.string().trim().min(1).max(60)).max(50).default([...SKIP_APPS]),
  }).default(() => ({ enabled: false, everyMinutes: 5, keepDays: 7, skipApps: [...SKIP_APPS] })),
  /** The Grok chat model, from the ones the owner's key can use. */
  grokModel: z.string().trim().max(80).optional(),
  /** Download new versions in the background and offer "Restart to update" (installs on quit too). */
  autoUpdate: z.boolean().default(true),
  onboarded: z.boolean().default(false),
}));
export type Settings = z.infer<typeof Settings>;

const file = () => path.join(app.getPath("userData"), "settings.json");

/** First run: take the name from git, which every developer has set. */
function defaults(): Settings {
  let name = "";
  try { name = execFileSync("git", ["config", "--global", "user.name"], { encoding: "utf8" }).trim(); } catch { /* none */ }
  return Settings.parse({ displayName: name.slice(0, 40) });
}

export function loadSettings(): Settings {
  try { return Settings.parse(JSON.parse(readFileSync(file(), "utf8"))); } catch { return defaults(); }
}

/** Validates, then writes atomically so a crash never leaves half a file. */
export function saveSettings(input: unknown): Settings {
  const s = Settings.parse(input);
  mkdirSync(path.dirname(file()), { recursive: true });
  writeFileSync(`${file()}.tmp`, JSON.stringify(s, null, 2));
  renameSync(`${file()}.tmp`, file());
  return s;
}
