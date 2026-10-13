// Lectura incremental de events.jsonl para el dashboard.
import { openSync, readSync, fstatSync, closeSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';

// Sigue un archivo JSONL por offset: entrega líneas completas y conserva la línea parcial y los bytes UTF-8 cortados.
// Con `cola`, la primera lectura empieza a `cola` bytes del final (descartando la línea cortada) para no cargar
// archivos enormes. Un error de E/S (archivo bloqueado, es un directorio…) se trata como "nada nuevo".
export function crearSeguidor(ruta, { cola = null } = {}) {
  let offset = null;
  let resto = '';
  let descartarPrimera = false;
  let decodificador = new StringDecoder('utf8');
  return {
    leerNuevas() {
      let fd;
      try {
        fd = openSync(ruta, 'r');
        const { size } = fstatSync(fd);
        if (offset === null) {
          offset = cola != null && size > cola ? size - cola : 0;
          descartarPrimera = offset > 0;
        }
        if (size < offset) { offset = 0; resto = ''; descartarPrimera = false; decodificador = new StringDecoder('utf8'); }
        if (size === offset) return [];
        const buf = Buffer.alloc(size - offset);
        readSync(fd, buf, 0, buf.length, offset);
        offset = size;
        const partes = (resto + decodificador.write(buf)).split('\n');
        resto = partes.pop();
        if (descartarPrimera && partes.length) { partes.shift(); descartarPrimera = false; }
        return partes.filter((l) => l.trim());
      } catch {
        return [];
      } finally {
        if (fd !== undefined) closeSync(fd);
      }
    },
  };
}

export function parsearLineas(lineas) {
  const eventos = [];
  for (const l of lineas) { try { eventos.push(JSON.parse(l)); } catch { /* línea inválida */ } }
  return eventos;
}

export function listarSesiones(eventos, max = 20) {
  const porSesion = new Map();
  for (const e of eventos) {
    if (!e?.session) continue;
    const s = porSesion.get(e.session) ?? { session: e.session, cwd: null, inicio: e.ts, ultimo: e.ts, delegaciones: 0 };
    if (e.tipo === 'sesion' && e.cwd) s.cwd = e.cwd;
    if (e.tipo === 'delegacion') s.delegaciones += 1;
    s.ultimo = e.ts;
    porSesion.set(e.session, s);
  }
  return [...porSesion.values()].sort((a, b) => String(b.ultimo).localeCompare(String(a.ultimo))).slice(0, max);
}
