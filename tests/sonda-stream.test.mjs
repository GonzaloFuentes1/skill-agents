import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumirStreamJson } from '../bench/sondas/resumen-stream.mjs';

const L = (o) => JSON.stringify(o);

test('resumirStreamJson detecta init, parciales, permiso por host, varios turnos y controles', () => {
  const r = resumirStreamJson([
    L({ type: 'system', subtype: 'init', session_id: 'ses-9' }),
    L({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'v' } } }),
    L({ type: 'control_request', request_id: 'r1', request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'node --version' } } }),
    'línea que no es JSON',
    L({ type: 'result', subtype: 'success' }),
    L({ type: 'result', subtype: 'success' }),
    L({ type: 'control_response', response: { subtype: 'success', request_id: 'orq-1' } }),
  ]);
  assert.equal(r.sessionId, 'ses-9');
  assert.equal(r.textoParcial, true);
  assert.equal(r.permisoHost, true);
  assert.equal(r.ejemploPermiso.request.tool_name, 'Bash');
  assert.equal(r.turnos, 2);
  assert.equal(r.variosTurnosEnUnProceso, true);
  assert.deepEqual(r.controles, [{ id: 'orq-1', subtipo: 'success', error: null }]);
  assert.equal(r.tipos['system:init'], 1);
});

test('resumirStreamJson sin datos no rompe', () => {
  const r = resumirStreamJson([]);
  assert.deepEqual([r.permisoHost, r.turnos, r.sessionId], [false, 0, null]);
});
