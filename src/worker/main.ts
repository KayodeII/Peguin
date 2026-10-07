process.env.PENGUIN_SERVICE = "worker";
import { Worker, type Job } from "bullmq";
import { draftStandup, summarizeMeeting } from "../core/brain/claude.js";
import { postToSlack } from "../core/brain/slack.js";
import { config } from "../core/config.js";
import { pool } from "../core/db.js";
import { log } from "../core/log.js";
import { sendBot } from "../core/meetings.js";
import { detectPlatform } from "../core/providers/index.js";
import { enqueue, QUEUE, upsertScheduleJob, type JobData, type JobName } from "../core/queue.js";
import { redisConnection } from "../core/redis.js";
import * as repo from "../core/repo.js";
import { gatherActivity, previousWorkdayStart } from "../core/sources/index.js";

const handlers: { [N in JobName]: (data: JobData[N], job: Job) => Promise<unknown> } = {
  async "schedule.fire"({ scheduleId }) {
    const s = await repo.getSchedule(scheduleId);
    if (!s?.enabled) return;
    const m = await repo.createMeeting({
      userId: s.user_id, scheduleId: s.id, meetingUrl: s.meeting_url,
      platform: detectPlatform(s.meeting_url), provider: config.BOT_PROVIDER,
    });
    await enqueue("meeting.prep", { meetingId: m.id }, { jobId: `prep-${m.id}` });
  },

  async "meeting.prep"({ meetingId }, job) {
    const m = await repo.getMeeting(meetingId);
    if (!m || m.status !== "scheduled" && m.status !== "preparing") return;
    const u = (await repo.getUser(m.user_id))!;
    await repo.setMeetingStatus(m.id, "preparing");
    try {
      const since = previousWorkdayStart(new Date(), u.timezone);
      const { items, failed } = await gatherActivity(await repo.listIntegrations(u.id), since);
      await repo.setMeetingDraft(m.id, await draftStandup(u, items, failed));
    } catch (e) {
      // Still join on the last attempt: Peguin falls back to the standing notes.
      if (job.attemptsMade + 1 < (job.opts.attempts ?? 1)) throw e;
      log.error({ meetingId, err: String(e) }, "prep failed; joining with fallback update");
    }
    await enqueue("meeting.join", { meetingId: m.id }, { jobId: `join-${m.id}` });
  },

  async "meeting.join"({ meetingId }) {
    const m = await repo.getMeeting(meetingId);
    if (!m || m.bot_id || m.status === "ended" || m.status === "failed") return; // idempotent
    const u = (await repo.getUser(m.user_id))!;
    try {
      const { botId } = await sendBot(m, u);
      await repo.setMeetingBot(m.id, botId);
      await repo.setMeetingStatus(m.id, "joining");
    } catch (e) {
      await repo.setMeetingStatus(m.id, "failed", { error: String(e) });
      throw e;
    }
  },

  async "meeting.recap"({ meetingId }) {
    const m = await repo.getMeeting(meetingId);
    if (!m || m.recap) return;
    const u = (await repo.getUser(m.user_id))!;
    const transcript = await repo.listUtterances(m.id);
    const recap = await summarizeMeeting(u, transcript);
    await repo.setMeetingRecap(m.id, recap);
    const hook = repo.slackWebhook(u);
    if (hook) {
      const gave = m.update_given_at ? "Peguin gave your update." : "Peguin wasn't called on, so it didn't give your update.";
      await postToSlack(hook, `*Standup recap* (${m.platform.replace("_", " ")})\n${gave}\n\n${recap}`);
    }
  },
};

const worker = new Worker(
  QUEUE,
  async (job) => {
    const h = handlers[job.name as JobName] as ((d: unknown, j: Job) => Promise<unknown>) | undefined;
    if (!h) throw new Error(`No handler for job ${job.name}`);
    return h(job.data, job);
  },
  { connection: redisConnection(), concurrency: config.WORKER_CONCURRENCY },
);

worker.on("failed", (job, err) => log.error({ job: job?.name, id: job?.id, attempts: job?.attemptsMade, err: err.message }, "job failed"));
worker.on("completed", (job) => log.debug({ job: job.name, id: job.id }, "job done"));

// Reconcile schedules on boot so Redis always matches Postgres (e.g. after a Redis flush).
const schedules = await repo.listEnabledSchedules();
await Promise.all(schedules.map((s) => upsertScheduleJob(s).catch((e) => log.error({ scheduleId: s.id, err: String(e) }, "bad schedule"))));
log.info({ schedules: schedules.length, concurrency: config.WORKER_CONCURRENCY }, "worker started");

async function shutdown() {
  await worker.close(); // finishes in-flight jobs
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
