import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  marcador, leerMarcador, listarAgentes, activarCatalogo, desactivarCatalogo, aplicarPack, estadoCatalogo, detalleAgente, seccionesDe,
} from '../plugins/orquestador/dashboard/agentes.mjs';
import { ErrorConversacion } from '../plugins/orquestador/dashboard/conversaciones.mjs';
import { rutaAgentesUsuario } from '../plugins/orquestador/scripts/lib/rutas.mjs';
import { buscarDefinicion } from '../plugins/orquestador/scripts/lib/agentes.mjs';
import { crearPluginFalso, cuerpoAgente } from './helpers/plugin-falso.mjs';

function preparar() {
  const raizPlugin = crearPluginFalso();
  const env = { CLAUDE_CONFIG_DIR: mkdtempSync(join(tmpdir(), 'orq agentes ñ-')) };
  const archivoUsuario = (id) => join(rutaAgentesUsuario(env), `${id}.md`);
  const escribirPropio = (id, texto) => { mkdirSync(rutaAgentesUsuario(env), { recursive: true }); writeFileSync(archivoUsuario(id), texto); };
  return { o: { env, raizPlugin }, env, archivoUsuario, escribirPropio };
}
const lanza = (fn, status, patron) => assert.throws(fn, (e) => e instanceof ErrorConversacion && e.status === status && (!patron || patron.test(e.message)));

test('marcador: formato exacto y lectura', () => {
  assert.equal(marcador('alfa', '0.3.0'), '<!-- orquestador:catalogo id=alfa version=0.3.0 -->');
  assert.deepEqual(leerMarcador(`x\n${marcador('alfa', '0.3.0')}\n`), { id: 'alfa', version: '0.3.0' });
  assert.equal(leerMarcador('sin marcador'), null);
});

test('listar: packs con los agentes que tienen archivo, plugin, integrados y estados inactivos', () => {
  const { o } = preparar();
  const l = listarAgentes(o);
  assert.equal(l.version, '9.9.9');
  assert.deepEqual(l.packs.map((p) => [p.id, p.total, p.activos]), [['uno', 2, 0], ['dos', 1, 0]]);
  assert.deepEqual(l.packs[0].agentes.map((a) => [a.id, a.nombre, a.model, a.estado]), [['alfa', 'Alfa', 'sonnet', 'inactivo'], ['beta', 'Beta', 'sonnet', 'inactivo']]);
  assert.deepEqual(l.plugin.map((a) => a.id), ['guardian-git']);
  assert.deepEqual(l.integrados.map((a) => a.id), ['general-purpose', 'Explore', 'Plan']);
  assert.deepEqual(l.personalizados, []);
});

test('activar copia el archivo con el marcador al final; desactivar lo borra solo si lo tiene', () => {
  const { o, archivoUsuario } = preparar();
  assert.deepEqual(activarCatalogo('alfa', o), { id: 'alfa', estado: 'activo' });
  const texto = readFileSync(archivoUsuario('alfa'), 'utf8');
  assert.ok(texto.endsWith(`${marcador('alfa', '9.9.9')}\n`));
  assert.match(texto, /^---\nname: alfa\n/);
  assert.equal(estadoCatalogo('alfa', o), 'activo');
  assert.equal(listarAgentes(o).packs[0].activos, 1);
  assert.deepEqual(desactivarCatalogo('alfa', o), { id: 'alfa', estado: 'inactivo' });
  assert.equal(existsSync(archivoUsuario('alfa')), false);
  assert.deepEqual(desactivarCatalogo('alfa', o), { id: 'alfa', estado: 'inactivo' });
  lanza(() => activarCatalogo('no-existe', o), 404);
  lanza(() => activarCatalogo('../x', o), 400);
});

