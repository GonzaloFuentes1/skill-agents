// Archivos e imágenes que el usuario adjunta en el chat: validación, saneo del nombre, guardado y armado del mensaje.
// El formato del pie [Adjuntos] está duplicado en public/adjuntos.js (separarAdjuntos); un test comprueba que coinciden.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { ErrorConversacion } from './errores.mjs';

const MB = 1024 * 1024;
// Una imagen va en línea solo si la API la acepta: base64 de hasta 5 MB y lados de hasta 8000 px. Si no, va como archivo
// (queda en el pie y Claude la lee con Read). Una imagen rechazada por la API quedaría en el transcript y cada --resume
// volvería a fallar.
export const LIMITES = Object.freeze({ cantidad: 10, archivoBytes: 20 * MB, imagenBase64Bytes: 5 * MB, imagenLado: 8000 });
// Tope del cuerpo de POST /api/conversaciones/:id/mensajes (el resto de la API sigue con 64 KB).
export const MAX_CUERPO_MENSAJE = 40 * MB;
// En bytes UTF-8: con "<marca de 13 dígitos>-" delante, el nombre en disco queda en ~200 bytes (ext4 admite 255).
const MAX_NOMBRE_BYTES = 186;

// Control, marcas de dirección, ancho cero, separadores de línea y párrafo, y BOM.
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/g;
const RESERVADOS = /[<>:"|?*]/g;
const NOMBRE_RESERVADO = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

// Recorta por bytes UTF-8 sin partir un carácter, conservando la extensión.
function recortarBytes(s, max) {
  if (Buffer.byteLength(s) <= max) return s;
  const e = extname(s);
  const ext = Buffer.byteLength(e) <= 16 ? e : '';
  let usados = Buffer.byteLength(ext);
  let base = '';
  for (const letra of ext ? s.slice(0, -ext.length) : s) {
    usados += Buffer.byteLength(letra);
    if (usados > max) break;
    base += letra;
  }
  return base.replace(/[\s.]+$/, '') + ext;
}

// Nombre seguro para el disco: sin carpetas, "..", separadores, caracteres de control ni reservados de Windows.
export function sanearNombre(nombre) {
  let s = String(nombre ?? '').replace(CONTROL, '');
  s = s.split(/[\\/]/).pop();
  s = s.replace(RESERVADOS, '_').replace(/\.{2,}/g, '.').replace(/^[\s.]+|[\s.]+$/g, '');
  if (NOMBRE_RESERVADO.test(s)) s = `_${s}`;
  return recortarBytes(s, MAX_NOMBRE_BYTES) || 'archivo';
}

// Tipo de imagen según la firma del archivo (no el nombre ni lo que diga el navegador). null si no es png, jpeg, gif ni webp.
export function tipoImagen(datos) {
  const b = Buffer.from(datos ?? []);
  const empieza = (bytes, desde = 0) => bytes.every((x, i) => b[desde + i] === x);
  if (empieza([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (empieza([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (b.subarray(0, 6).toString('latin1') === 'GIF87a' || b.subarray(0, 6).toString('latin1') === 'GIF89a') return 'image/gif';
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

// Ancho y alto según la cabecera (png IHDR, gif, webp VP8/VP8L/VP8X, jpeg SOF). null si no se pueden leer.
export function dimensionesImagen(datos, mediaType) {
  const b = Buffer.from(datos ?? []);
  const ok = (ancho, alto) => (ancho > 0 && alto > 0 ? { ancho, alto } : null);
  const texto = (i, n) => b.subarray(i, i + n).toString('latin1');
  switch (mediaType) {
    case 'image/png':
      return b.length >= 24 && texto(12, 4) === 'IHDR' ? ok(b.readUInt32BE(16), b.readUInt32BE(20)) : null;
    case 'image/gif':
      return b.length >= 10 ? ok(b.readUInt16LE(6), b.readUInt16LE(8)) : null;
    case 'image/webp': {
      const tipo = texto(12, 4);
      if (tipo === 'VP8X' && b.length >= 30) return ok(1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3));
      if (tipo === 'VP8 ' && b.length >= 30 && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return ok(b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff);
      if (tipo === 'VP8L' && b.length >= 25 && b[20] === 0x2f) {
        return ok(1 + (((b[22] & 0x3f) << 8) | b[21]), 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)));
      }
      return null;
    }
    case 'image/jpeg': {
      // Recorre los segmentos hasta el primer SOF; antes del SOS tiene que aparecer.
      let i = 2;
      while (i + 4 <= b.length) {
        if (b[i] !== 0xff) return null;
        const m = b[i + 1];
        if (m === 0xff) { i++; continue; }
        if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
        if (m === 0xd9 || m === 0xda) return null;
        if (SOF.has(m)) return i + 9 <= b.length ? ok(b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)) : null;
        i += 2 + b.readUInt16BE(i + 2);
      }
      return null;
    }
    default:
      return null;
  }
}

// Un PNG truncado (sin el bloque IEND al final) haría fallar el turno: va como archivo.
const IEND = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
const completa = (datos, mediaType) => mediaType !== 'image/png' || (datos.length >= 8 && datos.subarray(-8).equals(IEND));

// La imagen se manda en línea solo si la API la va a aceptar; si no, se guarda igual y queda solo en el pie.
export function vaEnLinea(datos, mediaType) {
  if (!mediaType || Math.ceil(datos.length / 3) * 4 > LIMITES.imagenBase64Bytes || !completa(datos, mediaType)) return false;
  const d = dimensionesImagen(datos, mediaType);
  return !!d && d.ancho <= LIMITES.imagenLado && d.alto <= LIMITES.imagenLado;
}

// [{ nombre, tipo?, datos: base64 }] del cliente → [{ nombre saneado, datos: Buffer, mediaType, enLinea }]. Lanza 400 o 413.
export function validarAdjuntos(lista) {
  if (lista == null) return [];
  if (!Array.isArray(lista)) throw new ErrorConversacion(400, 'Los adjuntos deben ser una lista');
  if (lista.length > LIMITES.cantidad) throw new ErrorConversacion(400, `Puedes adjuntar hasta ${LIMITES.cantidad} archivos por mensaje`);
  return lista.map((a) => {
    if (!a || typeof a !== 'object' || typeof a.nombre !== 'string' || typeof a.datos !== 'string') {
      throw new ErrorConversacion(400, 'Cada adjunto necesita un nombre y sus datos');
    }
    const nombre = sanearNombre(a.nombre);
    if (a.datos.length % 4 !== 0 || !BASE64.test(a.datos)) throw new ErrorConversacion(400, `El adjunto ${nombre} no viene bien codificado`);
    const datos = Buffer.from(a.datos, 'base64');
    if (datos.length > LIMITES.archivoBytes) throw new ErrorConversacion(413, `${nombre} pesa más de 20 MB, el máximo por archivo`);
    const mediaType = tipoImagen(datos);
    return { nombre, datos, mediaType, enLinea: vaEnLinea(datos, mediaType) };
  });
}

// Guarda cada adjunto en <dir>/<marca de tiempo>-<nombre>. Nunca pisa un archivo: si ya existe, avanza la marca.
export function guardarAdjuntos(dir, adjuntos, { ahora = Date.now } = {}) {
  if (!adjuntos.length) return [];
  mkdirSync(dir, { recursive: true });
  return adjuntos.map((a) => {
    for (let marca = ahora(); ; marca++) {
      const ruta = join(dir, `${marca}-${a.nombre}`);
      try {
        writeFileSync(ruta, a.datos, { flag: 'wx' });
        return { ...a, ruta };
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
      }
    }
  });
}

// Texto del usuario con el pie que lista la ruta de cada adjunto, para que Claude los lea con Read.
export function textoConAdjuntos(texto, guardados) {
  if (!guardados?.length) return texto;
  const pie = ['[Adjuntos]', ...guardados.map((g) => `- ${g.nombre}: ${g.ruta}`)].join('\n');
  return texto ? `${texto}\n\n${pie}` : pie;
}

// content del mensaje de usuario stream-json: string si no hay imágenes; si las hay, los bloques image y después el texto.
export function contenidoMensaje(texto, guardados = []) {
  const imagenes = guardados.filter((g) => g.mediaType && g.enLinea);
  if (!imagenes.length) return texto;
  return [
    ...imagenes.map((g) => ({ type: 'image', source: { type: 'base64', media_type: g.mediaType, data: Buffer.from(g.datos).toString('base64') } })),
    { type: 'text', text: texto },
  ];
}
