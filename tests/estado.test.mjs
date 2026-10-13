import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { conEstado, leerEstado, limpiarVencidas, estadoVacio } from '../plugins/orquestador/scripts/lib/estado.mjs';

const nuevoEnv = () => ({ ORQUESTADOR_HOME: mkdtempSync(join(tmpdir(), 'orq-')) });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

test('leerEstado devuelve el estado vacío si no hay archivo', () => {
  assert.deepEqual(leerEstado('s1', nuevoEnv()), estadoVacio('s1'));
});

test('conEstado serializa las escrituras concurrentes (no se pierden conteos)', async () => {
  const env = nuevoEnv();
  await Promise.all(Array.from({ length: 10 }, () =>
    conEstado('s1', async (e) => { const v = e.fableUsados; await esperar(5); e.fableUsados = v + 1; }, env)));
  assert.equal(leerEstado('s1', env).fableUsados, 10);
});

test('conEstado devuelve lo que devuelve fn', async () => {
  assert.equal(await conEstado('s2', () => 42, nuevoEnv()), 42);
});

test('limpiarVencidas elimina delegaciones de más de 2 horas', () => {
  const e = estadoVacio('s');
  e.activas.viejo = { inicio: 0 };
  e.activas.nuevo = { inicio: 3 * 3600e3 };
  limpiarVencidas(e, 3 * 3600e3);
  assert.deepEqual(Object.keys(e.activas), ['nuevo']);
});
