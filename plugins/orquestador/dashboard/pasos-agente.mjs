// Pasos de un subagente leídos de su transcript, de forma incremental por offset de bytes.
import { openSync, readSync, fstatSync, closeSync } from 'node:fs';
import { bloquesDe, resultadosDe, resumenHerramienta, recortar, textoPlano } from './bloques.mjs';

const MAX = 1024 * 1024;
const TOPE_LINEA = 16 * 1024 * 1024;

const leerTramo = (fd, pos, n) => {
  const b = Buffer.alloc(n);
  readSync(fd, b, 0, n, pos);
  return b;
};

export function leerDesde(ruta, desde = 0, max = MAX, tope = TOPE_LINEA) {
  let fd;
  try {
    fd = openSync(ruta, 'r');
    const { size } = fstatSync(fd);
    const inicio = Number.isInteger(desde) && desde >= 0 && desde <= size ? desde : 0;
    const n = Math.min(size - inicio, max);
    if (n <= 0) return { texto: '', siguiente: inicio, existe: true };
    const primero = leerTramo(fd, inicio, n);
    const corte = primero.lastIndexOf(0x0a);
    if (corte >= 0) return { texto: primero.subarray(0, corte + 1).toString('utf8'), siguiente: inicio + corte + 1, existe: true };
    // La línea es más larga que la ventana: se busca su fin tramo a tramo desde el mismo descriptor.
    let partes = [primero];
    let total = n;
    let pos = inicio + n;
    let fin = -1;
    while (pos < size && fin < 0) {
      const trozo = leerTramo(fd, pos, Math.min(size - pos, max));
      const i = trozo.indexOf(0x0a);
      const usado = i >= 0 ? i + 1 : trozo.length;
      if (partes && total + usado <= tope) partes.push(trozo.subarray(0, usado));
      else partes = null;
      total += usado;
      if (i >= 0) fin = pos + i;
      pos += trozo.length;
    }
    // Sin \n: la línea está a medio escribir, así que se espera.
    if (fin < 0) return { texto: '', siguiente: inicio, existe: true };
    // Línea gigante: se salta sin cargarla.
    if (!partes) return { texto: '', siguiente: fin + 1, existe: true };
    return { texto: Buffer.concat(partes).toString('utf8'), siguiente: fin + 1, existe: true };
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
