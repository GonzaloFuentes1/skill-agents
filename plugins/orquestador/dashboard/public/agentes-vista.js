// Estado puro de la pestaña Agentes: filtro del catálogo, estados de pack y formulario de agentes personalizados.
export const TEXTO_ESTADO = { activo: 'Activo', inactivo: 'Inactivo', actualizable: 'Actualización disponible', conflicto: 'Ya tienes uno propio' };
export const HERRAMIENTAS_FORM = [['Read', ['Read']], ['Grep y Glob', ['Grep', 'Glob']], ['Edit y Write', ['Edit', 'Write']], ['Bash', ['Bash']], ['Web', ['WebSearch', 'WebFetch']]];
export const MODELOS_AGENTE = [['haiku', 'Haiku'], ['sonnet', 'Sonnet'], ['opus', 'Opus'], ['fable', 'Fable'], ['inherit', 'Heredar']];
export const ESFUERZOS_AGENTE = ['low', 'medium', 'high', 'xhigh', 'max'];
export const SECCIONES_FORM = [
  ['rol', 'Rol', 'Quién es y con qué actitud trabaja', 2],
  ['metodo', 'Método', 'Los pasos que sigue, numerados', 4],
  ['entregable', 'Entregable', 'Qué produce exactamente', 2],
  ['restricciones', 'Restricciones', 'Lo que no debe hacer nunca', 2],
  ['retorno', 'Formato de Retorno', 'Cómo responde al orquestador (corto y fijo)', 2],
];
const TODAS = HERRAMIENTAS_FORM.flatMap(([, h]) => h);

export const normalizar = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Debe dar exactamente lo mismo que slugAgente de dashboard/agentes.mjs (lo comprueba un test).
export function slugAgente(nombre) {
  return normalizar(nombre).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
}

const coincide = (a, q) => !q || [a.id, a.nombre, a.description].some((x) => normalizar(x).includes(q));

export function filtrarAgentes(datos, texto) {
  const q = normalizar(texto).trim();
  const filtrar = (lista) => (lista ?? []).filter((a) => coincide(a, q));
  return {
    ...datos,
    packs: (datos?.packs ?? []).map((p) => ({ ...p, agentes: filtrar(p.agentes) })).filter((p) => !q || p.agentes.length),
    plugin: filtrar(datos?.plugin),
    integrados: filtrar(datos?.integrados),
    personalizados: filtrar(datos?.personalizados),
  };
}

export const estadoPack = (p) => (!p.activos ? 'false' : p.activos >= p.total ? 'true' : 'mixed');

export function formularioVacio() {
  return {
    nombre: '', descripcion: '', modelo: 'sonnet', esfuerzo: 'medium', herramientas: ['Read', 'Grep', 'Glob'], alcance: 'usuario',
    secciones: { rol: '', metodo: '', entregable: '', restricciones: '', retorno: '' }, editando: null, errores: {},
  };
}

export function desdeDetalle(det, { duplicar = false } = {}) {
  const base = formularioVacio();
  const herramientas = String(det?.tools ?? '').split(',').map((t) => t.trim()).filter((t) => TODAS.includes(t));
  return {
    ...base,
    nombre: duplicar ? `${det.nombre} (copia)` : det.nombre,
    descripcion: det.description ?? '',
    modelo: MODELOS_AGENTE.some(([m]) => m === det.model) ? det.model : base.modelo,
    esfuerzo: ESFUERZOS_AGENTE.includes(det.effort) ? det.effort : base.esfuerzo,
    herramientas: herramientas.length ? herramientas : base.herramientas,
    alcance: det.alcance ?? 'usuario',
    secciones: { ...base.secciones, ...(det.secciones ?? {}) },
    editando: duplicar ? null : det.id,
  };
}

const grupo = (etiqueta) => HERRAMIENTAS_FORM.find(([e]) => e === etiqueta)?.[1] ?? [];
export const herramientaMarcada = (form, etiqueta) => grupo(etiqueta).every((h) => form.herramientas.includes(h));

export function alternarHerramienta(form, etiqueta) {
  const g = grupo(etiqueta);
  const resto = form.herramientas.filter((h) => !g.includes(h));
  return { ...form, herramientas: herramientaMarcada(form, etiqueta) ? resto : [...resto, ...g] };
}

export function cuerpoFormulario(form, conversacion = null) {
  return {
    nombre: form.nombre.trim(), descripcion: form.descripcion.trim(), modelo: form.modelo, esfuerzo: form.esfuerzo,
    herramientas: [...form.herramientas], alcance: form.alcance, secciones: { ...form.secciones },
    ...(form.alcance === 'proyecto' && conversacion ? { conversacion } : {}),
  };
}

export const rutaArchivo = (form) => `${form.alcance === 'proyecto' ? '.claude/agents/' : '~/.claude/agents/'}${(form.editando ?? slugAgente(form.nombre)) || '<nombre>'}.md`;
