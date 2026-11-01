// Cria um repositório ALM para uma solution Dataverse a partir do template da skill.
// Chamado pelo `dyn-alm init` (wizard no terminal) e pelo /dyn-alm:init (Claude Code).
//
// Solution nova:
//   node scaffold.js --target <pasta> --solution <NomeUnico> --mode new --publisher <nome_unico> --prefix <pfx>
//        [--display "Nome"] [--publisher-display "Nome"] --dev-url <url> [--prod-url <url>] [--base-version 1.0.0] [--commit]
// Solution que já existe no ambiente dev (brownfield):
//   node scaffold.js --target <pasta> --solution <NomeUnico> --mode from-env --dev-url <url> --base-version X.Y.Z [--prod-url <url>] [--commit]
// Solution a partir de um zip baixado (brownfield; nome e versão base saem do zip):
//   node scaffold.js --target <pasta> --mode from-zip --zip <arquivo.zip> --dev-url <url> [--base-version X.Y.Z] [--prod-url <url>] [--commit]
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const T = require("./template");

const a = T.parseArgs();
if (!["new", "from-env", "from-zip"].includes(a.mode)) T.fail("--mode deve ser new, from-env ou from-zip");

let zipInfo = null;
if (a.mode === "from-zip") {
    if (!a.zip) T.fail("--mode from-zip precisa de --zip <arquivo>");
    a.zip = path.resolve(a.zip);
    const r = spawnSync("node", [path.join(__dirname, "inspect-solution.js"), a.zip, "--json"], { encoding: "utf8" });
    if (r.status !== 0) T.fail(`Não consegui ler ${a.zip}:\n${r.stdout}${r.stderr}`);
    zipInfo = JSON.parse(r.stdout);
    if (a.solution && a.solution !== zipInfo.uniqueName) T.fail(`--solution ${a.solution} não confere com o zip (${zipInfo.uniqueName})`);
    a.solution = zipInfo.uniqueName;
}
for (const k of ["target", "solution", "dev-url"]) if (!a[k]) T.fail(`--${k} é obrigatório`);
if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(a.solution)) T.fail("Nome único da solution: letras, números e _ (sem espaço)");
// Brownfield: a versão base precisa ser maior que a existente (o init-solution confere de novo).
const baseVersion = a["base-version"] || (zipInfo ? zipInfo.suggestedBaseVersions.minor : "1.0.0");
if (!/^\d+\.\d+\.\d+$/.test(baseVersion)) T.fail(`--base-version inválido: ${baseVersion} (esperado X.Y.Z)`);
if (zipInfo) {
    const cur = zipInfo.version.split(".").map(Number), next = baseVersion.split(".").map(Number);
    const cmp = next[0] - (cur[0] || 0) || next[1] - (cur[1] || 0) || next[2] - (cur[2] || 0);
    if (cmp <= 0) T.fail(`A solution está em ${zipInfo.version}; --base-version precisa ser maior (sugestões: ${zipInfo.suggestedBaseVersions.minor} ou ${zipInfo.suggestedBaseVersions.patch})`);
}
const target = path.resolve(a.target);

const run = (cmd, args, opts = {}) => {
    const r = spawnSync(cmd, args, { cwd: target, encoding: "utf8", stdio: opts.capture ? "pipe" : "inherit" });
    if (r.status !== 0 && !opts.allowFail) T.fail(`${cmd} ${args.join(" ")} falhou${opts.capture ? `:\n${r.stdout}${r.stderr}` : ""}`);
    return r;
};

// 1. Pasta: nova, vazia ou repo git sem estrutura ALM.
if (fs.existsSync(target)) {
    const existing = fs.readdirSync(target).filter((f) => f !== ".git");
    const MERGEABLE = [".gitignore", ".gitattributes"];
    const clash = T.listFiles(T.TEMPLATE_DIR).filter((f) => !MERGEABLE.includes(f) && fs.existsSync(path.join(target, f)));
    if (fs.existsSync(path.join(target, "devops.config.json")) || clash.length) {
        T.fail(`${target} já tem estrutura ALM ou arquivos do template (${clash.slice(0, 3).join(", ")}…). Use "dyn-alm upgrade".`);
    }
    if (existing.length) console.warn(`⚠ ${target} não está vazia (${existing.length} itens) — os arquivos do template serão adicionados.`);
} else {
    fs.mkdirSync(target, { recursive: true });
}

// 2. Config (o init-solution lê dela).
const config = {
    solution: { name: a.solution, folder: "solution", webresources: "src/webresources", baseVersion },
    environments: {
        dev: { url: a["dev-url"], packageType: "Unmanaged", role: "Desenvolvimento; o CoE exporta daqui" },
        prod: { url: a["prod-url"] || "TODO: https://<prod>.crm.dynamics.com/", packageType: "Managed", role: "Homol/Prod: recebe managed pela esteira do CoE" },
    },
    artifactory: { repo: "dynamics-solutions", localFallback: "../artifactory-local" },
};
fs.writeFileSync(path.join(target, "devops.config.json"), JSON.stringify(config, null, 2) + "\n");

