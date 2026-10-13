#!/usr/bin/env node
// /orquestador:dashboard: levanta el servidor si no está corriendo y abre el navegador.
// Uso: node lanzar.mjs [--no-abrir]
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cargarConfig } from '../scripts/lib/config.mjs';
import { esPrincipal } from '../scripts/lib/hook-io.mjs';

const SERVIDOR = fileURLToPath(new URL('./server.mjs', import.meta.url));

export async function estaCorriendo(puerto, intentos = 1) {
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${puerto}/salud`, { signal: AbortSignal.timeout(800) });
      if (r.ok && (await r.json()).app === 'orquestador-dashboard') return true;
    } catch { /* no responde todavía */ }
    if (i < intentos - 1) await new Promise((ok) => setTimeout(ok, 250));
  }
  return false;
}

export function comandoAbrir(url, plataforma = process.platform) {
  if (plataforma === 'win32') return ['cmd', ['/c', 'start', '', url]];
  if (plataforma === 'darwin') return ['open', [url]];
  return ['xdg-open', [url]];
}

async function main(argv) {
  const puerto = cargarConfig().puertoDashboard;
  const url = `http://127.0.0.1:${puerto}/`;
  if (!(await estaCorriendo(puerto))) {
    spawn(process.execPath, [SERVIDOR, String(puerto)], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    if (!(await estaCorriendo(puerto, 20))) {
      console.error(`No se pudo iniciar el dashboard en el puerto ${puerto}. ¿Lo usa otra aplicación? Cambia "puertoDashboard" en ~/.claude/orquestador/config.json.`);
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
