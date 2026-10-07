#!/usr/bin/env node
// Cuts a desktop release: bumps desktop/package.json, commits "Release vX.Y.Z"
// and tags it. Pushing the tag (git push origin main --follow-tags) starts
// .github/workflows/release.yml, which builds and publishes the .dmg.
//
//   npm run release -- patch      0.1.0 -> 0.1.1   fixes
//   npm run release -- minor      0.1.0 -> 0.2.0   new features
//   npm run release -- major      0.1.0 -> 1.0.0   breaking changes
//   npm run release -- 0.3.0      an exact version
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { compareVersions, VERSION_RE } from "../src/core/version.ts";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const fail = (msg) => { console.error(msg); process.exit(1); };

const bump = process.argv[2];
if (!bump) fail("Say how to bump: patch, minor, major, or an exact version like 0.3.0.");

if (git("rev-parse", "--abbrev-ref", "HEAD") !== "main") fail("Release from main: merge your PR first, then git checkout main && git pull.");
if (git("status", "--porcelain", "--untracked-files=no")) fail("Commit or stash your changes first.");
git("fetch", "-q", "origin", "main", "--tags");
if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/main")) fail("Local main differs from origin/main. Run git pull (and push anything unpushed) first.");

const files = ["desktop/package.json", "desktop/package-lock.json"];
const pkg = JSON.parse(readFileSync(files[0], "utf8"));
const current = pkg.version;
const [major, minor, patch] = current.split(".").map(Number);
const next = bump === "patch" ? `${major}.${minor}.${patch + 1}`
  : bump === "minor" ? `${major}.${minor + 1}.0`
  : bump === "major" ? `${major + 1}.0.0`
  : bump;
if (!VERSION_RE.test(next)) fail(`"${bump}" isn't patch, minor, major or a version like 0.3.0.`);
if (compareVersions(next, current) <= 0) fail(`${next} isn't newer than the current ${current}.`);
if (git("tag", "--list", `v${next}`)) fail(`Tag v${next} already exists.`);

for (const f of files) {
  const json = JSON.parse(readFileSync(f, "utf8"));
  json.version = next;
  if (json.packages?.[""]) json.packages[""].version = next;
  writeFileSync(f, `${JSON.stringify(json, null, 2)}\n`);
}
git("add", ...files);
git("commit", "-q", "-m", `Release v${next}`);
git("tag", "-a", `v${next}`, "-m", `Peguin v${next}`);

console.log(`v${current} -> v${next}: committed and tagged.`);
console.log("Publish it with:  git push origin main --follow-tags");
