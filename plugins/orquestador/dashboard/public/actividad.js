// Vista Actividad: el orquestador al centro con tarjetas que viajan. La conexión SSE la maneja app.js.
import { vistaVacia, reducir, posicionOrbital, disposicion, conciliarConServidor, familia, formatoCosto, formatoDuracion, formatoTokens } from './estado-vista.js';
import { preferencia as leerPreferencia } from './dom.js'; // el script ya tiene su propia const preferencia (animaciones)

const $ = (id) => document.getElementById(id);
const escenario = $('escenario');
const svg = $('lineas');
const NS = svg.namespaceURI;
// Animaciones: por defecto según prefers-reduced-motion; el usuario puede cambiarlo (se recuerda) o forzarlo con ?animar=1.
const preferencia = (() => { try { return localStorage.getItem('orq-animaciones'); } catch { return null; } })();
let animado = new URLSearchParams(location.search).has('animar') ? true
  : preferencia != null ? preferencia === '1' : !matchMedia('(prefers-reduced-motion: reduce)').matches;
const VIAJE_MS = 900, LECTURA_MS = 1400, SALIDA_MS = 400;

let vista = vistaVacia();
let actual = null;
let enReplay = true;
let servidor = null;            // { estado, config } de /estado
const ocultos = new Set();      // nodos cuya tarjeta todavía viaja

