import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearAuth, validarRemoto, sinPuerto } from '../plugins/orquestador/dashboard/auth.mjs';
import { rutaToken } from '../plugins/orquestador/scripts/lib/rutas.mjs';

const env = () => ({ ORQUESTADOR_HOME: mkdtempSync(join(tmpdir(), 'orq-auth-')) });
const req = (headers = {}, ip = '127.0.0.1') => ({ headers, socket: { remoteAddress: ip } });

test('token: 64 hex, guardado en disco', () => {
  const e = env();
  const a = crearAuth({ env: e });
  assert.match(a.token, /^[0-9a-f]{64}$/);
  assert.equal(readFileSync(rutaToken(e), 'utf8'), a.token);
});

test('canjear: token malo 401, bueno 302 con cookie HttpOnly SameSite=Strict, y la cookie autentica', () => {
  const a = crearAuth({ env: env() });
  assert.equal(a.canjear(req(), 'malo').status, 401);
  const r = a.canjear(req(), a.token);
  assert.equal(r.status, 302);
  assert.match(r.cookie, /^orq_sesion=[0-9a-f]{48}; HttpOnly; SameSite=Strict; Path=\/$/);
  assert.equal(a.autenticado(req({ cookie: `otra=1; ${r.cookie.split(';')[0]}` })), true);
  assert.equal(a.autenticado(req({ cookie: 'orq_sesion=inventada' })), false);
  assert.equal(a.autenticado(req()), false);
  assert.match(a.canjear(req({ 'x-forwarded-proto': 'https' }), a.token).cookie, /; Secure$/);
});

test('límite: 10 intentos fallidos por minuto por IP, luego 429 incluso con el token correcto', () => {
  let t = 0;
  const a = crearAuth({ env: env(), ahora: () => t });
  for (let i = 0; i < 10; i++) assert.equal(a.canjear(req({}, '10.0.0.5'), 'x').status, 401);
  assert.equal(a.canjear(req({}, '10.0.0.5'), a.token).status, 429);
  assert.equal(a.canjear(req({}, '10.0.0.6'), a.token).status, 302);
  t = 61_000;
  assert.equal(a.canjear(req({}, '10.0.0.5'), a.token).status, 302);
});

test('Origin debe coincidir con Host', () => {
  const a = crearAuth({ env: env() });
  assert.equal(a.origenValido(req({ host: '127.0.0.1:4321', origin: 'http://127.0.0.1:4321' })), true);
  assert.equal(a.origenValido(req({ host: '127.0.0.1:4321', origin: 'http://evil.example' })), false);
  assert.equal(a.origenValido(req({ host: '127.0.0.1:4321' })), false);
});

test('hosts: locales siempre; remotos solo si el modo remoto está activo y listados', () => {
  const local = crearAuth({ env: env() });
  assert.equal(local.hostPermitido('127.0.0.1:4321'), true);
  assert.equal(local.hostPermitido('localhost'), true);
  assert.equal(local.hostPermitido('mi-pc.tailnet.ts.net:4321'), false);
  const remoto = crearAuth({ env: env(), remoto: { activo: true, escuchar: '100.64.0.7', hostsPermitidos: ['mi-pc.tailnet.ts.net'] } });
  assert.equal(remoto.hostPermitido('mi-pc.tailnet.ts.net:4321'), true);
  assert.equal(remoto.hostPermitido('100.64.0.7:4321'), true);
  assert.equal(remoto.hostPermitido('evil.example'), false);
});

test('validarRemoto', () => {
  assert.equal(validarRemoto({ activo: false, escuchar: '0.0.0.0' }), '127.0.0.1');
  assert.equal(validarRemoto({ activo: true, escuchar: '100.64.0.7', hostsPermitidos: [] }), '100.64.0.7');
  assert.throws(() => validarRemoto({ activo: true, escuchar: '0.0.0.0', hostsPermitidos: [] }), /hostsPermitidos/);
  assert.equal(validarRemoto({ activo: true, escuchar: '0.0.0.0', hostsPermitidos: ['a.ts.net'] }), '0.0.0.0');
});

test('sinPuerto: IPv4, nombres e IPv6 con y sin corchetes', () => {
  assert.equal(sinPuerto('127.0.0.1:4321'), '127.0.0.1');
  assert.equal(sinPuerto('Mi-PC.ts.net:80'), 'mi-pc.ts.net');
  assert.equal(sinPuerto('[::1]:4321'), '::1');
  assert.equal(sinPuerto('[::1]'), '::1');
  assert.equal(sinPuerto('::1'), '::1');
  assert.equal(sinPuerto('fe80::1'), 'fe80::1');
  assert.equal(sinPuerto(''), '');
});

test('hosts IPv6: [::1] y ::1 son locales; un Host vacío no se acepta', () => {
  const a = crearAuth({ env: env() });
  for (const h of ['[::1]:4321', '[::1]', '::1']) assert.equal(a.hostPermitido(h), true, h);
  assert.equal(a.hostPermitido(''), false);
  assert.equal(a.hostPermitido(undefined), false);
});

test('remoto: TODAS reconoce 0:0:0:0:0:0:0:0 y [::], y hostsPermitidos ignora las entradas vacías', () => {
  for (const escuchar of ['0.0.0.0', '::', '[::]', '0:0:0:0:0:0:0:0']) {
    assert.throws(() => validarRemoto({ activo: true, escuchar, hostsPermitidos: ['', '  '] }), /hostsPermitidos/, escuchar);
  }
  assert.equal(validarRemoto({ activo: true, escuchar: '[::]', hostsPermitidos: ['pc.ts.net'] }), '::');
  const a = crearAuth({ env: env(), remoto: { activo: true, escuchar: '0:0:0:0:0:0:0:0', hostsPermitidos: ['', 'pc.ts.net'] } });
  assert.equal(a.hostPermitido('pc.ts.net:4321'), true);
  assert.equal(a.hostPermitido(':4321'), false);
});

test('el mapa de intentos se poda cuando vence la ventana', () => {
  let t = 0;
  const a = crearAuth({ env: env(), ahora: () => t });
  for (let i = 0; i < 5; i++) a.canjear(req({}, `10.0.0.${i}`), 'malo');
  assert.equal(a.intentosRegistrados(), 5);
  t = 61_000;
  a.canjear(req({}, '10.0.0.9'), a.token);
  assert.equal(a.intentosRegistrados(), 0);
});

test('el canje del token solo se acepta con GET', () => {
  const a = crearAuth({ env: env() });
  assert.equal(a.canjear({ ...req(), method: 'POST' }, a.token).status, 405);
  assert.equal(a.canjear({ ...req(), method: 'GET' }, a.token).status, 302);
});
