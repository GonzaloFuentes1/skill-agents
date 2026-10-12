import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsearFrontmatter } from '../plugins/orquestador/scripts/lib/frontmatter.mjs';

test('parsea pares clave: valor y separa el cuerpo', () => {
  const r = parsearFrontmatter('---\nname: guardian-git\nmodel: haiku\n---\nPersona: estricto\n');
  assert.deepEqual(r.datos, { name: 'guardian-git', model: 'haiku' });
  assert.equal(r.cuerpo, 'Persona: estricto\n');
});

test('quita comillas y admite dos puntos dentro del valor', () => {
  const r = parsearFrontmatter('---\ndescription: "Úsalo para: commits"\n---\n');
  assert.equal(r.datos.description, 'Úsalo para: commits');
});

test('acepta CRLF', () => {
  const r = parsearFrontmatter('---\r\nname: x\r\n---\r\ncuerpo');
  assert.equal(r.datos.name, 'x');
  assert.equal(r.cuerpo, 'cuerpo');
});

test('sin frontmatter devuelve datos vacíos y el texto como cuerpo', () => {
  assert.deepEqual(parsearFrontmatter('hola'), { datos: {}, cuerpo: 'hola' });
});