// ---------- utilidades de DOM (solo textContent / setAttribute) ----------
function el(tag, clase, texto) {
  const e = document.createElement(tag);
  if (clase) e.className = clase;
  if (texto != null) e.textContent = texto;
  return e;
}
const chip = (texto, color) => { const c = el('span', 'chip', texto); if (color) c.style.setProperty('--c', color); return c; };
const iniciales = (nombre) => nombre.split(/[-_\s]+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('') || '?';
const hora = (ts) => (ts ? new Date(ts).toLocaleTimeString('es-CL', { hour12: false }) : '');
const base = (ruta) => String(ruta ?? '').split(/[\\/]/).filter(Boolean).pop() ?? '';
const sesion = () => (actual ? vista.sesiones[actual] : null);

function toast(texto) {
  const t = $('toast');
  t.textContent = texto;
  t.classList.add('visible');
  clearTimeout(toast.temporizador);
  toast.temporizador = setTimeout(() => t.classList.remove('visible'), 4500);
}

// ---------- render ----------
function crearNodo(n) {
  const nodo = el('div', 'nodo');
  nodo.dataset.id = n.id;
  const cabeza = el('div', 'cabeza');
  cabeza.append(el('div', 'avatar', iniciales(n.agente)), el('div', 'nombre', n.agente));
  const pie = el('div', 'pie');
  nodo.append(cabeza, el('div', 'meta'), pie);
  return nodo;
}

function actualizarNodo(nodo, n, p) {
  nodo.style.left = `${p.x * 100}%`;
  nodo.style.top = `${p.y * 100}%`;
  nodo.style.setProperty('--c', n.color);
  nodo.classList.toggle('compacto', p.compacto);
  nodo.classList.toggle('activo', n.estado === 'activo');
  nodo.classList.toggle('terminado', n.estado === 'terminado' || n.estado === 'sin-cierre');
  nodo.classList.toggle('fallido', n.estado === 'fallido');
  let resumen = nodo.querySelector('.resumen');
  if (p.compacto) {
    if (!resumen) { resumen = el('span', 'resumen'); nodo.querySelector('.cabeza').append(resumen); }
    resumen.textContent = n.estado === 'sin-cierre' ? '?' : n.estado === 'fallido' ? '✕' : '✓';
  } else if (resumen) resumen.remove();
  nodo.classList.toggle('alerta', !!n.alerta);
  nodo.classList.toggle('oculto', ocultos.has(n.id));
  nodo.querySelector('.meta').textContent = n.meta || 'Sin meta';
  const pie = nodo.querySelector('.pie');
  pie.replaceChildren(chip(`${familia(n.modelo)}·${n.esfuerzo}`, n.color));
  if (n.resultado) pie.append(el('span', null, `${formatoCosto(n.resultado.costoUSD)} · ${formatoDuracion(n.resultado.duracionMs)}`));
  else if (n.estado === 'activo') pie.append(el('span', null, 'trabajando…'));
  else if (n.estado === 'sin-cierre') pie.append(el('span', null, 'sin cierre'));
  const tooltip = [
    n.meta, `${familia(n.modelo)}·${n.esfuerzo}${n.resultado?.modeloReal ? ` → ${n.resultado.modeloReal}` : ''}`,
    n.resultado && `${formatoCosto(n.resultado.costoUSD)} · ${formatoDuracion(n.resultado.duracionMs)}`,
    n.persona && `Persona: ${n.persona}`, n.origen && `Modelo: ${n.origen}`, n.alerta && `⚠ ${n.alerta}`,
  ].filter(Boolean).join('\n');
  if (tooltip) nodo.setAttribute('title', tooltip); else nodo.removeAttribute('title');
  let badge = nodo.querySelector('.badge');
  if (n.alerta && !badge) nodo.append(el('span', 'badge', '⚠'));
  if (!n.alerta && badge) badge.remove();
}

function renderNodos(s) {
  const posiciones = s ? disposicion(s) : [];
  const vivos = new Set(posiciones.map((p) => p.id));
  for (const nodo of [...$('nodos').children]) if (!vivos.has(nodo.dataset.id)) nodo.remove();
  for (const linea of [...svg.querySelectorAll('line')]) if (!vivos.has(linea.dataset.id)) linea.remove();
  for (const p of posiciones) {
    const id = p.id;
    const n = s.nodos[id];
    let nodo = $('nodos').querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!nodo) { nodo = crearNodo(n); $('nodos').append(nodo); }
    actualizarNodo(nodo, n, p);
    let linea = svg.querySelector(`line[data-id="${CSS.escape(id)}"]`);
    if (!linea) { linea = document.createElementNS(NS, 'line'); linea.dataset.id = id; svg.append(linea); }
    linea.setAttribute('x1', '50'); linea.setAttribute('y1', '50');
    linea.setAttribute('x2', String(p.x * 100)); linea.setAttribute('y2', String(p.y * 100));
    linea.setAttribute('stroke', n.alerta ? 'var(--error)' : n.color);
    linea.setAttribute('class', n.estado === 'activo' && !ocultos.has(id) ? 'activa' : 'quieta');
  }
  escenario.classList.toggle('trabajando', !!s && s.stats.activos > 0);
  $('vacio').hidden = !!(s && s.ordenNodos.length);
}

function renderStats(s) {
  const st = s?.stats ?? { activos: 0, completados: 0, costoUSD: 0, alertas: 0, bloqueos: 0, fable: 0 };
  const fableUsados = servidor?.estado?.fableUsados ?? st.fable;
  const fableTope = servidor?.config?.fableMaxPorSesion ?? '?';
  const tarjetas = [
    ['Activos', st.activos], ['Completados', st.completados], ['Fable', `${fableUsados}/${fableTope}`],
    // El estado del servidor suma toda la sesión; la vista local solo ve los últimos eventos del historial.
    ['Costo', leerPreferencia('orq-costo-oculto', '0') === '1' ? '••••' : formatoCosto(Math.max(st.costoUSD, servidor?.estado?.costoUSD ?? 0))], ['Alertas', st.alertas, st.alertas > 0], ['Bloqueos', st.bloqueos, st.bloqueos > 0],
  ];
  $('stats').replaceChildren(...tarjetas.map(([nombre, valor, mal]) => {
    const c = el('div', `stat${mal ? ' alerta' : ''}`);
    c.append(el('div', 'valor', String(valor)), el('div', 'nombre', nombre));
    return c;
  }));
  $('centro-modelo').textContent = servidor?.estado?.modeloPrincipal ?? '—';
}

