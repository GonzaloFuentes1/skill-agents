import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bloquesDe, resultadosDe, resumenHerramienta, textoPlano, recortar } from '../plugins/orquestador/dashboard/bloques.mjs';

test('bloquesDe: string, texto, razonamiento vacío omitido y herramienta', () => {
  assert.deepEqual(bloquesDe('hola'), [{ tipo: 'texto', texto: 'hola' }]);
  assert.deepEqual(bloquesDe('  '), []);
  assert.deepEqual(bloquesDe([
    { type: 'thinking', thinking: '' },
    { type: 'thinking', thinking: 'pienso' },
    { type: 'text', text: 'ok' },
    { type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'ls' } },
  ]), [
    { tipo: 'pensando', texto: 'pienso' },
    { tipo: 'texto', texto: 'ok' },
    { tipo: 'herramienta', usoId: 'tu1', nombre: 'Bash', entrada: { command: 'ls' } },
  ]);
});

test('resultadosDe: ok/error, primera línea no vacía y recorte a 200', () => {
  const largo = 'x'.repeat(300);
  assert.deepEqual(resultadosDe([
    { type: 'tool_result', tool_use_id: 'a', content: '\n\nprimera\nsegunda' },
    { type: 'tool_result', tool_use_id: 'b', is_error: true, content: [{ type: 'text', text: largo }] },
    { type: 'text', text: 'ignorado' },
  ]), [
    { usoId: 'a', ok: true, texto: 'primera' },
    { usoId: 'b', ok: false, texto: recortar(largo, 200) },
  ]);
  assert.equal(recortar(largo, 200).length, 200);
  assert.equal(textoPlano([{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'text', text: 'b' }]), 'a\nb');
});

test('resumenHerramienta por herramienta', () => {
  assert.equal(resumenHerramienta('Bash', { command: 'npm test' }), 'npm test');
  assert.equal(resumenHerramienta('Edit', { file_path: 'a.js', old_string: 'x', new_string: 'y\nz' }), 'a.js +2 −1');
  assert.equal(resumenHerramienta('Grep', { pattern: 'TODO' }), 'TODO');
  assert.equal(resumenHerramienta('WebSearch', { query: 'claude' }), 'claude');
  assert.equal(resumenHerramienta('Agent', { description: 'E2 · Verificar' }), 'E2 · Verificar');
  assert.equal(resumenHerramienta('Rara', { a: 1 }), '{"a":1}');
});
