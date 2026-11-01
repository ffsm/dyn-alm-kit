# dyn-alm-kit

Kit de ALM para solutions **Dynamics 365 / Dataverse** com o Git como fonte da verdade:
o pacote da solution é gerado do repositório (não exportado do ambiente), cada versão sabe de qual commit e PRs veio,
e o que é feito direto no ambiente volta para o Git com merge de 3 vias.

O mesmo kit funciona de três jeitos:

| Quem | Como usa | O que tem |
|---|---|---|
| Qualquer dev, no terminal (sem IA) | **CLI `dyn-alm`** | wizard no terminal (`dyn-alm init`), mapa da jornada com o próximo comando (`dyn-alm jornada`), `feature`, `doctor`, `upgrade` |
| Claude Code | **plugin `dyn-alm`** | os mesmos passos conversando: `/dyn-alm:jornada`, `/dyn-alm:init`, `/dyn-alm:feature`… |
| Devin, Copilot, Cursor, outros agentes | **`AGENTS.md`** que vai em cada repo gerado | regras do repo (onde editar, comandos, o que nunca fazer sem confirmação) |

Os scripts da esteira (`npm run build/deploy/sync/status…`) são **copiados para cada repo** gerado — funcionam no CI e para quem não instalou nada.

## Instalar

Pré-requisitos: Node 20+ e Git. PAC CLI para falar com o Dataverse (`dotnet tool install --global Microsoft.PowerApps.CLI.Tool`). GitHub CLI para publicar o repo e abrir PRs (instalação manual: https://cli.github.com; depois `dyn-alm github login`). O instalador só avisa o que falta — não instala dependências.
Claude Code é opcional — sem ele, instala só a CLI.

```bash
git clone <onde o kit estiver>      # hoje: C:\Users\Dev\source\repos\dyn-alm-kit (só local)
cd dyn-alm-kit
node install.js                     # ou dois cliques em install.cmd
```

O instalador confere os pré-requisitos, instala a CLI `dyn-alm` (global, ligada à pasta do kit) e, se houver Claude Code,
o plugin `dyn-alm`. Pode rodar de novo sem problema.

| Quero | Comando |
|---|---|
| Instalar | `node install.js` (ou `install.cmd`) |
| Atualizar | **automático**: de hora em hora, ao usar o `dyn-alm`, o kit faz `git pull` da main e renova o plugin (desliga com `DYN_ALM_NO_UPDATE=1`). Manual: `node install.js --update` |
| Remover | `node install.js --uninstall` — atenção: os repos de solution rodam os scripts do kit (`dyn-alm run`) |

Depois de instalar: no terminal, `dyn-alm jornada` dentro de um repo de solution (ou `dyn-alm init` para criar um);
no Claude Code, abra uma **sessão nova** e digite `/dyn-alm:jornada`.

## Usar

```bash
dyn-alm jornada          # onde estou e qual o próximo comando
dyn-alm init             # novo repo: solution nova, zip baixado (coloque em import/) ou direto do Dev
dyn-alm feature          # nova feature/fix a partir da release aberta
dyn-alm doctor           # pré-requisitos e saúde do repo (inclui gh, login GitHub e remoto)
dyn-alm github create ffsm/meu-repo   # cria o repo no GitHub (privado) e publica main, release/* e a branch atual
dyn-alm github pr        # push da branch + PR para a release aberta
dyn-alm upgrade          # o que mudaria nos scripts do repo com a versão atual do kit (--apply aplica)
dyn-alm upgrade --all    # todos os repos ALM da pasta (~/source/repos): --apply cria chore/kit-<versão> em cada um e commita
dyn-alm inspect x.zip    # o que há num zip de solution
```

```
  ✔ 1 Preparar                       MinhaSolution · release 1.1.0
  ▶ 2 Desenvolver                    feature/x · alterações não commitadas
  ○ 3 Testar no Dev
  ○ 4 PR para a release
  ○ 5 Dev = release (PRONTO p/ CoE)
  ○ 6 CoE leva para Homol/Prod
  ○ 7 Fechar release

  → Commitar e testar no Dev  — há alterações não commitadas em src/ ou solution/
      $ git add src solution && git commit -m "<o que mudou>" && npm run build && npm run deploy -- dev
```

## Comandos do plugin (Claude Code)

| Comando | Para quê | Arquivo |
|---|---|---|
| `/dyn-alm:jornada` | guia: mostra onde você está e conduz o próximo passo | [skills/jornada](plugins/dyn-alm/skills/jornada/SKILL.md) |
| `/dyn-alm:init` | criar repo (greenfield ou brownfield por zip/ambiente) | [skills/init](plugins/dyn-alm/skills/init/SKILL.md) |
| `/dyn-alm:feature` | feature/fix, atualizar com a release, testar no Dev, PR | [skills/feature](plugins/dyn-alm/skills/feature/SKILL.md) |
| `/dyn-alm:release` | abrir release, status p/ CoE, notas, fechar após prod | [skills/release](plugins/dyn-alm/skills/release/SKILL.md) |
| `/dyn-alm:add` | adicionar webresource (PCF/plugin/Custom API planejados) | [skills/add](plugins/dyn-alm/skills/add/SKILL.md) |
| `/dyn-alm:doctor` | pré-requisitos, login e acesso aos ambientes | [skills/doctor](plugins/dyn-alm/skills/doctor/SKILL.md) |
| `/dyn-alm:upgrade` | atualizar os scripts de um repo | [skills/upgrade](plugins/dyn-alm/skills/upgrade/SKILL.md) |
| *(automático)* | conhecimento e regras de segurança, carregado em repos ALM | [skills/alm](plugins/dyn-alm/skills/alm/SKILL.md) |

## Documentação

| Arquivo | Conteúdo |
|---|---|
| [references/onboarding.md](plugins/dyn-alm/references/onboarding.md) | greenfield × brownfield (zip ou ambiente), versão base, zip mais antigo que o Dev |
| [references/fluxo.md](plugins/dyn-alm/references/fluxo.md) | branches, versão automática, dois devs no mesmo JS, Dev compartilhado, tags |
| [references/componentes.md](plugins/dyn-alm/references/componentes.md) | webresource ✅ · PCF, plugin, Custom API 📋 |
| [references/coe-artifactory.md](plugins/dyn-alm/references/coe-artifactory.md) | como o pacote chega em Homol/Prod pela esteira do CoE |
| [references/troubleshooting.md](plugins/dyn-alm/references/troubleshooting.md) | erros já vistos e a causa |
| [templates/repo/docs/processo-dev.md](plugins/dyn-alm/templates/repo/docs/processo-dev.md) | passo a passo do dev (vai para cada repo) |
| [templates/repo/docs/scripts.md](plugins/dyn-alm/templates/repo/docs/scripts.md) | todos os scripts `npm run …` (vai para cada repo) |

## Estrutura

```
dyn-alm-kit/
├── install.js · install.cmd      instalador (instalar / --update / --uninstall)
├── package.json                  bin "dyn-alm" → plugins/dyn-alm/tools/cli.js
├── .claude-plugin/marketplace.json
└── plugins/dyn-alm/              ← tudo fica aqui (o Claude Code só copia esta pasta ao instalar)
    ├── .claude-plugin/plugin.json   versão do kit (fonte única)
    ├── tools/                    cli.js · scaffold · journey · inspect-solution · upgrade · build-template
    ├── templates/repo/           o que vai para cada repo (scripts, workflows, docs, AGENTS.md, CLAUDE.md)
    ├── references/               documentação de fundo
    └── skills/                   adaptador Claude Code (jornada, init, feature, release, add, doctor, upgrade, alm)
```

## Manter e lançar versão

1. Evolua e teste no **repo de referência** (hoje `C:\Users\Dev\source\repos\dyn-devops-poc`).
2. Regenere o template e suba a versão: `dyn-alm template --from <repo-de-referencia> --bump minor`
3. `claude plugin validate .` e commit + tag (`claude plugin tag plugins/dyn-alm` cria `dyn-alm--vX.Y.Z`).
4. Quem usa: `node install.js --update`.
5. Scripts da esteira: nada a fazer — ficam fora do Git e cada `npm run` copia a versão do kit (`dyn-alm run`). Workflows/docs versionados: `dyn-alm upgrade --all` (simula) → `--apply` (branch `chore/kit-<versão>` a partir da release aberta + commit em cada repo; depois push + PR). Repo antigo (scripts no Git): o mesmo `upgrade` migra uma vez.
   Consequências: o runner da esteira precisa do kit instalado (`dyn-alm` no PATH do usuário do runner); um commit antigo rebuilda com os scripts atuais do kit.
   Repo de referência (`dyn-devops-poc`, sem `.dyn-alm/template.json`): continua com os scripts no Git — é de onde `dyn-alm template --from` gera o template; leve para ele as mudanças feitas direto no template antes de regenerar.

Sem subir a versão no `plugin.json`, o Claude Code não entrega a mudança para quem já instalou.

## Publicar (quando a empresa definir onde)

Hoje o kit é **só local**. Quando houver um lugar aprovado (GitHub/Azure DevOps da empresa):
```bash
git remote add origin <url-aprovada> && git push -u origin main --tags
```
Cada dev, com credencial git salva na máquina: `git clone <url-aprovada>` e `node install.js`. Repos de solution podem registrar o marketplace no `.claude/settings.json`
(`extraKnownMarketplaces`) — cada pessoa ainda instala o plugin uma vez.
