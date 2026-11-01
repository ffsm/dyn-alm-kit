// Funções compartilhadas pelos scripts da esteira.
const { spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "out");
const config = JSON.parse(fs.readFileSync(path.join(ROOT, "devops.config.json"), "utf8"));
const SOLUTION = config.solution.name;
const SOLUTION_DIR = path.join(ROOT, config.solution.folder);
// Fonte das webresources (o que o dev edita). Em solution/WebResources ficam só os .data.xml.
const SRC_WEBRESOURCES = path.join(ROOT, config.solution.webresources);

function log(msg) {
    console.log(`\x1b[36m▶ ${msg}\x1b[0m`);
}

function fail(msg, code = 1) {
    console.error(`\x1b[31m✖ ${msg}\x1b[0m`);
    process.exit(code);
}

// Executa um comando. capture=true devolve stdout em vez de mostrar no console.
function run(cmd, args, { cwd = ROOT, capture = false, allowFail = false } = {}) {
    const res = spawnSync(cmd, args, {
        cwd,
        encoding: "utf8",
        stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
        maxBuffer: 64 * 1024 * 1024,
    });
    if (res.error) fail(`Não foi possível executar ${cmd}: ${res.error.message}`);
    if (res.status !== 0 && !allowFail) {
        if (capture) process.stderr.write(res.stdout + res.stderr);
        fail(`${cmd} ${args.join(" ")} terminou com código ${res.status}`);
    }
    return { status: res.status, out: (res.stdout || "").trim(), err: (res.stderr || "").trim() };
}

const git = (args, opts = {}) => run("git", args, { capture: true, ...opts }).out;
const pac = (args, opts = {}) => run("pac", args, opts);

// Flags que recebem valor; todas as outras são booleanas.
const VALUE_FLAGS = new Set(["version", "zip", "display", "publisher", "prefix", "publisher-display", "from-zip"]);

function parseArgs(argv = process.argv.slice(2)) {
    const args = { _: [] };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (!a.startsWith("--")) { args._.push(a); continue; }
        const key = a.slice(2);
        if (!VALUE_FLAGS.has(key)) { args[key] = true; continue; }
        if (argv[i + 1] === undefined) fail(`--${key} precisa de um valor`);
        args[key] = argv[++i];
    }
    return args;
}

// ---------- Ambientes / autenticação ----------

function getEnv(name) {
    const env = config.environments[name];
    if (!env) fail(`Ambiente "${name}" não existe em devops.config.json (${Object.keys(config.environments).join(", ")})`);
    const url = process.env[`PP_URL_${name.toUpperCase()}`] || env.url;
    if (!url || url.startsWith("TODO")) fail(`Configure a URL do ambiente "${name}" em devops.config.json (ou PP_URL_${name.toUpperCase()})`);
    return { name, ...env, url };
}

// Em CI usa service principal (PP_APP_ID/PP_CLIENT_SECRET/PP_TENANT_ID).
// Local usa o perfil ativo do `pac auth` e direciona com --environment.
let spnReady = false;
function ensureAuth(env) {
    const { PP_APP_ID, PP_CLIENT_SECRET, PP_TENANT_ID } = process.env;
    if (!PP_APP_ID || spnReady) return;
    if (!PP_CLIENT_SECRET || !PP_TENANT_ID) fail("PP_APP_ID definido sem PP_CLIENT_SECRET/PP_TENANT_ID");
    log("Autenticando com service principal");
    run("pac", ["auth", "create", "--name", "esteira-ci", "--applicationId", PP_APP_ID,
        "--clientSecret", PP_CLIENT_SECRET, "--tenant", PP_TENANT_ID, "--environment", env.url], { capture: true });
    spnReady = true;
}

function solutionInstalled(env) {
    const { out } = run("pac", ["solution", "list", "--environment", env.url], { capture: true });
    return out.split(/\r?\n/).some((line) => line.trim().split(/\s+/)[0] === SOLUTION);
}

function exportSolution(env, zipPath, managed = false) {
    fs.mkdirSync(path.dirname(zipPath), { recursive: true });
    const args = ["solution", "export", "--name", SOLUTION, "--path", zipPath, "--environment", env.url, "--overwrite"];
    if (managed) args.push("--managed");
    pac(args);
}

// Sem packageType, tenta Unmanaged e depois Managed (o zip do CoE pode ser de qualquer tipo).
function unpack(zipPath, folder, packageType) {
    for (const type of packageType ? [packageType] : ["Unmanaged", "Managed"]) {
        fs.rmSync(folder, { recursive: true, force: true });
        const res = run("pac", ["solution", "unpack", "--zipfile", zipPath, "--folder", folder, "--packagetype", type],
            { capture: true, allowFail: !packageType });
        if (res.status === 0) return type;
    }
    fail(`Não foi possível desempacotar ${zipPath}`);
}

