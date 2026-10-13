# Hallazgos de las sondas sobre los hooks de Claude Code 2.1.296

Fecha: 2026-10-12. Fuente: `bench/resultados/sondas-1791847299273.json`, generado con `node bench/sondas.mjs` (2 corridas en Sonnet, unos US$0,36 de costo equivalente).

| Pregunta | Respuesta observada |
|---|---|
| Tool de delegación | `Agent` |
| Campos de `tool_input` | `description`, `prompt`, `subagent_type`, `model`, `effort` y `run_in_background`. `model` y `effort` aparecen solo si el orquestador los pasa |
| ¿Viene `model` en `tool_input`? | Sí, cuando se pasa explícito |
| ¿Viene `effort` en `tool_input`? | Sí, cuando se pasa explícito |
| Campos comunes a todos los eventos | `session_id`, `transcript_path`, `cwd`, `scratchpad_dir` y `hook_event_name`. PreToolUse, PostToolUse y SubagentStop agregan `prompt_id`, `permission_mode` y `effort` (el esfuerzo de la sesión principal) |
| Campos de SubagentStart | `agent_id` y `agent_type` |
| Campos de SubagentStop | `agent_id`, `agent_type`, `agent_transcript_path`, `last_assistant_message`, `stop_hook_active`, `background_tasks` y `session_crons` |
| Campo con el transcript del subagente | `agent_transcript_path` |
| Campos de `tool_response` (PostToolUse) | `status`, `prompt`, `agentId`, `agentType`, `content`, `resolvedModel`, `totalDurationMs`, `totalTokens`, `totalToolUseCount`, `usage`, `canContinueAgent` y los campos `harness*` |
| Orden de los eventos | SessionStart, PreToolUse, SubagentStart, SubagentStop y PostToolUse. PostToolUse llega **después** de SubagentStop |
| Caso modelo-explicito (se esperaba haiku) | OK: corrió `claude-haiku-5-5` |
| Caso modelo-frontmatter (se esperaba sonnet) | OK: corrió `claude-sonnet-5-5` |
| Forma de hook `command` + `args` (exec) en `--settings` | Funciona |

## Consecuencias para la Fase 1

- **Ninguna corrección** a `lib/campos.mjs`. Todos los nombres que se suponían están confirmados.
- Hay dos oportunidades que quedan **fuera de la Fase 1**:
  1. El `effort` de nivel superior que reciben los hooks es el esfuerzo de la sesión principal. Podría mostrarse en la status line del orquestador.
  2. `tool_response.resolvedModel` y `tool_response.usage` en PostToolUse podrían servir de respaldo para conocer el modelo real cuando no se pueda leer el transcript.
