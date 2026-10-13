import { readFileSync, writeFileSync, renameSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { rutaSesion } from './rutas.mjs';

const ESPERA_MAX_MS = 3000;
const LOCK_VENCIDO_MS = 5000;
const DOS_HORAS = 2 * 3600e3;
const DIEZ_MINUTOS = 10 * 60e3;
// En Windows un archivo/directorio abierto o pendiente de borrado da EPERM/EACCES/EBUSY en vez de EEXIST.
const TRANSITORIOS = new Set(['EEXIST', 'EPERM', 'EACCES', 'EBUSY']);

const dormir = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export function estadoVacio(session) {
  return { session, fableUsados: 0, activas: {}, costoUSD: 0, modeloPrincipal: null };
}

// Lectura tolerante (status line): ante cualquier problema devuelve el estado vacío.
// Lectura estricta (bajo lock): solo un archivo inexistente o corrupto da estado vacío; un error transitorio se reintenta.
export function leerEstado(session, env = process.env, { estricto = false } = {}) {
  const ruta = rutaSesion(session, env);
  for (let intento = 0; ; intento++) {
    let texto;
    try {
      texto = readFileSync(ruta, 'utf8');
    } catch (e) {
      if (e.code === 'ENOENT' || !estricto) return estadoVacio(session);
      if (intento >= 50) throw e;
      dormir(20);
      continue;
    }
    try { return { ...estadoVacio(session), ...JSON.parse(texto) }; } catch { return estadoVacio(session); }
  }
}

export function guardarEstado(estado, env = process.env) {
  const ruta = rutaSesion(estado.session, env);
  mkdirSync(dirname(ruta), { recursive: true });
  const json = JSON.stringify(estado);
  const tmp = `${ruta}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, json);
  for (let intento = 0; intento < 25; intento++) {
    try { renameSync(tmp, ruta); return; } catch (e) {
      if (!TRANSITORIOS.has(e.code)) { rmSync(tmp, { force: true }); throw e; }
      dormir(10 + intento * 5);
    }
  }
  // El rename sigue bloqueado por un lector: como el lock serializa a los escritores, se escribe en el lugar.
  rmSync(tmp, { force: true });
  writeFileSync(ruta, json);
}

async function tomarLock(lock) {
  const limite = Date.now() + ESPERA_MAX_MS;
  for (;;) {
    try { mkdirSync(lock); return; } catch (e) {
      if (!TRANSITORIOS.has(e.code)) throw e;
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
    const estado = leerEstado(session, env, { estricto: true });
    const resultado = await fn(estado);
    guardarEstado(estado, env);
    return resultado;
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

// Poda delegaciones colgadas: sin SubagentStart después de 10 min, o cualquiera después de 2 h.
export function limpiarVencidas(estado, ahora = Date.now(), maxMs = DOS_HORAS) {
  for (const [id, a] of Object.entries(estado.activas)) {
    const edad = ahora - (a.inicio ?? 0);
    if (edad > maxMs || (!a.agentId && edad > DIEZ_MINUTOS)) delete estado.activas[id];
  }
}
