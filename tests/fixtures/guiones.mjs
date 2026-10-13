// Piezas de guion para claude-falso.mjs: formatos del protocolo stream-json (plan A, ver hallazgos-stream-json.md).
export const ESPERAR_USUARIO = { esperar: 'user' };
export const ESPERAR_RESPUESTA = { esperar: 'control_response' };
export const ESPERAR_PEDIDO = { esperar: 'control_request' };
export const INIT = { emitir: { type: 'system', subtype: 'init', session_id: 'ses-1', model: 'claude-opus-5-5' } };

export const texto = (id, ...trozos) => [
  { emitir: { type: 'stream_event', event: { type: 'message_start', message: { id } }, parent_tool_use_id: null } },
  ...trozos.map((t) => ({ emitir: { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } }, parent_tool_use_id: null } })),
  { emitir: { type: 'assistant', message: { id, content: [{ type: 'text', text: trozos.join('') }] }, parent_tool_use_id: null } },
];
export const permiso = (rid, command) => ({ emitir: { type: 'control_request', request_id: rid, request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command } } } });
export const fin = (extra = {}) => ({ emitir: { type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0.01, duration_ms: 900, session_id: 'ses-1', ...extra } });
export const finInterrumpido = { emitir: { type: 'result', subtype: 'error_during_execution', is_error: true, session_id: 'ses-1', result: 'Interrumpido' } };
export const turnoSimple = (t = 'Hola') => [ESPERAR_USUARIO, INIT, ...texto('m1', t), fin()];
export const cancelarPermiso = (rid) => ({ emitir: { type: 'control_cancel_request', request_id: rid } });
export const denegado = (herramienta, command, motivo) => ({ emitir: { type: 'system', subtype: 'permission_denied', tool_name: herramienta, tool_input: { command }, reason: motivo } });
