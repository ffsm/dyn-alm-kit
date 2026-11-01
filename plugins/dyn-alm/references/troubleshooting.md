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
