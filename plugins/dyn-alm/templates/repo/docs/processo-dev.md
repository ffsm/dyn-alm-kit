# Processo do dev — editar e subir em Dev

> **Regra de ouro:** a esteira do CoE leva para Homol/Prod **o que estiver no ambiente Dev**.
> O Dev reflete a **release aberta** (`release/X.Y.Z`), que só muda por PR.
> A `main` = o que está em produção. Nada é editado direto no portal do Dynamics.

```
main ─────────────────────────────────────────────────────────●── (= produção)  tag v1.1.0
  └─ release/1.1.0 ──●──────────●───────────●─────────────────┘ PR release → main
         (start)     │          │  merge PR │  merge PR
                     └ feature/a┘           └ feature/b
                         │
                  testa no Dev        Dev = release/1.1.0 ──► CoE: Dev → Artifactory → Homol → Prod
```

Detalhes de cada comando: [scripts.md](scripts.md).

> **Com o kit `dyn-alm`:** `dyn-alm jornada` no terminal (ou `/dyn-alm:jornada` no Claude Code) mostra em que passo abaixo
> você está e qual o próximo comando.

## Uma vez por máquina

```bash
git clone <repo> && cd {{REPO}}
pac auth create --name dev --environment {{DEV_URL}}
```

Node 20+ e PAC CLI instalados. Não precisa de `npm install`.

---

## 0. (Responsável pela release) Abrir a release

Uma vez por ciclo, por quem coordena a entrega:

```bash
git checkout main && git pull
npm run release:start -- 1.1.0 --push
```

Cria `release/1.1.0` e grava a versão `1.1.0` na config. Tudo que for buildado a partir dela sai como `1.1.0.N`.

## 1. Criar a branch e editar

```bash
git fetch && git checkout -b feature/minha-mudanca origin/release/1.1.0   # bug? use fix/<nome>
```

Edite **somente** os arquivos em `src/webresources/`:

```
src/webresources/{{PREFIX}}_/hello.js     ← aqui
src/webresources/{{PREFIX}}_/hello.html   ← aqui
solution/                          ← NÃO mexa (metadados, mantidos pelos scripts)
```

**Webresource nova?** Use o comando, que já registra na solution:

```bash
npm run new-webresource -- {{PREFIX}}_/form/conta.js --display "Conta - OnLoad"
```

## 2. Testar no Dev

```bash
git add src solution
git commit -m "feat: o que mudou"
npm run build
npm run deploy -- dev
```

| O deploy respondeu | O que significa | O que fazer |
|---|---|---|
| `dev agora está em 1.1.0.N` | Subiu (como **não gerenciada**). | Teste no Dynamics. Ajustes: edite, commit, `build`, `deploy`. |
| `Há alterações não commitadas` | O pacote precisa vir de um commit. | `git commit` (commits na sua branch são baratos). |
| `Ambiente dev tem alterações que não estão no Git` (exit 3) | Alguém mexeu direto no portal. O deploy **parou para não apagar** esse trabalho. | `npm run sync -- dev --merge` (ou `/sync-from-env dev`), depois `build` + `deploy`. |
| `O dev está com: … feature/x por Fulano` (exit 4) | Outro dev está testando uma branch que ainda não foi mesclada. Seu deploy tiraria o trabalho dele do Dev. | Combine com ele. Se ele já terminou (ou a branch foi abandonada): `npm run deploy -- dev --replace`. |
| `Webresources inconsistentes` | Arquivo em `src/` sem metadados (ou o contrário). | Rode o `new-webresource` que a mensagem sugere. |

> ⚠️ **Dev é compartilhado.** Só uma branch por vez — o deploy avisa (exit 4) se for tirar a branch de outra pessoa.
> Não deixe a sua lá: **o passo 4 sempre devolve o Dev para a release**. O `npm run status` (passo 5)
> impede que o CoE leve uma feature que não passou por PR.

## 3. PR para a release

```bash
git push -u origin feature/minha-mudanca
```

Abra o PR **para `release/1.1.0`** (não para a `main`). Título claro — vira linha das release notes.
Se outro dev mexeu no mesmo arquivo e o PR dele entrou antes, o seu terá conflito: `git merge origin/release/1.1.0`
na sua branch, resolva (ou `/dyn-alm:feature` → "Atualizar minha branch com a release") e atualize o PR.

