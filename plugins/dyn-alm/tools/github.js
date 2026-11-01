// Publica o repositório ALM no GitHub e abre PRs pelo GitHub CLI (gh).
// Usado pelo `dyn-alm github …` (terminal) e pelos wizards do Claude Code (init §9, feature §2c).
//
// Uso:
//   node github.js check [--json]                         gh instalado? logado? remoto origin?
//   node github.js login [--refresh]                       login no navegador (código de uso único) com o escopo
//                                                          workflow; --refresh só acrescenta o escopo a um login existente
//   node github.js create <dono/nome> [--public]           cria o repo (privado por padrão), configura origin e
//                                                          publica main, release/* abertas, a branch atual e as tags
//   node github.js pr [--base <branch>] [--title "…"] [--body "…"]   push da branch atual + PR (base: release aberta)
//
// O gh é pré-requisito instalado manualmente pelo dev (o kit não instala nada). Recém-instalado, não aparece
// no PATH de terminais já abertos: procuramos também nos locais padrão. Instalado em outra pasta (sem admin)?
// DYN_ALM_GH=<caminho do gh.exe>. DYN_ALM_GH=none simula "gh ausente" (testes).
//
// Escopo workflow: o repo tem .github/workflows/ e o GitHub recusa o push sem ele — checado ANTES de criar o repo.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const T = require("./template");

