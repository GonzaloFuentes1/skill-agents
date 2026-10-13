// Modo automático de Claude Code: la sección autoMode de ~/.claude/settings.json (solo de usuario) y `claude auto-mode`.
// Nunca toca hard_deny ni permissions.allow/deny; respalda antes de escribir y conserva todas las demás claves.
import { rutaSettingsUsuario } from '../scripts/lib/rutas.mjs';
import { leerJsonUsuario, escribirAtomico, textoJson, respaldar } from '../scripts/lib/archivos.mjs';
import { ejecutarClaude } from './cli-claude.mjs';
import { ErrorConversacion } from './conversaciones.mjs';

export const DEFECTOS = '$defaults';
export const SUFIJO_RESPALDO = '.orquestador.bak';
export const PREFIJOS = Object.freeze({ repos: 'Source control: ', dominios: 'Trusted internal domains: ', organizacion: 'Organization: ' });
const CACHE_MS = 10 * 60 * 1000;
const MAX_REGLAS = 50;
const MAX_REGLA = 500;

const esObjeto = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const textos = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
const sinDefectos = (v) => textos(v).filter((x) => x !== DEFECTOS);
const separar = (t) => t.split(',').map((x) => x.trim()).filter(Boolean);
const ultimaLinea = (t) => String(t ?? '').trim().split('\n').filter(Boolean).pop() ?? '';

export function entornoAProsa({ repos = [], dominios = [], organizacion = '' } = {}) {
  const out = [];
  if (repos.length) out.push(`${PREFIJOS.repos}${repos.join(', ')}`);
  if (dominios.length) out.push(`${PREFIJOS.dominios}${dominios.join(', ')}`);
  if (String(organizacion ?? '').trim()) out.push(`${PREFIJOS.organizacion}${String(organizacion).trim()}`);
  return out;
}

export function prosaAEntorno(entradas) {
  const r = { repos: [], dominios: [], organizacion: '', otras: [] };
  for (const e of sinDefectos(entradas)) {
    if (e.startsWith(PREFIJOS.repos)) r.repos.push(...separar(e.slice(PREFIJOS.repos.length)));
    else if (e.startsWith(PREFIJOS.dominios)) r.dominios.push(...separar(e.slice(PREFIJOS.dominios.length)));
    else if (e.startsWith(PREFIJOS.organizacion) && !r.organizacion) r.organizacion = e.slice(PREFIJOS.organizacion.length).trim();
    else r.otras.push(e);
  }
  return r;
}

export function leerAutoModo(env = process.env) {
  const { datos, error } = leerJsonUsuario(rutaSettingsUsuario(env));
  const s = esObjeto(datos) ? datos : {};
  const am = esObjeto(s.autoMode) ? s.autoMode : {};
  const { otras, ...entorno } = prosaAEntorno(am.environment);
  return {
    personalizadas: { permitir: sinDefectos(am.allow), detener: sinDefectos(am.soft_deny), entorno, otrasEntorno: otras },
    classifyAllShell: am.classifyAllShell === true,
    defaultModeTerminal: s.permissions?.defaultMode === 'auto',
    // Arreglos propios sin "$defaults": hoy reemplazan las reglas de fábrica; guardar desde el dashboard las vuelve a incluir.
    sinFabrica: ['environment', 'allow', 'soft_deny'].filter((k) => Array.isArray(am[k]) && am[k].length > 0 && !am[k].includes(DEFECTOS)),
    errorSettings: error ?? (datos != null && !esObjeto(datos) ? 'settings.json no contiene un objeto JSON' : null),
  };
}

function reglas(v, campo, errores) {
  if (!Array.isArray(v)) { errores[campo] = 'Debe ser una lista'; return []; }
  const limpias = v.map((x) => (typeof x === 'string' ? x.trim() : ''));
  if (limpias.some((x) => !x || x.length > MAX_REGLA || x.includes('\n'))) errores[campo] = `Cada regla debe tener entre 1 y ${MAX_REGLA} caracteres, en una línea`;
  else if (limpias.includes(DEFECTOS)) errores[campo] = '"$defaults" lo agrega el dashboard; no lo escribas';
  else if (limpias.length > MAX_REGLAS) errores[campo] = `Máximo ${MAX_REGLAS} reglas`;
  return [...new Set(limpias)];
}

function valores(v, campo, errores) {
  if (!Array.isArray(v)) { errores[campo] = 'Debe ser una lista'; return []; }
  const limpios = v.map((x) => (typeof x === 'string' ? x.trim() : ''));
  if (limpios.some((x) => !x || x.length > 200 || /[,\n]/.test(x))) errores[campo] = 'Un valor por entrada, sin comas ni saltos de línea (máx. 200 caracteres)';
  return [...new Set(limpios)];
}

export function validarAutoModo(cuerpo) {
  const c = esObjeto(cuerpo) ? cuerpo : {};
  const errores = {};
  const entorno = esObjeto(c.entorno) ? c.entorno : {};
  let organizacion = '';
  if (entorno.organizacion != null) {
    if (typeof entorno.organizacion !== 'string' || entorno.organizacion.trim().length > 200 || entorno.organizacion.includes('\n')) errores.organizacion = 'Máximo 200 caracteres, en una línea';
    else organizacion = entorno.organizacion.trim();
  }
  for (const k of ['classifyAllShell', 'defaultModeTerminal']) if (c[k] !== undefined && typeof c[k] !== 'boolean') errores[k] = 'Debe ser verdadero o falso';
  const limpio = {
    permitir: reglas(c.permitir ?? [], 'permitir', errores),
    detener: reglas(c.detener ?? [], 'detener', errores),
    entorno: { repos: valores(entorno.repos ?? [], 'repos', errores), dominios: valores(entorno.dominios ?? [], 'dominios', errores), organizacion },
    classifyAllShell: c.classifyAllShell,
    defaultModeTerminal: c.defaultModeTerminal,
  };
  return { errores, limpio };
}

