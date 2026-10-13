#!/usr/bin/env node
// Servidor local del dashboard: sirve la página y reenvía events.jsonl por SSE (historial + vivo).
// Uso: node server.mjs [puerto]
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarConfig } from '../scripts/lib/config.mjs';
import { rutaEventos } from '../scripts/lib/rutas.mjs';
import { leerEstado } from '../scripts/lib/estado.mjs';
import { esPrincipal } from '../scripts/lib/hook-io.mjs';
import { crearSeguidor, parsearLineas, listarSesiones } from './datos.mjs';

export const RAIZ_DASHBOARD = fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
export const VERSION = (() => {
  try { return JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8')).version; } catch { return null; }
})();
const PUBLICO = join(RAIZ_DASHBOARD, 'public');
const ESTATICOS = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/estado-vista.js': ['estado-vista.js', 'text/javascript; charset=utf-8'],
};
const MAX_HISTORIAL = 2000;
const COLA_INICIAL_BYTES = 4 * 1024 * 1024; // al arrancar se lee solo el final del log
const LATIDO_MS = 15000;
const INACTIVIDAD_MS = 30 * 60 * 1000;
const HOST_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

const enviar = (res, evento, datos) => res.write(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`);
const json = (res, datos) => res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }).end(JSON.stringify(datos));

export function crearServidor({ env = process.env, intervaloMs = 400, inactividadMs = null, alInactivo = () => {} } = {}) {
  const seguidor = crearSeguidor(rutaEventos(env), { cola: COLA_INICIAL_BYTES });
  const historial = parsearLineas(seguidor.leerNuevas()).slice(-MAX_HISTORIAL);
  const clientes = new Set();
  let ultimaActividad = Date.now();

  const tick = setInterval(() => {
    try {
      for (const e of parsearLineas(seguidor.leerNuevas())) {
        historial.push(e);
        if (historial.length > MAX_HISTORIAL) historial.shift();
        for (const c of clientes) enviar(c, 'evento', e);
      }
    } catch { /* un error transitorio no debe tumbar el servidor */ }
  }, intervaloMs);
  const latido = setInterval(() => { for (const c of clientes) c.write(': latido\n\n'); }, LATIDO_MS);
  // Sin pestañas conectadas durante `inactividadMs`, el servidor separado se apaga solo.
  const vigilancia = inactividadMs ? setInterval(() => {
    if (clientes.size > 0) { ultimaActividad = Date.now(); return; }
    if (Date.now() - ultimaActividad > inactividadMs) alInactivo();
  }, Math.max(20, Math.min(inactividadMs / 2, 60000))) : null;

  function atender(req, res) {
    if (!HOST_LOCAL.test(req.headers.host ?? '')) { res.writeHead(403).end('Host no permitido'); return; }
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400).end('Petición inválida'); return; }
    const estatico = ESTATICOS[url.pathname];
    if (estatico) {
      let cuerpo;
      try { cuerpo = readFileSync(join(PUBLICO, estatico[0])); } catch { res.writeHead(500).end('Archivo del dashboard no disponible'); return; }
      res.writeHead(200, { 'content-type': estatico[1], 'cache-control': 'no-store' }).end(cuerpo);
      return;
    }
    if (url.pathname === '/salud') return json(res, { ok: true, app: 'orquestador-dashboard', version: VERSION, raiz: RAIZ_DASHBOARD, pid: process.pid });
    if (url.pathname === '/sesiones') return json(res, listarSesiones(historial));
    if (url.pathname === '/estado') {
      const session = url.searchParams.get('session');
      const c = cargarConfig(env);
      return json(res, {
        estado: session ? leerEstado(session, env) : null,
        config: { fableMaxPorSesion: c.fableMaxPorSesion, paraleloMax: c.paraleloMax, modelosOrquestador: c.modelosOrquestador },
      });
    }
    if (url.pathname === '/eventos') {
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write('retry: 2000\n\n');
      for (const e of historial) enviar(res, 'evento', e);
      enviar(res, 'replay-fin', { total: historial.length });
      clientes.add(res);
      ultimaActividad = Date.now();
      res.on('close', () => { clientes.delete(res); ultimaActividad = Date.now(); });
      return;
    }
    res.writeHead(404).end('No encontrado');
  }

  const servidor = createServer((req, res) => {
    try { atender(req, res); } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
  servidor.on('clientError', (_err, socket) => { if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); });

  servidor.detener = () => new Promise((ok) => {
    clearInterval(tick);
    clearInterval(latido);
    if (vigilancia) clearInterval(vigilancia);
    for (const c of clientes) c.end();
    servidor.closeAllConnections?.();
    servidor.close(() => ok());
  });
  return servidor;
}

if (esPrincipal(import.meta.url)) {
  const puerto = Number(process.argv[2]) || cargarConfig().puertoDashboard;
  crearServidor({ inactividadMs: INACTIVIDAD_MS, alInactivo: () => process.exit(0) })
    .listen(puerto, '127.0.0.1', () => console.log(`Dashboard del orquestador: http://127.0.0.1:${puerto}/`));
}
