---
description: Abre uma release (cria release/X.Y.Z a partir da main e grava a versão da solution)
argument-hint: "<X.Y.Z>"
allowed-tools: Bash(npm run release:start:*), Bash(git status:*), Bash(git tag:*), Bash(git branch:*)
---
1. Mostre o último release (`git tag --list "v*" --sort=-v:refname | head -1`) e confirme comigo que `$1` é a versão certa (patch para correção, minor para funcionalidade).
2. Rode `npm run release:start -- $1`.
3. Explique os próximos passos: features a partir de `release/$1`, PR para ela, Dev reflete essa branch. Pergunte se quero publicar a branch (`git push -u origin release/$1`).
