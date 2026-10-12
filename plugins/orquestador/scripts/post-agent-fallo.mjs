#!/usr/bin/env node
// PostToolUseFailure(Agent|Task): la delegación falló antes de correr (tipo inexistente, error, interrupción).
// Se cierra para liberar el cupo de paralelismo y se devuelve el cupo de Fable que había tomado.
import { conEstado } from './lib/estado.mjs';
import { emitir } from './lib/eventos.mjs';
import { ejecutarHook, esPrincipal } from './lib/hook-io.mjs';

export function cerrarFallida(entrada, estado, ahora = Date.now()) {
  const id = entrada.tool_use_id;
  const a = id ? estado.activas[id] : null;
  if (!a) return { evento: null };
  delete estado.activas[id];
  if (a.contadaFable) estado.fableUsados = Math.max(0, estado.fableUsados - 1);
  return { evento: { tipo: 'fin', session: estado.session, id, agente: a.agente, modeloReal: null,
    tokensIn: 0, tokensOut: 0, costoUSD: 0, duracionMs: ahora - a.inicio, ok: false } };
}

export async function manejar(entrada, env = process.env) {
  const { evento } = await conEstado(entrada.session_id, (e) => cerrarFallida(entrada, e), env);
  emitir(evento, env);
  return null;
}

if (esPrincipal(import.meta.url)) ejecutarHook((e) => manejar(e));
