import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { crearGestor, leerLista } from '../plugins/orquestador/dashboard/conversaciones.mjs';
import { abrirProceso, crearNormalizador } from '../plugins/orquestador/dashboard/proceso-claude.mjs';
import { rutaConversaciones } from '../plugins/orquestador/scripts/lib/rutas.mjs';
import { estadoVacio, guardarEstado, leerEstado } from '../plugins/orquestador/scripts/lib/estado.mjs';
import { leerEventos } from '../plugins/orquestador/scripts/lib/eventos.mjs';
import { ESPERAR_USUARIO, ESPERAR_RESPUESTA, ESPERAR_PEDIDO, INIT, texto, permiso, fin, finInterrumpido, turnoSimple, denegado } from './fixtures/guiones.mjs';

const FALSO = fileURLToPath(new URL('./fixtures/claude-falso.mjs', import.meta.url));
const hayGit = (() => { try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

function entorno(guion, config = {}) {
  const home = mkdtempSync(join(tmpdir(), 'orq-conv2-'));
  writeFileSync(join(home, 'config.json'), JSON.stringify({ rutaClaude: 'claude-falso', ...config }));
  writeFileSync(join(home, 'guion.json'), JSON.stringify(guion));
  const registro = join(home, 'registro.jsonl');
  const env = { ORQUESTADOR_HOME: home, FALSO_GUION: join(home, 'guion.json'), FALSO_REGISTRO: registro, PATH: process.env.PATH, SystemRoot: process.env.SystemRoot };
  const spawnFn = (_bin, args, opciones) => spawn(process.execPath, [FALSO, ...args], opciones);
  const leerRegistro = () => readFileSync(registro, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  return { home, env, spawnFn, leerRegistro };
}

function esperador(eventos) {
  return (pred, ms = 5000) => new Promise((ok, mal) => {
    const t0 = Date.now();
    const mirar = () => {
      const e = typeof pred === 'function' && pred.length === 0 ? (pred() || null) : eventos.find(pred);
      if (e) return ok(e);
      if (Date.now() - t0 > ms) return mal(new Error(`timeout; eventos: ${eventos.map((x) => x.tipo).join(',')}`));
      setTimeout(mirar, 10);
    };
    mirar();
  });
}
function recolector(g) {
  const eventos = [];
  g.on((e) => eventos.push(e));
  return { eventos, hasta: esperador(eventos) };
}
function proceso(guion) {
  const { env, spawnFn, home, leerRegistro } = entorno(guion);
  const p = abrirProceso({ cwd: home, modo: 'preguntar', binario: 'claude-falso', env: { ...process.env, ...env }, spawnFn });
  const eventos = [];
  p.on('evento', (e) => eventos.push(e));
  return { p, eventos, hasta: esperador(eventos), leerRegistro };
}

test('normalizador: permission_denied con nombres alternativos y result con queued_turn_count', () => {
  const n = crearNormalizador();
  assert.deepEqual(n({ type: 'system', subtype: 'permission_denied', tool_name: 'Bash', tool_input: { command: 'rm -rf x' }, reason: 'Destructivo' }),
    [{ tipo: 'denegado', herramienta: 'Bash', entrada: { command: 'rm -rf x' }, motivo: 'Destructivo' }]);
  assert.deepEqual(n({ type: 'system', subtype: 'permission_denied', tool: 'Write', input: { file_path: 'a' }, message: 'No' }),
    [{ tipo: 'denegado', herramienta: 'Write', entrada: { file_path: 'a' }, motivo: 'No' }]);
  assert.equal(n({ type: 'system', subtype: 'permission_denied', decision_reason: 'Regla' })[0].motivo, 'Regla');
  assert.equal(n({ type: 'result', subtype: 'success', queued_turn_count: 2 })[0].encolados, 2);
  assert.equal(n({ type: 'result', subtype: 'success' })[0].encolados, 0);
});

test('proceso: responderPermiso con un id desconocido o ya respondido no envía nada', async (t) => {
  const { p, hasta, leerRegistro } = proceso([ESPERAR_USUARIO, INIT, permiso('r1', 'ls'), ESPERAR_RESPUESTA, fin()]);
  t.after(() => p.cerrar());
  p.enviar('x');
  await hasta((e) => e.tipo === 'permiso');
  assert.equal(p.responderPermiso('inventado', { permitir: true }), false);
  assert.equal(p.responderPermiso('r1', { permitir: true }), true);
  assert.equal(p.responderPermiso('r1', { permitir: true }), false);
  await hasta((e) => e.tipo === 'fin-turno');
  assert.deepEqual(leerRegistro().filter((r) => r.stdin?.type === 'control_response').map((r) => r.stdin.response.request_id), ['r1']);
  p.cerrar();
  await hasta((e) => e.tipo === 'salida');
});

test('proceso: la última línea sin salto final se procesa al cerrar', async (t) => {
  const { p, hasta } = proceso([ESPERAR_USUARIO, INIT, { emitirSinSalto: fin().emitir }, { salir: 0 }]);
  t.after(() => p.cerrar());
  p.enviar('x');
  await hasta((e) => e.tipo === 'salida');
  await hasta((e) => e.tipo === 'fin-turno', 200);
});

test('costo: total_cost_usd es acumulado por proceso y, al terminar el proceso, se suma al de la conversación', async (t) => {
  const { env, spawnFn, home } = entorno([ESPERAR_USUARIO, INIT, fin({ total_cost_usd: 0.00336 }), ESPERAR_USUARIO, INIT, fin({ total_cost_usd: 0.0037 })]);
  const g = crearGestor({ env, spawnFn });
  t.after(() => g.apagar());
  const { eventos, hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  const fines = () => eventos.filter((e) => e.tipo === 'chat:fin-turno');
  g.enviar(c.id, 'uno');
  await hasta(() => fines().length === 1);
  assert.equal(g.obtener(c.id).costoUSD, 0.00336);
  g.enviar(c.id, 'dos');
  await hasta(() => fines().length === 2);
  assert.equal(g.obtener(c.id).costoUSD, 0.0037); // no 0.00706: el segundo result ya incluye el primero
  assert.equal(fines()[1].costoTotalUSD, 0.0037);
  g.cerrar(c.id);
  await hasta((e) => e.tipo === 'chat:estado' && e.conv.estado === 'inactiva' && e.conv.costoUSD === 0.0037);
  g.enviar(c.id, 'tres'); // proceso nuevo: su primer result (0.00336) se suma a lo anterior
  await hasta(() => fines().length === 3);
  assert.ok(Math.abs(g.obtener(c.id).costoUSD - 0.00706) < 1e-12);
  await g.apagar();
  assert.ok(Math.abs(crearGestor({ env, spawnFn }).obtener(c.id).costoUSD - 0.00706) < 1e-12);
});

test('encolados: un result con queued_turn_count > 0 deja la conversación trabajando', async (t) => {
  const { env, spawnFn, home } = entorno([ESPERAR_USUARIO, INIT, fin({ queued_turn_count: 1 }), fin()]);
  const g = crearGestor({ env, spawnFn });
  t.after(() => g.apagar());
  const { eventos, hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  g.enviar(c.id, 'x');
  await hasta(() => eventos.filter((e) => e.tipo === 'chat:fin-turno').length === 2);
  const i = eventos.findIndex((e) => e.tipo === 'chat:fin-turno');
  assert.equal(eventos[i].encolados, 1);
  assert.equal(eventos.slice(i).find((e) => e.tipo === 'chat:estado').conv.estado, 'trabajando');
  assert.equal(g.obtener(c.id).estado, 'lista');
  await g.apagar();
});

test('denegado: emite chat:denegado y queda disponible en denegadosDe', async (t) => {
  const { env, spawnFn, home } = entorno([ESPERAR_USUARIO, INIT, denegado('Bash', 'git push --force', 'Git destructivo'), fin()]);
  const g = crearGestor({ env, spawnFn });
  t.after(() => g.apagar());
  const { hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  g.enviar(c.id, 'x');
  const d = await hasta((e) => e.tipo === 'chat:denegado');
  assert.deepEqual([d.herramienta, d.entrada, d.motivo], ['Bash', { command: 'git push --force' }, 'Git destructivo']);
  assert.equal(g.denegadosDe(c.id)[0].id, d.id);
  await g.apagar();
});

test('modelo del orquestador: se guarda desde el evento sesion', async (t) => {
  const { env, spawnFn, home } = entorno(turnoSimple());
  const g = crearGestor({ env, spawnFn });
  t.after(() => g.apagar());
  const { hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  g.enviar(c.id, 'x');
  await hasta((e) => e.tipo === 'chat:fin-turno');
  assert.equal(g.obtener(c.id).modelo, 'claude-opus-5-5');
  await g.apagar();
});

test('enviar mientras el proceso se cierra: espera la salida y abre uno nuevo con --resume', async (t) => {
  const { env, spawnFn, home, leerRegistro } = entorno(turnoSimple());
  const g = crearGestor({ env, spawnFn });
  t.after(() => g.apagar());
  const { eventos, hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  g.enviar(c.id, 'uno');
  await hasta((e) => e.tipo === 'chat:fin-turno');
  g.cerrar(c.id);
  g.enviar(c.id, 'dos');
  await hasta(() => eventos.filter((e) => e.tipo === 'chat:fin-turno').length === 2);
  const arranques = leerRegistro().filter((r) => r.argv);
  assert.equal(arranques.length, 2);
  assert.equal(arranques[1].argv[arranques[1].argv.indexOf('--resume') + 1], 'ses-1');
  assert.deepEqual(leerRegistro().filter((r) => r.stdin?.type === 'user').map((r) => r.stdin.message.content), ['uno', 'dos']);
  await g.apagar();
});

test('un fin-turno que llega mientras el proceso se cierra se ignora', async (t) => {
  const { env, spawnFn, home } = entorno([ESPERAR_USUARIO, INIT, ESPERAR_PEDIDO, finInterrumpido]);
  const g = crearGestor({ env, spawnFn });
  t.after(() => g.apagar());
  const { eventos, hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  g.enviar(c.id, 'x');
  await hasta((e) => e.tipo === 'chat:estado' && e.conv.sessionId === 'ses-1');
  await g.apagar(); // interrumpe y cierra: el result del interrupt llega con el cierre en curso
  assert.equal(eventos.filter((e) => e.tipo === 'chat:fin-turno').length, 0);
  assert.equal(g.obtener(c.id).estado, 'inactiva');
});

test('conversaciones.json dañado: se respalda en .corrupto y se empieza de cero', () => {
  const { env, spawnFn } = entorno(turnoSimple());
  writeFileSync(rutaConversaciones(env), '{no es json');
  const errores = [];
  const original = console.error;
  console.error = (...a) => errores.push(a.join(' '));
  try {
    assert.deepEqual(crearGestor({ env, spawnFn }).listar(), []);
  } finally { console.error = original; }
  assert.equal(readFileSync(`${rutaConversaciones(env)}.corrupto`, 'utf8'), '{no es json');
  assert.ok(errores.some((x) => /corrupto/.test(x)), errores.join('\n'));
});

test('crear sin modo usa modoPermisoDefecto de la config', () => {
  const { env, spawnFn, home } = entorno(turnoSimple(), { modoPermisoDefecto: 'auto' });
  assert.equal(crearGestor({ env, spawnFn }).crear({ cwd: home }).modo, 'auto');
});

test('rama: se calcula en segundo plano al crear y se refresca al pedirla', { skip: !hayGit && 'git no está instalado' }, async (t) => {
  const { env, spawnFn, home } = entorno(turnoSimple());
  execFileSync('git', ['init', '-q', home]);
  execFileSync('git', ['-C', home, 'checkout', '-q', '-b', 'feat/prueba']);
  const g = crearGestor({ env, spawnFn });
  t.after(() => g.apagar());
  const { hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  assert.equal(c.rama, null);
  const e = await hasta((x) => x.tipo === 'chat:estado' && x.conv.rama === 'feat/prueba');
  assert.equal(e.conv.etiqueta, '[FEAT]');
  execFileSync('git', ['-C', home, 'checkout', '-q', '-b', 'fix/otra']);
  assert.equal((await g.refrescarRama(c.id)).rama, 'fix/otra');
});

test('on devuelve una función que quita el oyente', async (t) => {
  const { env, spawnFn, home } = entorno(turnoSimple());
  const g = crearGestor({ env, spawnFn });
  t.after(() => g.apagar());
  let n = 0;
  const quitar = g.on(() => { n += 1; });
  g.crear({ cwd: home });
  const antes = n;
  quitar();
  g.crear({ cwd: home });
  assert.ok(antes > 0);
  assert.equal(n, antes);
});

const esperarMs = (ms) => new Promise((r) => setTimeout(r, ms));

test('cerrar, enviar y apagar: el mensaje que esperaba no abre un proceso nuevo', async (t) => {
  const { env, spawnFn, home, leerRegistro } = entorno(turnoSimple());
  const g = crearGestor({ env, spawnFn });
  t.after(() => g.apagar());
  const { hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  g.enviar(c.id, 'uno');
  await hasta((e) => e.tipo === 'chat:fin-turno');
  g.cerrar(c.id);
  g.enviar(c.id, 'dos'); // queda esperando la salida
  await g.apagar();
  await esperarMs(300);
  assert.equal(leerRegistro().filter((r) => r.argv).length, 1);
  assert.equal(g.hayProcesos(), false);
  assert.equal(g.obtener(c.id).estado, 'inactiva');
});

test('cerrar, enviar e interrumpir: Detener descarta el mensaje que esperaba', async (t) => {
  const { env, spawnFn, home, leerRegistro } = entorno(turnoSimple());
  const g = crearGestor({ env, spawnFn });
  t.after(() => g.apagar());
  const { hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  g.enviar(c.id, 'uno');
  await hasta((e) => e.tipo === 'chat:fin-turno');
  g.cerrar(c.id);
  g.enviar(c.id, 'dos');
  g.interrumpir(c.id);
  await hasta((e) => e.tipo === 'chat:estado' && e.conv.estado === 'inactiva' && e.conv.pid === null);
  await esperarMs(300);
  assert.equal(leerRegistro().filter((r) => r.argv).length, 1);
  assert.equal(g.hayProcesos(), false);
  assert.equal(g.obtener(c.id).estado, 'inactiva');
});

test('conversaciones.json bloqueado (EBUSY/EPERM/EACCES): se reintenta y, si sigue, se lanza sin respaldarlo ni pisarlo', () => {
  const { env } = entorno(turnoSimple());
  const ruta = rutaConversaciones(env);
  writeFileSync(ruta, '[{"id":"c1"}]');
  for (const codigo of ['EBUSY', 'EPERM', 'EACCES']) {
    let llamadas = 0;
    const bloqueado = () => { llamadas++; return { existe: true, datos: null, error: `No se pudo leer ${ruta}: ${codigo}`, codigo }; };
    assert.throws(() => leerLista(env, { leer: bloqueado, intentos: 3, esperaMs: 1 }), (e) => new RegExp(codigo).test(e.message) && /no se sobrescribe/.test(e.message), codigo);
    assert.equal(llamadas, 3, `${codigo}: reintenta`);
  }
  assert.equal(existsSync(`${ruta}.corrupto`), false);
  assert.equal(readFileSync(ruta, 'utf8'), '[{"id":"c1"}]');
  // Un bloqueo breve se supera con el reintento.
  let n = 0;
  const breve = (r) => (++n < 2 ? { existe: true, datos: null, error: 'ocupado', codigo: 'EBUSY' } : { existe: true, datos: JSON.parse(readFileSync(r, 'utf8')), error: null });
  assert.deepEqual(leerLista(env, { leer: breve, intentos: 3, esperaMs: 1 }), [{ id: 'c1' }]);
});

test('leerJsonUsuario informa el código de un error de lectura', async () => {
  const { leerJsonUsuario } = await import('../plugins/orquestador/scripts/lib/archivos.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'orq-codigo-'));
  const r = leerJsonUsuario(dir); // un directorio: la lectura falla por E/S, no por JSON
  assert.equal(r.existe, true);
  assert.equal(typeof r.codigo, 'string');
});

test('al cerrarse el proceso, sus agentes en segundo plano quedan detenidos y liberan el cupo', async (t) => {
  const { env, spawnFn } = entorno(turnoSimple());
  const g = crearGestor({ env, spawnFn });
  t.after(() => g.apagar());
  const { hasta } = recolector(g);
  const c = g.crear({ cwd: env.ORQUESTADOR_HOME });
  g.enviar(c.id, 'hola');
  await hasta((e) => e.tipo === 'chat:fin-turno');
  const est = estadoVacio('ses-1');
  est.activas = { t1: { agente: 'investigador', inicio: Date.now(), agentId: 'a1' } };
  guardarEstado(est, env);
  g.cerrar(c.id);
  await hasta((e) => e.tipo === 'chat:estado' && e.conv.estado === 'inactiva');
  await hasta(() => !Object.keys(leerEstado('ses-1', env).activas).length);
  const fin = leerEventos({ session: 'ses-1' }, env).find((e) => e.tipo === 'fin');
  assert.equal(fin.detenido, true);
  assert.equal(fin.motivo, 'proceso-cerrado');
});
