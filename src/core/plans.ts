// The plans and what each one includes, shared by the cloud (which enforces
// the daily AI limits and signs the plan into the licence), the website (which
// shows the table) and the desktop app (which gates features from the licence).
// Prices aren't here: each paid plan's price is whatever its Paystack plan charges.

export const PLAN_IDS = ["free", "basic", "pro", "team"] as const;
export type PlanId = (typeof PLAN_IDS)[number];
export const PAID_PLANS = ["basic", "pro", "team"] as const satisfies readonly PlanId[];
export type PaidPlanId = (typeof PAID_PLANS)[number];

export type Features = {
  /** Standups Peguin attends per week (Monday to Sunday); null is unlimited. */
  standupsPerWeek: number | null;
  /** Answers follow-up questions from the prepared facts. Without it Peguin defers every question to the owner. */
  followUps: boolean;
  /** Private recap after each meeting. */
  recaps: boolean;
  /** Speaks in the owner's own voice instead of a standard one. */
  ownVoice: boolean;
  /** Private copilot: the owner's own meeting in Peguin's window, with suggested answers only they see. */
  copilot: boolean;
  /** One bill for several people. */
  seats: boolean;
};

export type PlanInfo = { id: PlanId; name: string; blurb: string; features: Features };

export const PLANS: Record<PlanId, PlanInfo> = {
  free: {
    id: "free", name: "Free", blurb: "Try it on a few standups a week.",
    features: { standupsPerWeek: 3, followUps: false, recaps: false, ownVoice: false, copilot: false, seats: false },
  },
  basic: {
    id: "basic", name: "Basic", blurb: "Every standup, with follow-up answers.",
    features: { standupsPerWeek: null, followUps: true, recaps: false, ownVoice: false, copilot: false, seats: false },
  },
  pro: {
    id: "pro", name: "Pro", blurb: "Your own voice and a recap after every call.",
    features: { standupsPerWeek: null, followUps: true, recaps: true, ownVoice: true, copilot: true, seats: false },
  },
  team: {
    id: "team", name: "Team", blurb: "Pro for everyone on the team, on one bill.",
    features: { standupsPerWeek: null, followUps: true, recaps: true, ownVoice: true, copilot: true, seats: true },
  },
};

/** The plan trial accounts get. */
export const TRIAL_PLAN: PlanId = "pro";

export const isPlanId = (v: unknown): v is PlanId => typeof v === "string" && (PLAN_IDS as readonly string[]).includes(v);
export const isPaidPlan = (v: unknown): v is PaidPlanId => typeof v === "string" && (PAID_PLANS as readonly string[]).includes(v);

/** Rows for the comparison table, in display order. */
export const FEATURE_ROWS: { label: string; value: (f: Features) => string | boolean }[] = [
  { label: "Standups per week", value: (f) => (f.standupsPerWeek === null ? "Unlimited" : String(f.standupsPerWeek)) },
  { label: "Update written from your commits and tickets", value: () => true },
  { label: "Finds standups in your calendars", value: () => true },
  { label: "Answers follow-up questions", value: (f) => f.followUps },
  { label: "Recap after every meeting", value: (f) => f.recaps },
  { label: "Speaks in your own voice", value: (f) => f.ownVoice },
  { label: "Private copilot in your own meetings", value: (f) => f.copilot },
  { label: "Several people on one bill", value: (f) => f.seats },
];
