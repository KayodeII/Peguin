# Drafting the update

Before the meeting Peguin gathers what the owner worked on since the previous workday and drafts a short spoken update plus a list of facts. Follow-up answers in the meeting may only use those facts.

Desktop sources need no extra logins: local git commits, PRs through the GitHub CLI's existing login, (opt-in) the owner's own prompts from Claude Code sessions, and (opt-in, off by default) the work log "On this Mac": every few minutes the app in front and its window title, encrypted on the Mac, summarised into time per window. The draft prompt treats those lines as where time went, never as facts or finished work. The server stack has GitHub, Linear and Jira sources.

## Decisions

- 2026-10-06: Prepare and pre-synthesize the update
- 2026-10-07: Product shape (connections; the LLM drafts and answers from facts)
- 2026-10-08: Speaking in the owner's own voice (prompts write for the ear)
- 2026-10-10: Every user's own AI
- 2026-10-20: Work log and Learn my voice (opt-in, reviewed by the owner)

## Files

| Path | Role |
|---|---|
| `desktop/src/main/context/index.ts` | Collects activity from the enabled sources |
| `desktop/src/main/context/git.ts` | Commits by the owner across local repos |
| `desktop/src/main/context/github.ts` | PRs opened or reviewed, via `gh` |
| `desktop/src/main/context/claudeCode.ts` | The owner's prompts from Claude Code session files (opt-in) |
| `desktop/src/main/context/exec.ts`, `types.ts` | Helpers and types |
| `desktop/src/main/watch/summary.ts` | Work log (pure): title clean-up, skip list, time per window, pruning |
| `desktop/src/main/watch/index.ts` | `WorkLog` (a glance every few minutes through `pointer-helper front`), the encrypted log, the `mac` source |
| `desktop/src/renderer/worklog.tsx` | Sources > On this Mac |
| `desktop/src/main/brain.ts` | `draft` through the owner's AI |
| `src/core/brain/prompts.ts` | Draft prompt and facts format |
| `desktop/src/renderer/views.tsx` | Preparing and editing the update |
| `src/core/sources/` | Server stack: `github.ts`, `linear.ts`, `jira.ts`, `previousWorkdayStart` in `types.ts` |

## Tests

`test/desktop.test.ts` ("Claude Code sessions"), `test/worklog.test.ts` ("work log"), `test/core.test.ts` (`previousWorkdayStart`).
