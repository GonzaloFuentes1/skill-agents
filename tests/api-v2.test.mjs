import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { crearServidor } from '../plugins/orquestador/dashboard/server.mjs';
import { pedir, login, post } from './helpers/http.mjs';
import { crearPluginFalso } from './helpers/plugin-falso.mjs';
import { ESPERAR_USUARIO, INIT, texto, fin, denegado } from './fixtures/guiones.mjs';

const FALSO = fileURLToPath(new URL('./fixtures/claude-falso.mjs', import.meta.url));
const FALSO_CLI = fileURLToPath(new URL('./fixtures/claude-falso-cli.mjs', import.meta.url));

async function levantar(guion = [ESPERAR_USUARIO, INIT, ...texto('m1', 'Hola'), fin()]) {
  const home = mkdtempSync(join(tmpdir(), 'orq api2 ñ-'));
  const claude = join(home, 'Claude Config');
  mkdirSync(claude);
  writeFileSync(join(home, 'config.json'), JSON.stringify({ rutaClaude: 'claude-falso' }));
  writeFileSync(join(home, 'events.jsonl'), '');
  writeFileSync(join(home, 'guion.json'), JSON.stringify(guion));
  const env = {
    ORQUESTADOR_HOME: home, CLAUDE_CONFIG_DIR: claude, FALSO_GUION: join(home, 'guion.json'), FALSO_CLI_REGISTRO: join(home, 'cli.jsonl'),
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
  };
  const srv = crearServidor({
    env, intervaloMs: 20, raizPlugin: crearPluginFalso(),
    spawnFn: (_b, args, o) => spawn(process.execPath, [FALSO, ...args], o),
    spawnCli: (_b, args, o) => spawn(process.execPath, [FALSO_CLI, ...args], o),
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { home, claude, srv, base, cookie: await login(base, srv.auth.token) };
}
async function esperarCondicion(fn, ms = 5000) {
  const t0 = Date.now();
  while (!(await fn())) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
}
const campos = (extra = {}) => ({
  nombre: 'Investigador RL', descripcion: 'Diseña experimentos de RL. Úsalo para planificar, no para implementar.', modelo: 'opus', esfuerzo: 'high',
  herramientas: ['Read'], alcance: 'usuario',
  secciones: { rol: 'Investigador escéptico.', metodo: '1. Hipótesis.\n2. Ablations.', entregable: 'Plan.', restricciones: '- No implementa.', retorno: 'Máximo 300 palabras.' },
  ...extra,
});

test('config: GET y POST {parcial}; 400 con errores por campo; reiniciar si cambia el puerto; 401 y 403', async () => {
  const { srv, base, cookie } = await levantar();
  try {
    assert.equal((await pedir(base, '/api/config')).status, 401);
    assert.equal((await pedir(base, '/api/config', { headers: { cookie } })).json().paraleloMax, 4);
    const ok = await post(base, '/api/config', { parcial: { paraleloMax: 5, mostrarCosto: false } }, cookie);
    assert.deepEqual([ok.status, ok.json().config.paraleloMax, ok.json().config.mostrarCosto, ok.json().reiniciar], [200, 5, false, false]);
    const malo = await post(base, '/api/config', { parcial: { rubrica: [{ clase: 'Mecánica', modelo: 'gpt', esfuerzo: 'low' }] } }, cookie);
    assert.equal(malo.status, 400);
    assert.match(malo.json().errores.rubrica, /6 filas/);
    assert.equal((await post(base, '/api/config', {}, cookie)).status, 400);
    assert.equal((await post(base, '/api/config', { parcial: { puertoDashboard: 4999 } }, cookie)).json().reiniciar, true);
    assert.equal((await post(base, '/api/config', { parcial: { paraleloMax: 2 } }, cookie, 'http://evil.example')).status, 403);
  } finally { await srv.detener(); }
});

test('config: dos pestañas guardan a la vez claves distintas y las dos quedan en el archivo', async () => {
  const { srv, base, cookie, home } = await levantar();
  try {
    const [r1, r2] = await Promise.all([
      post(base, '/api/config', { parcial: { mostrarCosto: false } }, cookie),
      post(base, '/api/config', { parcial: { alBloquear: 'denegar' } }, cookie),
    ]);
    assert.deepEqual([r1.status, r2.status], [200, 200]);
    const disco = JSON.parse(readFileSync(join(home, 'config.json'), 'utf8'));
    assert.deepEqual([disco.mostrarCosto, disco.alBloquear, disco.rutaClaude], [false, 'denegar', 'claude-falso']);
  } finally { await srv.detener(); }
});

test('automodo: estado con conteos, guardar con respaldo, fabrica, critica y restablecer con confirmación', async () => {
  const { srv, base, cookie, claude } = await levantar();
  try {
    writeFileSync(join(claude, 'settings.json'), JSON.stringify({ model: 'opus' }));
    const e = (await pedir(base, '/api/automodo', { headers: { cookie } })).json();
    assert.deepEqual([e.disponible, e.conteosFabrica], [true, { allow: 3, soft_deny: 4, hard_deny: 1 }]);
    const g = await post(base, '/api/automodo', {
      permitir: ['Correr uv run en bench/'], detener: [], entorno: { repos: ['github.com/GonzaloFuentes1/*'], dominios: [], organizacion: '' },
      classifyAllShell: false, defaultModeTerminal: true,
    }, cookie);
    assert.equal(g.status, 200);
    assert.deepEqual([g.json().personalizadas.permitir, g.json().defaultModeTerminal], [['Correr uv run en bench/'], true]);
    assert.ok(existsSync(join(claude, 'settings.json.orquestador.bak')));
    const malo = await post(base, '/api/automodo', { permitir: ['$defaults'] }, cookie);
    assert.deepEqual([malo.status, !!malo.json().errores?.permitir], [400, true]);
    assert.equal((await pedir(base, '/api/automodo/fabrica', { headers: { cookie } })).json().soft_deny.length, 4);
    assert.match((await post(base, '/api/automodo/critica', {}, cookie)).json().texto, /Sugerencia/);
    assert.equal((await post(base, '/api/automodo/restablecer', {}, cookie)).status, 400);
    assert.equal(JSON.parse(readFileSync(join(claude, 'settings.json'), 'utf8')).autoMode.allow[1], 'Correr uv run en bench/');
    assert.equal((await post(base, '/api/automodo/restablecer', { confirmar: true }, cookie)).status, 200);
    assert.equal(JSON.parse(readFileSync(join(claude, 'settings.json'), 'utf8')).autoMode, undefined);
  } finally { await srv.detener(); }
});

test('agentes: listar, activar uno y un pack, detalle y personalizados con confirmación al eliminar', async () => {
  const { srv, base, cookie, claude } = await levantar();
  try {
    assert.deepEqual((await pedir(base, '/api/agentes', { headers: { cookie } })).json().packs.map((p) => p.id), ['uno', 'dos']);
    assert.deepEqual((await post(base, '/api/agentes/catalogo/alfa', { activo: true }, cookie)).json(), { id: 'alfa', estado: 'activo' });
    assert.ok(existsSync(join(claude, 'agents', 'alfa.md')));
    assert.deepEqual((await post(base, '/api/agentes/packs/uno', { activo: true }, cookie)).json().resultados.map((x) => x.ok), [true, true]);
    assert.equal((await post(base, '/api/agentes/catalogo/alfa', { activo: 'si' }, cookie)).status, 400);
    assert.equal((await pedir(base, '/api/agentes/catalogo/alfa', { headers: { cookie } })).json().estado, 'activo');
    assert.equal((await pedir(base, '/api/agentes/integrado/Explore', { headers: { cookie } })).json().prompt, null);
    assert.equal((await pedir(base, '/api/agentes/catalogo/..%2F..%2Fx', { headers: { cookie } })).status, 400);
    const creado = await post(base, '/api/agentes/personalizados', campos(), cookie);
    assert.deepEqual([creado.status, creado.json().id], [201, 'investigador-rl']);
    assert.equal((await post(base, '/api/agentes/personalizados', campos(), cookie)).status, 409);
    assert.equal((await post(base, '/api/agentes/personalizados/investigador-rl', campos({ esfuerzo: 'xhigh' }), cookie)).json().effort, 'xhigh');
    assert.equal((await post(base, '/api/agentes/personalizados/investigador-rl/eliminar', {}, cookie)).status, 400);
    assert.ok(existsSync(join(claude, 'agents', 'investigador-rl.md')));
    assert.equal((await post(base, '/api/agentes/personalizados/investigador-rl/eliminar', { confirmar: true }, cookie)).status, 200);
    assert.equal(existsSync(join(claude, 'agents', 'investigador-rl.md')), false);
    // Un agente escrito a mano es de solo lectura: editarlo da 409 y el archivo no cambia.
    writeFileSync(join(claude, 'agents', 'a-mano.md'), 'escrito a mano');
    const r = await post(base, '/api/agentes/personalizados/a-mano', campos(), cookie);
    assert.deepEqual([r.status, /escrito a mano/.test(r.json().error)], [409, true]);
    assert.equal(readFileSync(join(claude, 'agents', 'a-mano.md'), 'utf8'), 'escrito a mano');
  } finally { await srv.detener(); }
});

test('agentes del proyecto: usan el cwd de la conversación indicada, nunca una ruta de la petición', async () => {
  const { srv, base, cookie, home } = await levantar();
  try {
    const repo = join(home, 'Mi Repo ñ');
    mkdirSync(repo);
    const conv = (await post(base, '/api/conversaciones', { cwd: repo }, cookie)).json();
    assert.equal((await post(base, '/api/agentes/personalizados', campos({ alcance: 'proyecto' }), cookie)).status, 400);
    assert.equal((await post(base, '/api/agentes/personalizados', campos({ alcance: 'proyecto', conversacion: conv.id, cwd: home }), cookie)).status, 201);
    assert.ok(existsSync(join(repo, '.claude', 'agents', 'investigador-rl.md')));
    assert.deepEqual((await pedir(base, `/api/agentes?conversacion=${conv.id}`, { headers: { cookie } })).json().personalizados.map((a) => a.alcance), ['proyecto']);
    assert.equal((await post(base, '/api/agentes/personalizados', campos({ alcance: 'proyecto', conversacion: 'no-existe' }), cookie)).status, 404);
  } finally { await srv.detener(); }
});

test('redactar: devuelve las cinco secciones del binario falso; datos inválidos dan 400', async () => {
  const { srv, base, cookie } = await levantar();
  try {
    const r = await post(base, '/api/agentes/redactar', { nombre: 'Investigador RL', descripcion: 'Diseña experimentos de RL.', modelo: 'opus', herramientas: ['Read'] }, cookie);
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.json()), ['rol', 'metodo', 'entregable', 'restricciones', 'retorno']);
    assert.equal((await post(base, '/api/agentes/redactar', { nombre: '' }, cookie)).status, 400);
  } finally { await srv.detener(); }
});

test('historial: trae las denegaciones del modo automático', async () => {
  const { srv, base, cookie, home } = await levantar([ESPERAR_USUARIO, INIT, denegado('Bash', 'git push --force', 'Git destructivo'), ...texto('m1', 'Listo'), fin()]);
  try {
    const conv = (await post(base, '/api/conversaciones', { cwd: home }, cookie)).json();
    await post(base, `/api/conversaciones/${conv.id}/mensajes`, { texto: 'empuja' }, cookie);
    await esperarCondicion(async () => (await pedir(base, '/api/conversaciones', { headers: { cookie } })).json()[0].estado === 'lista');
    const h = (await pedir(base, `/api/conversaciones/${conv.id}/historial`, { headers: { cookie } })).json();
    assert.deepEqual(h.denegados.map((d) => [d.herramienta, d.motivo]), [['Bash', 'Git destructivo']]);
  } finally { await srv.detener(); }
});
