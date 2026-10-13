import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { abrirProceso, argumentos, resolverBinario, crearNormalizador, invocacion, MODOS } from '../plugins/orquestador/dashboard/proceso-claude.mjs';
import { ESPERAR_USUARIO, ESPERAR_RESPUESTA, ESPERAR_PEDIDO, INIT, texto, permiso, fin, turnoSimple } from './fixtures/guiones.mjs';

const FALSO = fileURLToPath(new URL('./fixtures/claude-falso.mjs', import.meta.url));

function arrancar(guion, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'orq-proc-'));
  const archivoGuion = join(dir, 'guion.json');
  writeFileSync(archivoGuion, JSON.stringify(guion));
  const registro = join(dir, 'registro.jsonl');
  const p = abrirProceso({
    cwd: extra.cwd ?? dir, modo: extra.modo ?? 'preguntar', sessionId: extra.sessionId ?? null, binario: 'claude-falso',
    env: { ...process.env, CLAUDECODE: '1', FALSO_GUION: archivoGuion, FALSO_REGISTRO: registro },
    spawnFn: (_bin, args, opciones) => spawn(process.execPath, [FALSO, ...args], opciones),
  });
  const eventos = [];
  const basura = [];
  p.on('evento', (e) => eventos.push(e));
  p.on('basura', (l) => basura.push(l));
  const hasta = (pred, ms = 5000) => new Promise((ok, mal) => {
    const t0 = Date.now();
    const mirar = () => {
      const e = eventos.find(pred);
      if (e) return ok(e);
      if (Date.now() - t0 > ms) return mal(new Error(`timeout; eventos: ${eventos.map((x) => x.tipo).join(',')}`));
      setTimeout(mirar, 10);
    };
    mirar();
  });
  const leerRegistro = () => readFileSync(registro, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  return { p, eventos, basura, hasta, leerRegistro, dir };
}

test('argumentos: stream-json, permisos por host, modo y resume', () => {
  const a = argumentos({ modo: 'auto' });
  for (const x of ['-p', '--input-format', 'stream-json', '--output-format', '--verbose', '--include-partial-messages', '--permission-prompts', 'host']) assert.ok(a.includes(x), x);
  assert.equal(a[a.indexOf('--permission-mode') + 1], 'auto');
  assert.equal(argumentos({ modo: 'preguntar' })[argumentos({ modo: 'preguntar' }).indexOf('--permission-mode') + 1], 'manual');
  assert.ok(!a.includes('--resume'));
  const r = argumentos({ modo: 'ediciones', sessionId: 'ses-1' });
  assert.equal(r[r.indexOf('--resume') + 1], 'ses-1');
  assert.deepEqual(MODOS, { preguntar: 'manual', ediciones: 'acceptEdits', auto: 'auto' });
});

test('resolverBinario: config manda; busca en PATH (Windows con Path y .exe); null si no hay', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orq-bin-'));
  writeFileSync(join(dir, 'claude.exe'), '');
  assert.equal(resolverBinario({ rutaClaude: 'C:/x/claude.exe' }, {}, 'win32'), 'C:/x/claude.exe');
  assert.equal(resolverBinario({}, { Path: `C:\\nada;${dir}` }, 'win32'), join(dir, 'claude.exe'));
  assert.equal(resolverBinario({}, { PATH: '/no/existe' }, 'linux'), null);
});

test('normalizador: ignora mensajes de subagentes y tipos desconocidos', () => {
  const n = crearNormalizador();
  assert.deepEqual(n({ type: 'assistant', parent_tool_use_id: 'toolu_x', message: { id: 'm', content: [{ type: 'text', text: 'sub' }] } }), []);
  assert.deepEqual(n({ type: 'rate_limit_event' }), []);
  assert.deepEqual(n(null), []);
});

test('normalizador: el filtro de subagentes solo aplica a stream_event, assistant y user', () => {
  const n = crearNormalizador();
  const sub = { parent_tool_use_id: 'toolu_x' };
  assert.deepEqual(n({ ...sub, type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'x' } } }), []);
  assert.deepEqual(n({ ...sub, type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }] } }), []);
  assert.deepEqual(n({ ...sub, type: 'control_request', request_id: 'r1', request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'ls' } } }),
    [{ tipo: 'permiso', solicitudId: 'r1', herramienta: 'Bash', entrada: { command: 'ls' }, motivo: null }]);
  assert.equal(n({ ...sub, type: 'result', subtype: 'success', is_error: false })[0].tipo, 'fin-turno');
});

test('normalizador: control_cancel_request es permiso-cancelado', () => {
  const n = crearNormalizador();
  assert.deepEqual(n({ type: 'control_cancel_request', request_id: 'r7' }), [{ tipo: 'permiso-cancelado', solicitudId: 'r7' }]);
});

test('invocacion: un .cmd va por shell y se cita si tiene espacios; un .exe no', () => {
  assert.deepEqual(invocacion('C:\\Program Files\\nodejs\\claude.cmd', ['-p']), { comando: '"C:\\Program Files\\nodejs\\claude.cmd"', args: ['-p'], shell: true });
  assert.deepEqual(invocacion('C:\\npm\\claude.cmd', ['-p']), { comando: 'C:\\npm\\claude.cmd', args: ['-p'], shell: true });
  assert.deepEqual(invocacion('"C:\\Program Files\\claude.cmd"', ['-p']).comando, '"C:\\Program Files\\claude.cmd"');
  assert.deepEqual(invocacion('C:\\Program Files\\claude.exe', ['-p']), { comando: 'C:\\Program Files\\claude.exe', args: ['-p'], shell: false });
});

