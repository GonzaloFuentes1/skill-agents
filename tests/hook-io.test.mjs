import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { ejecutarHook, denegar, contexto, leerEntrada } from '../plugins/orquestador/scripts/lib/hook-io.mjs';

const salidaFalsa = () => { const s = { texto: '', write(t) { s.texto += t; } }; return s; };

test('leerEntrada parsea JSON y tolera entrada vacía o inválida', async () => {
  assert.deepEqual(await leerEntrada(Readable.from(['{"a":1}'])), { a: 1 });
  assert.deepEqual(await leerEntrada(Readable.from([''])), {});
  assert.deepEqual(await leerEntrada(Readable.from(['{x'])), {});
});

test('ejecutarHook escribe el resultado y sale con 0', async () => {
  const stdout = salidaFalsa(); let codigo;
  await ejecutarHook(async (e) => denegar('PreToolUse', `no ${e.x}`), { stdin: Readable.from(['{"x":"y"}']), stdout, salir: (c) => { codigo = c; } });
  assert.equal(codigo, 0);
  assert.deepEqual(JSON.parse(stdout.texto), { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'no y' } });
});

test('ejecutarHook ante un error propio no bloquea: sale con 0 y avisa', async () => {
  const stdout = salidaFalsa(); let codigo;
  await ejecutarHook(async () => { throw new Error('boom'); }, { stdin: Readable.from(['{}']), stdout, salir: (c) => { codigo = c; } });
  assert.equal(codigo, 0);
  assert.match(JSON.parse(stdout.texto).systemMessage, /boom/);
});

test('contexto anida additionalContext en hookSpecificOutput', () => {
  assert.deepEqual(contexto('SessionStart', 'hola'), { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'hola' } });
});
