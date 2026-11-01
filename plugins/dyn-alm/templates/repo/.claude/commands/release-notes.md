---
description: Gera release notes (PRs, commits e arquivos alterados) entre duas versões
argument-hint: "[de] [até]   ex.: v1.0.0 v1.1.0  |  deployed/prod deployed/dev"
allowed-tools: Bash(npm run release-notes:*), Bash(git tag:*)
---
Rode `npm run release-notes -- $ARGUMENTS` e apresente o resultado. Se não houver argumentos, explique que o intervalo foi do último tag `v*` até HEAD.
Atalho útil: `deployed/prod deployed/dev` = o que está em dev e ainda não foi para prod.
