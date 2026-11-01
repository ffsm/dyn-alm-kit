// Funções compartilhadas por scaffold.js, upgrade.js e run.js.
const fs = require("fs");
const path = require("path");

// Raiz do plugin (tools/, templates/, references/, skills/, .claude-plugin/plugin.json).
const SKILL_DIR = path.resolve(__dirname, "..");
const TEMPLATE_DIR = path.join(SKILL_DIR, "templates", "repo");
// Versão do kit: uma fonte só, o plugin.json (o package.json da raiz do repo acompanha).
const PLUGIN_JSON = path.join(SKILL_DIR, ".claude-plugin", "plugin.json");
const VERSION = JSON.parse(fs.readFileSync(PLUGIN_JSON, "utf8")).version;

// Ferramentas: ficam fora do Git e são copiadas do kit a cada `dyn-alm run` (sempre a versão instalada).
const TOOLS = [/^scripts\//, /^\.claude\/commands\//];
const TOOLS_GITIGNORE = "# Ferramentas do kit dyn-alm: copiadas do kit a cada execução (dyn-alm run), fora do Git\n/scripts/\n/.claude/commands/\n";
// Gerenciados versionados: o upgrade atualiza e alguém commita (o GitHub só lê workflows commitados).
const MANAGED = [/^\.github\/workflows\//, /^docs\/scripts\.md$/, /^\.gitattributes$/];

function listFiles(base, dir = base) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        return e.isDirectory() ? listFiles(base, full) : [path.relative(base, full).split(path.sep).join("/")];
    });
}

// Conteúdo de um arquivo do template com os placeholders preenchidos.
function render(rel, vars) {
    const raw = fs.readFileSync(path.join(TEMPLATE_DIR, rel));
    if (!/\.(md|json|yml|yaml)$/.test(rel)) return raw;
    return Buffer.from(raw.toString("utf8").replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m)));
}

// Placeholders de um repo ALM existente.
function repoVars(target) {
    const config = JSON.parse(fs.readFileSync(path.join(target, "devops.config.json"), "utf8"));
    const solutionXml = fs.readFileSync(path.join(target, config.solution.folder, "Other", "Solution.xml"), "utf8");
    return {
        SOLUTION: config.solution.name,
        PREFIX: (solutionXml.match(/<CustomizationPrefix>([^<]+)<\/CustomizationPrefix>/) || [])[1],
        DEV_URL: config.environments.dev.url,
        REPO: path.basename(target),
    };
}

// Arquivos do template (do grupo `patterns`) que diferem no repo. Compara ignorando CRLF/LF.
function diffFiles(target, patterns, vars = repoVars(target)) {
    const out = [];
    for (const rel of listFiles(TEMPLATE_DIR).filter((f) => patterns.some((re) => re.test(f)))) {
        const dest = path.join(target, rel);
        const next = render(rel, vars);
        if (!fs.existsSync(dest)) out.push({ rel, kind: "novo", next });
        else if (fs.readFileSync(dest).toString("utf8").replace(/\r\n/g, "\n") !== next.toString("utf8").replace(/\r\n/g, "\n")) {
            out.push({ rel, kind: "alterado", next });
        }
    }
    return out;
}

function writeFiles(target, changes) {
    for (const c of changes) {
        fs.mkdirSync(path.dirname(path.join(target, c.rel)), { recursive: true });
        fs.writeFileSync(path.join(target, c.rel), c.next);
    }
}

// Repo de referência (o template é gerado dele) não tem .dyn-alm/template.json: mantém os scripts no Git.
const isReference = (target) => !fs.existsSync(path.join(target, ".dyn-alm", "template.json"));
// Migrado = scripts saíram do Git e vêm do kit.
const toolsFromKit = (target) => {
    const gi = path.join(target, ".gitignore");
    return fs.existsSync(gi) && /^\/scripts\/\s*$/m.test(fs.readFileSync(gi, "utf8"));
};

// Sobe pastas até achar devops.config.json.
function findRepo(start) {
    let dir = path.resolve(start);
    for (;;) {
        if (fs.existsSync(path.join(dir, "devops.config.json"))) return dir;
        const up = path.dirname(dir);
        if (up === dir) return null;
        dir = up;
    }
}

function parseArgs(argv = process.argv.slice(2)) {
    const args = { _: [] };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (!a.startsWith("--")) { args._.push(a); continue; }
        const next = argv[i + 1];
        if (next === undefined || next.startsWith("--")) args[a.slice(2)] = true;
        else { args[a.slice(2)] = next; i++; }
    }
    return args;
}

function fail(msg) {
    console.error(`\x1b[31m✖ ${msg}\x1b[0m`);
    process.exit(1);
}

module.exports = {
    PLUGIN_JSON, SKILL_DIR, TEMPLATE_DIR, VERSION, TOOLS, TOOLS_GITIGNORE, MANAGED,
    listFiles, render, repoVars, diffFiles, writeFiles, isReference, toolsFromKit, findRepo, parseArgs, fail,
};
