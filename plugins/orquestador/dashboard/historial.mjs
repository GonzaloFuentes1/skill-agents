// Reconstruye el chat de una conversación desde el transcript de Claude Code (~/.claude/projects/*/<sessionId>.jsonl).
import { readdirSync, existsSync, openSync, readSync, fstatSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { bloquesDe, resultadosDe } from './bloques.mjs';

const MAX_BYTES = 4 * 1024 * 1024;
const ESCONDIDO = /^\s*<(command-|local-command|system-reminder)/;
const INTERRUMPIDO = /^\[Request interrupted by user/;
const mismoBloque = (a, b) => a.tipo === b.tipo && (a.tipo === 'herramienta' ? a.usoId === b.usoId : a.texto === b.texto);

export const dirProyectos = (env = process.env) => join(env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects');

export function buscarTranscript(sessionId, env = process.env) {
  if (!/^[A-Za-z0-9_-]+$/.test(String(sessionId ?? ''))) return null;
  let dirs;
  try { dirs = readdirSync(dirProyectos(env)); } catch { return null; }
  for (const d of dirs) {
    const r = join(dirProyectos(env), d, `${sessionId}.jsonl`);
    if (existsSync(r)) return r;
  }
  return null;
}

export function leerCola(ruta, max = MAX_BYTES) {
  let fd;
  try {
    fd = openSync(ruta, 'r');
    const { size } = fstatSync(fd);
    const n = Math.min(size, max);
    const buf = Buffer.alloc(n);
    readSync(fd, buf, 0, n, size - n);
    const texto = buf.toString('utf8');
    return n < size ? texto.slice(texto.indexOf('\n') + 1) : texto;
  } catch {
    return '';
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function mensajesDesdeTranscript(texto) {
  const mensajes = [];
  const porId = new Map();
  const herramientas = new Map();
  for (const linea of String(texto ?? '').replace(/^﻿/, '').split('\n')) {
    if (!linea.trim()) continue;
    let e;
    try { e = JSON.parse(linea); } catch { continue; }
    if (e.isSidechain || e.isMeta) continue;
    const c = e.message?.content;
    if (e.type === 'user') {
      for (const r of resultadosDe(c)) {
        const h = herramientas.get(r.usoId);
        if (h) h.resultado = { ok: r.ok, texto: r.texto };
      }
      const bloques = bloquesDe(c).filter((b) => b.tipo === 'texto' && !ESCONDIDO.test(b.texto) && !INTERRUMPIDO.test(b.texto));
      if (bloques.length) mensajes.push({ rol: 'usuario', id: e.uuid ?? `u${mensajes.length}`, bloques });
    } else if (e.type === 'assistant') {
      const id = e.message?.id ?? e.uuid ?? `a${mensajes.length}`;
      let m = porId.get(id);
      if (!m) { m = { rol: 'asistente', id, bloques: [] }; porId.set(id, m); mensajes.push(m); }
      for (const b of bloquesDe(c)) {
        if (m.bloques.some((x) => mismoBloque(x, b))) continue;
        m.bloques.push(b);
        if (b.tipo === 'herramienta') herramientas.set(b.usoId, b);
      }
    }
  }
  return mensajes.filter((m) => m.bloques.length);
}

export function historialDe(sessionId, env = process.env) {
  if (!sessionId) return { mensajes: [], aviso: null };
  const ruta = buscarTranscript(sessionId, env);
  if (!ruta) return { mensajes: [], aviso: 'No se encontró el transcript de esta conversación' };
  return { mensajes: mensajesDesdeTranscript(leerCola(ruta)), aviso: null };
}
