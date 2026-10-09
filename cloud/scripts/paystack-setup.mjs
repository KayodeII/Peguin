// Sets up Paystack for Peguin from a secret key on stdin (never printed):
//   pbpaste | node scripts/paystack-setup.mjs --currency NGN --basic 3000 --pro 7500 [--team 15000]
// Amounts are per month, in the currency's main unit. Each named plan is created
// (or reused when one with the same name, price and currency exists), then
// PAYSTACK_SECRET_KEY and PAYSTACK_PLANS are stored as Worker secrets. A plan you
// leave out isn't on sale: the site offers its waitlist instead.
// The webhook URL is set once in the Paystack dashboard (there's no API for it).
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

const TIERS = { basic: "Peguin Basic", pro: "Peguin Pro", team: "Peguin Team" };
const { values: opts } = parseArgs({ options: { currency: { type: "string", default: "NGN" }, basic: { type: "string" }, pro: { type: "string" }, team: { type: "string" } } });
const currency = opts.currency.toUpperCase();
const wanted = Object.keys(TIERS).filter((t) => opts[t] !== undefined).map((t) => ({ tier: t, subunits: Math.round(Number(opts[t]) * 100) }));
if (!wanted.length || wanted.some((w) => !(w.subunits > 0))) {
  console.error("Give at least one plan with a positive monthly amount, e.g. --basic 3000 --pro 7500 (Paystack amounts are in naira or dollars here, not kobo).");
  process.exit(1);
}

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

console.log(`Paystack ${key.startsWith("sk_live_") ? "LIVE" : "test"} mode, ${currency}`);
const existing = await paystack("plan?perPage=100");
const codes = {};
for (const { tier, subunits } of wanted) {
  const name = TIERS[tier];
  let plan = existing.find((p) => p.name === name && p.amount === subunits && p.currency === currency && p.interval === "monthly");
  if (!plan) {
    try {
      plan = await paystack("plan", { name, interval: "monthly", amount: subunits, currency, description: `${name}: your standup, covered.` });
    } catch (e) {
      console.error(`Paystack refused ${name}: ${e.message}`);
      if (currency !== "NGN") console.error(`Your Paystack business may not accept ${currency} yet. Ask Paystack to enable it, or use --currency NGN.`);
      process.exit(1);
    }
  }
  codes[tier] = plan.plan_code;
  console.log(`  ${tier}: ${plan.plan_code} (${subunits / 100} ${currency}/month)`);
}
put("PAYSTACK_SECRET_KEY", key);
put("PAYSTACK_PLANS", JSON.stringify(codes));
console.log("Last step, in the Paystack dashboard → Settings → API Keys & Webhooks:");
console.log(`  ${key.startsWith("sk_live_") ? "Live" : "Test"} Webhook URL = https://www.peguin.co/webhooks/paystack`);
