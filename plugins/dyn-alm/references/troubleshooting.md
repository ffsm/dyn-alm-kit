# Troubleshooting — erros já vistos

| Sintoma | Causa | Correção |
|---|---|---|
| `AADSTS700082: The refresh token has expired due to inactivity` | Perfil do `pac auth` sem uso por 90 dias | `pac auth create --name <env> --environment <url>` |
| `Solution package type did not match requested type` ao gerar managed | `<Managed>0</Managed>` no `Solution.xml` | Repo usa `<Managed>2</Managed>` (Both); o `init-solution` já grava assim |
| Pack: `Following root components are not defined in customizations` | `Customizations.xml` sem o nó `<WebResources />` | O `init-solution` adiciona; em repo antigo, inclua após `<optionsets />` |
| Pack: `required by the solution, are not present … WebResource-x` | `RootComponent` ausente (ex.: `<RootComponents />` autofechado) | `npm run new-webresource` trata os dois formatos e falha se não conseguir inserir |
| `pac solution init`: `Only characters within the ranges [A - Z]…` | Espaço no nome único do publisher | Nome único sem espaço (`ezsoftware`); nome de exibição em `--publisher-display` |
| Drift logo após o deploy, só em `Solution.xml`/`Customizations.xml`/`.data.xml` | Dataverse reescreve cabeçalho de versão da plataforma, `<FileName>` interno, `<Version>`, `<Managed>` | Já normalizado pelo sync (`VOLATILE` em `sync-from-env.js`); se aparecer campo novo, adicione lá |
| Deploy bloqueado com exit 3 logo depois de um merge de sync | Ambiente ≠ tag `deployed/<env>` | O deploy aceita se o commit já incorpora o drift (`git merge-tree`); se não, faça o merge |
| Deploy exit 4 | Dev está com branch não mesclada de outra pessoa | Combine com o autor; `--replace` só com acordo |
| `status` NÃO PRONTO só porque a branch avançou com docs | — | Já tratado: só mudanças em `solution/`/`src/` contam |
| Versão menor/repetida | Rebase/force-push ou clone raso | Proteja `main`/`release/*`; CI com `fetch-depth: 0` |
| Init recusa: `--base-version precisa ser maior` | Brownfield: a solution já está em X.Y.Z.N e o repo novo recomeça o 4º número | Use a próxima minor/patch sugerida |
| Init recusa: `O zip é da solution "X", mas devops.config.json diz "Y"` | Zip de outra solution | Confira o zip (`inspect-solution.js`) |
| Primeiro deploy brownfield bloqueado (exit 3) | O Dev tem mudanças mais novas que o zip | Esperado: `npm run sync -- dev --merge` antes do deploy |
| Arquivo `.js` em `solution/WebResources` não entra no commit | `.gitignore` bloqueia de propósito | Edite em `src/webresources/` |
| Consegui deployar em prod "sem logar" | Perfil `pac auth` UNIVERSAL vale para todo o tenant | Esteira com service principal; devs sem escrita em prod |
| `gh: command not found` logo depois de instalar o GitHub CLI | Terminal (ou sessão do Claude Code) aberto antes da instalação não recarrega o PATH | O kit acha o `gh` nos locais padrão (`C:\Program Files\GitHub CLI\gh.exe`…): use `dyn-alm github …`; ou abra um terminal novo |
| PR/esteira impossíveis: `fatal: 'origin' does not appear to be a git repository` | Repo criado pelo init e nunca publicado | `dyn-alm github create <dono/nome>` (cria privado, configura origin e publica main, release/* e a branch atual) |
| 1º deploy de uma feature (sem tag `deployed/dev`) bloqueado com exit 3, e o "drift" é a sua própria alteração revertida | Até o kit 1.3.0, sem a tag o drift comparava o ambiente com HEAD | Corrigido no 1.4.0: sem tag, a base é o ponto em que a branch saiu da main (`dyn-alm upgrade`). Em repo antigo: deploy da main primeiro (cria a tag), depois da feature |
| `release:start` falha em `git commit … terminou com código 1` | Template ≤ 1.2.0: baseVersion já era a versão pedida (init brownfield), nada a commitar — e a release fica igual à main, "não aberta" | Corrigido no 1.3.0 (commit vazio): `dyn-alm upgrade`. Em repo antigo: `git commit --allow-empty -m "chore: inicia release X.Y.Z"` na release |
| Claude Code: criar repo/push negado pelo modo automático | Upload de código para serviço externo exige aprovação | Rode o comando você mesmo (`! dyn-alm github create …`) ou libere a regra com `/update-config` |
| Push recusado: `refusing to allow an OAuth App to create or update workflow … without workflow scope` | Login do `gh` sem o escopo `workflow` (padrão do `gh auth login`); o repo ALM tem `.github/workflows/` | `dyn-alm github login --refresh`. O `create` checa antes de criar o repo; logins feitos pelo kit já pedem o escopo |
| `gh` instalado manualmente numa pasta fora do padrão (sem admin) | O kit procura no PATH e nos locais padrão | Defina `DYN_ALM_GH=<caminho do gh.exe>` |
| `/dyn-alm:*` no Claude Code se comporta como versão antiga, mas o `dyn-alm` do terminal está certo | A CLI é um link para a pasta do kit; o plugin do Claude Code é uma **cópia** (cache) renovada só quando a versão muda | `node install.js --update` (reinstala o plugin quando a cópia difere da pasta) e abra uma sessão nova |
| Repo com scripts de versão antiga do kit (jornada avisa) | Scripts da esteira são copiados em cada repo | `dyn-alm upgrade --all --apply` atualiza todos de uma vez (branch + commit em cada um) |
