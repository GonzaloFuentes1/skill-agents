// Pestaña Agentes: catálogo por packs con interruptores, detalle con el prompt completo y formulario de agentes personalizados.
import { el, boton, interruptor, segmentado, confirmar, chipModelo } from './dom.js';
import {
  TEXTO_ESTADO, HERRAMIENTAS_FORM, MODELOS_AGENTE, ESFUERZOS_AGENTE, SECCIONES_FORM,
  filtrarAgentes, estadoPack, formularioVacio, desdeDetalle, alternarHerramienta, herramientaMarcada, cuerpoFormulario, rutaArchivo,
  textoVacio, accionesDetalle,
} from './agentes-vista.js';

let ctx = null;              // { api, toast, conversacionActual }
let datos = null;            // GET /api/agentes
let errorCarga = null;       // mensaje si GET /api/agentes falló (sin datos previos se muestra con "Reintentar")
let filtro = '';
let detalle = null;          // GET /api/agentes/:origen/:id
let form = formularioVacio();
let errorForm = null;
let redactando = false;
let guardando = false;

export function iniciarAgentes(contexto) { ctx = contexto; }

const consulta = () => { const c = ctx.conversacionActual(); return c ? `?conversacion=${encodeURIComponent(c)}` : ''; };
const conFoco = (nodo, clave) => { nodo.dataset.foco = clave; return nodo; };

export async function abrirAgentes() {
  try {
    datos = await ctx.api('GET', `/api/agentes${consulta()}`);
    errorCarga = null;
  } catch (e) {
    errorCarga = e.message;
    if (datos) ctx.toast(e.message); // con datos previos se siguen mostrando; sin ellos, la lista muestra el error
  }
  render();
}

function render() {
  const raiz = document.getElementById('vista-agentes');
  const foco = document.activeElement?.dataset?.foco ?? null;
  const catalogo = el('section', 'catalogo');
  catalogo.setAttribute('aria-label', 'Catálogo de agentes');
  const buscador = el('label', 'buscador');
  const input = conFoco(el('input'), 'filtro');
  input.type = 'search';
  input.placeholder = 'Filtrar por nombre, id o uso…';
  input.value = filtro;
  buscador.append(el('span', 'sr', 'Filtrar agentes'), input);
  const lista = el('div', 'catalogo-lista');
  input.addEventListener('input', () => { filtro = input.value; renderLista(lista); }); // solo la lista: el campo no pierde el foco
  catalogo.append(el('h2', 'serif', 'Agentes Disponibles'), el('p', 'tenue', 'Los agentes activados quedan en ~/.claude/agents/. Disponible en sesiones nuevas.'), buscador, lista);
  renderLista(lista);
  const panel = el('section', 'panel-agente');
  panel.setAttribute('aria-label', detalle ? 'Detalle del agente' : 'Nuevo agente');
  panel.append(detalle ? vistaDetalle() : vistaFormulario());
  raiz.replaceChildren(catalogo, panel);
  if (foco) raiz.querySelector(`[data-foco="${CSS.escape(foco)}"]`)?.focus();
}

// ---------- catálogo ----------
function renderLista(contenedor) {
  if (!datos) {
    if (!errorCarga) { contenedor.replaceChildren(el('p', 'tenue', 'Cargando agentes…')); return; }
    const reintentar = conFoco(boton('Reintentar', 'boton-secundario', () => { errorCarga = null; renderLista(contenedor); abrirAgentes(); }), 'reintentar-agentes');
    const caja = el('div', 'error-carga');
    caja.append(el('p', 'aviso e-error', `No se pudieron cargar los agentes: ${errorCarga}`), reintentar);
    contenedor.replaceChildren(caja);
    return;
  }
  const d = filtrarAgentes(datos, filtro);
  const hijos = [];
  if (filtro && !d.packs.length) hijos.push(el('p', 'tenue', 'Ningún agente del catálogo coincide con el filtro.'));
  for (const p of d.packs) hijos.push(grupoPack(p));
  hijos.push(
    grupoSimple('Personalizados', '~/.claude/agents/ y .claude/agents/ del proyecto abierto', d.personalizados.map((a) => tarjetaAgente(a, a.alcance)),
      textoVacio(filtro, 'Aún no tienes agentes personalizados. Crea uno con el formulario.')),
    grupoSimple('Del Plugin', 'plugins/orquestador/agents/', d.plugin.map((a) => tarjetaAgente(a, 'plugin')), textoVacio(filtro, null)),
    grupoSimple('Integrados de Claude Code', 'Prompt de Anthropic, no visible', d.integrados.map((a) => tarjetaAgente(a, 'integrado')), textoVacio(filtro, null)),
  );
  contenedor.replaceChildren(...hijos);
}

