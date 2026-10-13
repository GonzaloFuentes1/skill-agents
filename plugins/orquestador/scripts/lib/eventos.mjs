import { appendFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { rutaEventos } from './rutas.mjs';

export function emitir(evento, env = process.env) {
  if (!evento) return;
  try {
    const ruta = rutaEventos(env);
    mkdirSync(dirname(ruta), { recursive: true });
    appendFileSync(ruta, JSON.stringify({ v: 1, ts: new Date().toISOString(), ...evento }) + '\n');
  } catch {
    // El log nunca bloquea ni rompe un hook.
  }
}

export function leerEventos({ session } = {}, env = process.env) {
  let texto;
  try { texto = readFileSync(rutaEventos(env), 'utf8'); } catch { return []; }
  const eventos = [];
  for (const linea of texto.split('\n')) {
    if (!linea.trim()) continue;
    try {
      const e = JSON.parse(linea);
      if (!session || e.session === session) eventos.push(e);
    } catch { /* línea corrupta: se ignora */ }
  }
  return eventos;
}
