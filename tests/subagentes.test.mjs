import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asignarAgente } from '../plugins/orquestador/scripts/subagent-start.mjs';
import { extraerUso, cerrarDelegacion, manejar as manejarStop } from '../plugins/orquestador/scripts/subagent-stop.mjs';
import { cerrarSincrona } from '../plugins/orquestador/scripts/post-agent.mjs';
import { estadoVacio, guardarEstado, leerEstado } from '../plugins/orquestador/scripts/lib/estado.mjs';
import { CONFIG_DEFECTO } from '../plugins/orquestador/scripts/lib/config.mjs';
import { leerEventos } from '../plugins/orquestador/scripts/lib/eventos.mjs';

const conActiva = (extra = {}) => {
  const e = estadoVacio('s');
  e.activas.tu1 = { agente: 'orquestador:investigador-rl', meta: 'm', modelo: 'haiku', esfuerzo: 'low', inicio: 1000, agentId: null, ...extra };
  return e;
};
const transcript = (modelo) => [
  { type: 'assistant', message: { id: 'm1', model: modelo, usage: { input_tokens: 1000, output_tokens: 100 } } },
  { type: 'assistant', message: { id: 'm1', model: modelo, usage: { input_tokens: 1000, output_tokens: 100 } } },
  { type: 'assistant', message: { id: 'm2', model: modelo, usage: { input_tokens: 500, output_tokens: 50, cache_read_input_tokens: 200 } } },
  { type: 'assistant', message: { id: 'm3', model: '<synthetic>' } },
].map((x) => JSON.stringify(x)).join('\n');

test('asignarAgente vincula agent_id con la delegación pendiente más antigua del mismo tipo', () => {
  const e = conActiva();
  e.activas.tu2 = { agente: 'investigador-rl', inicio: 2000, agentId: null };
  assert.equal(asignarAgente({ agent_id: 'a1', agent_type: 'orquestador:investigador-rl' }, e).evento, null);
  assert.equal(e.activas.tu1.agentId, 'a1');
  assert.equal(e.activas.tu2.agentId, null);
});

test('asignarAgente sin delegación previa crea una entrada externa', () => {
  const e = estadoVacio('s');
  const r = asignarAgente({ agent_id: 'a9', agent_type: 'Explore' }, e, 5);
  assert.equal(r.evento.origenModelo, 'externo');
  assert.equal(e.activas['agente-a9'].agentId, 'a9');
});

test('extraerUso deduplica por id de mensaje, ignora <synthetic> y calcula el costo', () => {
  const r = extraerUso(transcript('claude-haiku-5-5'), CONFIG_DEFECTO.precios);
  assert.equal(r.modeloReal, 'claude-haiku-5-5');
  assert.deepEqual(r.uso, { input_tokens: 1500, output_tokens: 150, cache_read_input_tokens: 200, cache_creation_input_tokens: 0 });
  assert.ok(Math.abs(r.costoUSD - (1500 * 0.1 + 150 * 0.5 + 200 * 0.01) / 1e6) < 1e-12);
});

test('cerrarDelegacion: modelo correcto → fin sin alerta', () => {
  const e = conActiva({ agentId: 'a1' });
  const r = cerrarDelegacion({ agent_id: 'a1', agent_type: 'orquestador:investigador-rl' }, e, extraerUso(transcript('claude-haiku-5-5'), CONFIG_DEFECTO.precios), 4000);
  assert.deepEqual(r.eventos.map((x) => x.tipo), ['fin']);
  assert.equal(r.eventos[0].duracionMs, 3000);
  assert.equal(r.eventos[0].tokensIn, 1700);
  assert.equal(r.alerta, null);
  assert.deepEqual(e.activas, {});
});

test('cerrarDelegacion: modelo distinto → alerta', () => {
  const e = conActiva({ agentId: 'a1' });
  const r = cerrarDelegacion({ agent_id: 'a1' }, e, extraerUso(transcript('claude-opus-5-5'), CONFIG_DEFECTO.precios));
  assert.deepEqual(r.eventos.map((x) => x.tipo), ['fin', 'alerta']);
  assert.match(r.alerta, /se pidió haiku pero corrió claude-opus-5-5/);
});

test('cerrarDelegacion sin agentId asignado cierra la más antigua del mismo tipo', () => {
  const e = conActiva();
  const r = cerrarDelegacion({ agent_id: 'zz', agent_type: 'investigador-rl' }, e, null);
  assert.equal(r.eventos[0].id, 'tu1');
  assert.equal(r.eventos[0].modeloReal, null);
});

test('cerrarSincrona: en segundo plano solo marca; en primer plano cierra', () => {
  const e = conActiva();
  assert.equal(cerrarSincrona({ tool_use_id: 'tu1', tool_input: {} }, e).evento, null);
  assert.equal(e.activas.tu1.lanzada, true);
  const r = cerrarSincrona({ tool_use_id: 'tu1', tool_input: { run_in_background: false } }, e, 1500);
  assert.equal(r.evento.tipo, 'fin');
  assert.deepEqual(e.activas, {});
});

test('manejar (stop) lee el transcript, emite eventos y devuelve systemMessage ante mismatch', async () => {
  const env = { ORQUESTADOR_HOME: mkdtempSync(join(tmpdir(), 'orq-')) };
  guardarEstado(conActiva({ agentId: 'a1' }), env);
  const ruta = join(env.ORQUESTADOR_HOME, 't.jsonl');
  writeFileSync(ruta, transcript('claude-sonnet-5-5'));
  const salida = await manejarStop({ session_id: 's', agent_id: 'a1', agent_transcript_path: ruta }, env);
  assert.match(salida.systemMessage, /corrió claude-sonnet-5-5/);
  assert.deepEqual(leerEventos({ session: 's' }, env).map((x) => x.tipo), ['fin', 'alerta']);
  assert.ok(leerEstado('s', env).costoUSD > 0);
});
