import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLASES_RUBRICA as CLASES_FRONT, CLAVES_CONFIG, formularioDesde, reducirFormulario, hayCambios, parcialAGuardar, autoModoDesde, costoVisible, fijar, obtener,
} from '../plugins/orquestador/dashboard/public/config-vista.js';
import { CLASES_RUBRICA, CLAVES_EDITABLES, CONFIG_DEFECTO, normalizarRubrica } from '../plugins/orquestador/scripts/lib/config.mjs';
import {
  filtrarAgentes, estadoPack, slugAgente as slugFront, formularioVacio, desdeDetalle, alternarHerramienta, herramientaMarcada, cuerpoFormulario, rutaArchivo,
} from '../plugins/orquestador/dashboard/public/agentes-vista.js';
import { slugAgente } from '../plugins/orquestador/dashboard/agentes.mjs';
import { chatVacio, desdeHistorial, reducirChat } from '../plugins/orquestador/dashboard/public/chat-vista.js';
import { modeloDenegacion, resumenEntrada } from '../plugins/orquestador/dashboard/public/chat.js';
import { barreraHumana } from '../plugins/orquestador/dashboard/public/plan-vista.js';
import { vistaVacia, reducir, etiquetaEvento, numeracion, pedidoVsReal, claseNodo } from '../plugins/orquestador/dashboard/public/estado-vista.js';
import { verificacion } from '../plugins/orquestador/dashboard/public/agentes-panel.js';

const configBase = () => ({ ...structuredClone({ ...CONFIG_DEFECTO, rubrica: normalizarRubrica(null) }), miClave: 1 });
const ORDEN = ['haiku', 'sonnet', 'opus', 'fable'];

test('config-vista: clases y claves iguales a las del backend', () => {
  assert.deepEqual(CLASES_FRONT, [...CLASES_RUBRICA]);
  assert.deepEqual([...CLAVES_CONFIG].sort(), [...CLAVES_EDITABLES].sort());
});

test('formulario: fijar, sumar con límites, alternar sin vaciar, agregar, quitar y descartar', () => {
  let f = formularioDesde(configBase(), CLAVES_CONFIG);
  assert.equal('miClave' in f.actual, false);
  assert.equal(hayCambios(f), false);
  f = reducirFormulario(f, { tipo: 'sumar', ruta: ['paraleloMax'], delta: 10 });
  assert.equal(f.actual.paraleloMax, 8);
  f = reducirFormulario(f, { tipo: 'sumar', ruta: ['fableMaxPorSesion'], delta: -5 });
  assert.equal(f.actual.fableMaxPorSesion, 0);
  f = reducirFormulario(f, { tipo: 'alternar', ruta: ['modelosOrquestador'], valor: 'opus', minimo: 1, orden: ORDEN });
  assert.deepEqual(f.actual.modelosOrquestador, ['fable']);
  assert.deepEqual(reducirFormulario(f, { tipo: 'alternar', ruta: ['modelosOrquestador'], valor: 'fable', minimo: 1 }).actual.modelosOrquestador, ['fable']);
  f = reducirFormulario(f, { tipo: 'alternar', ruta: ['modelosOrquestador'], valor: 'haiku', minimo: 1, orden: ORDEN });
  assert.deepEqual(f.actual.modelosOrquestador, ['haiku', 'fable']);
  f = reducirFormulario(f, { tipo: 'fijar', ruta: ['rubrica', 2, 'modelo'], valor: 'opus' });
  assert.deepEqual([f.actual.rubrica[2].modelo, f.original.rubrica[2].modelo], ['opus', 'sonnet']);
  f = reducirFormulario(f, { tipo: 'agregar', ruta: ['ramasProtegidas'], valor: '  develop ' });
  f = reducirFormulario(f, { tipo: 'agregar', ruta: ['ramasProtegidas'], valor: 'develop' });
  assert.deepEqual(f.actual.ramasProtegidas, ['main', 'master', 'develop']);
  f = reducirFormulario(f, { tipo: 'quitar', ruta: ['ramasProtegidas'], valor: 'master' });
  assert.deepEqual(f.actual.ramasProtegidas, ['main', 'develop']);
  assert.equal(hayCambios(f), true);
  assert.equal(hayCambios(reducirFormulario(f, { tipo: 'descartar' })), false);
});