const ICONOS = { delegacion: '→', fin: '✓', alerta: '⚠', bloqueo: '⛔' };
function renderTimeline(s) {
  const items = (s?.timeline ?? []).filter((t) => ICONOS[t.tipo]);
  $('timeline').replaceChildren(...items.map((t) => {
    const li = el('li', `t-${t.tipo}`);
    const icono = el('span', 'icono', t.tipo === 'fin' && t.ok === false ? '✕' : ICONOS[t.tipo]);
    const linea1 = el('div', 'linea1');
    linea1.append(el('span', 'hora', hora(t.ts)));
    if (t.agente) linea1.append(el('b', null, t.agente));
    if (t.modelo) linea1.append(chip(t.modelo));
    if (t.regla) linea1.append(chip(t.regla, 'var(--error)'));
    if (t.tipo === 'fin' && t.costoUSD) linea1.append(el('span', 'hora', formatoCosto(t.costoUSD)));
    li.append(icono, linea1, el('div', 'texto', t.texto || ''));
    return li;
  }));
}

function renderSelector() {
  const sel = $('sesion');
  const ids = [...vista.orden].sort((a, b) => String(vista.sesiones[b].ultimo ?? '').localeCompare(String(vista.sesiones[a].ultimo ?? '')));
  sel.replaceChildren(...ids.map((id) => {
    const s = vista.sesiones[id];
    const etiqueta = `${base(s.cwd) || id.slice(0, 8)} · ${hora(s.ultimo)} · ${s.ordenNodos.length} deleg.`;
    const o = el('option', null, etiqueta);
    o.value = id;
    o.selected = id === actual;
    return o;
  }));
}

function render() {
  const s = sesion();
  renderNodos(s);
  renderStats(s);
  renderTimeline(s);
  renderSelector();
}

// ---------- animaciones ----------
function px(punto) {
  const r = escenario.getBoundingClientRect();
  return { x: punto.x * r.width, y: punto.y * r.height };
}

function viajar(tarjeta, desde, hasta, alLlegar) {
  tarjeta.style.left = `${desde.x}px`;
  tarjeta.style.top = `${desde.y}px`;
  $('tarjetas').append(tarjeta);
  tarjeta.getBoundingClientRect(); // fuerza el estado inicial antes de la transición
  tarjeta.classList.add('en-viaje');
  tarjeta.style.left = `${hasta.x}px`;
  tarjeta.style.top = `${hasta.y}px`;
  setTimeout(alLlegar, VIAJE_MS);
  setTimeout(() => { tarjeta.classList.add('se-va'); setTimeout(() => tarjeta.remove(), SALIDA_MS); }, VIAJE_MS + LECTURA_MS);
}

function tarjetaEnvio(n) {
  const t = el('div', 'tarjeta');
  t.style.setProperty('--c', n.color);
  t.append(el('div', 'rotulo', `Encargo → ${n.agente}`), el('div', 'titulo', n.meta || 'Sin meta'));
  if (n.persona) t.append(el('div', 'persona', n.persona));
  const fila = el('div', 'fila');
  fila.append(chip(`${familia(n.modelo)}·${n.esfuerzo}`, n.color));
  if (n.origen) fila.append(chip(n.origen));
  t.append(fila);
  return t;
}

function tarjetaRecibo(n) {
  const r = n.resultado ?? {};
  const t = el('div', `tarjeta recibo${n.alerta ? ' con-alerta' : ''}`);
  t.append(el('div', 'rotulo', `${n.estado === 'fallido' ? '✕ Falló' : '✓ Listo'} ← ${n.agente}`));
  t.append(el('div', 'titulo', r.modeloReal ?? 'modelo no informado'));
  const fila = el('div', 'fila');
  fila.append(chip(`${formatoTokens(r.tokensIn)} / ${formatoTokens(r.tokensOut)} tok`), chip(formatoCosto(r.costoUSD)), chip(formatoDuracion(r.duracionMs)));
  t.append(fila);
  return t;
}

