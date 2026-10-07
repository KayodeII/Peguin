// Sets up Stripe for Peguin from a secret key on stdin (never printed):
//   pbpaste | node scripts/stripe-setup.mjs
// Stores STRIPE_SECRET_KEY, creates the Peguin product, the $5/month price and the
// webhook endpoint, and stores STRIPE_PRICE_ID and STRIPE_WEBHOOK_SECRET.
import { spawnSync } from "node:child_process";

const key = (await new Response(process.stdin).text()).trim();
if (!/^sk_(test|live)_/.test(key) && !/^rk_(test|live)_/.test(key)) {
  console.error("That doesn't look like a Stripe secret key (sk_test_… or sk_live_…). Copy it from Stripe → Developers → API keys.");
  process.exit(1);
}

function put(name, value) {
  const r = spawnSync("npx", ["wrangler", "secret", "put", name], { input: value, stdio: ["pipe", "ignore", "pipe"], encoding: "utf8" });
  if (r.status !== 0) throw new Error(`wrangler secret put ${name} failed: ${r.stderr.split("\n").filter(Boolean).slice(-2).join(" ")}`);
  console.log(`  set ${name}`);
}

async function stripe(path, params) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: params ? "POST" : "GET",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded" },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe ${path}: ${data.error?.message ?? res.status}`);
  return data;
}

console.log(`Stripe ${key.includes("_live_") ? "LIVE" : "test"} mode`);
// Reuse what an earlier run created instead of making duplicates.
const products = await stripe("products?active=true&limit=100");
const product = products.data.find((p) => p.name === "Peguin") ?? await stripe("products", { name: "Peguin", description: "Your standup, covered." });
const prices = await stripe(`prices?product=${product.id}&active=true&limit=100`);
const price = prices.data.find((p) => p.unit_amount === 500 && p.currency === "usd" && p.recurring?.interval === "month")
  ?? await stripe("prices", { product: product.id, currency: "usd", unit_amount: "500", "recurring[interval]": "month", nickname: "Peguin monthly" });
const url = "https://www.peguin.co/webhooks/stripe";
const hooks = await stripe("webhook_endpoints?limit=100");
for (const old of hooks.data.filter((h) => h.url === url)) await fetch(`https://api.stripe.com/v1/webhook_endpoints/${old.id}`, { method: "DELETE", headers: { authorization: `Bearer ${key}` } });
const hook = await stripe("webhook_endpoints", {
  url,
  "enabled_events[0]": "checkout.session.completed",
  "enabled_events[1]": "customer.subscription.created",
  "enabled_events[2]": "customer.subscription.updated",
  "enabled_events[3]": "customer.subscription.deleted",
  description: "Peguin",
});
put("STRIPE_SECRET_KEY", key);
put("STRIPE_PRICE_ID", price.id);
put("STRIPE_WEBHOOK_SECRET", hook.secret); // only returned when the endpoint is created
console.log(`  product ${product.id}, price ${price.id} ($5/month), webhook ${hook.id}`);
console.log("Done. Secrets apply immediately.");
