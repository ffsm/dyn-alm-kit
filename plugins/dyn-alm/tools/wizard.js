// `dyn-alm jornada` interativo: mostra onde o dev está, pergunta o que fazer e EXECUTA cada passo,
// do começo ao fim da release — para qualquer dev seguir o mesmo processo sem conhecer a esteira.
// O estado vem do journey.js --json (mesma fonte do /dyn-alm:jornada no Claude Code, que segue este roteiro).
//
// Regras (iguais às do Claude): deploy sempre pede confirmação (padrão "não"); prod nunca;
// --force/--replace só depois de explicar e com "sim" explícito.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const T = require("./template");
const { c, ask, choose, confirm } = require("./prompt");

const TOOLS = __dirname;
const win = process.platform === "win32";
const say = (m) => console.log(`\n  ${m}`);
const ok = (m) => console.log(`\n  ${c.ok} ${m}`);
const warn = (m) => console.log(`\n  ${c.warn} ${m}`);
const no = (m) => console.log(`\n  ${c.no} ${m}`);

// Filhos não leem o stdin (é do wizard): stdin ignorado, saída visível.
const IO = ["ignore", "inherit", "inherit"];
const git = (...args) => {
    const r = spawnSync("git", args, { encoding: "utf8" });
    return { ok: r.status === 0 && !r.error, out: (r.stdout || "").trim() };
};
const gitShow = (...args) => spawnSync("git", args, { stdio: IO }).status;
const node = (tool, args) => spawnSync(process.execPath, [path.join(TOOLS, tool), ...args], { stdio: IO }).status;
// npm é .cmd no Windows: só roda via shell, então a linha vai montada com aspas.
const q = (x) => (/[\s"&|<>^]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x);
function npm(script, args = []) {
    console.log(c.dim(`\n  $ npm run ${script}${args.length ? ` -- ${args.join(" ")}` : ""}`));
    const line = ["npm", "run", script, ...(args.length ? ["--", ...args] : [])].map(q).join(" ");
    const r = win ? spawnSync(line, { stdio: IO, shell: true }) : spawnSync("npm", ["run", script, ...(args.length ? ["--", ...args] : [])], { stdio: IO });
    return r.status === null ? 1 : r.status;
}

function journey() {
    const r = spawnSync(process.execPath, [path.join(TOOLS, "journey.js"), "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
    return JSON.parse(r.stdout);
}
function buildInfo() {
    try { return JSON.parse(fs.readFileSync(path.join(T.findRepo(process.cwd()), "out", "build-info.json"), "utf8")); } catch { return null; }
}

// ---------- passos reutilizados ----------

// Working tree limpa (o git status inteiro: scripts do kit são ignorados pelo Git).
async function ensureClean(j) {
    const dirty = git("status", "--porcelain").out;
    if (!dirty) return true;
    say(`Há alterações não commitadas:\n${dirty.split("\n").map((l) => `      ${l}`).join("\n")}`);
    const v = await choose("Antes de seguir:", [
        { label: "Commitar agora", value: "commit", hint: "sugiro a mensagem" },
        { label: "Guardar no stash", value: "stash", hint: "git stash — recupera com git stash pop" },
        { label: "Cancelar", value: "cancel" },
    ]);
    if (v === "commit") return commit(j, { all: true });
    if (v === "stash") return gitShow("stash", "push", "-u", "-m", `dyn-alm jornada ${new Date().toISOString()}`) === 0;
    return false;
}

// Mensagem sugerida: feat(<nome>): altera main.js
function suggestMessage(branch, files) {
    const m = branch.match(/^(feature|fix)\/(.+)$/);
    const type = m ? (m[1] === "fix" ? "fix" : "feat") : "chore";
    const scope = m ? `(${m[2]})` : "";
    const added = files.filter((x) => x.startsWith("??") || x.startsWith("A")).length;
    const names = files.map((x) => path.basename(x.slice(3).trim().replace(/"/g, "")));
    const what = files.length === 1 ? `${added ? "adiciona" : "altera"} ${names[0]}` : `${added === files.length ? "adiciona" : "altera"} ${files.length} arquivos`;
    return `${type}${scope}: ${what}`;
}

async function commit(j, { all = false } = {}) {
    const scope = all ? [] : ["--", "src", "solution"];
    const files = git("status", "--porcelain", ...scope).out.split("\n").filter(Boolean);
    if (!files.length) { say("Nada a commitar."); return true; }
    say(`Vai no commit:\n${files.map((l) => `      ${l}`).join("\n")}`);
    const msg = await ask("Mensagem do commit (Enter aceita a sugestão)", suggestMessage(j.facts.branch, files));
    if (gitShow("add", "-A", ...(all ? [] : ["--", "src", "solution"])) !== 0) return false;
    if (gitShow("commit", "-q", "-m", msg) !== 0) { no("O commit falhou (mensagem acima)."); return false; }
    ok(`Commit: ${git("log", "-1", "--format=%h %s").out}`);
    return true;
}

// build → mostra a versão → confirma → deploy (trata drift e Dev ocupado).
async function buildAndDeploy(j, { what = "sua branch" } = {}) {
    if (npm("build") !== 0) { no("O build falhou (mensagem acima)."); return false; }
    const info = buildInfo();
    const label = info ? `${info.version} (commit ${info.git.shortCommit}, ${info.git.branch})` : "o pacote gerado";
    say(`Pacote pronto: ${c.b(label)}`);
    if (!(await confirm(`Fazer deploy de ${label} no Dev? Isso altera o ambiente compartilhado`, false))) { say("Deploy não feito."); return false; }
    for (let attempt = 0; attempt < 2; attempt++) {
        const st = npm("deploy", ["dev"]);
        if (st === 0) { ok(`Dev atualizado com ${what}: ${label}`); return true; }
        if (st === 3) {
            warn("O Dev tem alterações feitas direto no ambiente que não estão no Git (drift). O deploy apagaria essas alterações.");
            const v = await choose("O que fazer?", [
                { label: "Trazer as alterações do Dev para a minha branch (merge)", value: "sync", hint: "npm run sync -- dev --merge" },
                { label: "Cancelar e conversar com quem mexeu no Dev", value: "cancel" },
            ]);
            if (v !== "sync") return false;
            if (npm("sync", ["dev", "--merge"]) !== 0) {
                no("O merge teve conflito. Resolva os arquivos marcados, rode git add e git commit, e volte para a jornada (ou peça ajuda no /dyn-alm:jornada do Claude Code).");
                return false;
            }
            ok("Alterações do Dev trazidas para a branch.");
            if (npm("build") !== 0) return false;
            if (!(await confirm("Fazer o deploy de novo, agora com as alterações do Dev incluídas?", false))) return false;
            continue;
        }
        if (st === 4) {
            warn("O Dev está com a branch de outra pessoa, ainda não mesclada (veja acima de quem é). O deploy tiraria o trabalho dela do Dev.");
            const v = await choose("O que fazer?", [
                { label: "Esperar / combinar com a pessoa", value: "wait", hint: "cancela o deploy" },
                { label: "Já combinei — substituir o que está no Dev", value: "replace", hint: "--replace" },
            ]);
            if (v !== "replace" || !(await confirm("Confirma que a pessoa liberou o Dev?", false))) return false;
            if (npm("deploy", ["dev", "--replace"]) === 0) { ok(`Dev atualizado com ${what}: ${label}`); return true; }
            return false;
        }
        no("O deploy falhou (mensagem acima).");
        return false;
    }
    return false;
}

// ---------- ações (mesmos ids do journey.js) ----------
const ACTIONS = {
    async "release-start"(j) {
        const last = j.facts.lastTag ? j.facts.lastTag.replace(/^v/, "") : null;
        const base = JSON.parse(fs.readFileSync(path.join(T.findRepo(process.cwd()), "devops.config.json"), "utf8")).solution.baseVersion;
        const [x, y, z] = (last || base).split(".").map(Number);
        const opts = [
            ...(last ? [] : [{ label: base, value: base, hint: "versão base atual do devops.config.json" }]),
            { label: `${x}.${y + 1}.0`, value: `${x}.${y + 1}.0`, hint: "funcionalidades novas" },
            { label: `${x}.${y}.${z + 1}`, value: `${x}.${y}.${z + 1}`, hint: "só correções" },
            { label: `${x + 1}.0.0`, value: `${x + 1}.0.0`, hint: "mudança grande" },
            { label: "Outra", value: "__other" },
        ];
        let v = await choose(`Versão da release (último release: ${last || "nenhum"})`, opts);
        if (v === "__other") v = await ask("Versão (X.Y.Z)", null, (s) => (/^\d+\.\d+\.\d+$/.test(s) ? null : "formato X.Y.Z"));
        if (!(await ensureClean(j))) return;
        const args = [v];
        if (j.facts.hasRemote && (await confirm(`Publicar release/${v} no GitHub agora?`, true))) args.push("--push");
        if (npm("release:start", args) === 0) ok(`Release ${v} aberta. Agora as features saem dela.`);
    },

    async baseline(j) {
        say("Primeiro confiro se o Dev tem algo que o Git não tem (só leitura).");
        const st = npm("drift", ["dev"]);
        if (st === 0) { await buildAndDeploy(j, { what: "a linha de base" }); return; }
        if (st === 3) {
            warn("O Dev tem alterações que não estão no repo. Fazer deploy agora apagaria essas alterações.");
            if (await confirm("Trazer essas alterações para o repo (npm run sync -- dev --merge)?", true)) {
                if (npm("sync", ["dev", "--merge"]) === 0) ok("Alterações trazidas. Rode a jornada de novo para criar a linha de base.");
            }
        }
    },

    async "feature-start"(j) {
        if (!(await ensureClean(j))) return;
        const type = await choose(`Nova branch a partir de ${j.facts.release.branch}:`, [
            { label: "feature", value: "feature", hint: "funcionalidade nova" },
            { label: "fix", value: "fix", hint: "correção de bug" },
        ]);
        const name = await ask("Nome curto (kebab-case, ex.: validacao-cpf)", null, (v) => (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v) ? null : "use letras minúsculas, números e hífen"));
        const branch = `${type}/${name}`;
        if (gitShow("checkout", "-q", "-b", branch, j.facts.release.ref) !== 0) { no(`Não consegui criar ${branch}`); return; }
        ok(`${branch} criada a partir de ${j.facts.release.ref}. Edite src/webresources/ e volte para a jornada.`);
        if (await confirm("Vai precisar de uma webresource nova?", false)) await ACTIONS.add(j);
    },

    async add() {
        const prefix = T.repoVars(T.findRepo(process.cwd())).PREFIX || "<prefixo>";
        const rel = await ask(`Caminho da webresource (ex.: ${prefix}_/pasta/arquivo.js)`, null,
            (v) => (new RegExp(`^${prefix}_\\/[\\w./-]+\\.(js|html|css|png|svg|xml|resx)$`).test(v) ? null : `comece com ${prefix}_/ e termine com a extensão`));
        if (npm("new-webresource", [rel]) === 0) ok(`Webresource criada: src/webresources/${rel}`);
    },

    async "commit-test"(j) {
        if (!j.facts.dirty && j.facts.work && j.facts.work.ahead === 0) { say("Nada mudou ainda em src/ ou solution/. Edite os arquivos e rode a jornada de novo."); return; }
        if (j.facts.dirty && !(await commit(j))) return;
        if (await confirm("Testar no Dev agora (build + deploy)?", true)) await buildAndDeploy(j);
    },

    async "test-dev"(j) { await buildAndDeploy(j); },

    async update(j) {
        if (!(await ensureClean(j))) return;
        if (gitShow("merge", "--no-edit", j.facts.release.ref) === 0) { ok(`Branch atualizada com ${j.facts.release.ref}.`); return; }
        const conflicts = git("diff", "--name-only", "--diff-filter=U").out;
        warn(`Conflito ao juntar com a release:\n${conflicts.split("\n").map((l) => `      ${l}`).join("\n")}`);
        const v = await choose("O que fazer?", [
            { label: "Desfazer o merge por enquanto", value: "abort", hint: "git merge --abort" },
            { label: "Vou resolver os arquivos agora", value: "resolve", hint: "edite, git add, git commit e volte para a jornada" },
        ]);
        if (v === "abort") gitShow("merge", "--abort");
    },

    async publish() {
        const chk = () => JSON.parse(spawnSync(process.execPath, [path.join(TOOLS, "github.js"), "check", "--json"], { encoding: "utf8" }).stdout || "{}");
        let g = chk();
        if (!g.gh) { no(`GitHub CLI (gh) não encontrado — ${g.install}. Depois rode a jornada de novo.`); return; }
        if (!g.loggedIn || g.workflowScope === false) {
            say(g.loggedIn ? "Seu login do GitHub precisa da permissão de workflows. Vou abrir a autorização." : "Vou fazer o login no GitHub.");
            node("github.js", ["login", ...(g.loggedIn ? ["--refresh"] : [])]);
            g = chk();
            if (!g.loggedIn || g.workflowScope === false) { no("Login não concluído. Rode a jornada de novo quando terminar."); return; }
        }
        const name = await ask("Nome do repositório no GitHub (dono/nome)", g.suggestedName, (v) => (/^[\w.-]+\/[\w.-]+$/.test(v) ? null : "formato dono/nome"));
        const vis = await choose("Visibilidade:", [{ label: "Privado", value: "private" }, { label: "Público", value: "public" }]);
        if (!(await confirm(`Criar ${name} (${vis === "public" ? "público" : "privado"}) e publicar main, release/* e a sua branch?`, true))) return;
        if (node("github.js", ["create", name, ...(vis === "public" ? ["--public"] : [])]) === 0) ok(`Publicado em github.com/${name}`);
    },

    async pr(j) {
        const rel = j.facts.release;
        if (j.facts.work && j.facts.work.behind > 0 && (await confirm(`A ${rel.branch} avançou ${j.facts.work.behind} commit(s). Atualizar sua branch antes do PR?`, true))) {
            await ACTIONS.update(j);
            if (git("diff", "--name-only", "--diff-filter=U").out) return;
        }
        const commits = git("log", "--oneline", "--no-merges", `${rel.ref}..HEAD`).out;
        const files = git("diff", "--stat", `${rel.ref}...HEAD`, "--", "src", "solution").out;
        say(`Vai no PR para ${rel.branch}:\n${commits.split("\n").map((l) => `      ${l}`).join("\n")}${files ? `\n\n${files.split("\n").map((l) => `      ${l}`).join("\n")}` : ""}`);
        const subjects = commits.split("\n").filter(Boolean).map((l) => l.replace(/^\S+\s/, ""));
        const m = j.facts.branch.match(/^(feature|fix)\/(.+)$/);
        const defTitle = subjects.length === 1 ? subjects[0] : `${m && m[1] === "fix" ? "fix" : "feat"}: ${(m ? m[2] : j.facts.branch).replace(/-/g, " ")}`;
        const title = await ask("Título do PR (vira linha das release notes)", defTitle);
        const tested = j.facts.dev && j.facts.dev.hasHead ? `Testado no Dev (${j.facts.dev.version}).` : "Não testado no Dev.";
        const body = await ask("Descrição", tested);
        if (!(await confirm(`Abrir o PR "${title}" para ${rel.branch}?`, true))) return;
        if (node("github.js", ["pr", "--base", rel.branch, "--title", title, "--body", body]) === 0) {
            ok("PR aberto. Depois que for aprovado e mesclado, rode a jornada: ela leva a release para o Dev.");
        }
    },

    async "pr-wait"(j) {
        const v = await choose(`PR #${j.facts.pr.number}: ${j.facts.pr.title}`, [
            { label: "Abrir o PR no navegador", value: "web" },
            { label: "Já foi mesclado — verificar de novo", value: "again" },
        ]);
        if (v === "web") {
            const gh = require("./github").findGh();
            if (gh) spawnSync(gh, ["pr", "view", j.facts.pr.url, "--web"], { stdio: IO });
            else say(j.facts.pr.url);
        }
    },

    // Dev = ponta da release (é dela que o CoE exporta)
    async "dev-release"(j) {
        const rel = j.facts.release;
        if (!(await ensureClean(j))) return;
        const hasLocal = git("rev-parse", "-q", "--verify", `refs/heads/${rel.branch}`).ok;
        const co = hasLocal ? gitShow("checkout", "-q", rel.branch) : gitShow("checkout", "-q", "-b", rel.branch, "--track", `origin/${rel.branch}`);
        if (co !== 0) { no(`Não consegui ir para ${rel.branch}`); return; }
        if (j.facts.hasRemote && gitShow("pull", "-q", "--ff-only") !== 0) { no(`git pull de ${rel.branch} falhou (mensagem acima).`); return; }
        ok(`Em ${rel.branch}, atualizada.`);
        if (!(await buildAndDeploy(j, { what: rel.branch }))) return;
        say("Conferindo se o Dev está PRONTO para o CoE:");
        if (npm("status", ["dev"]) === 0) {
            const info = buildInfo();
            ok(`PRONTO. Informe ao CoE: ${T.repoVars(T.findRepo(process.cwd())).SOLUTION} ${info ? `${info.version} (commit ${info.git.shortCommit})` : ""}`);
        }
    },
    async "back-to-release"(j) { await ACTIONS["dev-release"](j); },

    async status() {
        if (npm("status", ["dev"]) === 0) ok("PRONTO para o CoE levar o pacote.");
    },

    async finish(j) {
        if (!(await confirm("O CoE já confirmou que a versão está em produção?", false))) {
            say("Então ainda não é hora de fechar. Quando o CoE confirmar, rode a jornada de novo.");
            return;
        }
        const tagSubject = git("tag", "-l", "--format=%(contents:subject)", "deployed/dev").out;
        const def = (tagSubject.match(/\d+\.\d+\.\d+\.\d+/) || [])[0];
        const version = await ask("Versão que o CoE levou para produção", def, (v) => (/^\d+\.\d+\.\d+\.\d+$/.test(v) ? null : "formato X.Y.Z.N (ex.: 1.1.0.5)"));
        const check = await choose("Conferir a versão direto em produção?", [
            { label: "Sim, conferir", value: "check", hint: "precisa de acesso de leitura a prod" },
            { label: "Não tenho acesso — o CoE confirmou", value: "skip", hint: "--skip-prod-check" },
        ]);
        if (!(await ensureClean(j))) return;
        const args = ["--version", version, ...(check === "skip" ? ["--skip-prod-check"] : []), ...(j.facts.hasRemote ? [] : ["--local-merge"])];
        if (npm("release:finish", args) === 0) ok("Release fechada: tag criada e a main recebe a release. Depois do merge, apague a branch da release.");
        else warn("O release:finish recusou (motivo acima). Se houver commits depois do que foi para prod, eles vão na próxima release.");
    },
};

async function run() {
    for (;;) {
        const j = journey();
        console.log(`\n${j.map.map((l) => `  ${l}`).join("\n")}`);
        for (const w of j.warnings) console.log(`\n  ${c.warn} ${w}`);
        console.log("");
        if (!j.facts.isRepo) {
            say(`Esta pasta não é um repositório ALM. Para criar um: ${c.b("dyn-alm init")}`);
            process.exit(0);
        }
        const opts = j.actions.map((x, i) => ({ label: i === 0 ? `${x.label}` : x.label, value: x.id, hint: x.why }));
        opts.push({ label: "Sair", value: "__exit" });
        const id = await choose("O que fazer agora?", opts, 0);
        if (id === "__exit") break;
        const fn = ACTIONS[id];
        if (fn) await fn(j);
        else say(`Rode: ${(j.actions.find((x) => x.id === id) || {}).cmd}`);
        console.log(c.dim("\n  ─────────────────────────────────────────────"));
    }
    process.exit(0);
}

module.exports = { run, suggestMessage, ACTIONS };
if (require.main === module) run();