function animar(efecto) {
  const s = sesion();
  if (!efecto || !s || efecto.sesion !== actual || !animado) { render(); return; }
  const centro = { x: 0.5, y: 0.5 };
  if (efecto.tipo === 'enviar') {
    const n = s.nodos[efecto.id];
    ocultos.add(n.id);
    render();
    viajar(tarjetaEnvio(n), px(centro), px(posicionOrbital(n.slot)), () => {
      ocultos.delete(n.id);
      render();
      const nodo = $('nodos').querySelector(`[data-id="${CSS.escape(n.id)}"]`);
      nodo?.classList.add('nuevo');
      setTimeout(() => nodo?.classList.remove('nuevo'), 400);
    });
  } else if (efecto.tipo === 'volver') {
    const n = s.nodos[efecto.id];
    render();
    viajar(tarjetaRecibo(n), px(posicionOrbital(n.slot)), px(centro), () => {});
  } else if (efecto.tipo === 'bloqueo') {
    render();
    const c = $('centro');
    c.classList.remove('bloqueo');
    void c.offsetWidth;
    c.classList.add('bloqueo');
    toast(`⛔ ${efecto.motivo}`);
  } else {
    render();
  }
}

// ---------- datos ----------
function elegirMasReciente() {
  let mejor = null;
  for (const id of vista.orden) if (!mejor || String(vista.sesiones[id].ultimo ?? '') > String(vista.sesiones[mejor].ultimo ?? '')) mejor = id;
  actual = mejor;
}

function procesar(e) {
  const nueva = !!e?.session && !vista.sesiones[e.session];
  const { efecto } = reducir(vista, e);
  if (enReplay) return;
  if (nueva && ($('seguir').checked || !actual)) { actual = e.session; servidor = null; pedirEstado(); render(); }
  if (e?.session === actual) animar(efecto); else renderSelector();
}

async function pedirEstado() {
  const id = actual;
  if (!id || id.startsWith('demo-')) return;
  try {
    const r = await fetch(`/estado?session=${encodeURIComponent(id)}`);
    if (!r.ok) return;
    const datos = await r.json();
    if (id !== actual) return; // el usuario cambió de sesión mientras se esperaba la respuesta
    servidor = datos;
    const s = sesion();
    // Activos que el servidor ya no tiene (sesión que murió sin cerrar sus delegaciones) dejan de latir.
    if (!enReplay && s && servidor.estado && conciliarConServidor(s, servidor.estado.activas ?? {}).length) render();
    else renderStats(s);
  } catch { /* sin servidor: se usan los datos locales */ }
}

