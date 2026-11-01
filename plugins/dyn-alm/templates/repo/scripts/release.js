// Fase 4/5 — prepara um release a partir do build do commit atual.
//
// O managed já é gerado pelo build direto do fonte (<Managed>2</Managed> no Solution.xml),
// então o release não depende de ambiente: só valida que o build é publicável e gera as notas.
//
// Uso: npm run build && npm run release
const fs = require("fs");
const path = require("path");
const L = require("./lib");
const { releaseNotes } = require("./release-notes");

const buildInfo = L.readBuildInfo();
const head = L.git(["rev-parse", "HEAD"]);

const problems = [];
if (buildInfo.git.commit !== head) problems.push(`build-info é do commit ${buildInfo.git.shortCommit}, HEAD é ${head.slice(0, 7)} — refaça o build`);
if (buildInfo.git.dirty) problems.push("build feito com alterações não commitadas");
if (!buildInfo.git.tag && !L.parseArgs()["no-tag"]) problems.push("HEAD não tem tag vX.Y.Z (use --no-tag para ensaio)");
for (const kind of ["unmanaged", "managed"]) {
    const pkg = buildInfo.packages[kind];
    if (!pkg) { problems.push(`pacote ${kind} ausente`); continue; }
    const file = path.join(L.OUT, pkg.file);
    if (!fs.existsSync(file) || L.sha256File(file) !== pkg.sha256) problems.push(`${pkg.file} ausente ou com hash diferente do build-info`);
}
if (problems.length) L.fail(`Release bloqueado:\n  - ${problems.join("\n  - ")}`);

fs.writeFileSync(path.join(L.OUT, "RELEASE_NOTES.md"), releaseNotes(buildInfo.git.previousRelease));

console.log(`
  Release ${buildInfo.version} (${buildInfo.git.tag || "sem tag"}, commit ${buildInfo.git.shortCommit})
  Unmanaged ...... out/${buildInfo.packages.unmanaged.file}
  Managed ........ out/${buildInfo.packages.managed.file}
  Notas .......... out/RELEASE_NOTES.md
  Próximo passo .. npm run publish   (Artifactory)  →  npm run deploy -- prod --version ${buildInfo.version}`);