export function escribirAutoModo(cuerpo, env = process.env) {
  const { errores, limpio } = validarAutoModo(cuerpo);
  if (Object.keys(errores).length) throw new ErrorConversacion(400, 'Hay reglas inválidas', { errores });
  const ruta = rutaSettingsUsuario(env);
  const actual = leerJsonUsuario(ruta);
  if (actual.error) throw new ErrorConversacion(409, `${actual.error}. No lo modifiqué.`);
  if (actual.existe && !esObjeto(actual.datos)) throw new ErrorConversacion(409, `${ruta} no contiene un objeto JSON. No lo modifiqué.`);
  const s = actual.datos ?? {};
  const am = esObjeto(s.autoMode) ? s.autoMode : {};
  const nuevoAm = {
    ...am, // hard_deny y cualquier otra clave de autoMode quedan como estaban
    environment: [DEFECTOS, ...entornoAProsa(limpio.entorno), ...prosaAEntorno(am.environment).otras],
    allow: [DEFECTOS, ...limpio.permitir],
    soft_deny: [DEFECTOS, ...limpio.detener],
  };
  if (typeof limpio.classifyAllShell === 'boolean') nuevoAm.classifyAllShell = limpio.classifyAllShell;
  const nuevo = { ...s, autoMode: nuevoAm };
  if (typeof limpio.defaultModeTerminal === 'boolean') {
    const permisos = esObjeto(s.permissions) ? { ...s.permissions } : {};
    if (limpio.defaultModeTerminal) permisos.defaultMode = 'auto';
    else if (permisos.defaultMode === 'auto') delete permisos.defaultMode; // vuelve a la conducta de fábrica
    if (Object.keys(permisos).length || 'permissions' in s) nuevo.permissions = permisos;
  }
  respaldar(ruta, SUFIJO_RESPALDO);
  escribirAtomico(ruta, textoJson(nuevo));
  return leerAutoModo(env);
}

export function parsearReglas(texto) {
  let o;
  try { o = JSON.parse(String(texto)); } catch { throw new ErrorConversacion(502, 'claude auto-mode defaults no devolvió JSON'); }
  const r = esObjeto(o?.autoMode) ? o.autoMode : o;
  if (!esObjeto(r)) throw new ErrorConversacion(502, 'claude auto-mode defaults devolvió un formato inesperado');
  return { environment: textos(r.environment), allow: textos(r.allow), soft_deny: textos(r.soft_deny), hard_deny: textos(r.hard_deny) };
}

export function etiquetaRegla(texto) {
  const s = String(texto ?? '');
  const i = s.indexOf(':');
  const e = (i > 0 ? s.slice(0, i) : s).trim();
  return e.length > 80 ? `${e.slice(0, 79)}…` : e;
}

export function crearAutoModo({ env = process.env, spawnFn, ahora = Date.now } = {}) {
  let cache = null; // { ts, reglas }: `claude auto-mode defaults` es local y no gasta uso, pero tarda

  async function defaults() {
    if (cache && ahora() - cache.ts < CACHE_MS) return cache.reglas;
    const r = await ejecutarClaude(['auto-mode', 'defaults'], { env, spawnFn, timeoutMs: 30_000 });
    if (r.codigo !== 0) throw new ErrorConversacion(502, ultimaLinea(r.stderr) || `claude auto-mode defaults terminó con código ${r.codigo}`);
    const reglas = parsearReglas(r.stdout);
    cache = { ts: ahora(), reglas };
    return reglas;
  }

  const api = {
    async estado() {
      const base = leerAutoModo(env);
      try {
        const f = await defaults();
        return { ...base, conteosFabrica: { allow: f.allow.length, soft_deny: f.soft_deny.length, hard_deny: f.hard_deny.length }, disponible: true, motivo: null };
      } catch (e) {
        return { ...base, conteosFabrica: null, disponible: false, motivo: e.message };
      }
    },
    async guardar(cuerpo) {
      escribirAutoModo(cuerpo, env);
      return api.estado();
    },
    async critica() {
      const r = await ejecutarClaude(['auto-mode', 'critique'], { env, spawnFn, timeoutMs: 120_000 });
      if (r.codigo !== 0) throw new ErrorConversacion(502, ultimaLinea(r.stderr) || 'La revisión de Claude falló');
      return { texto: r.stdout.trim() };
    },
    async restablecer(cuerpo) {
      if (cuerpo?.confirmar !== true) throw new ErrorConversacion(400, 'Confirma el restablecimiento con {confirmar:true}');
      respaldar(rutaSettingsUsuario(env), SUFIJO_RESPALDO);
      const r = await ejecutarClaude(['auto-mode', 'reset', '-y'], { env, spawnFn, timeoutMs: 30_000 });
      if (r.codigo !== 0) throw new ErrorConversacion(502, ultimaLinea(r.stderr) || 'No se pudo restablecer el modo automático');
      return api.estado();
    },
    async fabrica() {
      const f = await defaults();
      return { allow: f.allow.map(etiquetaRegla), soft_deny: f.soft_deny.map(etiquetaRegla), hard_deny: f.hard_deny.map(etiquetaRegla) };
    },
  };
  return api;
}
