import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notificacionesDe } from '../plugins/orquestador/dashboard/bloques.mjs';
import { mensajesDesdeTranscript } from '../plugins/orquestador/dashboard/historial.mjs';
import { crearNormalizador } from '../plugins/orquestador/dashboard/proceso-claude.mjs';
import { chatVacio, reducirChat } from '../plugins/orquestador/dashboard/public/chat-vista.js';
import { modeloNotificacion } from '../plugins/orquestador/dashboard/public/chat.js';

const aviso = (o = {}) => [
  '<task-notification>',
  `<task-id>${o.id ?? 'add32466a604a255c'}</task-id>`,
  `<tool-use-id>${o.uso ?? 'toolu_0153'}</tool-use-id>`,
  '<output-file>C:\\Temp\\tasks\\add32466a604a255c.output</output-file>',
  `<status>${o.estado ?? 'completed'}</status>`,
  `<summary>${o.resumen ?? 'Agent "E1 · Verificar convocatorias que cierran pronto" finished'}</summary>`,
  '<note>A task-notification fires each time this agent stops with no live background children of its own.</note>',
  '<result>This agent\'s report was delivered to you as a message from "add32466a604a255c".</result>',
  '<usage><subagent_tokens>160967</subagent_tokens><tool_uses>105</tool_uses><duration_ms>763333</duration_ms></usage>',
  '</task-notification>',
].join('\n');

test('notificacionesDe: extrae tarea, agente, estado, título y uso', () => {
  assert.deepEqual(notificacionesDe(aviso()), [{
    tipo: 'notificacion', tarea: 'add32466a604a255c', usoId: 'toolu_0153', estado: 'completed',
    titulo: 'E1 · Verificar convocatorias que cierran pronto', tokens: 160967, herramientas: 105, duracionMs: 763333,
  }]);
});

test('notificacionesDe: varias en un mismo texto, campos ausentes y texto normal', () => {
  const dos = notificacionesDe(`${aviso({ id: 'a1' })}\n${aviso({ id: 'a2', estado: 'failed', resumen: 'algo raro' })}`);
  assert.equal(dos.length, 2);
  assert.equal(dos[1].estado, 'failed');
  assert.equal(dos[1].titulo, 'algo raro');
  const minima = notificacionesDe('<task-notification><status>completed</status></task-notification>')[0];
  assert.equal(minima.titulo, null);
  assert.equal(minima.tokens, null);
  assert.deepEqual(notificacionesDe('hola, revisa <task-notification> esto'), []);
  assert.deepEqual(notificacionesDe('hola'), []);
});

test('historial: la notificación de tarea no es un mensaje del usuario', () => {
  const lineas = [
    { type: 'user', uuid: 'u1', message: { role: 'user', content: 'Investiga fondos' } },
    { type: 'user', uuid: 'u2', message: { role: 'user', content: aviso() } },
    { type: 'user', uuid: 'u3', message: { role: 'user', content: [{ type: 'text', text: aviso({ id: 'b' }) }] } },
  ].map((x) => JSON.stringify(x)).join('\n');
  const m = mensajesDesdeTranscript(lineas);
  assert.deepEqual(m.map((x) => x.rol), ['usuario', 'notificacion', 'notificacion']);
  assert.equal(m[1].bloques[0].titulo, 'E1 · Verificar convocatorias que cierran pronto');
  assert.equal(m[2].bloques[0].tarea, 'b');
});

test('normalizador: la notificación de tarea en vivo llega como mensaje de notificación', () => {
  const n = crearNormalizador();
  const ev = n({ type: 'user', uuid: 'u9', message: { role: 'user', content: aviso() } });
  assert.equal(ev.length, 1);
  assert.equal(ev[0].tipo, 'mensaje');
  assert.equal(ev[0].rol, 'notificacion');
  assert.equal(ev[0].mensajeId, 'u9');
  assert.equal(ev[0].bloques[0].usoId, 'toolu_0153');
  assert.deepEqual(n({ type: 'user', message: { role: 'user', content: 'texto normal' } }), []);
});

test('reducirChat: la notificación se agrega una sola vez y no cuenta como respuesta del asistente', () => {
  const chat = chatVacio();
  const e = { tipo: 'chat:mensaje', rol: 'notificacion', mensajeId: 'u9', bloques: notificacionesDe(aviso()) };
  reducirChat(chat, e);
  reducirChat(chat, e);
  assert.equal(chat.mensajes.length, 1);
  assert.equal(chat.mensajes[0].rol, 'notificacion');
});

test('modeloNotificacion: texto legible en español', () => {
  const m = modeloNotificacion(notificacionesDe(aviso())[0]);
  assert.equal(m.titulo, 'E1 · Verificar convocatorias que cierran pronto');
  assert.equal(m.estado, 'Terminó');
  assert.equal(m.clase, 'e-listo');
  assert.equal(m.detalle, '105 herramientas · 12 min 43 s · 161 mil tokens');
  const fallo = modeloNotificacion({ estado: 'failed', titulo: null, herramientas: 1, duracionMs: 4000, tokens: 900 });
  assert.equal(fallo.estado, 'Falló');
  assert.equal(fallo.clase, 'e-error');
  assert.equal(fallo.titulo, 'Agente en segundo plano');
  assert.equal(fallo.detalle, '1 herramienta · 4 s · 900 tokens');
  assert.equal(modeloNotificacion({ estado: 'killed' }).estado, 'Se detuvo');
  assert.equal(modeloNotificacion({ estado: 'raro' }).estado, 'raro');
});