## 4. Merge → Dev volta para a release

Após aprovação, merge na `release/1.1.0`.
**Automático** com a esteira do GitHub ativa (push na `release/**` → deploy em Dev). **Até lá, manual:**

```bash
git checkout release/1.1.0 && git pull
npm run build
npm run deploy -- dev
```

## 5. Conferir que o Dev está pronto para o CoE

```bash
npm run status -- dev
```

```
  ✔ {{SOLUTION}} instalada em dev                   1.1.0.11
  ✔ deploy feito pela esteira (tag deployed/dev) b348328
  ✔ solution no ambiente = release/1.1.0         b348328
  ✔ versão instalada = versão do deploy          1.1.0.11 × 1.1.0.11
  ✔ sem alterações feitas à mão no ambiente      ok

  PRONTO para a esteira do CoE levar o pacote — versão 1.1.0.11 = commit b348328
```

Só rode/peça a esteira do CoE com **PRONTO**. A versão (`1.1.0.11`) identifica o commit.

## 6. Esteira do CoE

Roda como sempre: exporta do Dev → Artifactory → Homol → Prod. Nada muda para o CoE.
Para provar que o pacote do CoE é o commit da release:

```bash
npm run drift -- dev --zip C:\Downloads\{{SOLUTION}}_1_1_0_11.zip    # "Sem drift" = idêntico
```

Achou bug em Homol? Volte ao passo 1 (feature a partir da `release/1.1.0`) — a versão sobe para `1.1.0.12`, …

## 7. (Responsável pela release) Fechar depois de Prod

Quando o CoE confirmar a versão em produção:

```bash
git checkout release/1.1.0 && git pull
npm run release:finish                     # ou --version 1.1.0.11 se o Dev já mudou
```

Confere a versão em prod, cria a tag `v1.1.0` no commit que foi para prod e abre o **PR `release/1.1.0 → main`**
com as release notes. Depois do merge, apague a branch da release.

---

## Não faça

- ❌ Editar webresource no portal (make.powerapps.com / editor clássico). Vira drift e trava o próximo deploy.
- ❌ Editar arquivos em `solution/` à mão — use `new-webresource`.
- ❌ PR de feature para a `main` — a `main` só recebe a release que foi para produção.
- ❌ `npm run deploy -- dev --force` — sobrescreve o que alguém fez no ambiente.
- ❌ Deixar sua feature no Dev quando o CoE for rodar.
- ❌ Mexer nas tags `deployed/*` e `v*`.

## Por que o Dev recebe a solution como não gerenciada?

Porque o Dev é onde se desenvolve e é de onde **o CoE exporta** — e solution gerenciada não pode ser exportada.
Homol/Prod recebem a **gerenciada** (pela esteira do CoE). Na POC, `npm run deploy -- prod --version X` simula isso.

## Referência rápida

| Quero... | Comando | No Claude Code |
|---|---|---|
| Abrir release | `npm run release:start -- 1.1.0` | `/release-start 1.1.0` · `/dyn-alm:release` |
| Começar feature/fix | `dyn-alm feature` (ou `git checkout -b feature/x origin/release/1.1.0`) | `/dyn-alm:feature` |
| Onde estou / próximo passo | `dyn-alm jornada` | `/dyn-alm:jornada` |
| Criar webresource | `npm run new-webresource -- {{PREFIX}}_/x.js` | `/new-webresource {{PREFIX}}_/x.js` |
| Gerar o pacote | `npm run build` | `/build` |
| Subir no Dev | `npm run deploy -- dev` | `/deploy dev` |
| Ver se alguém mexeu no Dev | `npm run drift -- dev` | `/drift dev` |
| Trazer mudança do Dev para o Git | `npm run sync -- dev --merge` | `/sync-from-env dev` |
| Saber se o CoE pode rodar | `npm run status -- dev` | `/status dev` |
| O que mudou entre versões | `npm run release-notes -- v1.0.0 HEAD` | `/release-notes v1.0.0 HEAD` |
| Fechar release após Prod | `npm run release:finish` | `/release-finish` |
