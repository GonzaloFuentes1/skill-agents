// Agentes del dashboard: catálogo del plugin (activar y desactivar con marcador), agentes del plugin, integrados y personalizados.
// Todas las rutas se arman aquí a partir de ids validados; nunca se toman de la petición.
import { readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsearFrontmatter } from '../scripts/lib/frontmatter.mjs';
import { AGENTES_INTEGRADOS, extraerPersona } from '../scripts/lib/agentes.mjs';
import { rutaAgentesUsuario, rutaAgentesProyecto } from '../scripts/lib/rutas.mjs';
import { escribirAtomico, sinBom } from '../scripts/lib/archivos.mjs';
import { ErrorConversacion } from './conversaciones.mjs';

export const RAIZ_PLUGIN = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
export const ID_AGENTE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SECCIONES = Object.freeze([['rol', 'Rol'], ['metodo', 'Método'], ['entregable', 'Entregable'], ['restricciones', 'Restricciones'], ['retorno', 'Formato de retorno']]);
export const AVISO_INTEGRADO = 'Prompt de Anthropic, no visible. Si necesitas una variante, duplícalo como agente personalizado.';
export const INTEGRADOS = Object.freeze([
  Object.freeze({ id: 'general-purpose', nombre: 'General-purpose', description: 'Tareas de varios pasos cuando ningún otro agente encaja.', model: AGENTES_INTEGRADOS['general-purpose'], effort: null, tools: 'Todas las herramientas' }),
  Object.freeze({ id: 'Explore', nombre: 'Explore', description: 'Búsqueda de solo lectura en muchos archivos; devuelve conclusiones.', model: AGENTES_INTEGRADOS.Explore, effort: null, tools: 'Solo lectura' }),
  Object.freeze({ id: 'Plan', nombre: 'Plan', description: 'Diseña planes de implementación paso a paso.', model: AGENTES_INTEGRADOS.Plan, effort: null, tools: 'Solo lectura' }),
]);

const MARCADOR = /<!-- orquestador:catalogo id=([a-z0-9-]+) version=([^\s>]+) -->/;
export const marcador = (id, version) => `<!-- orquestador:catalogo id=${id} version=${version} -->`;
export function leerMarcador(texto) {
  const m = MARCADOR.exec(String(texto ?? ''));
  return m ? { id: m[1], version: m[2] } : null;
}
export const nombreDesdeId = (id) => String(id).split('-').filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');

const opcionesDe = ({ env = process.env, raizPlugin = RAIZ_PLUGIN, cwdProyecto = null } = {}) => ({ env, raizPlugin, cwdProyecto });

export function versionPlugin(raizPlugin = RAIZ_PLUGIN) {
  return JSON.parse(readFileSync(join(raizPlugin, '.claude-plugin', 'plugin.json'), 'utf8')).version;
}

export function leerPacks(raizPlugin = RAIZ_PLUGIN) {
  return JSON.parse(sinBom(readFileSync(join(raizPlugin, 'catalogo', 'packs.json'), 'utf8')));
}

function leerArchivoAgente(ruta) {
  const texto = sinBom(readFileSync(ruta, 'utf8'));
  return { texto, ...parsearFrontmatter(texto) };
}

// Las 5 secciones del cuerpo por su título "## …"; lo demás (Persona, REGLAS CRÍTICAS, marcador) se ignora.
export function seccionesDe(cuerpo) {
  const out = Object.fromEntries(SECCIONES.map(([k]) => [k, '']));
  const porTitulo = new Map(SECCIONES.map(([k, t]) => [t.toLowerCase(), k]));
  let actual = null;
  let buffer = [];
  const cerrar = () => { if (actual) out[actual] = buffer.join('\n').trim(); };
  for (const linea of String(cuerpo ?? '').replace(/\r\n/g, '\n').split('\n')) {
    const m = /^##\s+(.+?)\s*$/.exec(linea);
    if (m) { cerrar(); actual = porTitulo.get(m[1].toLowerCase()) ?? null; buffer = []; continue; }
    if (actual) buffer.push(linea);
  }
  cerrar();
  return out;
}

