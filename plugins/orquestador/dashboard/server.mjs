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

const PUBLICO = fileURLToPath(new URL('./public/', import.meta.url));
const ESTATICOS = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/estado-vista.js': ['estado-vista.js', 'text/javascript; charset=utf-8'],
};
const MAX_HISTORIAL = 2000;
const LATIDO_MS = 15000;
const HOST_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

const enviar = (res, evento, datos) => res.write(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`);
const json = (res, datos) => res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }).end(JSON.stringify(datos));

export function crearServidor({ env = process.env, intervaloMs = 400 } = {}) {
  const seguidor = crearSeguidor(rutaEventos(env));
  const historial = parsearLineas(seguidor.leerNuevas()).slice(-MAX_HISTORIAL);
  const clientes = new Set();

  const tick = setInterval(() => {
    for (const e of parsearLineas(seguidor.leerNuevas())) {
      historial.push(e);
      if (historial.length > MAX_HISTORIAL) historial.shift();
      for (const c of clientes) enviar(c, 'evento', e);
    }
  }, intervaloMs);
  const latido = setInterval(() => { for (const c of clientes) c.write(': latido\n\n'); }, LATIDO_MS);

  const servidor = createServer((req, res) => {
    if (!HOST_LOCAL.test(req.headers.host ?? '')) { res.writeHead(403).end('Host no permitido'); return; }
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    const url = new URL(req.url, 'http://localhost');
    const estatico = ESTATICOS[url.pathname];
    if (estatico) {
      let cuerpo;
      try { cuerpo = readFileSync(join(PUBLICO, estatico[0])); } catch { res.writeHead(500).end('Archivo del dashboard no disponible'); return; }
      res.writeHead(200, { 'content-type': estatico[1], 'cache-control': 'no-store' }).end(cuerpo);
      return;
    }
    if (url.pathname === '/salud') return json(res, { ok: true, app: 'orquestador-dashboard' });
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
      req.on('close', () => clientes.delete(res));
      return;
    }
    res.writeHead(404).end('No encontrado');
  });

  servidor.detener = () => new Promise((ok) => {
    clearInterval(tick);
    clearInterval(latido);
    for (const c of clientes) c.end();
    servidor.closeAllConnections?.();
    servidor.close(() => ok());
  });
  return servidor;
}

if (esPrincipal(import.meta.url)) {
  const puerto = Number(process.argv[2]) || cargarConfig().puertoDashboard;
  crearServidor().listen(puerto, '127.0.0.1', () => console.log(`Dashboard del orquestador: http://127.0.0.1:${puerto}/`));
}
