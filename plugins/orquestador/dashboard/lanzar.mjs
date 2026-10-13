#!/usr/bin/env node
// /orquestador:dashboard: levanta el servidor si no está corriendo (o si corre otra versión) y abre el navegador.
// Uso: node lanzar.mjs [--no-abrir]
import { spawn } from 'node:child_process';
import { openSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarConfig } from '../scripts/lib/config.mjs';
import { dirBase } from '../scripts/lib/rutas.mjs';
import { esPrincipal } from '../scripts/lib/hook-io.mjs';
import { VERSION, RAIZ_DASHBOARD } from './server.mjs';

const SERVIDOR = fileURLToPath(new URL('./server.mjs', import.meta.url));

// Devuelve la respuesta de /salud si quien escucha es el dashboard; si no, null.
export async function consultarSalud(puerto, intentos = 1) {
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${puerto}/salud`, { signal: AbortSignal.timeout(800) });
      if (r.ok) {
        const s = await r.json();
        if (s.app === 'orquestador-dashboard') return s;
      }
    } catch { /* no responde todavía */ }
    if (i < intentos - 1) await new Promise((ok) => setTimeout(ok, 250));
  }
  return null;
}

export const estaCorriendo = async (puerto, intentos = 1) => (await consultarSalud(puerto, intentos)) !== null;

// Un servidor de otra versión u otra instalación del plugin sirve una UI vieja: hay que reemplazarlo.
export const necesitaReinicio = (salud, local) => salud?.version !== local.version || salud?.raiz !== local.raiz;

export function comandoAbrir(url, plataforma = process.platform) {
  if (plataforma === 'win32') return ['cmd', ['/c', 'start', '', url]];
  if (plataforma === 'darwin') return ['open', [url]];
  return ['xdg-open', [url]];
}

async function main(argv) {
  const puerto = cargarConfig().puertoDashboard;
  const url = `http://127.0.0.1:${puerto}/`;
  const log = join(dirBase(), 'dashboard.log');
  let salud = await consultarSalud(puerto);
  if (salud && necesitaReinicio(salud, { version: VERSION, raiz: RAIZ_DASHBOARD })) {
    try { process.kill(salud.pid); } catch { /* ya no existe */ }
    for (let i = 0; i < 20 && (await estaCorriendo(puerto)); i++) await new Promise((ok) => setTimeout(ok, 150));
    salud = null;
  }
  if (!salud) {
    mkdirSync(dirBase(), { recursive: true });
    const fd = openSync(log, 'a');
    spawn(process.execPath, [SERVIDOR, String(puerto)], { detached: true, stdio: ['ignore', fd, fd], windowsHide: true }).unref();
    if (!(await estaCorriendo(puerto, 20))) {
      console.error(`No se pudo iniciar el dashboard en el puerto ${puerto}. Revisa ${log}; si el puerto lo usa otra aplicación, cambia "puertoDashboard" en ~/.claude/orquestador/config.json.`);
      process.exitCode = 1;
      return;
    }
  }
  if (!argv.includes('--no-abrir')) {
    const [cmd, args] = comandoAbrir(url);
    spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  }
  console.log(`Dashboard del orquestador: ${url}`);
}

if (esPrincipal(import.meta.url)) main(process.argv.slice(2));
