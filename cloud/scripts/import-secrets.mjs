// Copies credentials from an existing .env file into the Worker's secrets,
// piping each value straight to `wrangler secret put`. Values are never printed.
//
//   node scripts/import-secrets.mjs <path/to/.env> [--stripe] [--resend-domain]
//
//   --stripe          create the Peguin product, the $5/month price and the webhook
//                     endpoint in that Stripe account; sets STRIPE_PRICE_ID and STRIPE_WEBHOOK_SECRET
//   --resend-domain   add peguin.co to that Resend account and print the DNS records to create
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const [file, ...flags] = process.argv.slice(2);
if (!file) { console.error("Usage: node scripts/import-secrets.mjs <path/to/.env> [--stripe] [--resend-domain]"); process.exit(1); }

const env = {};
for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  else v = v.replace(/\s+#.*$/, "");
  if (v) env[m[1]] = v;
}

// Peguin's secret name -> names other projects commonly use for it.
const ALIASES = {
  RESEND_API_KEY: ["RESEND_API_KEY", "RESEND_KEY"],
  GOOGLE_CLIENT_ID: ["GOOGLE_CLIENT_ID", "AUTH_GOOGLE_ID", "GOOGLE_OAUTH_CLIENT_ID", "NEXT_PUBLIC_GOOGLE_CLIENT_ID"],
  GOOGLE_CLIENT_SECRET: ["GOOGLE_CLIENT_SECRET", "AUTH_GOOGLE_SECRET", "GOOGLE_OAUTH_CLIENT_SECRET"],
  ANTHROPIC_API_KEY: ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"],
  STRIPE_SECRET_KEY: ["STRIPE_SECRET_KEY", "STRIPE_API_KEY", "STRIPE_SK"],
};
// Not copied on purpose: a webhook secret belongs to one endpoint (use --stripe),
// and a price id belongs to another product.

function put(name, value) {
  const r = spawnSync("npx", ["wrangler", "secret", "put", name], { input: value, stdio: ["pipe", "ignore", "pipe"], encoding: "utf8" });
  if (r.status !== 0) throw new Error(`wrangler secret put ${name} failed: ${r.stderr.split("\n").filter(Boolean).slice(-2).join(" ")}`);
  console.log(`  set ${name}`);
}

const found = {};
console.log(`Reading ${file}`);
for (const [dest, names] of Object.entries(ALIASES)) {
  const src = names.find((n) => env[n]);
  if (src) { found[dest] = env[src]; put(dest, env[src]); }
  else console.log(`  not found: ${dest} (looked for ${names.join(", ")})`);
}
put("EMAIL_FROM", "Peguin <hello@peguin.co>");

async function stripe(path, params) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: params ? "POST" : "GET",
    headers: { authorization: `Bearer ${found.STRIPE_SECRET_KEY}`, "content-type": "application/x-www-form-urlencoded" },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe ${path}: ${data.error?.message ?? res.status}`);
  return data;
}

if (flags.includes("--stripe")) {
  if (!found.STRIPE_SECRET_KEY) throw new Error("--stripe needs a Stripe secret key in the file.");
  console.log(`Stripe (${found.STRIPE_SECRET_KEY.startsWith("sk_live_") ? "LIVE" : "test"} mode)`);
  const product = await stripe("products", { name: "Peguin", description: "Your standup, covered." });
  const price = await stripe("prices", {
    product: product.id, currency: "usd", unit_amount: "500", "recurring[interval]": "month", nickname: "Peguin monthly",
  });
  const hook = await stripe("webhook_endpoints", {
    url: "https://www.peguin.co/webhooks/stripe",
    "enabled_events[0]": "checkout.session.completed",
    "enabled_events[1]": "customer.subscription.created",
    "enabled_events[2]": "customer.subscription.updated",
    "enabled_events[3]": "customer.subscription.deleted",
    description: "Peguin",
  });
  put("STRIPE_PRICE_ID", price.id);
  put("STRIPE_WEBHOOK_SECRET", hook.secret);
  console.log(`  product ${product.id}, price ${price.id} ($5/month), webhook ${hook.id}`);
}

if (flags.includes("--resend-domain")) {
  if (!found.RESEND_API_KEY) throw new Error("--resend-domain needs a Resend API key in the file.");
  const headers = { authorization: `Bearer ${found.RESEND_API_KEY}`, "content-type": "application/json" };
  const list = await (await fetch("https://api.resend.com/domains", { headers })).json();
  let domain = (list.data ?? []).find((d) => d.name === "peguin.co");
  if (!domain) {
    const res = await fetch("https://api.resend.com/domains", { method: "POST", headers, body: JSON.stringify({ name: "peguin.co" }) });
    domain = await res.json();
    if (!res.ok) throw new Error(`Resend: ${domain.message ?? res.status}`);
  } else {
    domain = await (await fetch(`https://api.resend.com/domains/${domain.id}`, { headers })).json();
  }
  console.log(`Resend domain peguin.co: ${domain.status}. Add these DNS records in Cloudflare (DNS only, not proxied):`);
  for (const r of domain.records ?? []) console.log(`  ${r.type.padEnd(5)} ${r.name.padEnd(28)} ${r.priority ? `priority ${r.priority}  ` : ""}${r.value}`);
}
console.log("Done. Redeploy isn't needed; secrets apply immediately.");
