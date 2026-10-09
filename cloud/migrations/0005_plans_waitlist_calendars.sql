-- Plans: Free, Basic, Pro and Team. Before this there was one paid plan,
-- which included everything Pro does.
ALTER TABLE subscriptions ADD COLUMN plan TEXT;
UPDATE subscriptions SET plan = 'pro' WHERE plan IS NULL;

-- People waiting for an invite while sign-ups are closed (SIGNUPS = "waitlist").
CREATE TABLE waitlist (
  email       TEXT PRIMARY KEY,
  plan        TEXT,
  source      TEXT,
  created_at  INTEGER NOT NULL,
  invited_at  INTEGER
);
CREATE INDEX waitlist_created ON waitlist(created_at);

-- One-time hand-off of a calendar connection to the desktop app, bound to a
-- PKCE challenge. The tokens are encrypted with a key derived from the code,
-- which only the app receives (only its hash is stored), and the row is
-- deleted when the app collects it.
CREATE TABLE calendar_codes (
  code_hash   TEXT PRIMARY KEY,
  challenge   TEXT NOT NULL,
  sealed      TEXT NOT NULL,
  expires_at  INTEGER NOT NULL
);
