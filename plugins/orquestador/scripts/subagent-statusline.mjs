#!/usr/bin/env node
// Status line por subagente: tipo, modelo·esfuerzo y meta de la delegación.
import { leerEstado } from './lib/estado.mjs';
import { familia } from './lib/modelos.mjs';
import { nombreBase } from './lib/agentes.mjs';
import { leerEntrada, esPrincipal } from './lib/hook-io.mjs';

const MAX_META = 40;
const recortar = (t) => (t.length > MAX_META ? `${t.slice(0, MAX_META).trimEnd()}…` : t);

export function renderSubagente(entrada, estado) {
  const idAgente = entrada.agent_id ?? entrada.id;
  const a = Object.values(estado.activas ?? {}).find((x) => idAgente && x.agentId === idAgente);
  if (!a) return `▶ ${nombreBase(entrada.agent_type ?? entrada.name ?? 'subagente')}`;
  return `▶ ${nombreBase(a.agente)} · ${familia(a.modelo)}·${a.esfuerzo} · "${recortar(a.meta ?? '')}"`;
}

export async function main({ stdin = process.stdin, stdout = process.stdout, env = process.env } = {}) {
  let entrada = {};
  try {
    entrada = await leerEntrada(stdin);
    stdout.write(renderSubagente(entrada, leerEstado(entrada.session_id, env)));
  } catch {
    stdout.write(`▶ ${entrada.agent_type ?? 'subagente'}`);
  }
}

if (esPrincipal(import.meta.url)) main();
