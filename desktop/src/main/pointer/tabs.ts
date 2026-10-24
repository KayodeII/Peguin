// Browser tabs (pure): which tabs are open, read through each browser's own
// AppleScript, so the owner's AI can close or switch to "the Gmail tab". Titles
// and addresses only; never page contents. No I/O here: the scripts are run by
// the caller.

export type Tab = { browser: string; w: number; t: number; title: string; url: string; active: boolean };

/** Browsers that answer AppleScript about their tabs: Chrome's family speaks one dialect, Safari another. */
export const CHROMIUM = ["Google Chrome", "Brave Browser", "Microsoft Edge", "Chromium", "Vivaldi"];
export const BROWSERS = [...CHROMIUM, "Safari"];

/** Most tabs listed per browser, so a hoarder's 300 tabs don't swamp the AI's view. */
const MAX_TABS = 60;

/** One line per tab: window, tab, active, title, URL, tab-separated. */
export function listScript(browser: string): string {
  const safari = browser === "Safari";
  // Inside the tell block "tab" means a browser tab, so the separator is spelled out.
  return `set sep to character id 9
tell application ${JSON.stringify(browser)}
  set out to ""
  repeat with wi from 1 to count of windows
    set w to window wi
    set ai to ${safari ? "index of current tab of w" : "active tab index of w"}
    repeat with ti from 1 to count of tabs of w
      set tb to tab ti of w
      set out to out & wi & sep & ti & sep & (ti = ai) & sep & (${safari ? "name" : "title"} of tb) & sep & (URL of tb) & linefeed
    end repeat
  end repeat
  return out
end tell`;
}

export function readTabs(browser: string, out: string): Tab[] {
  return out.split("\n").map((l) => l.split("\t")).filter((f) => f.length >= 5).slice(0, MAX_TABS).map(([w, t, a, title, ...url]) => ({
    browser, w: Number(w), t: Number(t), active: a === "true", title: (title ?? "").replace(/\s+/g, " ").trim(), url: url.join("\t").trim(),
  })).filter((x) => x.w > 0 && x.t > 0);
}

export function closeScript(x: Tab): string {
  return `tell application ${JSON.stringify(x.browser)} to close tab ${x.t} of window ${x.w}`;
}

export function switchScript(x: Tab): string {
  const set = x.browser === "Safari" ? `set current tab of window ${x.w} to tab ${x.t} of window ${x.w}` : `set active tab index of window ${x.w} to ${x.t}`;
  return `tell application ${JSON.stringify(x.browser)}
  ${set}
  set index of window ${x.w} to 1
  activate
end tell`;
}

/** "mail.google.com" from a URL; the full address isn't needed to tell tabs apart. */
export const site = (url: string) => url.replace(/^[a-z]+:\/\//i, "").replace(/^www\./, "").split(/[/?#]/)[0] ?? "";
