// Mostra o estado de um ambiente e se ele está pronto para a esteira do CoE levar o pacote.
// "Pronto" = o ambiente tem a ponta da release aberta (release/X.Y.Z; sem release aberta, a main),
// sem nada feito à mão.
//
// Uso: npm run status -- [dev|prod]   (exit 0 = pronto, 1 = não pronto)
const L = require("./lib");
const { detectDrift, deployedTag } = require("./sync-from-env");
const { installedVersion } = require("./deploy");

const env = L.getEnv(L.parseArgs()._[0] || "dev");
L.ensureAuth(env);

const tag = deployedTag(env.name);
const hasRef = (ref) => L.run("git", ["rev-parse", "-q", "--verify", ref], { capture: true, allowFail: true }).status === 0;
const rel = L.openRelease();
const targetRef = rel.ref || rel.main;
const target = L.git(["rev-parse", targetRef]);
const deployed = hasRef(`refs/tags/${tag}`) ? L.git(["rev-list", "-n", "1", tag]) : null;
const deployedVersion = deployed ? (L.git(["tag", "-l", "--format=%(contents:subject)", tag]).match(/\d+\.\d+\.\d+\.\d+/) || [])[0] : null;
const installed = installedVersion(env);
const drift = installed ? detectDrift(env, { keepBranch: false }).drift : false;
// Commits que não mexem na solution (docs, scripts) não exigem novo deploy.
const sameAsTarget = !!deployed && L.run("git", ["diff", "--quiet", deployed, target, "--",
    L.config.solution.folder, L.config.solution.webresources], { capture: true, allowFail: true }).status === 0;

const checks = [
    [!!installed, `${L.SOLUTION} instalada em ${env.name}`, installed || "não instalada"],
    [!!deployed, `deploy feito pela esteira (tag ${tag})`, deployed ? deployed.slice(0, 7) : "sem tag — faça npm run deploy"],
    [sameAsTarget, `solution no ambiente = ${targetRef}`, sameAsTarget
        ? `${target.slice(0, 7)}${deployed === target ? "" : ` (deploy em ${deployed.slice(0, 7)}, sem mudança de solution desde então)`}`
        : `${targetRef} = ${target.slice(0, 7)}; ambiente = ${deployed ? deployed.slice(0, 7) : "?"} — faça deploy de ${targetRef}`],
    [installed && installed === deployedVersion, "versão instalada = versão do deploy", `${installed} × ${deployedVersion}`],
    [!drift, "sem alterações feitas à mão no ambiente", drift ? "HÁ DRIFT — rode /sync-from-env" : "ok"],
];
if (!rel.ref) console.warn("⚠ Nenhuma release/X.Y.Z aberta — comparando com a main. Abra uma com npm run release:start -- X.Y.Z");

console.log(`\n  ${env.name} (${env.url})\n`);
for (const [ok, label, detail] of checks) console.log(`  ${ok ? "✔" : "✖"} ${label.padEnd(44)} ${detail}`);
const ready = checks.every(([ok]) => ok);
console.log(`\n  ${ready ? "PRONTO" : "NÃO PRONTO"} para a esteira do CoE levar o pacote` +
    (ready ? ` — versão ${installed} = commit ${deployed.slice(0, 7)}\n` : "\n"));
process.exit(ready ? 0 : 1);
