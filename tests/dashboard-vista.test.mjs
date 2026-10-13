import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vistaVacia, reducir, posicionOrbital, nodosVisibles, colorDe, formatoCosto, formatoDuracion, formatoTokens } from '../plugins/orquestador/dashboard/public/estado-vista.js';

const ts = (s) => `2026-10-12T10:00:${String(s).padStart(2, '0')}Z`;
const del = (id, extra = {}) => ({ session: 's', tipo: 'delegacion', id, agente: 'orquestador:investigador-rl', meta: 'Diseñar', modelo: 'opus', esfuerzo: 'high', origenModelo: 'explicito', persona: 'Escéptico', color: 'purple', ts: ts(1), ...extra });
const aplicar = (eventos) => eventos.reduce((acc, e) => { acc.efectos.push(reducir(acc.vista, e).efecto); return acc; }, { vista: vistaVacia(), efectos: [] });

test('delegación crea un nodo activo y pide la animación de envío', () => {
  const { vista, efectos } = aplicar([{ session: 's', tipo: 'sesion', cwd: '/p', ts: ts(0) }, del('t1')]);
  const s = vista.sesiones.s;
  assert.equal(s.cwd, '/p');
  assert.equal(s.nodos.t1.agente, 'investigador-rl');
  assert.equal(s.nodos.t1.estado, 'activo');
  assert.equal(s.nodos.t1.color, colorDe('x', 'purple'));
  assert.equal(s.stats.activos, 1);
  assert.deepEqual(efectos[1], { tipo: 'enviar', sesion: 's', id: 't1' });
  assert.equal(s.timeline[0].tipo, 'delegacion');
});

test('fin cierra el nodo con resultado, suma costo y pide el regreso', () => {
  const { vista, efectos } = aplicar([del('t1'), { session: 's', tipo: 'fin', id: 't1', modeloReal: 'claude-opus-5-5', tokensIn: 1200, tokensOut: 30, costoUSD: 0.5, duracionMs: 2500, ok: true, ts: ts(5) }]);
  const s = vista.sesiones.s;
  assert.equal(s.nodos.t1.estado, 'terminado');
  assert.equal(s.nodos.t1.resultado.modeloReal, 'claude-opus-5-5');
  assert.deepEqual([s.stats.activos, s.stats.completados, s.stats.costoUSD], [0, 1, 0.5]);
  assert.deepEqual(efectos[1], { tipo: 'volver', sesion: 's', id: 't1' });
});

test('fin con ok:false marca el nodo como fallido; fin duplicado se ignora', () => {
  const { vista, efectos } = aplicar([del('t1'), { session: 's', tipo: 'fin', id: 't1', ok: false, ts: ts(2) }, { session: 's', tipo: 'fin', id: 't1', ts: ts(3) }]);
  assert.equal(vista.sesiones.s.nodos.t1.estado, 'fallido');
  assert.equal(vista.sesiones.s.stats.completados, 1);
  assert.equal(efectos[2], null);
});

test('alerta y bloqueo', () => {
  const { vista, efectos } = aplicar([del('t1'), { session: 's', tipo: 'alerta', id: 't1', mensaje: 'se pidió opus pero corrió sonnet', ts: ts(3) }, { session: 's', tipo: 'bloqueo', regla: 'tope-fable', motivo: 'Tope de Fable', ts: ts(4) }]);
  const s = vista.sesiones.s;
  assert.equal(s.nodos.t1.alerta, 'se pidió opus pero corrió sonnet');
  assert.deepEqual([s.stats.alertas, s.stats.bloqueos], [1, 1]);
  assert.deepEqual(efectos[2], { tipo: 'bloqueo', sesion: 's', motivo: 'Tope de Fable' });
});

test('delegación a fable suma al contador local de Fable', () => {
  assert.equal(aplicar([del('t1', { modelo: 'fable' })]).vista.sesiones.s.stats.fable, 1);
});

test('reaplicar el mismo historial sobre una vista nueva da el mismo estado (reconexión SSE)', () => {
  const eventos = [del('t1'), del('t2', { modelo: 'haiku' }), { session: 's', tipo: 'fin', id: 't1', costoUSD: 0.1, ts: ts(9) }];
  assert.deepEqual(aplicar(eventos).vista, aplicar(eventos).vista);
});

test('los slots se reutilizan y solo quedan visibles activos + últimos 8 terminados', () => {
  const eventos = [];
  for (let i = 0; i < 12; i++) { eventos.push(del(`t${i}`)); eventos.push({ session: 's', tipo: 'fin', id: `t${i}`, ts: ts(i) }); }
  eventos.push(del('nuevo'));
  const s = aplicar(eventos).vista.sesiones.s;
  const visibles = nodosVisibles(s);
  assert.equal(visibles.length, 9);
  assert.ok(visibles.includes('nuevo'));
  const slots = visibles.map((id) => s.nodos[id].slot);
  assert.equal(new Set(slots).size, slots.length, 'sin slots repetidos entre visibles');
  assert.ok(Math.max(...slots) < 9);
});

test('posicionOrbital: primer nodo arriba, dentro del escenario, anillos crecientes', () => {
  const p0 = posicionOrbital(0);
  assert.ok(Math.abs(p0.x - 0.5) < 1e-9 && p0.y < 0.5);
  for (let i = 0; i < 24; i++) { const p = posicionOrbital(i); assert.ok(p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1); }
  assert.equal(posicionOrbital(8).anillo, 1);
});

test('eventos sin sesión no rompen nada', () => {
  assert.deepEqual(reducir(vistaVacia(), { tipo: 'delegacion' }), { vista: vistaVacia(), efecto: null });
});

test('formatos', () => {
  assert.equal(formatoCosto(0.0041), '$0.004');
  assert.equal(formatoCosto(1.234), '$1.23');
  assert.equal(formatoDuracion(1460), '1.5 s');
  assert.equal(formatoDuracion(125000), '2 min 5 s');
  assert.equal(formatoTokens(32951), '33.0k');
  assert.equal(formatoTokens(4), '4');
});
