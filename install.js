#!/usr/bin/env node
// Instala o kit dyn-alm nesta máquina. Rode da pasta do kit:
//
//   node install.js              instala a CLI `dyn-alm` (global) e, se houver Claude Code, o plugin
//   node install.js --update     atualiza (git pull se houver remoto + plugin)
//   node install.js --uninstall  remove a CLI e o plugin
//
// No Windows também dá para dar dois cliques em install.cmd. Pode rodar de novo sem problema.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const KIT = __dirname;
const MARKETPLACE = "dyn-alm-kit";
const PLUGIN = `dyn-alm@${MARKETPLACE}`;
const args = process.argv.slice(2);
const win = process.platform === "win32";

const ok = (m) => console.log(`  \x1b[32m✔\x1b[0m ${m}`);
const warn = (m) => console.log(`  \x1b[33m⚠\x1b[0m ${m}`);
const fail = (m) => { console.error(`  \x1b[31m✖\x1b[0m ${m}`); process.exit(1); };
const step = (m) => console.log(`\n\x1b[1m${m}\x1b[0m`);

// npm é um .cmd no Windows e só roda via shell: monta a linha já com as aspas
// (passar argumentos soltos com shell: true é inseguro e o Node avisa).
function run(cmd, cmdArgs, { quiet = true } = {}) {
    const opts = { cwd: KIT, encoding: "utf8", stdio: quiet ? "pipe" : "inherit" };
    const r = win
        ? spawnSync([cmd, ...cmdArgs.map((x) => (/[\s"&|<>^]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x))].join(" "), { ...opts, shell: true })
        : spawnSync(cmd, cmdArgs, opts);
    return { ok: r.status === 0 && !r.error, out: `${r.stdout || ""}${r.stderr || ""}`.trim() };
}
// o PAC não aceita --version; "pac help" é a checagem que funciona
const has = (cmd) => run(cmd, [cmd === "pac" ? "help" : "--version"]).ok;
const version = () => JSON.parse(fs.readFileSync(path.join(KIT, "plugins", "dyn-alm", ".claude-plugin", "plugin.json"), "utf8")).version;

function prereqs() {
    step("Pré-requisitos");
    const major = Number(process.versions.node.split(".")[0]);
    if (major < 20) fail(`Node ${process.versions.node} — precisa de 20 ou mais`);
    ok(`Node ${process.versions.node}`);
    if (!has("git")) fail("Git não encontrado"); ok("Git");
    if (has("pac")) ok("PAC CLI");
    else warn("PAC CLI não encontrado — necessário para falar com o Dataverse: dotnet tool install --global Microsoft.PowerApps.CLI.Tool");
    // Só avisa (o dev instala manualmente). Mesma checagem do `dyn-alm github check`: acha o gh fora do PATH.
    const ghc = (() => {
        const r = spawnSync(process.execPath, [path.join(KIT, "plugins", "dyn-alm", "tools", "github.js"), "check", "--json"], { cwd: KIT, encoding: "utf8" });
        try { return JSON.parse(r.stdout); } catch { return {}; }
    })();
    if (!ghc.gh) warn(`GitHub CLI (gh) não encontrado — necessário para publicar o repo e abrir PRs: ${ghc.install || "instale manualmente (https://cli.github.com)"}`);
    else if (!ghc.loggedIn) warn(`GitHub CLI ${ghc.ghVersion} sem login — depois da instalação: dyn-alm github login`);
    else if (ghc.workflowScope === false) warn(`GitHub CLI logado como ${ghc.user}, sem o escopo workflow (o push dos repos ALM falharia) — depois: dyn-alm github login --refresh`);
    else ok(`GitHub CLI ${ghc.ghVersion} (logado como ${ghc.user})`);
    const claude = has("claude");
    claude ? ok("Claude Code (o plugin será instalado)") : warn("Claude Code não encontrado — instalo só a CLI (o plugin pode ser instalado depois rodando isto de novo)");
    return { claude };
}

function installCli() {
    step("CLI dyn-alm");
    const r = run("npm", ["install", "-g", KIT]);
    if (!r.ok) fail(`npm install -g falhou:\n${r.out}`);
    const v = run("dyn-alm", ["version"]);
    if (!v.ok) fail("dyn-alm não ficou no PATH — confira a pasta global do npm (npm prefix -g)");
    ok(`dyn-alm ${v.out} (link para ${KIT}: atualizar o kit atualiza a CLI)`);
}

// A cópia do plugin no cache do Claude Code é diferente de plugins/dyn-alm? (sem cópia/sem registro = diferente)
function pluginStale() {
    const reg = path.join(require("os").homedir(), ".claude", "plugins", "installed_plugins.json");
    let cache;
    try { cache = JSON.parse(fs.readFileSync(reg, "utf8")).plugins[PLUGIN][0].installPath; } catch { return true; }
    const src = path.join(KIT, "plugins", "dyn-alm");
    const list = (base, dir = base) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? list(base, path.join(dir, e.name)) : [path.relative(base, path.join(dir, e.name))]);
    if (!fs.existsSync(cache)) return true;
    const a = list(src).sort(), b = list(cache).sort();
    if (a.join("\n") !== b.join("\n")) return true;
    return a.some((f) => !fs.readFileSync(path.join(src, f)).equals(fs.readFileSync(path.join(cache, f))));
}

function installPlugin() {
    step("Plugin do Claude Code");
    const markets = run("claude", ["plugin", "marketplace", "list"]).out;
    if (markets.includes(MARKETPLACE)) ok(`marketplace ${MARKETPLACE} já configurado`);
    else {
        const r = run("claude", ["plugin", "marketplace", "add", KIT]);
        if (!r.ok) fail(`claude plugin marketplace add falhou:\n${r.out}`);
        ok(`marketplace ${MARKETPLACE} adicionado`);
    }
    const plugins = run("claude", ["plugin", "list"]).out;
    if (plugins.includes(PLUGIN)) {
        run("claude", ["plugin", "update", PLUGIN]);
        // O Claude Code usa uma cópia do plugin (cache) e só a renova quando a versão muda:
        // se o conteúdo do kit mudou sem subir a versão, reinstala para a cópia ficar igual à pasta.
        if (pluginStale()) {
            run("claude", ["plugin", "uninstall", PLUGIN]);
            const r = run("claude", ["plugin", "install", PLUGIN]);
            if (!r.ok) fail(`claude plugin install falhou:\n${r.out}`);
            ok(`plugin ${PLUGIN} reinstalado (a cópia do Claude Code estava diferente da pasta do kit)`);
        } else ok(`plugin ${PLUGIN} já instalado (igual à pasta do kit)`);
    } else {
        const r = run("claude", ["plugin", "install", PLUGIN]);
        if (!r.ok) fail(`claude plugin install falhou:\n${r.out}`);
        ok(`plugin ${PLUGIN} instalado`);
    }
}

function update(env) {
    step("Atualizando o kit");
    if (run("git", ["remote", "get-url", "origin"]).ok) {
        const r = run("git", ["pull", "--ff-only"]);
        r.ok ? ok("git pull") : fail(`git pull falhou:\n${r.out}`);
    } else {
        warn("kit sem remoto (só local) — nada para baixar");
    }
    installCli();
    if (env.claude) {
        run("claude", ["plugin", "marketplace", "update", MARKETPLACE]);
        installPlugin();
    }
}

function uninstall() {
    step("Removendo o kit");
    if (has("claude")) {
        run("claude", ["plugin", "uninstall", PLUGIN]).ok ? ok(`plugin ${PLUGIN} removido`) : warn("plugin não estava instalado");
        run("claude", ["plugin", "marketplace", "remove", MARKETPLACE]).ok ? ok(`marketplace ${MARKETPLACE} removido`) : warn("marketplace não estava configurado");
    }
    run("npm", ["uninstall", "-g", "dyn-alm-kit"]).ok ? ok("CLI dyn-alm removida") : warn("CLI não estava instalada");
    console.log("\n  A pasta do kit não foi apagada. Repos de solution já criados continuam funcionando (os scripts ficam neles).\n");
}

console.log(`\n\x1b[1mdyn-alm-kit ${version()}\x1b[0m — ${KIT}`);
if (args.includes("--uninstall")) {
    uninstall();
} else {
    const env = prereqs();
    if (args.includes("--update")) update(env);
    else { installCli(); if (env.claude) installPlugin(); }
    step("Pronto");
    console.log(`  Terminal ........ dyn-alm jornada   (dentro de um repo de solution; dyn-alm init para criar um)
  Claude Code ..... abra uma sessão NOVA e digite /dyn-alm:jornada
  Atualizar ....... node install.js --update
  Documentação .... ${path.join(KIT, "README.md")}\n`);
}
