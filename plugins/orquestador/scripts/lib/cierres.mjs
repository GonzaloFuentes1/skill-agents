// Cierre de delegaciones que murieron sin SubagentStop: detenidas con TaskStop, proceso de Claude Code cerrado o sesión
// retomada (los agentes en segundo plano del proceso anterior ya no existen). Libera el cupo de paralelismo y avisa al
// dashboard con un fin "detenido". El cupo de Fable no se devuelve: el agente alcanzó a correr.
import { existsSync } from 'node:fs';
import { conEstado } from './estado.mjs';
import { emitir } from './eventos.mjs';
import { rutaSesion } from './rutas.mjs';

export function cerrarActivas(estado, elegir, motivo, ahora = Date.now()) {
  const eventos = [];
  for (const [id, a] of Object.entries(estado.activas)) {
    if (!elegir(id, a)) continue;
    delete estado.activas[id];
    eventos.push({
      tipo: 'fin', session: estado.session, id, agentId: a.agentId ?? null, agente: a.agente, modeloReal: null,
      tokensIn: 0, tokensOut: 0, costoUSD: 0, duracionMs: ahora - (a.inicio ?? ahora), ok: false, detenido: true, motivo,
    });
  }
  return eventos;
}

// Cierra en el estado de la sesión las delegaciones elegidas y emite sus eventos. Devuelve cuántas cerró.
// Una sesión sin archivo de estado no tiene delegaciones: no se crea nada.
export async function cerrarDeSesion(session, elegir, motivo, env = process.env) {
  if (!session || !existsSync(rutaSesion(session, env))) return 0;
  const eventos = await conEstado(session, (e) => cerrarActivas(e, elegir, motivo), env);
  for (const ev of eventos) emitir(ev, env);
  return eventos.length;
}
