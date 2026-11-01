#!/usr/bin/env node
// dyn-alm — CLI do kit (funciona sem IA). O plugin do Claude Code usa as mesmas ferramentas.
//
//   dyn-alm jornada [--json]                 onde estou na jornada e qual o próximo comando
//   dyn-alm init [--zip <arquivo>]           wizard: cria repo ALM (greenfield ou brownfield)
//   dyn-alm feature                          wizard: abre feature/fix a partir da release aberta
//   dyn-alm run <scripts/x.js> [args]        roda um script da esteira com as ferramentas do kit (npm scripts do repo)
//   dyn-alm inspect <zip> [--json]           o que há num zip de solution
//   dyn-alm doctor                           checa pré-requisitos e o repo
//   dyn-alm github check|login|create <dono/nome>|pr   publica o repo no GitHub e abre PRs (via gh)
//   dyn-alm upgrade [--target <repo>|--all] [--apply]  atualiza os scripts do repo (ou de todos os repos) para o kit
//   dyn-alm template --from <repo> [--bump minor] (mantenedor) regenera o template a partir do repo de referência
//   dyn-alm version
const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");
const { spawnSync } = require("child_process");
const T = require("./template");

const TOOLS = __dirname;
const [cmd, ...rest] = process.argv.slice(2);
const a = T.parseArgs(rest);
// Kit desatualizado se atualiza sozinho (no máximo de hora em hora). `version` fica de fora: é usado em checagens.
if (cmd !== "version") require("./selfupdate").autoUpdate();

const tool = (name, args, opts = {}) => spawnSync("node", [path.join(TOOLS, name), ...args], { stdio: opts.capture ? "pipe" : "inherit", encoding: "utf8", cwd: opts.cwd });
const sh = (c, args, cwd) => { const r = spawnSync(c, args, { encoding: "utf8", cwd }); return { ok: r.status === 0 && !r.error, out: (r.stdout || "").trim() }; };
const c = { b: (s) => `\x1b[1m${s}\x1b[0m`, dim: (s) => `\x1b[2m${s}\x1b[0m`, cyan: (s) => `\x1b[36m${s}\x1b[0m`, ok: "\x1b[32m✔\x1b[0m", no: "\x1b[31m✖\x1b[0m", warn: "\x1b[33m⚠\x1b[0m" };

// ---------- Perguntas no terminal (funciona com TTY e com entrada redirecionada) ----------
let lines = null;
async function readLine(prompt) {
    if (!lines) lines = readline.createInterface({ input: process.stdin, terminal: false })[Symbol.asyncIterator]();
    process.stdout.write(prompt);
    const { value, done } = await lines.next();
    if (done) T.fail("\nEntrada encerrada antes do fim do wizard");
    if (!process.stdin.isTTY) process.stdout.write(`${value}\n`);
    return value.trim();
}
async function ask(question, def, validate) {
    for (;;) {
        const v = (await readLine(`${c.cyan("?")} ${question}${def ? c.dim(` (${def})`) : ""}: `)) || def || "";
        const err = validate ? validate(v) : null;
        if (!err) return v;
        console.log(`  ${c.no} ${err}`);
    }
}
async function choose(question, options, def = 0) {
    console.log(`${c.cyan("?")} ${question}`);
    options.forEach((o, i) => console.log(`  ${c.b(String(i + 1))}) ${o.label}${i === def ? c.dim("  (recomendado)") : ""}${o.hint ? c.dim(`  — ${o.hint}`) : ""}`));
    for (;;) {
        const v = await readLine(`  escolha ${c.dim(`[${def + 1}]`)}: `);
        const n = v === "" ? def + 1 : Number(v);
        if (n >= 1 && n <= options.length) return options[n - 1].value;
        console.log(`  ${c.no} digite um número de 1 a ${options.length}`);
    }
}
async function confirm(question, def = true) {
    const v = (await readLine(`${c.cyan("?")} ${question} ${c.dim(def ? "[S/n]" : "[s/N]")}: `)).toLowerCase();
    return v === "" ? def : ["s", "sim", "y", "yes"].includes(v);
}

