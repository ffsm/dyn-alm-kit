---
name: upgrade
description: Atualiza um repositório ALM Dataverse (ou todos os repos ALM da pasta) para o kit dyn-alm instalado — migra os scripts para fora do Git (passam a vir do kit) e atualiza workflows e docs/scripts.md versionados.
disable-model-invocation: true
argument-hint: "[caminho-do-repo | --all]"
allowed-tools: Bash(git status *) Bash(git diff *) Bash(node *upgrade.js*)
---

# /dyn-alm:upgrade

Sem Claude: `dyn-alm upgrade` (simula) / `dyn-alm upgrade --target . --apply` · todos os repos: `dyn-alm upgrade --all [--apply]`.

Como funciona desde o kit 1.4:
- **Ferramentas** (`scripts/`, `.claude/commands/`) ficam **fora do Git**: os npm scripts chamam `dyn-alm run scripts/x.js`, que copia a versão do kit instalado e executa. Não há upgrade a fazer para elas.
- **Versionados** (`.github/workflows/`, `docs/scripts.md`, `.gitattributes`) continuam no repo — o GitHub só lê workflows commitados. É isso que o upgrade atualiza.
- Repo antigo (scripts no Git): o upgrade **migra uma vez** (`.gitignore`, `git rm --cached`, `package.json` com `dyn-alm run`).
- Repo de referência (sem `.dyn-alm/template.json`, ex. `dyn-devops-poc`): não migra, recebe os arquivos (é a fonte do template).
- O kit em si se atualiza sozinho (`selfupdate`); não pergunte por isso.

## Um repo
1. Repo: `$ARGUMENTS` ou a pasta atual. Precisa ter `devops.config.json`.
2. Simulação: `node "${CLAUDE_PLUGIN_ROOT}/tools/upgrade.js" --target "<repo>"`. Mostre a versão atual × nova, se vai migrar (`»`) e os arquivos (`+` novo, `~` alterado). Nada a atualizar → diga e pare.
3. Pergunte (AskUserQuestion): "Aplicar" / "Ver o diff de um arquivo antes" / "Cancelar". Para ver o diff, compare com `${CLAUDE_PLUGIN_ROOT}/templates/repo/<arquivo>`.
4. Working tree precisa estar limpa. Mudança de esteira segue o fluxo de feature: ofereça criar `chore/kit-<versão>` a partir da release aberta antes de aplicar. Aplique com `--apply` (fica no stage).
5. Mostre `git diff --cached --stat` e pergunte se commita (mensagem sugerida pelo upgrade).

## Todos os repos (`--all`)
1. Simulação: `node "${CLAUDE_PLUGIN_ROOT}/tools/upgrade.js" --all` (pasta padrão: a que contém o kit, ex. `~/source/repos`; outra: `--root <pasta>`). Mostre o resultado por repo.
2. Pergunte: "Aplicar em todos (Recommended)" / "Só em alguns" (aí use o modo de um repo) / "Cancelar".
3. `--all --apply`: em cada repo cria `chore/kit-<versão>` a partir da release aberta (ou da main), aplica, commita e volta para a branch original. Repo com alterações não commitadas ou com a branch já existente é **pulado** (mostre o motivo). Não faz push.
4. Mostre o resultado e ofereça push + PR de cada branch para a release (`/dyn-alm:feature` §2c / `dyn-alm github pr --base <release>`, com confirmação).

Arquivos do repo que o upgrade **não** toca: `solution/`, `src/`, `devops.config.json`, `CLAUDE.md`, `AGENTS.md`, `README.md`, `docs/processo-dev.md`.
