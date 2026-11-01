// Atualiza os arquivos gerenciados pela skill (scripts, workflows, comandos, docs/scripts.md)
// num repositório ALM existente. Não toca em solution/, src/, devops.config.json nem docs editáveis.
//
// Os scripts ficam copiados em cada repo de propósito: a esteira roda do checkout, um commit antigo
// rebuilda com os scripts dele e um bug no kit não derruba todos os repos de uma vez. Para não ter
// que atualizar repo por repo, use --all.
//
// Uso: node upgrade.js --target <repo>            (mostra o que mudaria)
//      node upgrade.js --target <repo> --apply    (aplica na branch atual; exige working tree limpa)
//      node upgrade.js --all [--root <pasta>]     (todos os repos ALM da pasta: mostra o que mudaria)
//      node upgrade.js --all --apply              (em cada repo: branch chore/kit-<versão> a partir da release
//                                                  aberta — ou da main —, aplica e commita; não faz push)
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const T = require("./template");

const a = T.parseArgs();
const git = (cwd, ...args) => {
    const r = spawnSync("git", args, { cwd, encoding: "utf8" });
    return { ok: r.status === 0 && !r.error, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
};

function isRepo(dir) {
    return fs.existsSync(path.join(dir, "devops.config.json"));
}

function readMeta(target) {
    const metaPath = path.join(target, ".dyn-alm", "template.json");
    return { metaPath, meta: fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf8")) : null };
}

// O que mudaria no working tree atual do repo.
function plan(target) {
    const config = JSON.parse(fs.readFileSync(path.join(target, "devops.config.json"), "utf8"));
    const solutionXml = fs.readFileSync(path.join(target, config.solution.folder, "Other", "Solution.xml"), "utf8");
    const vars = {
        SOLUTION: config.solution.name,
        PREFIX: (solutionXml.match(/<CustomizationPrefix>([^<]+)<\/CustomizationPrefix>/) || [])[1],
        DEV_URL: config.environments.dev.url,
        REPO: path.basename(target),
    };
    const { meta } = readMeta(target);
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
    // Sem template.json = repo de referência (o template é gerado dele) ou criado antes do kit.
    return { target, current: meta ? meta.version : "(desconhecida)", reference: !meta, changes };
}

function write(p) {
    for (const c of p.changes) {
        fs.mkdirSync(path.dirname(path.join(p.target, c.rel)), { recursive: true });
        fs.writeFileSync(path.join(p.target, c.rel), c.next);
    }
    // Repo de referência não tem template.json (é assim que é reconhecido): não cria.
    const { metaPath, meta } = readMeta(p.target);
    if (meta) fs.writeFileSync(metaPath, JSON.stringify({ ...meta, version: T.VERSION, upgradedAt: new Date().toISOString() }, null, 2) + "\n");
    return meta ? [path.relative(p.target, metaPath).split(path.sep).join("/")] : [];
}

function show(p) {
    console.log(`\n  ${c.b(path.basename(p.target))}  ${p.target}\n  Template no repo: ${p.current}${p.reference ? " (sem .dyn-alm/template.json — repo de referência?)" : ""}  →  kit: ${T.VERSION}`);
    if (!p.changes.length) console.log(`  ${c.ok} em dia`);
    for (const x of p.changes) console.log(`    ${x.kind === "novo" ? "+" : "~"} ${x.rel}`);
}
const c = { b: (s) => `\x1b[1m${s}\x1b[0m`, ok: "\x1b[32m✔\x1b[0m", warn: "\x1b[33m⚠\x1b[0m", no: "\x1b[31m✖\x1b[0m" };

// Base da branch de upgrade: a release aberta (é para lá que o PR vai), senão a main.
function baseRef(target) {
    const j = spawnSync("node", [path.join(__dirname, "journey.js"), "--json", "--cwd", target], { encoding: "utf8" });
    let rel = null;
    try { rel = JSON.parse(j.stdout).facts.release; } catch { /* sem jornada: usa a main */ }
    return rel ? rel.ref : git(target, "rev-parse", "-q", "--verify", "refs/remotes/origin/main").ok ? "origin/main" : "main";
}

// Em cada repo: branch chore/kit-<versão> a partir da base, aplica, commita e volta para a branch original.
function applyOnBranch(target) {
    const name = path.basename(target);
    if (git(target, "status", "--porcelain").out) return { name, result: `${c.warn} pulado: working tree com alterações (commit/stash e rode de novo)` };
    const branch = `chore/kit-${T.VERSION}`;
    if (git(target, "rev-parse", "-q", "--verify", `refs/heads/${branch}`).ok) return { name, result: `${c.warn} pulado: ${branch} já existe (mescle ou apague e rode de novo)` };
    const orig = git(target, "rev-parse", "--abbrev-ref", "HEAD").out;
    const base = baseRef(target);
    if (!git(target, "checkout", "-q", "-b", branch, base).ok) return { name, result: `${c.no} não consegui criar ${branch} a partir de ${base}` };
    try {
        const p = plan(target);
        if (!p.changes.length) {
            git(target, "checkout", "-q", orig);
            git(target, "branch", "-q", "-D", branch);
            return { name, result: `${c.ok} ${base} já está em dia` };
        }
        const extra = write(p);
        git(target, "add", "-A", "--", ...p.changes.map((x) => x.rel), ...extra);
        const msg = `chore: atualiza esteira ALM para o kit ${T.VERSION}\n\n${p.changes.map((x) => `${x.kind === "novo" ? "+" : "~"} ${x.rel}`).join("\n")}`;
        const commit = git(target, "commit", "-q", "-m", msg);
        if (!commit.ok) throw new Error(commit.err || "commit falhou");
        return { name, result: `${c.ok} ${branch} (a partir de ${base}): ${p.changes.length} arquivo(s) — PR para ${base.replace(/^origin\//, "")}` };
    } catch (e) {
        git(target, "reset", "-q", "--hard");
        return { name, result: `${c.no} falhou: ${e.message} (branch ${branch} ficou para análise)` };
    } finally {
        git(target, "checkout", "-q", orig);
    }
}

if (a.all) {
    // Pasta padrão: onde estão os repos (a pasta acima do kit, ex.: ~/source/repos).
    const kitParent = path.resolve(T.SKILL_DIR, "..", "..", "..");
    const root = path.resolve(a.root || (fs.existsSync(kitParent) ? kitParent : path.join(os.homedir(), "source", "repos")));
    const repos = fs.readdirSync(root, { withFileTypes: true })
        .filter((d) => d.isDirectory()).map((d) => path.join(root, d.name)).filter(isRepo);
    console.log(`\n  Repos ALM em ${root}: ${repos.length}`);
    const plans = repos.map(plan);
    plans.forEach(show);
    const pending = plans.filter((p) => p.changes.length);
    if (!pending.length) { console.log("\n  Todos em dia.\n"); process.exit(0); }
    if (!a.apply) { console.log(`\n  ${pending.length} repo(s) a atualizar (simulação — rode com --apply: cria chore/kit-${T.VERSION} em cada um e commita, sem push)\n`); process.exit(0); }
    console.log("\n  Aplicando:");
    const results = pending.map((p) => applyOnBranch(p.target));
    for (const r of results) console.log(`  ${r.name.padEnd(28)} ${r.result}`);
    console.log(`\n  Revise com git log/diff em cada repo; depois push + PR (dyn-alm github pr --base <release>).\n`);
    process.exit(results.some((r) => r.result.startsWith(c.no)) ? 1 : 0);
}

const target = path.resolve(a.target || ".");
if (!isRepo(target)) T.fail(`${target} não é um repositório ALM (sem devops.config.json)`);
const p = plan(target);
show(p);
if (!p.changes.length) process.exit(0);
if (!a.apply) { console.log("\n  (simulação — rode com --apply para aplicar)"); process.exit(0); }
if (git(target, "status", "--porcelain").out) T.fail("Working tree com alterações — commit/stash antes, para o upgrade ficar num diff limpo");
write(p);
console.log(`\n  ${p.changes.length} arquivo(s) atualizados. Revise com git diff e commite.` +
    "\n  Scripts novos podem precisar de entradas no package.json (veja docs/scripts.md).");
