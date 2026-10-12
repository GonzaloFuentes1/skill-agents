#!/usr/bin/env node
// SubagentStop: lee el transcript del subagente, registra modelo real y costo, y alerta si no coincide.
import { readFileSync } from 'node:fs';
import { cargarConfig } from './lib/config.mjs';
import { conEstado } from './lib/estado.mjs';
import { emitir } from './lib/eventos.mjs';
import { familia, costoUSD } from './lib/modelos.mjs';
import { leer } from './lib/campos.mjs';
import { nombreBase } from './lib/agentes.mjs';
import { ejecutarHook, esPrincipal } from './lib/hook-io.mjs';

const CAMPOS_USO = ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'];

export function extraerUso(texto, precios) {
  const porMensaje = new Map();
  for (const linea of String(texto ?? '').split('\n')) {
    if (!linea.trim()) continue;
    let e;
    try { e = JSON.parse(linea); } catch { continue; }
    const msg = e?.message;
    if (e?.type !== 'assistant' || !msg?.model || msg.model === '<synthetic>') continue;
    porMensaje.set(msg.id ?? `sin-id-${porMensaje.size}`, { modelo: msg.model, uso: msg.usage ?? {} });
  }
  const uso = Object.fromEntries(CAMPOS_USO.map((k) => [k, 0]));
  const conteo = {};
  let costo = 0;
  for (const { modelo, uso: u } of porMensaje.values()) {
    conteo[modelo] = (conteo[modelo] ?? 0) + 1;
    for (const k of CAMPOS_USO) uso[k] += u[k] ?? 0;
    costo += costoUSD(u, modelo, precios);
  }
  const modeloReal = Object.entries(conteo).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { modeloReal, modelos: Object.keys(conteo), uso, costoUSD: costo };
}

export function cerrarDelegacion(entrada, estado, analisis, ahora = Date.now()) {
  let id = Object.keys(estado.activas).find((k) => estado.activas[k].agentId === entrada.agent_id);
  if (!id) {
    const tipo = nombreBase(entrada.agent_type);
    id = Object.keys(estado.activas)
      .filter((k) => nombreBase(estado.activas[k].agente) === tipo)
      .sort((x, y) => estado.activas[x].inicio - estado.activas[y].inicio)[0];
  }
  if (!id) return { eventos: [], alerta: null };
  const a = estado.activas[id];
  delete estado.activas[id];
  const u = analisis?.uso ?? {};
  const fin = {
    tipo: 'fin', session: estado.session, id, agentId: entrada.agent_id, agente: a.agente,
    modeloReal: analisis?.modeloReal ?? null,
    tokensIn: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    tokensOut: u.output_tokens ?? 0,
    costoUSD: analisis?.costoUSD ?? 0,
    duracionMs: ahora - a.inicio,
    ok: true,
  };
  estado.costoUSD += fin.costoUSD;
  const eventos = [fin];
  const esperado = familia(a.modelo);
  let alerta = null;
  if (fin.modeloReal && !['heredado', 'desconocido'].includes(esperado) && familia(fin.modeloReal) !== esperado) {
    alerta = `⚠ ${a.agente}: se pidió ${a.modelo} pero corrió ${fin.modeloReal}`;
    eventos.push({ tipo: 'alerta', session: estado.session, id, agente: a.agente, esperado: a.modelo, real: fin.modeloReal, mensaje: alerta });
  }
  return { eventos, alerta };
}

export async function manejar(entrada, env = process.env) {
  const config = cargarConfig(env);
  const ruta = leer.transcriptSubagente(entrada);
  let analisis = null;
  if (ruta) { try { analisis = extraerUso(readFileSync(ruta, 'utf8'), config.precios); } catch { /* sin transcript legible */ } }
  const r = await conEstado(entrada.session_id, (e) => cerrarDelegacion(entrada, e, analisis), env);
  for (const ev of r.eventos) emitir(ev, env);
  return r.alerta ? { systemMessage: `[orquestador] ${r.alerta}` } : null;
}

if (esPrincipal(import.meta.url)) ejecutarHook((e) => manejar(e));
