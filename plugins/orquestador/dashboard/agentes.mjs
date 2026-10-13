// Agentes del dashboard: catálogo del plugin (activar y desactivar con marcador), agentes del plugin, integrados y personalizados.
// Todas las rutas se arman aquí a partir de ids validados; nunca se toman de la petición.
import { readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsearFrontmatter } from '../scripts/lib/frontmatter.mjs';
import { AGENTES_INTEGRADOS, extraerPersona } from '../scripts/lib/agentes.mjs';
import { rutaAgentesUsuario, rutaAgentesProyecto } from '../scripts/lib/rutas.mjs';
import { escribirAtomico, respaldar, sinBom } from '../scripts/lib/archivos.mjs';
import { ESFUERZOS } from '../scripts/lib/modelos.mjs';
import { ejecutarClaude } from './cli-claude.mjs';
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
// Los agentes creados (o editados) desde el dashboard llevan este marcador; un .md sin marcador es "escrito a mano" y es de solo lectura.
export const MARCADOR_PERSONALIZADO = '<!-- orquestador:personalizado -->';
export const esPersonalizado = (texto) => String(texto ?? '').includes(MARCADOR_PERSONALIZADO);
const sinMarcadorPersonalizado = (texto) => String(texto ?? '').split(MARCADOR_PERSONALIZADO).join('');
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

const idValido = (id) => typeof id === 'string' && id.length >= 3 && id.length <= 40 && ID_AGENTE.test(id);

export function validarId(id) {
  if (!idValido(id)) throw new ErrorConversacion(400, 'Identificador de agente inválido');
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
    // Un nombre de archivo que no es un id válido (CodeReviewer.md, my_agent.md) se lista, pero sin detalle ni edición.
    const fueraDeFormato = !idValido(id);
    const escritoAMano = !esPersonalizado(a.texto);
    out.push(resumen({ id, ...a }, { alcance, chocaConCatalogo: catalogo.has(id), editable: !fueraDeFormato && !escritoAMano, escritoAMano, fueraDeFormato }));
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
  const editable = propio && esPersonalizado(a.texto);
  return {
    origen, ...resumen(a), ...extra, archivo, prompt: sinMarcadorPersonalizado(a.cuerpo).trim(), persona: extraerPersona(a.cuerpo),
    secciones: seccionesDe(a.cuerpo), editable, escritoAMano: propio && !editable, alcance: propio ? origen : null,
  };
}

// ---------- agentes personalizados ----------
export const TOOLS_VALIDAS = Object.freeze(['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash', 'WebSearch', 'WebFetch', 'NotebookEdit']);
export const MODELOS_AGENTE = Object.freeze(['haiku', 'sonnet', 'opus', 'fable', 'inherit']);
const COLOR_POR_MODELO = { haiku: 'cyan', sonnet: 'blue', opus: 'purple', fable: 'pink', inherit: 'green' };
export const REGLAS_CRITICAS = [
  '## REGLAS CRÍTICAS',
  '',
  '- Nunca agregues coautoría de IA (`Co-Authored-By`, "Generated with Claude") en nada que produzcas.',
  '- No inventes fuentes, citas, URLs, datos ni resultados. Si algo no se puede verificar, dilo.',
  '- No hagas commits ni push: eso es del Guardián Git (`orquestador:guardian-git`).',
  '- Respeta los permisos: si una acción se deniega, no la rodees; informa el bloqueo y propón otra vía.',
  '- Responde en español.',
].join('\n');

