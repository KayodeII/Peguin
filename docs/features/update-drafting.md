# Drafting the update

Before the meeting Peguin gathers what the owner worked on since the previous workday and drafts a short spoken update plus a list of facts. Follow-up answers in the meeting may only use those facts.

Desktop sources (Sources page, four boxes): **Code** — local git commits and PRs through GitHub CLI (`gh auth login` from Connect); **Tickets** — Linear and Jira issues assigned to the owner (Connect opens their site, one API key paste, sealed in the Keychain); **Sessions** — opt-in prompts from Claude Code, Codex, Cursor, Gemini CLI, Copilot CLI, Continue and DeepSeek (never code or model output); **This Mac** — opt-in work log of the front app and window title. The draft prompt treats work-log lines as where time went, never as facts or finished work. The server stack has GitHub, Linear and Jira sources.

## Decisions

- 2026-10-06: Prepare and pre-synthesize the update
- 2026-10-07: Product shape (connections; the LLM drafts and answers from facts)
- 2026-10-08: Speaking in the owner's own voice (prompts write for the ear)
- 2026-10-10: Every user's own AI
- 2026-10-20: Work log and Learn my voice (opt-in, reviewed by the owner)
- 2026-10-26: Linear and Jira on the desktop with the owner's own API keys

## Files

| Path | Role |
|---|---|
| `desktop/src/main/context/index.ts` | Collects activity from the enabled sources |
| `desktop/src/main/context/git.ts` | Commits by the owner across local repos |
| `desktop/src/main/context/github.ts` | PRs opened or reviewed, via `gh` |
| `desktop/src/main/context/claudeCode.ts` | The owner's prompts from Claude Code session files (opt-in) |
| `desktop/src/main/context/sessions.ts` | Codex, Cursor, Gemini, Copilot, Continue, DeepSeek session prompts (opt-in) |
| `desktop/src/main/context/trackers.ts` | Linear and Jira issues (reusing `src/core/sources/linear.ts`, `jira.ts`), key checks, Jira site address |
| `desktop/src/main/context/githubAuth.ts` | Sources > GitHub Connect/Disconnect via `gh` |
| `desktop/src/main/trackerKeys.ts` | The sealed keys (`trackers.sealed`) and which tracker sources are on |
| `desktop/src/renderer/views.tsx` (`SourcesView`), `trackers.tsx`, `worklog.tsx` | Sources UI: Code / Tickets / Sessions / This Mac app boxes |
| `desktop/src/renderer/trackers.tsx` | Sources > Linear and Jira |
| `desktop/src/main/context/exec.ts`, `types.ts` | Helpers and types |
| `desktop/src/main/watch/summary.ts` | Work log (pure): title clean-up, skip list, time per window, pruning |
| `desktop/src/main/watch/index.ts` | `WorkLog` (a glance every few minutes through `pointer-helper front`), the encrypted log, the `mac` source |
| `desktop/src/renderer/worklog.tsx` | Sources > On this Mac |
| `desktop/src/main/brain.ts` | `draft` through the owner's AI |
| `src/core/brain/prompts.ts` | Draft prompt and facts format |
| `desktop/src/renderer/views.tsx` | Preparing and editing the update |
| `src/core/sources/` | Server stack: `github.ts`, `linear.ts`, `jira.ts`, `previousWorkdayStart` in `types.ts` |

## Tests

`test/desktop.test.ts` ("Claude Code sessions"), `test/trackers.test.ts` (Linear and Jira), `test/worklog.test.ts` ("work log"), `test/core.test.ts` (`previousWorkdayStart`).
