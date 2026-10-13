import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mensajesDesdeTranscript, buscarTranscript, leerCola, historialDe } from '../plugins/orquestador/dashboard/historial.mjs';
import { leerDesde, pasosDesdeLineas, pasosAgente } from '../plugins/orquestador/dashboard/pasos-agente.mjs';

const L = (o) => JSON.stringify(o);
const TRANSCRIPT = [
  '﻿' + L({ type: 'user', uuid: 'u1', message: { role: 'user', content: 'Arma los verificadores' } }),
  L({ type: 'user', uuid: 'u0', message: { role: 'user', content: '<command-name>/clear</command-name>' } }),
  L({ type: 'user', uuid: 'um', isMeta: true, message: { role: 'user', content: 'meta' } }),
  L({ type: 'assistant', message: { id: 'm1', content: [{ type: 'text', text: 'Voy.' }] } }),
  L({ type: 'assistant', message: { id: 'm1', content: [{ type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'ls' } }] } }),
  L({ type: 'assistant', isSidechain: true, message: { id: 'mx', content: [{ type: 'text', text: 'de un subagente' }] } }),
  L({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'a.txt\nb.txt' }] } }),
  '{"type":"assistant","message":{"id":"m2","content":[{"type":"te',
  L({ type: 'assistant', message: { id: 'm3', content: [{ type: 'text', text: 'Listo.' }] } }),
].join('\n');

test('mensajesDesdeTranscript: usuario, asistente fusionado por id, resultado adjunto; omite meta, comandos, sidechain y líneas cortadas', () => {
  const m = mensajesDesdeTranscript(TRANSCRIPT);
  assert.deepEqual(m.map((x) => [x.rol, x.id]), [['usuario', 'u1'], ['asistente', 'm1'], ['asistente', 'm3']]);
  assert.deepEqual(m[1].bloques[1], { tipo: 'herramienta', usoId: 'tu1', nombre: 'Bash', entrada: { command: 'ls' }, resultado: { ok: true, texto: 'a.txt' } });
});

test('mensajesDesdeTranscript oculta el aviso de interrupción que Claude Code guarda como mensaje de usuario', () => {
  const texto = [
    L({ type: 'user', uuid: 'u1', message: { role: 'user', content: 'Haz algo' } }),
    L({ type: 'user', uuid: 'ui1', message: { role: 'user', content: '[Request interrupted by user]' } }),
    L({ type: 'user', uuid: 'ui2', message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }] } }),
    L({ type: 'user', uuid: 'u2', message: { role: 'user', content: 'Otra pregunta' } }),
  ].join('\n');
  const m = mensajesDesdeTranscript(texto);
  assert.deepEqual(m.map((x) => x.id), ['u1', 'u2']);
});

test('buscarTranscript usa CLAUDE_CONFIG_DIR, valida el id y historialDe avisa si no existe', () => {
  const conf = mkdtempSync(join(tmpdir(), 'orq-cfg-'));
  mkdirSync(join(conf, 'projects', 'C--x'), { recursive: true });
  writeFileSync(join(conf, 'projects', 'C--x', 'ses-1.jsonl'), TRANSCRIPT);
  const env = { CLAUDE_CONFIG_DIR: conf };
  assert.equal(buscarTranscript('ses-1', env), join(conf, 'projects', 'C--x', 'ses-1.jsonl'));
  assert.equal(buscarTranscript('../evil', env), null);
  assert.equal(historialDe('ses-1', env).mensajes.length, 3);
  assert.deepEqual(historialDe('ses-2', env), { mensajes: [], aviso: 'No se encontró el transcript de esta conversación' });
  assert.deepEqual(historialDe(null, env), { mensajes: [], aviso: null });
});

test('leerCola descarta la primera línea cortada al truncar', () => {
  const r = join(mkdtempSync(join(tmpdir(), 'orq-cola2-')), 't.jsonl');
  writeFileSync(r, ['aaaaaaaaaa', 'bbb', 'ccc'].join('\n'));
  assert.equal(leerCola(r, 9), 'bbb\nccc');
  assert.equal(leerCola(join(tmpdir(), 'no-existe.jsonl')), '');
});

