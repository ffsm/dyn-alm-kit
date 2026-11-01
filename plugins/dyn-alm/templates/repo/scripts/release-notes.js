// Release notes a partir do Git: quais PRs e commits entraram entre duas versões.
// Uso: npm run release-notes -- [de] [até]
//   sem argumentos: do último tag v* (anterior a HEAD) até HEAD
//   ex.: npm run release-notes -- v1.0.0 v1.1.0
//        npm run release-notes -- deployed/prod deployed/dev   (o que está em dev e ainda não foi pra prod)
const fs = require("fs");
const path = require("path");
const L = require("./lib");

function releaseNotes(from, to = "HEAD") {
    const { range, commits, pullRequests } = L.changesBetween(from, to);
    const files = L.git(["diff", "--stat", from ? `${from}..${to}` : `${L.git(["rev-list", "--max-parents=0", to]).split("\n")[0]}..${to}`, "--", L.config.solution.folder, L.config.solution.webresources]);
    const lines = [
        `# ${L.SOLUTION} — ${to === "HEAD" ? L.computeVersion() : to}`,
        "",
        `Intervalo: \`${range}\``,
        "",
        "## Pull requests",
        ...(pullRequests.length ? pullRequests.map((p) => `- #${p.number} ${p.title} (\`${p.commit.slice(0, 7)}\`)`) : ["- (nenhum)"]),
        "",
        "## Commits",
        ...commits.map((c) => `- \`${c.hash.slice(0, 7)}\` ${c.subject} — ${c.author}`),
        "",
        "## Arquivos da solution alterados",
        "```",
        files || "(nenhum)",
        "```",
        "",
    ];
    return lines.join("\n");
}

module.exports = { releaseNotes };

if (require.main === module) {
    const args = L.parseArgs();
    const from = args._[0] || L.lastReleaseTag({ excludeHead: true });
    const md = releaseNotes(from, args._[1] || "HEAD");
    fs.mkdirSync(L.OUT, { recursive: true });
    fs.writeFileSync(path.join(L.OUT, "RELEASE_NOTES.md"), md);
    console.log(md);
}
