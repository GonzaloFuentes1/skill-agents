#!/usr/bin/env node
// PreToolUse(Bash|PowerShell): niega operaciones git que violan el flujo estricto.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { cargarConfig } from './lib/config.mjs';
import { emitir } from './lib/eventos.mjs';
import { ejecutarHook, denegar, esPrincipal } from './lib/hook-io.mjs';
import { evaluarComando } from './git-hooks/reglas-git.mjs';

const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

export function ctxReal(cwd, config) {
  return {
    cwd,
    ramasProtegidas: config.ramasProtegidas,
    ramaActual: (dir) => { try { return git(['-C', dir, 'branch', '--show-current']).trim(); } catch { return ''; } },
    esRama: (dir, n) => { try { git(['-C', dir, 'show-ref', '--verify', '--quiet', `refs/heads/${n}`]); return true; } catch { return false; } },
    leerArchivo: (ruta) => readFileSync(ruta, 'utf8'),
  };
}

export async function manejar(entrada, env = process.env, ctx = null) {
  const comando = entrada?.tool_input?.command;
  if (typeof comando !== 'string' || !/\b(git|gh)\b/.test(comando)) return null;
  const config = cargarConfig(env);
  const v = evaluarComando(comando, ctx ?? ctxReal(entrada.cwd ?? process.cwd(), config));
  if (!v) return null;
  emitir({ tipo: 'bloqueo', session: entrada.session_id, regla: v.regla, motivo: v.motivo }, env);
  return denegar('PreToolUse', `[orquestador] ${v.motivo}`);
}

if (esPrincipal(import.meta.url)) ejecutarHook((e) => manejar(e));
