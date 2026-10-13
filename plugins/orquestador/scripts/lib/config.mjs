// Configuración del orquestador (~/.claude/orquestador/config.json): defectos, lectura tolerante, validación y guardado.
import { existsSync } from 'node:fs';
import { rutaConfig } from './rutas.mjs';
import { ESFUERZOS } from './modelos.mjs';
import { leerJsonUsuario, escribirAtomico, textoJson } from './archivos.mjs';

export const MODELOS_ORQUESTADOR = Object.freeze(['haiku', 'sonnet', 'opus', 'fable']);
export const MODOS_PERMISO = Object.freeze(['preguntar', 'ediciones', 'auto']);
export const AL_BLOQUEAR = Object.freeze(['preguntar', 'denegar']);
export const CLASES_RUBRICA = Object.freeze(['Mecánica', 'Producción acotada', 'Síntesis y análisis', 'Juicio experto', 'Problema abierto', 'Máxima consecuencia']);
const fila = (clase, modelo, esfuerzo) => Object.freeze({ clase, modelo, esfuerzo });
export const RUBRICA_FABRICA = Object.freeze([
  fila('Mecánica', 'haiku', 'low'),
  fila('Producción acotada', 'sonnet', 'medium'),
  fila('Síntesis y análisis', 'sonnet', 'high'),
  fila('Juicio experto', 'opus', 'high'),
  fila('Problema abierto', 'opus', 'xhigh'),
  fila('Máxima consecuencia', 'fable', 'high'),
]);
const CAMPOS_PRECIO = ['entrada', 'salida', 'cacheLectura', 'cacheEscritura'];
const TODAS_LAS_INTERFACES = ['0.0.0.0', '::', '[::]', '0:0:0:0:0:0:0:0'];

// Precios en USD por millón de tokens (lista oficial vigente al 2026-10-06; escritura de caché = 1,25× entrada).
export const CONFIG_DEFECTO = Object.freeze({
  fableMaxPorSesion: 2,
  paraleloMax: 4,
  puertoDashboard: 4321,
  modelosOrquestador: ['opus', 'fable'],
  ramasProtegidas: ['main', 'master'],
  conversacionesMax: 2,
  rutaClaude: null,
  remoto: { activo: false, escuchar: '127.0.0.1', hostsPermitidos: [] },
  modoPermisoDefecto: 'preguntar',
  alBloquear: 'preguntar',
  mostrarCosto: true,
  alertasModelo: true,
  rubrica: RUBRICA_FABRICA,
  precios: {
    haiku: { entrada: 0.1, salida: 0.5, cacheLectura: 0.01, cacheEscritura: 0.125 },
    sonnet: { entrada: 2, salida: 10, cacheLectura: 0.2, cacheEscritura: 2.5 },
    opus: { entrada: 4, salida: 20, cacheLectura: 0.2, cacheEscritura: 5 },
    fable: { entrada: 10, salida: 50, cacheLectura: 0.25, cacheEscritura: 12.5 },
  },
});

const esObjeto = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// Cada clase toma la fila del usuario solo si su modelo y su esfuerzo son válidos; si no, la de fábrica.
export function normalizarRubrica(r) {
  const lista = Array.isArray(r) ? r : [];
  return RUBRICA_FABRICA.map((f) => {
    const u = lista.find((x) => x?.clase === f.clase);
    return u && MODELOS_ORQUESTADOR.includes(u.modelo) && ESFUERZOS.includes(u.esfuerzo)
      ? { clase: f.clase, modelo: u.modelo, esfuerzo: u.esfuerzo }
      : { ...f };
  });
}

export const rubricaEsDeFabrica = (r) => normalizarRubrica(r)
  .every((x, i) => x.modelo === RUBRICA_FABRICA[i].modelo && x.esfuerzo === RUBRICA_FABRICA[i].esfuerzo);

export function cargarConfig(env = process.env) {
  const { datos } = leerJsonUsuario(rutaConfig(env));
  const usuario = esObjeto(datos) ? datos : {};
  return {
    ...CONFIG_DEFECTO, ...usuario,
    precios: { ...CONFIG_DEFECTO.precios, ...(esObjeto(usuario.precios) ? usuario.precios : {}) },
    remoto: { ...CONFIG_DEFECTO.remoto, ...(esObjeto(usuario.remoto) ? usuario.remoto : {}) },
    rubrica: normalizarRubrica(usuario.rubrica),
  };
}

const entero = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const booleano = (v) => (typeof v === 'boolean' ? null : 'Debe ser verdadero o falso');

function validarRubrica(v) {
  if (!Array.isArray(v) || v.length !== CLASES_RUBRICA.length) return `Deben ser ${CLASES_RUBRICA.length} filas, una por clase`;
  for (const [i, f] of v.entries()) {
    if (f?.clase !== CLASES_RUBRICA[i]) return `La fila ${i + 1} debe ser "${CLASES_RUBRICA[i]}"`;
    if (!MODELOS_ORQUESTADOR.includes(f.modelo)) return `${f.clase}: modelo inválido`;
    if (!ESFUERZOS.includes(f.esfuerzo)) return `${f.clase}: esfuerzo inválido`;
  }
  return null;
}

