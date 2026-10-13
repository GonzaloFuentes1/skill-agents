// Autenticación del dashboard: token por arranque, cookie de sesión, Origin y Host permitidos, modo remoto.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { rutaToken } from '../scripts/lib/rutas.mjs';

const HOST_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const COOKIE = 'orq_sesion';
const VENTANA_MS = 60_000;
const MAX_INTENTOS = 10;
const TODAS = new Set(['0.0.0.0', '::']);

export function validarRemoto(remoto = {}) {
  if (!remoto.activo) return '127.0.0.1';
  const escuchar = remoto.escuchar || '127.0.0.1';
  if (TODAS.has(escuchar) && !(remoto.hostsPermitidos ?? []).length) {
    throw new Error('Modo remoto: escuchar en todas las interfaces exige hostsPermitidos en ~/.claude/orquestador/config.json');
  }
  return escuchar;
}

const sinPuerto = (host) => String(host ?? '').toLowerCase().replace(/:\d+$/, '').replace(/^\[|\]$/g, '');

export function crearAuth({ env = process.env, remoto = {}, ahora = Date.now } = {}) {
  const token = randomBytes(32).toString('hex');
  const ruta = rutaToken(env);
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, token, { mode: 0o600 });
  try { chmodSync(ruta, 0o600); } catch { /* en Windows manda el ACL del perfil */ }

  const sesiones = new Set();
  const intentos = new Map();
  const permitidos = new Set(remoto.activo ? (remoto.hostsPermitidos ?? []).map(sinPuerto) : []);
  if (remoto.activo && remoto.escuchar && !TODAS.has(remoto.escuchar)) permitidos.add(sinPuerto(remoto.escuchar));

  const cookieDe = (req) => {
    for (const parte of String(req.headers.cookie ?? '').split(';')) {
      const [k, ...v] = parte.trim().split('=');
      if (k === COOKIE) return v.join('=');
    }
    return null;
  };
  const igual = (a, b) => {
    const x = Buffer.from(String(a ?? ''));
    const y = Buffer.from(String(b));
    return x.length === y.length && timingSafeEqual(x, y);
  };

  return {
    token,
    hostPermitido: (host) => HOST_LOCAL.test(host ?? '') || permitidos.has(sinPuerto(host)),
    autenticado: (req) => { const c = cookieDe(req); return !!c && sesiones.has(c); },
    origenValido: (req) => { try { return new URL(req.headers.origin).host === req.headers.host; } catch { return false; } },
    canjear(req, candidato) {
      const ip = req.socket?.remoteAddress ?? '?';
      const t = ahora();
      const recientes = (intentos.get(ip) ?? []).filter((x) => t - x < VENTANA_MS);
      intentos.set(ip, recientes);
      if (recientes.length >= MAX_INTENTOS) return { status: 429 };
      if (!igual(candidato, token)) { recientes.push(t); return { status: 401 }; }
      const s = randomBytes(24).toString('hex');
      sesiones.add(s);
      const seguro = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      return { status: 302, cookie: `${COOKIE}=${s}; HttpOnly; SameSite=Strict; Path=/${seguro}` };
    },
  };
}
