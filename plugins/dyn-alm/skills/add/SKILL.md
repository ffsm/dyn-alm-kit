---
name: add
description: Wizard para adicionar um componente a uma solution num repositório ALM Dataverse — webresource (suportado) ou PCF, plugin e Custom API (planejados, com orientação).
disable-model-invocation: true
argument-hint: "[webresource|pcf|plugin|customapi] [nome]"
allowed-tools: Bash(git status *) Bash(git branch *)
---

# /dyn-alm:add — adicionar componente

Pergunte com **AskUserQuestion**. Referência: `${CLAUDE_PLUGIN_ROOT}/references/componentes.md` — leia antes de responder sobre tipos 📋.

## 0. Contexto
Repo ALM? Branch atual deve ser `feature/*` ou `fix/*` — se estiver na `release/*` ou `main`, ofereça `/dyn-alm:feature` primeiro. Prefixo: `<CustomizationPrefix>` em `solution/Other/Solution.xml`.

## 1. Tipo
"Webresource (JS, HTML, CSS, imagem)" / "PCF (code component)" / "Plugin" / "Custom API".

## Webresource
1. Pergunte, numa rodada: tipo de arquivo (js / html / css / outro), pasta lógica (sugira a partir do contexto, ex. `form/conta`, `ribbon`, `paginas`) e nome do arquivo. Monte `<prefixo>_/<pasta>/<arquivo>.<ext>` e mostre antes de criar.
2. Nome de exibição (sugira um).
3. `npm run new-webresource -- <nome> --display "<exibição>"`.
4. Para JS de formulário: pergunte o evento (OnLoad / OnSave / OnChange de campo / comando de ribbon) e gere o esqueleto no padrão dos arquivos existentes (namespace, IIFE, `"use strict"`, handler recebendo `executionContext`). Lembre que **registrar o handler no formulário é feito no portal do Dev** e depois volta para o Git com `npm run sync -- dev --merge`.
5. `npm run build -- --allow-dirty` para validar; lembre de commitar.

## PCF / Plugin / Custom API (planejados)
Explique em poucas linhas o plano do `componentes.md` para o tipo escolhido (onde fica a fonte, como entra no pacote, riscos) e diga claramente que **o repo ainda não automatiza esse tipo**. Ofereça: "Registrar como próximo passo no roadmap do projeto" / "Fazer manualmente agora com orientação" / "Cancelar". Se manual: guie com `pac pcf init` / `pac plugin init` numa pasta `src/<tipo>/` e valide com `pac solution pack` + import num ambiente de teste antes de levar adiante — não altere os scripts da esteira sem combinar.
