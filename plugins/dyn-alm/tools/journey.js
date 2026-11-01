// Detecta em que ponto da jornada o dev está e quais são os próximos passos.
// Usado pelo `dyn-alm jornada` (terminal, mostra o comando de cada passo) e pelo /dyn-alm:jornada (Claude Code).
// Só lê git e arquivos locais (rápido, não acessa o ambiente). O estado do Dev vem da tag deployed/dev.
//
// Uso: node journey.js [--json] [--cwd <pasta>]
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const T = require("./template");

const a = T.parseArgs();
const cwd = path.resolve(a.cwd || ".");
const sh = (cmd, args) => {
    const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
    return { ok: r.status === 0, out: (r.stdout || "").trim() };
};
const git = (...args) => sh("git", args);

const STAGES = ["Preparar", "Desenvolver", "Testar no Dev", "PR para a release", "Dev = release (PRONTO p/ CoE)", "CoE leva para Homol/Prod", "Fechar release"];
const state = { cwd, stage: 1, facts: {}, warnings: [], actions: [] };
const f = state.facts;
const act = (id, label, why, how) => state.actions.push({ id, label, why, how });

// ---------- Repo ALM? ----------
const configPath = path.join(cwd, "devops.config.json");
f.isRepo = fs.existsSync(configPath);
f.zips = [cwd, path.join(cwd, "import")].filter(fs.existsSync)
    .flatMap((d) => fs.readdirSync(d).filter((x) => /\.zip$/i.test(x)).map((x) => path.relative(cwd, path.join(d, x))));
f.pacProfiles = (() => {
    const r = sh("pac", ["auth", "list"]);
    return r.ok ? r.out.split("\n").filter((l) => /^\[\d+\]/.test(l.trim())).length : null;
})();
if (f.pacProfiles === null) state.warnings.push("PAC CLI não encontrado");
else if (f.pacProfiles === 0) state.warnings.push("Sem login no PAC — pac auth create --name dev --environment <url>");

