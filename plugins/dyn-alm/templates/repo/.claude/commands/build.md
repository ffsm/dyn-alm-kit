---
description: Gera o pacote da solution a partir do commit atual e mostra o que entrou na versão
allowed-tools: Bash(npm run build:*), Bash(git status:*), Read
---
1. Rode `npm run build`. Se falhar por alterações não commitadas, mostre `git status` e pergunte se quero commitar ou usar `--allow-dirty`.
2. Leia `out/build-info.json` e resuma: versão, commit, PRs e commits incluídos desde o último release, webresources empacotadas.
