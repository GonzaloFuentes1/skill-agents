# Hallazgos: protocolo stream-json (sondas del 2026-10-12/13)

Versión de Claude Code: 2.1.296 (Windows). Capturas en `bench/resultados/` (no versionadas): `stream-json-1791859486360.jsonl` (básica), `-1791887533637` (`--interrumpir`), `-1791887597592` (`--escritura` sin `--permission-prompt-tool`), `-1791887711696` (`--escritura` con `--permission-prompt-tool stdio`).

| Supuesto (spec §2) | Resultado | Evidencia |
|---|---|---|
| Varios mensajes de usuario en un proceso | Sí | 2 `result` en el mismo proceso en todas las corridas |
| Texto parcial (`stream_event` text_delta) | Sí | `content_block_delta` con `delta.type: "text_delta"` |
| Permisos por host (`control_request` can_use_tool) | Sí, **solo con `--permission-prompt-tool stdio`** | Sin el flag, Write se deniega solo ("Claude requested permissions to write to …, but you haven't granted it yet"). Con el flag llega `{type:"control_request", request_id, request:{subtype:"can_use_tool", tool_name:"Write", display_name, input, description, permission_suggestions, tool_use_id}}` y la respuesta `{type:"control_response", response:{subtype:"success", request_id, response:{behavior:"allow", updatedInput}}}` es aceptada (el archivo se creó) |
| `set_permission_mode` | Sí | `control_response` success `{mode:"acceptEdits"}` |
| `interrupt` | Sí | A mitad de turno: success `{still_queued:[]}`, luego un mensaje de usuario `[Request interrupted by user]` y `result` con `subtype: "error_during_execution"`; el proceso sigue sirviendo el turno siguiente. No llegó `control_cancel_request` |
| Hooks del plugin en `-p` | Sí | `system:hook_started` / `hook_response` del SessionStart del orquestador |

## Otros formatos observados
- `system:init` llega **una vez por turno** (mismo `session_id`).
- Los mensajes `assistant` llegan **uno por bloque** con el mismo `message.id`.
- El razonamiento llega redactado: `{type:"thinking", thinking:"", signature}`.
- `tool_result` llega como mensaje `user` con `parent_tool_use_id: null`; `content` puede ser string.
- Tipos que se ignoran sin problema: `system:status`, `system:thinking_tokens`, `rate_limit_event`, `stream_event` de `message_delta`/`message_stop`/`content_block_start`/`content_block_stop`.
- Comandos de solo lectura (p. ej. `node --version`) se ejecutan sin pedir permiso en modo `manual`.

## Decisión
- Plan A completo, con `--permission-prompt-tool stdio` agregado a los argumentos (commit 7aeeeca).
- Ajustes aplicados: el historial oculta `[Request interrupted by user…]`; el gestor trata el `result` `error_during_execution` tras un interrupt como "Detuviste el turno.", y tiene respaldo de 10 s si no llegara.
- No hace falta el plan B (MCP propio de permisos).
