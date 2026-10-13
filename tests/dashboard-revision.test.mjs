// Regresiones de la revisión final de la Fase 2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from 'node:net';
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';
import { vistaVacia, reducir, disposicion, conciliarConServidor } from '../plugins/orquestador/dashboard/public/estado-vista.js';
import { crearSeguidor } from '../plugins/orquestador/dashboard/datos.mjs';
import { crearServidor } from '../plugins/orquestador/dashboard/server.mjs';
import { necesitaReinicio } from '../plugins/orquestador/dashboard/lanzar.mjs';
import { rutaEventos } from '../plugins/orquestador/scripts/lib/rutas.mjs';

const ts = (s) => new Date(Date.UTC(2026, 9, 12, 10, 0, s)).toISOString();
const sesionCon = (activos, terminados) => {
  const v = vistaVacia();
  let i = 0;
  for (; i < terminados; i++) {
    reducir(v, { session: 's', tipo: 'delegacion', id: `t${i}`, agente: 'a', modelo: 'haiku', ts: ts(i) });
    reducir(v, { session: 's', tipo: 'fin', id: `t${i}`, ts: ts(i) });
  }
  for (let k = 0; k < activos; k++, i++) reducir(v, { session: 's', tipo: 'delegacion', id: `t${i}`, agente: 'a', modelo: 'opus', ts: ts(i) });
  return v.sesiones.s;
};

// I1: geometría — tarjetas activas 172x110 px, fichas de historial 140x40 px.
const TAM = { activo: [172, 110], compacto: [140, 40] };
function solapamientos(lista, W, H) {
  const rect = (p) => { const [w, h] = TAM[p.compacto ? 'compacto' : 'activo']; return { x: p.x * W, y: p.y * H, w, h }; };
  const malos = [];
  for (let a = 0; a < lista.length; a++) {
    const ra = rect(lista[a]);
    if (ra.x - ra.w / 2 < 0 || ra.x + ra.w / 2 > W || ra.y - ra.h / 2 < 0 || ra.y + ra.h / 2 > H) malos.push(`${lista[a].id} fuera`);
    for (let b = a + 1; b < lista.length; b++) {
      const rb = rect(lista[b]);
      if (Math.abs(ra.x - rb.x) < (ra.w + rb.w) / 2 && Math.abs(ra.y - rb.y) < (ra.h + rb.h) / 2) malos.push(`${lista[a].id}×${lista[b].id}`);
    }
  }
  return malos;
}
for (const [activos, W, H] of [[4, 940, 667], [4, 1060, 810], [4, 1500, 900], [8, 1060, 810]]) {
  test(`I1: ${activos} activos + 8 terminados en ${W}x${H} sin solapamientos ni nodos fuera`, () => {
    const lista = disposicion(sesionCon(activos, 12));
    assert.equal(lista.filter((p) => !p.compacto).length, activos);
    assert.equal(lista.filter((p) => p.compacto).length, 8);
    assert.deepEqual(solapamientos(lista, W, H), []);
  });
}
test('I1: el terminado más reciente va primero en el anillo de historial', () => {
  const lista = disposicion(sesionCon(0, 3)).filter((p) => p.compacto);
  assert.equal(lista[0].id, 't2');
});

// I2: el seguidor puede empezar por la cola del archivo.
test('I2: crearSeguidor con cola lee solo el final y descarta la primera línea parcial', () => {
  const r = join(mkdtempSync(join(tmpdir(), 'orq-cola-')), 'e.jsonl');
  writeFileSync(r, Array.from({ length: 1000 }, (_, i) => JSON.stringify({ i, relleno: 'x'.repeat(40) })).join('\n') + '\n');
  const lineas = crearSeguidor(r, { cola: 600 }).leerNuevas();
  assert.ok(lineas.length > 0 && lineas.length < 20);
  for (const l of lineas) JSON.parse(l);
  assert.equal(JSON.parse(lineas.at(-1)).i, 999);
});

// M4→Important: errores de E/S y URLs malformadas no tumban el servidor.
test('M4: el seguidor no lanza si la ruta es un directorio', () => {
  const d = mkdtempSync(join(tmpdir(), 'orq-dir-'));
  assert.deepEqual(crearSeguidor(d).leerNuevas(), []);
});

const levantar = async (opciones = {}) => {
  const env = { ORQUESTADOR_HOME: mkdtempSync(join(tmpdir(), 'orq-rev-')) };
  if (opciones.eventosComoDirectorio) mkdirSync(rutaEventos(env));
  const srv = crearServidor({ env, intervaloMs: 20, ...opciones });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { srv, puerto: srv.address().port };
};
const salud = (puerto) => fetch(`http://127.0.0.1:${puerto}/salud`).then((r) => r.json());