export function cargarCatalogo(raizPlugin = RAIZ_PLUGIN) {
  const mapa = new Map();
  for (const p of leerPacks(raizPlugin)) {
    for (const id of p.agentes) {
      const ruta = join(raizPlugin, 'catalogo', p.id, `${id}.md`);
      if (!existsSync(ruta)) continue; // listado en packs.json pero todavía sin archivo
      mapa.set(id, { id, pack: p.id, ruta, nombre: p.nombres?.[id] ?? nombreDesdeId(id), ...leerArchivoAgente(ruta) });
    }
  }
  return mapa;
}

export function agentesDelPlugin(raizPlugin = RAIZ_PLUGIN) {
  const dir = join(raizPlugin, 'agents');
  let archivos = [];
  try { archivos = readdirSync(dir).filter((f) => f.endsWith('.md')); } catch { /* sin agentes propios */ }
  return archivos.map((f) => ({ id: basename(f, '.md'), nombre: nombreDesdeId(basename(f, '.md')), ruta: join(dir, f), ...leerArchivoAgente(join(dir, f)) }));
}

export const idsReservados = (raizPlugin = RAIZ_PLUGIN) => new Set([
  ...agentesDelPlugin(raizPlugin).map((a) => a.id.toLowerCase()),
  ...INTEGRADOS.map((a) => a.id.toLowerCase()),
]);

export function validarId(id) {
  if (typeof id !== 'string' || id.length < 3 || id.length > 40 || !ID_AGENTE.test(id)) throw new ErrorConversacion(400, 'Identificador de agente inválido');
  return id;
}

const rutaEnUsuario = (id, env) => join(rutaAgentesUsuario(env), `${id}.md`);

function estadoCon(id, env, version) {
  const ruta = rutaEnUsuario(id, env);
  if (!existsSync(ruta)) return 'inactivo';
  const m = leerMarcador(readFileSync(ruta, 'utf8'));
  if (!m || m.id !== id) return 'conflicto';
  return m.version === version ? 'activo' : 'actualizable';
}

export function estadoCatalogo(id, opciones = {}) {
  const { env, raizPlugin } = opcionesDe(opciones);
  return estadoCon(validarId(id), env, versionPlugin(raizPlugin));
}

const resumen = (a, extra = {}) => ({
  id: a.id, nombre: a.nombre ?? nombreDesdeId(a.id), description: a.datos?.description ?? '', model: a.datos?.model ?? null,
  effort: a.datos?.effort ?? null, tools: a.datos?.tools ?? null, color: a.datos?.color ?? null, ...extra,
});

export function activarCatalogo(id, opciones = {}) {
  const { env, raizPlugin } = opcionesDe(opciones);
  validarId(id);
  const a = cargarCatalogo(raizPlugin).get(id);
  if (!a) throw new ErrorConversacion(404, `No existe el agente ${id} en el catálogo`);
  const version = versionPlugin(raizPlugin);
  if (estadoCon(id, env, version) === 'conflicto') throw new ErrorConversacion(409, `Ya tienes un agente propio llamado ${id}`);
  escribirAtomico(rutaEnUsuario(id, env), `${a.texto.trimEnd()}\n\n${marcador(id, version)}\n`);
  return { id, estado: 'activo' };
}

export function desactivarCatalogo(id, opciones = {}) {
  const { env, raizPlugin } = opcionesDe(opciones);
  validarId(id);
  const estado = estadoCon(id, env, versionPlugin(raizPlugin));
  if (estado === 'conflicto') throw new ErrorConversacion(409, `Ya tienes un agente propio llamado ${id}; no lo borro`);
  if (estado !== 'inactivo') rmSync(rutaEnUsuario(id, env), { force: true });
  return { id, estado: 'inactivo' };
}

export function aplicarPack(packId, activo, opciones = {}) {
  const o = opcionesDe(opciones);
  if (typeof activo !== 'boolean') throw new ErrorConversacion(400, 'activo debe ser verdadero o falso');
  const pack = leerPacks(o.raizPlugin).find((p) => p.id === packId);
  if (!pack) throw new ErrorConversacion(404, `No existe el pack ${packId}`);
  const catalogo = cargarCatalogo(o.raizPlugin);
  const resultados = pack.agentes.filter((id) => catalogo.has(id)).map((id) => {
    try {
      return { ok: true, ...(activo ? activarCatalogo(id, o) : desactivarCatalogo(id, o)) };
    } catch (e) {
      return { ok: false, id, estado: estadoCatalogo(id, o), error: e.message };
    }
  });
  return { pack: pack.id, resultados };
}

