import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { crearGestor, etiquetaDe, clavePermiso, ErrorConversacion } from '../plugins/orquestador/dashboard/conversaciones.mjs';
import { rutaConversaciones } from '../plugins/orquestador/scripts/lib/rutas.mjs';
import { ESPERAR_USUARIO, ESPERAR_RESPUESTA, ESPERAR_PEDIDO, INIT, texto, permiso, fin, finInterrumpido, turnoSimple, cancelarPermiso } from './fixtures/guiones.mjs';

const FALSO = fileURLToPath(new URL('./fixtures/claude-falso.mjs', import.meta.url));

function entorno(guion, config = {}) {
  const home = mkdtempSync(join(tmpdir(), 'orq-conv-'));
  writeFileSync(join(home, 'config.json'), JSON.stringify({ rutaClaude: 'claude-falso', ...config }));
  const archivo = join(home, 'guion.json');
  writeFileSync(archivo, JSON.stringify(guion));
  const registro = join(home, 'registro.jsonl');
  const env = { ORQUESTADOR_HOME: home, FALSO_GUION: archivo, FALSO_REGISTRO: registro, PATH: process.env.PATH, SystemRoot: process.env.SystemRoot };
  const spawnFn = (_bin, args, opciones) => spawn(process.execPath, [FALSO, ...args], opciones);
  const leerRegistro = () => readFileSync(registro, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  return { home, env, spawnFn, leerRegistro };
}

function recolector(gestor) {
  const eventos = [];
  gestor.on((e) => eventos.push(e));
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
  return { eventos, hasta };
}

const lanza = (fn, status) => assert.throws(fn, (e) => e instanceof ErrorConversacion && e.status === status);

test('etiquetaDe y clavePermiso', () => {
  assert.equal(etiquetaDe({ rama: 'feat/bench-verificadores' }), '[FEAT]');
  assert.equal(etiquetaDe({ titulo: 'ci: windows en rojo', rama: 'main' }), '[CI]');
  assert.equal(etiquetaDe({ rama: 'main' }), null);
  assert.equal(clavePermiso('Bash', { command: 'ls -la' }), 'Bash:ls -la');
  assert.equal(clavePermiso('Edit', { file_path: 'a.js', old_string: 'x' }), 'Edit:a.js');
});

test('crear valida carpeta y modo, persiste y lista', () => {
  const { env, spawnFn, home } = entorno(turnoSimple());
  const g = crearGestor({ env, spawnFn });
  lanza(() => g.crear({ cwd: join(home, 'no-existe') }), 400);
  lanza(() => g.crear({ cwd: home, modo: 'raro' }), 400);
  const c = g.crear({ cwd: home, modo: 'auto' });
  assert.equal(c.titulo, 'Nueva conversación');
  assert.equal(c.estado, 'inactiva');
  assert.equal(JSON.parse(readFileSync(rutaConversaciones(env), 'utf8'))[0].id, c.id);
  assert.equal(g.listar()[0].id, c.id);
  lanza(() => g.obtener('nada'), 404);
});

test('enviar: título, sessionId, eventos de chat y estado lista', async () => {
  const { env, spawnFn, home } = entorno([ESPERAR_USUARIO, INIT, ...texto('m1', 'Ho', 'la'), fin()]);
  const g = crearGestor({ env, spawnFn });
  const { eventos, hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  lanza(() => g.enviar(c.id, '   '), 400);
  g.enviar(c.id, 'Arma los verificadores del benchmark');
  await hasta((e) => e.tipo === 'chat:fin-turno');
  const conv = g.obtener(c.id);
  assert.equal(conv.titulo, 'Arma los verificadores del benchmark');
  assert.equal(conv.sessionId, 'ses-1');
  assert.equal(conv.estado, 'lista');
  const tipos = eventos.filter((e) => e.conversacion === c.id).map((e) => e.tipo);
  for (const t of ['chat:usuario', 'chat:texto-parcial', 'chat:mensaje', 'chat:fin-turno', 'chat:estado']) assert.ok(tipos.includes(t), t);
  await g.apagar();
});

test('tope de conversaciones trabajando responde 409', async () => {
  const { env, spawnFn, home } = entorno([ESPERAR_USUARIO, INIT], { conversacionesMax: 1 });
  const g = crearGestor({ env, spawnFn });
  const a = g.crear({ cwd: home });
  const b = g.crear({ cwd: home });
  g.enviar(a.id, 'uno');
  assert.throws(() => g.enviar(b.id, 'dos'), (e) => e.status === 409 && /1 conversaciones trabajando/.test(e.message));
  await g.apagar();
});

test('permiso: pendiente, "siempre" auto-responde el siguiente igual, y responder dos veces da 404', async () => {
  const { env, spawnFn, home, leerRegistro } = entorno([ESPERAR_USUARIO, INIT, permiso('r1', 'ls'), ESPERAR_RESPUESTA, permiso('r2', 'ls'), ESPERAR_RESPUESTA, fin()]);
  const g = crearGestor({ env, spawnFn });
  const { eventos, hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  g.enviar(c.id, 'lista');
  await hasta((e) => e.tipo === 'chat:permiso' && e.solicitudId === 'r1');
  assert.equal(g.obtener(c.id).estado, 'esperando-permiso');
  assert.equal(g.pendientesDe(c.id)[0].solicitudId, 'r1');
  g.responderPermiso(c.id, 'r1', 'siempre');
  lanza(() => g.responderPermiso(c.id, 'r1', 'permitir'), 404); // otra pestaña responde lo mismo
  lanza(() => g.responderPermiso(c.id, 'r1', 'quizas'), 400);
  await hasta((e) => e.tipo === 'chat:fin-turno');
  assert.equal(eventos.filter((e) => e.tipo === 'chat:permiso').length, 1);
  const respuestas = leerRegistro().filter((r) => r.stdin?.type === 'control_response');
  assert.deepEqual(respuestas.map((r) => r.stdin.response.response.behavior), ['allow', 'allow']);
  await g.apagar();
});

test('salida con error durante el turno deja la conversación en error con el motivo', async () => {
  const { env, spawnFn, home } = entorno([ESPERAR_USUARIO, { salir: 1, stderr: 'Error: no hay sesión iniciada\n' }]);
  const g = crearGestor({ env, spawnFn });
  const { hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  g.enviar(c.id, 'x');
  const e = await hasta((x) => x.tipo === 'chat:estado' && x.conv.estado === 'error');
  assert.match(e.conv.error, /no hay sesión iniciada/);
  assert.equal(g.hayProcesos(), false);
});

test('interrumpir: el fin de turno no queda como error', async () => {
  const { env, spawnFn, home } = entorno([ESPERAR_USUARIO, INIT, ESPERAR_PEDIDO, finInterrumpido]);
  const g = crearGestor({ env, spawnFn });
  const { hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  g.enviar(c.id, 'x');
  await hasta((e) => e.tipo === 'chat:estado' && e.conv.sessionId === 'ses-1');
  g.interrumpir(c.id);
  const f = await hasta((e) => e.tipo === 'chat:fin-turno');
  assert.equal(f.interrumpido, true);
  assert.equal(g.obtener(c.id).estado, 'lista');
  await g.apagar();
});

test('cerrar mientras trabaja deja la conversación inactiva, no en error', async () => {
  const { env, spawnFn, home } = entorno([ESPERAR_USUARIO, INIT]);
  const g = crearGestor({ env, spawnFn });
  const { hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  g.enviar(c.id, 'x');
  await hasta((e) => e.tipo === 'chat:estado' && e.conv.sessionId === 'ses-1');
  g.cerrar(c.id);
  await hasta((e) => e.tipo === 'chat:estado' && e.conv.estado === 'inactiva' && e.conv.sessionId === 'ses-1');
  assert.equal(g.obtener(c.id).error, null);
});

test('al reiniciar, lo que trabajaba queda inactivo y el siguiente mensaje retoma con --resume', async () => {
  const { env, spawnFn, home, leerRegistro } = entorno(turnoSimple());
  mkdirSync(home, { recursive: true });
  writeFileSync(rutaConversaciones(env), JSON.stringify([{ id: 'c1', sessionId: 'ses-1', titulo: 'Previa', cwd: home, rama: null, modo: 'preguntar', creada: 'x', ultima: 'x', estado: 'trabajando', pid: 999999, error: null }]));
  const g = crearGestor({ env, spawnFn });
  const { hasta } = recolector(g);
  assert.deepEqual([g.obtener('c1').estado, g.obtener('c1').pid], ['inactiva', null]);
  g.enviar('c1', 'sigue');
  await hasta((e) => e.tipo === 'chat:fin-turno');
  const argv = leerRegistro()[0].argv;
  assert.equal(argv[argv.indexOf('--resume') + 1], 'ses-1');
  await g.apagar();
});

test('cambiarModo y renombrar validan y persisten', () => {
  const { env, spawnFn, home } = entorno(turnoSimple());
  const g = crearGestor({ env, spawnFn });
  const c = g.crear({ cwd: home });
  assert.equal(g.cambiarModo(c.id, 'auto').modo, 'auto');
  lanza(() => g.cambiarModo(c.id, 'yolo'), 400);
  assert.equal(g.renombrar(c.id, '  ci: arreglar  ').titulo, 'ci: arreglar');
  assert.equal(g.obtener(c.id).etiqueta, '[CI]');
  lanza(() => g.renombrar(c.id, ''), 400);
});

test('interrumpir sin turno en curso no deja marca: un error posterior sigue siendo error', async () => {
  const finError = { emitir: { type: 'result', subtype: 'error_during_execution', is_error: true, session_id: 'ses-1', result: 'Falló de verdad' } };
  const { env, spawnFn, home } = entorno([ESPERAR_USUARIO, INIT, ...texto('m1', 'a'), fin(), ESPERAR_USUARIO, finError]);
  const g = crearGestor({ env, spawnFn });
  const { eventos, hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  g.enviar(c.id, 'uno');
  await hasta((e) => e.tipo === 'chat:fin-turno');
  assert.equal(g.obtener(c.id).estado, 'lista');
  g.interrumpir(c.id); // sin turno en curso
  g.enviar(c.id, 'dos');
  await hasta(() => eventos.filter((x) => x.tipo === 'chat:fin-turno').length === 2);
  const conv = g.obtener(c.id);
  assert.equal(conv.estado, 'error');
  assert.match(conv.error, /Falló de verdad/);
  await g.apagar();
});

test('interrumpir con permiso pendiente: al terminar el turno no quedan pendientes y responder da 404', async () => {
  const { env, spawnFn, home } = entorno([ESPERAR_USUARIO, INIT, permiso('r1', 'ls'), ESPERAR_PEDIDO, finInterrumpido]);
  const g = crearGestor({ env, spawnFn });
  const { hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  g.enviar(c.id, 'x');
  await hasta((e) => e.tipo === 'chat:permiso');
  g.interrumpir(c.id);
  await hasta((e) => e.tipo === 'chat:fin-turno');
  assert.deepEqual(g.pendientesDe(c.id), []);
  lanza(() => g.responderPermiso(c.id, 'r1', 'permitir'), 404);
  await g.apagar();
});

test('etiquetaDe: solo tipos de Conventional Commits, en título o en rama', () => {
  assert.equal(etiquetaDe({ titulo: 'feat(api)!: algo' }), '[FEAT]');
  assert.equal(etiquetaDe({ titulo: 'Ojo: x' }), null);
  assert.equal(etiquetaDe({ titulo: 'https://x' }), null);
  assert.equal(etiquetaDe({ rama: 'dependabot/x' }), null);
  assert.equal(etiquetaDe({ titulo: 'Ojo: x', rama: 'fix/login' }), '[FIX]');
  assert.equal(etiquetaDe({ rama: 'revert/x' }), '[REVERT]');
});

test('inactividad: un proceso en "lista" se cierra solo y la conversación queda inactiva sin error', async () => {
  const { env, spawnFn, home } = entorno(turnoSimple());
  const g = crearGestor({ env, spawnFn, inactividadProcesoMs: 150 });
  const { hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  g.enviar(c.id, 'x');
  await hasta((e) => e.tipo === 'chat:fin-turno');
  assert.equal(g.hayProcesos(), true);
  await hasta((e) => e.tipo === 'chat:estado' && e.conv.estado === 'inactiva' && e.conv.sessionId === 'ses-1');
  assert.deepEqual([g.hayProcesos(), g.obtener(c.id).error], [false, null]);
});

test('inactividad: no cierra un proceso que volvió a trabajar después de armar el temporizador', async () => {
  const { env, spawnFn, home } = entorno([ESPERAR_USUARIO, INIT, ...texto('m1', 'a'), fin(), ESPERAR_USUARIO, INIT]);
  const g = crearGestor({ env, spawnFn, inactividadProcesoMs: 150 });
  const { hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  g.enviar(c.id, 'uno');
  await hasta((e) => e.tipo === 'chat:fin-turno'); // aquí se arma el temporizador de inactividad
  g.enviar(c.id, 'dos');
  await new Promise((r) => setTimeout(r, 400));
  assert.deepEqual([g.hayProcesos(), g.obtener(c.id).estado], [true, 'trabajando']);
  await g.apagar();
});

test('interrumpir sin result: tras la espera se cierra el proceso, queda inactiva y el siguiente mensaje retoma con --resume', async () => {
  const { env, spawnFn, home, leerRegistro } = entorno([ESPERAR_USUARIO, INIT, ESPERAR_PEDIDO]);
  const g = crearGestor({ env, spawnFn, esperaInterrupcionMs: 100 });
  const { hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  g.enviar(c.id, 'x');
  await hasta((e) => e.tipo === 'chat:estado' && e.conv.sessionId === 'ses-1');
  g.interrumpir(c.id);
  const f = await hasta((e) => e.tipo === 'chat:fin-turno');
  assert.equal(f.interrumpido, true);
  await hasta((e) => e.tipo === 'chat:estado' && e.conv.estado === 'inactiva' && e.conv.sessionId === 'ses-1');
  assert.deepEqual([g.hayProcesos(), g.obtener(c.id).error], [false, null]);
  g.enviar(c.id, 'sigue');
  await new Promise((ok, mal) => {
    const t0 = Date.now();
    const mirar = () => {
      const arranques = leerRegistro().filter((r) => r.argv);
      if (arranques.length === 2) { const a = arranques[1].argv; return a[a.indexOf('--resume') + 1] === 'ses-1' ? ok() : mal(new Error('sin --resume')); }
      if (Date.now() - t0 > 5000) return mal(new Error('timeout'));
      setTimeout(mirar, 10);
    };
    mirar();
  });
  await g.apagar();
});

test('interrumpir con result a tiempo: no se cierra el proceso', async () => {
  const { env, spawnFn, home } = entorno([ESPERAR_USUARIO, INIT, ESPERAR_PEDIDO, finInterrumpido]);
  const g = crearGestor({ env, spawnFn, esperaInterrupcionMs: 150 });
  const { hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  g.enviar(c.id, 'x');
  await hasta((e) => e.tipo === 'chat:estado' && e.conv.sessionId === 'ses-1');
  g.interrumpir(c.id);
  await hasta((e) => e.tipo === 'chat:fin-turno');
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual([g.hayProcesos(), g.obtener(c.id).estado], [true, 'lista']);
  await g.apagar();
});

test('control_cancel_request: quita el pendiente y emite permiso-resuelto "cancelado"', async () => {
  const { env, spawnFn, home } = entorno([ESPERAR_USUARIO, INIT, permiso('r1', 'ls'), cancelarPermiso('r1')]);
  const g = crearGestor({ env, spawnFn });
  const { hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  g.enviar(c.id, 'x');
  const r = await hasta((e) => e.tipo === 'chat:permiso-resuelto');
  assert.deepEqual([r.solicitudId, r.decision, r.herramienta], ['r1', 'cancelado', 'Bash']);
  assert.deepEqual(g.pendientesDe(c.id), []);
  assert.equal(g.obtener(c.id).estado, 'trabajando');
  lanza(() => g.responderPermiso(c.id, 'r1', 'permitir'), 404);
  await g.apagar();
});

test('guardar: un error de disco no lanza; se informa por console.error', () => {
  const { env, spawnFn, home } = entorno(turnoSimple());
  mkdirSync(rutaConversaciones(env), { recursive: true }); // el destino es un directorio: renameSync falla
  const errores = [];
  const original = console.error;
  console.error = (...a) => errores.push(a.join(' '));
  try {
    const g = crearGestor({ env, spawnFn });
    const c = g.crear({ cwd: home });
    assert.equal(g.obtener(c.id).id, c.id);
  } finally { console.error = original; }
  assert.ok(errores.some((x) => /conversaciones/.test(x)), errores.join('\n'));
});
