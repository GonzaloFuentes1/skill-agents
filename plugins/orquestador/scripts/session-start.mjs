#!/usr/bin/env node
// SessionStart: registra la raíz del plugin (para los stubs de status line) e inyecta el recordatorio.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rutaRaizPlugin } from './lib/rutas.mjs';
import { emitir } from './lib/eventos.mjs';
import { ejecutarHook, contexto, esPrincipal } from './lib/hook-io.mjs';

const RAIZ_PLUGIN = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
export const RECORDATORIO = 'Orquestador activo. Antes de delegar trabajo de varios pasos, carga la skill `orquestador:orquestar` '
  + 'y pasa siempre `model` y `effort` explícitos al tool Agent. Nunca agregues coautoría de Claude en commits ni PRs.';

export function manejarInicio(entrada, env = process.env, raizPlugin = RAIZ_PLUGIN) {
  try {
    const ruta = rutaRaizPlugin(env);
    mkdirSync(dirname(ruta), { recursive: true });
    writeFileSync(ruta, raizPlugin);
  } catch { /* sin raíz registrada la status line muestra un fallback */ }
  emitir({ tipo: 'sesion', session: entrada.session_id, cwd: entrada.cwd ?? null, fuente: entrada.source ?? null }, env);
  return contexto('SessionStart', RECORDATORIO);
}

if (esPrincipal(import.meta.url)) ejecutarHook(async (e) => manejarInicio(e));
