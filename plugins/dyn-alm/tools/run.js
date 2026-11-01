// Executa um script da esteira com as ferramentas do kit instalado:
//   1. copia scripts/ e .claude/commands/ do kit para o repo, sobrescrevendo (ficam fora do Git — são ferramentas)
//   2. roda o script, repassando argumentos e exit code
// É o que os npm scripts do repo chamam:  "build": "dyn-alm run scripts/build.js"
//
// Uso: node run.js <scripts/arquivo.js> [args…]
// Repo de referência (sem .dyn-alm/template.json) não é sobrescrito: os scripts dele são a fonte do template.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const T = require("./template");

const [script, ...args] = process.argv.slice(2);
if (!script) T.fail("Uso: dyn-alm run <scripts/arquivo.js> [args…]");
const root = T.findRepo(process.cwd()) || T.fail("Não é um repositório ALM (sem devops.config.json) — rode dentro do repo da solution");

if (!T.isReference(root)) {
    const changed = T.diffFiles(root, T.TOOLS);
    if (changed.length) {
        T.writeFiles(root, changed);
        console.error(`\x1b[36m▶ ${changed.length} ferramenta(s) do kit ${T.VERSION} copiada(s) para o repo (scripts/, .claude/commands/)\x1b[0m`);
    }
    if (!T.toolsFromKit(root)) {
        console.error("\x1b[33m⚠ Os scripts deste repo ainda estão no Git — rode dyn-alm upgrade para passarem a vir só do kit\x1b[0m");
    }
}

const file = path.resolve(root, script);
if (!fs.existsSync(file)) T.fail(`${script} não existe no repo nem no kit ${T.VERSION}`);
const r = spawnSync(process.execPath, [file, ...args], { stdio: "inherit" });
if (r.error) T.fail(r.error.message);
process.exit(r.status === null ? 1 : r.status);
