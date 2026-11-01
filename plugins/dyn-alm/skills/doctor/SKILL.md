---
name: doctor
description: Checa pré-requisitos e saúde de um repositório ALM Dataverse — Node, Git, PAC CLI, login, URLs, GitHub CLI e remoto, linha de base no Dev e versão do template — e acessa os ambientes para confirmar login e solution instalada.
disable-model-invocation: true
allowed-tools: Bash(node *cli.js* doctor) Bash(node *github.js* check *) Bash(pac solution list *) Bash(git branch *)
---

# /dyn-alm:doctor

1. Rode `node "${CLAUDE_PLUGIN_ROOT}/tools/cli.js" doctor` (mesma checagem do `dyn-alm doctor` no terminal) e mostre a tabela.
2. Se for um repo ALM, confirme o acesso aos ambientes (a checagem local não detecta token expirado): `pac solution list --environment <url de cada ambiente do devops.config.json>`. AADSTS700082 = login expirado → `! pac auth create --name <env> --environment <url>`. Falha em prod pode ser intencional (devs sem acesso) — marque ⚠, não ✖.
3. GitHub: `gh` ausente → avise que é pré-requisito e que o dev instala manualmente (https://cli.github.com; não sugira gerenciador de pacotes — a empresa restringe). Terminal já aberto não o vê no PATH; o kit acha mesmo assim; sem login → `github.js login` em background (mostre o código); sem escopo workflow → `github.js login --refresh` (idem); sem remoto → §9 do `/dyn-alm:init`.
4. Termine com no máximo 3 próximos passos, em ordem. Tudo ✔ → sugira `/dyn-alm:jornada`.
