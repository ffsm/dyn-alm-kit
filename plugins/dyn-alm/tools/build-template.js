// Regenera templates/repo/ a partir de um repositório de referência (ex.: dyn-devops-poc).
// Fluxo de manutenção: evolua e teste no repo de referência → rode isto → dyn-alm upgrade nos outros repos.
// Os valores do repo de referência viram placeholders ({{SOLUTION}}, {{PREFIX}}, {{DEV_URL}}, {{REPO}}).
//
// Uso: node build-template.js --from <repo-de-referencia> [--bump patch|minor|major]
const fs = require("fs");
const path = require("path");
const T = require("./template");

const a = T.parseArgs();
const from = path.resolve(a.from || T.fail("--from <repo> é obrigatório"));
const config = JSON.parse(fs.readFileSync(path.join(from, "devops.config.json"), "utf8"));
const solutionXml = fs.readFileSync(path.join(from, config.solution.folder, "Other", "Solution.xml"), "utf8");
const prefix = (solutionXml.match(/<CustomizationPrefix>([^<]+)<\/CustomizationPrefix>/) || [])[1];

// O que vai para o template (o resto é específico de cada repo).
const INCLUDE = [/^scripts\//, /^\.github\/workflows\//, /^\.claude\/commands\//, /^docs\//, /^\.gitignore$/, /^\.gitattributes$/, /^CLAUDE\.md$/, /^AGENTS\.md$/];
const files = T.listFiles(from).filter((f) => !f.startsWith(".git/") && INCLUDE.some((re) => re.test(f)));

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const swaps = [
    [new RegExp(escape(config.environments.dev.url), "g"), "{{DEV_URL}}"],
    [new RegExp(escape(config.solution.name), "g"), "{{SOLUTION}}"],
    [new RegExp(`\\b${escape(prefix)}_`, "g"), "{{PREFIX}}_"],
    [new RegExp(`\\b${escape(path.basename(from))}\\b`, "g"), "{{REPO}}"],
];

fs.rmSync(T.TEMPLATE_DIR, { recursive: true, force: true });
for (const rel of files) {
    const dest = path.join(T.TEMPLATE_DIR, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    // Scripts são genéricos (leem a config); placeholders só em documentação.
    if (rel.endsWith(".md")) {
        let s = fs.readFileSync(path.join(from, rel), "utf8");
        for (const [re, to] of swaps) s = s.replace(re, to);
        fs.writeFileSync(dest, s);
    } else {
        fs.copyFileSync(path.join(from, rel), dest);
    }
}

if (a.bump) {
    const [maj, min, pat] = T.VERSION.split(".").map(Number);
    const next = { major: `${maj + 1}.0.0`, minor: `${maj}.${min + 1}.0`, patch: `${maj}.${min}.${pat + 1}` }[a.bump];
    if (!next) T.fail("--bump deve ser patch, minor ou major");
    // plugin.json é a fonte; o package.json da raiz do kit (bin dyn-alm) acompanha
    const manifest = JSON.parse(fs.readFileSync(T.PLUGIN_JSON, "utf8"));
    fs.writeFileSync(T.PLUGIN_JSON, JSON.stringify({ ...manifest, version: next }, null, 2) + "\n");
    const rootPkg = path.resolve(T.SKILL_DIR, "..", "..", "package.json");
    if (fs.existsSync(rootPkg)) {
        const pkg = JSON.parse(fs.readFileSync(rootPkg, "utf8"));
        fs.writeFileSync(rootPkg, JSON.stringify({ ...pkg, version: next }, null, 2) + "\n");
    }
    console.log(`  versão do kit ${T.VERSION} → ${next}`);
}
console.log(`  Template regenerado de ${from}: ${files.length} arquivos (prefixo ${prefix}_, solution ${config.solution.name})`);