test('parcialAGuardar: solo las claves modificadas, así dos pestañas no se pisan', () => {
  let a = formularioDesde(configBase(), CLAVES_CONFIG);
  let b = formularioDesde(configBase(), CLAVES_CONFIG);
  a = reducirFormulario(a, { tipo: 'fijar', ruta: ['mostrarCosto'], valor: false });
  b = reducirFormulario(b, { tipo: 'fijar', ruta: ['rubrica', 0, 'esfuerzo'], valor: 'medium' });
  assert.deepEqual(parcialAGuardar(a), { mostrarCosto: false });
  assert.deepEqual(Object.keys(parcialAGuardar(b)), ['rubrica']);
  assert.equal(parcialAGuardar(b).rubrica.length, 6);
});

test('formulario: los errores del servidor se limpian al editar el campo; "guardado" fija el nuevo original', () => {
  let f = formularioDesde(configBase(), CLAVES_CONFIG);
  f = reducirFormulario(f, { tipo: 'errores', errores: { paraleloMax: 'Debe ser…', rubrica: 'x' } });
  f = reducirFormulario(f, { tipo: 'fijar', ruta: ['paraleloMax'], valor: 3 });
  assert.deepEqual(Object.keys(f.errores), ['rubrica']);
  f = reducirFormulario(f, { tipo: 'guardado', datos: { ...configBase(), paraleloMax: 3, alBloquear: 'denegar' } });
  assert.equal(hayCambios(f), false);
  assert.equal(f.actual.alBloquear, 'denegar');
  assert.deepEqual(f.errores, {});
});

test('autoModoDesde, costoVisible, fijar y obtener', () => {
  assert.deepEqual(autoModoDesde({ personalizadas: { permitir: ['a'], detener: [], entorno: { repos: ['r'], dominios: [], organizacion: 'O' }, otrasEntorno: ['x'] }, classifyAllShell: true, defaultModeTerminal: false }),
    { permitir: ['a'], detener: [], entorno: { repos: ['r'], dominios: [], organizacion: 'O' }, classifyAllShell: true, defaultModeTerminal: false });
  assert.deepEqual(autoModoDesde(null).entorno, { repos: [], dominios: [], organizacion: '' });
  assert.deepEqual([costoVisible(true, null), costoVisible(false, null), costoVisible(false, 'mostrar'), costoVisible(true, 'ocultar'), costoVisible(undefined, null)],
    [true, false, true, false, true]);
  assert.deepEqual(fijar({ a: [{ b: 1 }] }, ['a', 0, 'b'], 2), { a: [{ b: 2 }] });
  assert.equal(obtener({ a: { b: 3 } }, ['a', 'b']), 3);
});

const datosAgentes = {
  packs: [{ id: 'datos', nombre: 'Datos', descripcion: '', activos: 1, total: 2, agentes: [
    { id: 'analista-sql', nombre: 'Analista SQL', description: 'Consultas de solo lectura' },
    { id: 'estadistico', nombre: 'Estadístico', description: 'Pruebas formales' },
  ] }],
  plugin: [{ id: 'guardian-git', nombre: 'Guardian Git', description: 'Git' }], integrados: [], personalizados: [],
};

test('agentes-vista: filtro sin tildes ni mayúsculas, packs vacíos fuera y contadores intactos', () => {
  const r = filtrarAgentes(datosAgentes, 'ESTADISTICO');
  assert.deepEqual(r.packs.map((p) => [p.id, p.agentes.map((a) => a.id), p.activos, p.total]), [['datos', ['estadistico'], 1, 2]]);
  assert.deepEqual(filtrarAgentes(datosAgentes, 'nada').packs, []);
  assert.equal(filtrarAgentes(datosAgentes, '').packs[0].agentes.length, 2);
  assert.deepEqual(filtrarAgentes(datosAgentes, 'git').plugin.map((a) => a.id), ['guardian-git']);
  assert.deepEqual([estadoPack({ activos: 0, total: 3 }), estadoPack({ activos: 2, total: 3 }), estadoPack({ activos: 3, total: 3 })], ['false', 'mixed', 'true']);
});

