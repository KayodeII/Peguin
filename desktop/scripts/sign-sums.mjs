// Signs a release's SHA256SUMS.txt with the release key, writing SHA256SUMS.txt.sig
// (base64 Ed25519). The app refuses to update itself from a release without it.
//   RELEASE_SIGNING_KEY='<private JWK>' node scripts/sign-sums.mjs release/SHA256SUMS.txt
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const file = process.argv[2];
const jwk = process.env.RELEASE_SIGNING_KEY;
if (!file || !jwk) {
  console.error("Usage: RELEASE_SIGNING_KEY='<private JWK>' node scripts/sign-sums.mjs <SHA256SUMS.txt>");
  process.exit(1);
}
const key = createPrivateKey({ key: JSON.parse(jwk), format: "jwk" });
writeFileSync(`${file}.sig`, sign(null, readFileSync(file), key).toString("base64") + "\n");
