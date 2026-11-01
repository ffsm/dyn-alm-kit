// Abre uma release: cria release/X.Y.Z a partir da main e grava X.Y.Z como baseVersion.
// A partir daqui o Dev deve refletir esta branch, e as features fazem PR para ela.
//
// Uso: npm run release:start -- 1.1.0 [--push]
const fs = require("fs");
const path = require("path");
const L = require("./lib");

const args = L.parseArgs();
const version = args._[0];
if (!/^\d+\.\d+\.\d+$/.test(version || "")) L.fail("Uso: npm run release:start -- X.Y.Z");

if (L.git(["status", "--porcelain"]) !== "") L.fail("Working tree com alterações — commit/stash antes");

const current = L.openRelease();
if (current.ref) L.fail(`Já existe uma release aberta: ${current.branch}. Finalize com npm run release:finish antes.`);

const last = L.lastReleaseTag();
const lastVersion = last ? last.replace(/^v/, "") : "0.0.0";
if (L.compareVersions(version, lastVersion) <= 0) L.fail(`${version} precisa ser maior que o último release (${last || "nenhum"})`);

const branch = `release/${version}`;
const hasRemote = L.run("git", ["remote", "get-url", "origin"], { capture: true, allowFail: true }).status === 0;
if (hasRemote) L.run("git", ["fetch", "origin", "main"], { capture: true, allowFail: true });
L.git(["checkout", "-b", branch, hasRemote && L.git(["rev-parse", "-q", "--verify", "origin/main"], { allowFail: true }) ? "origin/main" : "main"]);

const configPath = path.join(L.ROOT, "devops.config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
config.solution.baseVersion = version;
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
// O commit sempre existe (vazio se o baseVersion já era esse, como logo após um init brownfield):
// é ele que deixa a release à frente da main, ou seja, "aberta".
L.git(["add", "devops.config.json"]);
L.git(["commit", "--allow-empty", "-m", `chore: inicia release ${version}`]);
if (args.push) L.git(["push", "-u", "origin", branch]);

console.log(`
  Release ${version} aberta na branch ${branch}
  - features: git checkout -b feature/<nome> ${branch}  →  PR para ${branch}
  - o Dev deve refletir ${branch} (npm run status -- dev)
  - depois que o CoE levar para prod: npm run release:finish${args.push ? "" : `\n  - publique a branch: git push -u origin ${branch}`}`);