test('agentes-vista: slug igual al del servidor, herramientas agrupadas y cuerpo del formulario', () => {
  for (const n of ['Investigador RL', '  Diseñador Ñandú / UX ', 'x'.repeat(60)]) assert.equal(slugFront(n), slugAgente(n));
  let f = formularioVacio();
  assert.equal(herramientaMarcada(f, 'Grep y Glob'), true);
  f = alternarHerramienta(f, 'Grep y Glob');
  assert.deepEqual(f.herramientas, ['Read']);
  f = alternarHerramienta(f, 'Web');
  assert.deepEqual(f.herramientas, ['Read', 'WebSearch', 'WebFetch']);
  f = { ...f, nombre: ' Investigador RL ', alcance: 'proyecto' };
  assert.equal(rutaArchivo(f), '.claude/agents/investigador-rl.md');
  const c = cuerpoFormulario(f, 'conv-1');
  assert.deepEqual([c.nombre, c.alcance, c.conversacion], ['Investigador RL', 'proyecto', 'conv-1']);
  assert.equal('conversacion' in cuerpoFormulario({ ...f, alcance: 'usuario' }, 'conv-1'), false);
});

test('agentes-vista: duplicar y editar desde el detalle', () => {
  const det = { id: 'analista-sql', origen: 'catalogo', nombre: 'Analista SQL', description: 'Escribe consultas.', model: 'sonnet', effort: 'medium', tools: 'Read, Bash',
    secciones: { rol: 'R', metodo: '1. M', entregable: 'E', restricciones: '- X', retorno: 'F' } };
  const d = desdeDetalle(det, { duplicar: true });
  assert.deepEqual([d.nombre, d.editando, d.herramientas, d.secciones.rol], ['Analista SQL (copia)', null, ['Read', 'Bash'], 'R']);
  const e = desdeDetalle({ ...det, origen: 'usuario', alcance: 'usuario' });
  assert.deepEqual([e.nombre, e.editando, e.alcance], ['Analista SQL', 'analista-sql', 'usuario']);
  assert.deepEqual(desdeDetalle({ ...det, tools: 'Todas las herramientas', model: 'raro' }).herramientas, formularioVacio().herramientas);
  assert.equal(desdeDetalle({ ...det, model: 'raro' }).modelo, 'sonnet');
});

test('chat: chat:denegado agrega una tarjeta una sola vez y el historial trae las denegaciones', () => {
  const c = chatVacio();
  const e = { tipo: 'chat:denegado', id: 'd1', herramienta: 'Bash', entrada: { command: 'git push --force' }, motivo: 'Git destructivo' };
  reducirChat(c, e);
  reducirChat(c, e);
  assert.deepEqual(c.mensajes.map((m) => m.rol), ['denegado']);
  assert.equal(c.mensajes[0].bloques[0].motivo, 'Git destructivo');
  const h = desdeHistorial({ conversacion: { estado: 'lista' }, mensajes: [], denegados: [{ id: 'd1', herramienta: 'Bash', entrada: {}, motivo: null }] });
  assert.deepEqual(h.mensajes.map((m) => [m.rol, m.id]), [['denegado', 'd1']]);
});

test('modeloDenegacion: con "preguntar" ofrece reintentar con el mensaje exacto; con "denegar" solo informa', () => {
  const b = { herramienta: 'Bash', entrada: { command: 'git push --force' }, motivo: 'Git destructivo' };
  const m = modeloDenegacion(b, 'preguntar');
  assert.deepEqual([m.titulo, m.motivo, m.resumen], ['El modo automático detuvo Bash', 'Git destructivo', 'git push --force']);
  assert.deepEqual(m.accion, { texto: 'Autorizar y reintentar', mensaje: 'Autorizo explícitamente esta acción: Bash git push --force. Hazla.' });
  assert.equal(modeloDenegacion(b, 'denegar').accion, null);
  assert.equal(modeloDenegacion({ herramienta: 'Bash', entrada: null }, 'preguntar').motivo, 'El clasificador la consideró riesgosa.');
  assert.equal(resumenEntrada('Bash', null), '{}');
  assert.equal(resumenEntrada('Read', undefined), '{}');
});

const PLAN_B = { titulo: 'P', etapas: [
  { id: 'E1', titulo: 'Construir', meta: 'm', agentes: [{ tipo: 'implementador', modelo: 'sonnet' }], barrera: { tipo: 'humana', criterio: 'Revisa el diff antes de publicar' } },
  { id: 'E2', titulo: 'Publicar', meta: 'm', agentes: [{ tipo: 'guardian-git', modelo: 'haiku' }] },
] };
const msg = (rol, texto, id) => ({ rol, id, bloques: [{ tipo: 'texto', texto }] });
const chatCon = (...mensajes) => ({ ...chatVacio(), estado: 'lista', mensajes });
const conPlan = `Propongo:\n\`\`\`orquestador-plan\n${JSON.stringify(PLAN_B)}\n\`\`\``;

