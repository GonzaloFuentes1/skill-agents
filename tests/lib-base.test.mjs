import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dirBase, rutaSesion, limpiarId, rutaConfig, rutaEventos } from '../plugins/orquestador/scripts/lib/rutas.mjs';
import { cargarConfig, CONFIG_DEFECTO } from '../plugins/orquestador/scripts/lib/config.mjs';
import { familia, costoUSD } from '../plugins/orquestador/scripts/lib/modelos.mjs';
import { emitir, leerEventos } from '../plugins/orquestador/scripts/lib/eventos.mjs';

const nuevoEnv = () => ({ ORQUESTADOR_HOME: mkdtempSync(join(tmpdir(), 'orq-')) });

test('dirBase respeta ORQUESTADOR_HOME y limpiarId evita rutas peligrosas', () => {
  const env = nuevoEnv();
  assert.equal(dirBase(env), env.ORQUESTADOR_HOME);
  assert.equal(limpiarId('../x'), '___x');
  assert.equal(limpiarId(undefined), 'sin-sesion');
  assert.equal(rutaSesion('abc', env), join(env.ORQUESTADOR_HOME, 'sessions', 'abc.json'));
});

test('cargarConfig: valores por defecto, merge con el usuario y JSON roto', () => {
  const env = nuevoEnv();
  assert.equal(cargarConfig(env).fableMaxPorSesion, 2);
  writeFileSync(rutaConfig(env), JSON.stringify({ fableMaxPorSesion: 5, precios: { haiku: { entrada: 9, salida: 9, cacheLectura: 9, cacheEscritura: 9 } } }));
  const c = cargarConfig(env);
  assert.equal(c.fableMaxPorSesion, 5);
  assert.equal(c.paraleloMax, 4);
  assert.equal(c.precios.haiku.entrada, 9);
  assert.equal(c.precios.opus.entrada, CONFIG_DEFECTO.precios.opus.entrada);
  writeFileSync(rutaConfig(env), '{roto');
  assert.equal(cargarConfig(env).fableMaxPorSesion, 2);
});

test('familia reconoce alias, IDs completos y heredado', () => {
  assert.equal(familia('claude-opus-5-5'), 'opus');
  assert.equal(familia('haiku'), 'haiku');
  assert.equal(familia('claude-fable-5-1'), 'fable');
  assert.equal(familia('inherit'), 'heredado');
  assert.equal(familia('heredado'), 'heredado');
  assert.equal(familia(undefined), 'desconocido');
});

test('costoUSD usa la tabla de precios por millón de tokens', () => {
  const precios = { sonnet: { entrada: 2, salida: 10, cacheLectura: 0.2, cacheEscritura: 2.5 } };
  const uso = { input_tokens: 1_000_000, output_tokens: 100_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  assert.equal(costoUSD(uso, 'claude-sonnet-5-5', precios), 3);
  assert.equal(costoUSD(uso, 'desconocido', precios), 0);
});

test('emitir agrega líneas; leerEventos filtra por sesión e ignora líneas rotas', () => {
  const env = nuevoEnv();
  emitir({ session: 'a', tipo: 'sesion' }, env);
  emitir({ session: 'b', tipo: 'sesion' }, env);
  appendFileSync(rutaEventos(env), 'no-json\n');
  const a = leerEventos({ session: 'a' }, env);
  assert.equal(a.length, 1);
  assert.equal(a[0].v, 1);
  assert.match(a[0].ts, /^\d{4}-/);
  assert.equal(leerEventos({}, env).length, 2);
});

test('emitir nunca lanza aunque la ruta sea inválida', () => {
  const env = nuevoEnv();
  mkdirSync(rutaEventos(env)); // un directorio donde debería ir el archivo
  assert.doesNotThrow(() => emitir({ session: 'x', tipo: 'sesion' }, env));
});
