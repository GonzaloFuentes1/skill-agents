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
export const CANAL_DASHBOARD = 'Canal: dashboard. Si la tarea requiere 3 o más delegaciones o incluye una acción irreversible, '
  + 'primero presenta el plan en un bloque ```orquestador-plan con este JSON: {"titulo","etapas":[{"id":"E1","titulo","meta",'
  + '"agentes":[{"tipo","modelo","esfuerzo"}],"barrera":{"tipo":"auto|humana","criterio"}}],"riesgos":[{"titulo","planB"}]}, '
  + 'y termina el turno esperando aprobación. Al delegar una etapa, empieza la description del tool Agent con su id: "E2 · <meta>". '
  + 'En una barrera humana, termina el turno con la pregunta.';

export function manejarInicio(entrada, env = process.env, raizPlugin = RAIZ_PLUGIN) {
  try {
    const ruta = rutaRaizPlugin(env);
    mkdirSync(dirname(ruta), { recursive: true });
    writeFileSync(ruta, raizPlugin);
  } catch { /* sin raíz registrada la status line muestra un fallback */ }
  emitir({ tipo: 'sesion', session: entrada.session_id, cwd: entrada.cwd ?? null, fuente: entrada.source ?? null }, env);
  return contexto('SessionStart', env.ORQUESTADOR_CANAL === 'dashboard' ? `${RECORDATORIO}\n\n${CANAL_DASHBOARD}` : RECORDATORIO);
}

if (esPrincipal(import.meta.url)) ejecutarHook(async (e) => manejarInicio(e));