// ---------- Versão / rastreabilidade ----------

function gitInfo() {
    const commit = git(["rev-parse", "HEAD"]);
    return {
        commit,
        shortCommit: commit.slice(0, 7),
        branch: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || git(["rev-parse", "--abbrev-ref", "HEAD"]),
        tag: git(["tag", "--points-at", "HEAD", "--list", "v*"]).split("\n").filter(Boolean)[0] || null,
        dirty: git(["status", "--porcelain", "--", config.solution.folder, config.solution.webresources]) !== "",
        commitCount: Number(git(["rev-list", "--count", "HEAD"])),
    };
}

// Último tag de release (v*) alcançável a partir de HEAD, excluindo o próprio HEAD se pedido.
function lastReleaseTag({ excludeHead = false } = {}) {
    const head = git(["rev-parse", "HEAD"]);
    const tags = git(["tag", "--list", "v*", "--merged", "HEAD", "--sort=-v:refname"]).split("\n").filter(Boolean);
    for (const t of tags) {
        if (excludeHead && git(["rev-list", "-n", "1", t]) === head) continue;
        return t;
    }
    return null;
}

// Versão = <baseVersion do devops.config.json>.<nº de commits>
// O baseVersion é gravado pelo release:start na branch release/X.Y.Z, então features criadas
// a partir dela herdam a mesma versão. Mesmo commit ⇒ mesma versão.
function computeVersion(info = gitInfo()) {
    const base = config.solution.baseVersion;
    if (!/^\d+\.\d+\.\d+$/.test(base)) fail(`baseVersion inválido: ${base} (esperado X.Y.Z)`);
    const m = info.branch.match(/^release\/(\d+\.\d+\.\d+)$/);
    if (m && m[1] !== base) fail(`Branch ${info.branch} mas devops.config.json tem baseVersion ${base} — use npm run release:start`);
    return `${base}.${info.commitCount}`;
}

// ---------- Fluxo de release ----------

const RELEASE_RE = /^(?:origin\/)?release\/(\d+)\.(\d+)\.(\d+)$/;

// Nomes dos tipos de componente mais comuns do RootComponent (Solution.xml).
const COMPONENT_TYPES = {
    1: "tabela", 2: "coluna", 3: "relacionamento", 9: "conjunto de opções", 10: "relacionamento", 20: "função de segurança",
    26: "exibição", 29: "processo/fluxo", 59: "gráfico", 60: "formulário", 61: "webresource", 62: "mapa do site",
    66: "controle PCF", 80: "app model-driven", 90: "tipo de plugin", 91: "assembly de plugin", 92: "etapa de plugin",
    300: "canvas app", 371: "conector", 380: "variável de ambiente (definição)", 10112: "referência de conexão",
};
function componentTypeName(type) {
    return COMPONENT_TYPES[type] || `componente tipo ${type}`;
}

function compareVersions(a, b) {
    const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
    return 0;
}

