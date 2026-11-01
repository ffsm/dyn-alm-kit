// Fase 2 — importa o pacote gerado pelo build em um ambiente.
//
// Uso:
//   npm run deploy -- dev                    usa o pacote de out/ (build local/CI)
//   npm run deploy -- prod --version 1.0.0.7 baixa o managed do Artifactory (como o CoE faria)
// Opções:
//   --force        importa mesmo havendo drift no ambiente (o drift é salvo numa branch sync/*)
//   --push-tag     publica a tag deployed/<env> no remoto (a esteira usa isso)
//   --allow-dirty  aceita build com alterações não commitadas (não move a tag deployed/<env>)
//   --replace      substitui no Dev uma branch de outra pessoa que ainda não foi mesclada (exit 4 sem ela)
const path = require("path");
const L = require("./lib");
const { detectDrift, deployedTag } = require("./sync-from-env");
const { fetchArtifact } = require("./publish-artifact");

function installedVersion(env) {
    const { out } = L.run("pac", ["solution", "list", "--environment", env.url], { capture: true });
    const line = out.split(/\r?\n/).find((l) => l.trim().split(/\s+/)[0] === L.SOLUTION);
    return line ? (line.match(/\b\d+\.\d+\.\d+\.\d+\b/) || [])[0] : null;
}

// Dev compartilhado: o que está no ambiente tem commits de solution que este build não tem?
// (ex.: Dev A testando feature/a e Dev B fazendo deploy de fix/b). Devolve esses commits.
function commitsThatWouldBeRemoved(envName, commit) {
    const tag = deployedTag(envName);
    if (L.run("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`], { capture: true, allowFail: true }).status !== 0) return null;
    const log = L.git(["log", "--format=%h %s (%an)", `${commit}..${tag}^{commit}`, "--",
        L.config.solution.folder, L.config.solution.webresources]);
    return log ? { log, who: L.git(["tag", "-l", "--format=%(contents:subject)", tag]) } : null;
}

// O drift já está no commit se mesclar a branch de sync nele não muda nada.
function driftAbsorbed(commit, syncBranch) {
    const merged = L.run("git", ["merge-tree", "--write-tree", commit, syncBranch], { capture: true, allowFail: true });
    return merged.status === 0 && merged.out.split("\n")[0] === L.git(["rev-parse", `${commit}^{tree}`]);
}

async function deploy(envName, opts = {}) {
    const env = L.getEnv(envName);
    const managed = env.packageType === "Managed";
    L.ensureAuth(env);

    let buildInfo;
    let dir = L.OUT;
    if (opts.version) {
        ({ buildInfo, dir } = await fetchArtifact(opts.version));
    } else {
        buildInfo = L.readBuildInfo();
    }

    const pkg = buildInfo.packages[managed ? "managed" : "unmanaged"];
    if (!pkg) L.fail(`Não há pacote ${env.packageType} para ${buildInfo.version}. Managed é gerado por \`npm run release\`.`);
    if (buildInfo.git.dirty && !opts["allow-dirty"]) L.fail("Build feito com alterações não commitadas. Refaça o build a partir de um commit.");

    // Trava contra "um dev matar a versão do outro": se alguém mexeu direto no ambiente
    // depois do último deploy, o import sobrescreveria. Salva o drift e para.
    if (!managed) {
        const removed = commitsThatWouldBeRemoved(env.name, buildInfo.git.commit);
        if (removed && !opts.replace) {
            L.fail(`O ${env.name} está com: ${removed.who}\n` +
                `  Este deploy tiraria do ambiente os commits abaixo (não estão no seu build):\n` +
                removed.log.split("\n").map((l) => `    ${l}`).join("\n") + "\n" +
                "  Combine com o autor. Se ele já terminou o teste (ou a branch foi abandonada), use --replace.\n" +
                "  Se esses commits já deveriam estar no seu build, faça merge da release na sua branch.", 4);
        }
        const drift = detectDrift(env, { keepBranch: true });
        if (drift.drift && driftAbsorbed(buildInfo.git.commit, drift.branch)) {
            L.log(`O commit ${buildInfo.git.shortCommit} já incorpora o drift do ambiente — seguro importar`);
            L.run("git", ["branch", "-D", drift.branch], { capture: true, allowFail: true });
        } else if (drift.drift && !opts.force) {
            L.fail(`Ambiente ${env.name} tem alterações que não estão no Git (salvas em ${drift.branch}).\n` +
                `  Faça merge dessa branch (npm run sync -- ${env.name} --merge), ou use --force para sobrescrever.`, 3);
        }
    }

    const zip = path.join(dir, pkg.file);
    if (L.sha256File(zip) !== pkg.sha256) L.fail(`Hash de ${pkg.file} não confere com o build-info — pacote adulterado ou trocado`);

    L.log(`Importando ${pkg.file} (${buildInfo.version}, commit ${buildInfo.git.shortCommit}) em ${env.name}`);
    const args = ["solution", "import", "--path", zip, "--environment", env.url, "--async"];
    if (!managed) args.push("--publish-changes");
    L.pac(args);

    const actual = installedVersion(env);
    if (actual !== buildInfo.version) L.fail(`Após o import o ambiente reporta versão ${actual}, esperado ${buildInfo.version}`);
    L.log(`${env.name} agora está em ${actual}`);

    if (buildInfo.git.dirty) {
        console.warn(`⚠ Build dirty: tag ${deployedTag(env.name)} não foi movida`);
        return buildInfo;
    }
    const tag = deployedTag(env.name);
    // A mensagem registra branch e autor: é o que aparece para o próximo dev na trava acima.
    L.git(["tag", "-f", "-a", tag, buildInfo.git.commit, "-m",
        `${L.SOLUTION} ${buildInfo.version} em ${env.name} — ${buildInfo.git.branch} por ${buildInfo.builtBy} — ${new Date().toISOString()}`]);
    if (opts["push-tag"]) L.git(["push", "-f", "origin", `refs/tags/${tag}`]);
    L.log(`Tag ${tag} → ${buildInfo.git.shortCommit}`);
    return buildInfo;
}

module.exports = { deploy, installedVersion };

if (require.main === module) {
    const args = L.parseArgs();
    deploy(args._[0] || "dev", args).catch((e) => L.fail(e.stack || e.message));
}
