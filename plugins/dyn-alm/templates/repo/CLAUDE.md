# CLAUDE.md

As regras deste repositório valem para qualquer agente e estão no AGENTS.md:

@AGENTS.md

## Específico do Claude Code
- Com o plugin `dyn-alm` instalado: `/dyn-alm:jornada` guia o próximo passo; `/dyn-alm:feature`, `/dyn-alm:release`, `/dyn-alm:add` são os wizards.
- Sem o plugin: os comandos do repo em `.claude/commands/` (`/build`, `/deploy`, `/status`, `/sync-from-env`, `/new-webresource`, `/release-start`, `/release-finish`, `/release-notes`).
- Use a ferramenta de perguntas (AskUserQuestion) para confirmar deploy e para escolhas com opções claras.
