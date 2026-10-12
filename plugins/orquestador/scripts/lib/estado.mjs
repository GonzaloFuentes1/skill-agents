import { readFileSync, writeFileSync, renameSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { rutaSesion } from './rutas.mjs';

const ESPERA_MAX_MS = 3000;
const LOCK_VENCIDO_MS = 5000;
const DOS_HORAS = 2 * 3600e3;

export function estadoVacio(session) {
  return { session, fableUsados: 0, activas: {}, costoUSD: 0, modeloPrincipal: null };
}

export function leerEstado(session, env = process.env) {
  try {
    return { ...estadoVacio(session), ...JSON.parse(readFileSync(rutaSesion(session, env), 'utf8')) };
  } catch {
    return estadoVacio(session);
  }
}

export function guardarEstado(estado, env = process.env) {
  const ruta = rutaSesion(estado.session, env);
  mkdirSync(dirname(ruta), { recursive: true });
  const tmp = `${ruta}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(estado));
  renameSync(tmp, ruta);
}

async function tomarLock(lock) {
  const limite = Date.now() + ESPERA_MAX_MS;
  for (;;) {
    try { mkdirSync(lock); return; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        if (Date.now() - statSync(lock).mtimeMs > LOCK_VENCIDO_MS) { rmSync(lock, { recursive: true, force: true }); continue; }
      } catch { /* el lock desapareció entre medio: reintentar */ }
      if (Date.now() > limite) throw new Error('no se pudo tomar el lock del estado');
      await new Promise((r) => setTimeout(r, 10 + Math.random() * 15));
    }
  }
}

// Lee el estado, ejecuta fn (que lo muta), lo guarda y libera el lock. Devuelve lo que devuelva fn.
export async function conEstado(session, fn, env = process.env) {
  const lock = `${rutaSesion(session, env)}.lock`;
  mkdirSync(dirname(lock), { recursive: true });
  await tomarLock(lock);
  try {
    const estado = leerEstado(session, env);
    const resultado = await fn(estado);
    guardarEstado(estado, env);
    return resultado;
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

export function limpiarVencidas(estado, ahora = Date.now(), maxMs = DOS_HORAS) {
  for (const [id, a] of Object.entries(estado.activas)) {
    if (ahora - (a.inicio ?? 0) > maxMs) delete estado.activas[id];
  }
}
