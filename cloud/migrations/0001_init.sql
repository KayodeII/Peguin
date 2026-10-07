CREATE TABLE users (
  id                  TEXT PRIMARY KEY,
  email               TEXT NOT NULL UNIQUE,
  name                TEXT,
  google_sub          TEXT UNIQUE,
  stripe_customer_id  TEXT UNIQUE,
  created_at          INTEGER NOT NULL
);

-- Browser sessions. Only hashes of tokens are stored.
CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE magic_links (
  token_hash  TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  next        TEXT,
  expires_at  INTEGER NOT NULL,
  used_at     INTEGER
);

-- One-time codes handed to the desktop app via penguin://, bound to a PKCE challenge.
CREATE TABLE app_codes (
  code_hash   TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge   TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  used_at     INTEGER
);

-- Long-lived desktop app tokens.
CREATE TABLE app_tokens (
  token_hash    TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label         TEXT,
  created_at    INTEGER NOT NULL,
  last_used_at  INTEGER,
  revoked_at    INTEGER
);
CREATE INDEX app_tokens_user ON app_tokens(user_id);

CREATE TABLE subscriptions (
  user_id                 TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id  TEXT UNIQUE,
  status                  TEXT NOT NULL,
  current_period_end      INTEGER,
  updated_at              INTEGER NOT NULL
);

-- Stripe retries webhooks; each event is applied once.
CREATE TABLE stripe_events (
  id           TEXT PRIMARY KEY,
  received_at  INTEGER NOT NULL
);

CREATE TABLE usage (
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day      TEXT NOT NULL,
  kind     TEXT NOT NULL,
  count    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, kind)
);