// ---------- demo ----------
function demo() {
  enReplay = false;
  const id = `demo-${Date.now()}`;
  const ahora = () => new Date().toISOString();
  const pasos = [
    [0, { tipo: 'sesion', cwd: 'demo/paper-rl' }],
    [400, { tipo: 'delegacion', id: 'd1', agente: 'orquestador:investigador-rl', meta: 'Diseñar ablation de reward shaping con 3 seeds', modelo: 'opus', esfuerzo: 'high', origenModelo: 'explicito', persona: 'Escéptico, obsesionado con seeds y baselines', color: 'purple' }],
    [1300, { tipo: 'delegacion', id: 'd2', agente: 'orquestador:auditor-datos', meta: 'Perfilar resultados.csv y detectar outliers', modelo: 'haiku', esfuerzo: 'low', origenModelo: 'explicito', persona: 'Contador meticuloso de CSV y tablas', color: 'green' }],
    [2200, { tipo: 'delegacion', id: 'd3', agente: 'orquestador:bibliografo', meta: 'Verificar las 14 citas BibTeX del related work', modelo: 'haiku', esfuerzo: 'low', origenModelo: 'frontmatter', persona: 'Ordenado; BibTeX correcto y verificado', color: 'cyan' }],
    [4200, { tipo: 'fin', id: 'd2', modeloReal: 'claude-haiku-5-5', tokensIn: 18400, tokensOut: 920, costoUSD: 0.0023, duracionMs: 3800, ok: true }],
    [5200, { tipo: 'bloqueo', agente: 'orquestador:revisor-par', regla: 'tope-fable', motivo: 'Tope de Fable alcanzado (2/2 en esta sesión). Usa opus con effort xhigh.' }],
    [6400, { tipo: 'delegacion', id: 'd4', agente: 'orquestador:revisor-par', meta: 'Revisión crítica del método como Reviewer 2', modelo: 'opus', esfuerzo: 'xhigh', origenModelo: 'explicito', persona: '"Reviewer 2" exigente pero justo', color: 'orange' }],
    [7600, { tipo: 'fin', id: 'd3', modeloReal: 'claude-haiku-5-5', tokensIn: 9100, tokensOut: 400, costoUSD: 0.0011, duracionMs: 5100, ok: true }],
    [9000, { tipo: 'fin', id: 'd1', modeloReal: 'claude-sonnet-5-5', tokensIn: 41200, tokensOut: 2600, costoUSD: 0.108, duracionMs: 8400, ok: true }],
    [9050, { tipo: 'alerta', id: 'd1', agente: 'orquestador:investigador-rl', mensaje: 'se pidió opus pero corrió claude-sonnet-5-5' }],
    [11500, { tipo: 'fin', id: 'd4', modeloReal: 'claude-opus-5-5', tokensIn: 52300, tokensOut: 3100, costoUSD: 0.271, duracionMs: 5000, ok: true }],
  ];
  actual = id;
  $('seguir').checked = false;
  servidor = { estado: { fableUsados: 2, modeloPrincipal: 'opus' }, config: { fableMaxPorSesion: 2 } };
  for (const [ms, e] of pasos) setTimeout(() => { procesar({ ...e, session: id, ts: ahora() }); if (e.tipo === 'sesion') render(); }, ms);
}

// ---------- integración con app.js ----------
const oyentes = new Set();
const notificar = () => { for (const f of oyentes) f(vista); };
export const alCambiar = (f) => { oyentes.add(f); };
export const vistaActual = () => vista;

// Cada conexión (también las reconexiones) reenvía el historial completo: se parte de cero.
export function inicioConexion() { vista = vistaVacia(); enReplay = true; }

export function procesarEvento(e) {
  procesar(e);
  if (!enReplay) notificar();
}

export function finReplay() {
  enReplay = false;
  if (!actual || !vista.sesiones[actual]) elegirMasReciente();
  pedirEstado();
  render();
  notificar();
}

// La conversación abierta en el chat fija la sesión que muestra la actividad.
export function mostrarSesion(id) {
  if (!id || id === actual) return;
  actual = id;
  servidor = null;
  ocultos.clear();
  $('tarjetas').replaceChildren();
  $('seguir').checked = false;
  pedirEstado();
  render();
}

function aplicarAnimacion() { document.body.classList.toggle('sin-animacion', !animado); $('animaciones').checked = animado; }

export function iniciarActividad() {
  $('sesion').addEventListener('change', (ev) => { actual = ev.target.value; servidor = null; ocultos.clear(); $('tarjetas').replaceChildren(); pedirEstado(); render(); });
  $('demo').addEventListener('click', demo);
  $('animaciones').addEventListener('change', (ev) => {
    animado = ev.target.checked;
    try { localStorage.setItem('orq-animaciones', animado ? '1' : '0'); } catch { /* sin almacenamiento */ }
    aplicarAnimacion();
  });
  aplicarAnimacion();
  setInterval(pedirEstado, 3000);
  addEventListener('resize', () => render());
  render();
  if (new URLSearchParams(location.search).has('demo')) demo();
}
