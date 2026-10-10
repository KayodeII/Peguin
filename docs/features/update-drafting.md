# Drafting the update

Before the meeting Peguin gathers what the owner worked on since the previous workday and drafts a short spoken update plus a list of facts. Follow-up answers in the meeting may only use those facts.

Desktop sources need no extra logins: local git commits, PRs through the GitHub CLI's existing login, and (opt-in) the owner's own prompts from Claude Code sessions. The server stack has GitHub, Linear and Jira sources.

## Decisions

- 2026-10-06: Prepare and pre-synthesize the update
- 2026-10-07: Product shape (connections; the LLM drafts and answers from facts)
- 2026-10-08: Speaking in the owner's own voice (prompts write for the ear)
- 2026-10-10: Every user's own AI

## Files

| Path | Role |
|---|---|
| `desktop/src/main/context/index.ts` | Collects activity from the enabled sources |
| `desktop/src/main/context/git.ts` | Commits by the owner across local repos |
| `desktop/src/main/context/github.ts` | PRs opened or reviewed, via `gh` |
| `desktop/src/main/context/claudeCode.ts` | The owner's prompts from Claude Code session files (opt-in) |
| `desktop/src/main/context/exec.ts`, `types.ts` | Helpers and types |
| `desktop/src/main/brain.ts` | `draft` through the owner's AI |
| `src/core/brain/prompts.ts` | Draft prompt and facts format |
| `desktop/src/renderer/views.tsx` | Preparing and editing the update |
| `src/core/sources/` | Server stack: `github.ts`, `linear.ts`, `jira.ts`, `previousWorkdayStart` in `types.ts` |

## Tests

`test/desktop.test.ts` ("Claude Code sessions"), `test/core.test.ts` (`previousWorkdayStart`).
