// Atualiza o kit sozinho: no máximo de hora em hora, se o GitHub do kit tiver commits novos na main,
// faz git pull --ff-only na pasta do kit e renova o plugin do Claude Code. Não pergunta.
// Só avisa (não atualiza) se a pasta do kit estiver em outra branch, com alterações ou divergente:
// é sinal de que alguém está desenvolvendo o kit ali.
//
// Chamado pelo cli.js (todo comando dyn-alm, inclusive `dyn-alm run` dos npm scripts) e pelo journey.js.
// Variáveis: DYN_ALM_NO_UPDATE=1 desliga · DYN_ALM_UPDATE_EVERY=<minutos> (padrão 60) ·
//            DYN_ALM_STATE_DIR=<pasta> onde guarda a última checagem (padrão ~/.dyn-alm).
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const T = require("./template");

const KIT = path.resolve(T.SKILL_DIR, "..", "..");
const git = (...args) => {
    const r = spawnSync("git", args, { cwd: KIT, encoding: "utf8", timeout: 30000 });
    return { ok: r.status === 0 && !r.error, out: (r.stdout || "").trim() };
};
const say = (m) => console.error(`\x1b[36m▶ ${m}\x1b[0m`);
const warn = (m) => console.error(`\x1b[33m⚠ ${m}\x1b[0m`);

// O plugin do Claude Code instalado aponta para esta pasta do kit? (clone de teste não mexe no Claude)
function pluginFromThisKit() {
    try {
        const m = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude", "plugins", "known_marketplaces.json"), "utf8"));
        return Object.values(m).some((x) => x && x.source && path.resolve(x.source.path || "") === KIT);
    } catch { return false; }
}

function autoUpdate() {
    if (process.env.DYN_ALM_NO_UPDATE || process.env.DYN_ALM_UPDATED) return { skipped: "desligado" };
    process.env.DYN_ALM_UPDATED = "1"; // processos filhos (journey, run) não checam de novo

    const stateDir = process.env.DYN_ALM_STATE_DIR || path.join(os.homedir(), ".dyn-alm");
    const stamp = path.join(stateDir, "last-update-check.json");
    const every = Number(process.env.DYN_ALM_UPDATE_EVERY || 60) * 60 * 1000;
    let last = 0;
    try { last = JSON.parse(fs.readFileSync(stamp, "utf8")).at || 0; } catch { /* primeira vez */ }
    if (Date.now() - last < every) return { skipped: "recente" };
    // grava antes da rede: sem internet, não tenta de novo a cada comando
    try { fs.mkdirSync(stateDir, { recursive: true }); fs.writeFileSync(stamp, JSON.stringify({ at: Date.now() })); } catch { /* sem estado: segue */ }

    if (!git("remote", "get-url", "origin").ok) return { skipped: "kit sem remoto" };
    const branch = git("rev-parse", "--abbrev-ref", "HEAD").out;
    if (!git("fetch", "-q", "origin", "main").ok) return { skipped: "sem acesso ao GitHub do kit" };
    const behind = Number(git("rev-list", "--count", "HEAD..origin/main").out || 0);
    if (!behind) return { skipped: "em dia" };
    if (branch !== "main" || git("status", "--porcelain").out || !git("merge-base", "--is-ancestor", "HEAD", "origin/main").ok) {
        warn(`Kit dyn-alm tem ${behind} commit(s) novo(s) na main, mas a pasta do kit está ${branch !== "main" ? `na branch ${branch}` : "com alterações locais ou divergente"} — não atualizei (${KIT})`);
        return { skipped: "pasta do kit em uso" };
    }
    const from = T.VERSION;
    if (!git("pull", "-q", "--ff-only", "origin", "main").ok) { warn("Não consegui atualizar o kit (git pull)"); return { skipped: "pull falhou" }; }
    const to = JSON.parse(fs.readFileSync(T.PLUGIN_JSON, "utf8")).version;
    say(`Kit dyn-alm atualizado${from !== to ? `: ${from} → ${to}` : ""} (${behind} commit(s))`);
    if (pluginFromThisKit()) {
        const r = spawnSync(process.execPath, [path.join(KIT, "install.js"), "--plugin"], { cwd: KIT, encoding: "utf8" });
        if (r.status === 0) say("Plugin do Claude Code atualizado (vale numa sessão nova do Claude Code)");
        else warn("Não consegui atualizar o plugin do Claude Code — rode: node install.js --update");
    }
    return { updated: true, from, to, behind };
}

module.exports = { autoUpdate, KIT };
if (require.main === module) console.log(JSON.stringify(autoUpdate()));