function validarPrecios(v) {
  if (!esObjeto(v)) return 'Debe ser una tabla por modelo';
  for (const [m, p] of Object.entries(v)) {
    if (!MODELOS_ORQUESTADOR.includes(m)) return `Modelo desconocido: ${m}`;
    if (!esObjeto(p) || !CAMPOS_PRECIO.every((k) => typeof p[k] === 'number' && Number.isFinite(p[k]) && p[k] >= 0 && p[k] <= 1000)) {
      return `${m}: cada precio debe ser un número entre 0 y 1000`;
    }
  }
  return null;
}

function validarRemotoConfig(v) {
  if (!esObjeto(v)) return 'Debe ser un objeto';
  if (typeof v.activo !== 'boolean') return 'activo debe ser verdadero o falso';
  if (typeof v.escuchar !== 'string' || !/^[\w.:[\]-]{1,100}$/.test(v.escuchar)) return 'escuchar debe ser una IP o un nombre de host';
  if (!Array.isArray(v.hostsPermitidos) || !v.hostsPermitidos.every((h) => typeof h === 'string' && h.length <= 253)) return 'hostsPermitidos debe ser una lista de nombres';
  if (v.activo && TODAS_LAS_INTERFACES.includes(v.escuchar) && !v.hostsPermitidos.some((h) => h.trim())) {
    return 'Escuchar en todas las interfaces exige al menos un host permitido';
  }
  return null;
}

const VALIDADORES = {
  paraleloMax: (v) => (entero(v, 1, 8) ? null : 'Debe ser un entero entre 1 y 8'),
  fableMaxPorSesion: (v) => (entero(v, 0, 5) ? null : 'Debe ser un entero entre 0 y 5'),
  conversacionesMax: (v) => (entero(v, 1, 4) ? null : 'Debe ser un entero entre 1 y 4'),
  modelosOrquestador: (v) => (Array.isArray(v) && v.length >= 1 && new Set(v).size === v.length && v.every((m) => MODELOS_ORQUESTADOR.includes(m))
    ? null : 'Elige al menos un modelo entre haiku, sonnet, opus y fable'),
  modoPermisoDefecto: (v) => (MODOS_PERMISO.includes(v) ? null : 'Debe ser preguntar, ediciones o auto'),
  alBloquear: (v) => (AL_BLOQUEAR.includes(v) ? null : 'Debe ser preguntar o denegar'),
  mostrarCosto: booleano,
  alertasModelo: booleano,
  rubrica: validarRubrica,
  precios: validarPrecios,
  ramasProtegidas: (v) => (Array.isArray(v) && v.length <= 20 && new Set(v).size === v.length && v.every((r) => typeof r === 'string' && /^[\w./-]{1,100}$/.test(r))
    ? null : 'Hasta 20 nombres de rama, sin espacios ni repetidos'),
  puertoDashboard: (v) => (entero(v, 1024, 65535) ? null : 'Debe ser un entero entre 1024 y 65535'),
  remoto: validarRemotoConfig,
};
export const CLAVES_EDITABLES = Object.freeze(Object.keys(VALIDADORES));

export function validarConfig(parcial) {
  if (!esObjeto(parcial)) return { errores: { _: 'La configuración debe ser un objeto' }, limpio: {} };
  const errores = {};
  const limpio = {};
  for (const [k, v] of Object.entries(parcial)) {
    if (!VALIDADORES[k]) continue; // desconocida o no editable desde el dashboard (p. ej. rutaClaude)
    const error = VALIDADORES[k](v);
    if (error) errores[k] = error;
    else limpio[k] = structuredClone(v);
  }
  return { errores, limpio };
}

// Fusiona `parcial` (validado) sobre el archivo actual: las claves desconocidas del usuario se conservan.
export function guardarConfig(parcial, env = process.env) {
  const { errores, limpio } = validarConfig(parcial);
  if (Object.keys(errores).length) return { ok: false, errores };
  const ruta = rutaConfig(env);
  const actual = leerJsonUsuario(ruta);
  if (actual.error) return { ok: false, errores: { _: `${actual.error}. Corrígelo o bórralo antes de guardar desde el dashboard.` } };
  const base = esObjeto(actual.datos) ? actual.datos : {};
  const nuevo = { ...base, ...limpio };
  if (limpio.precios) nuevo.precios = { ...(esObjeto(base.precios) ? base.precios : {}), ...limpio.precios };
  escribirAtomico(ruta, textoJson(nuevo));
  return { ok: true, config: cargarConfig(env) };
}

export function asegurarConfig(env = process.env) {
  const ruta = rutaConfig(env);
  if (existsSync(ruta)) return;
  escribirAtomico(ruta, textoJson(CONFIG_DEFECTO));
}