test('turno simple: sesión, texto parcial, mensaje y fin; canal dashboard y sin CLAUDECODE', async () => {
  const { p, eventos, hasta, leerRegistro } = arrancar([ESPERAR_USUARIO, INIT, ...texto('m1', 'Ho', 'la'), fin()]);
  p.enviar('hola');
  await hasta((e) => e.tipo === 'fin-turno');
  assert.deepEqual(eventos.filter((e) => e.tipo === 'texto-parcial').map((e) => [e.mensajeId, e.delta]), [['m1', 'Ho'], ['m1', 'la']]);
  assert.deepEqual(eventos.find((e) => e.tipo === 'sesion'), { tipo: 'sesion', sessionId: 'ses-1', modelo: 'claude-opus-5-5' });
  assert.deepEqual(eventos.find((e) => e.tipo === 'mensaje').bloques, [{ tipo: 'texto', texto: 'Hola' }]);
  assert.deepEqual(eventos.find((e) => e.tipo === 'fin-turno'), { tipo: 'fin-turno', ok: true, costoUSD: 0.01, duracionMs: 900, error: null, sessionId: 'ses-1' });
  const [arranque] = leerRegistro();
  assert.equal(arranque.canal, 'dashboard');
  assert.equal(arranque.claudecode, null);
  p.cerrar();
  await hasta((e) => e.tipo === 'salida');
});

test('el texto del usuario llega intacto (acentos, emojis, saltos, comillas y barras)', async () => {
  const { p, hasta, leerRegistro } = arrancar(turnoSimple());
  const t = 'Revisa "ñandú" 🚀\nlínea 2 \\ fin';
  p.enviar(t);
  await hasta((e) => e.tipo === 'fin-turno');
  assert.equal(leerRegistro().find((r) => r.stdin?.type === 'user').stdin.message.content, t);
  p.cerrar();
  await hasta((e) => e.tipo === 'salida');
});

test('corre en una carpeta con espacios y acentos', async () => {
  const base = mkdtempSync(join(tmpdir(), 'orq-cwd-'));
  const cwd = join(base, 'Mi Carpeta ñ');
  mkdirSync(cwd);
  const { p, hasta, leerRegistro } = arrancar(turnoSimple(), { cwd });
  p.enviar('x');
  await hasta((e) => e.tipo === 'fin-turno');
  assert.equal(leerRegistro()[0].cwd, cwd);
  p.cerrar();
  await hasta((e) => e.tipo === 'salida');
});

test('permiso: llega al host y la respuesta lleva la entrada original o el motivo de denegación', async () => {
  const { p, hasta, leerRegistro } = arrancar([ESPERAR_USUARIO, INIT, permiso('r1', 'ls'), ESPERAR_RESPUESTA, permiso('r2', 'rm x'), ESPERAR_RESPUESTA, fin()]);
  p.enviar('lista');
  const e1 = await hasta((e) => e.tipo === 'permiso' && e.solicitudId === 'r1');
  assert.deepEqual([e1.herramienta, e1.entrada], ['Bash', { command: 'ls' }]);
  p.responderPermiso('r1', { permitir: true });
  await hasta((e) => e.tipo === 'permiso' && e.solicitudId === 'r2');
  p.responderPermiso('r2', { permitir: false });
  await hasta((e) => e.tipo === 'fin-turno');
  const resp = leerRegistro().filter((r) => r.stdin?.type === 'control_response').map((r) => r.stdin.response);
  assert.deepEqual(resp[0], { subtype: 'success', request_id: 'r1', response: { behavior: 'allow', updatedInput: { command: 'ls' } } });
  assert.equal(resp[1].response.behavior, 'deny');
  assert.match(resp[1].response.message, /denegó/);
  p.cerrar();
  await hasta((e) => e.tipo === 'salida');
});

test('interrumpir y cambiarModo envían control_request', async () => {
  const { p, hasta, leerRegistro } = arrancar([ESPERAR_USUARIO, INIT, ESPERAR_PEDIDO, ESPERAR_PEDIDO, fin()]);
  p.enviar('x');
  await hasta((e) => e.tipo === 'sesion');
  p.cambiarModo('auto');
  p.interrumpir();
  await hasta((e) => e.tipo === 'fin-turno');
  const pedidos = leerRegistro().filter((r) => r.stdin?.type === 'control_request').map((r) => r.stdin.request);
  assert.deepEqual(pedidos, [{ subtype: 'set_permission_mode', mode: 'auto' }, { subtype: 'interrupt' }]);
  p.cerrar();
  await hasta((e) => e.tipo === 'salida');
});

test('líneas basura se descartan; salida con error informa la última línea de stderr', async () => {
  const { p, basura, hasta } = arrancar([ESPERAR_USUARIO, { crudo: 'esto no es json' }, { salir: 1, stderr: 'algo\nError: no hay sesión iniciada\n' }]);
  p.enviar('x');
  const s = await hasta((e) => e.tipo === 'salida');
  assert.equal(s.codigo, 1);
  assert.match(s.error, /no hay sesión iniciada/);
  assert.deepEqual(basura, ['esto no es json']);
});

test('binario inexistente produce una sola salida con error', async () => {
  const p = abrirProceso({ cwd: tmpdir(), modo: 'preguntar', binario: join(tmpdir(), 'no-existe-claude'), env: process.env });
  const salidas = [];
  p.on('evento', (e) => { if (e.tipo === 'salida') salidas.push(e); });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(salidas.length, 1);
  assert.match(salidas[0].error, /No se pudo ejecutar Claude Code/);
});
