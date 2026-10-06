CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  email         text NOT NULL UNIQUE,
  -- Other ways people say this person's name (nicknames, how speech-to-text mishears it)
  aliases       text[] NOT NULL DEFAULT '{}',
  timezone      text NOT NULL DEFAULT 'UTC',
  slack_webhook_enc text,
  -- Free-form notes the user wants mentioned (e.g. "OOO Friday")
  standing_notes text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE integrations (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('github', 'linear', 'jira')),
  token_enc  text NOT NULL,
  config     jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind)
);

CREATE TABLE schedules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  meeting_url text NOT NULL,
  -- When Penguin should start (prep + join). Set it 1-2 minutes before the standup.
  cron        text NOT NULL,
  timezone    text NOT NULL DEFAULT 'UTC',
  enabled     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE meetings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schedule_id  uuid REFERENCES schedules(id) ON DELETE SET NULL,
  meeting_url  text NOT NULL,
  platform     text NOT NULL,
  provider     text NOT NULL,
  bot_id       text UNIQUE,
  status       text NOT NULL DEFAULT 'scheduled'
               CHECK (status IN ('scheduled', 'preparing', 'joining', 'in_call', 'ended', 'failed')),
  draft        jsonb,
  update_given_at timestamptz,
  recap        text,
  error        text,
  started_at   timestamptz,
  ended_at     timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX meetings_user_created ON meetings (user_id, created_at DESC);

CREATE TABLE utterances (
  id         bigserial PRIMARY KEY,
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  speaker    text,
  text       text NOT NULL,
  is_bot     boolean NOT NULL DEFAULT false,
  at         timestamptz NOT NULL
);
CREATE INDEX utterances_meeting_at ON utterances (meeting_id, at);
