# Fluxo de branches, versão e Dev compartilhado

## Branches
```
main (= produção) ─────────────────────────────────────●── tag v1.1.0
  └─ release/1.1.0 ──●──────────●───────────●──────────┘  PR release → main (release:finish)
       release:start │  PR #4   │   PR #5   │
                     └ feature/a┘           └ fix/b
                     Dev = release/1.1.0  ──►  CoE: Dev → Artifactory → Homol → Prod
```
| Branch | Origem | Destino | Quem cria |
|---|---|---|---|
| `release/X.Y.Z` | `main` | `main` (depois de prod) | responsável pela release — `npm run release:start -- X.Y.Z` |
| `feature/<nome>` | `release/X.Y.Z` | `release/X.Y.Z` (PR) | dev — `dyn-alm feature` / `/dyn-alm:feature` |
| `fix/<nome>` | `release/X.Y.Z` | `release/X.Y.Z` (PR) | dev — bug achado em Dev/Homol |
| `sync/<env>-<data>` | tag `deployed/<env>` | branch atual (merge) | `npm run sync` / trava do deploy |

Uma release aberta por vez (`release:start` recusa a segunda). Hotfix com release aberta ainda não é suportado.

## Versão
`<baseVersion>.<nº de commits>` — ex.: `release/1.1.0` com 42 commits no histórico → `1.1.0.42`.
- **Automático**: o 4º número sobe a cada commit (não a cada build, não a cada edição). Mesmo commit ⇒ mesma versão.
- **Manual**: `X.Y.Z` só muda no `release:start`. Na `release/X.Y.Z` o build recusa se o config divergir.
- Sobe sempre na release: um merge tem mais commits no histórico do que qualquer um dos lados.
- **Limites**: branches paralelas podem ter a mesma versão (só a da release vai para o CoE); rebase/force-push numa `release/*` ou `main` muda a contagem (proteja as branches no GitHub); clone raso conta errado (CI usa `fetch-depth: 0`).
- A versão identifica o commit: `release:finish` acha o commit de `1.1.0.42` contando commits na release.

## Dois devs, mesmo JS
- **No Git**: cada um na sua `feature/*`/`fix/*`. O primeiro PR entra; o segundo recebe conflito → `git merge origin/release/X.Y.Z` na própria branch, resolve, atualiza o PR. Linhas diferentes do mesmo arquivo mesclam sozinhas.
- **No Dev compartilhado**: só uma branch por vez. A tag `deployed/dev` registra versão, branch e autor. Se o Dev está com uma branch não mesclada de outra pessoa, o `deploy` sai com **exit 4** e mostra os commits que seriam removidos; `--replace` só com acordo.
- **Antes do CoE**: `npm run status -- dev` precisa dar PRONTO (Dev = ponta da release, sem drift).
- **Ideal futuro**: um Developer environment por dev; o Dev compartilhado fica só com a release.

## Tags
| Tag | Significado |
|---|---|
| `deployed/<env>` (móvel, anotada) | último commit que a esteira colocou no ambiente; mensagem = `<Solution> <versão> em <env> — <branch> por <autor> — <data>` |
| `vX.Y.Z` | commit que foi para produção (criada pelo `release:finish`) |

## Por que Dev é unmanaged
O Dev é onde se desenvolve e de onde o CoE **exporta** — solution gerenciada não pode ser exportada. Homol/Prod recebem managed.
