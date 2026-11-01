#!/usr/bin/env node
// SessionStart: registra la raíz del plugin (para los stubs de status line) e inyecta el recordatorio.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rutaRaizPlugin } from './lib/rutas.mjs';
import { emitir } from './lib/eventos.mjs';
import { cargarConfig, normalizarRubrica, rubricaEsDeFabrica, migrarDefectos } from './lib/config.mjs';
import { ejecutarHook, contexto, esPrincipal } from './lib/hook-io.mjs';
import { cerrarDeSesion } from './lib/cierres.mjs';

const RAIZ_PLUGIN = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
export const RECORDATORIO = 'Orquestador activo. Antes de delegar trabajo de varios pasos, carga la skill `orquestador:orquestar` '
  + 'y pasa siempre `model` y `effort` explícitos al tool Agent. Nunca agregues coautoría de Claude en commits ni PRs.';
export const CANAL_DASHBOARD = 'Canal: dashboard. Si la tarea requiere 3 o más delegaciones o incluye una acción irreversible, '
  + 'primero presenta el plan en un bloque ```orquestador-plan con este JSON: {"titulo","etapas":[{"id":"E1","titulo","meta",'
  + '"agentes":[{"tipo","modelo","esfuerzo"}],"barrera":{"tipo":"auto|humana","criterio"}}],"riesgos":[{"titulo","planB"}]}, '
  + 'y termina el turno esperando aprobación. Al delegar una etapa, empieza la description del tool Agent con su id: "E2 · <meta>". '
  + 'En una barrera humana, termina el turno con la pregunta.';

export const RUBRICA_PERSONALIZADA = 'Rúbrica personalizada del usuario (manda sobre la de la skill)';

// Tabla Markdown con la rúbrica del usuario, o null si coincide con la de fábrica.
export function textoRubrica(rubrica) {
  if (rubricaEsDeFabrica(rubrica)) return null;
  const filas = normalizarRubrica(rubrica).map((f) => `| ${f.clase} | \`${f.modelo}\` / \`${f.esfuerzo}\` |`);
  return [`${RUBRICA_PERSONALIZADA}:`, '', '| Clase de tarea | model / effort |', '|---|---|', ...filas].join('\n');
}

export function manejarInicio(entrada, env = process.env, raizPlugin = RAIZ_PLUGIN) {
  if (env.ORQUESTADOR_CANAL === '') return null; // proceso auxiliar del dashboard (auto-mode, redactar): ni evento ni contexto
  try {
    const ruta = rutaRaizPlugin(env);
    mkdirSync(dirname(ruta), { recursive: true });
    writeFileSync(ruta, raizPlugin);
  } catch { /* sin raíz registrada la status line muestra un fallback */ }
  emitir({ tipo: 'sesion', session: entrada.session_id, cwd: entrada.cwd ?? null, fuente: entrada.source ?? null }, env);
  let rubrica = null;
  try { rubrica = textoRubrica(cargarConfig(env).rubrica); } catch { /* sin config legible manda la rúbrica de la skill */ }
  const partes = [RECORDATORIO, rubrica, env.ORQUESTADOR_CANAL === 'dashboard' ? CANAL_DASHBOARD : null].filter(Boolean);
  return contexto('SessionStart', partes.join('\n\n'));
}

// Al retomar una sesión, los agentes en segundo plano del proceso anterior ya no existen: se cierran como detenidos.
export async function cerrarAlRetomar(entrada, env = process.env) {
  if (env.ORQUESTADOR_CANAL === '' || entrada?.source !== 'resume') return 0;
  try { return await cerrarDeSesion(entrada.session_id, () => true, 'sesion-retomada', env); } catch { return 0; }
}

// Una vez por usuario (al subir VERSION_DEFECTOS): topes nuevos y todo el catálogo de agentes activado.
// Un agente propio con el mismo nombre que uno del catálogo no se toca. Devuelve el aviso para el usuario, o null.
export async function aplicarDefectos(env = process.env, raizPlugin = RAIZ_PLUGIN) {
  if (env.ORQUESTADOR_CANAL === '') return null;
  try {
    if (!migrarDefectos(env)) return null;
    const { cargarCatalogo, activarCatalogo } = await import('../dashboard/agentes.mjs');
    let activados = 0;
    for (const id of cargarCatalogo(raizPlugin).keys()) {
      try { activarCatalogo(id, { env, raizPlugin }); activados++; } catch { /* conflicto con un agente propio */ }
    }
    const c = cargarConfig(env);
    return `orquestador actualizado: hasta ${c.paraleloMax} agentes en paralelo, ${c.fableMaxPorSesion} delegaciones a Fable por sesión `
      + `y ${activados} agentes del catálogo activados (disponibles desde la próxima sesión).`;
  } catch { return null; }
}

if (esPrincipal(import.meta.url)) {
  ejecutarHook(async (e) => {
    await cerrarAlRetomar(e);
    const aviso = await aplicarDefectos();
    const salida = manejarInicio(e);
    return aviso && salida ? { ...salida, systemMessage: aviso } : salida;
  });
}
