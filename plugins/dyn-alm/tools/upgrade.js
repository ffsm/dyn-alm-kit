// Atualiza os arquivos gerenciados pela skill (scripts, workflows, comandos, docs/scripts.md)
// num repositório ALM existente. Não toca em solution/, src/, devops.config.json nem docs editáveis.
//
// Uso: node upgrade.js --target <repo>            (mostra o que mudaria)
//      node upgrade.js --target <repo> --apply    (aplica; exige working tree limpa)
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const T = require("./template");

const a = T.parseArgs();
const target = path.resolve(a.target || ".");
const configPath = path.join(target, "devops.config.json");
if (!fs.existsSync(configPath)) T.fail(`${target} não é um repositório ALM (sem devops.config.json)`);

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const solutionXml = fs.readFileSync(path.join(target, config.solution.folder, "Other", "Solution.xml"), "utf8");
const vars = {
    SOLUTION: config.solution.name,
    PREFIX: (solutionXml.match(/<CustomizationPrefix>([^<]+)<\/CustomizationPrefix>/) || [])[1],
    DEV_URL: config.environments.dev.url,
    REPO: path.basename(target),
};

const metaPath = path.join(target, ".dyn-alm", "template.json");
const current = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf8")).version : "(desconhecida)";

const changes = [];
for (const rel of T.listFiles(T.TEMPLATE_DIR).filter((f) => T.MANAGED.some((re) => re.test(f)))) {
    const dest = path.join(target, rel);
    const next = T.render(rel, vars);
    if (!fs.existsSync(dest)) changes.push({ rel, kind: "novo", next });
    // compara ignorando CRLF/LF (o git do Windows converte no checkout)
    else if (fs.readFileSync(dest).toString("utf8").replace(/\r\n/g, "\n") !== next.toString("utf8").replace(/\r\n/g, "\n")) {
        changes.push({ rel, kind: "alterado", next });
    }
}

console.log(`\n  Repo: ${target}\n  Template no repo: ${current}  →  kit: ${T.VERSION}\n`);
if (!changes.length) { console.log("  Nada a atualizar."); process.exit(0); }
for (const c of changes) console.log(`  ${c.kind === "novo" ? "+" : "~"} ${c.rel}`);

if (!a.apply) { console.log("\n  (simulação — rode com --apply para aplicar)"); process.exit(0); }

const status = spawnSync("git", ["status", "--porcelain"], { cwd: target, encoding: "utf8" }).stdout.trim();
if (status) T.fail("Working tree com alterações — commit/stash antes, para o upgrade ficar num diff limpo");
for (const c of changes) {
    fs.mkdirSync(path.dirname(path.join(target, c.rel)), { recursive: true });
    fs.writeFileSync(path.join(target, c.rel), c.next);
}
fs.mkdirSync(path.dirname(metaPath), { recursive: true });
fs.writeFileSync(metaPath, JSON.stringify({ version: T.VERSION, upgradedAt: new Date().toISOString() }, null, 2) + "\n");
console.log(`\n  ${changes.length} arquivo(s) atualizados. Revise com git diff e commite.` +
    "\n  Scripts novos podem precisar de entradas no package.json (veja docs/scripts.md).");
