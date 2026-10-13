import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearSeguidor, parsearLineas, listarSesiones } from '../plugins/orquestador/dashboard/datos.mjs';

const archivo = () => join(mkdtempSync(join(tmpdir(), 'orq-dash-')), 'events.jsonl');

test('el seguidor entrega solo líneas completas y guarda la parcial', () => {
  const r = archivo();
  const s = crearSeguidor(r);
  assert.deepEqual(s.leerNuevas(), [], 'archivo inexistente');
  writeFileSync(r, '{"a":1}\n{"b":');
  assert.deepEqual(s.leerNuevas(), ['{"a":1}']);
  appendFileSync(r, '2}\n');
  assert.deepEqual(s.leerNuevas(), ['{"b":2}']);
  assert.deepEqual(s.leerNuevas(), []);
});

test('el seguidor no corta caracteres multibyte entre lecturas', () => {
  const r = archivo();
  const s = crearSeguidor(r);
  const linea = Buffer.from('{"meta":"Diseño ñandú"}\n', 'utf8');
  writeFileSync(r, linea.subarray(0, 14)); // corta en medio de "ñ"
  assert.deepEqual(s.leerNuevas(), []);
  appendFileSync(r, linea.subarray(14));
  assert.deepEqual(s.leerNuevas(), ['{"meta":"Diseño ñandú"}']);
});

test('el seguidor reinicia si el archivo se trunca', () => {
  const r = archivo();
  const s = crearSeguidor(r);
  writeFileSync(r, '{"a":1}\n{"a":2}\n');
  s.leerNuevas();
  writeFileSync(r, '{"z":9}\n');
  assert.deepEqual(s.leerNuevas(), ['{"z":9}']);
});

test('parsearLineas ignora basura', () => {
  assert.deepEqual(parsearLineas(['{"a":1}', 'x', '']), [{ a: 1 }]);
});

test('listarSesiones agrupa, cuenta delegaciones y ordena por actividad reciente', () => {
  const ev = [
    { session: 'a', tipo: 'sesion', cwd: '/p/uno', ts: '2026-10-12T10:00:00Z' },
    { session: 'a', tipo: 'delegacion', ts: '2026-10-12T10:01:00Z' },
    { session: 'b', tipo: 'sesion', cwd: '/p/dos', ts: '2026-10-12T11:00:00Z' },
    { session: 'a', tipo: 'delegacion', ts: '2026-10-12T12:00:00Z' },
    { tipo: 'sin-sesion' },
  ];
  assert.deepEqual(listarSesiones(ev), [
    { session: 'a', cwd: '/p/uno', inicio: '2026-10-12T10:00:00Z', ultimo: '2026-10-12T12:00:00Z', delegaciones: 2 },
    { session: 'b', cwd: '/p/dos', inicio: '2026-10-12T11:00:00Z', ultimo: '2026-10-12T11:00:00Z', delegaciones: 0 },
  ]);
});