const [sub, ...rest] = process.argv.slice(2);
const a = T.parseArgs(rest);
const cwd = path.resolve(a.cwd || ".");
const sh = (cmd, args, opts = {}) => {
    const r = spawnSync(cmd, args, { cwd, encoding: "utf8", stdio: opts.inherit ? "inherit" : "pipe" });
    return { ok: r.status === 0 && !r.error, status: r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
};
const git = (...args) => sh("git", args);

function findGh() {
    const forced = process.env.DYN_ALM_GH;
    if (forced) return forced !== "none" && sh(forced, ["--version"]).ok ? forced : null;
    const cands = ["gh"];
    if (process.platform === "win32") {
        cands.push(
            path.join(process.env.ProgramFiles || "C:\\Program Files", "GitHub CLI", "gh.exe"),
            path.join(process.env.LOCALAPPDATA || "", "Programs", "GitHub CLI", "gh.exe"),
            path.join(process.env.USERPROFILE || "", "scoop", "shims", "gh.exe"));
    } else {
        cands.push("/opt/homebrew/bin/gh", "/usr/local/bin/gh", "/usr/bin/gh");
    }
    return cands.find((c) => (c === "gh" || fs.existsSync(c)) && sh(c, ["--version"]).ok) || null;
}

function check() {
    const gh = findGh();
    const auth = gh ? sh(gh, ["auth", "status", "--hostname", "github.com"]) : null;
    const user = auth && auth.ok ? sh(gh, ["api", "user", "--jq", ".login"]).out || null : null;
    // "Token scopes: 'gist', 'repo'" — linha ausente (token fine-grained, GH_TOKEN) = desconhecido, não bloqueia.
    const scopesLine = auth && auth.ok ? (`${auth.out}\n${auth.err}`.match(/Token scopes:\s*(.*)/) || [])[1] : undefined;
    const scopes = scopesLine === undefined ? null : scopesLine.split(",").map((x) => x.trim().replace(/^'|'$/g, "")).filter(Boolean);
    const remote = git("remote", "get-url", "origin");
    return {
        gh,
        ghVersion: gh ? (sh(gh, ["--version"]).out.split("\n")[0] || "").replace(/^gh version /, "") : null,
        loggedIn: !!(auth && auth.ok),
        user,
        scopes,
        workflowScope: scopes ? scopes.includes("workflow") : null,
        hasRemote: remote.ok,
        remoteUrl: remote.ok ? remote.out : null,
        suggestedName: `${user || "<dono>"}/${path.basename(git("rev-parse", "--show-toplevel").out || cwd)}`,
        install: "instale manualmente o GitHub CLI (https://cli.github.com) e abra um terminal novo",
    };
}

function requireGh(c = check(), { workflow = false } = {}) {
    if (!c.gh) T.fail(`GitHub CLI (gh) não encontrado — ${c.install}`);
    if (!c.loggedIn) T.fail(`gh não está logado — rode: dyn-alm github login`);
    if (workflow && c.workflowScope === false) {
        T.fail("O login do gh não tem o escopo workflow — o GitHub recusaria o push de .github/workflows/.\n" +
            "  Rode: dyn-alm github login --refresh   (nada foi criado no GitHub)");
    }
    return c;
}

// Release aberta (mesma regra do journey/lib: release/* que ainda não está na main).
function openRelease() {
    const j = spawnSync("node", [path.join(__dirname, "journey.js"), "--json", "--cwd", cwd], { encoding: "utf8" });
    try { return JSON.parse(j.stdout).facts.release; } catch { return null; }
}

const cmds = {
    check() {
        const c = check();
        if (a.json) return console.log(JSON.stringify(c, null, 2));
        console.log(`
  GitHub CLI ..... ${c.gh ? `${c.ghVersion} (${c.gh})` : `não encontrado — ${c.install}`}
  Login .......... ${c.loggedIn ? `${c.user || "ok"}${c.workflowScope === false ? " — sem escopo workflow: dyn-alm github login --refresh" : ""}` : c.gh ? "não logado — dyn-alm github login" : "-"}
  Remoto origin .. ${c.hasRemote ? c.remoteUrl : `não configurado — dyn-alm github create ${c.suggestedName}`}
`);
    },

    login() {
        const gh = findGh() || T.fail(`GitHub CLI (gh) não encontrado — ${check().install}`);
        console.log("Abra a URL abaixo no navegador e digite o código de uso único.\n");
        const logged = sh(gh, ["auth", "status", "--hostname", "github.com"]).ok;
        const r = a.refresh && logged
            ? sh(gh, ["auth", "refresh", "--hostname", "github.com", "--scopes", "workflow"], { inherit: true })
            : sh(gh, ["auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web", "--scopes", "workflow"], { inherit: true });
        if (!r.ok) process.exit(r.status || 1);
        sh(gh, ["auth", "setup-git"], { inherit: true });
    },

    create() {
        const name = a._[0];
        if (!/^[\w.-]+\/[\w.-]+$/.test(name || "")) T.fail("Uso: dyn-alm github create <dono/nome> [--public]");
        const c = requireGh(check(), { workflow: fs.existsSync(path.join(cwd, ".github", "workflows")) });
        if (c.hasRemote) T.fail(`Já existe o remoto origin (${c.remoteUrl})`);
        if (git("status", "--porcelain").out) T.fail("Working tree com alterações — commit/stash antes de publicar");

        sh(c.gh, ["auth", "setup-git"]);
        const created = sh(c.gh, ["repo", "create", name, a.public ? "--public" : "--private", "--source", cwd, "--remote", "origin"], { inherit: true });
        if (!created.ok) T.fail(`Não consegui criar ${name} (já existe? sem permissão no dono?)`);

        // main + releases abertas + branch atual; tags v* e deployed/* (base do drift para a esteira).
        const current = git("rev-parse", "--abbrev-ref", "HEAD").out;
        const branches = [...new Set(["main", ...git("for-each-ref", "--format=%(refname:short)", "refs/heads/release/").out.split("\n"), current])]
            .filter((b) => b && b !== "HEAD" && git("rev-parse", "-q", "--verify", `refs/heads/${b}`).ok);
        if (!sh("git", ["push", "-u", "origin", ...branches], { inherit: true }).ok) {
            T.fail(`O repo ${name} foi criado e o origin configurado, mas o push falhou (mensagem acima).\n` +
                `  Corrija e rode: git push -u origin ${branches.join(" ")}`);
        }
        if (git("tag", "--list").out) sh("git", ["push", "origin", "--tags"], { inherit: true });
        console.log(`\n  ✔ ${name} criado (${a.public ? "público" : "privado"}) e publicado: ${branches.join(", ")}
  Próximos: registrar o runner self-hosted e proteger main e release/* contra force-push (Settings → Rules).\n`);
    },

    pr() {
        const c = requireGh();
        if (!c.hasRemote) T.fail(`Sem remoto origin — publique antes: dyn-alm github create ${c.suggestedName}`);
        const branch = git("rev-parse", "--abbrev-ref", "HEAD").out;
        const base = a.base || (openRelease() || {}).branch || T.fail("Nenhuma release aberta — informe --base");
        if (branch === base || branch === "main") T.fail(`Você está em ${branch} — o PR sai de uma feature/fix`);
        if (!sh("git", ["push", "-u", "origin", branch], { inherit: true }).ok) T.fail("Push falhou");
        const args = ["pr", "create", "--base", base, "--head", branch];
        if (a.title) args.push("--title", a.title, "--body", a.body || "");
        else args.push("--fill");
        const r = sh(c.gh, args, { inherit: true });
        if (!r.ok) T.fail("Não consegui abrir o PR (já existe um para esta branch?)");
    },
};

module.exports = { findGh, check, requireGh };
if (require.main === module) {
    if (!cmds[sub]) {
        console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(0, 10).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
        process.exit(sub && !["help", "--help"].includes(sub) ? 1 : 0);
    }
    cmds[sub]();
}
