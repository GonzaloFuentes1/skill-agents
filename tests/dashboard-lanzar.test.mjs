import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { estaCorriendo, comandoAbrir, urlsRemotas } from '../plugins/orquestador/dashboard/lanzar.mjs';

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

test('urlsRemotas: vacío si el modo remoto está apagado; una URL con token por host', () => {
  assert.deepEqual(urlsRemotas({ puertoDashboard: 4321, remoto: { activo: false } }, 't'), []);
  assert.deepEqual(urlsRemotas({ puertoDashboard: 4321, remoto: { activo: true, escuchar: '100.64.0.7', hostsPermitidos: [] } }, 't'), ['http://100.64.0.7:4321/?t=t']);
  assert.deepEqual(urlsRemotas({ puertoDashboard: 4321, remoto: { activo: true, escuchar: '0.0.0.0', hostsPermitidos: ['pc.ts.net'] } }, 't'), ['http://pc.ts.net:4321/?t=t']);
});

test('urlsRemotas: sin hostsPermitidos y escuchando en 127.0.0.1 no hay URL remota; IPv6 entre corchetes', () => {
  assert.deepEqual(urlsRemotas({ puertoDashboard: 4321, remoto: { activo: true, escuchar: '127.0.0.1', hostsPermitidos: [] } }, 't'), []);
  assert.deepEqual(urlsRemotas({ puertoDashboard: 4321, remoto: { activo: true } }, 't'), []);
  assert.deepEqual(urlsRemotas({ puertoDashboard: 4321, remoto: { activo: true, escuchar: 'fd7a:115c:a1e0::7' } }, 't'), ['http://[fd7a:115c:a1e0::7]:4321/?t=t']);
  assert.deepEqual(urlsRemotas({ puertoDashboard: 4321, remoto: { activo: true, escuchar: '[::1]', hostsPermitidos: [] } }, 't'), []);
});
