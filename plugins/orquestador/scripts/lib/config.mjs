import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { rutaConfig } from './rutas.mjs';

// Precios en USD por millón de tokens (lista oficial vigente al 2026-10-06; escritura de caché = 1,25× entrada).
export const CONFIG_DEFECTO = Object.freeze({
  fableMaxPorSesion: 2,
  paraleloMax: 4,
  puertoDashboard: 4321,
  modelosOrquestador: ['opus', 'fable'],
  ramasProtegidas: ['main', 'master'],
  precios: {
    haiku: { entrada: 0.1, salida: 0.5, cacheLectura: 0.01, cacheEscritura: 0.125 },
    sonnet: { entrada: 2, salida: 10, cacheLectura: 0.2, cacheEscritura: 2.5 },
    opus: { entrada: 4, salida: 20, cacheLectura: 0.2, cacheEscritura: 5 },
    fable: { entrada: 10, salida: 50, cacheLectura: 0.25, cacheEscritura: 12.5 },
  },
});

export function cargarConfig(env = process.env) {
  try {
    const usuario = JSON.parse(readFileSync(rutaConfig(env), 'utf8'));
    return { ...CONFIG_DEFECTO, ...usuario, precios: { ...CONFIG_DEFECTO.precios, ...(usuario.precios ?? {}) } };
  } catch {
    return { ...CONFIG_DEFECTO };
  }
}

export function asegurarConfig(env = process.env) {
  const ruta = rutaConfig(env);
  if (existsSync(ruta)) return;
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, JSON.stringify(CONFIG_DEFECTO, null, 2) + '\n');
}