function personalizadosEn(dir, alcance, catalogo) {
  let archivos = [];
  try { archivos = readdirSync(dir).filter((f) => f.endsWith('.md')); } catch { return []; }
  const out = [];
  for (const f of archivos) {
    const id = basename(f, '.md');
    let a;
    try { a = leerArchivoAgente(join(dir, f)); } catch { continue; }
    if (leerMarcador(a.texto)) continue; // activado desde el catálogo: aparece en su pack
    out.push(resumen({ id, ...a }, { alcance, chocaConCatalogo: catalogo.has(id) }));
  }
  return out;
}

export function listarAgentes(opciones = {}) {
  const { env, raizPlugin, cwdProyecto } = opcionesDe(opciones);
  const version = versionPlugin(raizPlugin);
  const catalogo = cargarCatalogo(raizPlugin);
  const packs = leerPacks(raizPlugin).map((p) => {
    const agentes = p.agentes.filter((id) => catalogo.has(id)).map((id) => resumen(catalogo.get(id), { estado: estadoCon(id, env, version) }));
    return {
      id: p.id, nombre: p.nombre, descripcion: p.descripcion, total: agentes.length,
      activos: agentes.filter((a) => a.estado === 'activo' || a.estado === 'actualizable').length, agentes,
    };
  });
  return {
    version,
    packs,
    plugin: agentesDelPlugin(raizPlugin).map((a) => resumen(a)),
    integrados: INTEGRADOS.map((a) => ({ ...a })),
    personalizados: [
      ...personalizadosEn(rutaAgentesUsuario(env), 'usuario', catalogo),
      ...(cwdProyecto ? personalizadosEn(rutaAgentesProyecto(cwdProyecto), 'proyecto', catalogo) : []),
    ],
  };
}

export function detalleAgente(origen, id, opciones = {}) {
  const { env, raizPlugin, cwdProyecto } = opcionesDe(opciones);
  if (origen === 'integrado') {
    const a = INTEGRADOS.find((x) => x.id === id);
    if (!a) throw new ErrorConversacion(404, 'No existe ese agente integrado');
    return { origen, ...a, color: null, archivo: 'Integrado en Claude Code', prompt: null, persona: null, secciones: null, aviso: AVISO_INTEGRADO, editable: false, alcance: null };
  }
  if (!['catalogo', 'plugin', 'usuario', 'proyecto'].includes(origen)) throw new ErrorConversacion(400, `Origen desconocido: ${origen}`);
  validarId(id);
  let a = null;
  let archivo = null;
  let extra = {};
  if (origen === 'catalogo') {
    a = cargarCatalogo(raizPlugin).get(id) ?? null;
    if (a) { archivo = `catalogo/${a.pack}/${id}.md`; extra = { pack: a.pack, estado: estadoCon(id, env, versionPlugin(raizPlugin)) }; }
  } else if (origen === 'plugin') {
    a = agentesDelPlugin(raizPlugin).find((x) => x.id === id) ?? null;
    if (a) archivo = `plugins/orquestador/agents/${id}.md`;
  } else {
    if (origen === 'proyecto' && !cwdProyecto) throw new ErrorConversacion(400, 'Para ver los agentes del proyecto abre una conversación en esa carpeta');
    const ruta = join(origen === 'usuario' ? rutaAgentesUsuario(env) : rutaAgentesProyecto(cwdProyecto), `${id}.md`);
    if (existsSync(ruta)) {
      a = { id, ...leerArchivoAgente(ruta) };
      archivo = ruta;
      if (leerMarcador(a.texto)) a = null; // activado desde el catálogo: se ve en su pack
    }
  }
  if (!a) throw new ErrorConversacion(404, 'No existe ese agente');
  const propio = origen === 'usuario' || origen === 'proyecto';
  return {
    origen, ...resumen(a), ...extra, archivo, prompt: a.cuerpo.trim(), persona: extraerPersona(a.cuerpo),
    secciones: seccionesDe(a.cuerpo), editable: propio, alcance: propio ? origen : null,
  };
}
