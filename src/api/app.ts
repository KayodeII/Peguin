import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { config } from "../core/config.js";
import { safeEqual } from "../core/crypto.js";
import { query } from "../core/db.js";
import { log } from "../core/log.js";
import { detectPlatform, provider } from "../core/providers/index.js";
import { enqueue, removeScheduleJob, upsertScheduleJob } from "../core/queue.js";
import { redisConnection } from "../core/redis.js";
import * as repo from "../core/repo.js";

const meetingUrl = z.string().url().refine((u) => detectPlatform(u) !== "unknown", "Use a Zoom, Google Meet, Teams or Webex link");
const uuid = z.string().uuid();

const UserIn = z.object({
  name: z.string().min(1), email: z.string().email(),
  aliases: z.array(z.string()).max(10).optional(), timezone: z.string().optional(),
  slackWebhookUrl: z.string().url().optional(), standingNotes: z.string().max(1000).optional(),
});
const IntegrationIn = z.object({ token: z.string().min(1), config: z.record(z.string(), z.any()).default({}) });
const ScheduleIn = z.object({ meetingUrl, cron: z.string().min(9), timezone: z.string().default("UTC") });

export function buildApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  const pub = redisConnection();

  const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

  const auth = (req: Request, res: Response, next: NextFunction) => {
    const key = req.header("x-api-key") ?? "";
    if (!safeEqual(key, config.ADMIN_API_KEY)) return res.status(401).json({ error: "Missing or wrong x-api-key header" });
    next();
  };

  const userOr404 = async (req: Request, res: Response) => {
    const id = uuid.safeParse(req.params.userId);
    const u = id.success ? await repo.getUser(id.data) : undefined;
    if (!u) res.status(404).json({ error: "User not found" });
    return u;
  };

  app.get("/healthz", wrap(async (_req, res) => {
    await query("SELECT 1");
    res.json({ ok: true });
  }));

  // ---------------------------------------------------------------- provider webhooks
  app.post("/webhooks/:provider", wrap(async (req, res) => {
    if (!safeEqual(String(req.query.token ?? ""), config.WEBHOOK_SECRET)) return res.status(401).end();
    const ev = provider(String(req.params.provider)).parseWebhook(req.body);
    res.status(200).end(); // ack fast; providers retry on non-2xx
    if (!ev) return;
    const m = await repo.getMeetingByBot(ev.botId);
    if (!m) return log.warn({ botId: ev.botId }, "webhook for unknown bot");
    log.info({ meetingId: m.id, event: ev.kind, detail: ev.detail }, "bot event");
    if (ev.kind === "joining" || ev.kind === "waiting_room") await repo.setMeetingStatus(m.id, "joining");
    if (ev.kind === "in_call") await repo.setMeetingStatus(m.id, "in_call");
    if (ev.kind === "failed") await repo.setMeetingStatus(m.id, "failed", { error: ev.detail ?? "bot failed" });
    if (ev.kind === "ended") {
      await repo.setMeetingStatus(m.id, "ended");
      // Delay lets the realtime node flush the last transcript lines.
      await enqueue("meeting.recap", { meetingId: m.id }, { jobId: `recap-${m.id}`, delay: 15000 });
    }
  }));

  app.use("/v1", auth);

  // ---------------------------------------------------------------- users
  app.post("/v1/users", wrap(async (req, res) => {
    const u = await repo.createUser(UserIn.parse(req.body));
    res.status(201).json(publicUser(u));
  }));
  app.get("/v1/users/:userId", wrap(async (req, res) => {
    const u = await userOr404(req, res); if (!u) return;
    const ints = await repo.listIntegrations(u.id);
    res.json({ ...publicUser(u), integrations: ints.map((i) => ({ kind: i.kind, config: i.config })) });
  }));
  app.patch("/v1/users/:userId", wrap(async (req, res) => {
    const u = await userOr404(req, res); if (!u) return;
    const body = UserIn.partial().omit({ email: true }).extend({ slackWebhookUrl: z.string().url().nullable().optional() }).parse(req.body);
    res.json(publicUser((await repo.updateUser(u.id, body))!));
  }));

  // ---------------------------------------------------------------- integrations
  app.put("/v1/users/:userId/integrations/:kind", wrap(async (req, res) => {
    const u = await userOr404(req, res); if (!u) return;
    const kind = z.enum(["github", "linear", "jira"]).parse(req.params.kind);
    const body = IntegrationIn.parse(req.body);
    await repo.upsertIntegration(u.id, kind, body.token, body.config);
    res.status(204).end();
  }));
  app.delete("/v1/users/:userId/integrations/:kind", wrap(async (req, res) => {
    const u = await userOr404(req, res); if (!u) return;
    await repo.deleteIntegration(u.id, z.enum(["github", "linear", "jira"]).parse(req.params.kind));
    res.status(204).end();
  }));

  // ---------------------------------------------------------------- schedules
  app.post("/v1/users/:userId/schedules", wrap(async (req, res) => {
    const u = await userOr404(req, res); if (!u) return;
    const body = ScheduleIn.parse(req.body);
    const s = await repo.createSchedule({ userId: u.id, ...body });
    try { await upsertScheduleJob(s); }
    catch (e) { await repo.deleteSchedule(s.id); return res.status(400).json({ error: `Invalid cron or timezone: ${String(e)}` }); }
    res.status(201).json(s);
  }));
  app.get("/v1/users/:userId/schedules", wrap(async (req, res) => {
    const u = await userOr404(req, res); if (!u) return;
    res.json(await repo.listSchedules(u.id));
  }));
  app.delete("/v1/schedules/:id", wrap(async (req, res) => {
    const id = uuid.parse(req.params.id);
    await removeScheduleJob(id);
    await repo.deleteSchedule(id);
    res.status(204).end();
  }));

  // ---------------------------------------------------------------- meetings
  /** Send Peguin to a meeting now: prep the update, then join. */
  app.post("/v1/users/:userId/meetings", wrap(async (req, res) => {
    const u = await userOr404(req, res); if (!u) return;
    const { meetingUrl: url } = z.object({ meetingUrl }).parse(req.body);
    const m = await repo.createMeeting({ userId: u.id, meetingUrl: url, platform: detectPlatform(url), provider: config.BOT_PROVIDER });
    await enqueue("meeting.prep", { meetingId: m.id }, { jobId: `prep-${m.id}` });
    res.status(202).json(m);
  }));
  app.get("/v1/meetings/:id", wrap(async (req, res) => {
    const m = await repo.getMeeting(uuid.parse(req.params.id));
    if (!m) return res.status(404).json({ error: "Meeting not found" });
    res.json({ ...m, transcript: await repo.listUtterances(m.id) });
  }));
  /** Manual override: give the update right now. Reaches the right realtime node via Redis. */
  app.post("/v1/meetings/:id/speak", wrap(async (req, res) => {
    const id = uuid.parse(req.params.id);
    const listeners = await pub.publish(`penguin:cmd:${id}`, JSON.stringify({ type: "give_update" }));
    res.status(listeners ? 202 : 409).json(listeners ? { ok: true } : { error: "Peguin isn't connected to that meeting right now" });
  }));
  app.post("/v1/meetings/:id/leave", wrap(async (req, res) => {
    const m = await repo.getMeeting(uuid.parse(req.params.id));
    if (!m?.bot_id) return res.status(404).json({ error: "No bot for that meeting" });
    await provider(m.provider).leave(m.bot_id);
    res.status(202).json({ ok: true });
  }));

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) return res.status(400).json({ error: "Invalid request", issues: err.issues });
    if (err?.code === "23505") return res.status(409).json({ error: "Already exists" });
    log.error({ err: String(err), stack: err?.stack }, "request failed");
    res.status(500).json({ error: "Something went wrong on Peguin's side. Check the API logs." });
  });

  return app;
}

function publicUser(u: repo.User) {
  const { slack_webhook_enc, ...rest } = u;
  return { ...rest, slackConnected: !!slack_webhook_enc };
}