function grupoPack(p) {
  const g = el('section', 'grupo-agentes');
  g.setAttribute('aria-label', `Pack ${p.nombre}`);
  const cab = el('div', 'grupo-cab');
  const t = el('div', 'config-texto');
  t.append(el('h3', 'serif', p.nombre), el('span', 'tenue', p.descripcion));
  const estado = estadoPack(p);
  const sw = interruptor(`Activar pack ${p.nombre}`, estado === 'true', (v) => cambiarPack(p, v));
  sw.setAttribute('aria-checked', estado); // "mixed" si solo algunos están activos
  const ctl = el('div', 'fila');
  ctl.append(el('span', 'tenue contador-pack', `${p.activos}/${p.total}`), el('span', 'tenue', 'Activar pack'), sw);
  cab.append(t, ctl);
  const rejilla = el('div', 'rejilla-agentes');
  for (const a of p.agentes) rejilla.append(tarjetaAgente(a, 'catalogo'));
  g.append(cab, rejilla);
  return g;
}

function grupoSimple(titulo, ruta, tarjetas, vacio = null) {
  const g = el('section', 'grupo-agentes');
  g.setAttribute('aria-label', titulo);
  const cab = el('div', 'grupo-cab');
  const t = el('div', 'config-texto');
  t.append(el('h3', 'serif', titulo), el('span', 'tenue mono', ruta));
  cab.append(t);
  const rejilla = el('div', 'rejilla-agentes');
  rejilla.append(...tarjetas);
  g.append(cab, tarjetas.length || !vacio ? rejilla : el('p', 'tenue', vacio));
  return g;
}

// La tarjeta no anida botones: "abrir" es un botón y el interruptor es otro, hermanos dentro de un <article>.
function tarjetaAgente(a, origen) {
  const art = el('article', `tarjeta-catalogo${detalle?.id === a.id && detalle?.origen === origen ? ' seleccionada' : ''}`);
  // Un nombre de archivo fuera de formato (CodeReviewer.md, my_agent.md) no tiene detalle: la tarjeta no es un botón.
  const abrir = a.fueraDeFormato ? el('div', 'abrir-agente sin-detalle') : conFoco(boton(null, 'abrir-agente', () => verDetalle(origen, a.id)), `ver:${origen}:${a.id}`);
  const cab = el('span', 'fila');
  const nombres = el('span', 'nombres');
  nombres.append(el('strong', null, a.nombre ?? a.id), el('span', 'mono tenue', a.id));
  cab.append(el('span', 'inicial', (a.nombre ?? a.id).charAt(0).toUpperCase()), nombres, chipModelo(a.model, a.effort));
  const pie = el('span', 'fila tenue');
  pie.append(el('span', 'mono', a.tools ?? ''), el('span', null, a.fueraDeFormato ? '' : 'Ver prompt →'));
  abrir.append(cab, el('span', 'desc', a.description ?? ''), pie);
  art.append(abrir);
  if (origen === 'catalogo') {
    const fila = el('div', 'fila estado-agente');
    fila.append(el('span', `estado-${a.estado}`, TEXTO_ESTADO[a.estado] ?? a.estado));
    if (a.estado === 'actualizable') fila.append(boton('Actualizar', 'boton-texto', () => cambiarAgente(a, true)));
    fila.append(interruptor(`Activar ${a.nombre}`, a.estado === 'activo' || a.estado === 'actualizable', (v) => cambiarAgente(a, v), { deshabilitado: a.estado === 'conflicto' }));
    art.append(fila);
  } else if (a.alcance) {
    const notas = [a.alcance === 'proyecto' ? 'Solo este repo' : 'Todos mis proyectos'];
    if (a.fueraDeFormato) notas.push('Nombre fuera de formato: renombra el archivo (minúsculas y guiones) para ver su detalle');
    else if (a.escritoAMano) notas.push('Escrito a mano');
    art.append(el('span', 'tenue nota-tarjeta', notas.join(' · ')));
  }
  return art;
}

