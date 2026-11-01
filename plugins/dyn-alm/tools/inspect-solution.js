// Lê um zip de solution e mostra o que há nele — usado pelo `dyn-alm init` / /dyn-alm:init para preencher o wizard.
// Uso: node inspect-solution.js <arquivo.zip> [--json]
//      node inspect-solution.js --find <pasta>   lista os zips de solution encontrados (pasta e import/)
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const T = require("./template");

const COMPONENT_TYPES = {
    1: "tabela", 2: "coluna", 3: "relacionamento", 9: "conjunto de opções", 10: "relacionamento", 20: "função de segurança",
    26: "exibição", 29: "processo/fluxo", 59: "gráfico", 60: "formulário", 61: "webresource", 62: "mapa do site",
    66: "controle PCF", 80: "app model-driven", 90: "tipo de plugin", 91: "assembly de plugin", 92: "etapa de plugin",
    300: "canvas app", 371: "conector", 380: "variável de ambiente (definição)", 10112: "referência de conexão",
};

const a = T.parseArgs();

if (a.find) {
    const dir = path.resolve(a.find === true ? "." : a.find);
    const zips = [dir, path.join(dir, "import")].filter(fs.existsSync)
        .flatMap((d) => fs.readdirSync(d).filter((f) => /\.zip$/i.test(f)).map((f) => path.join(d, f)));
    console.log(JSON.stringify(zips, null, 2));
    process.exit(0);
}

const zip = path.resolve(a._[0] || T.fail("Informe o zip"));
if (!fs.existsSync(zip)) T.fail(`Arquivo não encontrado: ${zip}`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dyn-alm-inspect-"));
let packageType = null;
for (const type of ["Unmanaged", "Managed"]) {
    fs.rmSync(tmp, { recursive: true, force: true });
    const r = spawnSync("pac", ["solution", "unpack", "--zipfile", zip, "--folder", tmp, "--packagetype", type], { encoding: "utf8" });
    if (r.status === 0) { packageType = type; break; }
}
if (!packageType) T.fail(`Não consegui desempacotar ${zip} — é um zip de solution Dataverse?`);

const xml = fs.readFileSync(path.join(tmp, "Other", "Solution.xml"), "utf8");
const pick = (re, from = xml) => (from.match(re) || [])[1] || null;
const publisherXml = pick(/<Publisher>([\s\S]*?)<\/Publisher>/) || "";
const version = pick(/<Version>([^<]+)<\/Version>/) || "0.0.0.0";
const [x, y, z] = version.split(".").map(Number);
const counts = {};
for (const m of xml.matchAll(/<RootComponent type="(\d+)"/g)) counts[m[1]] = (counts[m[1]] || 0) + 1;

const info = {
    file: zip,
    uniqueName: pick(/<UniqueName>([^<]+)<\/UniqueName>/),
    displayName: pick(/<LocalizedName description="([^"]*)"/),
    version,
    packageType,
    publisher: {
        uniqueName: pick(/<UniqueName>([^<]+)<\/UniqueName>/, publisherXml),
        displayName: pick(/<LocalizedName description="([^"]*)"/, publisherXml),
        prefix: pick(/<CustomizationPrefix>([^<]+)<\/CustomizationPrefix>/, publisherXml),
    },
    components: Object.entries(counts).map(([type, count]) => ({ type: Number(type), name: COMPONENT_TYPES[type] || `tipo ${type}`, count })),
    onlyWebresources: Object.keys(counts).every((t) => t === "61"),
    // baseVersion precisa ser maior que a existente (o 4º número recomeça no repo novo)
    suggestedBaseVersions: { patch: `${x}.${y || 0}.${(z || 0) + 1}`, minor: `${x}.${(y || 0) + 1}.0`, major: `${(x || 0) + 1}.0.0` },
};
fs.rmSync(tmp, { recursive: true, force: true });

if (a.json) {
    console.log(JSON.stringify(info, null, 2));
} else {
    console.log(`
  ${info.displayName} (${info.uniqueName}) — versão ${info.version}, ${info.packageType}
  Publisher ...... ${info.publisher.displayName} (${info.publisher.uniqueName}), prefixo ${info.publisher.prefix}_
  Componentes .... ${info.components.map((c) => `${c.count}× ${c.name}`).join(", ") || "(nenhum)"}
  Versão base .... ${info.suggestedBaseVersions.minor} (nova release) ou ${info.suggestedBaseVersions.patch} (correção)`);
    if (info.packageType === "Managed") console.log("  ⚠ Zip managed: prefira o unmanaged exportado do Dev como fonte da verdade.");
    if (!info.onlyWebresources) console.log("  ⚠ Há componentes além de webresources: ficam em solution/ e mudam via portal + sync.");
}
