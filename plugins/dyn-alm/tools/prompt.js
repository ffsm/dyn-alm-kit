// Perguntas no terminal para os wizards do kit (init, feature, jornada).
// Funciona com TTY e com entrada redirecionada (testes: printf "1\ns\n" | dyn-alm jornada).
const readline = require("readline");

const c = {
    b: (s) => `\x1b[1m${s}\x1b[0m`, dim: (s) => `\x1b[2m${s}\x1b[0m`, cyan: (s) => `\x1b[36m${s}\x1b[0m`,
    ok: "\x1b[32m✔\x1b[0m", no: "\x1b[31m✖\x1b[0m", warn: "\x1b[33m⚠\x1b[0m",
};

let lines = null;
async function readLine(prompt) {
    if (!lines) lines = readline.createInterface({ input: process.stdin, terminal: false })[Symbol.asyncIterator]();
    process.stdout.write(prompt);
    const { value, done } = await lines.next();
    if (done) {
        console.error("\n\x1b[31m✖ Entrada encerrada antes do fim do wizard\x1b[0m");
        process.exit(1);
    }
    if (!process.stdin.isTTY) process.stdout.write(`${value}\n`);
    return value.trim();
}
async function ask(question, def, validate) {
    for (;;) {
        const v = (await readLine(`${c.cyan("?")} ${question}${def ? c.dim(` (${def})`) : ""}: `)) || def || "";
        const err = validate ? validate(v) : null;
        if (!err) return v;
        console.log(`  ${c.no} ${err}`);
    }
}
async function choose(question, options, def = 0) {
    console.log(`${c.cyan("?")} ${question}`);
    options.forEach((o, i) => console.log(`  ${c.b(String(i + 1))}) ${o.label}${i === def ? c.dim("  (recomendado)") : ""}${o.hint ? c.dim(`  — ${o.hint}`) : ""}`));
    for (;;) {
        const v = await readLine(`  escolha ${c.dim(`[${def + 1}]`)}: `);
        const n = v === "" ? def + 1 : Number(v);
        if (n >= 1 && n <= options.length) return options[n - 1].value;
        console.log(`  ${c.no} digite um número de 1 a ${options.length}`);
    }
}
async function confirm(question, def = true) {
    const v = (await readLine(`${c.cyan("?")} ${question} ${c.dim(def ? "[S/n]" : "[s/N]")}: `)).toLowerCase();
    return v === "" ? def : ["s", "sim", "y", "yes"].includes(v);
}
// Houve pergunta? (o readline mantém o processo vivo: quem usou precisa encerrar com process.exit)
const used = () => lines !== null;

module.exports = { c, readLine, ask, choose, confirm, used };