test('colisión: un agente propio con el mismo id no se pisa ni se borra (409), y el pack sigue con los demás', () => {
  const { o, archivoUsuario, escribirPropio } = preparar();
  escribirPropio('beta', 'mío');
  lanza(() => activarCatalogo('beta', o), 409, /^Ya tienes un agente propio llamado beta$/);
  lanza(() => desactivarCatalogo('beta', o), 409);
  const r = aplicarPack('uno', true, o);
  assert.deepEqual(r.resultados.map((x) => [x.id, x.ok, x.estado]), [['alfa', true, 'activo'], ['beta', false, 'conflicto']]);
  assert.equal(r.resultados[1].error, 'Ya tienes un agente propio llamado beta');
  assert.equal(listarAgentes(o).packs[0].agentes[1].estado, 'conflicto');
  assert.deepEqual(aplicarPack('uno', false, o).resultados.map((x) => x.ok), [true, false]);
  assert.equal(existsSync(archivoUsuario('alfa')), false);
  assert.equal(readFileSync(archivoUsuario('beta'), 'utf8'), 'mío');
  lanza(() => aplicarPack('nada', true, o), 404);
  lanza(() => aplicarPack('uno', 'si', o), 400);
});

test('una versión anterior queda "actualizable" y activarla de nuevo la reemplaza', () => {
  const { o, archivoUsuario, escribirPropio } = preparar();
  escribirPropio('gamma', `viejo\n\n${marcador('gamma', '0.0.1')}\n`);
  assert.equal(estadoCatalogo('gamma', o), 'actualizable');
  assert.equal(listarAgentes(o).packs[1].activos, 1);
  activarCatalogo('gamma', o);
  assert.equal(estadoCatalogo('gamma', o), 'activo');
  assert.doesNotMatch(readFileSync(archivoUsuario('gamma'), 'utf8'), /viejo/);
});

test('detalle: catálogo con prompt y secciones; integrado sin prompt; personalizado del usuario editable', () => {
  const { o, escribirPropio } = preparar();
  const d = detalleAgente('catalogo', 'alfa', o);
  assert.deepEqual([d.origen, d.id, d.nombre, d.pack, d.estado, d.editable], ['catalogo', 'alfa', 'Alfa', 'uno', 'inactivo', false]);
  assert.match(d.prompt, /^Persona: Persona de alfa\./);
  assert.deepEqual([d.secciones.rol, d.secciones.metodo], ['Rol de alfa.', '1. Lee.\n2. Hace.']);
  const i = detalleAgente('integrado', 'Explore', o);
  assert.deepEqual([i.prompt, i.editable], [null, false]);
  assert.match(i.aviso, /Prompt de Anthropic, no visible/);
  escribirPropio('mi-agente', cuerpoAgente('mi-agente'));
  const p = detalleAgente('usuario', 'mi-agente', o);
  assert.deepEqual([p.editable, p.alcance, p.nombre], [true, 'usuario', 'Mi Agente']);
  assert.deepEqual(listarAgentes(o).personalizados.map((a) => [a.id, a.alcance, a.chocaConCatalogo]), [['mi-agente', 'usuario', false]]);
  lanza(() => detalleAgente('proyecto', 'mi-agente', o), 400);
  lanza(() => detalleAgente('raro', 'mi-agente', o), 400);
  lanza(() => detalleAgente('catalogo', 'pendiente', o), 404);
  lanza(() => detalleAgente('integrado', 'Inventado', o), 404);
});

test('seccionesDe tolera CRLF e ignora REGLAS CRÍTICAS y el marcador', () => {
  const s = seccionesDe('Persona: x\r\n\r\n## Rol\r\n\r\nUno.\r\n\r\n## Método\r\n\r\n1. a\r\n\r\n## REGLAS CRÍTICAS\r\n\r\n- y\r\n<!-- orquestador:catalogo id=a version=1 -->');
  assert.deepEqual(s, { rol: 'Uno.', metodo: '1. a', entregable: '', restricciones: '', retorno: '' });
});

test('buscarDefinicion respeta CLAUDE_CONFIG_DIR para los agentes del usuario', () => {
  const { env, escribirPropio } = preparar();
  escribirPropio('eco', cuerpoAgente('eco'));
  const d = buscarDefinicion('eco', { cwd: mkdtempSync(join(tmpdir(), 'orq-cwd-')), home: join(tmpdir(), 'no-existe'), env });
  assert.equal(d.model, 'sonnet');
});
