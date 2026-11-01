// Atualiza um repositório ALM para o kit instalado. Não toca em solution/, src/, devops.config.json nem docs editáveis.
//
// Ferramentas (scripts/, .claude/commands/) ficam FORA do Git e vêm sempre do kit: os npm scripts chamam
// `dyn-alm run scripts/x.js`, que copia a versão do kit e executa. Num repo antigo, o upgrade faz essa
// migração uma vez (.gitignore, git rm --cached, package.json).
// O que continua versionado e é atualizado aqui: .github/workflows/ (o GitHub só lê workflows commitados),
// docs/scripts.md e .gitattributes.
// Repo de referência (sem .dyn-alm/template.json — o template é gerado dele) não migra: só recebe os arquivos.
//
// Uso: node upgrade.js --target <repo>            (mostra o que mudaria)
//      node upgrade.js --target <repo> --apply    (aplica na branch atual e deixa no stage; exige working tree limpa)
//      node upgrade.js --all [--root <pasta>]     (todos os repos ALM da pasta: mostra o que mudaria)
//      node upgrade.js --all --apply              (em cada repo: branch chore/kit-<versão> a partir da release aberta
//                                                  — ou da main —, aplica e commita; não faz push)
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const T = require("./template");

const a = T.parseArgs();
const c = { b: (s) => `\x1b[1m${s}\x1b[0m`, ok: "\x1b[32m✔\x1b[0m", warn: "\x1b[33m⚠\x1b[0m", no: "\x1b[31m✖\x1b[0m" };
const git = (cwd, ...args) => {
    const r = spawnSync("git", args, { cwd, encoding: "utf8" });
    return { ok: r.status === 0 && !r.error, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
};
const isRepo = (dir) => fs.existsSync(path.join(dir, "devops.config.json"));

function readMeta(target) {
    const metaPath = path.join(target, ".dyn-alm", "template.json");
    return { metaPath, meta: fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf8")) : null };
}

// O que mudaria no working tree atual do repo.
function plan(target) {
    const vars = T.repoVars(target);
    const reference = T.isReference(target);
    const { meta } = readMeta(target);
    return {
        target, reference,
        current: meta ? meta.version : "(desconhecida)",
        // referência mantém tudo no Git; os demais só versionam os gerenciados
        changes: T.diffFiles(target, reference ? [...T.MANAGED, ...T.TOOLS] : T.MANAGED, vars),
        tools: reference ? [] : T.diffFiles(target, T.TOOLS, vars),
        migrate: !reference && !T.toolsFromKit(target),
    };
}
const pending = (p) => p.changes.length > 0 || p.migrate;

function show(p) {
    console.log(`\n  ${c.b(path.basename(p.target))}  ${p.target}\n  Template no repo: ${p.current}${p.reference ? " (sem .dyn-alm/template.json — repo de referência: scripts continuam no Git)" : ""}  →  kit: ${T.VERSION}`);
    if (p.migrate) console.log("    » migra: scripts/ e .claude/commands/ saem do Git e passam a vir do kit (dyn-alm run)");
    for (const x of p.changes) console.log(`    ${x.kind === "novo" ? "+" : "~"} ${x.rel}`);
    if (!pending(p)) console.log(`  ${c.ok} em dia${p.tools.length ? ` (${p.tools.length} ferramenta(s) serão copiadas no próximo npm run)` : ""}`);
}

// Aplica no working tree e põe no stage. Devolve a mensagem de commit sugerida.
function apply(p) {
    const t = p.target;
    T.writeFiles(t, p.changes);
    const stage = p.changes.map((x) => x.rel);
    if (!p.reference) T.writeFiles(t, p.tools); // ferramentas: sempre a versão do kit (ignoradas pelo Git)
    if (p.migrate) {
        const gi = path.join(t, ".gitignore");
        const cur = fs.existsSync(gi) ? fs.readFileSync(gi, "utf8") : "";
        fs.writeFileSync(gi, `${cur}${cur && !cur.endsWith("\n") ? "\n" : ""}\n${T.TOOLS_GITIGNORE}`);
        git(t, "rm", "-r", "-q", "--cached", "--ignore-unmatch", "--", "scripts", ".claude/commands");
        const pkgPath = path.join(t, "package.json");
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        for (const [k, v] of Object.entries(pkg.scripts || {})) pkg.scripts[k] = v.replace(/^node (scripts\/\S+)/, "dyn-alm run $1");
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
        stage.push(".gitignore", "package.json");
    }
    const { metaPath, meta } = readMeta(t);
    if (meta) { // referência não ganha template.json (é a ausência dele que a identifica)
        fs.writeFileSync(metaPath, JSON.stringify({ ...meta, version: T.VERSION, upgradedAt: new Date().toISOString() }, null, 2) + "\n");
        stage.push(".dyn-alm/template.json");
    }
    if (stage.length) git(t, "add", "--", ...stage);
    const lines = [...(p.migrate ? ["scripts/ e .claude/commands/ saem do Git: vêm do kit via dyn-alm run"] : []),
        ...p.changes.map((x) => `${x.kind === "novo" ? "+" : "~"} ${x.rel}`)];
    return `${p.migrate ? `chore: scripts passam a vir do kit dyn-alm ${T.VERSION}` : `chore: atualiza esteira ALM para o kit ${T.VERSION}`}\n\n${lines.join("\n")}`;
}

// Base da branch de upgrade: a release aberta (é para lá que o PR vai), senão a main.
function baseRef(target) {
    const j = spawnSync(process.execPath, [path.join(__dirname, "journey.js"), "--json", "--cwd", target], { encoding: "utf8" });
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
        if (!pending(p)) {
            git(target, "checkout", "-q", orig);
            git(target, "branch", "-q", "-D", branch);
            return { name, result: `${c.ok} ${base} já está em dia` };
        }
        const msg = apply(p);
        const commit = git(target, "commit", "-q", "-m", msg);
        if (!commit.ok) throw new Error(commit.err || "commit falhou");
        return { name, result: `${c.ok} ${branch} (a partir de ${base})${p.migrate ? " — migrado para scripts do kit" : ""}: PR para ${base.replace(/^origin\//, "")}` };
    } catch (e) {
        git(target, "reset", "-q", "--hard");
        return { name, result: `${c.no} falhou: ${e.message} (branch ${branch} ficou para análise)` };
    } finally {
        git(target, "checkout", "-q", orig);
        // de volta à branch original: se ela ainda versiona scripts/, o checkout já os restaurou; se não, recopia
        const p2 = plan(target);
        if (!p2.reference && T.toolsFromKit(target)) T.writeFiles(target, p2.tools);
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
    const todo = plans.filter(pending);
    if (!todo.length) { console.log("\n  Todos em dia.\n"); process.exit(0); }
    if (!a.apply) { console.log(`\n  ${todo.length} repo(s) a atualizar (simulação — rode com --apply: cria chore/kit-${T.VERSION} em cada um e commita, sem push)\n`); process.exit(0); }
    console.log("\n  Aplicando:");
    const results = todo.map((p) => applyOnBranch(p.target));
    for (const r of results) console.log(`  ${r.name.padEnd(28)} ${r.result}`);
    console.log(`\n  Revise com git log/diff em cada repo; depois push + PR (dyn-alm github pr --base <release>).\n`);
    process.exit(results.some((r) => r.result.startsWith(c.no)) ? 1 : 0);
}

const target = path.resolve(a.target || ".");
if (!isRepo(target)) T.fail(`${target} não é um repositório ALM (sem devops.config.json)`);
const p = plan(target);
show(p);
if (!pending(p)) process.exit(0);
if (!a.apply) { console.log("\n  (simulação — rode com --apply para aplicar)"); process.exit(0); }
if (git(target, "status", "--porcelain").out) T.fail("Working tree com alterações — commit/stash antes, para o upgrade ficar num diff limpo");
const msg = apply(p);
console.log(`\n  Aplicado e no stage. Revise com git diff --cached e commite, por exemplo:\n    git commit -m "${msg.split("\n")[0]}"\n`);
