# AGENTS.md

Instruções para agentes de código (Claude Code, Devin, Copilot, Cursor…) neste repositório.
Repositório ALM para Dynamics 365 (kit `dyn-alm`): a solution `{{SOLUTION}}` é montada a partir do Git e nunca exportada do ambiente para release.

## Onde editar
- **Só em `src/webresources/`.** `solution/` guarda metadados (`Solution.xml`, `Customizations.xml`, `*.data.xml`) no formato do `pac solution unpack` e é o espelho do ambiente usado no sync/drift; o `.gitignore` bloqueia conteúdo em `solution/WebResources/`.
- Webresource nova: `npm run new-webresource -- {{PREFIX}}_/caminho/arquivo.js` (gera o `.data.xml` com GUID e o `RootComponent`). Não crie esses metadados à mão.
- Não edite `<Version>` nem `<Managed>2</Managed>` do `Solution.xml`: o build carimba a versão, e o `2` permite gerar o managed direto do fonte.

## Fluxo
- `main` = produção. `release/X.Y.Z` = o que o Dev reflete e a esteira do CoE leva. `feature/*` e `fix/*` saem da release e voltam por PR para ela.
- Onde estou e qual o próximo passo: `dyn-alm jornada` (se o kit estiver instalado) ou `npm run status -- dev`.
- Detalhes: `docs/processo-dev.md` (passo a passo) e `docs/scripts.md` (todos os comandos).

## Comandos
`npm run build` · `npm run deploy -- dev` · `npm run drift -- dev` · `npm run sync -- dev --merge` · `npm run status -- dev` · `npm run new-webresource -- <nome>` · `npm run release:start -- X.Y.Z` · `npm run release:finish` · `npm run release-notes`

## Regras de segurança
- **Peça confirmação humana antes de qualquer `npm run deploy`** — altera um ambiente compartilhado. Em `prod`, só com pedido explícito.
- **Nunca use `--force`, `--replace`, `--allow-extra` ou `--skip-prod-check` por conta própria.** Exit 3 = drift (alguém mexeu no ambiente → `npm run sync -- dev --merge`); exit 4 = Dev ocupado pela branch de outra pessoa. Explique e pergunte.
- Não apague nem mova as tags `deployed/*` e `v*` (base do merge de 3 vias e marco de produção).
- Scripts são Node puro (CommonJS, sem dependências) — a empresa restringe PowerShell. Workflows usam `shell: cmd`.
- `scripts/` e `.claude/commands/` são **ferramentas do kit dyn-alm**: ficam fora do Git e são copiados do kit a cada `npm run …` (`dyn-alm run`). Não edite: a mudança é sobrescrita — evolua no kit.
