// Funções compartilhadas por scaffold.js e upgrade.js.
const fs = require("fs");
const path = require("path");

// Raiz do plugin (tools/, templates/, references/, skills/, .claude-plugin/plugin.json).
const SKILL_DIR = path.resolve(__dirname, "..");
const TEMPLATE_DIR = path.join(SKILL_DIR, "templates", "repo");
// Versão do kit: uma fonte só, o plugin.json (o package.json da raiz do repo acompanha).
const PLUGIN_JSON = path.join(SKILL_DIR, ".claude-plugin", "plugin.json");
const VERSION = JSON.parse(fs.readFileSync(PLUGIN_JSON, "utf8")).version;

// Arquivos que o upgrade mantém em sincronia com a skill (o resto é do repo).
const MANAGED = [/^scripts\//, /^\.github\/workflows\//, /^\.claude\/commands\//, /^docs\/scripts\.md$/, /^\.gitattributes$/];

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

module.exports = { PLUGIN_JSON, SKILL_DIR, TEMPLATE_DIR, VERSION, MANAGED, listFiles, render, parseArgs, fail };
