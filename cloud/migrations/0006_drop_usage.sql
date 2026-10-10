-- The app runs on each user's own AI now (Claude Code, Codex or an xAI key),
-- so the server no longer counts daily AI use. Nothing reads this table.
DROP TABLE IF EXISTS usage;
