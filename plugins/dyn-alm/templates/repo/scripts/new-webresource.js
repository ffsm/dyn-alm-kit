// Cria uma webresource nova: arquivo em src/webresources/, .data.xml com GUID novo
// em solution/WebResources/ e o RootComponent no Solution.xml. O dev não precisa tocar em solution/.
//
// Uso: npm run new-webresource -- <prefixo>_/pasta/arquivo.js [--display "Nome amigável"]
//      (se o arquivo já existe em src/webresources, só gera os metadados)
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const L = require("./lib");

// Tipos de webresource do Dataverse por extensão.
const TYPES = {
    ".htm": 1, ".html": 1, ".css": 2, ".js": 3, ".xml": 4, ".png": 5, ".jpg": 6, ".jpeg": 6,
    ".gif": 7, ".xap": 8, ".xsl": 9, ".xslt": 9, ".ico": 10, ".svg": 11, ".resx": 12,
};

const TEMPLATES = {
    ".js": (name) => `// ${name}\n"use strict";\n`,
    ".html": (name) => `<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n    <meta charset="utf-8" />\n    <title>${name}</title>\n</head>\n<body>\n</body>\n</html>\n`,
    ".css": (name) => `/* ${name} */\n`,
};

const args = L.parseArgs();
const name = (args._[0] || "").replace(/\\/g, "/");
if (!name) L.fail("Uso: npm run new-webresource -- <prefixo>_/arquivo.js");

const solutionXmlPath = path.join(L.SOLUTION_DIR, "Other", "Solution.xml");
const solutionXml = fs.readFileSync(solutionXmlPath, "utf8");
const prefix = (solutionXml.match(/<CustomizationPrefix>([^<]+)<\/CustomizationPrefix>/) || [])[1];
if (!name.startsWith(`${prefix}_/`)) L.fail(`O nome deve começar com o prefixo do publisher: ${prefix}_/`);

const ext = path.extname(name).toLowerCase();
const type = TYPES[ext];
if (!type) L.fail(`Extensão ${ext} não é um tipo de webresource suportado (${Object.keys(TYPES).join(" ")})`);

const dataXml = path.join(L.SOLUTION_DIR, "WebResources", `${name}.data.xml`);
if (fs.existsSync(dataXml)) L.fail(`${name} já existe (${path.relative(L.ROOT, dataXml)})`);

const srcFile = path.join(L.SRC_WEBRESOURCES, name);
if (!fs.existsSync(srcFile)) {
    fs.mkdirSync(path.dirname(srcFile), { recursive: true });
    fs.writeFileSync(srcFile, (TEMPLATES[ext] || (() => ""))(name));
    L.log(`Criado ${path.relative(L.ROOT, srcFile)}`);
}

// Mesmo formato que o pac solution unpack gera (BOM + CRLF), para não haver diff no sync.
const display = args.display || path.basename(name);
const xml = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<WebResource xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    `  <WebResourceId>{${crypto.randomUUID()}}</WebResourceId>`,
    `  <Name>${name}</Name>`,
    `  <DisplayName>${display}</DisplayName>`,
    `  <WebResourceType>${type}</WebResourceType>`,
    `  <IntroducedVersion>${L.config.solution.baseVersion}.0</IntroducedVersion>`,
    "  <IsEnabledForMobileClient>0</IsEnabledForMobileClient>",
    "  <IsAvailableForMobileOffline>0</IsAvailableForMobileOffline>",
    "  <IsCustomizable>1</IsCustomizable>",
    "  <CanBeDeleted>1</CanBeDeleted>",
    "  <IsHidden>0</IsHidden>",
    `  <FileName>/WebResources/${name}</FileName>`,
    "</WebResource>",
].join("\r\n");
fs.mkdirSync(path.dirname(dataXml), { recursive: true });
fs.writeFileSync(dataXml, "﻿" + xml);
L.log(`Criado ${path.relative(L.ROOT, dataXml)}`);

const root = `<RootComponent type="61" schemaName="${name}" behavior="0" />`;
const updated = /<RootComponents\s*\/>/.test(solutionXml)
    // solution sem componentes ainda (pac solution init gera o nó autofechado)
    ? solutionXml.replace(/(\r?\n)(\s*)<RootComponents\s*\/>/, `$1$2<RootComponents>$1$2  ${root}$1$2</RootComponents>`)
    : solutionXml.replace(/(\r?\n)(\s*)<\/RootComponents>/, `$1$2  ${root}$1$2</RootComponents>`);
if (updated === solutionXml) L.fail("Não encontrei <RootComponents> em solution/Other/Solution.xml — RootComponent não adicionado");
fs.writeFileSync(solutionXmlPath, updated);
L.log("RootComponent adicionado em solution/Other/Solution.xml");
console.log(`\nEdite ${path.relative(L.ROOT, srcFile)} e rode npm run build.`);
