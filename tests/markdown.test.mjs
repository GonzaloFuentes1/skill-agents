import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsearMarkdown, parsearInline } from '../plugins/orquestador/dashboard/public/markdown.js';

const txt = (v) => ({ t: 'txt', v });

test('inline: negrita, cursiva, código, tachado y enlaces', () => {
  assert.deepEqual(parsearInline('**El modelo:** es `Llama-3.1` y *abierto*'), [
    { t: 'b', hijos: [txt('El modelo:')] }, txt(' es '), { t: 'code', v: 'Llama-3.1' }, txt(' y '), { t: 'i', hijos: [txt('abierto')] },
  ]);
  assert.deepEqual(parsearInline('~~no~~ y __sí__'), [{ t: 's', hijos: [txt('no')] }, txt(' y '), { t: 'b', hijos: [txt('sí')] }]);
  assert.deepEqual(parsearInline('ver [la ficha](https://x.cl/a?b=1)'), [txt('ver '), { t: 'a', href: 'https://x.cl/a?b=1', hijos: [txt('la ficha')] }]);
});

test('inline: los guiones bajos dentro de palabras y los asteriscos sueltos son texto', () => {
  assert.deepEqual(parsearInline('archivo_de_datos.csv'), [txt('archivo_de_datos.csv')]);
  assert.deepEqual(parsearInline('2 * 3 = 6'), [txt('2 * 3 = 6')]);
  assert.deepEqual(parsearInline('**sin cierre'), [txt('**sin cierre')]);
  assert.deepEqual(parsearInline('`sin cierre'), [txt('`sin cierre')]);
});

test('inline: enlaces peligrosos o relativos quedan como texto', () => {
  assert.deepEqual(parsearInline('[x](javascript:alert(1))'), [txt('[x](javascript:alert(1))')]);
  assert.deepEqual(parsearInline('[x](./a.md)'), [txt('[x](./a.md)')]);
  assert.deepEqual(parsearInline('[correo](mailto:a@b.cl)')[0].t, 'a');
});

test('inline: URL suelta es enlace sin la puntuación final', () => {
  assert.deepEqual(parsearInline('fuente: https://anid.cl/concursos.'), [
    txt('fuente: '), { t: 'a', href: 'https://anid.cl/concursos', hijos: [txt('https://anid.cl/concursos')] }, txt('.'),
  ]);
});

test('inline: el HTML del modelo queda como texto', () => {
  assert.deepEqual(parsearInline('<img src=x onerror=alert(1)>'), [txt('<img src=x onerror=alert(1)>')]);
});

test('inline: el código no interpreta marcas y conserva el contenido', () => {
  assert.deepEqual(parsearInline('`**no** _es_ negrita`'), [{ t: 'code', v: '**no** _es_ negrita' }]);
  assert.deepEqual(parsearInline('``con ` dentro``'), [{ t: 'code', v: 'con ` dentro' }]);
});

test('bloques: títulos, párrafos con salto de línea y separador', () => {
  assert.deepEqual(parsearMarkdown('## Lo que ya sabemos\n\nPrimera línea\nsegunda\n\n---\nfin'), [
    { t: 'h', nivel: 2, inl: [txt('Lo que ya sabemos')] },
    { t: 'p', inl: [txt('Primera línea'), { t: 'br' }, txt('segunda')] },
    { t: 'hr' },
    { t: 'p', inl: [txt('fin')] },
  ]);
});

test('bloques: listas anidadas por sangría y numeradas', () => {
  const md = '- **Puntos débiles:**\n  - La licencia es contradictoria.\n  - No hay informe.\n- Otro punto\n\n1. uno\n2. dos';
  const [ul, ol] = parsearMarkdown(md);
  assert.equal(ul.t, 'ul');
  assert.equal(ul.items.length, 2);
  assert.deepEqual(ul.items[0][0], { t: 'p', inl: [{ t: 'b', hijos: [txt('Puntos débiles:')] }] });
  assert.equal(ul.items[0][1].t, 'ul');
  assert.equal(ul.items[0][1].items.length, 2);
  assert.deepEqual(ul.items[1], [{ t: 'p', inl: [txt('Otro punto')] }]);
  assert.equal(ol.t, 'ol');
  assert.equal(ol.inicio, 1);
  assert.equal(ol.items.length, 2);
});

test('bloques: lista numerada que empieza en otro número y con líneas de continuación', () => {
  const [ol] = parsearMarkdown('3. tres\n   sigue\n4. cuatro');
  assert.equal(ol.inicio, 3);
  assert.deepEqual(ol.items[0], [{ t: 'p', inl: [txt('tres'), { t: 'br' }, txt('sigue')] }]);
});

test('bloques: código cercado conserva el texto exacto y el lenguaje', () => {
  assert.deepEqual(parsearMarkdown('antes\n```js\nconst a = 1;\n  **x**\n```\ndespués'), [
    { t: 'p', inl: [txt('antes')] },
    { t: 'code', lang: 'js', v: 'const a = 1;\n  **x**' },
    { t: 'p', inl: [txt('después')] },
  ]);
  assert.deepEqual(parsearMarkdown('```\nsin cierre'), [{ t: 'code', lang: '', v: 'sin cierre' }]);
});

test('bloques: cita y tabla con alineación', () => {
  const [cita, tabla] = parsearMarkdown('> nota **importante**\n> sigue\n\n| Fondo | Monto |\n|:--|--:|\n| ANID | $50k |\n| CORFO | `n/d` |');
  assert.equal(cita.t, 'quote');
  assert.deepEqual(cita.hijos, [{ t: 'p', inl: [txt('nota '), { t: 'b', hijos: [txt('importante')] }, { t: 'br' }, txt('sigue')] }]);
  assert.equal(tabla.t, 'tabla');
  assert.deepEqual(tabla.alin, ['left', 'right']);
  assert.deepEqual(tabla.cab, [[txt('Fondo')], [txt('Monto')]]);
  assert.deepEqual(tabla.filas[1], [[txt('CORFO')], [{ t: 'code', v: 'n/d' }]]);
});

test('bloques: texto vacío, solo espacios y líneas con | que no son tabla', () => {
  assert.deepEqual(parsearMarkdown(''), []);
  assert.deepEqual(parsearMarkdown('  \n\n'), []);
  assert.deepEqual(parsearMarkdown('a | b'), [{ t: 'p', inl: [txt('a | b')] }]);
});
