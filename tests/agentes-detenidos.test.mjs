import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cerrarActivas, cerrarDeSesion } from '../plugins/orquestador/scripts/lib/cierres.mjs';
import { manejar as manejarTaskStop } from '../plugins/orquestador/scripts/task-stop.mjs';
import { cerrarAlRetomar } from '../plugins/orquestador/scripts/session-start.mjs';
import { decidirDelegacion } from '../plugins/orquestador/scripts/pre-agent.mjs';
import { estadoVacio, guardarEstado, leerEstado } from '../plugins/orquestador/scripts/lib/estado.mjs';
import { leerEventos } from '../plugins/orquestador/scripts/lib/eventos.mjs';
import { rutaSesion } from '../plugins/orquestador/scripts/lib/rutas.mjs';
import { vistaVacia, reducir, claseNodo } from '../plugins/orquestador/dashboard/public/estado-vista.js';
import { textoEstado } from '../plugins/orquestador/dashboard/public/dom.js';

const home = () => ({ ORQUESTADOR_HOME: mkdtempSync(join(tmpdir(), 'orq-det-')) });
const activa = (agentId, extra = {}) => ({ agente: 'investigador', meta: 'E1 · x', modelo: 'sonnet', esfuerzo: 'high', inicio: 1000, agentId, ...extra });

function sembrar(env, session, activas) {
  const e = estadoVacio(session);
  e.activas = activas;
  guardarEstado(e, env);
}

test('cerrarActivas: cierra solo las elegidas con un fin "detenido" y deja las demás', () => {
  const e = estadoVacio('s1');
  e.activas = { t1: activa('a1'), t2: activa('a2') };
  const eventos = cerrarActivas(e, (id, a) => a.agentId === 'a1', 'task-stop', 6000);
  assert.deepEqual(Object.keys(e.activas), ['t2']);
  assert.deepEqual(eventos, [{
    tipo: 'fin', session: 's1', id: 't1', agentId: 'a1', agente: 'investigador', modeloReal: null,
    tokensIn: 0, tokensOut: 0, costoUSD: 0, duracionMs: 5000, ok: false, detenido: true, motivo: 'task-stop',
  }]);
});

test('TaskStop: cierra la delegación por agentId (o por nombre) y libera el cupo', async () => {
  const env = home();
  sembrar(env, 's1', { t1: activa('a1'), t2: activa('a2'), t3: activa(null, { nombre: 'frente-c' }) });
  await manejarTaskStop({ session_id: 's1', tool_name: 'TaskStop', tool_input: { task_id: 'a1' } }, env);
  await manejarTaskStop({ session_id: 's1', tool_name: 'TaskStop', tool_input: { task_id: 'frente-c' } }, env);
  await manejarTaskStop({ session_id: 's1', tool_name: 'TaskStop', tool_input: { shell_id: 'bash-9' } }, env);
  assert.deepEqual(Object.keys(leerEstado('s1', env).activas), ['t2']);
  const fines = leerEventos({ session: 's1' }, env).filter((x) => x.tipo === 'fin');
  assert.deepEqual(fines.map((x) => [x.id, x.detenido, x.motivo]), [['t1', true, 'task-stop'], ['t3', true, 'task-stop']]);
});

test('TaskStop de una sesión sin estado no crea archivos', async () => {
  const env = home();
  await manejarTaskStop({ session_id: 'nueva', tool_input: { task_id: 'a1' } }, env);
  assert.equal(existsSync(rutaSesion('nueva', env)), false);
  assert.deepEqual(leerEventos({}, env), []);
});

test('al retomar una sesión se cierran las delegaciones del proceso anterior; startup, clear y compact no tocan nada', async () => {
  const env = home();
  sembrar(env, 's1', { t1: activa('a1') });
  for (const source of ['startup', 'clear', 'compact']) await cerrarAlRetomar({ session_id: 's1', source }, env);
  assert.equal(Object.keys(leerEstado('s1', env).activas).length, 1);
  await cerrarAlRetomar({ session_id: 's1', source: 'resume' }, env);
  assert.equal(Object.keys(leerEstado('s1', env).activas).length, 0);
  assert.equal(leerEventos({ session: 's1' }, env).at(-1).motivo, 'sesion-retomada');
});

test('cerrarDeSesion cierra todo lo de la sesión y devuelve cuántas cerró', async () => {
  const env = home();
  sembrar(env, 's1', { t1: activa('a1'), t2: activa('a2') });
  assert.equal(await cerrarDeSesion('s1', () => true, 'proceso-cerrado', env), 2);
  assert.equal(await cerrarDeSesion('s1', () => true, 'proceso-cerrado', env), 0);
  assert.equal(await cerrarDeSesion(null, () => true, 'proceso-cerrado', env), 0);
});

test('pre-agent guarda el nombre del agente para poder detenerlo por nombre', () => {
  const e = estadoVacio('s1');
  const config = { paraleloMax: 4, fableMaxPorSesion: 2 };
  decidirDelegacion({ session_id: 's1', tool_use_id: 't9', tool_input: { subagent_type: 'investigador', name: 'frente-a', description: 'E1 · a', model: 'sonnet', prompt: 'p' } }, e, config, null);
  assert.equal(e.activas.t9.nombre, 'frente-a');
});

test('vista: un agente detenido no cuenta como activo ni como fallido', () => {
  const v = vistaVacia();
  reducir(v, { session: 's1', tipo: 'delegacion', id: 't1', agente: 'investigador', meta: 'E1 · x', modelo: 'sonnet', esfuerzo: 'high', ts: '2026-10-13T10:00:00Z' });
  reducir(v, { session: 's1', tipo: 'fin', id: 't1', ok: false, detenido: true, motivo: 'task-stop' });
  const n = v.sesiones.s1.nodos.t1;
  assert.equal(n.estado, 'detenido');
  assert.equal(v.sesiones.s1.stats.activos, 0);
  assert.equal(claseNodo(n), 'cola');
  assert.equal(textoEstado(n), 'Detenido');
});
