import { createHash } from 'node:crypto';
import { openSync, readSync, fstatSync, closeSync } from 'node:fs';

const COLA_BYTES = 256 * 1024;

export const hashPrompt = (p) => (p == null ? null : createHash('sha1').update(String(p).trim()).digest('hex').slice(0, 16));

// Primer mensaje de usuario del transcript de un subagente: es el prompt que recibió.
export function primerPrompt(texto) {
  for (const linea of String(texto ?? '').split('\n')) {
    if (!linea.trim()) continue;
    let e;
    try { e = JSON.parse(linea); } catch { continue; }
    if (e?.type !== 'user') continue;
    const c = e.message?.content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) {
      const t = c.filter((b) => b?.type === 'text').map((b) => b.text).join('\n');
      if (t) return t;
    }
  }
  return null;
}

// Modelo del último mensaje del asistente (no sidechain), leyendo solo la cola del transcript.
export function ultimoModelo(ruta) {
  if (!ruta) return null;
  let fd;
  try {
    fd = openSync(ruta, 'r');
    const { size } = fstatSync(fd);
    const n = Math.min(size, COLA_BYTES);
    const buf = Buffer.alloc(n);
    readSync(fd, buf, 0, n, size - n);
    const lineas = buf.toString('utf8').split('\n');
    for (let i = lineas.length - 1; i >= 0; i--) {
      try {
        const e = JSON.parse(lineas[i]);
        const m = e?.message?.model;
        if (e?.type === 'assistant' && !e.isSidechain && m && m !== '<synthetic>') return m;
      } catch { /* línea cortada o no JSON */ }
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
