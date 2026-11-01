// Prepara solution/ + src/webresources/ num repo novo (roda uma vez, pelo `dyn-alm init`).
//
// Greenfield — solution nova, criada no Git (o nome vem de devops.config.json):
//   node scripts/init-solution.js --new --publisher <nome_unico> --prefix <prefixo>
//                                 [--display "Nome da solution"] [--publisher-display "Nome do publisher"]
// Brownfield — solution que já existe:
//   node scripts/init-solution.js --from-env [dev]          exporta do ambiente
//   node scripts/init-solution.js --from-zip <arquivo.zip>  usa um zip já baixado (Dev, Artifactory, CoE)
//
// No brownfield o baseVersion precisa ser MAIOR que a versão da solution existente: o 4º número
// recomeça na contagem de commits do repo, então 1.3.0 com versão instalada 1.3.0.12 geraria 1.3.0.2.
const fs = require("fs");
const os = require("os");
const path = require("path");
const L = require("./lib");

const BOM = "﻿";
const args = L.parseArgs();
const base = `${L.config.solution.baseVersion}.0`;

if (L.listFiles(L.SOLUTION_DIR).length) L.fail(`${L.config.solution.folder}/ já tem arquivos — o init só roda em repo vazio`);

const otherDir = path.join(L.SOLUTION_DIR, "Other");
const solutionXml = path.join(otherDir, "Solution.xml");
const customizationsXml = path.join(otherDir, "Customizations.xml");
const edit = (file, fn) => fs.writeFileSync(file, fn(fs.readFileSync(file, "utf8")));

function greenfield() {
    if (!args.publisher || !args.prefix) L.fail("Uso: --new --publisher <nome> --prefix <prefixo>");
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(args.publisher)) L.fail("Nome único do publisher: só letras, números e _ (sem espaço)");
    if (!/^[a-z][a-z0-9]{1,7}$/.test(args.prefix)) L.fail("Prefixo: 2-8 caracteres, minúsculas/números, começando com letra");
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dyn-alm-init-"));
    const proj = path.join(tmp, L.SOLUTION);
    L.run("pac", ["solution", "init", "--publisher-name", args.publisher, "--publisher-prefix", args.prefix, "--outputDirectory", proj], { capture: true });
    fs.mkdirSync(otherDir, { recursive: true });
    for (const f of ["Solution.xml", "Customizations.xml"]) {
        // Mesmo formato do pac solution unpack (BOM + CRLF), sem os comentários do template.
        const xml = fs.readFileSync(path.join(proj, "src", "Other", f), "utf8").replace(/^﻿/, "").replace(/[ \t]*<!--[\s\S]*?-->\r?\n/g, "");
        fs.writeFileSync(path.join(otherDir, f), BOM + xml.replace(/\r?\n/g, "\r\n"));
    }
    fs.rmSync(tmp, { recursive: true, force: true });
    const pubDisplay = args["publisher-display"] || args.publisher;
    edit(solutionXml, (x) => x
        // 1º LocalizedName = solution; os do bloco <Publisher> = publisher
        .replace(/<LocalizedName description="[^"]*" languagecode="1033" \/>/, `<LocalizedName description="${args.display || L.SOLUTION}" languagecode="1033" />`)
        .replace(/(<Publisher>[\s\S]*?)<LocalizedName description="[^"]*" languagecode="1033" \/>/, `$1<LocalizedName description="${pubDisplay}" languagecode="1033" />`)
        .replace(/(<Publisher>[\s\S]*?)<Description description="[^"]*" languagecode="1033" \/>/, `$1<Description description="${pubDisplay}" languagecode="1033" />`));
    // Formato que o Dataverse exporta: nó de WebResources presente, sem SolutionPluginAssemblies vazio.
    edit(customizationsXml, (x) => x
        .replace(/(\r?\n)(\s*)<optionsets \/>/, "$1$2<optionsets />$1$2<WebResources />")
        .replace(/\r?\n\s*<SolutionPluginAssemblies \/>/, ""));
    L.log(`Solution ${L.SOLUTION} criada (publisher ${args.publisher}, prefixo ${args.prefix}_)`);
}

