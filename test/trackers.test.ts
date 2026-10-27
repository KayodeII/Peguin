import { afterEach, describe, expect, it, vi } from "vitest";
import { checkJira, checkLinear, jiraActivity, jiraSite, linearActivity } from "../desktop/src/main/context/trackers.js";

const since = new Date("2026-10-23T00:00:00Z");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("Jira site", () => {
  it("takes a name, a host or any page on the site", () => {
    expect(jiraSite("acme")).toBe("https://acme.atlassian.net");
    expect(jiraSite(" acme.atlassian.net/ ")).toBe("https://acme.atlassian.net");
    expect(jiraSite("https://acme.atlassian.net/jira/software/projects/ENG/boards/1")).toBe("https://acme.atlassian.net");
  });
  it("never sends a token over plain http", () => {
    expect(() => jiraSite("http://acme.atlassian.net")).toThrow(/https/);
    expect(() => jiraSite("")).toThrow(/Jira site/);
  });
});

describe("Linear and Jira issues", () => {
  it("turns Linear's assigned issues into activity, done ones marked", async () => {
    const fetcher = vi.fn(async () => json({ data: { viewer: { assignedIssues: { nodes: [
      { identifier: "ENG-12", title: "Retry payment webhooks", url: "https://linear.app/x", updatedAt: "2026-10-23T10:00:00Z", completedAt: "2026-10-23T11:00:00Z", state: { name: "Done" } },
      { identifier: "ENG-14", title: "Export invoices", updatedAt: "2026-10-23T12:00:00Z", completedAt: null, state: { name: "In Progress" } },
    ] } } } }));
    vi.stubGlobal("fetch", fetcher);
    const r = await linearActivity({ apiKey: "lin_api_x", who: "Ada" })(since);
    expect(r.activity).toEqual([
      { source: "linear", kind: "issue_done", title: "ENG-12 Retry payment webhooks", status: "Done", at: "2026-10-23T11:00:00Z", project: "ENG" },
      { source: "linear", kind: "issue", title: "ENG-14 Export invoices", status: "In Progress", at: "2026-10-23T12:00:00Z", project: "ENG" },
    ]);
    expect(r.report).toMatchObject({ id: "linear", ok: true, summary: "2 issues, 1 done" });
    expect((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({ Authorization: "lin_api_x" });
  });

  it("asks Jira for the owner's issues on their own site", async () => {
    const fetcher = vi.fn(async () => json({ issues: [{ key: "OPS-3", fields: { summary: "Rotate keys", status: { name: "To Do" }, updated: "2026-10-23T09:00:00Z", resolutiondate: null } }] }));
    vi.stubGlobal("fetch", fetcher);
    const r = await jiraActivity({ site: "https://acme.atlassian.net", email: "ada@acme.com", token: "t", who: "Ada" })(since);
    expect(r.activity).toEqual([{ source: "jira", kind: "issue", title: "OPS-3 Rotate keys", status: "To Do", at: "2026-10-23T09:00:00Z", project: "OPS" }]);
    expect((fetcher.mock.calls[0] as unknown as [string])[0]).toBe("https://acme.atlassian.net/rest/api/3/search/jql");
  });

  it("says how to fix a key that stopped working, without failing the draft", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unauthorized", { status: 401 })));
    const r = await linearActivity({ apiKey: "old", who: "Ada" })(since);
    expect(r.activity).toEqual([]);
    expect(r.report).toMatchObject({ ok: false, summary: "Linear didn't accept your API key" });
    expect(r.report.hint).toMatch(/connect Linear again/);
  });
});

describe("connecting", () => {
  it("checks a Linear key and says whose it is", async () => {
    expect(await checkLinear("k", async () => json({ data: { viewer: { name: "Ada Obi" } } }))).toBe("Ada Obi");
    await expect(checkLinear("bad", async () => json({ errors: [{ message: "auth" }] }, 400))).rejects.toThrow(/didn't accept/);
  });
  it("checks Jira credentials and explains a wrong site or token", async () => {
    expect(await checkJira("https://acme.atlassian.net", "ada@acme.com", "t", async () => json({ displayName: "Ada Obi" }))).toBe("Ada Obi");
    await expect(checkJira("https://acme.atlassian.net", "ada@acme.com", "bad", async () => new Response("", { status: 401 }))).rejects.toThrow(/API token/);
    await expect(checkJira("https://example.com", "ada@acme.com", "t", async () => new Response("", { status: 404 }))).rejects.toThrow(/doesn't look like a Jira site/);
    await expect(checkJira("https://nowhere.invalid", "a@b.c", "t", async () => { throw new TypeError("fetch failed"); })).rejects.toThrow(/Couldn't reach/);
  });
});
