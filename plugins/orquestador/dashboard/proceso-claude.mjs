// Único módulo que conoce el protocolo stream-json de `claude -p`. El resto del dashboard ve eventos normalizados.
import { spawn as spawnNodo } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { StringDecoder } from 'node:string_decoder';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { bloquesDe, resultadosDe, notificacionesDe } from './bloques.mjs';

export const MODOS = Object.freeze({ preguntar: 'manual', ediciones: 'acceptEdits', auto: 'auto' });

export function resolverBinario(config = {}, env = process.env, plataforma = process.platform) {
  if (config.rutaClaude) return config.rutaClaude;
  const nombres = plataforma === 'win32' ? ['claude.exe', 'claude.cmd'] : ['claude'];
  const separador = plataforma === 'win32' ? ';' : ':';
  for (const dir of String(env.PATH ?? env.Path ?? '').split(separador)) {
    if (!dir) continue;
    for (const n of nombres) { const r = join(dir, n); if (existsSync(r)) return r; }
  }
  return null;
}

// dirsAdicionales: carpetas fuera del proyecto que Claude puede leer sin pedir permiso (p. ej. la de adjuntos).
export function argumentos({ sessionId = null, modo = 'preguntar', dirsAdicionales = [] } = {}) {
  const a = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
    '--include-partial-messages', '--permission-prompts', 'host', '--permission-prompt-tool', 'stdio', '--permission-mode', MODOS[modo] ?? MODOS.preguntar];
  if (sessionId) a.push('--resume', sessionId);
  for (const d of dirsAdicionales) a.push('--add-dir', d);
  return a;
}

// Un .cmd solo corre a través del shell, que no cita nada: una ruta con espacios hay que citarla a mano.
export function invocacion(binario, args) {
  const b = String(binario);
  const shell = /\.cmd"?$/i.test(b);
  const comando = shell && /\s/.test(b) && !/^".*"$/.test(b) ? `"${b}"` : b;
  return { comando, args, shell };
}

