// Fase 5 — publica o release no Artifactory (repositório Generic), no layout
//   <repo>/<solution>/<version>/{zip unmanaged, zip managed, build-info.json, RELEASE_NOTES.md}
// Os metadados do Git vão como properties do artefato, então dá para buscar
// no Artifactory "qual pacote saiu do commit X / do PR #N".
//
// Remoto:  ARTIFACTORY_URL (ex.: http://localhost:8082/artifactory) +
//          ARTIFACTORY_TOKEN  ou  ARTIFACTORY_USER/ARTIFACTORY_PASSWORD
// Sem ARTIFACTORY_URL: copia para a pasta config.artifactory.localFallback (simulação).
//
// Uso: npm run publish
const fs = require("fs");
const path = require("path");
const L = require("./lib");

const REPO = L.config.artifactory.repo;

function remote() {
    const url = process.env.ARTIFACTORY_URL;
    if (!url) return null;
    const headers = {};
    if (process.env.ARTIFACTORY_TOKEN) headers.Authorization = `Bearer ${process.env.ARTIFACTORY_TOKEN}`;
    else if (process.env.ARTIFACTORY_USER) {
        headers.Authorization = "Basic " + Buffer.from(`${process.env.ARTIFACTORY_USER}:${process.env.ARTIFACTORY_PASSWORD || ""}`).toString("base64");
    }
    return { url: url.replace(/\/$/, ""), headers };
}

function localDir(version) {
    return path.resolve(L.ROOT, L.config.artifactory.localFallback, REPO, L.SOLUTION, version);
}

function files(buildInfo) {
    const list = Object.values(buildInfo.packages).map((p) => p.file);
    list.push("build-info.json");
    if (fs.existsSync(path.join(L.OUT, "RELEASE_NOTES.md"))) list.push("RELEASE_NOTES.md");
    return list;
}

async function publish() {
    const buildInfo = L.readBuildInfo();
    if (buildInfo.git.dirty) L.fail("Não publico build dirty no Artifactory");
    const { version } = buildInfo;
    const props = {
        "git.commit": buildInfo.git.commit,
        "git.branch": buildInfo.git.branch,
        "git.tag": buildInfo.git.tag || "",
        "solution.version": version,
        "pull.requests": buildInfo.changes.pullRequests.map((p) => p.number).join(","),
    };
    const r = remote();

    for (const name of files(buildInfo)) {
        const src = path.join(L.OUT, name);
        if (r) {
            const matrix = Object.entries(props).map(([k, v]) => `;${k}=${encodeURIComponent(v)}`).join("");
            const target = `${r.url}/${REPO}/${L.SOLUTION}/${version}/${name}${matrix}`;
            const res = await fetch(target, {
                method: "PUT",
                headers: { ...r.headers, "X-Checksum-Sha256": L.sha256File(src) },
                body: fs.readFileSync(src),
            });
            if (!res.ok) L.fail(`Upload de ${name} falhou: HTTP ${res.status} ${await res.text()}`);
        } else {
            fs.mkdirSync(localDir(version), { recursive: true });
            fs.copyFileSync(src, path.join(localDir(version), name));
        }
        L.log(`Publicado ${name}`);
    }
    console.log(`\n  ${r ? `${r.url}/${REPO}/${L.SOLUTION}/${version}` : localDir(version)}`);
}

// Baixa um release do Artifactory para out/artifact/<version>/ (usado pelo deploy de prod).
async function fetchArtifact(version) {
    const dir = path.join(L.OUT, "artifact", version);
    fs.mkdirSync(dir, { recursive: true });
    const r = remote();
    const get = async (name) => {
        if (!r) {
            const src = path.join(localDir(version), name);
            if (!fs.existsSync(src)) L.fail(`Release ${version} não encontrado em ${localDir(version)}`);
            fs.copyFileSync(src, path.join(dir, name));
            return;
        }
        const res = await fetch(`${r.url}/${REPO}/${L.SOLUTION}/${version}/${name}`, { headers: r.headers });
        if (!res.ok) L.fail(`Download de ${name} falhou: HTTP ${res.status}`);
        fs.writeFileSync(path.join(dir, name), Buffer.from(await res.arrayBuffer()));
    };
    await get("build-info.json");
    const buildInfo = JSON.parse(fs.readFileSync(path.join(dir, "build-info.json"), "utf8"));
    for (const p of Object.values(buildInfo.packages)) await get(p.file);
    L.log(`Release ${version} baixado de ${r ? "Artifactory" : "artifactory local"}`);
    return { buildInfo, dir };
}

module.exports = { publish, fetchArtifact };

if (require.main === module) publish().catch((e) => L.fail(e.stack || e.message));