// 3. Arquivos do template (placeholders de prefixo são preenchidos depois do init).
const files = T.listFiles(T.TEMPLATE_DIR);
const appended = [];
for (const rel of files) {
    const dest = path.join(target, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if ([".gitignore", ".gitattributes"].includes(rel) && fs.existsSync(dest)) {
        // repo existente: anexa as regras do template em vez de sobrescrever
        fs.appendFileSync(dest, "\n# --- dyn-alm ---\n" + fs.readFileSync(path.join(T.TEMPLATE_DIR, rel), "utf8"));
        appended.push(rel);
    } else {
        fs.copyFileSync(path.join(T.TEMPLATE_DIR, rel), dest);
    }
}
const repoName = path.basename(target).toLowerCase().replace(/[^a-z0-9-]+/g, "-");
const pkg = {
    name: repoName, version: "1.0.0", private: true, description: `ALM da solution ${a.solution} (Dataverse)`,
    scripts: {
        build: "node scripts/build.js", deploy: "node scripts/deploy.js", sync: "node scripts/sync-from-env.js",
        drift: "node scripts/sync-from-env.js --check", status: "node scripts/status.js",
        "new-webresource": "node scripts/new-webresource.js", "release:start": "node scripts/release-start.js",
        "release:finish": "node scripts/release-finish.js", release: "node scripts/release.js",
        publish: "node scripts/publish-artifact.js", "release-notes": "node scripts/release-notes.js",
    },
    engines: { node: ">=20" },
};
fs.writeFileSync(path.join(target, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

// 4. Git + solution.
if (!fs.existsSync(path.join(target, ".git"))) run("git", ["init", "-q", "-b", "main"]);
const initArgs = ["scripts/init-solution.js", { new: "--new", "from-env": "--from-env", "from-zip": "--from-zip" }[a.mode]];
if (a.mode === "from-zip") initArgs.push(a.zip);
if (a.mode === "new") {
    if (!a.publisher || !a.prefix) T.fail("--mode new precisa de --publisher e --prefix");
    initArgs.push("--publisher", a.publisher, "--prefix", a.prefix);
    if (a.display) initArgs.push("--display", a.display);
    if (a["publisher-display"]) initArgs.push("--publisher-display", a["publisher-display"]);
}
run("node", initArgs);

// 5. Placeholders (o prefixo vem da solution, no caso from-env).
const solutionXml = fs.readFileSync(path.join(target, "solution", "Other", "Solution.xml"), "utf8");
const vars = {
    SOLUTION: a.solution,
    PREFIX: (solutionXml.match(/<CustomizationPrefix>([^<]+)<\/CustomizationPrefix>/) || [])[1] || a.prefix,
    DEV_URL: a["dev-url"],
    REPO: path.basename(target),
};
for (const rel of files.filter((f) => !appended.includes(f))) fs.writeFileSync(path.join(target, rel), T.render(rel, vars));

fs.writeFileSync(path.join(target, "README.md"), `# ${path.basename(target)}

Solution Dataverse **${a.solution}** (prefixo \`${vars.PREFIX}_\`) versionada no Git: o pacote é gerado do repositório, não do ambiente.

- Processo do dev: [docs/processo-dev.md](docs/processo-dev.md)
- Scripts: [docs/scripts.md](docs/scripts.md)
- Webresources (o que se edita): \`src/webresources/\` · metadados: \`solution/\`

Gerado pelo kit \`dyn-alm\` v${T.VERSION}. Atualize os scripts com \`dyn-alm upgrade\` (ou \`/dyn-alm:upgrade\` no Claude Code).
`);
fs.mkdirSync(path.join(target, ".dyn-alm"), { recursive: true });
fs.writeFileSync(path.join(target, ".dyn-alm", "template.json"), JSON.stringify({ version: T.VERSION, scaffoldedAt: new Date().toISOString(), mode: a.mode }, null, 2) + "\n");

if (a.commit) {
    run("git", ["add", "-A"], { capture: true });
    run("git", ["commit", "-q", "-m", `chore: estrutura ALM inicial da solution ${a.solution}`], { capture: true });
}

console.log(`
  Repositório criado em ${target}
  Solution ........ ${a.solution} (prefixo ${vars.PREFIX}_, versão base ${baseVersion})
  Dev ............. ${a["dev-url"]}
  Prod ............ ${config.environments.prod.url}
  Commit inicial .. ${a.commit ? "feito" : "não (git add -A && git commit)"}`);
