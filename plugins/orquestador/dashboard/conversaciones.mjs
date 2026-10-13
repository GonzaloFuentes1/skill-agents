// Registro y ciclo de vida de las conversaciones del dashboard. Persiste en ~/.claude/orquestador/conversaciones.json.
import { writeFileSync, renameSync, mkdirSync, statSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { EventEmitter } from 'node:events';
import { rutaConversaciones } from '../scripts/lib/rutas.mjs';
import { cargarConfig } from '../scripts/lib/config.mjs';
import { leerJsonUsuario, respaldar } from '../scripts/lib/archivos.mjs';
import { cerrarDeSesion } from '../scripts/lib/cierres.mjs';
import { abrirProceso, resolverBinario, MODOS } from './proceso-claude.mjs';

export class ErrorConversacion extends Error {
  // extra: datos que acompañan al error en la respuesta JSON (p. ej. { errores: { campo: mensaje } }).
  constructor(status, mensaje, extra = null) { super(mensaje); this.status = status; this.extra = extra; }
}

const EN_CURSO = new Set(['trabajando', 'esperando-permiso']);
const TITULO_NUEVO = 'Nueva conversación';
const DE_ARCHIVO = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const MAX_DENEGADOS = 20;
const execFileP = promisify(execFile);

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

// Rama actual de `cwd` sin bloquear el servidor (git puede tardar en un disco lento o sincronizado).
export async function ramaDe(cwd) {
  try {
    const { stdout } = await execFileP('git', ['-C', cwd, 'branch', '--show-current'], { encoding: 'utf8', timeout: 3000, windowsHide: true });
    return stdout.trim() || null;
  } catch { return null; }
}

const dormir = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
// Bloqueos de lectura pasajeros (antivirus, OneDrive, otro proceso): el archivo está bien, solo no se pudo leer ahora.
const LECTURA_BLOQUEADA = new Set(['EBUSY', 'EPERM', 'EACCES']);

// Un conversaciones.json dañado (JSON inválido) se respalda en .corrupto antes de empezar de cero: nunca se pierde en silencio.
// Uno bloqueado no está dañado: se reintenta y, si sigue bloqueado, se lanza el error, porque empezar de cero lo pisaría al guardar.
export function leerLista(env, { leer = leerJsonUsuario, intentos = 5, esperaMs = 100 } = {}) {
  const ruta = rutaConversaciones(env);
  let r = leer(ruta);
  for (let i = 1; i < intentos && LECTURA_BLOQUEADA.has(r.codigo); i++) { dormir(esperaMs); r = leer(ruta); }
  const { existe, datos, error, codigo } = r;
  if (!existe) return [];
  if (!error && Array.isArray(datos)) return datos;
  if (LECTURA_BLOQUEADA.has(codigo)) {
    throw new Error(`No se pudo leer ${ruta} (${codigo}) y no se sobrescribe. Cierra el programa que lo bloquea y vuelve a abrir el dashboard.`);
  }
  let respaldo = null;
  try { respaldo = respaldar(ruta, '.corrupto'); } catch { /* p. ej. la ruta es un directorio */ }
  console.error(`No se pudo leer ${ruta}${respaldo ? `; se respaldó en ${respaldo}` : ''} y se empieza de cero.`);
  return [];
}

const INTENTOS_GUARDAR = 3;

export function crearGestor({
  env = process.env, spawnFn, ahora = () => new Date().toISOString(),
  inactividadProcesoMs = 10 * 60 * 1000, // un proceso en "lista" sin mensajes se cierra; el siguiente lo retoma con --resume
  esperaInterrupcionMs = 10_000, // si tras interrumpir no llega el result, se cierra el proceso
} = {}) {
  // Un proceso de una vida anterior del servidor ya terminó: su costo pasa a ser costo previo de la conversación.
  const lista = leerLista(env).map((c) => {
    const base = { ...c, costoUSD: c.costoUSD ?? 0, costoPrevio: c.costoUSD ?? 0 };
    return EN_CURSO.has(c.estado) || c.pid ? { ...base, estado: 'inactiva', pid: null } : base;
  });
  const procesos = new Map();
  const pendientes = new Map();
  const reglas = new Map();
  const cerrando = new Set();
  const interrumpidas = new Set();
  const porEnviar = new Map(); // id → textos que llegaron mientras el proceso se cerraba
  const denegados = new Map(); // id → últimas denegaciones del modo automático (solo en memoria)
  const temporizadores = { inactividad: new Map(), interrupcion: new Map() };
  let apagando = false; // tras apagar() no se abre ningún proceso nuevo
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
  // total_cost_usd es acumulado por proceso: el total es lo de los procesos anteriores más lo de este.
  const registrarCosto = (c, e) => { if (typeof e.costoUSD === 'number') c.costoUSD = (c.costoPrevio ?? 0) + e.costoUSD; };
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

  // Tras la salida de un proceso que se cerraba, los mensajes que esperaban abren uno nuevo con --resume.
  function enviarPendientes(c) {
    const textos = porEnviar.get(c.id);
    porEnviar.delete(c.id);
    if (apagando || !textos?.length) return;
    try {
      const p = asegurarProceso(c);
      c.estado = 'trabajando';
      c.error = null;
      for (const t of textos) p.enviar(t);
    } catch (e) {
      c.estado = 'error';
      c.error = e.message;
    }
    c.ultima = ahora();
    guardar();
    emitirEstado(c);
  }

  async function refrescar(c) {
    const rama = await ramaDe(c.cwd);
    if (rama !== c.rama && lista.includes(c)) { c.rama = rama; guardar(); emitirEstado(c); }
    return publica(c);
  }

  function manejarEvento(c, e) {
    switch (e.tipo) {
      case 'sesion': {
        let cambio = false;
        if (e.sessionId && e.sessionId !== c.sessionId) { c.sessionId = e.sessionId; cambio = true; }
        if (e.modelo && e.modelo !== c.modelo) { c.modelo = e.modelo; cambio = true; }
        if (cambio) { guardar(); emitirEstado(c); }
        return;
      }
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
      case 'denegado': {
        const d = { id: randomUUID(), herramienta: e.herramienta ?? null, entrada: e.entrada ?? {}, motivo: e.motivo ?? null, ts: ahora() };
        denegados.set(c.id, [...(denegados.get(c.id) ?? []), d].slice(-MAX_DENEGADOS));
        emitir({ tipo: 'chat:denegado', conversacion: c.id, ...d });
        return;
      }
      case 'texto-parcial':
      case 'mensaje':
        emitir({ ...e, tipo: `chat:${e.tipo}`, conversacion: c.id });
        return;
      case 'fin-turno': {
        registrarCosto(c, e);
        if (cerrando.has(c.id)) { guardar(); return; } // el proceso se está cerrando: su último result no cambia el estado
        desarmar('interrupcion', c.id);
        const interrumpido = interrumpidas.delete(c.id);
        pendientes.get(c.id)?.clear();
        if (e.sessionId) c.sessionId = e.sessionId;
        const ok = e.ok || interrumpido;
        const encolados = !interrumpido && e.encolados > 0 ? e.encolados : 0;
        c.estado = !ok ? 'error' : encolados ? 'trabajando' : 'lista'; // con mensajes encolados el proceso sigue trabajando
        c.error = ok ? null : e.error;
        c.ultima = ahora();
        guardar();
        emitir({ tipo: 'chat:fin-turno', conversacion: c.id, ok: e.ok, error: c.error, costoUSD: e.costoUSD ?? null, costoTotalUSD: c.costoUSD ?? 0, interrumpido, encolados });
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
        c.costoPrevio = c.costoUSD ?? 0;
        // Sus agentes en segundo plano murieron con el proceso: se cierran como detenidos y liberan el cupo.
        if (c.sessionId) cerrarDeSesion(c.sessionId, () => true, 'proceso-cerrado', env).catch(() => {});
        if (cerrando.delete(c.id)) { c.estado = 'inactiva'; c.error = null; }
        else if (EN_CURSO.has(c.estado) || e.codigo !== 0) { c.estado = 'error'; c.error = e.error ?? 'Claude Code terminó inesperadamente'; }
        else if (c.estado !== 'error') c.estado = 'inactiva';
        guardar();
        emitirEstado(c);
        enviarPendientes(c);
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
    emitir({ tipo: 'chat:fin-turno', conversacion: c.id, ok: false, error: null, costoUSD: null, costoTotalUSD: c.costoUSD ?? 0, interrumpido: true, encolados: 0 });
    cerrarProceso(c);
  }

  return {
    on: (fn) => { emisor.on('chat', fn); return () => emisor.off('chat', fn); },
    listar: () => [...lista].sort((a, b) => String(b.ultima).localeCompare(String(a.ultima))).map(publica),
    obtener: (id) => publica(buscar(id)),
    pendientesDe: (id) => [...(pendientes.get(buscar(id).id)?.values() ?? [])],
    denegadosDe: (id) => [...(denegados.get(buscar(id).id) ?? [])],
    refrescarRama: (id) => refrescar(buscar(id)),
    hayProcesos: () => procesos.size > 0,

    crear({ cwd, modo } = {}) {
      const m = modo ?? cargarConfig(env).modoPermisoDefecto;
      if (!MODOS[m]) throw new ErrorConversacion(400, `Modo desconocido: ${m}`);
      let esDir = false;
      try { esDir = !!cwd && statSync(String(cwd)).isDirectory(); } catch { /* no existe */ }
      if (!esDir) throw new ErrorConversacion(400, 'La carpeta no existe o no es un directorio');
      const c = {
        id: randomUUID(), sessionId: null, titulo: TITULO_NUEVO, cwd: String(cwd), rama: null, modo: m, creada: ahora(), ultima: ahora(),
        estado: 'inactiva', pid: null, error: null, modelo: null, costoUSD: 0, costoPrevio: 0,
      };
      lista.push(c);
      guardar();
      emitirEstado(c);
      refrescar(c); // la rama llega después por chat:estado
      return publica(c);
    },

    enviar(id, texto) {
      const c = buscar(id);
      const t = String(texto ?? '').trim();
      if (!t) throw new ErrorConversacion(400, 'El mensaje está vacío');
      const max = cargarConfig(env).conversacionesMax;
      if (!EN_CURSO.has(c.estado) && enCurso() >= max) throw new ErrorConversacion(409, `Hay ${enCurso()} conversaciones trabajando; espera o detén una`);
      // Si el proceso se está cerrando (inactividad o "Cerrar proceso"), escribirle sería perder el mensaje.
      const esperaSalida = cerrando.has(c.id) && procesos.has(c.id);
      const p = esperaSalida ? null : asegurarProceso(c);
      desarmar('inactividad', c.id);
      interrumpidas.delete(c.id);
      if (c.titulo === TITULO_NUEVO) c.titulo = t.length > 60 ? `${t.slice(0, 59)}…` : t;
      c.estado = 'trabajando';
      c.error = null;
      c.ultima = ahora();
      emitir({ tipo: 'chat:usuario', conversacion: c.id, id: randomUUID(), texto: t });
      if (esperaSalida) porEnviar.set(c.id, [...(porEnviar.get(c.id) ?? []), t]);
      else p.enviar(t);
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
      porEnviar.delete(c.id); // "Detener" descarta los mensajes que esperaban la salida del proceso
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
      porEnviar.delete(c.id);
      const p = procesos.get(c.id);
      if (p) { cerrando.add(c.id); p.cerrar(); }
    },

    async apagar(ms = 3500) {
      apagando = true;
      porEnviar.clear();
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
