// Autenticación del dashboard: token por arranque, cookie de sesión, Origin y Host permitidos, modo remoto.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { rutaToken } from '../scripts/lib/rutas.mjs';

const COOKIE = 'orq_sesion';
const VENTANA_MS = 60_000;
const MAX_INTENTOS = 10;
const LOCALES = new Set(['localhost', '127.0.0.1', '::1']);
const TODAS = new Set(['0.0.0.0', '::', '0:0:0:0:0:0:0:0']);

// "[::1]:4321" → "::1"; "::1" (IPv6 sin corchetes no lleva puerto) → "::1"; "Host:80" → "host".
export function sinPuerto(host) {
  const h = String(host ?? '').trim().toLowerCase();
  if (h.startsWith('[')) { const fin = h.indexOf(']'); return fin > 0 ? h.slice(1, fin) : ''; }
  if ((h.match(/:/g) ?? []).length > 1) return h;
  return h.replace(/:\d*$/, '');
}

export const esTodas = (host) => TODAS.has(sinPuerto(host));

export function validarRemoto(remoto = {}) {
  if (!remoto.activo) return '127.0.0.1';
  const escuchar = sinPuerto(remoto.escuchar || '127.0.0.1') || '127.0.0.1';
  const hosts = (remoto.hostsPermitidos ?? []).map(sinPuerto).filter(Boolean);
  if (esTodas(escuchar) && !hosts.length) {
    throw new Error('Modo remoto: escuchar en todas las interfaces exige hostsPermitidos en ~/.claude/orquestador/config.json');
  }
  return escuchar;
}

export function crearAuth({ env = process.env, remoto = {}, ahora = Date.now } = {}) {
  const token = randomBytes(32).toString('hex');
  const ruta = rutaToken(env);
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, token, { mode: 0o600 });
  try { chmodSync(ruta, 0o600); } catch { /* en Windows manda el ACL del perfil */ }

  const sesiones = new Set();
  const intentos = new Map();
  const permitidos = new Set(remoto.activo ? (remoto.hostsPermitidos ?? []).map(sinPuerto).filter(Boolean) : []);
  if (remoto.activo && remoto.escuchar && !esTodas(remoto.escuchar)) permitidos.add(sinPuerto(remoto.escuchar));

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
  // Las IP sin intentos recientes se borran: el mapa no crece sin límite con escaneos.
  const podar = (t) => {
    for (const [ip, lista] of intentos) {
      const recientes = lista.filter((x) => t - x < VENTANA_MS);
      if (recientes.length) intentos.set(ip, recientes); else intentos.delete(ip);
    }
  };

  return {
    token,
    hostPermitido: (host) => { const h = sinPuerto(host); return !!h && (LOCALES.has(h) || permitidos.has(h)); },
    autenticado: (req) => { const c = cookieDe(req); return !!c && sesiones.has(c); },
    origenValido: (req) => { try { return new URL(req.headers.origin).host === req.headers.host; } catch { return false; } },
    intentosRegistrados: () => intentos.size,
    canjear(req, candidato) {
      if (req.method && req.method !== 'GET') return { status: 405 };
      const ip = req.socket?.remoteAddress ?? '?';
      const t = ahora();
      podar(t);
      const recientes = intentos.get(ip) ?? [];
      if (recientes.length >= MAX_INTENTOS) return { status: 429 };
      if (!igual(candidato, token)) { intentos.set(ip, [...recientes, t]); return { status: 401 }; }
      const s = randomBytes(24).toString('hex');
      sesiones.add(s);
      const seguro = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      return { status: 302, cookie: `${COOKIE}=${s}; HttpOnly; SameSite=Strict; Path=/${seguro}` };
    },
  };
}