test('M4: request target malformado responde 400 y el servidor sigue vivo', async () => {
  const { srv, puerto } = await levantar({ eventosComoDirectorio: true });
  try {
    const respuesta = await new Promise((ok) => {
      const s = connect(puerto, '127.0.0.1', () => s.write('GET //[ HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n'));
      let t = ''; s.on('data', (d) => { t += d; }); s.on('close', () => ok(t));
    });
    assert.match(respuesta, /^HTTP\/1\.1 400/);
    await new Promise((r) => setTimeout(r, 60)); // varios ticks con events.jsonl ilegible
    assert.equal((await salud(puerto)).ok, true);
  } finally { await srv.detener(); }
});

// I3: versión en /salud, reinicio si cambió, y apagado por inactividad.
test('I3: /salud informa versión, raíz y pid', async () => {
  const { srv, puerto } = await levantar();
  try {
    const s = await salud(puerto);
    const plugin = JSON.parse(readFileSync(fileURLToPath(new URL('../plugins/orquestador/.claude-plugin/plugin.json', import.meta.url)), 'utf8'));
    assert.equal(s.app, 'orquestador-dashboard');
    assert.equal(s.version, plugin.version);
    assert.equal(s.pid, process.pid);
    assert.match(s.raiz, /dashboard$/);
  } finally { await srv.detener(); }
});
test('I3: necesitaReinicio compara versión y raíz', () => {
  const local = { version: '0.2.0', raiz: '/p/dashboard' };
  assert.equal(necesitaReinicio({ version: '0.2.0', raiz: '/p/dashboard' }, local), false);
  assert.equal(necesitaReinicio({ version: '0.1.0', raiz: '/p/dashboard' }, local), true);
  assert.equal(necesitaReinicio({ version: '0.2.0', raiz: '/viejo/dashboard' }, local), true);
  assert.equal(necesitaReinicio({}, local), true);
});
test('I3: sin clientes SSE el servidor avisa inactividad; con un cliente conectado no', async () => {
  let avisos = 0;
  const { srv, puerto } = await levantar({ inactividadMs: 80, alInactivo: () => { avisos += 1; } });
  try {
    const cliente = request(`http://127.0.0.1:${puerto}/eventos`);
    cliente.on('error', () => {});
    cliente.end();
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(avisos, 0, 'con cliente conectado no debe apagarse');
    cliente.destroy();
    await new Promise((r) => setTimeout(r, 400));
    assert.ok(avisos >= 1, 'sin clientes debe avisar inactividad');
  } finally { await srv.detener(); }
});

// M8→Important: conciliar con el estado del servidor.
test('M8: activos que el servidor ya no tiene y superan la gracia quedan "sin-cierre"', () => {
  const s = sesionCon(3, 0); // t0, t1, t2 activos
  const ahora = Date.parse(ts(0)) + 60_000;
  s.nodos.t2.inicioMs = ahora - 1000; // reciente: dentro de la gracia
  const cambiados = conciliarConServidor(s, { t1: {} }, ahora, 20_000);
  assert.deepEqual(cambiados, ['t0']);
  assert.equal(s.nodos.t0.estado, 'sin-cierre');
  assert.equal(s.nodos.t1.estado, 'activo');
  assert.equal(s.nodos.t2.estado, 'activo');
  assert.equal(s.stats.activos, 2);
});
test('M8: un fin que llega después de "sin-cierre" igual se registra sin descontar activos dos veces', () => {
  const v = vistaVacia();
  reducir(v, { session: 's', tipo: 'delegacion', id: 'x', agente: 'a', modelo: 'haiku', ts: ts(0) });
  conciliarConServidor(v.sesiones.s, {}, Date.parse(ts(0)) + 60_000);
  const { efecto } = reducir(v, { session: 's', tipo: 'fin', id: 'x', costoUSD: 0.2, ts: ts(70) });
  assert.equal(efecto.tipo, 'volver');
  assert.equal(v.sesiones.s.nodos.x.estado, 'terminado');
  assert.deepEqual([v.sesiones.s.stats.activos, v.sesiones.s.stats.completados, v.sesiones.s.stats.costoUSD], [0, 1, 0.2]);
});

// M5→Important: la animación de llegada no la tapa el pulso.
test('M5: el CSS combina aparecer + pulso para nodos activos recién llegados', () => {
  const html = readFileSync(fileURLToPath(new URL('../plugins/orquestador/dashboard/public/index.html', import.meta.url)), 'utf8');
  assert.match(html, /\.nodo\.activo\.nuevo\s*\{[^}]*animation:[^}]*aparecer[^}]*pulso/);
});
