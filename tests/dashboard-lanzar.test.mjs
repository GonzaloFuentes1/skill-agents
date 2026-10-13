import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { estaCorriendo, comandoAbrir } from '../plugins/orquestador/dashboard/lanzar.mjs';

const servir = (cuerpo) => new Promise((ok) => {
  const s = createServer((_q, r) => r.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(cuerpo)));
  s.listen(0, '127.0.0.1', () => ok(s));
});

test('estaCorriendo reconoce el dashboard y rechaza otra aplicación en el puerto', async () => {
  const propio = await servir({ ok: true, app: 'orquestador-dashboard' });
  const ajeno = await servir({ ok: true, app: 'otra' });
  try {
    assert.equal(await estaCorriendo(propio.address().port), true);
    assert.equal(await estaCorriendo(ajeno.address().port), false);
  } finally { propio.close(); ajeno.close(); }
  assert.equal(await estaCorriendo(1), false);
});

test('comandoAbrir por plataforma', () => {
  assert.deepEqual(comandoAbrir('http://x/', 'win32'), ['cmd', ['/c', 'start', '', 'http://x/']]);
  assert.deepEqual(comandoAbrir('http://x/', 'darwin'), ['open', ['http://x/']]);
  assert.deepEqual(comandoAbrir('http://x/', 'linux'), ['xdg-open', ['http://x/']]);
});