// ---------- Leitura do PAC ----------
function pacEnvs() {
    const r = sh("pac", ["env", "list"]);
    if (!r.ok) return [];
    return r.out.split(/\r?\n/).map((l) => l.match(/^\s*\*?\s*(.+?)\s+[0-9a-f-]{36}\s+(https:\/\/\S+)/i)).filter(Boolean)
        .map((m) => ({ name: m[1].trim(), url: m[2].endsWith("/") ? m[2] : `${m[2]}/` }));
}
function pacSolutions(url) {
    const r = sh("pac", ["solution", "list", "--environment", url]);
    if (!r.ok) return [];
    return r.out.split(/\r?\n/).map((l) => l.match(/^(\S+)\s+(.+?)\s+(\d+(?:\.\d+)+)\s+(True|False)\s*$/)).filter(Boolean)
        .map((m) => ({ uniqueName: m[1], displayName: m[2].trim(), version: m[3], managed: m[4] === "True" }))
        .filter((s) => !s.managed && s.uniqueName !== "Default" && s.displayName !== "Common Data Services Default Solution");
}
const bumps = (v) => {
    const [x, y, z] = v.split(".").map(Number);
    return [
        { label: `${x}.${(y || 0) + 1}.0`, value: `${x}.${(y || 0) + 1}.0`, hint: "nova release" },
        { label: `${x}.${y || 0}.${(z || 0) + 1}`, value: `${x}.${y || 0}.${(z || 0) + 1}`, hint: "correção" },
        { label: `${(x || 0) + 1}.0.0`, value: `${(x || 0) + 1}.0.0`, hint: "mudança grande" },
    ];
};
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

async function chooseEnv(question, envs, allowLater) {
    const opts = envs.map((e) => ({ label: e.name, value: e.url, hint: e.url }));
    opts.push({ label: "Digitar a URL", value: "__type" });
    if (allowLater) opts.push({ label: "Definir depois", value: "" });
    const v = await choose(question, opts);
    return v === "__type" ? ask("URL do ambiente", null, (u) => (/^https:\/\/\S+\.dynamics\.com\/?$/.test(u) ? null : "URL no formato https://<org>.crm.dynamics.com/")) : v;
}