async function cambiarAgente(a, activo) {
  try {
    await ctx.api('POST', `/api/agentes/catalogo/${encodeURIComponent(a.id)}`, { activo });
    ctx.toast(activo ? `${a.nombre} activado. Disponible en sesiones nuevas.` : `${a.nombre} desactivado.`);
  } catch (e) { ctx.toast(e.message); }
  await abrirAgentes();
}

async function cambiarPack(p, activo) {
  try {
    const r = await ctx.api('POST', `/api/agentes/packs/${encodeURIComponent(p.id)}`, { activo });
    const fallidos = r.resultados.filter((x) => !x.ok);
    ctx.toast(fallidos.length ? `${p.nombre}: ${fallidos.map((x) => x.error).join(' · ')}` : `${p.nombre} ${activo ? 'activado' : 'desactivado'}. Disponible en sesiones nuevas.`);
  } catch (e) { ctx.toast(e.message); }
  await abrirAgentes();
}

async function verDetalle(origen, id) {
  try { detalle = await ctx.api('GET', `/api/agentes/${encodeURIComponent(origen)}/${encodeURIComponent(id)}${consulta()}`); } catch (e) { ctx.toast(e.message); return; }
  render();
  document.querySelector('.panel-agente')?.scrollIntoView({ block: 'nearest' });
}

// ---------- detalle ----------
function vistaDetalle() {
  const d = detalle;
  const c = el('div', 'detalle-catalogo');
  const nuevo = conFoco(boton('Nuevo Agente', 'boton-secundario', () => { detalle = null; form = formularioVacio(); errorForm = null; render(); }), 'nuevo');
  const cab = el('div', 'fila');
  const nombres = el('span', 'nombres');
  nombres.append(el('h2', 'serif', d.nombre ?? d.id), el('span', 'mono tenue ruta-archivo', d.archivo ?? ''));
  cab.append(el('span', 'inicial grande', (d.nombre ?? d.id).charAt(0).toUpperCase()), nombres);
  const datosG = el('div', 'datos');
  const dato = (k, v) => { const x = el('div', 'dato'); x.append(el('span', 'versalita tenue', k), v); return x; };
  datosG.append(dato('Modelo', chipModelo(d.model, d.effort)), dato('Herramientas', el('span', 'mono', d.tools ?? '—')));
  if (d.estado) datosG.append(dato('Estado', el('span', `estado-${d.estado}`, TEXTO_ESTADO[d.estado] ?? d.estado)));
  const cuando = el('div', 'bloque');
  cuando.append(el('span', 'versalita tenue', 'Cuándo lo usa el orquestador'), el('p', null, d.description ?? ''));
  const prompt = el('div', 'bloque');
  prompt.append(el('span', 'versalita tenue', 'Prompt del agente'), d.prompt ? el('pre', 'prompt', d.prompt) : el('p', 'tenue', d.aviso ?? 'Sin prompt visible.'));
  const acc = accionesDetalle(d);
  const acciones = el('div', 'acciones');
  acciones.append(boton(acc.duplicar, 'boton-secundario', () => { form = desdeDetalle(d, { duplicar: true }); detalle = null; errorForm = null; render(); }));
  if (acc.editar) acciones.append(boton('Editar', 'boton-secundario', () => { form = desdeDetalle(d); detalle = null; errorForm = null; render(); }));
  if (acc.eliminar) acciones.append(boton('Eliminar', 'boton-peligro', () => eliminar(d)));
  c.append(nuevo, cab, datosG, cuando, prompt, acciones);
  if (acc.nota) c.append(el('p', 'tenue', acc.nota));
  return c;
}