test('pasosDesdeLineas: encargo, herramienta con resumen, resultado, texto y razonamiento', () => {
  const p = pasosDesdeLineas([
    L({ type: 'user', timestamp: 't0', message: { content: 'Verifica CSV' } }),
    L({ type: 'assistant', timestamp: 't1', message: { content: [{ type: 'thinking', thinking: 'Primero leo' }, { type: 'tool_use', id: 'x', name: 'Read', input: { file_path: 'a.csv' } }] } }),
    L({ type: 'user', timestamp: 't2', message: { content: [{ type: 'tool_result', tool_use_id: 'x', is_error: true, content: 'ENOENT' }] } }),
    L({ type: 'assistant', timestamp: 't3', message: { content: [{ type: 'text', text: 'No existe.' }] } }),
  ].join('\n'));
  assert.deepEqual(p.map((x) => x.tipo), ['encargo', 'pensando', 'herramienta', 'resultado', 'texto']);
  assert.deepEqual([p[2].nombre, p[2].resumen, p[3].ok, p[3].resumen], ['Read', 'a.csv', false, 'ENOENT']);
});

test('leerDesde es incremental, ignora la línea a medias y se reinicia si el archivo se achicó', () => {
  const r = join(mkdtempSync(join(tmpdir(), 'orq-inc-')), 'agent-a1.jsonl');
  writeFileSync(r, `${L({ n: 1 })}\n${L({ n: 2 })}\n`);
  const a = leerDesde(r, 0);
  assert.equal(a.texto.trim().split('\n').length, 2);
  appendFileSync(r, `${L({ n: 3 })}\n{"n":`);
  const b = leerDesde(r, a.siguiente);
  assert.deepEqual(b.texto.trim().split('\n').map((l) => JSON.parse(l).n), [3]);
  assert.equal(leerDesde(r, 10 ** 9).siguiente > 0, true); // desde mayor que el tamaño → desde 0
  assert.deepEqual(leerDesde(join(tmpdir(), 'nada.jsonl'), 0), { texto: '', siguiente: 0, existe: false });
});

test('pasosAgente rechaza rutas que no son .jsonl', () => {
  assert.deepEqual(pasosAgente('/etc/passwd', 0), { pasos: [], siguiente: 0, existe: false });
});

test('leerDesde lee una línea más larga que la ventana, sin congelarse', () => {
  const r = join(mkdtempSync(join(tmpdir(), 'orq-larga-')), 'agent-l1.jsonl');
  const larga = L({ n: 'x'.repeat(40) });
  writeFileSync(r, `${larga}\n${L({ n: 2 })}\n`);
  const a = leerDesde(r, 0, 16); // ventana de 16 bytes, la primera línea mide más
  assert.equal(a.texto, `${larga}\n`);
  assert.equal(a.siguiente, Buffer.byteLength(`${larga}\n`));
  const b = leerDesde(r, a.siguiente, 16);
  assert.deepEqual(b.texto.trim().split('\n').map((l) => JSON.parse(l).n), [2]);
});

test('leerDesde salta una línea que supera el tope y espera una línea a medio escribir', () => {
  const r = join(mkdtempSync(join(tmpdir(), 'orq-tope-')), 'agent-t1.jsonl');
  const gigante = L({ n: 'y'.repeat(60) });
  writeFileSync(r, `${gigante}\n${L({ n: 2 })}\n`);
  const a = leerDesde(r, 0, 16, 20); // tope de 20 bytes: la línea de 70 se salta
  assert.deepEqual(a, { texto: '', siguiente: Buffer.byteLength(`${gigante}\n`), existe: true });
  const b = leerDesde(r, a.siguiente, 16, 20);
  assert.deepEqual(b.texto.trim().split('\n').map((l) => JSON.parse(l).n), [2]);
  const pendiente = join(mkdtempSync(join(tmpdir(), 'orq-tope2-')), 'agent-t2.jsonl');
  writeFileSync(pendiente, `${'z'.repeat(60)}`);
  assert.deepEqual(leerDesde(pendiente, 0, 16, 20), { texto: '', siguiente: 0, existe: true });
});
