// Sets up Paystack for Peguin from a secret key on stdin (never printed):
//   pbpaste | node scripts/paystack-setup.mjs [--currency USD] [--amount 5]
// Stores PAYSTACK_SECRET_KEY, creates (or reuses) the monthly plan and stores PAYSTACK_PLAN_CODE.
// The webhook URL is set once in the Paystack dashboard (there's no API for it).
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

const { values: opts } = parseArgs({ options: { currency: { type: "string", default: "USD" }, amount: { type: "string", default: "5" } } });
const currency = opts.currency.toUpperCase();
const subunits = Math.round(Number(opts.amount) * 100); // Paystack amounts are in kobo / cents
if (!(subunits > 0)) { console.error("--amount must be a positive number, e.g. --amount 5"); process.exit(1); }

const key = (await new Response(process.stdin).text()).trim();
if (!/^sk_(test|live)_/.test(key)) {
  console.error("That doesn't look like a Paystack secret key (sk_test_… or sk_live_…). Copy it from Paystack → Settings → API Keys & Webhooks.");
  process.exit(1);
}

function put(name, value) {
  const r = spawnSync("npx", ["wrangler", "secret", "put", name], { input: value, stdio: ["pipe", "ignore", "pipe"], encoding: "utf8" });
  if (r.status !== 0) throw new Error(`wrangler secret put ${name} failed: ${r.stderr.split("\n").filter(Boolean).slice(-2).join(" ")}`);
  console.log(`  set ${name}`);
}

async function paystack(path, body) {
  const res = await fetch(`https://api.paystack.co/${path}`, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.status) throw new Error(data.message ?? `HTTP ${res.status}`);
  return data.data;
}

console.log(`Paystack ${key.startsWith("sk_live_") ? "LIVE" : "test"} mode; plan ${opts.amount} ${currency}/month`);
const plans = await paystack("plan?perPage=100");
let plan = plans.find((p) => p.name === "Peguin monthly" && p.amount === subunits && p.currency === currency && p.interval === "monthly");
if (!plan) {
  try {
    plan = await paystack("plan", { name: "Peguin monthly", interval: "monthly", amount: subunits, currency, description: "Peguin: your standup, covered." });
  } catch (e) {
    console.error(`Paystack refused the plan: ${e.message}`);
    if (currency !== "NGN") console.error(`Your Paystack business may not accept ${currency} yet. Ask Paystack to enable it, or run again with e.g. --currency NGN --amount 7500.`);
    process.exit(1);
  }
}
put("PAYSTACK_SECRET_KEY", key);
put("PAYSTACK_PLAN_CODE", plan.plan_code);
console.log(`  plan ${plan.plan_code}`);
console.log("Last step, in the Paystack dashboard → Settings → API Keys & Webhooks:");
console.log(`  ${key.startsWith("sk_live_") ? "Live" : "Test"} Webhook URL = https://www.peguin.co/webhooks/paystack`);
