import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cargarConfig } from '../plugins/orquestador/scripts/lib/config.mjs';
import { rutaConfig, rutaConversaciones, rutaToken } from '../plugins/orquestador/scripts/lib/rutas.mjs';
import { asignarAgente, rutaTranscriptSubagente, manejar as manejarInicioAgente } from '../plugins/orquestador/scripts/subagent-start.mjs';
import { manejarInicio } from '../plugins/orquestador/scripts/session-start.mjs';
import { estadoVacio, guardarEstado } from '../plugins/orquestador/scripts/lib/estado.mjs';
import { leerEventos } from '../plugins/orquestador/scripts/lib/eventos.mjs';

const home = () => ({ ORQUESTADOR_HOME: mkdtempSync(join(tmpdir(), 'orq-v2-')) });

test('config: valores nuevos por defecto y remoto se fusiona por clave', () => {
  const env = home();
  const c = cargarConfig(env);
  assert.equal(c.conversacionesMax, 2);
  assert.equal(c.rutaClaude, null);
  assert.deepEqual(c.remoto, { activo: false, escuchar: '127.0.0.1', hostsPermitidos: [] });
  writeFileSync(rutaConfig(env), JSON.stringify({ remoto: { activo: true } }));
  assert.deepEqual(cargarConfig(env).remoto, { activo: true, escuchar: '127.0.0.1', hostsPermitidos: [] });
});

test('rutas nuevas viven en el directorio del orquestador', () => {
  const env = home();
  assert.equal(rutaConversaciones(env), join(env.ORQUESTADOR_HOME, 'conversaciones.json'));
  assert.equal(rutaToken(env), join(env.ORQUESTADOR_HOME, 'token'));
});

test('rutaTranscriptSubagente arma la ruta del patrón observado', () => {
  const r = rutaTranscriptSubagente({ transcript_path: join('/p', 'proj', 's1.jsonl'), session_id: 's1', agent_id: 'a9' });
  assert.equal(r, join('/p', 'proj', 's1', 'subagents', 'agent-a9.jsonl'));
  assert.equal(rutaTranscriptSubagente({ session_id: 's1' }), null);
});

test('asignarAgente devuelve el id de la delegación vinculada', () => {
  const e = estadoVacio('s');
  e.activas.tu1 = { agente: 'Explore', inicio: 1, agentId: null };
  assert.deepEqual(asignarAgente({ agent_id: 'a1', agent_type: 'Explore' }, e), { evento: null, id: 'tu1' });
  const r = asignarAgente({ agent_id: 'a2', agent_type: 'Plan' }, e, 5);
  assert.equal(r.id, 'agente-a2');
  assert.equal(r.evento.id, 'agente-a2');
});

test('SubagentStart emite agente-inicio con id, agentId y transcript', async () => {
  const env = home();
  const e = estadoVacio('s1');
  e.activas.tu1 = { agente: 'Explore', inicio: 1, agentId: null };
  guardarEstado(e, env);
  await manejarInicioAgente({ session_id: 's1', agent_id: 'a1', agent_type: 'Explore', transcript_path: join(env.ORQUESTADOR_HOME, 's1.jsonl') }, env);
  const ev = leerEventos({ session: 's1' }, env).find((x) => x.tipo === 'agente-inicio');
  assert.equal(ev.id, 'tu1');
  assert.equal(ev.agentId, 'a1');
  assert.equal(ev.transcript, join(env.ORQUESTADOR_HOME, 's1', 'subagents', 'agent-a1.jsonl'));
});

test('SessionStart agrega las instrucciones de canal solo en el dashboard', () => {
  const env = home();
  const sin = manejarInicio({ session_id: 's' }, env, '/raiz');
  assert.doesNotMatch(sin.hookSpecificOutput.additionalContext, /orquestador-plan/);
  const con = manejarInicio({ session_id: 's' }, { ...env, ORQUESTADOR_CANAL: 'dashboard' }, '/raiz');
  assert.match(con.hookSpecificOutput.additionalContext, /```orquestador-plan/);
  assert.match(con.hookSpecificOutput.additionalContext, /E2 · /);
});
