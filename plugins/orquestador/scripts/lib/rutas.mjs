import { homedir } from 'node:os';
import { join } from 'node:path';

export function dirBase(env = process.env) {
  return env.ORQUESTADOR_HOME || join(homedir(), '.claude', 'orquestador');
}
export function limpiarId(id) {
  return String(id || 'sin-sesion').replace(/[^A-Za-z0-9_-]/g, '_');
}
export const rutaEventos = (env = process.env) => join(dirBase(env), 'events.jsonl');
export const rutaSesion = (id, env = process.env) => join(dirBase(env), 'sessions', `${limpiarId(id)}.json`);
export const rutaConfig = (env = process.env) => join(dirBase(env), 'config.json');
export const rutaRaizPlugin = (env = process.env) => join(dirBase(env), 'plugin-root.txt');
export const rutaConversaciones = (env = process.env) => join(dirBase(env), 'conversaciones.json');
export const rutaToken = (env = process.env) => join(dirBase(env), 'token');
// Archivos que el usuario adjunta en el chat del dashboard, una carpeta por conversación.
export const rutaAdjuntos = (idConversacion, env = process.env) => join(dirBase(env), 'adjuntos', limpiarId(idConversacion));

// Directorio de Claude Code del usuario: respeta CLAUDE_CONFIG_DIR (los tests lo redirigen a un temporal).
export const dirClaude = (env = process.env) => env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
export const rutaSettingsUsuario = (env = process.env) => join(dirClaude(env), 'settings.json');
export const rutaAgentesUsuario = (env = process.env) => join(dirClaude(env), 'agents');
export const rutaAgentesProyecto = (cwd) => join(cwd, '.claude', 'agents');
