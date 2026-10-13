#!/usr/bin/env node
// PostToolUse(Agent|Task): respaldo. En segundo plano el tool vuelve al lanzar, así que solo se marca;
// en primer plano, si SubagentStop no cerró la delegación, se cierra aquí sin datos de modelo.
import { conEstado } from './lib/estado.mjs';
import { emitir } from './lib/eventos.mjs';
import { leer } from './lib/campos.mjs';
import { ejecutarHook, esPrincipal } from './lib/hook-io.mjs';

export function cerrarSincrona(entrada, estado, ahora = Date.now()) {
  const id = entrada.tool_use_id;
  const a = id ? estado.activas[id] : null;
  if (!a) return { evento: null };
  if (leer.enSegundoPlano(entrada) !== false) { a.lanzada = true; return { evento: null }; }
  delete estado.activas[id];
  return { evento: { tipo: 'fin', session: estado.session, id, agente: a.agente, modeloReal: null,
    tokensIn: 0, tokensOut: 0, costoUSD: 0, duracionMs: ahora - a.inicio, ok: true } };
}

export async function manejar(entrada, env = process.env) {
  const { evento } = await conEstado(entrada.session_id, (e) => cerrarSincrona(entrada, e), env);
  emitir(evento, env);
  return null;
}

if (esPrincipal(import.meta.url)) ejecutarHook((e) => manejar(e));
