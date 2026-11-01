---
name: alm
description: ALM de solutions Dynamics 365 / Dataverse com o Git como fonte da verdade — solution desempacotada no repo, pacote (unmanaged + managed) gerado pelo repositório, drift do ambiente com merge de 3 vias, fluxo release/feature, integração com a esteira do CoE e Artifactory. Use em repositórios que têm devops.config.json, ou quando o usuário falar de solution, webresource, pac solution, deploy em Dev, drift, versão de solution ou release de Dynamics/Power Platform.
user-invocable: false
---

# Dyn ALM — ALM de solutions Dynamics 365 / Dataverse

Repositórios gerados pelo kit `dyn-alm` seguem um contrato. Antes de agir num deles, leia o `CLAUDE.md` do repo e respeite as regras abaixo.

## Princípios
1. **Git é a fonte da verdade.** O pacote é gerado do repositório (`npm run build`), nunca exportado do ambiente para release.
2. **Devs editam só `src/`** (hoje `src/webresources/`). `solution/` guarda os metadados no formato do `pac solution unpack` e é o espelho do ambiente usado para detectar drift. `scripts/` e `.claude/commands/` são **ferramentas do kit**: fora do Git, copiadas do kit a cada `npm run` (`dyn-alm run`) — não edite no repo, evolua no kit.
6. **O kit se atualiza sozinho** (de hora em hora, ao usar o `dyn-alm`/jornada): `git pull` na pasta do kit + plugin. Não pergunte ao usuário; se a pasta do kit estiver em outra branch ou com alterações, ele só avisa. Workflows/docs versionados no repo: `dyn-alm upgrade` (ou `--all`).
3. **Mudança feita direto no ambiente é drift**: volta para o Git por `npm run sync -- dev --merge` (merge de 3 vias com base na tag `deployed/dev`), nunca copiando arquivo à mão.
4. **Fluxo**: `main` = produção · `release/X.Y.Z` = o que o Dev reflete e o CoE vai levar · `feature/*` e `fix/*` saem da release e voltam por PR. Detalhes: [references/fluxo.md](../../references/fluxo.md).
5. **Versão** = `<baseVersion do devops.config.json>.<nº de commits>` — automática, determinística; o `release:start` grava o baseVersion.

## Regras de segurança (sempre)
- **Peça confirmação antes de qualquer `deploy`** — altera um ambiente compartilhado. Em `prod`, só se o usuário pedir explicitamente.
- **Nunca use `--force`, `--replace`, `--allow-extra` ou `--skip-prod-check` por conta própria.** Explique o que a trava encontrou e pergunte.
- Exit 3 = drift no ambiente → ofereça `/sync-from-env`. Exit 4 = Dev ocupado pela branch de outra pessoa → mostre quem e pergunte.
- Não edite `solution/` à mão (exceto para resolver conflito de sync); webresource nova sempre por `npm run new-webresource`.
- Não mova nem apague tags `deployed/*` e `v*`.
- O mesmo login do `pac auth` (perfil UNIVERSAL) alcança todos os ambientes do tenant. Não assuma que "não logado em prod" = sem acesso.
- **Criar repo no GitHub, push e PR enviam o código para fora**: confirme antes (nome, visibilidade — privado por padrão). Se a permissão for negada, não contorne: entregue o comando `! dyn-alm github …` para o usuário rodar.
- Logins interativos (`gh`, `pac`) não rodam no shell do Claude: `github.js login` roda em background e você mostra o código de uso único; `pac auth create` vai como `! …` para o usuário.

## Comandos
Do plugin (funcionam em qualquer repo). Sem Claude, os mesmos passos existem na CLI `dyn-alm` (`dyn-alm jornada`, `dyn-alm init`, `dyn-alm feature`, `dyn-alm github`, `dyn-alm doctor`, `dyn-alm upgrade`):

| Comando | Para quê |
|---|---|
| **`/dyn-alm:jornada`** | **Guia da jornada inteira: mostra onde você está e conduz o próximo passo** (usa os wizards abaixo) |
| `/dyn-alm:init` | Criar repositório ALM — greenfield (solution nova) ou brownfield (zip baixado ou direto do Dev) |
| `/dyn-alm:feature` | Abrir feature/fix a partir da release, atualizar a branch, preparar o PR |
| `/dyn-alm:release` | Abrir release, ver o que vai nela, fechar depois de prod |
| `/dyn-alm:add` | Adicionar componente (webresource ✅; PCF, plugin, Custom API 📋 planejados) |
| `/dyn-alm:doctor` | Checar pré-requisitos e estado do repo/ambientes |
| `/dyn-alm:upgrade` | Atualizar scripts/workflows de um repo para a versão do kit |

Do repositório (`.claude/commands/`, para quem não tem o plugin): `/build`, `/deploy`, `/drift`, `/status`, `/sync-from-env`, `/new-webresource`, `/release-start`, `/release-finish`, `/release-notes`.
Scripts (`npm run …`): descritos em `docs/scripts.md` de cada repo e em [templates/repo/docs/scripts.md](../../templates/repo/docs/scripts.md).

## Referências (leia quando precisar)
- [references/onboarding.md](../../references/onboarding.md) — greenfield × brownfield (zip/ambiente), versão base, zip mais antigo que o Dev
- [references/fluxo.md](../../references/fluxo.md) — branches, versão, dois devs no mesmo JS, Dev compartilhado
- [references/componentes.md](../../references/componentes.md) — webresource (implementado) e plano para PCF, plugin, Custom API
- [references/coe-artifactory.md](../../references/coe-artifactory.md) — como o pacote chega em Homol/Prod pela esteira do CoE, testes de rastreio
- [references/troubleshooting.md](../../references/troubleshooting.md) — erros já vistos e a causa de cada um

## Ferramentas do plugin
- `node "${CLAUDE_PLUGIN_ROOT}/tools/cli.js" <comando>` — a CLI `dyn-alm` (wizard no terminal, sem IA)
- `node "${CLAUDE_PLUGIN_ROOT}/tools/scaffold.js" …` — cria o repo (usado pelo `/dyn-alm:init`)
- `node "${CLAUDE_PLUGIN_ROOT}/tools/journey.js" [--json]` — em que etapa da jornada o repo/branch está e quais os próximos passos (só lê git, não acessa o ambiente)
- `node "${CLAUDE_PLUGIN_ROOT}/tools/github.js" check|login|create <dono/nome>|pr` — `gh` (achado mesmo fora do PATH), login, cria o repo e publica as branches, abre o PR para a release (`dyn-alm github …` no terminal)
- `node "${CLAUDE_PLUGIN_ROOT}/tools/inspect-solution.js" <zip> [--json]` — lê nome, versão, publisher, prefixo e componentes de um zip (`--find <pasta>` lista zips)
- `node "${CLAUDE_PLUGIN_ROOT}/tools/upgrade.js" --target <repo> [--apply]` — atualiza arquivos gerenciados (usado pelo `/dyn-alm:upgrade`)
- Template: `${CLAUDE_PLUGIN_ROOT}/templates/repo/` (placeholders `{{SOLUTION}}`, `{{PREFIX}}`, `{{DEV_URL}}`, `{{REPO}}`)
