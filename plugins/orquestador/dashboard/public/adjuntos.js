// Adjuntos del chat: límites, fichas del composer y del mensaje, y el pie [Adjuntos] que arma el servidor.
// Los límites y el formato del pie repiten los de ../adjuntos.mjs; un test comprueba que coinciden.
import { el, boton } from './dom.js';

const MB = 1024 * 1024;
// totalBytes: lo que cabe en el POST de 40 MB una vez codificado en base64. imagenBase64Bytes: una imagen cuyo base64 pasa
// de 5 MB no se rechaza; va como archivo (el servidor, que también mira la firma y las dimensiones, decide al final).
export const LIMITES = Object.freeze({ cantidad: 10, archivoBytes: 20 * MB, imagenBase64Bytes: 5 * MB, totalBytes: 28 * MB });
const TIPOS_IMAGEN = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };

export const esImagen = (tipo) => Object.hasOwn(TIPOS_IMAGEN, String(tipo ?? '').toLowerCase());
const esNombreImagen = (nombre) => /\.(png|jpe?g|gif|webp)$/i.test(String(nombre ?? ''));
export const nombrePegada = (tipo, n) => `imagen-pegada-${n}.${TIPOS_IMAGEN[String(tipo).toLowerCase()] ?? 'png'}`;
export const extension = (nombre) => /\.([A-Za-z0-9]{1,5})$/.exec(String(nombre ?? ''))?.[1].toUpperCase() ?? 'ARCH';

const decimal = (n) => n.toLocaleString('es-CL', { maximumFractionDigits: 1 });
export function formatoTamano(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  return n < MB ? `${decimal(n / 1024)} KB` : `${decimal(n / MB)} MB`;
}

// Mismo criterio de tamaño que el servidor: la imagen va en línea si su base64 mide hasta 5 MB.
export const vaEnLinea = (f) => esImagen(f.type) && Math.ceil(f.size / 3) * 4 <= LIMITES.imagenBase64Bytes;
// Tamaño de la ficha, con aviso si la imagen irá como archivo (Claude la lee con Read en vez de verla en línea).
export const detalleFicha = (f) => `${formatoTamano(f.size)}${esImagen(f.type) && !vaEnLinea(f) ? ' · irá como archivo' : ''}`;

// Archivos de un drop sin las carpetas (el navegador las entrega como entradas sin tipo y de tamaño 0).
// dataTransfer: { items?, files }. Con webkitGetAsEntry se distingue la carpeta; si no, se descarta lo que parece una.
export function archivosSoltados(dataTransfer) {
  const items = [...(dataTransfer?.items ?? [])].filter((i) => i.kind === 'file');
  if (items.length && items.every((i) => typeof i.webkitGetAsEntry === 'function')) {
    const archivos = [];
    let carpetas = 0;
    for (const i of items) {
      if (i.webkitGetAsEntry()?.isDirectory) carpetas++;
      else { const f = i.getAsFile(); if (f) archivos.push(f); }
    }
    return { archivos, carpetas };
  }
  const todos = [...(dataTransfer?.files ?? [])];
  const archivos = todos.filter((f) => f.type || f.size > 0);
  return { archivos, carpetas: todos.length - archivos.length };
}
export const avisoCarpetas = (n) => (n === 1 ? 'No se pueden adjuntar carpetas; se omitió 1.' : `No se pueden adjuntar carpetas; se omitieron ${n} carpetas.`);

// actuales y nuevos: File (o { name, size, type }). Devuelve los nuevos que caben y un error en español por cada rechazo.
export function admitir(actuales, nuevos) {
  const aceptados = [];
  const errores = [];
  let total = actuales.reduce((s, f) => s + f.size, 0);
  let sobrantes = 0;
  for (const f of nuevos) {
    if (actuales.length + aceptados.length >= LIMITES.cantidad) { sobrantes++; continue; }
    if (f.size > LIMITES.archivoBytes) { errores.push(`${f.name} pesa más de 20 MB, el máximo por archivo.`); continue; }
    if (total + f.size > LIMITES.totalBytes) { errores.push(`No se agregó ${f.name}: los adjuntos de un mensaje suman como máximo 28 MB en total.`); continue; }
    total += f.size;
    aceptados.push(f);
  }
  if (sobrantes) errores.push(`Puedes adjuntar hasta 10 archivos por mensaje; no se ${sobrantes === 1 ? 'agregó 1' : `agregaron ${sobrantes}`}.`);
  return { aceptados, errores };
}

