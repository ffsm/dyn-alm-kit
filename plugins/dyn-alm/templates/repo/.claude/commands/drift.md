---
description: Verifica se o ambiente tem alterações que não estão no Git (não altera nada)
argument-hint: "[dev|prod]"
allowed-tools: Bash(npm run drift:*), Bash(git tag:*), Bash(git log:*)
---
Ambiente: `$1` — se vazio, use `dev`. Abaixo, `<env>` é esse ambiente.

Rode `npm run drift -- <env>` e interprete o resultado:
- exit 0: ambiente igual ao último commit deployado (`deployed/<env>`).
- exit 3: há drift. Liste os arquivos alterados e sugira `/sync-from-env <env>`.
Mostre também qual commit está deployado: `git log -1 --format="%h %s (%cr)" deployed/<env>`.
