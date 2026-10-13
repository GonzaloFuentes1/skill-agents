import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const leer = (n) => readFileSync(fileURLToPath(new URL(`../plugins/orquestador/dashboard/public/${n}`, import.meta.url)), 'utf8');

test('tema.css: [hidden] gana a los display de los componentes', () => {
  assert.match(leer('tema.css'), /\[hidden\]\s*\{[^}]*display:\s*none/);
});

test('actividad.css: las reglas genéricas van acotadas a .vista-actividad', () => {
  const css = leer('actividad.css');
  for (const g of ['barra', 'controles', 'layout', 'panel', 'chip', 'tarjeta', 'vacio', 'boton', 'stats', 'stat', 'timeline', 'escenario', 'nodo', 'avatar', 'badge']) {
    assert.doesNotMatch(css, new RegExp(`^\s*\.${g}[\s.,{:]`, 'm'), `.${g} sin prefijo .vista-actividad`);
  }
});

test('tema.css: objetivos táctiles de al menos 44 px', () => {
  const css = leer('tema.css');
  assert.doesNotMatch(css, /min-height:\s*(3\d|40)px/);
  assert.match(css, /\.boton-enviar\s*\{[^}]*width:\s*44px/);
});
