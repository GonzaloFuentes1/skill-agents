import { test } from 'node:test';
import assert from 'node:assert/strict';
import { familiaModelo, capitalizar, nombreAgente, claseEstado, textoEstado } from '../plugins/orquestador/dashboard/public/dom.js';
import { chatVacio, desdeHistorial, reducirChat } from '../plugins/orquestador/dashboard/public/chat-vista.js';
import { validarPlan, segmentar, etapaDeMeta, estadoEtapas } from '../plugins/orquestador/dashboard/public/plan-vista.js';
import { vistaVacia, reducir } from '../plugins/orquestador/dashboard/public/estado-vista.js';
import { verificacion } from '../plugins/orquestador/dashboard/public/agentes-panel.js';
import { resumenEntrada } from '../plugins/orquestador/dashboard/public/chat.js';

const PLAN = {
  titulo: 'Rediseño', riesgos: [{ titulo: 'Permisos', planB: 'MCP propio' }],
  etapas: [
    { id: 'E1', titulo: 'Entender', meta: 'Mapear', agentes: [{ tipo: 'Explore', modelo: 'haiku', esfuerzo: 'low' }], barrera: { tipo: 'auto', criterio: 'Spike ok' } },
    { id: 'E2', titulo: 'Construir', meta: 'Tres frentes', agentes: [{ tipo: 'orquestador:implementador', modelo: 'Sonnet' }] },
  ],
};

test('dom: familias, mayúsculas, nombres y estados', () => {
  assert.equal(familiaModelo('claude-sonnet-5-5'), 'sonnet');
  assert.equal(familiaModelo('inherit'), 'heredado');
  assert.equal(familiaModelo(undefined), 'desconocido');
  assert.equal(capitalizar('opus'), 'Opus');
  assert.equal(nombreAgente('orquestador:guardian-git'), 'Guardian Git');
  assert.equal(nombreAgente('Explore'), 'Explore');
  assert.deepEqual([claseEstado(null), claseEstado({ estado: 'activo' }), claseEstado({ estado: 'fallido' }), claseEstado({ estado: 'terminado' })], ['cola', 'trabajando', 'error', 'listo']);
  assert.equal(textoEstado({ estado: 'activo' }), 'Trabajando');
});

test('chat: usuario, parciales, mensaje que reemplaza el parcial y fusión por id sin duplicar', () => {
  const c = chatVacio();
  reducirChat(c, { tipo: 'chat:usuario', id: 'u1', texto: 'hola' });
  reducirChat(c, { tipo: 'chat:texto-parcial', delta: 'Ho' });
  reducirChat(c, { tipo: 'chat:texto-parcial', delta: 'la' });
  assert.equal(c.parcial, 'Hola');
  reducirChat(c, { tipo: 'chat:mensaje', mensajeId: 'm1', rol: 'asistente', bloques: [{ tipo: 'texto', texto: 'Hola' }] });
  reducirChat(c, { tipo: 'chat:mensaje', mensajeId: 'm1', rol: 'asistente', bloques: [{ tipo: 'texto', texto: 'Hola' }, { tipo: 'herramienta', usoId: 't1', nombre: 'Bash', entrada: { command: 'ls' } }] });
  assert.equal(c.parcial, '');
  assert.equal(c.mensajes.length, 2);
  assert.equal(c.mensajes[1].bloques.length, 2);
  reducirChat(c, { tipo: 'chat:mensaje', rol: 'herramienta', bloques: [{ tipo: 'resultado', usoId: 't1', ok: false, texto: 'ENOENT' }] });
  assert.deepEqual(c.mensajes[1].bloques[1].resultado, { ok: false, texto: 'ENOENT' });
});

test('chat: permisos aparecen una vez, se resuelven con registro y el estado final los limpia', () => {
  const c = chatVacio();
  const p = { tipo: 'chat:permiso', solicitudId: 'r1', herramienta: 'Bash', entrada: { command: 'ls' } };
  reducirChat(c, p);
  reducirChat(c, p);
  assert.equal(c.permisos.length, 1);
  reducirChat(c, { tipo: 'chat:permiso-resuelto', solicitudId: 'r1', decision: 'denegar', herramienta: 'Bash', entrada: { command: 'ls' } });
  assert.equal(c.permisos.length, 0);
  assert.equal(c.mensajes.at(-1).bloques[0].decision, 'denegar');
  reducirChat(c, p);
  reducirChat(c, { tipo: 'chat:estado', conv: { estado: 'error', error: 'murió' } });
  assert.deepEqual([c.permisos.length, c.estado, c.error], [0, 'error', 'murió']);
});

