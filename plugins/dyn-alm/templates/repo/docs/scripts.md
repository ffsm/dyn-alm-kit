# Scripts da esteira

Todos em `scripts/`, Node puro (sem dependências, sem PowerShell). Rode pela raiz do repo com `npm run <comando> -- <args>`.
Configuração em `devops.config.json` (nome da solution, pastas, `baseVersion`, URLs dos ambientes, Artifactory).

| Comando | Script | Mexe em ambiente? | Mexe no Git? |
|---|---|---|---|
| `init-solution` | `init-solution.js` | só lê (`--from-env`) | cria `solution/` + `src/` (uma vez) |
| `release:start` | `release-start.js` | não | cria branch + commit |
| `new-webresource` | `new-webresource.js` | não | cria arquivos (sem commit) |
| `build` | `build.js` | não | não |
| `deploy` | `deploy.js` | **importa** no ambiente | move tag `deployed/<env>` |
| `drift` | `sync-from-env.js --check` | só lê (export) | não |
| `sync` | `sync-from-env.js` | só lê (export) | cria branch `sync/*` (+ merge com `--merge`) |
| `status` | `status.js` | só lê | não |
| `release-notes` | `release-notes.js` | não | não |
| `release:finish` | `release-finish.js` | só lê (prod) | cria tag `vX.Y.Z` + PR/merge para main |
| `release` | `release.js` | não | não |
| `publish` | `publish-artifact.js` | não (Artifactory) | não |

---

## `init-solution` — preparar a solution (uma vez, pelo `dyn-alm init`)
```bash
node scripts/init-solution.js --new --publisher <nome_unico> --prefix <pfx> [--display "Nome"] [--publisher-display "Nome"]
node scripts/init-solution.js --from-env [dev]
node scripts/init-solution.js --from-zip import/MinhaSolution_1_3_0_12.zip
```
- `--new`: `pac solution init` + ajustes para o formato do export (nó `<WebResources />`, sem `<SolutionPluginAssemblies />`, `<Managed>2</Managed>`).
- `--from-env` / `--from-zip` (brownfield): exporta do ambiente ou usa o zip (unmanaged ou managed — managed com aviso), desempacota em `solution/` e move o conteúdo das webresources para `src/`. Lista componentes além de webresources.
- Brownfield: recusa se o `baseVersion` não for **maior** que a versão da solution existente (o 4º número recomeça no repo novo) e se o zip for de outra solution.
- Só roda com `solution/` vazio.

## `release:start` — abrir uma release
```bash
npm run release:start -- 1.1.0 [--push]
```
- Cria `release/1.1.0` a partir da `main` e grava `"baseVersion": "1.1.0"` no `devops.config.json` (commit `chore: inicia release 1.1.0`).
- Features criadas a partir dessa branch herdam a versão `1.1.0.N`.
- Recusa se: já houver release aberta, a versão não for maior que o último tag `v*`, ou houver alterações não commitadas.
- `--push` publica a branch no GitHub.

## `new-webresource` — criar webresource
```bash
npm run new-webresource -- {{PREFIX}}_/form/conta.js [--display "Conta - OnLoad"]
```
- Cria o arquivo em `src/webresources/` (com um esqueleto para `.js`/`.html`/`.css`), se ainda não existir.
- Cria `solution/WebResources/<nome>.data.xml` com GUID novo, tipo pela extensão e formato idêntico ao do `pac solution unpack`.
- Adiciona o `<RootComponent type="61">` em `solution/Other/Solution.xml`.
- Exige o prefixo do publisher (`{{PREFIX}}_/`). Extensões: htm/html, css, js, xml, png, jpg, gif, xap, xsl/xslt, ico, svg, resx.

## `build` — gerar o pacote a partir do Git
```bash
npm run build [-- --allow-dirty]
```
1. Calcula a versão: `<baseVersion>.<nº de commits>` → ex. `1.1.0.11`. Mesmo commit ⇒ mesma versão.
2. Monta a solution em `out/staging/` = metadados de `solution/` + conteúdo de `src/webresources/`. Falha se houver arquivo sem `.data.xml` ou vice-versa.
3. Carimba a versão no `Solution.xml` da cópia (o repo nunca é alterado).
4. `pac solution pack` duas vezes → `out/{{SOLUTION}}_1_1_0_11.zip` (unmanaged) e `..._managed.zip`.
5. Escreve `out/build-info.json` (ver abaixo).

