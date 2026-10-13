import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { dirClaude, rutaSettingsUsuario, rutaAgentesUsuario, rutaAgentesProyecto, rutaConfig } from '../plugins/orquestador/scripts/lib/rutas.mjs';
import { leerJsonUsuario, escribirAtomico, textoJson, respaldar } from '../plugins/orquestador/scripts/lib/archivos.mjs';
import {
  cargarConfig, validarConfig, guardarConfig, normalizarRubrica, rubricaEsDeFabrica, RUBRICA_FABRICA, CLASES_RUBRICA, CLAVES_EDITABLES,
} from '../plugins/orquestador/scripts/lib/config.mjs';

const home = () => ({ ORQUESTADOR_HOME: mkdtempSync(join(tmpdir(), 'orq-cfg2-')) });
const leer = (env) => JSON.parse(readFileSync(rutaConfig(env), 'utf8'));

test('rutas de Claude: derivan de CLAUDE_CONFIG_DIR y, sin ella, de ~/.claude', () => {
  const env = { CLAUDE_CONFIG_DIR: join(tmpdir(), 'Mi Config ñ') };
  assert.equal(dirClaude(env), env.CLAUDE_CONFIG_DIR);
  assert.equal(rutaSettingsUsuario(env), join(env.CLAUDE_CONFIG_DIR, 'settings.json'));
  assert.equal(rutaAgentesUsuario(env), join(env.CLAUDE_CONFIG_DIR, 'agents'));
  assert.equal(dirClaude({}), join(homedir(), '.claude'));
  assert.equal(rutaAgentesProyecto(join(tmpdir(), 'repo x')), join(tmpdir(), 'repo x', '.claude', 'agents'));
});

test('archivos: BOM tolerado, ausente distinto de inválido, escritura atómica y respaldo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orq-arch-'));
  const r = join(dir, 'a.json');
  assert.deepEqual(leerJsonUsuario(r), { existe: false, datos: null, error: null });
  writeFileSync(r, '﻿{"x":1}');
  assert.deepEqual(leerJsonUsuario(r).datos, { x: 1 });
  assert.equal(respaldar(r, '.bak'), `${r}.bak`);
  assert.equal(readFileSync(`${r}.bak`, 'utf8'), '﻿{"x":1}');
  writeFileSync(r, '{roto');
  const malo = leerJsonUsuario(r);
  assert.equal(malo.existe, true);
  assert.match(malo.error, /no es JSON válido/);
  escribirAtomico(join(dir, 'sub', 'b.json'), textoJson({ y: [1] }));
  assert.equal(readFileSync(join(dir, 'sub', 'b.json'), 'utf8'), '{\n  "y": [\n    1\n  ]\n}\n');
  assert.equal(respaldar(join(dir, 'no-existe.json'), '.bak'), null);
});

test('config: valores por defecto nuevos', () => {
  const c = cargarConfig(home());
  assert.deepEqual([c.modoPermisoDefecto, c.alBloquear, c.mostrarCosto, c.alertasModelo], ['preguntar', 'preguntar', true, true]);
  assert.deepEqual(c.rubrica.map((f) => f.clase), [...CLASES_RUBRICA]);
  assert.deepEqual(c.rubrica.map((f) => `${f.modelo}/${f.esfuerzo}`), ['haiku/low', 'sonnet/medium', 'sonnet/high', 'opus/high', 'opus/xhigh', 'fable/high']);
});

test('config: una rúbrica editada a mano con valores inválidos cae a fábrica por fila (y con BOM se lee igual)', () => {
  const env = home();
  writeFileSync(rutaConfig(env), '﻿' + JSON.stringify({ paraleloMax: 3, rubrica: [
    { clase: 'Mecánica', modelo: 'gpt', esfuerzo: 'low' },
    { clase: 'Juicio experto', modelo: 'sonnet', esfuerzo: 'max' },
    { clase: 'Inventada', modelo: 'opus', esfuerzo: 'high' },
    null,
  ] }));
  const c = cargarConfig(env);
  assert.equal(c.paraleloMax, 3);
  assert.equal(c.rubrica.length, 6);
  assert.deepEqual(c.rubrica[0], { clase: 'Mecánica', modelo: 'haiku', esfuerzo: 'low' });
  assert.deepEqual(c.rubrica[3], { clase: 'Juicio experto', modelo: 'sonnet', esfuerzo: 'max' });
  assert.equal(rubricaEsDeFabrica(c.rubrica), false);
  assert.equal(rubricaEsDeFabrica(normalizarRubrica('basura')), true);
});

