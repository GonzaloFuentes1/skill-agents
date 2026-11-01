// Migración única de los valores de fábrica (VERSION_DEFECTOS 2): topes 20/4 y todo el catálogo activado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cargarConfig, migrarDefectos, VERSION_DEFECTOS } from '../plugins/orquestador/scripts/lib/config.mjs';
import { rutaConfig } from '../plugins/orquestador/scripts/lib/rutas.mjs';
import { aplicarDefectos } from '../plugins/orquestador/scripts/session-start.mjs';
import { estadoCatalogo } from '../plugins/orquestador/dashboard/agentes.mjs';
import { crearPluginFalso } from './helpers/plugin-falso.mjs';

const nuevoEnv = () => ({
  ORQUESTADOR_HOME: mkdtempSync(join(tmpdir(), 'orq-def-')),
  CLAUDE_CONFIG_DIR: mkdtempSync(join(tmpdir(), 'orq-claude-')),
});
const leer = (env) => JSON.parse(readFileSync(rutaConfig(env), 'utf8'));

test('migrarDefectos: sube los topes de fábrica anteriores, respeta los elegidos y corre una sola vez', () => {
  const env = nuevoEnv();
  writeFileSync(rutaConfig(env), JSON.stringify({ paraleloMax: 4, fableMaxPorSesion: 2, puertoDashboard: 5000 }));
  assert.equal(migrarDefectos(env), true);
  assert.deepEqual(leer(env), { paraleloMax: 20, fableMaxPorSesion: 4, puertoDashboard: 5000, versionDefectos: VERSION_DEFECTOS });
  assert.equal(migrarDefectos(env), false);

  const elegido = nuevoEnv();
  writeFileSync(rutaConfig(elegido), JSON.stringify({ paraleloMax: 8, fableMaxPorSesion: 1 }));
  migrarDefectos(elegido);
  assert.deepEqual([cargarConfig(elegido).paraleloMax, cargarConfig(elegido).fableMaxPorSesion], [8, 1]);
});

test('migrarDefectos: sin config.json la crea con la marca; con JSON roto no la pisa', () => {
  const env = nuevoEnv();
  assert.equal(migrarDefectos(env), true);
  assert.deepEqual(leer(env), { versionDefectos: VERSION_DEFECTOS });
  assert.deepEqual([cargarConfig(env).paraleloMax, cargarConfig(env).fableMaxPorSesion], [20, 4]);

  const roto = nuevoEnv();
  writeFileSync(rutaConfig(roto), '{roto');
  assert.equal(migrarDefectos(roto), false);
  assert.equal(readFileSync(rutaConfig(roto), 'utf8'), '{roto');
});

test('aplicarDefectos: activa todo el catálogo una vez, no toca agentes propios y avisa al usuario', async () => {
  const env = nuevoEnv();
  const raizPlugin = crearPluginFalso();
  mkdirSync(join(env.CLAUDE_CONFIG_DIR, 'agents'), { recursive: true });
  writeFileSync(join(env.CLAUDE_CONFIG_DIR, 'agents', 'beta.md'), '---\nname: beta\n---\nmío');
  const aviso = await aplicarDefectos(env, raizPlugin);
  assert.match(aviso, /20 agentes en paralelo, 4 delegaciones a Fable .* 2 agentes del catálogo activados/);
  assert.deepEqual(['alfa', 'beta', 'gamma'].map((id) => estadoCatalogo(id, { env, raizPlugin })), ['activo', 'conflicto', 'activo']);
  assert.equal(readFileSync(join(env.CLAUDE_CONFIG_DIR, 'agents', 'beta.md'), 'utf8'), '---\nname: beta\n---\nmío');
  assert.equal(await aplicarDefectos(env, raizPlugin), null, 'la segunda vez no hace nada');
});

test('aplicarDefectos: los procesos auxiliares del dashboard no migran', async () => {
  const env = { ...nuevoEnv(), ORQUESTADOR_CANAL: '' };
  assert.equal(await aplicarDefectos(env, crearPluginFalso()), null);
  assert.equal(existsSync(rutaConfig(env)), false);
});