Recusa build com alterações não commitadas em `solution/` ou `src/` — `--allow-dirty` permite para teste local, e o pacote fica marcado como `dirty`.
Na branch `release/X.Y.Z`, recusa se o `baseVersion` não for `X.Y.Z`.

## `deploy` — importar num ambiente
```bash
npm run deploy -- dev                       # pacote de out/ (unmanaged)
npm run deploy -- prod --version 1.1.0.11   # managed baixado do Artifactory (simula o CoE)
```
1. Escolhe o pacote pelo `packageType` do ambiente (`dev` = Unmanaged, `prod` = Managed).
2. **Trava de Dev compartilhado** (só em ambiente unmanaged): se o ambiente está com commits de solution que este build não tem (ex.: a `feature/a` de outro dev, ainda não mesclada), mostra de quem é (branch e autor registrados na tag) e **aborta (exit 4)**. `--replace` substitui.
3. **Trava de drift**: exporta o ambiente e compara com a tag `deployed/<env>`.
   - Se alguém mexeu direto no ambiente, salva a mudança na branch `sync/<env>-<data>` e **aborta (exit 3)**.
   - Se o commit que vai subir já incorpora esse drift (`git merge-tree`), segue.
4. Confere o sha256 do zip contra o `build-info.json`.
5. `pac solution import --async` (+ `--publish-changes` no unmanaged).
6. Confere que a versão instalada é a do build.
7. Move a tag anotada `deployed/<env>` para o commit do build, registrando versão, branch e autor (`--push-tag` publica no remoto).

Opções: `--force` (importa mesmo com drift — o drift continua salvo na branch), `--replace` (tira do Dev a branch de outra pessoa), `--allow-dirty`, `--push-tag`.

## `drift` / `sync` — o que mudou direto no ambiente
```bash
npm run drift -- dev                  # só verifica (exit 0 = igual, 3 = drift)
npm run sync  -- dev [--merge]        # traz o drift para o Git
npm run sync  -- dev --zip pacote.zip # compara um zip (ex.: o que o CoE subiu no Artifactory)
```
1. Exporta a solution do ambiente (ou usa o `--zip`, managed ou unmanaged).
2. Cria um worktree temporário no commit da tag `deployed/<env>` (o que a esteira colocou lá).
3. Desempacota por cima e **normaliza o que o Dataverse reescreve sozinho**: cabeçalho com versão da plataforma, `<FileName>` interno das webresources, `<Version>`, `<Managed>`.
4. Devolve o conteúdo das webresources para `src/webresources/`.
5. Sem diferença → "Sem drift". Com diferença → commit na branch `sync/<env>-<data>`.
6. `--merge` faz merge dessa branch na branch atual: mudança só no ambiente entra sozinha; mudança dos dois lados vira conflito (exit 2) com base/ours/theirs.

## `status` — o Dev está pronto para o CoE?
```bash
npm run status -- dev     # exit 0 = PRONTO, 1 = NÃO PRONTO
```
Verifica, e mostra ✔/✖ para cada item:
- a solution está instalada;
- o deploy foi feito pela esteira (existe a tag `deployed/dev`);
- a solution no ambiente é a **ponta da release aberta** (`release/X.Y.Z`; sem release aberta, a `main`). Commits que não mexem em `solution/`/`src/` não contam;
- a versão instalada é a do último deploy;
- não há drift.

## `release-notes` — o que entrou numa versão
```bash
npm run release-notes -- [de] [até]
npm run release-notes -- v1.0.0 v1.1.0
npm run release-notes -- deployed/prod deployed/dev
```
Lista PRs (merge commit `Merge pull request #N` ou squash `Título (#N)`), commits e arquivos de `solution/`/`src/` alterados. Grava `out/RELEASE_NOTES.md`. Sem argumentos: do último tag `v*` até HEAD.

## `release:finish` — fechar a release depois de prod
```bash
npm run release:finish [-- --version 1.1.0.11] [--skip-prod-check] [--local-merge] [--allow-extra]
```
1. Acha a release aberta e a versão que foi para prod (padrão: a do último deploy em dev, que é o que o CoE exportou).
2. Acha o commit dessa versão (o 4º número = nº de commits identifica o commit na branch).
3. Confere em prod que a versão instalada é essa (`--skip-prod-check` se não houver acesso de leitura).
4. Recusa se a release tiver commits de solution **depois** do que foi para prod (iriam para a main sem estar em prod) — `--allow-extra` força.
5. Cria a tag `vX.Y.Z` nesse commit e gera `out/RELEASE_NOTES.md`.
6. Abre o PR `release/X.Y.Z → main` com as notas (`gh` CLI) ou mostra o link; `--local-merge` faz o merge local (sem GitHub).

