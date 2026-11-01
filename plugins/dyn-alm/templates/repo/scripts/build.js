// Fase 1 — gera o pacote da solution A PARTIR DO GIT (nunca do ambiente).
// Uso: npm run build [-- --allow-dirty]
const fs = require("fs");
const path = require("path");
const os = require("os");
const L = require("./lib");

const args = L.parseArgs();
const info = L.gitInfo();

if (info.dirty && !args["allow-dirty"]) {
    L.fail(`Há alterações não commitadas em ${L.config.solution.folder}/ ou ${L.config.solution.webresources}/. ` +
        "Commit antes (o pacote precisa corresponder a um commit) ou use --allow-dirty para teste local.");
}

const version = L.computeVersion(info);
const fileVersion = version.replace(/\./g, "_");
L.log(`Build ${L.SOLUTION} ${version} — commit ${info.shortCommit} (${info.branch})${info.dirty ? " [DIRTY]" : ""}`);

// Monta solution/ + src/webresources/ numa área de staging e carimba a versão lá:
// o repo nunca é alterado pelo build.
const staging = L.assembleSolution(path.join(L.OUT, "staging", "solution"));
L.setSolutionVersion(staging, version);

// <Managed>2</Managed> no Solution.xml permite ao SolutionPackager gerar os dois tipos
// direto do fonte — sem passar por ambiente.
const packages = {};
for (const [kind, type, suffix] of [["unmanaged", "Unmanaged", ""], ["managed", "Managed", "_managed"]]) {
    const file = `${L.SOLUTION}_${fileVersion}${suffix}.zip`;
    const zipPath = path.join(L.OUT, file);
    fs.rmSync(zipPath, { force: true });
    L.run("pac", ["solution", "pack", "--zipfile", zipPath, "--folder", staging, "--packagetype", type], { capture: true });
    packages[kind] = { file, sha256: L.sha256File(zipPath) };
}

// Rastreabilidade: o que entrou nesta versão desde o último release.
const previous = L.lastReleaseTag({ excludeHead: true });
const changes = L.changesBetween(previous);

const buildInfo = {
    solution: L.SOLUTION,
    version,
    git: { ...info, previousRelease: previous },
    builtAt: new Date().toISOString(),
    builtBy: process.env.GITHUB_ACTOR || os.userInfo().username,
    pipelineRun: process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : null,
    packages,
    webresources: L.webresourceHashes(L.SRC_WEBRESOURCES),
    changes: { range: changes.range, pullRequests: changes.pullRequests, commits: changes.commits },
};
L.writeBuildInfo(buildInfo);

console.log(`
  Unmanaged ...... out/${packages.unmanaged.file}
  Managed ........ out/${packages.managed.file}
  Versão ......... ${version}
  Commit ......... ${info.commit}
  Desde .......... ${previous || "(início do repositório)"}
  PRs ............ ${changes.pullRequests.map((p) => "#" + p.number).join(", ") || "-"}
  Commits ........ ${changes.commits.length}
  Build info ..... out/build-info.json`);
