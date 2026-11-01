---
name: release
description: Wizard do responsável pela entrega num repositório ALM Dataverse — abrir release/X.Y.Z, ver o que vai nela, conferir se o Dev está pronto para o CoE e fechar a release depois de produção (tag + PR para a main).
disable-model-invocation: true
argument-hint: "[abrir|status|notas|fechar]"
allowed-tools: Bash(git status *) Bash(git fetch *) Bash(git tag *) Bash(git branch *) Bash(git log *) Bash(npm run status *) Bash(npm run release-notes *)
---

# /dyn-alm:release — wizard de release

Pergunte com **AskUserQuestion**. Regras da skill `alm` (deste plugin) valem sempre. Fluxo: `${CLAUDE_PLUGIN_ROOT}/references/fluxo.md`.

## 0. Contexto (sem perguntar)
Repo ALM? (`devops.config.json`). `git fetch --all --prune --tags` se houver remoto. Último release: `git tag --list "v*" --sort=-v:refname` (primeiro). Release aberta: `release/*` não mesclada na main.

## 1. Ação
Use `$ARGUMENTS` se vier; senão pergunte, adaptando às opções possíveis:
- sem release aberta: "Abrir release (Recommended)" / "Ver o que mudou desde o último release"
- com release aberta: "Status: o Dev está pronto para o CoE?" / "Ver o que vai nesta release" / "Fechar release (já está em produção)"

## Abrir
1. Calcule as próximas versões a partir do último `vX.Y.Z` e ofereça: "X.Y.(Z+1) — só correções" / "X.(Y+1).0 — funcionalidades (Recommended se houver feature)" / "(X+1).0.0 — mudança grande/incompatível".
2. Confirme e rode `npm run release:start -- <versão>`; se houver remoto, pergunte se publica (`--push`).
3. Explique: features/fixes saem desta branch e voltam por PR; o Dev deve refletir esta branch.

## Status
`npm run status -- dev` e traduza cada ✖ em próximo passo. Se PRONTO, diga a versão/commit para informar ao CoE e lembre do teste `npm run drift -- dev --zip <zip do CoE>`.

## Ver o que vai
`npm run release-notes -- <último vX.Y.Z ou deployed/prod> release/X.Y.Z` e resuma PRs e arquivos.

## Fechar
1. Pergunte qual versão o CoE confirmou em produção; ofereça como opção a versão da tag `deployed/dev` (`git tag -l --format="%(contents:subject)" deployed/dev`).
2. Pergunte se há acesso de leitura a prod para conferir ("Sim, conferir (Recommended)" / "Não, o CoE confirmou"). Só use `--skip-prod-check` com a segunda resposta.
3. Sem remoto (repo fora do GitHub): ofereça `--local-merge`.
4. Rode `npm run release:finish -- --version <v> [flags]`. Se recusar por commits depois do que foi para prod, explique as opções (levar na próxima release ou `--allow-extra`) e pergunte.
5. Mostre a tag, o resumo de `out/RELEASE_NOTES.md` e o PR/merge para a main. Lembre de apagar a branch da release depois do merge.
