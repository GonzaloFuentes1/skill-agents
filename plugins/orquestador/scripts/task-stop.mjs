#!/usr/bin/env node
// PostToolUse(TaskStop): un agente en segundo plano detenido no dispara SubagentStop. Se cierra aquí por su agentId
// (el task_id de TaskStop) o por el nombre con que se lanzó.
import { cerrarDeSesion } from './lib/cierres.mjs';
import { ejecutarHook, esPrincipal } from './lib/hook-io.mjs';

export async function manejar(entrada, env = process.env) {
  const tarea = entrada?.tool_input?.task_id ?? entrada?.tool_input?.shell_id;
  if (!tarea) return null;
  await cerrarDeSesion(entrada.session_id, (id, a) => a.agentId === tarea || (a.nombre != null && a.nombre === tarea), 'task-stop', env);
  return null;
}

if (esPrincipal(import.meta.url)) ejecutarHook((e) => manejar(e));