test('validarConfig: errores por campo, rangos y enums; ignora claves desconocidas y no editables', () => {
  const { errores, limpio } = validarConfig({
    paraleloMax: 9, fableMaxPorSesion: 0, conversacionesMax: 1.5, modelosOrquestador: [], modoPermisoDefecto: 'auto',
    alBloquear: 'quizas', mostrarCosto: 'no', alertasModelo: false, puertoDashboard: 80, ramasProtegidas: ['main', 'rama con espacio'],
    rubrica: RUBRICA_FABRICA.slice(0, 5), precios: { opus: { entrada: 4, salida: 20, cacheLectura: 0.2, cacheEscritura: -1 } },
    remoto: { activo: true, escuchar: '0.0.0.0', hostsPermitidos: [''] }, inventada: 1, rutaClaude: 'x',
  });
  assert.deepEqual(Object.keys(errores).sort(), ['alBloquear', 'conversacionesMax', 'modelosOrquestador', 'mostrarCosto', 'paraleloMax',
    'precios', 'puertoDashboard', 'ramasProtegidas', 'remoto', 'rubrica'].sort());
  assert.deepEqual(limpio, { fableMaxPorSesion: 0, modoPermisoDefecto: 'auto', alertasModelo: false });
  assert.ok(!CLAVES_EDITABLES.includes('rutaClaude'));
  assert.match(validarConfig({ rubrica: [...RUBRICA_FABRICA].reverse() }).errores.rubrica, /Mecánica/);
  assert.deepEqual(validarConfig({ rubrica: RUBRICA_FABRICA.map((f) => ({ ...f })) }).errores, {});
  assert.deepEqual(validarConfig([1]).errores, { _: 'La configuración debe ser un objeto' });
});

test('guardarConfig: escribe solo claves conocidas, conserva las desconocidas y fusiona precios', () => {
  const env = home();
  writeFileSync(rutaConfig(env), JSON.stringify({ miClave: { a: 1 }, precios: { haiku: { entrada: 1, salida: 2, cacheLectura: 3, cacheEscritura: 4 } } }));
  const r = guardarConfig({ paraleloMax: 6, inventada: true, precios: { opus: { entrada: 5, salida: 25, cacheLectura: 0.5, cacheEscritura: 6 } } }, env);
  assert.equal(r.ok, true);
  assert.equal(r.config.paraleloMax, 6);
  const disco = leer(env);
  assert.deepEqual(disco.miClave, { a: 1 });
  assert.equal(disco.inventada, undefined);
  assert.equal(disco.precios.haiku.entrada, 1);
  assert.equal(disco.precios.opus.salida, 25);
  assert.match(readFileSync(rutaConfig(env), 'utf8'), /^\{\n {2}"/);
});

test('guardarConfig: dos guardados seguidos con claves distintas conservan ambos cambios', () => {
  const env = home();
  guardarConfig({ mostrarCosto: false }, env);
  guardarConfig({ paraleloMax: 2 }, env);
  assert.deepEqual([leer(env).mostrarCosto, leer(env).paraleloMax], [false, 2]);
});

test('guardarConfig: con errores no escribe; un config.json inválido no se pisa', () => {
  const env = home();
  const r = guardarConfig({ paraleloMax: 0 }, env);
  assert.deepEqual([r.ok, Object.keys(r.errores)], [false, ['paraleloMax']]);
  assert.equal(existsSync(rutaConfig(env)), false);
  writeFileSync(rutaConfig(env), '{roto');
  const r2 = guardarConfig({ paraleloMax: 2 }, env);
  assert.equal(r2.ok, false);
  assert.match(r2.errores._, /no es JSON válido/);
  assert.equal(readFileSync(rutaConfig(env), 'utf8'), '{roto');
});