export function slugAgente(nombre) {
  return String(nombre ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
}

const esObjeto = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// Solo formato. Las colisiones con el catálogo, el plugin o los integrados se revisan al crear (409).
export function validarAgente(campos, { id: idFijo = null } = {}) {
  const c = esObjeto(campos) ? campos : {};
  const errores = {};
  const id = idFijo ?? slugAgente(c.nombre);
  if (id.length < 3 || id.length > 40 || !ID_AGENTE.test(id)) errores.nombre = 'El nombre debe dar un id de 3 a 40 caracteres (letras, números y guiones)';
  const descripcion = typeof c.descripcion === 'string' ? c.descripcion.trim() : '';
  if (descripcion.length < 20 || descripcion.length > 400 || /[\n"\\]/.test(descripcion)) {
    errores.descripcion = 'Entre 20 y 400 caracteres, en una línea, sin comillas dobles ni barras invertidas';
  }
  if (!MODELOS_AGENTE.includes(c.modelo)) errores.modelo = 'Elige haiku, sonnet, opus, fable o heredar';
  if (!ESFUERZOS.includes(c.esfuerzo)) errores.esfuerzo = 'Elige un esfuerzo válido';
  const pedidas = Array.isArray(c.herramientas) ? [...new Set(c.herramientas)] : [];
  if (!pedidas.length || !pedidas.every((h) => TOOLS_VALIDAS.includes(h))) errores.herramientas = 'Elige al menos una herramienta válida';
  const sec = esObjeto(c.secciones) ? c.secciones : {};
  const secciones = {};
  for (const [k, titulo] of SECCIONES) {
    const v = typeof sec[k] === 'string' ? sec[k].replace(/\r\n/g, '\n').trim() : '';
    if (!v || v.length > 4000) errores[k] = `${titulo}: entre 1 y 4000 caracteres`;
    else if (/^##\s/m.test(v) || v.includes('<!--')) errores[k] = `${titulo}: sin títulos "##" ni comentarios HTML`;
    secciones[k] = v;
  }
  const alcance = c.alcance ?? 'usuario';
  if (!['usuario', 'proyecto'].includes(alcance)) errores.alcance = 'Elige "Todos mis proyectos" o "Solo este repo"';
  return { errores, limpio: { id, descripcion, modelo: c.modelo, esfuerzo: c.esfuerzo, herramientas: TOOLS_VALIDAS.filter((t) => pedidas.includes(t)), secciones, alcance } };
}

const primeraFrase = (t) => {
  const s = String(t ?? '').split('\n')[0].trim();
  const m = /^(.+?[.!?])(\s|$)/.exec(s);
  return (m ? m[1] : s).slice(0, 200);
};

export function construirArchivo({ id, descripcion, modelo, esfuerzo, herramientas, secciones }) {
  return [
    '---', `name: ${id}`, `description: "${descripcion}"`, `model: ${modelo}`, `effort: ${esfuerzo}`,
    `tools: ${herramientas.join(', ')}`, `color: ${COLOR_POR_MODELO[modelo]}`, '---', '',
    `Persona: ${primeraFrase(secciones.rol)}`, '',
    ...SECCIONES.flatMap(([k, titulo]) => [`## ${titulo}`, '', secciones[k], '']),
    REGLAS_CRITICAS, '', MARCADOR_PERSONALIZADO, '',
  ].join('\n');
}

function dirAlcance(alcance, env, cwdProyecto) {
  if (alcance !== 'proyecto') return rutaAgentesUsuario(env);
  if (!cwdProyecto) throw new ErrorConversacion(400, 'Para guardar en el proyecto abre una conversación en esa carpeta');
  return rutaAgentesProyecto(cwdProyecto);
}

function exigirValido(errores) {
  if (Object.keys(errores).length) throw new ErrorConversacion(400, 'Revisa los campos marcados', { errores });
}

export function crearPersonalizado(campos, opciones = {}) {
  const o = opcionesDe(opciones);
  const { errores, limpio } = validarAgente(campos);
  exigirValido(errores);
  const { id } = limpio;
  if (cargarCatalogo(o.raizPlugin).has(id)) throw new ErrorConversacion(409, `"${id}" es un agente del catálogo; actívalo desde su pack o elige otro nombre`);
  if (idsReservados(o.raizPlugin).has(id)) throw new ErrorConversacion(409, `"${id}" es un agente del plugin o integrado de Claude Code; elige otro nombre`);
  const ruta = join(dirAlcance(limpio.alcance, o.env, o.cwdProyecto), `${id}.md`);
  if (existsSync(ruta)) throw new ErrorConversacion(409, `Ya existe un agente llamado ${id} en ${limpio.alcance === 'proyecto' ? 'este proyecto' : 'tus agentes'}`);
  escribirAtomico(ruta, construirArchivo(limpio));
  return detalleAgente(limpio.alcance, id, o);
}

// Solo los agentes creados desde el dashboard se editan o eliminan aquí: uno escrito a mano nunca se reescribe.
function rutaPropia(id, alcance, o) {
  const ruta = join(dirAlcance(alcance, o.env, o.cwdProyecto), `${id}.md`);
  if (!existsSync(ruta)) throw new ErrorConversacion(404, 'No existe ese agente personalizado');
  const texto = readFileSync(ruta, 'utf8');
  if (leerMarcador(texto)) throw new ErrorConversacion(409, `${id} viene del catálogo; duplícalo como personalizado para cambiarlo`);
  if (!esPersonalizado(texto)) throw new ErrorConversacion(409, `${id} fue escrito a mano: edítalo en su archivo o duplícalo como propio`);
  return ruta;
}

export function editarPersonalizado(id, campos, opciones = {}) {
  const o = opcionesDe(opciones);
  validarId(id);
  const { errores, limpio } = validarAgente(campos, { id });
  exigirValido(errores);
  const ruta = rutaPropia(id, limpio.alcance, o);
  respaldar(ruta, '.bak');
  escribirAtomico(ruta, construirArchivo(limpio));
  return detalleAgente(limpio.alcance, id, o);
}

export function eliminarPersonalizado(id, cuerpo, opciones = {}) {
  const o = opcionesDe(opciones);
  validarId(id);
  if (cuerpo?.confirmar !== true) throw new ErrorConversacion(400, 'Confirma la eliminación con {confirmar:true}');
  const alcance = cuerpo.alcance ?? 'usuario';
  if (!['usuario', 'proyecto'].includes(alcance)) throw new ErrorConversacion(400, 'Alcance inválido');
  const ruta = rutaPropia(id, alcance, o);
  respaldar(ruta, '.bak');
  rmSync(ruta);
  return { id, eliminado: true };
}

// ---------- "Redactar con Claude" ----------
export const ESQUEMA_SECCIONES = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: SECCIONES.map(([k]) => k),
  properties: Object.fromEntries(SECCIONES.map(([k, titulo]) => [k, { type: 'string', description: titulo }])),
});

export const argumentosRedactar = () => [
  '-p', '--model', 'sonnet', '--tools', '', '--no-session-persistence', '--output-format', 'json', '--json-schema', JSON.stringify(ESQUEMA_SECCIONES),
];

export function promptRedaccion({ nombre, descripcion, modelo, herramientas }) {
  return [
    'Redacta el prompt de sistema de un subagente de Claude Code. Devuelve solo las cinco secciones del esquema.',
    `Nombre: ${nombre}`,
    `Cuándo usarlo: ${descripcion}`,
    `Modelo: ${modelo}`,
    `Herramientas disponibles: ${herramientas.length ? herramientas.join(', ') : 'ninguna'}`,
    '',
    'Secciones:',
    '- rol: quién es, con qué actitud trabaja y en qué se diferencia de agentes vecinos (2 a 4 frases).',
    '- metodo: de 4 a 7 pasos numerados ("1. …"), cada uno una acción concreta y comprobable; el último verifica el resultado.',
    '- entregable: qué produce exactamente (formato, ubicación y nivel de detalle).',
    '- restricciones: de 3 a 5 viñetas ("- …") con lo que no debe hacer nunca.',
    '- retorno: estructura fija de 3 a 5 bloques numerados para responder al orquestador, en un máximo de ~300 palabras.',
    '',
    'No incluyas títulos "##" ni reglas sobre coautoría, commits o idioma: se agregan aparte.',
    'Escribe en español, profesional, sin relleno.',
  ].join('\n');
}

export function extraerRedaccion(stdout) {
  let o;
  try { o = JSON.parse(String(stdout ?? '').trim()); } catch { throw new ErrorConversacion(502, 'Claude no devolvió un borrador válido'); }
  if (o?.is_error) throw new ErrorConversacion(502, `Claude no pudo redactar: ${o.result ?? o.subtype ?? 'error'}`);
  let s = o?.structured_output;
  if (!esObjeto(s)) { try { s = JSON.parse(o?.result); } catch { s = null; } }
  if (!esObjeto(s) || !SECCIONES.every(([k]) => typeof s[k] === 'string' && s[k].trim())) throw new ErrorConversacion(502, 'El borrador de Claude no trae las cinco secciones');
  return Object.fromEntries(SECCIONES.map(([k]) => [k, s[k].trim()]));
}

export async function redactarPrompt(campos, { env = process.env, spawnFn, timeoutMs = 90_000 } = {}) {
  const c = esObjeto(campos) ? campos : {};
  const nombre = typeof c.nombre === 'string' ? c.nombre.trim() : '';
  const descripcion = typeof c.descripcion === 'string' ? c.descripcion.trim() : '';
  if (!nombre || nombre.length > 80) throw new ErrorConversacion(400, 'Escribe un nombre de hasta 80 caracteres', { errores: { nombre: 'Requerido, hasta 80 caracteres' } });
  if (!descripcion || descripcion.length > 400) throw new ErrorConversacion(400, 'Describe cuándo usarlo (hasta 400 caracteres)', { errores: { descripcion: 'Requerido, hasta 400 caracteres' } });
  if (!MODELOS_AGENTE.includes(c.modelo)) throw new ErrorConversacion(400, 'Elige un modelo', { errores: { modelo: 'Elige un modelo' } });
  const herramientas = Array.isArray(c.herramientas) ? c.herramientas.filter((h) => TOOLS_VALIDAS.includes(h)) : [];
  const r = await ejecutarClaude(argumentosRedactar(), { env, spawnFn, timeoutMs, entrada: promptRedaccion({ nombre, descripcion, modelo: c.modelo, herramientas }) });
  if (r.codigo !== 0) throw new ErrorConversacion(502, r.stderr.split('\n').filter(Boolean).pop() || `Claude Code terminó con código ${r.codigo}`);
  return extraerRedaccion(r.stdout);
}
