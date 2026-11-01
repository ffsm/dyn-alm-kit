---
description: Cria uma webresource nova (arquivo em src/ + metadados na solution)
argument-hint: "{{PREFIX}}_/caminho/arquivo.js [--display \"Nome\"]"
allowed-tools: Bash(npm run new-webresource:*), Bash(npm run build:*), Bash(git status:*), Read, Edit
---
1. Rode `npm run new-webresource -- $ARGUMENTS`. Se o nome não tiver o prefixo do publisher (`{{PREFIX}}_/`), explique e pergunte o nome certo.
2. Mostre os arquivos criados (`git status --short`).
3. Se eu descrevi o que a webresource deve fazer, escreva o código no arquivo de `src/webresources/` seguindo o padrão das webresources existentes em `src/webresources/` (namespace, IIFE, `"use strict"`).
4. Rode `npm run build -- --allow-dirty` para validar e lembre que é preciso commitar antes do build de verdade.
