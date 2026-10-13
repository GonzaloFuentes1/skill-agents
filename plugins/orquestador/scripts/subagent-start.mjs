#!/usr/bin/env node
// SubagentStart: vincula agent_id con la delegación registrada por pre-agent.
import { conEstado } from './lib/estado.mjs';
import { emitir } from './lib/eventos.mjs';
import { nombreBase } from './lib/agentes.mjs';
import { ejecutarHook, esPrincipal } from './lib/hook-io.mjs';

export function asignarAgente(entrada, estado, ahora = Date.now()) {
  const tipo = nombreBase(entrada.agent_type);
  const candidatas = Object.values(estado.activas)
    .filter((a) => !a.agentId && nombreBase(a.agente) === tipo)
    .sort((x, y) => x.inicio - y.inicio);
  if (candidatas.length) {
    candidatas[0].agentId = entrada.agent_id;
    return { evento: null };
  }
  const id = `agente-${entrada.agent_id}`;
  const agente = entrada.agent_type ?? 'desconocido';
  estado.activas[id] = { agente, meta: '', modelo: 'desconocido', esfuerzo: 'desconocido', inicio: ahora, agentId: entrada.agent_id };
  return { evento: { tipo: 'delegacion', session: estado.session, id, agente, meta: '', modelo: 'desconocido', esfuerzo: 'desconocido', origenModelo: 'externo' } };
}

export async function manejar(entrada, env = process.env) {
  const { evento } = await conEstado(entrada.session_id, (e) => asignarAgente(entrada, e), env);
  emitir(evento, env);
  return null;
}

if (esPrincipal(import.meta.url)) ejecutarHook((e) => manejar(e));
