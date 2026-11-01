---
name: feature
description: Wizard do dia a dia do dev num repositório ALM Dataverse — abrir feature/fix a partir da release, atualizar a branch com a release, testar no Dev e preparar o PR.
disable-model-invocation: true
argument-hint: "[o que você vai fazer]"
allowed-tools: Bash(git status *) Bash(git fetch *) Bash(git branch *) Bash(git log *) Bash(npm run status *) Bash(npm run drift *)
---

# /dyn-alm:feature — wizard de feature/fix

Sem Claude: `dyn-alm feature` cria a branch; `dyn-alm jornada` mostra o próximo comando.

Pergunte com **AskUserQuestion** (opções concretas, recomendada primeiro). Regras da skill `alm` (deste plugin) valem sempre (confirmação antes de deploy; nunca `--force`/`--replace` sem pedir).

## 0. Contexto (sem perguntar)
- Confirme que é um repo ALM (`devops.config.json` na raiz); se não for, sugira `/dyn-alm:init` e pare.
- `git fetch --all --prune` (se houver remoto), `git status --porcelain`, branch atual.
- Release aberta: `git branch -a --list "*release/*"` e descarte as já mescladas na main (`git branch -a --merged main`). Sem release aberta → ofereça `/dyn-alm:release` e pare.

## 1. O que fazer
Se `$ARGUMENTS` já deixa claro, pule. Senão pergunte:
- "Começar uma feature nova" / "Corrigir um bug (fix)" / "Atualizar minha branch com a release" / "Preparar o PR da minha branch".

## 2a. Nova feature/fix
1. Working tree precisa estar limpa (senão pergunte: commitar / stash / cancelar).
2. Pergunte o nome curto (ofereça 2 sugestões em kebab-case a partir de `$ARGUMENTS`) e se vai criar webresource nova.
3. `git checkout -b <feature|fix>/<nome> <origin/>release/X.Y.Z`.
4. Webresource nova → pergunte nome (`<prefixo>_/pasta/arquivo.ext`) e rode `npm run new-webresource -- …`.
5. Se o usuário descreveu a mudança, implemente **só em `src/`** seguindo o estilo dos arquivos existentes.
6. Pergunte se quer **testar no Dev agora**. Se sim: commit (mensagem sugerida), `npm run build`, mostre versão/commit e **peça confirmação** antes de `npm run deploy -- dev`.
   - exit 3 (drift): explique e ofereça `npm run sync -- dev --merge` (resolva conflitos mostrando base/ours/theirs).
   - exit 4 (Dev ocupado): mostre de quem é e os commits; pergunte se combinou com a pessoa antes de usar `--replace`.

## 2b. Atualizar com a release
Working tree limpa → `git merge origin/release/X.Y.Z` (ou local). Conflitos em `src/`: mostre as três versões, proponha a resolução que preserva as duas intenções e pergunte quando forem incompatíveis. Conflitos em `solution/`: prefira os metadados mais recentes e avise mudanças de nome/ID.

## 2c. Preparar o PR
0. `node "${CLAUDE_PLUGIN_ROOT}/tools/github.js" check --json`. Sem remoto (`hasRemote: false`) → faça antes a §9 do `init` (`${CLAUDE_PLUGIN_ROOT}/skills/init/SKILL.md`: instalar/logar o `gh`, criar o repo, publicar). Sem `gh` mas com remoto → siga com push + link (passo 3).
1. Mostre o que vai no PR: `git log --oneline <release>..HEAD` (`origin/release/X.Y.Z` se existir, senão a local) e arquivos alterados em `src/`/`solution/`.
2. Se a release avançou desde que a branch saiu, ofereça o 2b antes.
3. Sugira título (vira linha das release notes) e descrição e, confirmados, rode `node "${CLAUDE_PLUGIN_ROOT}/tools/github.js" pr --base release/X.Y.Z --title "…" --body "…"` (faz o push e abre o PR **para `release/X.Y.Z`**; o `gh` é achado mesmo fora do PATH). Sem `gh`: `git push -u origin <branch>` e mostre o link `…/compare/release/X.Y.Z...<branch>?expand=1`. Permissão negada (push/PR é envio para fora) → não contorne; entregue `! dyn-alm github pr --base release/X.Y.Z --title "…" --body "…"`.
4. Lembre: depois do merge, o Dev volta para a release (automático com a esteira; senão, deploy da release) e `npm run status -- dev` deve dar PRONTO antes do CoE.
