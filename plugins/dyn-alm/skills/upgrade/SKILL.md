---
name: upgrade
description: Atualiza scripts, workflows, comandos e docs/scripts.md de um repositório ALM Dataverse (ou de todos os repos ALM da pasta de uma vez) para a versão atual do kit dyn-alm, mostrando o que muda antes.
disable-model-invocation: true
argument-hint: "[caminho-do-repo | --all]"
allowed-tools: Bash(git status *) Bash(git diff *) Bash(node *upgrade.js*)
---

# /dyn-alm:upgrade

Sem Claude: `dyn-alm upgrade` (simula) / `dyn-alm upgrade --target . --apply` · todos os repos: `dyn-alm upgrade --all [--apply]`.

Os scripts da esteira ficam **copiados em cada repo** de propósito (a esteira roda do checkout, commit antigo rebuilda igual, bug no kit não derruba todos os repos). Atualizar = este upgrade; para não ir repo por repo, use o modo `--all`.

## Um repo
1. Repo: `$ARGUMENTS` ou a pasta atual. Precisa ter `devops.config.json`.
2. Simulação: `node "${CLAUDE_PLUGIN_ROOT}/tools/upgrade.js" --target "<repo>"`. Mostre a versão atual × nova e a lista de arquivos (`+` novo, `~` alterado). Nada a atualizar → diga e pare.
3. Pergunte (AskUserQuestion): "Aplicar" / "Ver o diff de um arquivo antes" / "Cancelar". Para ver o diff, compare o arquivo do repo com `${CLAUDE_PLUGIN_ROOT}/templates/repo/<arquivo>`.
4. Working tree precisa estar limpa (senão: commitar / stash / cancelar). Mudança de esteira segue o fluxo de feature: ofereça criar `chore/kit-<versão>` a partir da release aberta antes de aplicar. Aplique com `--apply`.
5. Confira se algum script novo em `scripts/` não tem entrada em `package.json` → `scripts` e ofereça adicionar.
6. Mostre `git diff --stat` e pergunte se commita (`chore: atualiza esteira ALM para o kit <versão>`).

## Todos os repos (`--all`)
1. Simulação: `node "${CLAUDE_PLUGIN_ROOT}/tools/upgrade.js" --all` (pasta padrão: a que contém o kit, ex. `~/source/repos`; outra: `--root <pasta>`). Mostre o resultado por repo. Repo sem `.dyn-alm/template.json` é provavelmente o **repo de referência** do template: avise.
2. Pergunte: "Aplicar em todos (Recommended)" / "Só em alguns" (aí use o modo de um repo) / "Cancelar".
3. `--all --apply`: em cada repo cria `chore/kit-<versão>` a partir da release aberta (ou da main), aplica, commita e volta para a branch original. Repo com alterações não commitadas ou com a branch já existente é **pulado** (mostre o motivo). Não faz push.
4. Mostre o resultado e ofereça push + PR de cada branch para a release (`/dyn-alm:feature` §2c / `dyn-alm github pr --base <release>`, com confirmação).

Arquivos do repo que o upgrade **não** toca: `solution/`, `src/`, `devops.config.json`, `CLAUDE.md`, `README.md`, `docs/processo-dev.md`.
