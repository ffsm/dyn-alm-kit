---
description: Mostra se o ambiente está na ponta da main, sem drift — ou seja, pronto para a esteira do CoE levar o pacote
argument-hint: "[dev|prod]"
allowed-tools: Bash(npm run status:*), Bash(git log:*)
---
Ambiente: `$1` — se vazio, use `dev`.

Rode `npm run status -- <env>` e explique o resultado em linguagem simples.
- PRONTO: diga a versão e o commit, e que o CoE pode rodar.
- NÃO PRONTO: para cada ✖, diga o próximo passo (deploy da main, `/sync-from-env`, etc.). Se o ambiente estiver numa branch que não é a main, mostre `git log -1 --format="%h %s (%an)" deployed/<env>` para saber de quem é.
