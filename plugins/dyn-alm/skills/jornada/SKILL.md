---
name: jornada
description: Guia da jornada inteira de ALM Dynamics 365/Dataverse — mostra onde o dev está (repo → release → feature → teste no Dev → PR → Dev pronto p/ CoE → fechar release) e conduz o próximo passo usando os wizards do plugin.
disable-model-invocation: true
argument-hint: "[o que você quer fazer]"
allowed-tools: Bash(node *journey.js*) Bash(git status *) Bash(git branch *) Bash(git log *)
---

# /dyn-alm:jornada — guia da jornada

Regras e conceitos: `${CLAUDE_PLUGIN_ROOT}/skills/alm/SKILL.md` (leia antes de executar qualquer passo).
Sem Claude, o mesmo mapa sai no terminal com `dyn-alm jornada` — mostrando o comando de cada passo.

1. Rode `node "${CLAUDE_PLUGIN_ROOT}/tools/journey.js"` na pasta atual e mostre a saída como está (mapa ✔ ▶ ○, avisos, próximos passos com o comando de terminal). Para decidir, use `--json` (campos `stage`, `facts`, `warnings`, `actions[].how`, `actions[].cmd`).
2. Avisos vêm antes de tudo: sem login no PAC → oriente o login (`! pac auth create --name dev --environment <url>`); Dev ocupado por outra pessoa → diga isso antes de qualquer deploy.
3. Se `$ARGUMENTS` diz o que o usuário quer ("criar webresource de formulário", "terminei, abrir PR"), escolha a ação correspondente; senão pergunte com **AskUserQuestion**: as ações do `journey.js` como opções (a primeira marcada "(Recommended)"), no máximo 4.
4. Execute a ação escolhida seguindo o wizard em `how`: leia `${CLAUDE_PLUGIN_ROOT}/skills/<how.skill>/SKILL.md` e siga a seção `how.section` (ou o fluxo inteiro, se não houver), com as mesmas regras — perguntas com AskUserQuestion, confirmação antes de deploy, nunca `--force`/`--replace` sozinho. `how.args` vai como `$ARGUMENTS` do wizard.
5. Ao terminar, rode o `journey.js` de novo, mostre só o mapa e o próximo passo, e pergunte: "Continuar: <próximo passo> (Recommended)" / "Fazer outra coisa" / "Parar por aqui".

## Ação `dev-release` (seção desta skill)
Dev = ponta da release, para o CoE exportar a versão certa: working tree limpa → `git checkout release/X.Y.Z` → `git pull` se houver remoto → `npm run build` → mostre versão/commit e **peça confirmação** → `npm run deploy -- dev` (exit 3/4: explique e pergunte) → `npm run status -- dev`.

## Mapa
1 Preparar (repo, login, release aberta) · 2 Desenvolver (feature/fix) · 3 Testar no Dev · 4 PR para a release · 5 Dev = release (PRONTO p/ CoE) · 6 CoE leva para Homol/Prod · 7 Fechar release.