async function eliminar(d) {
  const ok = await confirmar({ titulo: `Eliminar ${d.nombre}`, texto: `Se borra ${d.archivo} (queda un respaldo .bak). Esta acción no se deshace desde el dashboard.`, aceptar: 'Eliminar', peligro: true });
  if (!ok) return;
  try {
    await ctx.api('POST', `/api/agentes/personalizados/${encodeURIComponent(d.id)}/eliminar`, { confirmar: true, alcance: d.alcance, conversacion: ctx.conversacionActual() });
    ctx.toast(`${d.nombre} eliminado.`);
    detalle = null;
    form = formularioVacio();
  } catch (e) { ctx.toast(e.message); }
  await abrirAgentes();
}

// ---------- formulario ----------
function campoForm(id, titulo, valor, ayuda, alEscribir, { multilinea = false, filas = 2, deshabilitado = false } = {}) {
  const w = el('div', 'campo');
  const l = el('label', 'versalita tenue', titulo);
  l.htmlFor = `agente-${id}`;
  const i = conFoco(el(multilinea ? 'textarea' : 'input'), `form:${id}`);
  i.id = `agente-${id}`;
  if (multilinea) i.rows = filas; else i.type = 'text';
  i.value = valor ?? '';
  i.placeholder = ayuda;
  i.disabled = deshabilitado;
  i.addEventListener('input', () => alEscribir(i.value)); // sin re-render: el foco y el cursor no se pierden
  w.append(l, i);
  if (form.errores?.[id]) w.append(el('p', 'error-campo', form.errores[id]));
  return w;
}

function grupoForm(titulo, control, clave) {
  const w = el('div', 'campo');
  w.append(el('span', 'versalita tenue', titulo), control);
  if (form.errores?.[clave]) w.append(el('p', 'error-campo', form.errores[clave]));
  return w;
}