if (!f.isRepo) {
    if (f.zips.length) act("init-zip", `Criar o repositório a partir de ${f.zips[0]}`, "achei um zip de solution nesta pasta (brownfield)", { skill: "init", args: f.zips[0] });
    act("init-env", "Criar o repositório exportando a solution do Dev", "solution já existe no ambiente (brownfield)", { skill: "init", section: "4b" });
    act("init-new", "Criar o repositório com uma solution nova", "greenfield", { skill: "init", section: "4c" });
    finish();
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const solDirs = [config.solution.folder, config.solution.webresources];
f.solution = config.solution.name;
f.devUrlConfigured = !String(config.environments.dev.url).startsWith("TODO");
if (!f.devUrlConfigured) state.warnings.push("URL do Dev não configurada em devops.config.json");

// ---------- Git ----------
f.branch = git("rev-parse", "--abbrev-ref", "HEAD").out;
f.dirty = git("status", "--porcelain", "--", ...solDirs).out !== "";
f.hasRemote = git("remote", "get-url", "origin").ok;
const mainRef = git("rev-parse", "-q", "--verify", "refs/remotes/origin/main").ok ? "origin/main" : "main";
const RELEASE_RE = /^(?:origin\/)?release\/(\d+\.\d+\.\d+)$/;
const releases = git("for-each-ref", "--format=%(refname:short)", "refs/heads/release/", "refs/remotes/origin/release/").out
    .split("\n").filter((r) => RELEASE_RE.test(r))
    .filter((r) => !git("merge-base", "--is-ancestor", r, mainRef).ok);
const relRef = releases.find((r) => !r.startsWith("origin/")) || releases[0] || null;
f.release = relRef ? { ref: relRef, branch: relRef.replace(/^origin\//, ""), version: relRef.replace(RELEASE_RE, "$1") } : null;
f.lastTag = git("tag", "--list", "v*", "--sort=-v:refname").out.split("\n")[0] || null;

// ---------- Dev (pela tag deployed/dev) ----------
const tag = "deployed/dev";
if (git("rev-parse", "-q", "--verify", `refs/tags/${tag}`).ok) {
    const subject = git("tag", "-l", "--format=%(contents:subject)", tag).out;
    const m = subject.match(/(\d+\.\d+\.\d+\.\d+) em dev(?: — (\S+) por (.+?) —)?/) || [];
    const commit = git("rev-list", "-n", "1", tag).out;
    f.dev = { commit: commit.slice(0, 7), version: m[1] || null, branch: m[2] || null, author: m[3] || null };
    const same = (ref) => git("diff", "--quiet", commit, ref, "--", ...solDirs).ok;
    f.dev.hasHead = same("HEAD");
    // Mesmo conteúdo não basta: a versão no Dev precisa ser da release (é a que o CoE vai exportar).
    f.dev.hasRelease = f.release ? same(f.release.ref) && !!f.dev.version && f.dev.version.startsWith(`${f.release.version}.`) : null;
    // Dev com branch não mesclada de outra pessoa?
    const removed = git("log", "--format=%h", `HEAD..${commit}`, "--", ...solDirs).out;
    f.dev.foreignWork = removed !== "" && !(f.release && git("merge-base", "--is-ancestor", commit, f.release.ref).ok);
    if (f.dev.foreignWork) state.warnings.push(`Dev está com ${f.dev.branch || f.dev.commit}${f.dev.author ? ` (${f.dev.author})` : ""}, que não está na sua branch nem na release`);
} else {
    f.dev = null;
    state.warnings.push("Sem tag deployed/dev — o primeiro deploy cria a linha de base do drift");
}

// ---------- Etapa e próximos passos ----------
const isWork = /^(feature|fix)\//.test(f.branch);
if (!f.release) {
    state.stage = 1;
    act("release-start", "Abrir a release do ciclo", `nenhuma release aberta (último: ${f.lastTag || "nenhum"}) — features saem dela`, { skill: "release", section: "Abrir" });
    if (!f.dev) act("baseline", "Criar a linha de base no Dev (primeiro deploy)", "sem tag deployed/dev", { skill: "init", section: "8" });
} else if (isWork) {
    // Mesclada = a ponta da branch está na release, mas entrou por merge (não está na linha principal dela).
    // Branch recém-criada também está "na release", só que na linha principal.
    const head = git("rev-parse", "HEAD").out;
    const reachable = git("merge-base", "--is-ancestor", "HEAD", f.release.ref).ok;
    const onReleaseLine = git("rev-list", "--first-parent", f.release.ref).out.split("\n").includes(head);
    f.work = {
        ahead: Number(git("rev-list", "--count", `${f.release.ref}..HEAD`).out),
        behind: Number(git("rev-list", "--count", `HEAD..${f.release.ref}`).out),
        merged: reachable && !onReleaseLine,
    };
    if (f.work.merged) {
        state.stage = 5;
        act("back-to-release", `Voltar para ${f.release.branch} e atualizar o Dev`, "sua branch já foi mesclada na release", { skill: "jornada", section: "dev-release" });
    } else if (f.dirty || f.work.ahead === 0) {
        state.stage = 2;
        act("commit-test", "Commitar e testar no Dev", f.dirty ? "há alterações não commitadas em src/ ou solution/" : "branch sem commits ainda — edite src/ e commite", { skill: "feature", section: "2a passo 6" });
        act("add", "Adicionar uma webresource", "precisa de arquivo novo", { skill: "add" });
    } else if (!f.dev || !f.dev.hasHead) {
        state.stage = 3;
        act("test-dev", "Testar no Dev (build + deploy)", `${f.work.ahead} commit(s) que o Dev ainda não tem`, { skill: "feature", section: "2a passo 6" });
        act("pr", "Pular o teste e abrir o PR", "mudança trivial", { skill: "feature", section: "2c" });
    } else {
        state.stage = 4;
        act("pr", `Abrir o PR para ${f.release.branch}`, "o Dev está com a sua versão — testou? então PR", { skill: "feature", section: "2c" });
        act("commit-test", "Continuar ajustando", "achou algo no teste", { skill: "feature", section: "2a passo 6" });
    }
    if (f.work.behind > 0) act("update", `Atualizar a branch com ${f.release.branch}`, `a release avançou ${f.work.behind} commit(s) desde que você saiu dela`, { skill: "feature", section: "2b" });
} else {
    // main ou release (ou outra branch): visão de quem integra/entrega
    if (!f.dev || !f.dev.hasRelease) {
        state.stage = 5;
        act("dev-release", `Atualizar o Dev com ${f.release.branch}`, "o Dev não reflete a ponta da release (o CoE exporta do Dev)", { skill: "jornada", section: "dev-release" });
    } else {
        state.stage = 6;
        act("status", "Conferir se o Dev está PRONTO para o CoE", `Dev = ${f.release.branch} (${f.dev.version})`, { skill: "release", section: "Status" });
        act("finish", "Fechar a release (o CoE já levou para produção)", "tag + PR para a main", { skill: "release", section: "Fechar" });
    }
    act("feature-start", "Começar uma feature ou fix", `a partir de ${f.release.branch}`, { skill: "feature", section: "2a" });
}
// Sem remoto não há PR nem esteira: publicar vem antes do PR.
if (!f.hasRemote) {
    state.warnings.push("Sem remoto origin — PR e esteira precisam do repositório no GitHub (dyn-alm github create <dono>/<nome>)");
    if (state.actions.some((x) => x.id === "pr")) {
        state.actions.unshift({ id: "publish", label: "Publicar o repositório no GitHub", why: "sem remoto origin — o PR precisa dele", how: { skill: "init", section: "9" } });
    }
}
finish();

// Comando de terminal de cada ação — é o que o dev sem IA executa.
function commandFor(id) {
    const rel = f.release && f.release.branch;
    const devFromRelease = rel ? `git checkout ${rel} && ${f.hasRemote ? "git pull && " : ""}npm run build && npm run deploy -- dev` : null;
    return {
        "init-zip": `dyn-alm init --zip "${f.zips[0]}"`,
        "init-env": "dyn-alm init   (escolha: direto do ambiente Dev)",
        "init-new": "dyn-alm init   (escolha: solution nova)",
        "release-start": "npm run release:start -- X.Y.Z",
        baseline: "npm run drift -- dev   →  sem drift?  npm run build && npm run deploy -- dev",
        "back-to-release": devFromRelease,
        "dev-release": devFromRelease,
        "commit-test": 'git add src solution && git commit -m "<o que mudou>" && npm run build && npm run deploy -- dev',
        add: "npm run new-webresource -- <prefixo>_/pasta/arquivo.js",
        "test-dev": "npm run build && npm run deploy -- dev",
        publish: `dyn-alm github create <dono>/${path.basename(cwd)}   (privado; --public se for o caso)`,
        pr: `dyn-alm github pr --base ${rel}   (sem gh: git push -u origin ${f.branch} e abra o PR para ${rel})`,
        update: rel ? `git merge ${f.release.ref}` : null,
        status: "npm run status -- dev",
        finish: "npm run release:finish",
        "feature-start": "dyn-alm feature",
    }[id] || null;
}

function finish() {
    for (const x of state.actions) x.cmd = commandFor(x.id);
    if (a.json) {
        console.log(JSON.stringify({ ...state, stageName: STAGES[state.stage - 1], stages: STAGES }, null, 2));
        process.exit(0);
    }
    const detail = {
        1: f.isRepo ? `${f.solution}${f.release ? ` · release ${f.release.version}` : " · sem release aberta"}` : "repositório ainda não criado",
        2: f.branch && /^(feature|fix)\//.test(f.branch) ? `${f.branch}${f.dirty ? " · alterações não commitadas" : ""}` : "",
        3: f.dev ? `Dev: ${f.dev.version || f.dev.commit}${f.dev.branch ? ` (${f.dev.branch})` : ""}` : "",
    };
    console.log(`\n  Jornada${f.solution ? ` — ${f.solution}` : ""}${f.branch ? ` · ${f.branch}` : ""}\n`);
    STAGES.forEach((name, i) => {
        const n = i + 1;
        const mark = n < state.stage ? "✔" : n === state.stage ? "▶" : "○";
        console.log(`  ${mark} ${n} ${name.padEnd(30)} ${detail[n] || ""}`);
    });
    for (const w of state.warnings) console.log(`\n  ⚠ ${w}`);
    console.log("\n  Próximos passos:");
    state.actions.forEach((x, i) => {
        console.log(`  ${i === 0 ? "→" : " "} ${x.label}  — ${x.why}`);
        if (x.cmd) console.log(`      $ ${x.cmd}`);
    });
    console.log("");
    process.exit(0);
}
