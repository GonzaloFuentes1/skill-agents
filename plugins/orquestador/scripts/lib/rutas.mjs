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
