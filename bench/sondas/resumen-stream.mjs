// Resume la captura de la sonda stream-json: qué tipos llegan y si se cumple el protocolo del plan A.
export function resumirStreamJson(lineas) {
  const msgs = [];
  for (const l of lineas) { try { msgs.push(JSON.parse(l)); } catch { /* línea no JSON */ } }
  const tipos = {};
  for (const m of msgs) {
    const k = m.type === 'system' || m.type === 'stream_event' ? `${m.type}:${m.subtype ?? m.event?.type ?? ''}` : m.type;
    tipos[k] = (tipos[k] ?? 0) + 1;
  }
  const permisos = msgs.filter((m) => m.type === 'control_request' && m.request?.subtype === 'can_use_tool');
  const resultados = msgs.filter((m) => m.type === 'result');
  return {
    tipos,
    sessionId: msgs.find((m) => m.type === 'system' && m.subtype === 'init')?.session_id ?? null,
    textoParcial: msgs.some((m) => m.type === 'stream_event' && m.event?.delta?.type === 'text_delta'),
    permisoHost: permisos.length > 0,
    ejemploPermiso: permisos[0] ?? null,
    turnos: resultados.length,
    variosTurnosEnUnProceso: resultados.length >= 2,
    resultados: resultados.map((m) => m.subtype ?? null),
    cancelaciones: msgs.filter((m) => m.type === 'control_cancel_request').length,
    controles: msgs.filter((m) => m.type === 'control_response')
      .map((m) => ({ id: m.response?.request_id ?? null, subtipo: m.response?.subtype ?? null, error: m.response?.error ?? null })),
  };
}
