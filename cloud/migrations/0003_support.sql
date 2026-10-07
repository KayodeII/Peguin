-- Messages sent to the team from the help chat on the website.
CREATE TABLE support_messages (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  message     TEXT NOT NULL,
  transcript  TEXT,
  page        TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX support_messages_created ON support_messages(created_at);

-- Daily counters for anonymous endpoints, keyed by a hash of the client IP.
CREATE TABLE rate_limits (
  key    TEXT NOT NULL,
  day    TEXT NOT NULL,
  kind   TEXT NOT NULL,
  count  INTEGER NOT NULL,
  PRIMARY KEY (key, day, kind)
);
