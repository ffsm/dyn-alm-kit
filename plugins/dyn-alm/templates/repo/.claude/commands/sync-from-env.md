---
description: Traz para o Git o que foi alterado direto no ambiente Dynamics e faz merge de 3 vias na branch atual
argument-hint: "[dev|prod]"
allowed-tools: Bash(npm run sync:*), Bash(npm run drift:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git add:*), Bash(git commit:*), Bash(git merge:*), Read, Edit
---
Ambiente: `$1` — se vazio, use `dev`. Abaixo, `<env>` é esse ambiente.

Sincronize o ambiente `<env>` com a branch atual.

1. Rode `git status --porcelain`. Se houver alterações não commitadas, pare e peça para eu commitar ou fazer stash.
2. Rode `npm run sync -- <env> --merge`.
   - Exit 0 sem branch criada: não há drift; diga isso e pare.
   - Exit 0 com merge concluído: mostre `git show --stat HEAD^2` e resuma o que veio do ambiente.
   - Exit 2: há conflitos. Siga para o passo 3.
3. Para cada arquivo em conflito:
   - Mostre as três versões (`git show :1:<arquivo>` base = último deploy, `:2:` = branch atual, `:3:` = ambiente).
   - Explique em uma ou duas frases o que cada lado mudou.
   - Em `src/webresources/**` (`.js`/`.html`): proponha a resolução que preserva as DUAS intenções quando elas não se contradizem; quando se contradizem, me pergunte qual vence.
   - Em `solution/**` (`.data.xml`/`Solution.xml`/`Customizations.xml`): prefira a versão do ambiente para metadados gerados pelo Dataverse e me avise de qualquer mudança de nome/ID de componente.
   - Nunca resolva conflito apagando código de um dos lados sem me perguntar.
4. Depois da resolução: `git add` dos arquivos e `git commit --no-edit`. Mostre o resumo final.
