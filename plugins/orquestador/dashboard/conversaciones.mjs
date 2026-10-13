// Registro y ciclo de vida de las conversaciones del dashboard. Persiste en ~/.claude/orquestador/conversaciones.json.
import { readFileSync, writeFileSync, renameSync, mkdirSync, statSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { rutaConversaciones } from '../scripts/lib/rutas.mjs';
import { cargarConfig } from '../scripts/lib/config.mjs';
import { abrirProceso, resolverBinario, MODOS } from './proceso-claude.mjs';

export class ErrorConversacion extends Error {
  // extra: datos que acompañan al error en la respuesta JSON (p. ej. { errores: { campo: mensaje } }).
  constructor(status, mensaje, extra = null) { super(mensaje); this.status = status; this.extra = extra; }
}

const EN_CURSO = new Set(['trabajando', 'esperando-permiso']);
const TITULO_NUEVO = 'Nueva conversación';
const DE_ARCHIVO = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

const TIPOS_CC = new Set(['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert']);
const comoEtiqueta = (m) => (m && TIPOS_CC.has(m[1].toLowerCase()) ? `[${m[1].toUpperCase()}]` : null);

// Solo tipos de Conventional Commits: "Ojo: x", "https://x" o "dependabot/x" no son etiquetas.
export function etiquetaDe({ rama, titulo } = {}) {
  return comoEtiqueta(/^([a-z]+)(\([^)]*\))?!?:/i.exec(titulo ?? '')) ?? comoEtiqueta(/^([a-z]+)\//i.exec(rama ?? ''));
}

export function clavePermiso(herramienta, entrada = {}) {
  if (herramienta === 'Bash' || herramienta === 'PowerShell') return `${herramienta}:${entrada.command ?? ''}`;
  if (DE_ARCHIVO.has(herramienta)) return `${herramienta}:${entrada.file_path ?? entrada.notebook_path ?? ''}`;
  return `${herramienta}:${JSON.stringify(entrada)}`;
}

function ramaDe(cwd) {
  try {
    return execFileSync('git', ['-C', cwd, 'branch', '--show-current'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000, windowsHide: true }).trim() || null;
  } catch { return null; }
}

function leerLista(env) {
  try { const l = JSON.parse(readFileSync(rutaConversaciones(env), 'utf8')); return Array.isArray(l) ? l : []; } catch { return []; }
}

const dormir = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const INTENTOS_GUARDAR = 3;

export function crearGestor({
  env = process.env, spawnFn, ahora = () => new Date().toISOString(),
  inactividadProcesoMs = 10 * 60 * 1000, // un proceso en "lista" sin mensajes se cierra; el siguiente lo retoma con --resume
  esperaInterrupcionMs = 10_000, // si tras interrumpir no llega el result, se cierra el proceso
} = {}) {
  // Un proceso de una vida anterior del servidor no se puede recuperar: al cerrarse su stdin, claude -p termina solo.
  const lista = leerLista(env).map((c) => (EN_CURSO.has(c.estado) || c.pid ? { ...c, estado: 'inactiva', pid: null } : c));
  const procesos = new Map();
  const pendientes = new Map();
  const reglas = new Map();
  const cerrando = new Set();
  const interrumpidas = new Set();
  const temporizadores = { inactividad: new Map(), interrupcion: new Map() };
  const emisor = new EventEmitter();
  emisor.setMaxListeners(0);

  // Un error de disco (antivirus, OneDrive, disco lleno) no debe tumbar el servidor: se reintenta y se informa.
  const guardar = () => {
    const ruta = rutaConversaciones(env);
    const tmp = `${ruta}.${process.pid}.tmp`;
    for (let intento = 1; ; intento++) {
      try {
        mkdirSync(dirname(ruta), { recursive: true });
        writeFileSync(tmp, JSON.stringify(lista, null, 2));
        renameSync(tmp, ruta);
        return;
      } catch (e) {
        if (intento < INTENTOS_GUARDAR) { dormir(50); continue; }
        try { rmSync(tmp, { force: true }); } catch { /* nada que limpiar */ }
        console.error(`No se pudo guardar ${ruta}: ${e.message}`);
        return;
      }
    }
  };
  const armar = (tipo, id, ms, fn) => {
    desarmar(tipo, id);
    if (ms > 0) temporizadores[tipo].set(id, setTimeout(() => { temporizadores[tipo].delete(id); fn(); }, ms).unref());
  };
  const desarmar = (tipo, id) => { clearTimeout(temporizadores[tipo].get(id)); temporizadores[tipo].delete(id); };
  const emitir = (e) => emisor.emit('chat', e);
  const publica = (c) => ({ ...c, etiqueta: etiquetaDe(c) });
  const emitirEstado = (c) => emitir({ tipo: 'chat:estado', conversacion: c.id, conv: publica(c) });
  const buscar = (id) => {
    const c = lista.find((x) => x.id === id);
    if (!c) throw new ErrorConversacion(404, 'No existe esa conversación');
    return c;
  };
  const enCurso = () => lista.filter((c) => EN_CURSO.has(c.estado)).length;
  if (lista.length) guardar();

  function asegurarProceso(c) {
    if (procesos.has(c.id)) return procesos.get(c.id);
    const binario = resolverBinario(cargarConfig(env), env);
    if (!binario) throw new ErrorConversacion(500, 'No encontré el binario de Claude Code; define rutaClaude en config.json');
    const p = abrirProceso({ cwd: c.cwd, sessionId: c.sessionId, modo: c.modo, binario, env, spawnFn });
    procesos.set(c.id, p);
    pendientes.set(c.id, new Map());
    c.pid = p.pid;
    p.on('evento', (e) => manejarEvento(c, e));
    return p;
  }

  function manejarEvento(c, e) {
    switch (e.tipo) {
      case 'sesion':
        if (e.sessionId && e.sessionId !== c.sessionId) { c.sessionId = e.sessionId; guardar(); emitirEstado(c); }
        return;
      case 'permiso': {
        if ((reglas.get(c.id) ?? []).includes(clavePermiso(e.herramienta, e.entrada))) {
          procesos.get(c.id)?.responderPermiso(e.solicitudId, { permitir: true });
          return;
        }
        const p = { solicitudId: e.solicitudId, herramienta: e.herramienta, entrada: e.entrada ?? {}, motivo: e.motivo ?? null };
        pendientes.get(c.id)?.set(e.solicitudId, p);
        c.estado = 'esperando-permiso';
        emitir({ tipo: 'chat:permiso', conversacion: c.id, ...p });
        emitirEstado(c);
        return;
      }
      case 'permiso-cancelado': {
        // Claude Code retiró la solicitud (p. ej. tras un interrupt): ya no se puede responder.
        const mapa = pendientes.get(c.id);
        const p = mapa?.get(e.solicitudId);
        if (!p) return;
        mapa.delete(e.solicitudId);
        if (!mapa.size && c.estado === 'esperando-permiso') c.estado = 'trabajando';
        emitir({ tipo: 'chat:permiso-resuelto', conversacion: c.id, solicitudId: e.solicitudId, decision: 'cancelado', herramienta: p.herramienta, entrada: p.entrada });
        emitirEstado(c);
        return;
      }
      case 'texto-parcial':
      case 'mensaje':
        emitir({ ...e, tipo: `chat:${e.tipo}`, conversacion: c.id });
        return;
      case 'fin-turno': {
        desarmar('interrupcion', c.id);
        const interrumpido = interrumpidas.delete(c.id);
        pendientes.get(c.id)?.clear();
        if (e.sessionId) c.sessionId = e.sessionId;
        const ok = e.ok || interrumpido;
        c.estado = ok ? 'lista' : 'error';
        c.error = ok ? null : e.error;
        c.ultima = ahora();
        guardar();
        emitir({ tipo: 'chat:fin-turno', conversacion: c.id, ok: e.ok, error: c.error, costoUSD: e.costoUSD ?? null, interrumpido });
        emitirEstado(c);
        if (c.estado === 'lista') armar('inactividad', c.id, inactividadProcesoMs, () => cerrarProceso(c, 'lista'));
        return;
      }
      case 'salida':
        desarmar('inactividad', c.id);
        desarmar('interrupcion', c.id);
        procesos.delete(c.id);
        pendientes.delete(c.id);
        interrumpidas.delete(c.id);
        c.pid = null;
        if (cerrando.delete(c.id)) { c.estado = 'inactiva'; c.error = null; }
        else if (EN_CURSO.has(c.estado) || e.codigo !== 0) { c.estado = 'error'; c.error = e.error ?? 'Claude Code terminó inesperadamente'; }
        else if (c.estado !== 'error') c.estado = 'inactiva';
        guardar();
        emitirEstado(c);
        return;
      default:
    }
  }

  // Cierra el proceso como cierre pedido (la conversación queda inactiva, no en error), solo si sigue en el estado esperado.
  function cerrarProceso(c, estadoEsperado) {
    const p = procesos.get(c.id);
    if (!p || (estadoEsperado && c.estado !== estadoEsperado)) return;
    cerrando.add(c.id);
    p.cerrar();
  }

  // El interrupt no trajo result a tiempo: se da el turno por interrumpido y se cierra el proceso.
  function interrupcionVencida(c) {
    if (!procesos.has(c.id) || !EN_CURSO.has(c.estado)) return;
    interrumpidas.delete(c.id);
    pendientes.get(c.id)?.clear();
    emitir({ tipo: 'chat:fin-turno', conversacion: c.id, ok: false, error: null, costoUSD: null, interrumpido: true });
    cerrarProceso(c);
  }

  return {
    on: (fn) => emisor.on('chat', fn),
    listar: () => [...lista].sort((a, b) => String(b.ultima).localeCompare(String(a.ultima))).map(publica),
    obtener: (id) => publica(buscar(id)),
    pendientesDe: (id) => [...(pendientes.get(buscar(id).id)?.values() ?? [])],
    hayProcesos: () => procesos.size > 0,

    crear({ cwd, modo = 'preguntar' } = {}) {
      if (!MODOS[modo]) throw new ErrorConversacion(400, `Modo desconocido: ${modo}`);
      let esDir = false;
      try { esDir = !!cwd && statSync(String(cwd)).isDirectory(); } catch { /* no existe */ }
      if (!esDir) throw new ErrorConversacion(400, 'La carpeta no existe o no es un directorio');
      const c = { id: randomUUID(), sessionId: null, titulo: TITULO_NUEVO, cwd: String(cwd), rama: ramaDe(String(cwd)), modo, creada: ahora(), ultima: ahora(), estado: 'inactiva', pid: null, error: null };
      lista.push(c);
      guardar();
      emitirEstado(c);
      return publica(c);
    },

    enviar(id, texto) {
      const c = buscar(id);
      const t = String(texto ?? '').trim();
      if (!t) throw new ErrorConversacion(400, 'El mensaje está vacío');
      const max = cargarConfig(env).conversacionesMax;
      if (!EN_CURSO.has(c.estado) && enCurso() >= max) throw new ErrorConversacion(409, `Hay ${enCurso()} conversaciones trabajando; espera o detén una`);
      const p = asegurarProceso(c);
      desarmar('inactividad', c.id);
      interrumpidas.delete(c.id);
      if (c.titulo === TITULO_NUEVO) c.titulo = t.length > 60 ? `${t.slice(0, 59)}…` : t;
      c.estado = 'trabajando';
      c.error = null;
      c.ultima = ahora();
      emitir({ tipo: 'chat:usuario', conversacion: c.id, id: randomUUID(), texto: t });
      p.enviar(t);
      guardar();
      emitirEstado(c);
    },

    responderPermiso(id, solicitudId, decision) {
      const c = buscar(id);
      if (!['permitir', 'siempre', 'denegar'].includes(decision)) throw new ErrorConversacion(400, 'Decisión inválida');
      const mapa = pendientes.get(c.id);
      const p = mapa?.get(solicitudId);
      if (!p) throw new ErrorConversacion(404, 'Ese permiso ya no está pendiente');
      if (decision === 'siempre') reglas.set(c.id, [...(reglas.get(c.id) ?? []), clavePermiso(p.herramienta, p.entrada)]);
      procesos.get(c.id)?.responderPermiso(solicitudId, { permitir: decision !== 'denegar' });
      mapa.delete(solicitudId);
      if (!mapa.size && c.estado === 'esperando-permiso') c.estado = 'trabajando';
      emitir({ tipo: 'chat:permiso-resuelto', conversacion: c.id, solicitudId, decision, herramienta: p.herramienta, entrada: p.entrada });
      emitirEstado(c);
    },

    cambiarModo(id, modo) {
      const c = buscar(id);
      if (!MODOS[modo]) throw new ErrorConversacion(400, `Modo desconocido: ${modo}`);
      c.modo = modo;
      procesos.get(c.id)?.cambiarModo(modo);
      guardar();
      emitirEstado(c);
      return publica(c);
    },

    renombrar(id, titulo) {
      const c = buscar(id);
      const t = String(titulo ?? '').trim();
      if (!t || t.length > 120) throw new ErrorConversacion(400, 'El título debe tener entre 1 y 120 caracteres');
      c.titulo = t;
      guardar();
      emitirEstado(c);
      return publica(c);
    },

    interrumpir(id) {
      const c = buscar(id);
      const p = procesos.get(c.id);
      if (!p) return;
      if (EN_CURSO.has(c.estado)) {
        interrumpidas.add(c.id);
        armar('interrupcion', c.id, esperaInterrupcionMs, () => interrupcionVencida(c));
      }
      p.interrumpir();
    },

    cerrar(id) {
      const c = buscar(id);
      const p = procesos.get(c.id);
      if (p) { cerrando.add(c.id); p.cerrar(); }
    },

    async apagar(ms = 3500) {
      const vivos = [...procesos.entries()];
      if (!vivos.length) return;
      await Promise.race([
        Promise.all(vivos.map(([id, p]) => new Promise((ok) => {
          p.on('evento', (e) => { if (e.tipo === 'salida') ok(); });
          cerrando.add(id);
          p.interrumpir();
          p.cerrar();
        }))),
        new Promise((ok) => setTimeout(ok, ms).unref()),
      ]);
    },
  };
}
