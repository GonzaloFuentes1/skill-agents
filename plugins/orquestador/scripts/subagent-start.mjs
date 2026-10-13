#!/usr/bin/env node
// SubagentStart: vincula agent_id con la delegación registrada por pre-agent y anuncia dónde queda su transcript.
import { dirname, join } from 'node:path';
import { conEstado } from './lib/estado.mjs';
import { emitir } from './lib/eventos.mjs';
import { nombreBase } from './lib/agentes.mjs';
import { ejecutarHook, esPrincipal } from './lib/hook-io.mjs';

// Patrón observado: <dir del transcript principal>/<session_id>/subagents/agent-<agent_id>.jsonl.
export function rutaTranscriptSubagente(entrada) {
  const { transcript_path: t, session_id: s, agent_id: a } = entrada ?? {};
  if (!t || !s || !a) return null;
  return join(dirname(t), s, 'subagents', `agent-${a}.jsonl`);
}

export function asignarAgente(entrada, estado, ahora = Date.now()) {
  const tipo = nombreBase(entrada.agent_type);
  const candidatas = Object.entries(estado.activas)
    .filter(([, a]) => !a.agentId && nombreBase(a.agente) === tipo)
    .sort(([, x], [, y]) => x.inicio - y.inicio);
  if (candidatas.length) {
    candidatas[0][1].agentId = entrada.agent_id;
    return { evento: null, id: candidatas[0][0] };
  }
  const id = `agente-${entrada.agent_id}`;
  const agente = entrada.agent_type ?? 'desconocido';
  estado.activas[id] = { agente, meta: '', modelo: 'desconocido', esfuerzo: 'desconocido', inicio: ahora, agentId: entrada.agent_id };
  return { evento: { tipo: 'delegacion', session: estado.session, id, agente, meta: '', modelo: 'desconocido', esfuerzo: 'desconocido', origenModelo: 'externo' }, id };
}

export async function manejar(entrada, env = process.env) {
  const { evento, id } = await conEstado(entrada.session_id, (e) => asignarAgente(entrada, e), env);
  emitir(evento, env);
  emitir({ tipo: 'agente-inicio', session: entrada.session_id, id, agentId: entrada.agent_id, agente: entrada.agent_type ?? null, transcript: rutaTranscriptSubagente(entrada) }, env);
  return null;
}

if (esPrincipal(import.meta.url)) ejecutarHook((e) => manejar(e));
