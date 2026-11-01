// Fase 3 — traz para o Git o que foi alterado DIRETO no ambiente (drift).
//
// Em vez de "baixar o JS e mesclar na mão", o drift vira um commit numa branch
// sync/<env>-<data> criada a partir do último commit deployado naquele ambiente
// (tag deployed/<env>). Assim o Git faz um merge de 3 vias de verdade:
//   base = o que deployamos | ours = sua branch | theirs = o que está no ambiente
//
// Uso: npm run sync -- <env> [--merge] [--check]
//   --check  só informa se há drift (exit 3 se houver), não guarda a branch
//   --merge  faz merge da branch de sync na branch atual
//   --zip    usa um zip já exportado (ex.: o pacote que o CoE subiu no Artifactory) em vez de exportar
const fs = require("fs");
const path = require("path");
const L = require("./lib");

function deployedTag(envName) {
    return `deployed/${envName}`;
}

// Campos que o Dataverse reescreve no export sem que ninguém tenha mudado nada.
// Mantemos o valor do repo para que só mudança real apareça como drift.
const VOLATILE = [
    // cabeçalho com a versão da plataforma (muda a cada atualização da Microsoft)
    { file: /^Other[\\/](Solution|Customizations)\.xml$/, pattern: /<ImportExportXml[^>]*>/ },
    // o export grava o nome interno do arquivo no zip (<prefixo>_<nome><GUID>)
    { file: /\.data\.xml$/, pattern: /<FileName>[^<]*<\/FileName>/ },
    // a versão no ambiente é a do build; no repo ela é fixa
    { file: /^Other[\\/]Solution\.xml$/, pattern: /<Version>[^<]*<\/Version>/ },
    // o export unmanaged traz 0; o repo usa 2 (Both) para o build gerar o managed
    { file: /^Other[\\/]Solution\.xml$/, pattern: /<Managed>[^<]*<\/Managed>/ },
];

function snapshotVolatile(solutionFolder) {
    const snap = {};
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) { walk(full); continue; }
            const rel = path.relative(solutionFolder, full);
            const rules = VOLATILE.filter((r) => r.file.test(rel));
            if (!rules.length) continue;
            const xml = fs.readFileSync(full, "utf8");
            snap[rel] = rules.map((r) => ({ pattern: r.pattern, value: (xml.match(r.pattern) || [])[0] }));
        }
    };
    walk(solutionFolder);
    return snap;
}

function restoreVolatile(solutionFolder, snap) {
    for (const [rel, rules] of Object.entries(snap)) {
        const full = path.join(solutionFolder, rel);
        if (!fs.existsSync(full)) continue;
        let xml = fs.readFileSync(full, "utf8");
        for (const { pattern, value } of rules) if (value) xml = xml.replace(pattern, value);
        fs.writeFileSync(full, xml);
    }
}