// ---------- init ----------
async function init() {
    console.log(c.b("\n  dyn-alm init — novo repositório ALM\n"));
    if (!sh("pac", ["help"]).ok) T.fail("PAC CLI não encontrado (dotnet tool install --global Microsoft.PowerApps.CLI.Tool)");
    if (!sh("git", ["--version"]).ok) T.fail("Git não encontrado");

    const cwd = process.cwd();
    const zips = a.zip ? [path.resolve(a.zip)] : [cwd, path.join(cwd, "import")].filter(fs.existsSync)
        .flatMap((d) => fs.readdirSync(d).filter((f) => /\.zip$/i.test(f)).map((f) => path.join(d, f)));
    const origin = await choose("De onde vem a solution?", [
        ...zips.map((z) => ({ label: `Zip ${path.relative(cwd, z) || z}`, value: { mode: "from-zip", zip: z }, hint: "brownfield" })),
        { label: "Exportar direto do ambiente Dev", value: { mode: "from-env" }, hint: "brownfield" },
        { label: "Solution nova", value: { mode: "new" }, hint: "greenfield" },
        ...(zips.length ? [] : [{ label: "Tenho um zip em outro lugar", value: { mode: "from-zip" }, hint: "brownfield" }]),
    ]);
    const o = { mode: origin.mode, zip: origin.zip };
    let envs = null;
    const getEnvs = () => (envs = envs || pacEnvs());

    if (o.mode === "from-zip") {
        if (!o.zip) o.zip = path.resolve(await ask("Caminho do zip", null, (p) => (fs.existsSync(path.resolve(p)) ? null : "arquivo não encontrado")));
        const r = tool("inspect-solution.js", [o.zip, "--json"], { capture: true });
        if (r.status !== 0) T.fail(`Não consegui ler o zip:\n${r.stdout}${r.stderr}`);
        const info = JSON.parse(r.stdout);
        console.log(`\n  ${c.b(info.displayName)} (${info.uniqueName}) — ${info.version}, ${info.packageType}`);
        console.log(`  Publisher ${info.publisher.displayName} · prefixo ${info.publisher.prefix}_ · ${info.components.map((x) => `${x.count}× ${x.name}`).join(", ")}\n`);
        if (info.packageType === "Managed" && !(await confirm("O zip é MANAGED (o ideal é o unmanaged exportado do Dev). Continuar mesmo assim?", false))) process.exit(1);
        if (!info.onlyWebresources) console.log(`  ${c.warn} Componentes além de webresources ficam em solution/ e mudam via portal + sync.\n`);
        o.solution = info.uniqueName;
        o.base = await choose(`Versão base (precisa ser maior que ${info.version}; o 4º número recomeça no repo)`, bumps(info.version));
        o.dev = await chooseEnv("Qual é o ambiente Dev (de onde o CoE exporta)?", getEnvs());
    } else if (o.mode === "from-env") {
        o.dev = await chooseEnv("Qual é o ambiente Dev?", getEnvs());
        const sols = pacSolutions(o.dev);
        if (!sols.length) T.fail(`Não encontrei solutions não gerenciadas em ${o.dev} (login no PAC? pac auth create --environment ${o.dev})`);
        const sol = await choose("Qual solution?", sols.map((s) => ({ label: `${s.displayName} (${s.uniqueName})`, value: s, hint: s.version })));
        o.solution = sol.uniqueName;
        o.base = await choose(`Versão base (precisa ser maior que ${sol.version})`, bumps(sol.version));
    } else {
        const nameOk = (v) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(v) ? null : "letras, números e _ (sem espaço)");
        o.solution = await ask("Nome único da solution", null, nameOk);
        o.display = await ask("Nome de exibição", o.solution);
        o.publisher = await ask("Nome único do publisher", null, nameOk);
        o.publisherDisplay = await ask("Nome de exibição do publisher", o.publisher);
        o.prefix = await ask("Prefixo (ex.: abc → abc_/pasta/arquivo.js)", null, (v) => (/^[a-z][a-z0-9]{1,7}$/.test(v) ? null : "2-8 minúsculas/números, começando com letra"));
        o.base = await ask("Versão base", "1.0.0", (v) => (/^\d+\.\d+\.\d+$/.test(v) ? null : "formato X.Y.Z"));
        o.dev = await chooseEnv("Qual é o ambiente Dev?", getEnvs());
    }
    o.prod = await chooseEnv("Qual ambiente simula Homol/Prod?", getEnvs().filter((e) => e.url !== o.dev), true);

    const zipDir = o.zip && path.basename(path.dirname(o.zip)).toLowerCase() === "import" ? path.dirname(path.dirname(o.zip)) : null;
    o.target = path.resolve(await ask("Pasta do repositório", zipDir || path.join(os.homedir(), "source", "repos", kebab(o.solution))));

    console.log(`\n  ${c.b("Resumo")}
  Origem ......... ${{ new: "solution nova (greenfield)", "from-env": "exportada do Dev (brownfield)", "from-zip": `zip ${o.zip} (brownfield)` }[o.mode]}
  Solution ....... ${o.solution}${o.prefix ? ` · prefixo ${o.prefix}_` : ""} · versão base ${o.base}
  Dev ............ ${o.dev}
  Homol/Prod ..... ${o.prod || "(definir depois)"}
  Pasta .......... ${o.target}\n`);
    if (!(await confirm("Criar?"))) process.exit(1);

    const args = ["--target", o.target, "--mode", o.mode, "--dev-url", o.dev, "--base-version", o.base, "--commit"];
    if (o.prod) args.push("--prod-url", o.prod);
    if (o.mode === "from-zip") args.push("--zip", o.zip);
    else args.push("--solution", o.solution);
    if (o.mode === "new") args.push("--publisher", o.publisher, "--prefix", o.prefix, "--display", o.display, "--publisher-display", o.publisherDisplay);
    if (tool("scaffold.js", args).status !== 0) process.exit(1);
    spawnSync("npm", ["run", "-s", "build"], { cwd: o.target, stdio: "inherit", shell: process.platform === "win32" });

    console.log(`\n  ${c.b("Próximos passos")}
  cd "${o.target}"
  ${o.mode === "new" ? "npm run deploy -- dev            (instala a solution no Dev)" : "npm run drift -- dev             (o Dev tem algo mais novo que o repo? se sim: npm run sync -- dev --merge)\n  npm run deploy -- dev            (cria a linha de base deployed/dev)"}
  dyn-alm github create <dono/nome> (publica no GitHub — PRs e esteira precisam do remoto)
  dyn-alm jornada                  (mostra o próximo passo a qualquer momento)\n`);
}

// ---------- feature ----------
async function feature() {
    const r = tool("journey.js", ["--json"], { capture: true });
    const j = JSON.parse(r.stdout);
    if (!j.facts.isRepo) T.fail("Não é um repositório ALM (sem devops.config.json) — use dyn-alm init");
    if (!j.facts.release) T.fail("Nenhuma release aberta — o responsável abre com: npm run release:start -- X.Y.Z");
    if (sh("git", ["status", "--porcelain"]).out) T.fail("Há alterações não commitadas — commite ou faça stash antes");
    const type = await choose(`Nova branch a partir de ${j.facts.release.branch}:`, [
        { label: "feature", value: "feature", hint: "funcionalidade nova" },
        { label: "fix", value: "fix", hint: "correção de bug (Dev/Homol)" },
    ]);
    const name = await ask("Nome curto (kebab-case)", null, (v) => (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v) ? null : "ex.: validacao-cpf"));
    const branch = `${type}/${name}`;
    if (!sh("git", ["checkout", "-b", branch, j.facts.release.ref]).ok) T.fail(`Não consegui criar ${branch}`);
    console.log(`\n  ${c.ok} ${branch} criada a partir de ${j.facts.release.ref}\n  Edite src/webresources/ (webresource nova: npm run new-webresource -- <prefixo>_/pasta/arquivo.js)\n  Depois: dyn-alm jornada\n`);
}

