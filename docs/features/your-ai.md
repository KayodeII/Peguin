# Your AI: Claude, Codex or Grok

Every draft, live answer, copilot suggestion and recap summary runs on the user's own AI, chosen in **Settings > AI**: Claude (their Claude Code sign-in, default), Codex (their ChatGPT sign-in through the Codex CLI) or Grok (their xAI API key, sealed with the Keychain). Peguin's server never pays for it; its old AI routes answer 503. Peguin's own Anthropic key only serves the website help chat.

## Decisions

- 2026-10-09: Work without server-side AI
- 2026-10-10: The copilot answers general questions, interviews included (Codex option)
- 2026-10-10: Every user's own AI; Grok as an alternative standard voice

## Files

| Path | Role |
|---|---|
| `desktop/src/main/brain.ts` | One `generate()` routing to `claude -p`, `codex exec` or xAI; web search variants for Check online |
| `desktop/src/main/xai.ts` | xAI key storage (`xai.sealed`), model list, chat, web search, speech |
| `desktop/src/main/sealed.ts` | Keychain-sealed files |
| `desktop/src/main/settings.ts` | `ai`, `grokModel` |
| `desktop/src/renderer/ai.tsx` | Settings > AI: the choice, xAI key, Grok model |
| `desktop/src/main/index.ts` | IPC `xai:status|connect|disconnect` |
| `cloud/src/claude.ts` | `ownAiOnly()` (503) for `/api/draft|answer|suggest|recap`; `ask()` for the help chat |
| `cloud/migrations/0006_drop_usage.sql` | Removed the per-day usage table |
| `web/src/pages/Legal.tsx`, `web/src/faq.ts` | Whose AI runs, in the Privacy Policy and FAQ |

## Tests

`test/xai.test.ts`, `test/cloud.test.ts` ("the app's AI is each user's own", "help chat without Claude").