## `release` — validar o pacote de um release
```bash
npm run build && npm run release [-- --no-tag]
```
Usado pelo `release.yml` na tag. Confere que o `build-info.json` é do HEAD, não é dirty, HEAD tem tag `v*` e os zips batem com os hashes. Gera `out/RELEASE_NOTES.md`.

## `publish` — enviar ao Artifactory
```bash
npm run publish
```
Envia os zips, `build-info.json` e `RELEASE_NOTES.md` para `<repo>/{{SOLUTION}}/<versão>/` num repositório *Generic*, com properties `git.commit`, `git.branch`, `git.tag`, `solution.version`, `pull.requests` (dá para buscar "qual pacote saiu do commit X").
- Remoto: `ARTIFACTORY_URL` + `ARTIFACTORY_TOKEN` (ou `ARTIFACTORY_USER`/`ARTIFACTORY_PASSWORD`).
- Sem `ARTIFACTORY_URL`: copia para `../artifactory-local/` com o mesmo layout (simulação).
- Recusa build dirty.

## `lib.js` — funções compartilhadas
Configuração, execução de `git`/`pac`, autenticação (perfil do `pac auth` local ou service principal via `PP_APP_ID`/`PP_CLIENT_SECRET`/`PP_TENANT_ID`), cálculo de versão, montagem/desmontagem da solution (`assembleSolution`/`extractWebresources`), hashes, release aberta e mapeamento versão → commit.

---

## `out/build-info.json`
```jsonc
{
  "solution": "{{SOLUTION}}",
  "version": "1.1.0.11",
  "git": { "commit": "...", "branch": "release/1.1.0", "tag": null, "dirty": false, "previousRelease": "v1.0.0" },
  "builtAt": "...", "builtBy": "...", "pipelineRun": "<link do run no GitHub, quando no CI>",
  "packages": { "unmanaged": { "file": "...zip", "sha256": "..." }, "managed": { "file": "..._managed.zip", "sha256": "..." } },
  "webresources": { "{{PREFIX}}_/hello.js": "<sha256>", "...": "..." },
  "changes": { "range": "v1.0.0..HEAD", "pullRequests": [ { "number": 3, "title": "...", "commit": "..." } ], "commits": [ ... ] }
}
```

## Tags e branches que os scripts usam
| Ref | Quem cria | Significado |
|---|---|---|
| `release/X.Y.Z` | `release:start` | release em andamento; o Dev reflete esta branch |
| `deployed/<env>` (tag móvel) | `deploy` | último commit que a esteira colocou no ambiente — base do merge com o ambiente |
| `vX.Y.Z` | `release:finish` | commit que foi para produção |
| `sync/<env>-<data>` | `sync`/`deploy` | mudanças feitas direto no ambiente, esperando merge |

## Códigos de saída
| Código | Onde | Significado |
|---|---|---|
| 0 | todos | ok |
| 1 | todos | erro (mensagem em vermelho) / `status` NÃO PRONTO |
| 2 | `sync --merge` | merge com conflitos para resolver |
| 3 | `drift`, `deploy` | há alterações no ambiente fora do Git |
| 4 | `deploy` | Dev está com a branch não mesclada de outra pessoa |

## Workflows (`.github/workflows/`)
| Arquivo | Gatilho | Faz |
|---|---|---|
| `ci.yml` | PR para `main`/`release/**` | build + artefato no run |
| `ci.yml` | push em `release/**` | build + `deploy dev --push-tag` |
| `ci.yml` | push em `main` | só build |
| `release.yml` | tag `vX.Y.Z` | build + `release` + `publish` (registro no Artifactory; deploy em prod é do CoE) |

## Slash commands do Claude Code (`.claude/commands/`)
`/build`, `/deploy <env>`, `/drift <env>`, `/sync-from-env <env>` (resolve conflitos com você), `/status <env>`,
`/new-webresource <nome>`, `/release-notes [de] [até]`, `/release-start <X.Y.Z>`, `/release-finish`.

Do kit `dyn-alm` — plugin do Claude Code: `/dyn-alm:jornada`, `/dyn-alm:init`, `/dyn-alm:feature`, `/dyn-alm:release`, `/dyn-alm:add`, `/dyn-alm:doctor`, `/dyn-alm:upgrade`.
CLI (sem IA — terminal, Devin, CI): `dyn-alm jornada | init | feature | inspect | doctor | upgrade`.
