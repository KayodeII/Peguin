import { one, query } from "./db.js";
import { decrypt, encrypt } from "./crypto.js";

export type User = {
  id: string; name: string; email: string; aliases: string[]; timezone: string;
  slack_webhook_enc: string | null; standing_notes: string;
};
export type IntegrationKind = "github" | "linear" | "jira";
export type Integration = { kind: IntegrationKind; token: string; config: Record<string, any> };
export type MeetingStatus = "scheduled" | "preparing" | "joining" | "in_call" | "ended" | "failed";
export type StandupDraft = {
  script: string;          // what Penguin says when called on (~30-45s spoken)
  facts: string[];         // grounded bullet facts for answering follow-ups
  generated_at: string;
};
export type Meeting = {
  id: string; user_id: string; schedule_id: string | null; meeting_url: string; platform: string;
  provider: string; bot_id: string | null; status: MeetingStatus; draft: StandupDraft | null;
  update_given_at: string | null; recap: string | null; error: string | null;
  started_at: string | null; ended_at: string | null; created_at: string;
};
export type Utterance = { speaker: string | null; text: string; is_bot: boolean; at: Date };

// ---------------------------------------------------------------- users
export async function createUser(u: { name: string; email: string; aliases?: string[]; timezone?: string; slackWebhookUrl?: string; standingNotes?: string }): Promise<User> {
  return (await one<User>(
    `INSERT INTO users (name, email, aliases, timezone, slack_webhook_enc, standing_notes)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [u.name, u.email, u.aliases ?? [], u.timezone ?? "UTC", u.slackWebhookUrl ? encrypt(u.slackWebhookUrl) : null, u.standingNotes ?? ""],
  ))!;
}

export async function updateUser(id: string, u: { name?: string; aliases?: string[]; timezone?: string; slackWebhookUrl?: string | null; standingNotes?: string }): Promise<User | undefined> {
  return one<User>(
    `UPDATE users SET
       name = COALESCE($2, name), aliases = COALESCE($3, aliases), timezone = COALESCE($4, timezone),
       slack_webhook_enc = CASE WHEN $5::boolean THEN $6 ELSE slack_webhook_enc END,
       standing_notes = COALESCE($7, standing_notes)
     WHERE id = $1 RETURNING *`,
    [id, u.name ?? null, u.aliases ?? null, u.timezone ?? null, u.slackWebhookUrl !== undefined,
     u.slackWebhookUrl ? encrypt(u.slackWebhookUrl) : null, u.standingNotes ?? null],
  );
}

export const getUser = (id: string) => one<User>("SELECT * FROM users WHERE id = $1", [id]);
export const slackWebhook = (u: User) => (u.slack_webhook_enc ? decrypt(u.slack_webhook_enc) : null);

// ---------------------------------------------------------------- integrations
export async function upsertIntegration(userId: string, kind: IntegrationKind, token: string, cfg: Record<string, any>) {
  await query(
    `INSERT INTO integrations (user_id, kind, token_enc, config) VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, kind) DO UPDATE SET token_enc = EXCLUDED.token_enc, config = EXCLUDED.config, updated_at = now()`,
    [userId, kind, encrypt(token), cfg],
  );
}

export async function listIntegrations(userId: string): Promise<Integration[]> {
  const rows = await query("SELECT kind, token_enc, config FROM integrations WHERE user_id = $1", [userId]);
  return rows.map((r) => ({ kind: r.kind, token: decrypt(r.token_enc), config: r.config }));
}

export const deleteIntegration = (userId: string, kind: IntegrationKind) =>
  query("DELETE FROM integrations WHERE user_id = $1 AND kind = $2", [userId, kind]);

// ---------------------------------------------------------------- schedules
export type Schedule = { id: string; user_id: string; meeting_url: string; cron: string; timezone: string; enabled: boolean };
export const createSchedule = async (s: { userId: string; meetingUrl: string; cron: string; timezone: string }) =>
  (await one<Schedule>(
    "INSERT INTO schedules (user_id, meeting_url, cron, timezone) VALUES ($1,$2,$3,$4) RETURNING *",
    [s.userId, s.meetingUrl, s.cron, s.timezone],
  ))!;
export const getSchedule = (id: string) => one<Schedule>("SELECT * FROM schedules WHERE id = $1", [id]);
export const listSchedules = (userId: string) => query<Schedule>("SELECT * FROM schedules WHERE user_id = $1 ORDER BY created_at", [userId]);
export const listEnabledSchedules = () => query<Schedule>("SELECT * FROM schedules WHERE enabled");
export const deleteSchedule = (id: string) => query("DELETE FROM schedules WHERE id = $1", [id]);

// ---------------------------------------------------------------- meetings
export async function createMeeting(m: { userId: string; scheduleId?: string; meetingUrl: string; platform: string; provider: string }): Promise<Meeting> {
  return (await one<Meeting>(
    `INSERT INTO meetings (user_id, schedule_id, meeting_url, platform, provider) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [m.userId, m.scheduleId ?? null, m.meetingUrl, m.platform, m.provider],
  ))!;
}
export const getMeeting = (id: string) => one<Meeting>("SELECT * FROM meetings WHERE id = $1", [id]);
export const getMeetingByBot = (botId: string) => one<Meeting>("SELECT * FROM meetings WHERE bot_id = $1", [botId]);

export async function setMeetingStatus(id: string, status: MeetingStatus, extra: { error?: string } = {}) {
  // Never move a finished meeting backwards (webhooks can arrive out of order).
  await query(
    `UPDATE meetings SET status = $2, error = COALESCE($3, error),
       started_at = CASE WHEN $2 = 'in_call' AND started_at IS NULL THEN now() ELSE started_at END,
       ended_at   = CASE WHEN $2 IN ('ended','failed') AND ended_at IS NULL THEN now() ELSE ended_at END
     WHERE id = $1 AND status NOT IN ('ended','failed')`,
    [id, status, extra.error ?? null],
  );
}
export const setMeetingBot = (id: string, botId: string) => query("UPDATE meetings SET bot_id = $2 WHERE id = $1", [id, botId]);
export const setMeetingDraft = (id: string, draft: StandupDraft) => query("UPDATE meetings SET draft = $2 WHERE id = $1", [id, draft]);
export const markUpdateGiven = (id: string) => query("UPDATE meetings SET update_given_at = now() WHERE id = $1 AND update_given_at IS NULL", [id]);
export const setMeetingRecap = (id: string, recap: string) => query("UPDATE meetings SET recap = $2 WHERE id = $1", [id, recap]);

// ---------------------------------------------------------------- utterances
export async function insertUtterances(meetingId: string, items: Utterance[]) {
  if (!items.length) return;
  const vals: unknown[] = [];
  const rows = items.map((u, i) => {
    vals.push(meetingId, u.speaker, u.text, u.is_bot, u.at);
    const b = i * 5;
    return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`;
  });
  await query(`INSERT INTO utterances (meeting_id, speaker, text, is_bot, at) VALUES ${rows.join(",")}`, vals);
}
export const listUtterances = (meetingId: string) =>
  query<Utterance>("SELECT speaker, text, is_bot, at FROM utterances WHERE meeting_id = $1 ORDER BY at, id", [meetingId]);
