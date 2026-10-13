// Pasos de un subagente leídos de su transcript, de forma incremental por offset de bytes.
import { openSync, readSync, fstatSync, closeSync } from 'node:fs';
import { bloquesDe, resultadosDe, resumenHerramienta, recortar, textoPlano } from './bloques.mjs';

const MAX = 1024 * 1024;

export function leerDesde(ruta, desde = 0, max = MAX) {
  let fd;
  try {
    fd = openSync(ruta, 'r');
    const { size } = fstatSync(fd);
    const inicio = Number.isInteger(desde) && desde >= 0 && desde <= size ? desde : 0;
    const n = Math.min(size - inicio, max);
    if (n <= 0) return { texto: '', siguiente: inicio, existe: true };
    const buf = Buffer.alloc(n);
    readSync(fd, buf, 0, n, inicio);
    const corte = buf.lastIndexOf(0x0a);
    if (corte < 0) return { texto: '', siguiente: inicio, existe: true };
    return { texto: buf.subarray(0, corte + 1).toString('utf8'), siguiente: inicio + corte + 1, existe: true };
  } catch {
    return { texto: '', siguiente: 0, existe: false };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function pasosDesdeLineas(texto) {
  const pasos = [];
  for (const linea of String(texto ?? '').replace(/^﻿/, '').split('\n')) {
    if (!linea.trim()) continue;
    let e;
    try { e = JSON.parse(linea); } catch { continue; }
    const hora = e.timestamp ?? null;
    const c = e.message?.content;
    if (e.type === 'user') {
      const resultados = resultadosDe(c);
      for (const r of resultados) pasos.push({ tipo: 'resultado', hora, usoId: r.usoId, ok: r.ok, resumen: r.texto });
      const t = textoPlano(c);
      if (!resultados.length && t.trim()) pasos.push({ tipo: 'encargo', hora, resumen: recortar(t, 300) });
    } else if (e.type === 'assistant') {
      for (const b of bloquesDe(c)) {
        if (b.tipo === 'herramienta') pasos.push({ tipo: 'herramienta', hora, usoId: b.usoId, nombre: b.nombre, resumen: resumenHerramienta(b.nombre, b.entrada) });
        else pasos.push({ tipo: b.tipo, hora, resumen: recortar(b.texto, 300) });
      }
    }
  }
  return pasos;
}

export function pasosAgente(ruta, desde = 0) {
  if (!ruta || !String(ruta).endsWith('.jsonl')) return { pasos: [], siguiente: 0, existe: false };
  const r = leerDesde(ruta, desde);
  return { pasos: pasosDesdeLineas(r.texto), siguiente: r.siguiente, existe: r.existe };
}
