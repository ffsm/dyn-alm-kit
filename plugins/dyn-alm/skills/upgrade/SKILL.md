---
name: upgrade
description: Atualiza scripts, workflows, comandos e docs/scripts.md de um repositório ALM Dataverse para a versão atual da skill dyn-alm, mostrando o diff antes.
disable-model-invocation: true
argument-hint: "[caminho-do-repo]"
allowed-tools: Bash(git status *) Bash(git diff *)
---

# /dyn-alm:upgrade

Sem Claude: `dyn-alm upgrade` (simula) / `dyn-alm upgrade --target . --apply`.

1. Repo: `$ARGUMENTS` ou a pasta atual. Precisa ter `devops.config.json`.
2. Simulação: `node "${CLAUDE_PLUGIN_ROOT}/tools/upgrade.js" --target "<repo>"`. Mostre a versão atual × nova e a lista de arquivos (`+` novo, `~` alterado). Nada a atualizar → diga e pare.
3. Pergunte (AskUserQuestion): "Aplicar" / "Ver o diff de um arquivo antes" / "Cancelar". Para ver o diff, compare o arquivo do repo com `${CLAUDE_PLUGIN_ROOT}/templates/repo/<arquivo>`.
4. Working tree precisa estar limpa (senão: commitar / stash / cancelar). Aplique com `--apply`.
5. Confira se algum script novo em `scripts/` não tem entrada em `package.json` → `scripts` e ofereça adicionar.
6. Mostre `git diff --stat` e pergunte se commita (`chore: atualiza esteira ALM para <versão>`).
Arquivos do repo que o upgrade **não** toca: `solution/`, `src/`, `devops.config.json`, `CLAUDE.md`, `README.md`, `docs/processo-dev.md`.
