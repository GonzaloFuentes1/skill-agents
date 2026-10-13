#!/usr/bin/env node
// Servidor local del dashboard: estáticos, SSE (events.jsonl + chat), API de conversaciones y autenticación.
// Uso: node server.mjs [puerto]
import { createServer } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { join, extname, dirname, basename, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { cargarConfig } from '../scripts/lib/config.mjs';
import { rutaEventos } from '../scripts/lib/rutas.mjs';
import { leerEstado } from '../scripts/lib/estado.mjs';
import { esPrincipal } from '../scripts/lib/hook-io.mjs';
import { crearSeguidor, parsearLineas, listarSesiones } from './datos.mjs';
import { crearGestor, ErrorConversacion } from './conversaciones.mjs';
import { crearAuth, validarRemoto, esTodas } from './auth.mjs';
import { historialDe } from './historial.mjs';
import { pasosAgente } from './pasos-agente.mjs';

export const RAIZ_DASHBOARD = fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
export const VERSION = (() => {
  try { return JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8')).version; } catch { return null; }
})();
const PUBLICO = join(RAIZ_DASHBOARD, 'public');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const PROTEGIDAS = new Set(['/eventos', '/sesiones', '/estado']);
const MAX_HISTORIAL = 2000;
const COLA_INICIAL_BYTES = 4 * 1024 * 1024; // al arrancar se lee solo el final del log
const MAX_CUERPO = 64 * 1024;
const LATIDO_MS = 15000;
const INACTIVIDAD_MS = 30 * 60 * 1000;

const enviar = (res, evento, datos) => res.write(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`);
const json = (res, datos, status = 200) => res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }).end(JSON.stringify(datos));

// Lista blanca de estáticos: solo los archivos de public/ con extensión conocida.
export function listarEstaticos(dir = PUBLICO) {
  const mapa = { '/': 'index.html' };
  for (const f of readdirSync(dir)) if (TIPOS[extname(f)]) mapa[`/${f}`] = f;
  return mapa;
}

// Autocompletado de "Nueva conversación": subcarpetas visibles que empiezan con el prefijo (máx. 20).
export function carpetasCon(prefijo) {
  const p = String(prefijo ?? '').trim();
  const terminaEnSeparador = /[\\/]$/.test(p);
  const base = !p ? homedir() : terminaEnSeparador ? p : dirname(p);
  const inicio = p && !terminaEnSeparador ? basename(p).toLowerCase() : '';
  if (!isAbsolute(base)) return [];
  try {
    return readdirSync(base, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name.toLowerCase().startsWith(inicio))
      .slice(0, 20)
      .map((d) => join(base, d.name));
  } catch {
    return [];
  }
}

// Interfaces donde escuchar. En modo remoto con una IP concreta (p. ej. la de Tailscale) se escucha además en
// 127.0.0.1: lanzar.mjs consulta /salud y abre el navegador local ahí.
export function hostsEscucha(remoto = {}) {
  const principal = validarRemoto(remoto);
  return remoto.activo && !['127.0.0.1', 'localhost'].includes(principal) && !esTodas(principal) ? [principal, '127.0.0.1'] : [principal];
}

function leerCuerpo(req) {
  return new Promise((ok, mal) => {
    let texto = '';
    let bytes = 0;
    req.setEncoding('utf8');
    req.on('data', (d) => {
      bytes += Buffer.byteLength(d);
      if (bytes > MAX_CUERPO) { mal(new ErrorConversacion(413, 'El cuerpo es demasiado grande')); req.resume(); return; }
      texto += d;
    });
    req.on('end', () => {
      if (bytes > MAX_CUERPO) return;
      let v;
      try { v = texto ? JSON.parse(texto) : {}; } catch { mal(new ErrorConversacion(400, 'JSON inválido')); return; }
      if (!v || typeof v !== 'object' || Array.isArray(v)) { mal(new ErrorConversacion(400, 'El cuerpo debe ser un objeto JSON')); return; }
      ok(v);
    });
    req.on('error', mal);
  });
}

export function crearServidor({ env = process.env, intervaloMs = 400, inactividadMs = null, alInactivo = () => {}, gestor = null, spawnFn } = {}) {
  const config = cargarConfig(env);
  const auth = crearAuth({ env, remoto: config.remoto });
  const conversaciones = gestor ?? crearGestor({ env, spawnFn });
  const estaticos = listarEstaticos();
  const seguidor = crearSeguidor(rutaEventos(env), { cola: COLA_INICIAL_BYTES });
  const historial = parsearLineas(seguidor.leerNuevas()).slice(-MAX_HISTORIAL);
  const clientes = new Set();
  const transcripts = new Map();
  let ultimaActividad = Date.now();

  const recordar = (e) => {
    if ((e?.tipo === 'agente-inicio' || e?.tipo === 'fin') && e.agentId && e.transcript) transcripts.set(`${e.session}:${e.agentId}`, e.transcript);
  };
  for (const e of historial) recordar(e);

  const tick = setInterval(() => {
    try {
      for (const e of parsearLineas(seguidor.leerNuevas())) {
        recordar(e);
        historial.push(e);
        if (historial.length > MAX_HISTORIAL) historial.shift();
        for (const c of clientes) enviar(c, 'evento', e);
      }
    } catch { /* un error transitorio no debe tumbar el servidor */ }
  }, intervaloMs);
  const quitarOyente = conversaciones.on((e) => { for (const c of clientes) enviar(c, 'chat', e); });
  const latido = setInterval(() => { for (const c of clientes) c.write(': latido\n\n'); }, LATIDO_MS);
  // Sin pestañas ni conversaciones vivas durante `inactividadMs`, el servidor separado se apaga solo.
  const vigilancia = inactividadMs ? setInterval(() => {
    if (clientes.size > 0 || conversaciones.hayProcesos()) { ultimaActividad = Date.now(); return; }
    if (Date.now() - ultimaActividad > inactividadMs) alInactivo();
  }, Math.max(20, Math.min(inactividadMs / 2, 60000))) : null;

  async function api(req, res, url) {
    let partes;
    try { partes = url.pathname.split('/').filter(Boolean).map(decodeURIComponent); } catch { throw new ErrorConversacion(400, 'Ruta mal codificada'); }
    const [, recurso, id, accion, extra] = partes;
    if (req.method === 'GET') {
      if (recurso === 'conversaciones' && !id) return json(res, conversaciones.listar());
      if (recurso === 'conversaciones' && accion === 'historial') {
        const c = conversaciones.obtener(id);
        const h = historialDe(c.sessionId, env);
        return json(res, { conversacion: c, mensajes: h.mensajes, aviso: h.aviso, permisos: conversaciones.pendientesDe(id) });
      }
      if (recurso === 'pasos' && id && accion && !extra) {
        if (!/^[A-Za-z0-9_-]+$/.test(accion)) throw new ErrorConversacion(400, 'Identificador de agente inválido');
        const ruta = transcripts.get(`${id}:${accion}`);
        const desde = Number.parseInt(url.searchParams.get('desde') ?? '0', 10) || 0;
        return json(res, ruta ? pasosAgente(ruta, desde) : { pasos: [], siguiente: 0, existe: false });
      }
      if (recurso === 'carpetas') return json(res, carpetasCon(url.searchParams.get('prefijo')));
      throw new ErrorConversacion(404, 'No encontrado');
    }
    if (req.method !== 'POST') throw new ErrorConversacion(405, 'Método no permitido');
    if (!auth.origenValido(req)) throw new ErrorConversacion(403, 'Origen no permitido');
    const cuerpo = await leerCuerpo(req);
    if (recurso === 'conversaciones' && !id) return json(res, conversaciones.crear(cuerpo), 201);
    if (recurso === 'conversaciones') {
      switch (accion) {
        case 'mensajes': conversaciones.enviar(id, cuerpo.texto); return json(res, { ok: true }, 202);
        case 'permisos': conversaciones.responderPermiso(id, extra, cuerpo.decision); return json(res, { ok: true });
        case 'modo': return json(res, conversaciones.cambiarModo(id, cuerpo.modo));
        case 'titulo': return json(res, conversaciones.renombrar(id, cuerpo.titulo));
        case 'interrumpir': conversaciones.interrumpir(id); return json(res, { ok: true });
        case 'cerrar': conversaciones.cerrar(id); return json(res, { ok: true });
        default:
      }
    }
    throw new ErrorConversacion(404, 'No encontrado');
  }

  async function atender(req, res) {
    if (!auth.hostPermitido(req.headers.host)) { res.writeHead(403).end('Host no permitido'); return; }
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400).end('Petición inválida'); return; }
    if (url.pathname === '/salud') return json(res, { ok: true, app: 'orquestador-dashboard', version: VERSION, raiz: RAIZ_DASHBOARD, pid: process.pid });
    if (url.pathname === '/' && url.searchParams.has('t')) {
      const r = auth.canjear(req, url.searchParams.get('t'));
      if (r.status === 302) { res.writeHead(302, { 'set-cookie': r.cookie, location: '/', 'cache-control': 'no-store' }).end(); return; }
      const textos = { 405: 'Método no permitido', 429: 'Demasiados intentos; espera un minuto.' };
      res.writeHead(r.status, { 'content-type': 'text/plain; charset=utf-8' }).end(textos[r.status] ?? 'Token inválido. Abre el dashboard con /orquestador:dashboard.');
      return;
    }
    const estatico = req.method === 'GET' || req.method === 'HEAD' ? estaticos[url.pathname] : null;
    if (estatico) {
      let cuerpo;
      try { cuerpo = readFileSync(join(PUBLICO, estatico)); } catch { res.writeHead(500).end('Archivo del dashboard no disponible'); return; }
      res.writeHead(200, { 'content-type': TIPOS[extname(estatico)], 'cache-control': 'no-store', 'content-length': cuerpo.length });
      res.end(req.method === 'HEAD' ? undefined : cuerpo);
      return;
    }
    const esApi = url.pathname.startsWith('/api/');
    if (!esApi && !PROTEGIDAS.has(url.pathname)) { res.writeHead(404).end('No encontrado'); return; }
    if (!auth.autenticado(req)) return json(res, { error: 'Falta iniciar sesión. Abre el dashboard con /orquestador:dashboard.' }, 401);
    if (esApi) return api(req, res, url);
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    if (url.pathname === '/sesiones') return json(res, listarSesiones(historial));
    if (url.pathname === '/estado') {
      const session = url.searchParams.get('session');
      const c = cargarConfig(env);
      return json(res, {
        estado: session ? leerEstado(session, env) : null,
        config: { fableMaxPorSesion: c.fableMaxPorSesion, paraleloMax: c.paraleloMax, modelosOrquestador: c.modelosOrquestador },
      });
    }
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write('retry: 2000\n\n');
    for (const e of historial) enviar(res, 'evento', e);
    enviar(res, 'replay-fin', { total: historial.length });
    clientes.add(res);
    ultimaActividad = Date.now();
    res.on('close', () => { clientes.delete(res); ultimaActividad = Date.now(); });
  }

  const manejador = (req, res) => {
    atender(req, res).catch((e) => {
      if (res.headersSent) { res.end(); return; }
      if (e instanceof ErrorConversacion) json(res, { error: e.message }, e.status);
      else json(res, { error: 'Error interno del dashboard' }, 500);
    });
  };
  const nuevoHttp = () => createServer(manejador)
    .on('clientError', (_err, socket) => { if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); });
  const servidor = nuevoHttp();
  const extras = [];
  servidor.auth = auth;
  servidor.conversaciones = conversaciones;

  // Otro listener (otra interfaz) con el mismo estado: mismas sesiones, conversaciones y clientes SSE.
  servidor.escucharTambien = (puerto, host) => new Promise((ok, mal) => {
    const s = nuevoHttp();
    s.once('error', mal);
    s.listen(puerto, host, () => { s.off('error', mal); extras.push(s); ok(s); });
  });

  servidor.clientesSse = () => clientes.size;
  servidor.detener = async () => {
    clearInterval(tick);
    clearInterval(latido);
    if (vigilancia) clearInterval(vigilancia);
    if (typeof quitarOyente === 'function') quitarOyente();
    for (const c of clientes) c.end();
    clientes.clear();
    await conversaciones.apagar();
    await Promise.all([servidor, ...extras].map((s) => {
      s.closeAllConnections?.();
      return new Promise((ok) => s.close(() => ok()));
    }));
  };
  return servidor;
}

if (esPrincipal(import.meta.url)) {
  const config = cargarConfig();
  const puerto = Number(process.argv[2]) || config.puertoDashboard;
  let hosts;
  try { hosts = hostsEscucha(config.remoto); } catch (e) { console.error(e.message); process.exit(1); }
  const srv = crearServidor({ inactividadMs: INACTIVIDAD_MS, alInactivo: () => srv.detener().then(() => process.exit(0)) });
  for (const senal of ['SIGINT', 'SIGTERM']) process.on(senal, () => srv.detener().then(() => process.exit(0)));
  const url = (h) => `http://${h.includes(':') ? `[${h}]` : h}:${puerto}/`;
  const [host, ...otros] = hosts;
  srv.listen(puerto, host, () => {
    console.log(`Dashboard del orquestador: ${url(host)}`);
    for (const h of otros) {
      srv.escucharTambien(puerto, h)
        .then(() => console.log(`También en ${url(h)}`))
        .catch((e) => console.error(`No se pudo escuchar también en ${url(h)}: ${e.message}`));
    }
  });
}