test('barreraHumana: tras aprobar el plan, con la etapa de barrera hecha o en curso, la siguiente en cola y el turno terminado en "?"', () => {
  const hecha = [{ meta: 'E1 · Construir', estado: 'terminado' }];
  const chat = chatCon(msg('asistente', conPlan, 'a1'), msg('usuario', 'Apruebo el plan.', 'u1'), msg('asistente', 'Terminé E1. ¿Sigo con la publicación?', 'a2'));
  assert.deepEqual(barreraHumana(chat, hecha), { etapa: 'E1', titulo: 'Construir', criterio: 'Revisa el diff antes de publicar' });
  assert.equal(barreraHumana(chat, [{ meta: 'E1 · Construir', estado: 'activo' }])?.etapa, 'E1');
  assert.equal(barreraHumana({ ...chat, estado: 'trabajando' }, hecha), null);
  assert.equal(barreraHumana(chatCon(msg('asistente', conPlan, 'a1'), msg('asistente', '¿Sigo?', 'a2')), hecha), null);
  assert.equal(barreraHumana(chatCon(...chat.mensajes.slice(0, 2), msg('asistente', 'Terminé E1.', 'a2')), hecha), null);
  assert.equal(barreraHumana(chat, [...hecha, { meta: 'E2 · Publicar', estado: 'activo' }]), null);
  assert.equal(barreraHumana(chat, []), null);
});

test('estado-vista: claseNodo, etiquetas de eventos, numeración de repetidos y pedido vs. real', () => {
  const v = vistaVacia();
  const ts = (s) => `2026-10-13T10:00:0${s}Z`;
  reducir(v, { session: 's', tipo: 'delegacion', id: 'a', agente: 'orquestador:implementador', modelo: 'sonnet', esfuerzo: 'medium', ts: ts(1) });
  reducir(v, { session: 's', tipo: 'delegacion', id: 'b', agente: 'orquestador:implementador', modelo: 'sonnet', esfuerzo: 'medium', ts: ts(2) });
  reducir(v, { session: 's', tipo: 'delegacion', id: 'c', agente: 'Explore', modelo: 'haiku', ts: ts(3) });
  reducir(v, { session: 's', tipo: 'fin', id: 'a', modeloReal: 'claude-sonnet-5-5', ts: ts(4) });
  reducir(v, { session: 's', tipo: 'fin', id: 'b', modeloReal: 'claude-opus-5-5', ts: ts(5) });
  reducir(v, { session: 's', tipo: 'fin', id: 'c', modeloReal: 'modelo-raro', ok: false, ts: ts(6) });
  const s = v.sesiones.s;
  assert.deepEqual(numeracion(s), { a: '#1', b: '#2', c: '' });
  assert.deepEqual(['a', 'c'].map((id) => claseNodo(s.nodos[id])), ['listo', 'error']);
  assert.deepEqual([claseNodo({ estado: 'activo' }), claseNodo({ estado: 'sin-cierre' })], ['trabajando', 'cola']);
  assert.deepEqual(pedidoVsReal(s), [
    { agente: 'implementador', cantidad: 1, pedido: 'sonnet', real: 'sonnet', ok: true },
    { agente: 'implementador', cantidad: 1, pedido: 'sonnet', real: 'opus', ok: false },
    { agente: 'Explore', cantidad: 1, pedido: 'haiku', real: 'modelo-raro', ok: false },
  ]);
  assert.deepEqual(s.timeline.map((t) => etiquetaEvento(t).texto), ['Falló', 'Fin', 'Fin', 'Delegación', 'Delegación', 'Delegación']);
  assert.deepEqual(etiquetaEvento({ tipo: 'bloqueo' }), { texto: 'Bloqueo', clase: 'e-error' });
});

test('verificacion: un modelo real de familia desconocida se muestra tal cual', () => {
  assert.deepEqual(verificacion({ modelo: 'opus', resultado: { modeloReal: 'modelo-raro-1' } }), { texto: '⚠ modelo-raro-1', clase: 'e-error' });
});
