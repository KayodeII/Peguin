import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp/peguin-test", isPackaged: true, getAppPath: () => "/tmp" },
  BrowserWindow: class {}, WebContentsView: class {},
  ipcMain: { on: () => {}, removeListener: () => {} },
  safeStorage: { isEncryptionAvailable: () => false },
}));

const { CopilotSession } = await import("../desktop/src/main/copilot/session.js");
const { Settings } = await import("../desktop/src/main/settings.js");

type Card = { id: number; question: string; answer?: string; error?: string };

describe("copilot suggestions", () => {
  it("answers questions in order and never leaves one stuck thinking", async () => {
    const asked: string[] = [];
    const session = new CopilotSession("https://meet.google.com/abc-defg-hij", Settings.parse({ displayName: "Ada" }), { url: "", stop: () => {} },
      {
        draft: null,
        suggest: async (q: string) => { asked.push(q); await new Promise((r) => setTimeout(r, 5)); return `General knowledge: about ${q}`; },
        online: () => null,
      },
      { file: "" }, () => {});
    const heard = (t: string) => (session as unknown as { heard: (t: string) => void }).heard(t);
    for (const q of ["What is a mutex?", "What is a semaphore?", "What is a deadlock?", "What is a livelock?", "What is starvation?"]) heard(q);
    await vi.waitFor(() => expect(asked.length).toBe(4), { timeout: 2000 });
    await new Promise((r) => setTimeout(r, 20));
    const cards = session.state().cards as Card[];
    expect(cards).toHaveLength(5);
    expect(cards.every((c) => c.answer || c.error)).toBe(true);
    // The first is answered at once; of the four that waited, only the oldest was dropped.
    expect(asked).toEqual(["What is a mutex?", "What is a deadlock?", "What is a livelock?", "What is starvation?"]);
    expect(cards.find((c) => c.question === "What is a semaphore?")?.error).toContain("Skipped");
  });
});
