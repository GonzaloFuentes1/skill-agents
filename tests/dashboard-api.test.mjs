import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { crearServidor, carpetasCon, hostsEscucha } from '../plugins/orquestador/dashboard/server.mjs';
import { rutaEventos } from '../plugins/orquestador/scripts/lib/rutas.mjs';
import { pedir, login, post, escucharSse } from './helpers/http.mjs';
import { ESPERAR_USUARIO, ESPERAR_RESPUESTA, INIT, texto, permiso, fin } from './fixtures/guiones.mjs';

const FALSO = fileURLToPath(new URL('./fixtures/claude-falso.mjs', import.meta.url));

async function levantar(guion = [ESPERAR_USUARIO, INIT, ...texto('m1', 'Hola'), fin()]) {
  const home = mkdtempSync(join(tmpdir(), 'orq-api-'));
  writeFileSync(join(home, 'config.json'), JSON.stringify({ rutaClaude: 'claude-falso' }));
  writeFileSync(join(home, 'guion.json'), JSON.stringify(guion));
  writeFileSync(join(home, 'events.jsonl'), '');
  const env = { ORQUESTADOR_HOME: home, CLAUDE_CONFIG_DIR: mkdtempSync(join(tmpdir(), 'orq-cfg-')), FALSO_GUION: join(home, 'guion.json'), FALSO_REGISTRO: join(home, 'registro.jsonl'), PATH: process.env.PATH, SystemRoot: process.env.SystemRoot };
  const spawnFn = (_b, args, o) => spawn(process.execPath, [FALSO, ...args], o);
  const srv = crearServidor({ env, intervaloMs: 20, spawnFn });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { env, home, srv, base };
}

const esperarQue = (lista, pred, ms = 5000) => new Promise((ok, mal) => {
  const t0 = Date.now();
  const mirar = () => { const e = lista.find(pred); if (e) return ok(e); if (Date.now() - t0 > ms) return mal(new Error('timeout')); setTimeout(mirar, 10); };
  mirar();
});

test('login: token malo 401, bueno 302 con cookie; datos protegidos sin cookie 401; /salud abierto', async () => {
  const { srv, base } = await levantar();
  try {
    assert.equal((await pedir(base, '/?t=malo')).status, 401);
    assert.equal((await pedir(base, '/sesiones')).status, 401);
    assert.equal((await pedir(base, '/api/conversaciones')).status, 401);
    assert.equal((await pedir(base, '/eventos')).status, 401);
    assert.equal((await pedir(base, '/salud')).status, 200);
    const cookie = await login(base, srv.auth.token);
    assert.equal((await pedir(base, '/sesiones', { headers: { cookie } })).status, 200);
    assert.deepEqual((await pedir(base, '/api/conversaciones', { headers: { cookie } })).json(), []);
  } finally { await srv.detener(); }
});

test('POST exige Origin del mismo host; cuerpo inválido 400; demasiado grande 413', async () => {
  const { srv, base, home } = await levantar();
  try {
    const cookie = await login(base, srv.auth.token);
    assert.equal((await post(base, '/api/conversaciones', { cwd: home }, cookie, 'http://evil.example')).status, 403);
    assert.equal((await pedir(base, '/api/conversaciones', { metodo: 'POST', cuerpo: { cwd: home }, headers: { cookie } })).status, 403);
    const malo = await pedir(base, '/api/conversaciones', { metodo: 'POST', headers: { cookie, origin: base, 'content-type': 'application/json' } });
    assert.equal(malo.status, 400); // cuerpo vacío → {} → cwd faltante
    assert.equal((await post(base, '/api/conversaciones', { cwd: 'x'.repeat(70_000) }, cookie)).status, 413);
    const ok = await post(base, '/api/conversaciones', { cwd: home }, cookie);
    assert.equal(ok.status, 201);
    assert.equal(ok.json().cwd, home);
  } finally { await srv.detener(); }
});

test('flujo completo: mensaje → SSE chat → permiso → fin → historial', async () => {
  const { srv, base, home } = await levantar([ESPERAR_USUARIO, INIT, permiso('r1', 'ls'), ESPERAR_RESPUESTA, ...texto('m1', 'Listo'), fin()]);
  const recibidos = [];
  let sse;
  try {
    const cookie = await login(base, srv.auth.token);
    sse = escucharSse(base, cookie, (ev, data) => { if (ev === 'chat') recibidos.push(data); });
    const conv = (await post(base, '/api/conversaciones', { cwd: home }, cookie)).json();
    assert.equal((await post(base, `/api/conversaciones/${conv.id}/mensajes`, { texto: 'hola' }, cookie)).status, 202);
    const p = await esperarQue(recibidos, (e) => e.tipo === 'chat:permiso');
    const h1 = (await pedir(base, `/api/conversaciones/${conv.id}/historial`, { headers: { cookie } })).json();
    assert.equal(h1.permisos[0].solicitudId, 'r1');
    assert.equal(h1.conversacion.estado, 'esperando-permiso');
    assert.equal((await post(base, `/api/conversaciones/${conv.id}/permisos/${p.solicitudId}`, { decision: 'permitir' }, cookie)).status, 200);
    assert.equal((await post(base, `/api/conversaciones/${conv.id}/permisos/${p.solicitudId}`, { decision: 'permitir' }, cookie)).status, 404);
    await esperarQue(recibidos, (e) => e.tipo === 'chat:fin-turno');
    for (const t of ['chat:usuario', 'chat:texto-parcial', 'chat:mensaje', 'chat:permiso-resuelto']) assert.ok(recibidos.some((e) => e.tipo === t), t);
    const h2 = (await pedir(base, `/api/conversaciones/${conv.id}/historial`, { headers: { cookie } })).json();
    assert.equal(h2.conversacion.estado, 'lista');
    assert.equal(h2.aviso, 'No se encontró el transcript de esta conversación');
    assert.equal((await post(base, `/api/conversaciones/${conv.id}/modo`, { modo: 'auto' }, cookie)).json().modo, 'auto');
    assert.equal((await post(base, `/api/conversaciones/nada/mensajes`, { texto: 'x' }, cookie)).status, 404);
  } finally { sse?.destroy(); await srv.detener(); }
});

