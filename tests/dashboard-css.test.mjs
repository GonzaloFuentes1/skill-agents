import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const leer = (n) => readFileSync(fileURLToPath(new URL(`../plugins/orquestador/dashboard/public/${n}`, import.meta.url)), 'utf8');

test('tema.css: [hidden] gana a los display de los componentes', () => {
  assert.match(leer('tema.css'), /\[hidden\]\s*\{[^}]*display:\s*none/);
});

// Una regla que empieza en la línea con `.clase` (sin `.vista-actividad` delante).
const sinPrefijo = (g) => new RegExp(String.raw`^\s*\.${g}[\s.,{:]`, 'm');

test('la detección de reglas sin prefijo funciona de verdad', () => {
  assert.match('.barra { color: red; }', sinPrefijo('barra'));
  assert.match('a {}\n  .barra:hover {}', sinPrefijo('barra'));
  assert.doesNotMatch('.vista-actividad .barra { color: red; }', sinPrefijo('barra'));
  assert.doesNotMatch('.barrage {}', sinPrefijo('barra'));
});

test('actividad.css: las reglas genéricas van acotadas a .vista-actividad', () => {
  const css = leer('actividad.css');
  for (const g of ['barra', 'controles', 'layout', 'panel', 'chip', 'tarjeta', 'vacio', 'boton', 'stats', 'stat', 'timeline', 'escenario', 'nodo', 'avatar', 'badge']) {
    assert.doesNotMatch(css, sinPrefijo(g), `.${g} sin prefijo .vista-actividad`);
  }
});

test('tema.css: en modo cajón hay velo y botón "Cerrar panel"', () => {
  const css = leer('tema.css');
  const cajon = css.slice(css.indexOf('@media (max-width: 1180px)'));
  assert.match(css, /\.velo\s*\{[^}]*display:\s*none[^}]*position:\s*fixed/);
  assert.match(cajon, /body\.panel-abierto \.velo\s*\{\s*display:\s*block/);
  assert.match(cajon, /body\.lateral-abierto \.velo\s*\{\s*display:\s*block/);
  assert.match(cajon, /\.cerrar-cajon\s*\{\s*display:\s*inline-flex/);
});

test('tema.css: objetivos táctiles de al menos 44 px', () => {
  const css = leer('tema.css');
  assert.doesNotMatch(css, /min-height:\s*(3\d|40)px/);
  assert.match(css, /\.boton-enviar\s*\{[^}]*width:\s*44px/);
});