// Release aberta = release/* (local ou origin) ainda não mesclada na main. É ela que o Dev deve refletir.
function openRelease() {
    const main = git(["rev-parse", "--verify", "-q", "refs/remotes/origin/main"], { allowFail: true }) ? "origin/main" : "main";
    const refs = git(["for-each-ref", "--format=%(refname:short)", "refs/heads/release/", "refs/remotes/origin/release/"])
        .split("\n").filter((r) => RELEASE_RE.test(r));
    const open = refs.filter((r) => run("git", ["merge-base", "--is-ancestor", r, main], { capture: true, allowFail: true }).status !== 0);
    open.sort((a, b) => compareVersions(b.replace(RELEASE_RE, "$1.$2.$3"), a.replace(RELEASE_RE, "$1.$2.$3")));
    const ref = open[0];
    return ref ? { ref, branch: ref.replace(/^origin\//, ""), version: ref.replace(RELEASE_RE, "$1.$2.$3"), main } : { ref: null, main };
}

// Commit de uma branch cuja versão de build é `version` (o 4º número = nº de commits).
function commitForVersion(ref, version) {
    const count = Number(version.split(".")[3]);
    for (const c of git(["rev-list", "--first-parent", ref]).split("\n")) {
        const n = Number(git(["rev-list", "--count", c]));
        if (n === count) return c;
        if (n < count) break;
    }
    return null;
}

function setSolutionVersion(solutionFolder, version) {
    const file = path.join(solutionFolder, "Other", "Solution.xml");
    const xml = fs.readFileSync(file, "utf8");
    fs.writeFileSync(file, xml.replace(/<Version>[^<]*<\/Version>/, `<Version>${version}</Version>`));
}

function getSolutionVersion(solutionFolder) {
    const xml = fs.readFileSync(path.join(solutionFolder, "Other", "Solution.xml"), "utf8");
    return (xml.match(/<Version>([^<]*)<\/Version>/) || [])[1];
}

// Commits e PRs entre duas referências. Reconhece merge commit ("Merge pull request #N")
// e squash merge ("Título (#N)") do GitHub.
function changesBetween(from, to = "HEAD") {
    const range = from ? `${from}..${to}` : to;
    const raw = git(["log", range, "--format=%H%x1f%an%x1f%aI%x1f%s%x1f%b%x1e"]);
    const commits = [];
    const pullRequests = [];
    for (const rec of raw.split("\x1e").map((r) => r.trim()).filter(Boolean)) {
        const [hash, author, date, subject, body] = rec.split("\x1f");
        commits.push({ hash, author, date, subject });
        let m = subject.match(/^Merge pull request #(\d+) from (\S+)/);
        if (m) {
            pullRequests.push({ number: Number(m[1]), title: (body || "").split("\n")[0].trim() || m[2], commit: hash });
            continue;
        }
        m = subject.match(/^(.*) \(#(\d+)\)$/);
        if (m) pullRequests.push({ number: Number(m[2]), title: m[1], commit: hash });
    }
    return { range, commits, pullRequests };
}

// ---------- Integridade ----------

function sha256File(file) {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

// Arquivos de uma árvore, com caminho relativo em formato "<prefixo>_/pasta/arquivo.js".
function listFiles(base) {
    const result = [];
    if (!fs.existsSync(base)) return result;
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else result.push(path.relative(base, full).split(path.sep).join("/"));
        }
    };
    walk(base);
    return result;
}

// Hash do conteúdo de cada webresource (chave = nome lógico). Aceita src/webresources
// ou a pasta WebResources de uma solution desempacotada (ignora os .data.xml).
function webresourceHashes(dir) {
    const result = {};
    for (const rel of listFiles(dir).filter((f) => !f.endsWith(".data.xml"))) {
        result[rel] = sha256File(path.join(dir, rel));
    }
    return result;
}

// Monta a solution completa em `target`: metadados de solution/ + conteúdo de src/webresources/.
// Falha se uma webresource não tiver o par arquivo ↔ .data.xml.
function assembleSolution(target) {
    fs.rmSync(target, { recursive: true, force: true });
    fs.cpSync(SOLUTION_DIR, target, { recursive: true });
    const metaDir = path.join(SOLUTION_DIR, "WebResources");
    const meta = new Set(listFiles(metaDir).filter((f) => f.endsWith(".data.xml")).map((f) => f.slice(0, -".data.xml".length)));
    const content = new Set(listFiles(SRC_WEBRESOURCES));

    const problems = [];
    for (const name of content) if (!meta.has(name)) problems.push(`${name}: sem metadados — rode \`npm run new-webresource -- ${name}\``);
    for (const name of meta) if (!content.has(name)) problems.push(`${name}: tem .data.xml mas falta ${config.solution.webresources}/${name}`);
    if (problems.length) fail(`Webresources inconsistentes:\n  - ${problems.join("\n  - ")}`);

    for (const name of content) {
        const dest = path.join(target, "WebResources", name);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(path.join(SRC_WEBRESOURCES, name), dest);
    }
    return target;
}

// Inverso do assemble: tira o conteúdo das webresources de uma solution desempacotada
// e coloca em `srcDir`, deixando em solutionFolder só os metadados.
function extractWebresources(solutionFolder, srcDir) {
    const wrDir = path.join(solutionFolder, "WebResources");
    fs.rmSync(srcDir, { recursive: true, force: true });
    for (const rel of listFiles(wrDir).filter((f) => !f.endsWith(".data.xml"))) {
        const dest = path.join(srcDir, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.renameSync(path.join(wrDir, rel), dest);
    }
}

function readBuildInfo() {
    const file = path.join(OUT, "build-info.json");
    if (!fs.existsSync(file)) fail("out/build-info.json não encontrado — rode `npm run build` antes");
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeBuildInfo(info) {
    fs.writeFileSync(path.join(OUT, "build-info.json"), JSON.stringify(info, null, 2) + "\n");
}

function timestamp() {
    return new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
}

module.exports = {
    ROOT, OUT, SOLUTION, SOLUTION_DIR, SRC_WEBRESOURCES, config,
    log, fail, run, git, pac, parseArgs,
    getEnv, ensureAuth, solutionInstalled, exportSolution, unpack,
    gitInfo, lastReleaseTag, computeVersion, setSolutionVersion, getSolutionVersion, changesBetween,
    compareVersions, openRelease, commitForVersion, componentTypeName,
    sha256File, listFiles, webresourceHashes, assembleSolution, extractWebresources,
    readBuildInfo, writeBuildInfo, timestamp,
};
