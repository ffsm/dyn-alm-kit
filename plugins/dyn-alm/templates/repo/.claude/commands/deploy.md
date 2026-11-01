---
description: Faz deploy do pacote gerado pelo Git em um ambiente (com trava contra sobrescrever drift)
argument-hint: "<dev|prod> [--version X.Y.Z.N]"
allowed-tools: Bash(npm run deploy:*), Bash(npm run build:*), Bash(git log:*), Read
---
Deploy em `$ARGUMENTS`.

1. Se for `dev` e não existir `out/build-info.json` do commit atual (`git rev-parse HEAD`), rode `npm run build` antes.
2. Antes de executar, me diga: ambiente, versão, commit e PRs que vão entrar (`npm run release-notes -- deployed/<env> HEAD`). Peça confirmação — deploy altera um ambiente compartilhado.
3. Rode `npm run deploy -- $ARGUMENTS`.
4. Se sair com código 3 (drift), NÃO use `--force` por conta própria: explique o que está no ambiente e ofereça `/sync-from-env`.
