import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderLinea } from '../plugins/orquestador/scripts/statusline.mjs';
import { manejar as manejarStop } from '../plugins/orquestador/scripts/subagent-stop.mjs';
import { manejar as manejarInicioAgente } from '../plugins/orquestador/scripts/subagent-start.mjs';
import { manejarInicio, textoRubrica, RUBRICA_PERSONALIZADA } from '../plugins/orquestador/scripts/session-start.mjs';
import { estadoVacio, guardarEstado } from '../plugins/orquestador/scripts/lib/estado.mjs';
import { CONFIG_DEFECTO, RUBRICA_FABRICA } from '../plugins/orquestador/scripts/lib/config.mjs';
import { rutaConfig } from '../plugins/orquestador/scripts/lib/rutas.mjs';
import { leerEventos } from '../plugins/orquestador/scripts/lib/eventos.mjs';

const home = (config) => {
  const env = { ORQUESTADOR_HOME: mkdtempSync(join(tmpdir(), 'orq-efe-')) };
  if (config !== undefined) writeFileSync(rutaConfig(env), typeof config === 'string' ? config : JSON.stringify(config));
  return env;
};
const conActiva = () => {
  const e = estadoVacio('s');
  e.activas.tu1 = { agente: 'orquestador:investigador-rl', meta: 'm', modelo: 'haiku', esfuerzo: 'low', inicio: 1000, agentId: 'a1' };
  return e;
};
const transcript = (modelo) => JSON.stringify({ type: 'assistant', message: { id: 'm1', model: modelo, usage: { input_tokens: 10, output_tokens: 5 } } });

test('status line: mostrarCosto false oculta el costo', () => {
  const entrada = { model: { id: 'claude-opus-5-5' }, cost: { total_cost_usd: 0.42 } };
  assert.match(renderLinea(entrada, estadoVacio('s'), CONFIG_DEFECTO), /\$0\.42/);
  assert.doesNotMatch(renderLinea(entrada, estadoVacio('s'), { ...CONFIG_DEFECTO, mostrarCosto: false }), /\$/);
});

test('SubagentStop: con alertasModelo false no hay systemMessage, pero la alerta queda registrada', async () => {
  const env = home({ alertasModelo: false });
  guardarEstado(conActiva(), env);
  const ruta = join(env.ORQUESTADOR_HOME, 't.jsonl');
  writeFileSync(ruta, transcript('claude-sonnet-5-5'));
  assert.equal(await manejarStop({ session_id: 's', agent_id: 'a1', agent_transcript_path: ruta }, env), null);
  assert.deepEqual(leerEventos({ session: 's' }, env).map((e) => e.tipo), ['fin', 'alerta']);
});

test('SubagentStop: el evento fin lleva la ruta del transcript', async () => {
  const env = home();
  guardarEstado(conActiva(), env);
  const ruta = join(env.ORQUESTADOR_HOME, 'agent-a1.jsonl');
  writeFileSync(ruta, transcript('claude-haiku-5-5'));
  await manejarStop({ session_id: 's', agent_id: 'a1', agent_transcript_path: ruta }, env);
  assert.equal(leerEventos({ session: 's' }, env).find((e) => e.tipo === 'fin').transcript, ruta);
});

test('SubagentStart: una delegación externa emite delegacion y agente-inicio con id agente-<agentId>', async () => {
  const env = home();
  await manejarInicioAgente({ session_id: 's9', agent_id: 'x7', agent_type: 'Explore', transcript_path: join(env.ORQUESTADOR_HOME, 's9.jsonl') }, env);
  const evs = leerEventos({ session: 's9' }, env);
  assert.deepEqual(evs.map((e) => e.tipo), ['delegacion', 'agente-inicio']);
  assert.equal(evs[0].origenModelo, 'externo');
  assert.deepEqual([evs[1].id, evs[1].agentId], ['agente-x7', 'x7']);
  assert.equal(evs[1].transcript, join(env.ORQUESTADOR_HOME, 's9', 'subagents', 'agent-x7.jsonl'));
});

test('SessionStart: la rúbrica de fábrica no agrega nada; una personalizada agrega la tabla que manda', () => {
  assert.equal(textoRubrica(RUBRICA_FABRICA), null);
  const sin = manejarInicio({ session_id: 's' }, home(), '/raiz').hookSpecificOutput.additionalContext;
  assert.doesNotMatch(sin, /Rúbrica personalizada/);
  const propia = RUBRICA_FABRICA.map((f, i) => (i === 0 ? { ...f, modelo: 'sonnet', esfuerzo: 'medium' } : { ...f }));
  const con = manejarInicio({ session_id: 's' }, home({ rubrica: propia }), '/raiz').hookSpecificOutput.additionalContext;
  assert.ok(con.includes(RUBRICA_PERSONALIZADA));
  assert.match(con, /\| Mecánica \| `sonnet` \/ `medium` \|/);
  assert.match(con, /\| Máxima consecuencia \| `fable` \/ `high` \|/);
});

test('SessionStart: una rúbrica inválida o un config.json roto no rompen el hook', () => {
  const invalida = manejarInicio({ session_id: 's' }, home({ rubrica: [{ clase: 'Mecánica', modelo: 'gpt', esfuerzo: 'low' }] }), '/raiz');
  assert.doesNotMatch(invalida.hookSpecificOutput.additionalContext, /Rúbrica personalizada/);
  const roto = manejarInicio({ session_id: 's' }, home('{roto'), '/raiz');
  assert.match(roto.hookSpecificOutput.additionalContext, /orquestador:orquestar/);
});

test('la skill orquestar dice que la rúbrica personalizada manda', () => {
  const skill = readFileSync(fileURLToPath(new URL('../plugins/orquestador/skills/orquestar/SKILL.md', import.meta.url)), 'utf8');
  assert.match(skill, /Rúbrica personalizada del usuario/);
  assert.match(skill, /manda sobre esta tabla/);
});
