# Greenfield × brownfield — como uma solution entra no Git

Tudo pelo `dyn-alm init` / `/dyn-alm:init` (wizard). O que pode ser lido do zip/ambiente não é perguntado.

| | Greenfield | Brownfield por zip | Brownfield do ambiente |
|---|---|---|---|
| Situação | solution ainda não existe | já existe; você tem o `.zip` (export do Dev, Artifactory, pacote do CoE) | já existe no Dev e você tem acesso |
| Como começar | `dyn-alm init` / `/dyn-alm:init` → "Solution nova" | coloque o zip em `<repo>/import/` e rode `dyn-alm init` / `/dyn-alm:init` (ou `dyn-alm init --zip caminho/do.zip` / `/dyn-alm:init caminho/do.zip`) | `dyn-alm init` / `/dyn-alm:init` → "Direto do ambiente Dev" |
| O wizard lê sozinho | — | nome, versão, managed/unmanaged, publisher, prefixo, componentes (`tools/inspect-solution.js`) | ambientes (`pac env list`), solutions e versões (`pac solution list`) |
| Versão base | `1.0.0` | **maior** que a do zip (sugere a próxima minor) | **maior** que a instalada |
| Script | `init-solution.js --new` | `init-solution.js --from-zip <zip>` | `init-solution.js --from-env` |
| Primeiro deploy | instala a solution vazia | só depois do `drift` (ver abaixo) | cria a linha de base; conteúdo igual ao Dev |

## Por que a versão base precisa ser maior
A versão é `<baseVersion>.<nº de commits>`. Num repo novo o 4º número recomeça em 1, então manter o `X.Y.Z` atual
geraria versões **menores** que a instalada (`1.3.0.12` instalada → build `1.3.0.2`). Upgrade de managed em Homol/Prod
falharia ou faria downgrade. O `scaffold` e o `init-solution` recusam versão base ≤ a existente.

## Zip managed
Aceito, com aviso. O conteúdo de webresources é igual; metadados de outros componentes podem divergir do unmanaged.
Prefira o export unmanaged do Dev como fonte da verdade.

## Zip mais antigo que o Dev (cuidado)
Se o zip veio do Artifactory/CoE e o Dev já tem mudanças mais novas, **um deploy logo após o init apagaria essas mudanças do Dev**.
Por isso, no brownfield:
1. `npm run drift -- dev` (só lê).
2. Sem drift → `npm run deploy -- dev` cria a tag `deployed/dev` (linha de base).
3. Com drift → `npm run sync -- dev --merge` traz o que o Dev tem de novo para o repo; depois `build` + `deploy`.
A trava de drift do `deploy` também bloqueia esse caso (sem tag `deployed/dev`, ela compara o Dev com o repo).

## O zip não vai para o Git
`*.zip` está no `.gitignore`. A pasta `import/` é só um lugar conveniente para soltar o arquivo; pode apagar depois.

## Repo que já existe com código solto
Se já existe um repositório com JS/HTML fora da estrutura (ex.: uma pasta `WebResources/` copiada à mão), rode o
`dyn-alm init` / `/dyn-alm:init` nele (os arquivos do template são adicionados; `.gitignore` é mesclado) e compare o conteúdo antigo
com `src/webresources/` gerado do zip/ambiente antes de apagar o antigo — o que estiver no ambiente é o que vale.