// Argumentos para cmd.exe (un .cmd), que no cita nada: sin esto, `--tools ""` desaparece, un JSON con comillas se rompe
// y una ruta con espacios (p. ej. la de --add-dir) se parte en dos.
// Reglas de citado de MSVCRT: las comillas internas se escapan con \ y las barras que preceden a una comilla se duplican.
export function citarParaShell(arg) {
  const s = String(arg);
  if (s && !/[\s"^&|<>()%!]/.test(s)) return s;
  return `"${s.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`;
}

// Los mensajes de un subagente (parent_tool_use_id) se ignoran; los pedidos de control y el result son siempre del proceso.
const DE_SUBAGENTE = new Set(['stream_event', 'assistant', 'user']);

export function crearNormalizador() {
  let mensajeActual = null;
  return (msg) => {
    if (!msg || typeof msg !== 'object' || (msg.parent_tool_use_id && DE_SUBAGENTE.has(msg.type))) return [];
    switch (msg.type) {
      case 'system': {
        if (msg.subtype === 'init') return [{ tipo: 'sesion', sessionId: msg.session_id ?? null, modelo: msg.model ?? null }];
        // Modo automático: el clasificador detuvo una acción (en -p llega como system/permission_denied).
        if (msg.subtype === 'permission_denied') {
          return [{ tipo: 'denegado', herramienta: msg.tool_name ?? msg.tool ?? null, entrada: msg.tool_input ?? msg.input ?? {}, motivo: msg.reason ?? msg.message ?? msg.decision_reason ?? null }];
        }
        return [];
      }
      case 'stream_event': {
        const ev = msg.event ?? {};
        if (ev.type === 'message_start') mensajeActual = ev.message?.id ?? null;
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
          return [{ tipo: 'texto-parcial', mensajeId: mensajeActual, delta: ev.delta.text }];
        }
        return [];
      }
      case 'assistant': {
        const bloques = bloquesDe(msg.message?.content);
        return bloques.length ? [{ tipo: 'mensaje', mensajeId: msg.message?.id ?? null, rol: 'asistente', bloques }] : [];
      }
      case 'user': {
        const r = resultadosDe(msg.message?.content);
        const avisos = bloquesDe(msg.message?.content).filter((b) => b.tipo === 'texto').flatMap((b) => notificacionesDe(b.texto));
        return [
          ...(r.length ? [{ tipo: 'mensaje', mensajeId: null, rol: 'herramienta', bloques: r.map((x) => ({ tipo: 'resultado', ...x })) }] : []),
          ...(avisos.length ? [{ tipo: 'mensaje', mensajeId: msg.uuid ?? null, rol: 'notificacion', bloques: avisos }] : []),
        ];
      }
      case 'result': {
        const ok = msg.subtype === 'success' && !msg.is_error;
        const encolados = Number(msg.queued_turn_count) > 0 ? Number(msg.queued_turn_count) : 0;
        return [{ tipo: 'fin-turno', ok, costoUSD: msg.total_cost_usd ?? null, duracionMs: msg.duration_ms ?? null, error: ok ? null : String(msg.result ?? msg.subtype ?? 'error'), sessionId: msg.session_id ?? null, encolados }];
      }
      case 'control_request': {
        const r = msg.request ?? {};
        return r.subtype === 'can_use_tool'
          ? [{ tipo: 'permiso', solicitudId: msg.request_id, herramienta: r.tool_name, entrada: r.input ?? {}, motivo: r.decision_reason ?? null }]
          : [];
      }
      case 'control_cancel_request':
        return [{ tipo: 'permiso-cancelado', solicitudId: msg.request_id ?? null }];
      default:
        return [];
    }
  };
}

// contenido: el texto, o un arreglo de bloques (p. ej. imágenes en base64 seguidas del texto).
export const mensajeUsuario = (contenido) => ({ type: 'user', message: { role: 'user', content: contenido }, parent_tool_use_id: null, session_id: '' });
export const respuestaPermiso = (solicitudId, { permitir, mensaje, entrada }) => ({
  type: 'control_response',
  response: {
    subtype: 'success', request_id: solicitudId,
    response: permitir ? { behavior: 'allow', updatedInput: entrada ?? {} } : { behavior: 'deny', message: mensaje ?? 'El usuario denegó el permiso desde el dashboard.' },
  },
});
const pedidoControl = (id, request) => ({ type: 'control_request', request_id: id, request });
const ultimaLinea = (t) => String(t ?? '').trim().split('\n').filter(Boolean).pop() ?? '';

export function abrirProceso({ cwd, sessionId = null, modo = 'preguntar', dirsAdicionales = [], binario, env = process.env, spawnFn = spawnNodo }) {
  const em = new EventEmitter();
  const entornoHijo = { ...env, ORQUESTADOR_CANAL: 'dashboard' };
  delete entornoHijo.CLAUDECODE; // lanzado desde una sesión de Claude Code: el hijo no debe creerse anidado
  const { comando, args, shell } = invocacion(binario, argumentos({ sessionId, modo, dirsAdicionales }));
  const hijo = spawnFn(comando, shell ? args.map(citarParaShell) : args, { cwd, env: entornoHijo, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell });
  const normalizar = crearNormalizador();
  const entradas = new Map();
  const decodificador = new StringDecoder('utf8');
  let resto = '';
  let stderr = '';
  let contador = 0;
  let terminado = false;

  const salir = (codigo, error) => {
    if (terminado) return;
    terminado = true;
    em.emit('evento', { tipo: 'salida', codigo, error });
  };
  const procesarLinea = (l) => {
    if (!l.trim()) return;
    let msg;
    try { msg = JSON.parse(l); } catch { em.emit('basura', l); return; }
    for (const e of normalizar(msg)) {
      if (e.tipo === 'permiso') entradas.set(e.solicitudId, e.entrada);
      if (e.tipo === 'permiso-cancelado') entradas.delete(e.solicitudId);
      em.emit('evento', e);
    }
  };
  hijo.stdout?.on('data', (d) => {
    const partes = (resto + decodificador.write(d)).split('\n');
    resto = partes.pop();
    for (const l of partes) procesarLinea(l);
  });
  hijo.stderr?.on('data', (d) => { stderr = (stderr + d).slice(-4000); });
  hijo.stdin?.on('error', () => {});
  hijo.on('error', (err) => salir(null, `No se pudo ejecutar Claude Code: ${err.message}`));
  hijo.on('close', (codigo) => {
    procesarLinea(resto + decodificador.end()); // la última línea puede llegar sin "\n"
    resto = '';
    salir(codigo, codigo ? (ultimaLinea(stderr) || `Claude Code terminó con código ${codigo}`) : null);
  });

  const escribir = (obj) => { if (hijo.stdin?.writable) hijo.stdin.write(JSON.stringify(obj) + '\n'); };
  em.pid = hijo.pid ?? null;
  em.enviar = (contenido) => escribir(mensajeUsuario(contenido));
  // Un id desconocido (o ya respondido) no se envía: Claude Code no espera esa respuesta.
  em.responderPermiso = (id, { permitir, mensaje } = {}) => {
    if (!entradas.has(id)) return false;
    const entrada = entradas.get(id);
    entradas.delete(id);
    escribir(respuestaPermiso(id, { permitir, mensaje, entrada }));
    return true;
  };
  em.cambiarModo = (nuevo) => escribir(pedidoControl(`orq-${++contador}`, { subtype: 'set_permission_mode', mode: MODOS[nuevo] ?? MODOS.preguntar }));
  em.interrumpir = () => escribir(pedidoControl(`orq-${++contador}`, { subtype: 'interrupt' }));
  em.cerrar = () => {
    try { hijo.stdin?.end(); } catch { /* ya cerrado */ }
    setTimeout(() => { if (!terminado) hijo.kill(); }, 3000).unref();
  };
  return em;
}