// ---------- doctor ----------
function doctor() {
    const rows = [];
    const add = (ok, item, detail, fix) => rows.push({ ok, item, detail, fix });
    const node = process.versions.node;
    add(Number(node.split(".")[0]) >= 20 ? true : false, "Node ≥ 20", node, "instale Node 20+");
    const g = sh("git", ["--version"]); add(g.ok, "Git", g.out, "instale o Git");
    const p = sh("pac", ["help"]); add(p.ok, "PAC CLI", p.ok ? (p.out.split("\n").find((l) => /Version/i.test(l)) || "").trim() : "", "dotnet tool install --global Microsoft.PowerApps.CLI.Tool");
    const auth = sh("pac", ["auth", "list"]);
    add(auth.ok && /\[\d+\]/.test(auth.out) ? true : false, "Login PAC", auth.ok ? `${(auth.out.match(/\[\d+\]/g) || []).length} perfil(is)` : "", "pac auth create --name dev --environment <url>");
    // GitHub CLI: pré-requisito instalado manualmente (só avisamos).
    const ghc = JSON.parse(tool("github.js", ["check", "--json"], { capture: true }).stdout || "{}");
    add(ghc.gh ? true : "warn", "GitHub CLI (gh)", ghc.ghVersion || "", `${ghc.install} (cria o repo e abre PRs)`);
    if (ghc.gh) {
        add(ghc.loggedIn && ghc.workflowScope !== false ? true : "warn", "Login GitHub",
            ghc.loggedIn ? `${ghc.user}${ghc.workflowScope === false ? " (sem escopo workflow)" : ""}` : "",
            ghc.loggedIn ? "dyn-alm github login --refresh (o push de .github/workflows precisa)" : "dyn-alm github login");
    }
    const cfgPath = path.resolve("devops.config.json");
    if (fs.existsSync(cfgPath)) {
        const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
        for (const [env, e] of Object.entries(cfg.environments)) add(String(e.url).startsWith("TODO") ? "warn" : true, `URL ${env}`, e.url, "preencha em devops.config.json");
        const meta = path.resolve(".dyn-alm", "template.json");
        const v = fs.existsSync(meta) ? JSON.parse(fs.readFileSync(meta, "utf8")).version : null;
        add(v === T.VERSION ? true : "warn", "Versão do template", `${v || "?"} (kit ${T.VERSION})`, "dyn-alm upgrade");
        add(ghc.hasRemote ? true : "warn", "Remoto git", ghc.remoteUrl || "", `dyn-alm github create ${ghc.suggestedName || "<dono/nome>"} (PRs e esteira precisam)`);
        add(sh("git", ["rev-parse", "-q", "--verify", "refs/tags/deployed/dev"]).ok ? true : "warn", "Linha de base no Dev", "tag deployed/dev", "npm run drift -- dev  →  npm run deploy -- dev");
    } else {
        add("warn", "Repositório ALM", "não é (sem devops.config.json)", "dyn-alm init");
    }
    console.log("");
    for (const r of rows) console.log(`  ${r.ok === true ? c.ok : r.ok === "warn" ? c.warn : c.no} ${r.item.padEnd(22)} ${r.detail}${r.ok === true ? "" : c.dim(`  → ${r.fix}`)}`);
    console.log("");
    process.exit(rows.some((r) => r.ok === false) ? 1 : 0);
}

// ---------- roteamento ----------
const routes = {
    jornada: () => process.exit(tool("journey.js", rest).status),
    journey: () => routes.jornada(),
    init,
    feature,
    run: () => process.exit(tool("run.js", rest).status ?? 1),
    inspect: () => process.exit(tool("inspect-solution.js", rest).status),
    doctor,
    github: () => process.exit(tool("github.js", rest).status),
    upgrade: () => process.exit(tool("upgrade.js", rest.length ? rest : ["--target", "."]).status),
    template: () => process.exit(tool("build-template.js", rest).status),
    version: () => console.log(T.VERSION),
};
if (!cmd || cmd === "help" || cmd === "--help" || !routes[cmd]) {
    console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 13).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
    process.exit(cmd && !["help", "--help"].includes(cmd) ? 1 : 0);
}
Promise.resolve(routes[cmd]()).then(() => lines && process.exit(0), (e) => T.fail(e.stack || e.message));
