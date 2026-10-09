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
});

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
    claude_code: z.boolean().default(true),
  }).default({ git: true, github: true, claude_code: true }),
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
  }).default(() => ({ summarize: true, keepDays: 30 })),
  /** Stop speaking when someone talks over Peguin, and listen to them. */
  stopWhenInterrupted: z.boolean().default(true),
  runHidden: z.boolean().default(true),
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
