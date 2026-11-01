// Fecha a release depois que o CoE levou o pacote para produção:
//   1. descobre qual commit foi para prod (versão 1.1.0.N → o N identifica o commit)
//   2. confere a versão instalada em prod
//   3. cria a tag vX.Y.Z nesse commit e gera as release notes
//   4. abre o PR release/X.Y.Z → main (gh CLI) ou mostra o link / faz o merge local
//
// Uso: npm run release:finish [-- --version 1.1.0.12] [--skip-prod-check] [--local-merge]
//   --version          versão que foi para prod (padrão: a da tag deployed/dev, i.e. o que o CoE exportou)
//   --skip-prod-check  não consulta o ambiente prod (ex.: sem acesso de leitura)
//   --local-merge      sem GitHub: faz o merge release → main localmente
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const L = require("./lib");
const { releaseNotes } = require("./release-notes");

const args = L.parseArgs();
const rel = L.openRelease();
if (!rel.ref) L.fail("Nenhuma release aberta (release/X.Y.Z ainda não mesclada na main)");
if (L.git(["status", "--porcelain"]) !== "") L.fail("Working tree com alterações — commit/stash antes");

// 1. Qual versão / commit foi para prod
let version = args.version;
if (!version) {
    const msg = L.git(["tag", "-l", "--format=%(contents:subject)", "deployed/dev"]);
    version = (msg.match(/\d+\.\d+\.\d+\.\d+/) || [])[0];
    if (!version) L.fail("Não achei a versão do último deploy em dev — informe --version X.Y.Z.N");
}
if (!version.startsWith(`${rel.version}.`)) L.fail(`Versão ${version} não pertence à ${rel.branch}`);
const commit = L.commitForVersion(rel.ref, version);
if (!commit) L.fail(`Nenhum commit de ${rel.branch} corresponde à versão ${version}`);
L.log(`${version} = commit ${commit.slice(0, 7)} (${L.git(["log", "-1", "--format=%s", commit])})`);

// 2. Prod está mesmo nessa versão?
if (!args["skip-prod-check"]) {
    const env = L.getEnv("prod");
    L.ensureAuth(env);
    const res = L.run("pac", ["solution", "list", "--environment", env.url], { capture: true, allowFail: true });
    if (res.status !== 0) L.fail("Não consegui ler o ambiente prod. Se não houver acesso, confirme com o CoE e use --skip-prod-check");
    const line = res.out.split(/\r?\n/).find((l) => l.trim().split(/\s+/)[0] === L.SOLUTION);
    const installed = line ? (line.match(/\b\d+\.\d+\.\d+\.\d+\b/) || [])[0] : null;
    if (installed !== version) L.fail(`Prod está em ${installed || "(não instalada)"}, esperado ${version}. O CoE já levou o pacote?`);
    L.log(`Prod confirmado em ${installed}`);
}

// Commits da release que NÃO foram para prod também entrariam na main pelo PR.
const extra = L.git(["rev-list", "--count", `${commit}..${rel.ref}`, "--", L.config.solution.folder, L.config.solution.webresources]);
if (Number(extra) > 0 && !args["allow-extra"]) {
    L.fail(`${rel.branch} tem ${extra} commit(s) de solution depois de ${version} que não estão em prod.\n` +
        "  Leve-os numa próxima release (reverta na branch) ou use --allow-extra se sabe o que está fazendo.");
}

// 3. Tag + notas
const tag = `v${rel.version}`;
if (L.run("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`], { capture: true, allowFail: true }).status === 0) L.fail(`Tag ${tag} já existe`);
const previous = L.lastReleaseTag();
L.git(["tag", "-a", tag, commit, "-m", `${L.SOLUTION} ${version} em produção`]);
const notes = releaseNotes(previous, tag);
fs.mkdirSync(L.OUT, { recursive: true });
const notesPath = path.join(L.OUT, "RELEASE_NOTES.md");
fs.writeFileSync(notesPath, notes);
L.log(`Tag ${tag} → ${commit.slice(0, 7)}  (notas em out/RELEASE_NOTES.md)`);

// 4. PR release → main
const hasRemote = L.run("git", ["remote", "get-url", "origin"], { capture: true, allowFail: true }).status === 0;
if (args["local-merge"]) {
    L.git(["checkout", "main"]);
    L.git(["merge", "--no-ff", rel.branch, "-m", `Merge ${rel.branch} (${version} em produção)`]);
    L.log(`${rel.branch} mesclada na main localmente. Pode apagar a branch: git branch -d ${rel.branch}`);
} else if (hasRemote) {
    L.git(["push", "origin", rel.branch, `refs/tags/${tag}`]);
    const gh = spawnSync("gh", ["pr", "create", "--base", "main", "--head", rel.branch,
        "--title", `Release ${rel.version} (${version} em produção)`, "--body-file", notesPath], { cwd: L.ROOT, stdio: "inherit" });
    if (gh.error || gh.status !== 0) {
        const url = L.git(["remote", "get-url", "origin"]).replace(/^git@github\.com:/, "https://github.com/").replace(/\.git$/, "");
        console.log(`\n  Abra o PR: ${url}/compare/main...${rel.branch}?expand=1\n  (corpo do PR: out/RELEASE_NOTES.md)`);
    }
} else {
    console.log(`\n  Sem remoto 'origin' (repo ainda não está no GitHub). Para concluir local:\n` +
        `  git checkout main && git merge --no-ff ${rel.branch}   (ou rode com --local-merge da próxima vez)`);
}

console.log(`
  Depois do merge na main:
  - apague a branch ${rel.branch}
  - se houver outra release/hotfix aberta, faça merge da main nela`);
