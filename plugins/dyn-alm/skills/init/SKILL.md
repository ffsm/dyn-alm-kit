---
name: init
description: Wizard que cria um repositório ALM para uma solution Dynamics 365/Dataverse — greenfield (solution nova) ou brownfield (a partir de um zip baixado ou direto do ambiente Dev) — com scripts de build/deploy/drift/release, workflows e documentação.
disable-model-invocation: true
argument-hint: "[pasta-destino | arquivo.zip]"
allowed-tools: Bash(pac auth list) Bash(pac env list) Bash(pac solution list *) Bash(node --version) Bash(git --version) Bash(pac help) Bash(node *inspect-solution.js*)
---

# /dyn-alm:init — wizard de novo repositório ALM

Sem Claude (terminal, Devin, CI): `dyn-alm init` faz o mesmo wizard no terminal.

Conduza como um wizard: **pergunte com a ferramenta AskUserQuestion** (até 4 perguntas por vez, opções concretas, a recomendada primeiro). Para nomes livres, ofereça sugestões como opções — o usuário pode digitar outra em "Other". **Tudo que puder ser lido (zip, ambiente) é lido, não perguntado** — o usuário só confirma.
Conceitos e regras: skill `alm` (deste plugin) (`${CLAUDE_PLUGIN_ROOT}/skills/alm/SKILL.md`); greenfield × brownfield: `${CLAUDE_PLUGIN_ROOT}/references/onboarding.md`.
Ferramentas: `TOOLS="${CLAUDE_PLUGIN_ROOT}/tools"`.

## 1. Pré-requisitos (sem perguntar)
`node --version` (≥ 20), `git --version`, `pac help` (1ª linha = versão), `pac auth list`. Faltando algo ou token expirado (AADSTS700082): explique e pare. Login: sugira `! pac auth create --name dev --environment <url>`.

## 2. Detectar zips (sem perguntar)
- Se `$ARGUMENTS` termina em `.zip`, é o zip da solution e a pasta destino é a pasta atual.
- Senão rode `node "$TOOLS/inspect-solution.js" --find .` (procura na pasta atual e em `import/`).

## 3. Origem
Pergunte (AskUserQuestion), recomendando conforme o que foi detectado:
- **"Tenho o zip da solution"** — brownfield. Se achou zips, ofereça cada um como opção; senão peça o caminho (sugira colocar em `<repo>/import/`, que não vai para o Git).
- **"Direto do ambiente Dev"** — brownfield, exporta na hora.
- **"Solution nova"** — greenfield.
Na mesma rodada: **Esteira** — "GitHub + runner self-hosted (Recommended)" / "Nenhuma por enquanto" / "Azure DevOps" (avise que os workflows gerados são do GitHub; conversão manual por enquanto).

## 4a. Brownfield por zip
1. `node "$TOOLS/inspect-solution.js" "<zip>"` e mostre o resultado (nome, versão, managed/unmanaged, publisher, prefixo, componentes).
2. Zip **managed** → avise que a fonte da verdade deveria ser o unmanaged exportado do Dev e pergunte: "Continuar com este zip" / "Exportar do Dev em vez disso".
3. Componentes além de webresources → explique que ficam versionados em `solution/` e mudam via portal + sync (ver `references/componentes.md`).
4. **Versão base**: ofereça `suggestedBaseVersions.minor` (Recommended), `.patch` e `.major`. Explique em uma linha: precisa ser maior que a atual porque o 4º número recomeça no repo novo.

## 4b. Brownfield do ambiente
1. `pac env list` → pergunte qual é o Dev (opções = ambientes listados).
2. `pac solution list --environment <dev>` → ofereça as solutions **não gerenciadas** (sem `Default`, sem "Common Data Services Default Solution"), mostrando a versão de cada uma.
3. **Versão base**: a partir da versão listada, ofereça próxima minor (Recommended) / patch / major.

## 4c. Greenfield
Pergunte nome único (sem espaço; sugira a partir do que o usuário contou), nome de exibição, publisher (nome único sem espaço + exibição) e prefixo (2–8 minúsculas; mostre o exemplo `prefixo_/pasta/arquivo.js`). Versão base: "1.0.0 (Recommended)" / outra.

## 5. Ambientes e pasta
- Dev (se ainda não perguntado) e Homol/Prod — opções de `pac env list`; Prod pode ser "Definir depois".
- Pasta: `$ARGUMENTS` (se for pasta) ou a pasta do zip se ele estiver em `<pasta>/import/`; senão sugira `~/source/repos/<solution-em-kebab-case>`. Pasta com conteúdo: avise que os arquivos do template serão adicionados (`.gitignore` é mesclado).

## 6. Confirmação
Resumo (origem, solution, versão atual → versão base, publisher/prefixo, componentes, Dev, Prod, pasta, esteira) e pergunte: "Criar" / "Ajustar algo".

## 7. Criar
```bash
node "$TOOLS/scaffold.js" --target "<pasta>" --mode <new|from-env|from-zip> --dev-url <url> [--prod-url <url>] \
  --base-version X.Y.Z --commit \
  [from-zip:  --zip "<arquivo.zip>"] \
  [from-env:  --solution <Nome>] \
  [new:       --solution <Nome> --publisher <nome_unico> --prefix <pfx> --display "<Nome>" --publisher-display "<Nome>"]
```
Depois, na pasta: `npm run build` e mostre versão e pacotes gerados.

## 8. Linha de base no Dev (perguntar antes de qualquer deploy)
- **Brownfield**: primeiro rode `npm run drift -- dev` (só lê).
  - Sem drift → o Dev já é igual ao repo. Pergunte se pode rodar `npm run deploy -- dev` para criar a tag `deployed/dev` (linha de base do drift; o conteúdo não muda).
  - Com drift (comum quando o zip veio do Artifactory/CoE e o Dev tem coisas mais novas) → **não faça deploy**: isso apagaria do Dev o que é mais novo. Explique e ofereça `npm run sync -- dev --merge` para trazer essas mudanças para o repo; depois `build` + `deploy` (com confirmação).
- **Greenfield**: pergunte se quer instalar a solution (vazia) no Dev agora.
Em seguida `npm run status -- dev`.

## 9. Fechamento
Mostre: caminho do repo, se o zip de `import/` pode ser apagado (não está no Git), próximos passos (`/dyn-alm:release` para abrir a primeira release, `/dyn-alm:feature` para começar), como publicar no GitHub (`git remote add origin …`, `git push -u origin main`, registrar runner, proteger `main` e `release/*` contra force-push) e os links `docs/processo-dev.md` e `docs/scripts.md`.