// Separa el pie "[Adjuntos]\n- nombre: ruta" del final del texto. Si no está completo y al final, no toca nada.
const PIE = /(?:^|\n\n)\[Adjuntos\]\n(- [^\n]+(?:\n- [^\n]+)*)\s*$/;
const LINEA = /^- ([^:\n]+): (.+)$/;
export function separarAdjuntos(texto) {
  const s = String(texto ?? '');
  const m = PIE.exec(s);
  const lineas = m ? m[1].split('\n').map((l) => LINEA.exec(l)) : [];
  if (!m || lineas.some((x) => !x)) return { texto: s, adjuntos: [] };
  return { texto: s.slice(0, m.index).trim(), adjuntos: lineas.map(([, nombre, ruta]) => ({ nombre, ruta })) };
}

// Bloques de un mensaje del usuario: el texto sin el pie y una ficha por adjunto. Las imágenes del transcript que el pie
// no nombra (p. ej. pegadas en la terminal) quedan como ficha "Imagen".
export function bloquesUsuario(bloques = []) {
  const textos = [];
  const adjuntos = [];
  let imagenes = 0;
  for (const b of bloques) {
    if (b.tipo === 'imagen') imagenes++;
    else if (b.tipo === 'adjunto') adjuntos.push({ ...b });
    else if (b.tipo === 'texto') {
      const s = separarAdjuntos(b.texto);
      if (s.texto) textos.push({ tipo: 'texto', texto: s.texto });
      adjuntos.push(...s.adjuntos.map((a) => ({ tipo: 'adjunto', nombre: a.nombre, ruta: a.ruta })));
    }
  }
  const sinNombre = imagenes - adjuntos.filter((a) => esNombreImagen(a.nombre)).length;
  for (let i = 0; i < sinNombre; i++) adjuntos.push({ tipo: 'adjunto', nombre: 'Imagen', imagen: true });
  return [...textos, ...adjuntos];
}

const icono = (texto) => el('span', 'icono-adjunto mono', texto);

// Fichas del composer antes de enviar: miniatura (imágenes) o extensión, nombre, tamaño y "×" para quitar.
// items: [{ id, archivo: File, url: objectURL | null }].
export function renderFichas(contenedor, items, alQuitar) {
  contenedor.hidden = !items.length;
  contenedor.replaceChildren(...items.map((a) => {
    const f = el('div', 'ficha-adjunto');
    f.setAttribute('role', 'listitem');
    if (a.url) {
      const img = el('img', 'miniatura');
      img.src = a.url;
      img.alt = '';
      f.append(img);
    } else f.append(icono(extension(a.archivo.name)));
    const datos = el('span', 'datos-adjunto');
    datos.append(el('span', 'nombre-adjunto', a.archivo.name), el('span', 'tenue', detalleFicha(a.archivo)));
    f.append(datos, boton('×', 'quitar', () => alQuitar(a.id), `Quitar ${a.archivo.name}`));
    return f;
  }));
}

// Fichas bajo la burbuja de un mensaje ya enviado: solo el nombre (la ruta queda en el title).
export function fichasMensaje(adjuntos) {
  const l = el('div', 'adjuntos-msg');
  l.setAttribute('role', 'list');
  l.setAttribute('aria-label', 'Adjuntos');
  for (const a of adjuntos) {
    const f = el('span', 'ficha-msg');
    f.setAttribute('role', 'listitem');
    if (a.ruta) f.title = a.ruta;
    f.append(icono(a.imagen ? 'IMG' : extension(a.nombre)), el('span', 'nombre-adjunto', a.nombre));
    l.append(f);
  }
  return l;
}
