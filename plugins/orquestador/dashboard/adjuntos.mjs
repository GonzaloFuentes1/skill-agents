// Archivos e imágenes que el usuario adjunta en el chat: validación, saneo del nombre, guardado y armado del mensaje.
// El formato del pie [Adjuntos] está duplicado en public/adjuntos.js (separarAdjuntos); un test comprueba que coinciden.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { ErrorConversacion } from './errores.mjs';

const MB = 1024 * 1024;
// Imágenes: 5 MB es el límite de la API para imágenes en línea.
export const LIMITES = Object.freeze({ cantidad: 10, archivoBytes: 20 * MB, imagenBytes: 5 * MB });
// Tope del cuerpo de POST /api/conversaciones/:id/mensajes (el resto de la API sigue con 64 KB).
export const MAX_CUERPO_MENSAJE = 40 * MB;
const MAX_NOMBRE = 120;

const CONTROL = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g; // incluye marcas de dirección
const RESERVADOS = /[<>:"|?*]/g;
const NOMBRE_RESERVADO = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

// Nombre seguro para el disco: sin carpetas, "..", separadores, caracteres de control ni reservados de Windows.
export function sanearNombre(nombre) {
  let s = String(nombre ?? '').replace(CONTROL, '');
  s = s.split(/[\\/]/).pop();
  s = s.replace(RESERVADOS, '_').replace(/\.{2,}/g, '.').replace(/^[\s.]+|[\s.]+$/g, '');
  if (NOMBRE_RESERVADO.test(s)) s = `_${s}`;
  const letras = Array.from(s);
  if (letras.length > MAX_NOMBRE) {
    const ext = extname(s).length <= 10 ? extname(s) : '';
    s = letras.slice(0, MAX_NOMBRE - ext.length).join('') + ext;
  }
  return s || 'archivo';
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

// [{ nombre, tipo?, datos: base64 }] del cliente → [{ nombre saneado, datos: Buffer, mediaType }]. Lanza 400 o 413.
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
    if (mediaType && datos.length > LIMITES.imagenBytes) throw new ErrorConversacion(413, `La imagen ${nombre} pesa más de 5 MB, el máximo para imágenes`);
    return { nombre, datos, mediaType };
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
  const imagenes = guardados.filter((g) => g.mediaType);
  if (!imagenes.length) return texto;
  return [
    ...imagenes.map((g) => ({ type: 'image', source: { type: 'base64', media_type: g.mediaType, data: Buffer.from(g.datos).toString('base64') } })),
    { type: 'text', text: texto },
  ];
}
