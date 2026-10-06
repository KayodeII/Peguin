import { Queue } from "bullmq";
import { redisConnection } from "./redis.js";

/** One queue, typed job names. Workers scale horizontally; BullMQ guarantees
 *  each job is processed by exactly one worker. */
export const QUEUE = "penguin";

export type JobData = {
  /** Fired by a schedule: create a meeting row, then prep + join. */
  "schedule.fire": { scheduleId: string };
  /** Gather the user's activity and draft their standup update. */
  "meeting.prep": { meetingId: string };
  /** Ask the provider to send a bot into the call. */
  "meeting.join": { meetingId: string };
  /** After the call: summarise and post to Slack. */
  "meeting.recap": { meetingId: string };
};
export type JobName = keyof JobData;

let q: Queue | undefined;
export function queue(): Queue {
  q ??= new Queue(QUEUE, {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { age: 7 * 24 * 3600, count: 10000 },
      removeOnFail: { age: 30 * 24 * 3600 },
    },
  });
  return q;
}

export function enqueue<N extends JobName>(name: N, data: JobData[N], opts: { jobId?: string; delay?: number } = {}) {
  return queue().add(name, data, opts);
}

/** Recurring standups are BullMQ job schedulers keyed by schedule id, so
 *  upserting is idempotent and survives worker restarts. */
export async function upsertScheduleJob(s: { id: string; cron: string; timezone: string; enabled: boolean }) {
  const key = `schedule-${s.id}`;
  if (!s.enabled) return queue().removeJobScheduler(key);
  return queue().upsertJobScheduler(key, { pattern: s.cron, tz: s.timezone }, {
    name: "schedule.fire", data: { scheduleId: s.id } satisfies JobData["schedule.fire"],
  });
}
export const removeScheduleJob = (id: string) => queue().removeJobScheduler(`schedule-${id}`);
