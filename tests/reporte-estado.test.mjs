import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generarTabla, sesionReciente } from '../plugins/orquestador/scripts/reporte-estado.mjs';

const eventos = [
  { tipo: 'sesion', session: 'a', cwd: '/p' },
  { tipo: 'delegacion', session: 'a', id: 't1', agente: 'orquestador:auditor-datos', meta: 'Perfilar | CSV', modelo: 'haiku', esfuerzo: 'low' },
  { tipo: 'fin', session: 'a', id: 't1', modeloReal: 'claude-sonnet-5-5', tokensIn: 100, tokensOut: 20, costoUSD: 0.0012 },
  { tipo: 'alerta', session: 'a', id: 't1', mensaje: 'se pidió haiku pero corrió claude-sonnet-5-5' },
  { tipo: 'bloqueo', session: 'a', regla: 'tope-fable', motivo: 'Tope de Fable alcanzado' },
  { tipo: 'sesion', session: 'b', cwd: '/otro' },
];

test('generarTabla une delegación, fin y alerta, y escapa |', () => {
  const t = generarTabla(eventos.filter((e) => e.session === 'a'));
  assert.match(t, /\| auditor-datos \| Perfilar \\\| CSV \| haiku \| low \| claude-sonnet-5-5 \| 100\/20 \| \$0\.001 \| ⚠ se pidió haiku/);
  assert.match(t, /Bloqueos: 1/);
  assert.match(t, /tope-fable/);
});

test('generarTabla sin delegaciones', () => {
  assert.match(generarTabla([]), /Sin delegaciones/);
});

test('sesionReciente prefiere la última sesión del cwd', () => {
  assert.equal(sesionReciente(eventos, '/p'), 'a');
  assert.equal(sesionReciente(eventos, '/nada'), 'b');
});