function detectDrift(env, { keepBranch = true, zip: sourceZip } = {}) {
    if (!sourceZip) L.ensureAuth(env);
    if (!sourceZip && !L.solutionInstalled(env)) {
        L.log(`${L.SOLUTION} ainda não existe em ${env.name} — nada a sincronizar`);
        return { drift: false, installed: false };
    }

    const tag = deployedTag(env.name);
    const hasTag = L.run("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`], { capture: true, allowFail: true }).status === 0;
    // Sem tag (nenhum deploy ainda), o ambiente está no máximo onde a main estava quando a branch saiu:
    // comparar com HEAD acusaria como drift a própria alteração de uma feature no 1º deploy.
    const { main } = L.openRelease();
    const mergeBase = hasTag ? null : L.run("git", ["merge-base", "HEAD", main], { capture: true, allowFail: true });
    const base = hasTag ? L.git(["rev-list", "-n", "1", tag])
        : mergeBase.status === 0 ? mergeBase.out : L.git(["rev-parse", "HEAD"]);
    const baseName = hasTag ? tag : mergeBase.status === 0 ? `${main} (ponto em que a branch saiu)` : "HEAD";
    if (!hasTag) {
        console.warn(`⚠ Tag ${tag} não existe: comparando o ambiente com ${baseName}. ` +
            "O merge de 3 vias só fica preciso depois do primeiro deploy pela esteira.");
    }

    const workDir = path.join(L.OUT, "sync");
    let zip = path.join(workDir, `${env.name}.zip`);
    if (sourceZip) {
        zip = path.resolve(sourceZip);
        L.log(`Comparando ${zip} com ${baseName}`);
    } else {
        L.log(`Exportando ${L.SOLUTION} de ${env.name} (${env.url})`);
        L.exportSolution(env, zip);
    }

    const branch = `sync/${env.name}-${L.timestamp()}`;
    const wt = path.join(workDir, "wt");
    L.run("git", ["worktree", "remove", "--force", wt], { capture: true, allowFail: true });
    fs.rmSync(wt, { recursive: true, force: true });
    L.git(["worktree", "add", "-b", branch, wt, base]);
    let keep = false;

    try {
        const wtSolution = path.join(wt, L.config.solution.folder);
        const volatile = snapshotVolatile(wtSolution);
        L.unpack(zip, wtSolution);
        restoreVolatile(wtSolution, volatile);
        // conteúdo volta para src/webresources — é lá que o merge de 3 vias acontece
        L.extractWebresources(wtSolution, path.join(wt, L.config.solution.webresources));

        L.git(["add", "-A", L.config.solution.folder, L.config.solution.webresources], { cwd: wt });
        const changed = L.git(["diff", "--cached", "--name-status"], { cwd: wt });
        if (!changed) {
            L.log(`Sem drift: ${env.name} está igual a ${baseName} (${base.slice(0, 7)})`);
            return { drift: false, installed: true };
        }
        // Sem tag, o ambiente também pode já estar com esta própria branch: igual ao HEAD não é drift.
        const head = L.git(["rev-parse", "HEAD"]);
        if (!hasTag && head !== base && L.run("git", ["diff", "--cached", "--quiet", head, "--",
            L.config.solution.folder, L.config.solution.webresources], { cwd: wt, capture: true, allowFail: true }).status === 0) {
            L.log(`Sem drift: ${env.name} está igual a HEAD (${head.slice(0, 7)})`);
            return { drift: false, installed: true };
        }

        console.log(`\nDrift encontrado em ${env.name} (base ${base.slice(0, 7)}):\n${changed}\n`);
        if (!keepBranch) return { drift: true, installed: true, changed };

        L.git(["commit", "-m", `sync(${env.name}): alterações feitas direto no ambiente`,
            "-m", `Exportado de ${sourceZip ? zip : env.url} em ${new Date().toISOString()}\nBase: ${baseName} ${base}\n\n${changed}`], { cwd: wt });
        keep = true;
        return { drift: true, installed: true, branch, changed };
    } finally {
        L.run("git", ["worktree", "remove", "--force", wt], { capture: true, allowFail: true });
        L.run("git", ["worktree", "prune"], { capture: true, allowFail: true });
        if (!keep) L.run("git", ["branch", "-D", branch], { capture: true, allowFail: true });
    }
}

function cleanupBranch(result) {
    if (result.branch) L.run("git", ["branch", "-D", result.branch], { capture: true, allowFail: true });
}

module.exports = { detectDrift, deployedTag };

if (require.main === module) {
    const args = L.parseArgs();
    const env = args.zip ? { name: args._[0] || "dev" } : L.getEnv(args._[0] || "dev");
    const result = detectDrift(env, { keepBranch: !args.check, zip: args.zip });

    if (args.check) process.exit(result.drift ? 3 : 0);
    if (!result.drift) process.exit(0);

    if (!args.merge) {
        console.log(`Branch criada: ${result.branch}\nPara trazer para a sua branch: git merge --no-ff ${result.branch}`);
        process.exit(0);
    }

    if (L.git(["status", "--porcelain"]) !== "") {
        L.fail(`Working tree com alterações — commit/stash antes do merge. Branch de sync mantida: ${result.branch}`);
    }
    L.log(`Merge de ${result.branch} em ${L.git(["rev-parse", "--abbrev-ref", "HEAD"])}`);
    const merge = L.run("git", ["merge", "--no-ff", "--no-edit", result.branch], { capture: true, allowFail: true });
    if (merge.status !== 0) {
        const conflicts = L.git(["diff", "--name-only", "--diff-filter=U"]);
        console.log(`\nConflitos para resolver:\n${conflicts}\n\nResolva, depois: git add <arquivos> && git commit`);
        process.exit(2);
    }
    L.log("Merge concluído sem conflitos");
    cleanupBranch(result);
}
