import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { renderLinea, main } from '../plugins/orquestador/scripts/statusline.mjs';
import { renderSubagente } from '../plugins/orquestador/scripts/subagent-statusline.mjs';
import { manejarInicio } from '../plugins/orquestador/scripts/session-start.mjs';
import { estadoVacio, leerEstado } from '../plugins/orquestador/scripts/lib/estado.mjs';
import { CONFIG_DEFECTO } from '../plugins/orquestador/scripts/lib/config.mjs';
import { rutaRaizPlugin } from '../plugins/orquestador/scripts/lib/rutas.mjs';
import { leerEventos } from '../plugins/orquestador/scripts/lib/eventos.mjs';

const conDos = () => {
  const e = estadoVacio('s');
  e.fableUsados = 1;
  e.activas.a = { agente: 'orquestador:investigador-rl', modelo: 'opus', esfuerzo: 'high', meta: 'Diseñar ablation de reward shaping con 3 seeds', agentId: 'x1' };
  e.activas.b = { agente: 'auditor-datos', modelo: 'claude-haiku-5-5', esfuerzo: 'low', meta: 'Perfilar CSV', agentId: 'x2' };
  return e;
};

test('renderLinea muestra orquestador, activos, fable y costo', () => {
  const l = renderLinea({ model: { id: 'claude-opus-5-5' }, cost: { total_cost_usd: 0.4212 } }, conDos(), CONFIG_DEFECTO);
  assert.equal(l, '🎛 opus │ ▶ investigador-rl (opus·high) ▶ auditor-datos (haiku·low) │ fable 1/2 │ $0.42');
});

test('renderLinea advierte si el orquestador no está en opus o fable', () => {
  assert.match(renderLinea({ model: { id: 'claude-sonnet-5-5' } }, estadoVacio('s'), CONFIG_DEFECTO), /⚠ orquestador en sonnet/);
});

test('renderLinea incluye el esfuerzo si viene en la entrada', () => {
  assert.match(renderLinea({ model: { id: 'claude-opus-5-5' }, effort: { level: 'xhigh' } }, estadoVacio('s'), CONFIG_DEFECTO), /^🎛 opus·xhigh/);
});

test('main registra modeloPrincipal y no lanza con entrada rota', async () => {
  const env = { ORQUESTADOR_HOME: mkdtempSync(join(tmpdir(), 'orq-')) };
  const out = { texto: '', write(t) { this.texto += t; } };
  await main({ stdin: Readable.from([JSON.stringify({ session_id: 's', model: { id: 'claude-fable-5-1' } })]), stdout: out, env });
  assert.equal(leerEstado('s', env).modeloPrincipal, 'fable');
  const out2 = { texto: '', write(t) { this.texto += t; } };
  await main({ stdin: Readable.from(['{roto']), stdout: out2, env });
  assert.match(out2.texto, /^🎛/);
});

test('renderSubagente usa agent_id y recorta la meta', () => {
  const l = renderSubagente({ agent_id: 'x1' }, conDos());
  assert.equal(l, '▶ investigador-rl · opus·high · "Diseñar ablation de reward shaping con 3…"');
  assert.equal(renderSubagente({ agent_type: 'Explore' }, estadoVacio('s')), '▶ Explore');
});

test('manejarInicio guarda la raíz del plugin, emite sesion e inyecta el recordatorio', () => {
  const env = { ORQUESTADOR_HOME: mkdtempSync(join(tmpdir(), 'orq-')) };
  const r = manejarInicio({ session_id: 's', cwd: '/p', source: 'startup' }, env, '/raiz/plugin');
  assert.equal(readFileSync(rutaRaizPlugin(env), 'utf8'), '/raiz/plugin');
  assert.match(r.hookSpecificOutput.additionalContext, /orquestador:orquestar/);
  assert.equal(leerEventos({ session: 's' }, env)[0].tipo, 'sesion');
});