function brownfield(zip, origin) {
    const type = L.unpack(zip, L.SOLUTION_DIR);
    const cleanup = (msg) => {
        fs.rmSync(L.SOLUTION_DIR, { recursive: true, force: true });
        fs.rmSync(L.SRC_WEBRESOURCES, { recursive: true, force: true });
        L.fail(msg);
    };
    const xml = fs.readFileSync(solutionXml, "utf8");
    const name = (xml.match(/<UniqueName>([^<]+)<\/UniqueName>/) || [])[1];
    if (name !== L.SOLUTION) cleanup(`O zip é da solution "${name}", mas devops.config.json diz "${L.SOLUTION}"`);

    const imported = (xml.match(/<Version>([^<]+)<\/Version>/) || [])[1] || "0.0.0.0";
    if (L.compareVersions(L.config.solution.baseVersion, imported.split(".").slice(0, 3).join(".")) <= 0) {
        const [x, y, z] = imported.split(".").map(Number);
        cleanup(`A solution existente está na versão ${imported}; o baseVersion (${L.config.solution.baseVersion}) precisa ser maior,\n` +
            `  senão o build gera versões menores que a instalada. Use ${x}.${y}.${(z || 0) + 1} (correção) ou ${x}.${(y || 0) + 1}.0 (nova release).`);
    }

    L.extractWebresources(L.SOLUTION_DIR, L.SRC_WEBRESOURCES);
    if (type === "Managed") {
        console.warn("⚠ O zip é MANAGED. A fonte da verdade deveria vir do unmanaged (export do Dev): metadados de\n" +
            "  componentes podem divergir. Para webresources o conteúdo é o mesmo; para o resto, prefira --from-env.");
    }
    const roots = [...xml.matchAll(/<RootComponent type="(\d+)"/g)].map((m) => Number(m[1]));
    const counts = {};
    for (const t of roots) counts[t] = (counts[t] || 0) + 1;
    const others = Object.entries(counts).filter(([t]) => t !== "61");
    if (others.length) {
        console.warn(`⚠ Componentes além de webresources: ${others.map(([t, n]) => `${n}× ${L.componentTypeName(t)}`).join(", ")}.\n` +
            "  Eles ficam versionados em solution/ e mudam via portal + sync. Valide o pacote managed gerado localmente\n" +
            "  antes de usar em Homol/Prod (referência: componentes.md da skill dyn-alm).");
    }
    L.log(`Solution ${name} ${imported} (${type}, ${origin}): ${L.listFiles(L.SRC_WEBRESOURCES).length} webresource(s) em ${L.config.solution.webresources}/`);
}

if (args.new) {
    greenfield();
} else if (args["from-env"]) {
    const env = L.getEnv(args._[0] || "dev");
    L.ensureAuth(env);
    if (!L.solutionInstalled(env)) L.fail(`${L.SOLUTION} não existe em ${env.url}`);
    const zip = path.join(L.OUT, "init", `${L.SOLUTION}.zip`);
    L.log(`Exportando ${L.SOLUTION} de ${env.url}`);
    L.exportSolution(env, zip);
    brownfield(zip, `exportada de ${env.name}`);
} else if (args["from-zip"]) {
    const zip = path.resolve(L.ROOT, args["from-zip"]);
    if (!fs.existsSync(zip)) L.fail(`Arquivo não encontrado: ${zip}`);
    brownfield(zip, `zip ${path.basename(zip)}`);
} else {
    L.fail("Use --new, --from-env ou --from-zip <arquivo> (veja o cabeçalho do script)");
}

// <Managed>2</Managed> permite gerar managed e unmanaged do fonte; a versão real é carimbada no build.
edit(solutionXml, (x) => x.replace(/<Managed>[^<]*<\/Managed>/, "<Managed>2</Managed>").replace(/<Version>[^<]*<\/Version>/, `<Version>${base}</Version>`));
fs.mkdirSync(L.SRC_WEBRESOURCES, { recursive: true });
console.log(`\n  Pronto. Próximos passos: git add -A && git commit -m "chore: solution inicial" && npm run build`);