function vistaFormulario() {
  const f = el('form', 'form-agente');
  f.noValidate = true;
  f.append(el('h2', 'serif', form.editando ? `Editar ${form.nombre}` : 'Nuevo Agente'));
  if (errorForm) f.append(el('p', 'aviso e-error', errorForm));
  const ruta = el('span', 'tenue mono ruta-archivo', `Archivo: ${rutaArchivo(form)}`);
  const nombre = campoForm('nombre', 'Nombre', form.nombre, 'Investigador RL', (v) => { form = { ...form, nombre: v }; ruta.textContent = `Archivo: ${rutaArchivo(form)}`; }, { deshabilitado: !!form.editando });
  nombre.append(ruta);
  const cuando = campoForm('descripcion', 'Cuándo Usarlo', form.descripcion, 'Diseña experimentos de RL y ablations. Úsalo para planificar, no para implementar.',
    (v) => { form = { ...form, descripcion: v }; }, { multilinea: true });
  cuando.append(el('span', 'tenue', 'El orquestador lee esta descripción para decidir cuándo delegarle.'));
  const modelo = grupoForm('Modelo', segmentado('Modelo', MODELOS_AGENTE.map(([m, t]) => [m, t, `m-${m === 'inherit' ? 'heredado' : m}`]), form.modelo, (m) => { form = { ...form, modelo: m }; render(); }), 'modelo');
  const esfuerzo = grupoForm('Esfuerzo', segmentado('Esfuerzo', ESFUERZOS_AGENTE.map((e) => [e, e]), form.esfuerzo, (e) => { form = { ...form, esfuerzo: e }; render(); }), 'esfuerzo');
  const marcadas = HERRAMIENTAS_FORM.filter(([e]) => herramientaMarcada(form, e)).map(([e]) => e);
  const herramientas = grupoForm('Herramientas', segmentado('Herramientas', HERRAMIENTAS_FORM.map(([e]) => [e, e]), marcadas, (e) => { form = alternarHerramienta(form, e); render(); }, { multiple: true }), 'herramientas');
  const hayConversacion = !!ctx.conversacionActual();
  const alcance = grupoForm('Disponible En', segmentado('Alcance', [['usuario', 'Todos mis proyectos'], ['proyecto', 'Solo este repo']], form.alcance,
    (a) => { form = { ...form, alcance: a }; render(); }, { deshabilitado: !!form.editando }), 'alcance');
  if (!hayConversacion) alcance.append(el('span', 'tenue', '"Solo este repo" usa la carpeta de la conversación abierta.'));

  const cabPrompt = el('div', 'fila cab-prompt');
  const tp = el('div', 'config-texto');
  tp.append(el('strong', null, 'Prompt del Agente'), el('span', 'tenue', 'Es lo que define cómo trabaja. Sigue la plantilla del protocolo de delegación.'));
  const red = conFoco(boton(redactando ? 'Redactando…' : 'Redactar con Claude', 'boton-secundario', redactar), 'redactar');
  red.disabled = redactando;
  const redCaja = el('div', 'redactar');
  redCaja.append(red, el('span', 'tenue', 'Gasta uso de tu plan (Sonnet, hasta 90 s).'));
  cabPrompt.append(tp, redCaja);
  const secciones = SECCIONES_FORM.map(([k, titulo, ayuda, filas]) => campoForm(k, titulo, form.secciones[k], ayuda,
    (v) => { form = { ...form, secciones: { ...form.secciones, [k]: v } }; }, { multilinea: true, filas }));

  const acciones = el('div', 'acciones');
  const cancelar = boton('Cancelar', 'boton-secundario', () => { form = formularioVacio(); errorForm = null; render(); });
  const crear = el('button', 'boton-primario', guardando ? 'Guardando…' : form.editando ? 'Guardar Cambios' : 'Crear Agente');
  crear.type = 'submit';
  crear.disabled = guardando || redactando;
  acciones.append(cancelar, crear);
  f.append(nombre, cuando, modelo, esfuerzo, herramientas, alcance, cabPrompt, ...secciones, acciones);
  f.addEventListener('submit', (ev) => { ev.preventDefault(); guardarAgente(); });
  return f;
}

async function redactar() {
  if (!form.nombre.trim() || !form.descripcion.trim()) { errorForm = 'Escribe el nombre y cuándo usarlo antes de redactar.'; render(); return; }
  redactando = true;
  errorForm = null;
  render();
  try {
    const s = await ctx.api('POST', '/api/agentes/redactar', { nombre: form.nombre, descripcion: form.descripcion, modelo: form.modelo, herramientas: form.herramientas });
    form = { ...form, secciones: { ...s } };
  } catch (e) {
    errorForm = `No se pudo redactar: ${e.message}. Los campos quedaron como estaban.`;
  } finally { redactando = false; render(); }
}

async function guardarAgente() {
  if (guardando) return;
  guardando = true;
  errorForm = null;
  form = { ...form, errores: {} };
  render();
  try {
    const cuerpo = cuerpoFormulario(form, ctx.conversacionActual());
    const d = form.editando
      ? await ctx.api('POST', `/api/agentes/personalizados/${encodeURIComponent(form.editando)}`, cuerpo)
      : await ctx.api('POST', '/api/agentes/personalizados', cuerpo);
    ctx.toast(`${d.nombre} guardado. Disponible en sesiones nuevas.`);
    detalle = d;
    form = formularioVacio();
  } catch (e) {
    errorForm = e.message;
    if (e.datos?.errores) form = { ...form, errores: e.datos.errores };
  } finally { guardando = false; }
  await abrirAgentes();
}
