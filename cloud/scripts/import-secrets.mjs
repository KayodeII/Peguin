// Copies credentials from an existing .env file into the Worker's secrets,
// piping each value straight to `wrangler secret put`. Values are never printed.
//
//   node scripts/import-secrets.mjs <path/to/.env> [--paystack] [--resend-domain]
//
//   --paystack        create the Peguin monthly plan in that Paystack account (scripts/paystack-setup.mjs)
//   --resend-domain   add peguin.co to that Resend account and print the DNS records to create
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const [file, ...flags] = process.argv.slice(2);
if (!file) { console.error("Usage: node scripts/import-secrets.mjs <path/to/.env> [--paystack] [--resend-domain]"); process.exit(1); }

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
  PAYSTACK_SECRET_KEY: ["PAYSTACK_SECRET_KEY", "PAYSTACK_SECRET", "PAYSTACK_SK", "PAYSTACK_KEY"],
};
// Not copied on purpose: a plan code belongs to another product (use --paystack).

// When no exact name matches: any name fitting the pattern, test keys first.
const PATTERNS = {
  PAYSTACK_SECRET_KEY: { name: /PAYSTACK.*(SECRET|SK)|(SECRET|SK).*PAYSTACK/i, value: /^sk_(test|live)_/ },
  ANTHROPIC_API_KEY: { name: /ANTHROPIC|CLAUDE/i, value: /^sk-ant-/ },
  RESEND_API_KEY: { name: /RESEND/i, value: /^re_/ },
  GOOGLE_CLIENT_SECRET: { name: /GOOGLE.*SECRET/i, value: /./ },
};
function byPattern(dest) {
  const p = PATTERNS[dest];
  if (!p) return undefined;
  const hits = Object.keys(env).filter((n) => p.name.test(n) && p.value.test(env[n]));
  return hits.find((n) => /TEST/i.test(n) || env[n].startsWith("sk_test_")) ?? hits[0];
}

function put(name, value) {
  const r = spawnSync("npx", ["wrangler", "secret", "put", name], { input: value, stdio: ["pipe", "ignore", "pipe"], encoding: "utf8" });
  if (r.status !== 0) throw new Error(`wrangler secret put ${name} failed: ${r.stderr.split("\n").filter(Boolean).slice(-2).join(" ")}`);
  console.log(`  set ${name}`);
}

const found = {};
console.log(`Reading ${file}`);
for (const [dest, names] of Object.entries(ALIASES)) {
  const src = names.find((n) => env[n]) ?? byPattern(dest);
  if (src) { found[dest] = env[src]; put(dest, env[src]); if (!names.includes(src)) console.log(`    (from ${src})`); }
  else console.log(`  not found: ${dest} (looked for ${names.join(", ")}${PATTERNS[dest] ? " and similar names" : ""})`);
}
put("EMAIL_FROM", "Peguin <no-reply@peguin.co>");

if (flags.includes("--paystack")) {
  if (!found.PAYSTACK_SECRET_KEY) throw new Error("--paystack needs a Paystack secret key in the file.");
  const r = spawnSync("node", [new URL("./paystack-setup.mjs", import.meta.url).pathname], { input: found.PAYSTACK_SECRET_KEY, stdio: ["pipe", "inherit", "inherit"] });
  if (r.status !== 0) process.exit(r.status ?? 1);
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
