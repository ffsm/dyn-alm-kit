# Esteira do CoE e Artifactory

## Como o pacote chega em Homol/Prod
O CoE **não muda nada**: continua exportando do Dev → Artifactory → Homol → Prod. A garantia vem da nossa parte:
o Dev só recebe pacotes gerados do Git, e `npm run status -- dev` = **PRONTO** antes do CoE rodar (Dev = ponta da `release/X.Y.Z`, sem drift).
A versão exportada (`X.Y.Z.N`) identifica o commit, desde que o CoE não reescreva a versão no export.

| Modo | Como | Quando |
|---|---|---|
| CoE exporta do Dev (padrão) | Dev = release; CoE exporta | Sem mudar o CoE |
| Publicar no Artifactory | `npm run publish` sobe o zip do Git no layout que o CoE consome | Quando o CoE aceitar consumir o pacote do repo |

## Perguntas para o time do CoE
- A esteira exporta **managed ou unmanaged**? (`--zip` aceita os dois)
- Ela altera a versão da solution no export?
- Dá para apontar a esteira para ambientes de teste?
- Onde/como baixar o zip que ela subiu no Artifactory?

## Provar que o pacote do CoE é o commit
```bash
npm run status -- dev                                      # PRONTO, anote versão/commit
# … CoE roda …
npm run drift -- dev --zip <zip baixado do Artifactory>    # "Sem drift" = idêntico ao commit deployed/dev
npm run release-notes -- <versão anterior> deployed/dev    # PRs/commits daquela versão
```

## Artifactory
- Grátis: **JFrog Artifactory OSS** (open source; Docker ou zip standalone). Use repositório **Generic**.
  `docker run -d --name artifactory -p 8081:8081 -p 8082:8082 releases-docker.jfrog.io/jfrog/artifactory-oss:latest`
- `npm run publish` → `<repo>/<Solution>/<versão>/` (zips, build-info.json, RELEASE_NOTES.md) com properties `git.commit`, `git.branch`, `git.tag`, `solution.version`, `pull.requests`.
- Variáveis: `ARTIFACTORY_URL`, `ARTIFACTORY_TOKEN` (ou `ARTIFACTORY_USER`/`ARTIFACTORY_PASSWORD`). Sem `ARTIFACTORY_URL`, usa a pasta `../artifactory-local`.

## Autenticação na esteira
Use service principal (App Registration + Application User no Dataverse, role mínima): `PP_APP_ID`, `PP_CLIENT_SECRET`, `PP_TENANT_ID`. Devs sem escrita em Homol/Prod.
