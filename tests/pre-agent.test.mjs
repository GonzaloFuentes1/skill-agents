import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decidirDelegacion, manejar } from '../plugins/orquestador/scripts/pre-agent.mjs';
import { buscarDefinicion, nombreBase } from '../plugins/orquestador/scripts/lib/agentes.mjs';
import { estadoVacio, leerEstado } from '../plugins/orquestador/scripts/lib/estado.mjs';
import { CONFIG_DEFECTO } from '../plugins/orquestador/scripts/lib/config.mjs';
import { leerEventos } from '../plugins/orquestador/scripts/lib/eventos.mjs';
import { rutaConfig } from '../plugins/orquestador/scripts/lib/rutas.mjs';

const SCRIPT = fileURLToPath(new URL('../plugins/orquestador/scripts/pre-agent.mjs', import.meta.url));
const nuevoEnv = () => ({ ORQUESTADOR_HOME: mkdtempSync(join(tmpdir(), 'orq-')) });
const entrada = (ti, id = 'tu1') => ({ session_id: 's', tool_name: 'Agent', tool_use_id: id, cwd: tmpdir(), tool_input: { subagent_type: 'investigador-rl', description: 'Diseñar ablation', prompt: 'x', ...ti } });

test('nombreBase quita el prefijo del plugin', () => {
  assert.equal(nombreBase('orquestador:investigador-rl'), 'investigador-rl');
  assert.equal(nombreBase('general-purpose'), 'general-purpose');
});

test('buscarDefinicion: agente de proyecto con persona; prefijo de plugin; nombre inválido', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'orq-proy-'));
  mkdirSync(join(cwd, '.claude', 'agents'), { recursive: true });
  writeFileSync(join(cwd, '.claude', 'agents', 'eco.md'), '---\nname: eco\nmodel: sonnet\neffort: low\ncolor: cyan\n---\nPersona: Lacónico.\n');
  const d = buscarDefinicion('eco', { cwd, home: cwd });
  assert.equal(d.model, 'sonnet');
  assert.equal(d.persona, 'Lacónico.');
  const raizPlugin = mkdtempSync(join(tmpdir(), 'orq-plug-'));
  mkdirSync(join(raizPlugin, 'agents'));
  writeFileSync(join(raizPlugin, 'agents', 'eco.md'), '---\nname: eco\nmodel: opus\neffort: high\n---\nPersona: Otro.\n');
  assert.equal(buscarDefinicion('orquestador:eco', { raizPlugin, cwd, home: cwd }).model, 'opus');
  assert.equal(buscarDefinicion('../x', { cwd, home: cwd }), null);
  assert.equal(buscarDefinicion('general-purpose', { cwd, home: cwd }), null);
});

test('modelo explícito gana al frontmatter y queda registrado', () => {
  const e = estadoVacio('s');
  const r = decidirDelegacion(entrada({ model: 'haiku', effort: 'low' }), e, CONFIG_DEFECTO, { model: 'opus', effort: 'high', color: 'purple', persona: 'Escéptico' });
  assert.equal(r.denegar, undefined);
  assert.equal(r.evento.tipo, 'delegacion');
  assert.equal(r.evento.modelo, 'haiku');
  assert.equal(r.evento.origenModelo, 'explicito');
  assert.equal(r.evento.meta, 'Diseñar ablation');
  assert.equal(r.evento.persona, 'Escéptico');
  assert.equal(e.activas.tu1.esfuerzo, 'low');
});

test('sin modelo explícito usa el frontmatter; con inherit usa el modelo principal', () => {
  const e = estadoVacio('s');
  assert.equal(decidirDelegacion(entrada({}), e, CONFIG_DEFECTO, { model: 'opus', effort: 'high' }).evento.origenModelo, 'frontmatter');
  e.modeloPrincipal = 'opus';
  const r = decidirDelegacion(entrada({}, 'tu2'), e, CONFIG_DEFECTO, { model: 'inherit' });
  assert.equal(r.evento.modelo, 'opus');
  assert.equal(r.evento.origenModelo, 'heredado');
});

test('tope de Fable: la tercera delegación a fable se niega', () => {
  const e = estadoVacio('s');
  decidirDelegacion(entrada({ model: 'fable' }, 'a'), e, CONFIG_DEFECTO, null);
  decidirDelegacion(entrada({ model: 'fable' }, 'b'), e, CONFIG_DEFECTO, null);
  const r = decidirDelegacion(entrada({ model: 'fable' }, 'c'), e, CONFIG_DEFECTO, null);
  assert.match(r.denegar, /Tope de Fable/);
  assert.equal(r.evento.tipo, 'bloqueo');
  assert.equal(r.evento.regla, 'tope-fable');
  assert.equal(e.fableUsados, 2);
  assert.equal(e.activas.c, undefined);
});

test('heredar Fable del orquestador cuenta para el tope', () => {
  const e = estadoVacio('s');
  e.modeloPrincipal = 'fable';
  decidirDelegacion(entrada({}, 'a'), e, { ...CONFIG_DEFECTO, fableMaxPorSesion: 1 }, null);
  const r = decidirDelegacion(entrada({}, 'b'), e, { ...CONFIG_DEFECTO, fableMaxPorSesion: 1 }, null);
  assert.match(r.denegar, /Tope de Fable/);
});

test('tope de paralelismo', () => {
  const e = estadoVacio('s');
  const config = { ...CONFIG_DEFECTO, paraleloMax: 2 };
  decidirDelegacion(entrada({ model: 'haiku' }, 'a'), e, config, null);
  decidirDelegacion(entrada({ model: 'haiku' }, 'b'), e, config, null);
  const r = decidirDelegacion(entrada({ model: 'haiku' }, 'c'), e, config, null);
  assert.equal(r.evento.regla, 'paralelo');
  assert.match(r.denegar, /en paralelo/);
});

test('manejar: dos Fable simultáneos con tope 1 → exactamente uno pasa', async () => {
  const env = nuevoEnv();
  writeFileSync(rutaConfig(env), JSON.stringify({ fableMaxPorSesion: 1 }));
  const [r1, r2] = await Promise.all([manejar(entrada({ model: 'fable' }, 'x'), env), manejar(entrada({ model: 'fable' }, 'y'), env)]);
  assert.equal([r1, r2].filter(Boolean).length, 1);
  assert.equal(leerEstado('s', env).fableUsados, 1);
  assert.deepEqual(leerEventos({ session: 's' }, env).map((e) => e.tipo).sort(), ['bloqueo', 'delegacion']);
});

test('el script responde por stdout a una entrada real', () => {
  const env = { ...process.env, ...nuevoEnv() };
  const r = spawnSync(process.execPath, [SCRIPT], { input: JSON.stringify(entrada({ model: 'haiku' })), env, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
  assert.equal(leerEventos({ session: 's' }, env)[0].modelo, 'haiku');
});
