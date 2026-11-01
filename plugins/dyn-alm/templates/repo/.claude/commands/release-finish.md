---
description: Fecha a release depois que o CoE levou para produção (tag vX.Y.Z + PR release → main)
argument-hint: "[--version X.Y.Z.N] [--skip-prod-check] [--local-merge]"
allowed-tools: Bash(npm run release:finish:*), Bash(npm run status:*), Bash(git log:*), Bash(git tag:*)
---
1. Pergunte qual versão o CoE confirmou em produção, se eu não informei em `$ARGUMENTS`.
2. Rode `npm run release:finish -- $ARGUMENTS`.
3. Se falhar porque prod está em outra versão ou há commits depois do que foi para prod, explique e NÃO use `--skip-prod-check`/`--allow-extra` sem eu pedir.
4. No sucesso, mostre a tag criada, o resumo das release notes (`out/RELEASE_NOTES.md`) e o link/estado do PR para a main.
