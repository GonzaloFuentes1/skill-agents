import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';
import { crearServidor } from '../plugins/orquestador/dashboard/server.mjs';
import { rutaEventos } from '../plugins/orquestador/scripts/lib/rutas.mjs';
import { pedir, pedirCrudo, login, post } from './helpers/http.mjs';
import { ESPERAR_USUARIO, INIT, texto, fin } from './fixtures/guiones.mjs';

const FALSO = fileURLToPath(new URL('./fixtures/claude-falso.mjs', import.meta.url));

async function levantar({ guion = [ESPERAR_USUARIO, INIT, ...texto('m1', 'Hola'), fin()], gestor } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'orq-srv2-'));
  writeFileSync(join(home, 'config.json'), JSON.stringify({ rutaClaude: 'claude-falso' }));
  writeFileSync(join(home, 'guion.json'), JSON.stringify(guion));
  writeFileSync(join(home, 'events.jsonl'), '');
  const env = { ORQUESTADOR_HOME: home, CLAUDE_CONFIG_DIR: mkdtempSync(join(tmpdir(), 'orq-cfg-')), FALSO_GUION: join(home, 'guion.json'), PATH: process.env.PATH, SystemRoot: process.env.SystemRoot };
  const srv = crearServidor({ env, intervaloMs: 20, gestor, spawnFn: (_b, args, o) => spawn(process.execPath, [FALSO, ...args], o) });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { env, home, srv, base, cookie: await login(base, srv.auth.token) };
}
async function esperarCondicion(fn, ms = 5000) {
  const t0 = Date.now();
  while (!(await fn())) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
}

test('cuerpos y rutas inválidas: JSON mal formado, cuerpo que no es objeto y % mal codificado dan 400', async () => {
  const { srv, base, cookie } = await levantar();
  try {
    const h = { cookie, origin: base, 'content-type': 'application/json' };
    assert.equal((await pedirCrudo(base, '/api/conversaciones', { cuerpo: '{roto', headers: h })).status, 400);
    for (const c of ['[1,2]', '"texto"', '3', 'null']) assert.equal((await pedirCrudo(base, '/api/conversaciones', { cuerpo: c, headers: h })).status, 400, c);
    assert.equal((await pedir(base, '/api/conversaciones/%E0%A4%A/historial', { headers: { cookie } })).status, 400);
    assert.equal((await post(base, '/api/conversaciones/%ZZ/titulo', { titulo: 'x' }, cookie)).status, 400);
  } finally { await srv.detener(); }
});

test('métodos: PUT y DELETE en la API dan 405; HEAD en un estático da cabeceras sin cuerpo', async () => {
  const { srv, base, cookie } = await levantar();
  try {
    assert.equal((await pedir(base, '/api/conversaciones', { metodo: 'PUT', headers: { cookie } })).status, 405);
    assert.equal((await pedir(base, '/api/conversaciones', { metodo: 'DELETE', headers: { cookie } })).status, 405);
    const head = await pedir(base, '/app.js', { metodo: 'HEAD' });
    assert.equal(head.status, 200);
    assert.match(head.headers['content-type'], /javascript/);
    assert.ok(Number(head.headers['content-length']) > 0);
    assert.equal(head.texto, '');
  } finally { await srv.detener(); }
});

test('el canje del token por HTTP solo se acepta con GET', async () => {
  const { srv, base } = await levantar();
  try {
    assert.equal((await pedir(base, `/?t=${srv.auth.token}`, { metodo: 'POST', headers: { origin: base } })).status, 405);
    assert.equal((await pedir(base, `/?t=${srv.auth.token}`)).status, 302);
  } finally { await srv.detener(); }
});

test('titulo, interrumpir, cerrar y carpetas por HTTP', async () => {
  const { srv, base, cookie, home } = await levantar({ guion: [ESPERAR_USUARIO, INIT] }); // el turno queda abierto
  try {
    const conv = (await post(base, '/api/conversaciones', { cwd: home }, cookie)).json();
    const t = await post(base, `/api/conversaciones/${conv.id}/titulo`, { titulo: '  ci: arreglar windows  ' }, cookie);
    assert.deepEqual([t.status, t.json().titulo, t.json().etiqueta], [200, 'ci: arreglar windows', '[CI]']);
    assert.equal((await post(base, `/api/conversaciones/${conv.id}/titulo`, { titulo: '' }, cookie)).status, 400);
    assert.equal((await post(base, `/api/conversaciones/${conv.id}/interrumpir`, {}, cookie)).status, 200); // sin proceso: no hace nada
    assert.equal((await post(base, `/api/conversaciones/${conv.id}/mensajes`, { texto: 'hola' }, cookie)).status, 202);
    assert.equal((await post(base, `/api/conversaciones/${conv.id}/interrumpir`, {}, cookie)).status, 200);
    assert.equal((await post(base, `/api/conversaciones/${conv.id}/cerrar`, {}, cookie)).status, 200);
    await esperarCondicion(async () => (await pedir(base, '/api/conversaciones', { headers: { cookie } })).json()[0].estado === 'inactiva');
    mkdirSync(join(home, 'Proyecto A'));
    const carpetas = (await pedir(base, `/api/carpetas?prefijo=${encodeURIComponent(join(home, 'Proy'))}`, { headers: { cookie } })).json();
    assert.deepEqual(carpetas, [join(home, 'Proyecto A')]);
    assert.equal((await post(base, '/api/conversaciones/nada/cerrar', {}, cookie)).status, 404);
  } finally { await srv.detener(); }
});

test('pasos: la ruta nueva /api/pasos/:session/:agentId; la vieja ya no responde', async () => {
  const { srv, base, cookie, env, home } = await levantar();
  try {
    assert.deepEqual((await pedir(base, '/api/pasos/s1/a1', { headers: { cookie } })).json(), { pasos: [], siguiente: 0, existe: false });
    assert.equal((await pedir(base, '/api/pasos/s1/..%2Fx', { headers: { cookie } })).status, 400);
    const ruta = join(home, 's1', 'subagents', 'agent-a1.jsonl');
    mkdirSync(join(home, 's1', 'subagents'), { recursive: true });
    writeFileSync(ruta, JSON.stringify({ type: 'user', message: { content: 'Haz X' } }) + '\n');
    appendFileSync(rutaEventos(env), JSON.stringify({ session: 's1', tipo: 'agente-inicio', id: 't1', agentId: 'a1', transcript: ruta }) + '\n');
    await new Promise((r) => setTimeout(r, 120));
    assert.deepEqual((await pedir(base, '/api/pasos/s1/a1?desde=0', { headers: { cookie } })).json().pasos.map((p) => p.tipo), ['encargo']);
    assert.notEqual((await pedir(base, '/api/agentes/s1/a1/pasos', { headers: { cookie } })).status, 200);
  } finally { await srv.detener(); }
});

test('detener: vacía los clientes SSE y quita el oyente del gestor', async () => {
  const oyentes = new Set();
  const gestor = { on: (fn) => { oyentes.add(fn); return () => oyentes.delete(fn); }, listar: () => [], hayProcesos: () => false, apagar: async () => {} };
  const { srv, base, cookie } = await levantar({ gestor });
  const sse = request(`${base}/eventos`, { headers: { cookie } });
  sse.on('error', () => {});
  sse.end();
  await esperarCondicion(() => srv.clientesSse() === 1);
  assert.equal(oyentes.size, 1);
  await srv.detener();
  assert.equal(oyentes.size, 0);
  assert.equal(srv.clientesSse(), 0);
});
