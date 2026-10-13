// JSON del usuario en disco: lectura que tolera BOM, escritura atómica con reintentos y respaldo previo.
import { readFileSync, writeFileSync, renameSync, mkdirSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

const INTENTOS = 3;
const dormir = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export const sinBom = (t) => (String(t).charCodeAt(0) === 0xfeff ? String(t).slice(1) : String(t));
export const textoJson = (datos) => `${JSON.stringify(datos, null, 2)}\n`;

// Un archivo ausente no es un error; uno con JSON inválido sí, y quien llama decide no tocarlo.
export function leerJsonUsuario(ruta) {
  let texto;
  try {
    texto = readFileSync(ruta, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return { existe: false, datos: null, error: null };
    return { existe: true, datos: null, error: `No se pudo leer ${ruta}: ${e.message}` };
  }
  try {
    return { existe: true, datos: JSON.parse(sinBom(texto)), error: null };
  } catch (e) {
    return { existe: true, datos: null, error: `${ruta} no es JSON válido (${e.message})` };
  }
}

// Escribe en un temporal y lo renombra. Reintenta ante bloqueos breves (antivirus, OneDrive) y lanza si no puede.
export function escribirAtomico(ruta, texto) {
  const tmp = `${ruta}.${process.pid}.${Date.now()}.tmp`;
  for (let intento = 1; ; intento++) {
    try {
      mkdirSync(dirname(ruta), { recursive: true });
      writeFileSync(tmp, texto);
      renameSync(tmp, ruta);
      return;
    } catch (e) {
      if (intento < INTENTOS) { dormir(50); continue; }
      try { rmSync(tmp, { force: true }); } catch { /* nada que limpiar */ }
      throw e;
    }
  }
}

// Copia el archivo actual a `<ruta><sufijo>` si existe. Devuelve la ruta del respaldo o null.
export function respaldar(ruta, sufijo) {
  if (!existsSync(ruta)) return null;
  const destino = `${ruta}${sufijo}`;
  copyFileSync(ruta, destino);
  return destino;
}