test('chat: fin con error agrega un mensaje de error; interrumpido no', () => {
  const c = chatVacio();
  reducirChat(c, { tipo: 'chat:fin-turno', ok: false, error: 'Límite de uso alcanzado' });
  reducirChat(c, { tipo: 'chat:fin-turno', ok: false, interrumpido: true, error: null });
  assert.deepEqual(c.mensajes.map((m) => m.rol), ['error', 'decision']);
  const h = desdeHistorial({ conversacion: { estado: 'lista' }, mensajes: [{ rol: 'usuario', id: 'u', bloques: [{ tipo: 'texto', texto: 'x' }] }], permisos: [] });
  assert.equal(h.mensajes.length, 1);
});

test('plan: valida, segmenta, rechaza inválidos sin romper y calcula estados por prefijo E#', () => {
  assert.equal(validarPlan(PLAN).ok, true);
  assert.equal(validarPlan({ ...PLAN, etapas: [{ ...PLAN.etapas[0], id: 'X1' }] }).ok, false);
  assert.equal(validarPlan({ ...PLAN, etapas: [{ ...PLAN.etapas[0], agentes: [{ tipo: 'a', modelo: 'gpt' }] }] }).ok, false);
  const s = segmentar(`Propongo:\n\`\`\`orquestador-plan\n${JSON.stringify(PLAN)}\n\`\`\`\n¿Apruebas?`);
  assert.deepEqual(s.map((x) => x.tipo), ['texto', 'plan', 'texto']);
  const malo = segmentar('```orquestador-plan\n{no json}\n```');
  assert.equal(malo[0].tipo, 'texto');
  assert.match(malo[0].aviso, /JSON inválido/);
  assert.equal(etapaDeMeta('E2 · Verificadores'), 'E2');
  assert.equal(etapaDeMeta('Verificadores'), null);
  const estados = estadoEtapas(PLAN, [{ meta: 'E1 · Mapear', estado: 'terminado' }, { meta: 'E2 · Frente 1', estado: 'activo' }]);
  assert.deepEqual(estados, { E1: 'lista', E2: 'trabajando' });
  assert.deepEqual(estadoEtapas(PLAN, []), { E1: 'en-cola', E2: 'en-cola' });
});

test('estado-vista: agente-inicio y fin guardan agentId en el nodo', () => {
  const v = vistaVacia();
  reducir(v, { session: 's', tipo: 'delegacion', id: 't1', agente: 'Explore', modelo: 'haiku', ts: '2026-10-12T10:00:00Z' });
  reducir(v, { session: 's', tipo: 'agente-inicio', id: 't1', agentId: 'a1', transcript: '/x/agent-a1.jsonl' });
  assert.equal(v.sesiones.s.nodos.t1.agentId, 'a1');
  reducir(v, { session: 's', tipo: 'delegacion', id: 't2', agente: 'Plan', modelo: 'opus', ts: '2026-10-12T10:00:01Z' });
  reducir(v, { session: 's', tipo: 'fin', id: 't2', agentId: 'a2', ts: '2026-10-12T10:00:02Z' });
  assert.equal(v.sesiones.s.nodos.t2.agentId, 'a2');
});

test('verificacion: coincide, no coincide, sin resultado, heredado', () => {
  assert.deepEqual(verificacion({ modelo: 'sonnet', resultado: { modeloReal: 'claude-sonnet-5-5' } }), { texto: '✓ Sonnet', clase: 'e-listo' });
  assert.deepEqual(verificacion({ modelo: 'opus', resultado: { modeloReal: 'claude-sonnet-5-5' } }), { texto: '⚠ Sonnet', clase: 'e-error' });
  assert.deepEqual(verificacion({ modelo: 'opus', estado: 'activo' }), { texto: 'Corriendo', clase: 'tenue' });
  assert.equal(verificacion({ modelo: 'heredado', resultado: { modeloReal: 'claude-opus-5-5' } }).clase, 'e-listo');
});

test('resumenEntrada: campo clave por herramienta y JSON recortado para las demás', () => {
  assert.equal(resumenEntrada('Bash', { command: 'npm test' }), 'npm test');
  assert.equal(resumenEntrada('Read', { file_path: 'a.js' }), 'a.js');
  assert.equal(resumenEntrada('X', { a: 1 }), '{"a":1}');
  assert.equal(resumenEntrada('X', { a: 'y'.repeat(500) }).length, 200);
});
