---
name: jornada
description: Guia da jornada inteira de ALM Dynamics 365/Dataverse — mostra onde o dev está (repo → release → feature → teste no Dev → PR → Dev pronto p/ CoE → fechar release), pergunta o que fazer e EXECUTA cada passo, do começo ao fim da release.
disable-model-invocation: true
argument-hint: "[o que você quer fazer]"
allowed-tools: Bash(node *journey.js*) Bash(git status *) Bash(git branch *) Bash(git log *) Bash(git diff *)
---

# /dyn-alm:jornada — guia que conduz e executa

Regras e conceitos: `${CLAUDE_PLUGIN_ROOT}/skills/alm/SKILL.md` (leia antes de executar qualquer passo).
Sem Claude, o **mesmo roteiro** roda no terminal: `dyn-alm jornada` (wizard que pergunta e executa — `tools/wizard.js`). Siga este roteiro igual ao do wizard: mesmas ações, mesmas perguntas, mesmas regras; aqui as perguntas são com **AskUserQuestion**.

## Laço
1. `node "${CLAUDE_PLUGIN_ROOT}/tools/journey.js" --json` (faz `git fetch` e consulta o PR no GitHub). Mostre `map` (linhas do mapa) e os `warnings`.
2. Avisos vêm antes de tudo: sem login no PAC → `! pac auth create --name dev --environment <url>`; Dev ocupado por outra pessoa → diga antes de qualquer deploy.
3. Se `$ARGUMENTS` diz o que o usuário quer, escolha a ação correspondente; senão pergunte com AskUserQuestion: as `actions` como opções (a primeira "(Recommended)"), no máximo 4.
4. Execute a ação pelo **Roteiro** abaixo.
5. Rode o `journey.js --json` de novo, mostre o mapa e pergunte: "Continuar: <primeira ação> (Recommended)" / "Fazer outra coisa" / "Parar por aqui". Repita até o usuário parar.

## Regras do roteiro (sempre)
- **Deploy**: build → mostre versão/commit (`out/build-info.json`) → pergunte "Fazer deploy de <versão> no Dev?" (padrão: não fazer) → `npm run deploy -- dev`.
  - exit 3 (drift): explique que o Dev tem alterações fora do Git e que o deploy as apagaria; ofereça "Trazer as alterações do Dev para a minha branch" (`npm run sync -- dev --merge`; conflito → mostre base/ours/theirs e resolva com o usuário) / "Cancelar". Depois: build e pergunte de novo antes do deploy.
  - exit 4 (Dev ocupado): mostre de quem é; ofereça "Esperar / combinar" (Recommended) / "Já combinei — substituir"; só com o "sim" e uma segunda confirmação use `--replace`.
- **Working tree suja** quando a ação precisa dela limpa: "Commitar agora" / "Guardar no stash" (`git stash push -u`) / "Cancelar".
- **Commit**: mostre os arquivos e sugira a mensagem `feat(<nome-da-branch>): altera <arquivo>` (`fix(...)` em `fix/*`; "adiciona" para arquivo novo; "N arquivos" quando mais de um); o usuário aceita ou digita outra.
- Prod nunca. `--force`, `--allow-extra` nunca por conta própria.

## Roteiro por ação (`actions[].id`)
| id | Perguntas | Executa |
|---|---|---|
| `release-start` | versão: base do config (se não houver release anterior) / próxima minor / patch / major / outra; publicar no GitHub? (se houver remoto) | `npm run release:start -- <v> [--push]` |
| `baseline` | — | `npm run drift -- dev` → sem drift: deploy (regra acima); drift: oferece `sync --merge` |
| `feature-start` | feature/fix; nome kebab-case; precisa de webresource nova? | `git checkout -b <tipo>/<nome> <release>` (+ `add`) |
| `add` | caminho `<prefixo>_/pasta/arquivo.ext` | `npm run new-webresource -- <caminho>` |
| `commit-test` | mensagem (sugerida); testar no Dev agora? | commit de `src/`+`solution/` → deploy (regra acima) |
| `test-dev` | — | deploy (regra acima) |
| `update` | conflito: desfazer (`git merge --abort`) / resolver agora | `git merge <release>` |
| `publish` | sem gh: avise que é pré-requisito manual (https://cli.github.com); login/escopo: `github.js login [--refresh]` em background mostrando o código; nome (`suggestedName`); privado/público; confirma | `node tools/github.js create <dono/nome> [--public]` |
| `pr` | release avançou? atualizar antes; mostre commits/arquivos; título (1 commit: o assunto dele; senão `feat: <nome da branch>`); descrição ("Testado no Dev (<versão>)" se o Dev tem a branch); confirma | `node tools/github.js pr --base <release> --title … --body …` |
| `pr-wait` | abrir no navegador / já foi mesclado — verificar de novo | `gh pr view <url> --web` |
| `dev-release`, `back-to-release` | (árvore limpa) | `git checkout <release>` → `git pull --ff-only` → deploy (regra acima) → `npm run status -- dev`; PRONTO → diga a versão/commit para informar ao CoE |
| `status` | — | `npm run status -- dev`; traduza cada ✖ em próximo passo |
| `finish` | o CoE já confirmou produção? (não → pare e explique); versão (sugestão: a da tag `deployed/dev`); conferir em prod / não tenho acesso (`--skip-prod-check`) | `npm run release:finish -- --version <v> [--skip-prod-check] [--local-merge sem remoto]` |
| `init-*` | wizard `/dyn-alm:init` | — |

Publicar, push e PR enviam código para fora: se a permissão for negada, não contorne — entregue o comando (`! dyn-alm github …`).

## Mapa
1 Preparar (repo, login, release aberta) · 2 Desenvolver (feature/fix) · 3 Testar no Dev · 4 PR para a release (aberto/mesclado) · 5 Dev = release (PRONTO p/ CoE) · 6 CoE leva para Homol/Prod · 7 Fechar release.