test('pasos de agente: sin transcript conocido existe:false; con agente-inicio en el log devuelve pasos', async () => {
  const { srv, base, env, home } = await levantar();
  try {
    const cookie = await login(base, srv.auth.token);
    assert.deepEqual((await pedir(base, '/api/pasos/s1/a1', { headers: { cookie } })).json(), { pasos: [], siguiente: 0, existe: false });
    assert.equal((await pedir(base, '/api/pasos/s1/..%2Fx', { headers: { cookie } })).status, 400);
    const ruta = join(home, 's1', 'subagents', 'agent-a1.jsonl');
    mkdirSync(join(home, 's1', 'subagents'), { recursive: true });
    writeFileSync(ruta, JSON.stringify({ type: 'user', message: { content: 'Haz X' } }) + '\n');
    appendFileSync(rutaEventos(env), JSON.stringify({ session: 's1', tipo: 'agente-inicio', id: 't1', agentId: 'a1', transcript: ruta }) + '\n');
    await new Promise((r) => setTimeout(r, 120));
    const r = (await pedir(base, '/api/pasos/s1/a1?desde=0', { headers: { cookie } })).json();
    assert.deepEqual(r.pasos.map((p) => p.tipo), ['encargo']);
    assert.ok(r.siguiente > 0);
  } finally { await srv.detener(); }
});

test('estáticos por lista: los de public/ se sirven con su tipo; módulos del servidor no', async () => {
  const { srv, base } = await levantar();
  try {
    assert.match((await pedir(base, '/')).headers['content-type'], /text\/html/);
    assert.match((await pedir(base, '/estado-vista.js')).headers['content-type'], /javascript/);
    assert.equal((await pedir(base, '/conversaciones.mjs')).status, 404);
    assert.equal((await pedir(base, '/../server.mjs')).status, 404);
  } finally { await srv.detener(); }
});

test('carpetasCon lista subcarpetas por prefijo e ignora rutas relativas', () => {
  const base = mkdtempSync(join(tmpdir(), 'orq-carp-'));
  for (const d of ['Proyecto A', 'proyecto-b', 'otra', '.oculta']) mkdirSync(join(base, d));
  writeFileSync(join(base, 'proyecto.txt'), '');
  assert.deepEqual(carpetasCon(join(base, 'proy')).sort(), [join(base, 'Proyecto A'), join(base, 'proyecto-b')].sort());
  assert.equal(carpetasCon(base + '/').length, 3);
  assert.deepEqual(carpetasCon('relativa/x'), []);
});

test('hostsEscucha: en modo remoto con una IP concreta también escucha en 127.0.0.1', () => {
  assert.deepEqual(hostsEscucha({ activo: false, escuchar: '100.64.0.7' }), ['127.0.0.1']);
  assert.deepEqual(hostsEscucha({ activo: true, escuchar: '100.64.0.7' }), ['100.64.0.7', '127.0.0.1']);
  assert.deepEqual(hostsEscucha({ activo: true, escuchar: '127.0.0.1' }), ['127.0.0.1']);
  assert.deepEqual(hostsEscucha({ activo: true, escuchar: 'localhost' }), ['localhost']);
  assert.deepEqual(hostsEscucha({ activo: true, escuchar: '0.0.0.0', hostsPermitidos: ['pc.ts.net'] }), ['0.0.0.0']);
  assert.throws(() => hostsEscucha({ activo: true, escuchar: '0.0.0.0' }), /hostsPermitidos/);
});

test('escucharTambien: un segundo listener atiende con el mismo handler y detener lo cierra', async () => {
  const { srv, base } = await levantar();
  const extra = await srv.escucharTambien(0, '127.0.0.1');
  const base2 = `http://127.0.0.1:${extra.address().port}`;
  try {
    assert.notEqual(base2, base);
    assert.equal((await pedir(base2, '/salud')).json().app, 'orquestador-dashboard');
    const cookie = await login(base2, srv.auth.token);
    assert.equal((await pedir(base2, '/api/conversaciones', { headers: { cookie } })).status, 200);
  } finally { await srv.detener(); }
  assert.equal(extra.listening, false);
});
