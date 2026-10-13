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

test('actividad.css: sin-animacion acotada a la vista Actividad y objetivos de 44 px en el demo y las casillas', () => {
  const css = leer('actividad.css');
  assert.match(css, /body\.sin-animacion \.vista-actividad \*/);
  assert.doesNotMatch(css, /body\.sin-animacion \*,/);
  assert.match(css, /\.vista-actividad \.vacio button\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.vista-actividad \.casilla\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.vista-actividad \.controles select\s*\{[^}]*min-height:\s*44px/);
});

test('actividad.css: las clases nuevas también van acotadas a .vista-actividad', () => {
  const css = leer('actividad.css');
  for (const g of ['resumen', 'eventos', 'columna-mapa', 'evento', 'casilla', 'bloque-resumen', 'etiqueta-evento', 'limite', 'centro-caja', 'costo-grande', 'item-leyenda']) {
    assert.doesNotMatch(css, sinPrefijo(g), `.${g} sin prefijo .vista-actividad`);
  }
});

test('tema.css: título editable de 44 px, tarjeta de denegación y franja de barrera en ámbar', () => {
  const css = leer('tema.css');
  assert.match(css, /\.titulo-editable\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.denegacion\s*\{[^}]*var\(--accion\)/);
  assert.match(css, /\.barrera-humana\s*\{[^}]*var\(--accion\)/);
});

test('tema.css: interruptores, opciones, contadores y botones de quitar con objetivos de 44 px; la tabla de precios se desplaza en su caja', () => {
  const css = leer('tema.css');
  assert.match(css, /\.interruptor\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.segmentado \.opcion\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.boton-contador\s*\{[^}]*height:\s*44px/);
  assert.match(css, /\.quitar\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.config-nav a\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.tabla-desplazable\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(css, /\.pestanas\s*\{[^}]*overflow-x:\s*auto/); // 4 pestañas en 390 px: se desplaza la barra, no la página
});
