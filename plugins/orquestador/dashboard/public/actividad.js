// Vista Actividad: el orquestador al centro con una tarjeta por agente, la lista de eventos y el resumen. La conexión SSE la maneja app.js.
// La lógica (posiciones, reductor y animación) vive en estado-vista.js y no cambia: este archivo solo dibuja.
import {
  vistaVacia, reducir, posicionOrbital, disposicion, conciliarConServidor, formatoCosto, formatoDuracion, formatoTokens,
  claseNodo, TEXTO_NODO, etiquetaEvento, numeracion, pedidoVsReal, orquestadorDeSesion,
} from './estado-vista.js';
import { el, boton, chipModelo, nombreAgente, capitalizar, familiaModelo } from './dom.js';

const $ = (id) => document.getElementById(id);
const escenario = $('escenario');
const svg = $('lineas');
const NS = svg.namespaceURI;
// Animaciones: por defecto según prefers-reduced-motion; el usuario puede cambiarlo (se recuerda) o forzarlo con ?animar=1.
const preferencia = (() => { try { return localStorage.getItem('orq-animaciones'); } catch { return null; } })();
let animado = new URLSearchParams(location.search).has('animar') ? true
  : preferencia != null ? preferencia === '1' : !matchMedia('(prefers-reduced-motion: reduce)').matches;
const VIAJE_MS = 900, LECTURA_MS = 1400, SALIDA_MS = 400;
const VAR_ESTADO = { trabajando: '--activo', listo: '--listo', error: '--error', cola: '--cola' };
const FAMILIAS = ['haiku', 'sonnet', 'opus', 'fable'];
const TIPOS_EVENTO = new Set(['delegacion', 'fin', 'alerta', 'bloqueo']);
const LEYENDA_ESTADOS = [
  ['e-trabajando', 'Trabajando', 'Está ejecutando'], ['e-accion', 'Requiere permiso', 'Espera tu decisión'], ['e-listo', 'Listo', 'Terminó bien'],
  ['e-cola', 'En cola', 'Aún no empieza'], ['e-error', 'Error o alerta', 'Falló o no coincide'],
];
const LEYENDA_MODELOS = [['m-haiku', 'Haiku', 'Tareas mecánicas'], ['m-sonnet', 'Sonnet', 'Producción y análisis'], ['m-opus', 'Opus', 'Juicio experto'], ['m-fable', 'Fable', 'Máxima consecuencia']];

let vista = vistaVacia();
let actual = null;
let enReplay = true;
let servidor = null;            // { estado, config } de /estado
const ocultos = new Set();      // nodos cuya tarjeta todavía viaja
let costoVisible = true;        // lo fija app.js (config.mostrarCosto + atajo de sesión)
// Conversación abierta en el chat ({ sessionId, modelo, costoUSD }, la fija app.js). Su modelo y su costo solo se usan si
// Actividad muestra esa misma sesión: otra sesión elegida en el selector no hereda los datos del chat.
let convOrquestador = null;
let alternarCosto = null;       // callback de app.js para el botón Mostrar/Ocultar
let firmaResumen = null;

const hora = (ts) => (ts ? new Date(ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }) : '');
const base = (ruta) => String(ruta ?? '').split(/[\\/]/).filter(Boolean).pop() ?? '';
const sesion = () => (actual ? vista.sesiones[actual] : null);
const etiquetaModelo = (modelo, esfuerzo) => {
  const f = familiaModelo(modelo);
  const nombre = f === 'desconocido' ? '—' : f === 'heredado' ? 'Hereda' : capitalizar(f);
  return esfuerzo && !['—', 'desconocido', 'heredado'].includes(esfuerzo) ? `${nombre} · ${esfuerzo}` : nombre;
};
const textoResultado = (r) => (costoVisible ? `${formatoCosto(r.costoUSD)} · ${formatoDuracion(r.duracionMs)}` : formatoDuracion(r.duracionMs));

function toast(texto) {
  const t = $('toast');
  t.textContent = texto;
  t.classList.add('visible');
  clearTimeout(toast.temporizador);
  toast.temporizador = setTimeout(() => t.classList.remove('visible'), 4500);
}

// ---------- mapa de agentes ----------
function crearNodo(n) {
  const nodo = el('div', 'nodo');
  nodo.dataset.id = n.id;
  const cabeza = el('div', 'cabeza');
  cabeza.append(el('span', 'punto'), el('span', 'nombre'), el('span', 'num'), el('span', 'estado-nodo'));
  nodo.append(cabeza, el('div', 'meta'), el('div', 'pie'));
  return nodo;
}

function actualizarNodo(nodo, n, p, num) {
  const clase = claseNodo(n);
  for (const c of Object.keys(VAR_ESTADO)) nodo.classList.toggle(`e-${c}`, c === clase);
  nodo.classList.toggle('activo', n.estado === 'activo');
  nodo.classList.toggle('compacto', p.compacto);
  nodo.classList.toggle('alerta', !!n.alerta);
  nodo.classList.toggle('oculto', ocultos.has(n.id));
  nodo.querySelector('.nombre').textContent = nombreAgente(n.agente);
  nodo.querySelector('.num').textContent = num;
  nodo.querySelector('.estado-nodo').textContent = p.compacto ? ({ error: '✕', cola: '?' }[clase] ?? '✓') : '';
  nodo.querySelector('.meta').textContent = n.meta || 'Sin meta';
  const pie = nodo.querySelector('.pie');
  pie.replaceChildren(chipModelo(n.modelo, n.esfuerzo));
  if (n.resultado) pie.append(el('span', 'tenue', textoResultado(n.resultado)));
  pie.append(el('span', 'estado-texto', TEXTO_NODO[clase]));
  nodo.setAttribute('aria-label', `${nombreAgente(n.agente)} ${num}: ${TEXTO_NODO[clase]}`);
  const tooltip = [
    `Estado: ${TEXTO_NODO[clase]}`,
    n.meta, `Pedido: ${etiquetaModelo(n.modelo, n.esfuerzo)}${n.resultado?.modeloReal ? ` · real: ${n.resultado.modeloReal}` : ''}`,
    n.resultado && textoResultado(n.resultado), n.persona && `Persona: ${n.persona}`, n.origen && `Modelo: ${n.origen}`, n.alerta && `⚠ ${n.alerta}`,
  ].filter(Boolean).join('\n');
  if (tooltip) nodo.setAttribute('title', tooltip); else nodo.removeAttribute('title');
  const badge = nodo.querySelector('.badge');
  if (n.alerta && !badge) nodo.append(el('span', 'badge', '⚠'));
  if (!n.alerta && badge) badge.remove();
}

const posPx = {}; // id -> { x, y } en px dentro del escenario (la animación viaja hasta ahí)
const acotar = (v, min, max) => Math.max(min, Math.min(max, v));

// Coloca cada tarjeta con su tamaño real: completa dentro del escenario, sin tapar al orquestador ni a las demás.
// Devuelve null si el escenario no se ve (pestaña oculta).
function colocar(posiciones) {
  const r = escenario.getBoundingClientRect();
  const W = r.width, H = r.height;
  if (!W || !H) return null;
  escenario.style.setProperty('--nodo-w', `${Math.round(acotar(W * 0.38, 112, 188))}px`);
  const caja = $('centro').querySelector('.centro-caja');
  const centro = { x: W / 2, y: H / 2, w: caja.offsetWidth + 28, h: caja.offsetHeight + 28 };
  const items = posiciones.map((p) => {
    const nodo = $('nodos').querySelector(`[data-id="${CSS.escape(p.id)}"]`);
    return { id: p.id, x: p.x * W, y: p.y * H, w: nodo.offsetWidth, h: nodo.offsetHeight };
  });
  const dentro = (it) => { it.x = acotar(it.x, it.w / 2 + 10, W - it.w / 2 - 10); it.y = acotar(it.y, it.h / 2 + 10, H - it.h / 2 - 10); };
  // Hay solape si las cajas, con 8 px de margen, se pisan en los dos ejes.
  const solape = (a, b) => {
    const dx = Math.abs(a.x - b.x) - (a.w + b.w) / 2 - 8, dy = Math.abs(a.y - b.y) - (a.h + b.h) / 2 - 8;
    return dx < 0 && dy < 0 ? { dx, dy } : null;
  };
  // Colocación voraz: los activos primero (vienen antes en posiciones). Cada tarjeta parte de su sitio ideal y, si choca con el
  // orquestador o con una ya colocada, se busca el hueco libre más cercano en círculos crecientes (siempre dentro del escenario).
  const puestas = [];
  const libre = (it) => !solape(it, centro) && !puestas.some((o) => solape(it, o));
  for (const it of items) {
    const ideal = { x: it.x, y: it.y };
    dentro(it);
    if (!libre(it)) {
      let hallado = null;
      for (let radio = 8; radio <= Math.max(W, H) && !hallado; radio += 8) {
        const pasos = Math.max(12, Math.round(radio / 6));
        for (let k = 0; k < pasos && !hallado; k += 1) {
          const ang = (2 * Math.PI * k) / pasos;
          const c = { ...it, x: ideal.x + radio * Math.cos(ang), y: ideal.y + radio * Math.sin(ang) };
          dentro(c);
          if (libre(c)) hallado = c;
        }
      }
      if (hallado) { it.x = hallado.x; it.y = hallado.y; }
    }
    puestas.push(it);
  }
  return Object.fromEntries(items.map((it) => [it.id, { x: it.x, y: it.y, W, H }]));
}

function renderNodos(s) {
  const posiciones = s ? disposicion(s) : [];
  const nums = s ? numeracion(s) : {};
  const vivos = new Set(posiciones.map((p) => p.id));
  for (const nodo of [...$('nodos').children]) if (!vivos.has(nodo.dataset.id)) nodo.remove();
  for (const linea of [...svg.querySelectorAll('line')]) if (!vivos.has(linea.dataset.id)) linea.remove();
  for (const p of posiciones) {
    const n = s.nodos[p.id];
    let nodo = $('nodos').querySelector(`[data-id="${CSS.escape(p.id)}"]`);
    if (!nodo) { nodo = crearNodo(n); $('nodos').append(nodo); }
    actualizarNodo(nodo, n, p, nums[p.id] ?? '');
  }
  const colocadas = colocar(posiciones);
  for (const id of Object.keys(posPx)) if (!vivos.has(id)) delete posPx[id];
  for (const p of posiciones) {
    const n = s.nodos[p.id];
    const clase = claseNodo(n);
    const nodo = $('nodos').querySelector(`[data-id="${CSS.escape(p.id)}"]`);
    const c = colocadas?.[p.id];
    const fx = c ? c.x / c.W : p.x, fy = c ? c.y / c.H : p.y;
    if (c) posPx[p.id] = { x: c.x, y: c.y };
    nodo.style.left = `${fx * 100}%`;
    nodo.style.top = `${fy * 100}%`;
    let linea = svg.querySelector(`line[data-id="${CSS.escape(p.id)}"]`);
    if (!linea) { linea = document.createElementNS(NS, 'line'); linea.dataset.id = p.id; svg.append(linea); }
    linea.setAttribute('x1', '50'); linea.setAttribute('y1', '50');
    linea.setAttribute('x2', String(fx * 100)); linea.setAttribute('y2', String(fy * 100));
    // Las variables CSS no valen en los atributos de presentación del SVG: el color va por style.
    linea.style.stroke = `var(${n.alerta ? '--error' : VAR_ESTADO[clase]})`;
    linea.setAttribute('class', `${n.estado === 'activo' && !ocultos.has(p.id) ? 'activa' : 'quieta'}${clase === 'cola' ? ' discontinua' : ''}`);
  }
  escenario.classList.toggle('trabajando', !!s && s.stats.activos > 0);
  $('vacio').hidden = !!(s && s.ordenNodos.length);
}

// ---------- resumen ----------
function barraLimite(nombre, usados, tope, clase) {
  const f = el('div', `limite ${clase}`);
  const fila = el('div', 'fila');
  fila.append(el('span', 'tenue', nombre), el('strong', null, `${usados} de ${tope}`));
  const pista = el('div', 'pista');
  const barra = el('div', 'barra-limite');
  barra.style.width = `${Math.min(100, Math.round((usados / Math.max(1, tope)) * 100))}%`;
  pista.append(barra);
  f.append(fila, pista);
  return f;
}

function itemLeyenda([clase, nombre, desc]) {
  const i = el('span', `item-leyenda ${clase}`);
  i.append(el('span', 'punto'), el('strong', null, nombre), el('span', 'tenue', desc));
  return i;
}

function bloque(titulo, ...hijos) {
  const b = el('section', 'bloque-resumen');
  b.append(el('h3', 'versalita tenue', titulo), ...hijos);
  return b;
}

function renderResumen(s) {
  const st = s?.stats ?? { activos: 0, completados: 0, costoUSD: 0, alertas: 0, bloqueos: 0, fable: 0 };
  // El estado del servidor suma toda la sesión; la vista local solo ve los últimos eventos del historial.
  const costoAgentes = Math.max(st.costoUSD, servidor?.estado?.costoUSD ?? 0);
  const orq = orquestadorDeSesion(convOrquestador, actual, servidor?.estado?.modeloPrincipal);
  const costo = costoAgentes + (orq.costoUSD ?? 0); // sin costo del orquestador disponible, el total es solo el de los agentes
  const fableUsados = servidor?.estado?.fableUsados ?? st.fable;
  const grupos = pedidoVsReal(s);
  const familiaOrq = familiaModelo(orq.modelo);
  // Solo se reconstruye si cambió algo: así el botón Mostrar/Ocultar no pierde el foco con cada consulta.
  const firma = JSON.stringify([actual, costoAgentes, orq.costoUSD, costoVisible, st.activos, st.alertas, fableUsados, servidor?.config, grupos, familiaOrq]);
  if (firma === firmaResumen) return;
  firmaResumen = firma;
  const teniaFoco = $('stats').contains(document.activeElement);

  const cab = el('div', 'fila');
  cab.append(el('h3', 'versalita tenue', 'Costo Estimado'));
  if (alternarCosto) cab.append(boton(costoVisible ? 'Ocultar' : 'Mostrar', 'boton-texto', alternarCosto, costoVisible ? 'Ocultar costo' : 'Mostrar costo'));
  const bloqueCosto = el('section', 'bloque-resumen');
  bloqueCosto.append(cab, el('strong', 'costo-grande', costoVisible ? formatoCosto(costo) : '••••'),
    el('span', 'tenue nota', costoVisible ? `Orquestador ${orq.costoUSD == null ? '—' : formatoCosto(orq.costoUSD)} · Agentes ${formatoCosto(costoAgentes)}` : 'Orquestador + agentes'),
    el('span', 'tenue nota', 'Referencial: se calcula con la tabla de precios. Lo cubre tu plan.'));

  const limites = bloque('Límites',
    barraLimite('Agentes en paralelo', st.activos, servidor?.config?.paraleloMax ?? 4, 'e-trabajando'),
    barraLimite('Fable usados', fableUsados, servidor?.config?.fableMaxPorSesion ?? 2, 'm-fable'));

  const filas = grupos.map((g) => {
    const f = el('div', 'fila fila-modelo');
    const real = FAMILIAS.includes(g.real) ? capitalizar(g.real) : g.real;
    f.append(el('span', null, g.cantidad > 1 ? `${nombreAgente(g.agente)} ×${g.cantidad}` : nombreAgente(g.agente)), el('span', g.ok ? 'e-listo' : 'e-error', `${g.ok ? '✓' : '⚠'} ${real}`));
    return f;
  });
  const alertas = el('div', `fila ${st.alertas ? 'e-error' : 'e-listo'}`);
  alertas.append(el('span', 'punto'), el('span', null, st.alertas ? `${st.alertas} ${st.alertas === 1 ? 'alerta' : 'alertas'} de modelo en esta sesión` : 'Sin alertas en esta sesión'));
  const modelos = bloque('Modelo Pedido vs. Real', ...(filas.length ? filas : [el('span', 'tenue', 'Aún no termina ningún agente.')]), alertas);

  const leyenda = bloque('Qué Significa Cada Color', ...LEYENDA_ESTADOS.map(itemLeyenda), el('hr'), ...LEYENDA_MODELOS.map(itemLeyenda));
  $('stats').replaceChildren(bloqueCosto, limites, modelos, leyenda);
  if (teniaFoco) $('stats').querySelector('button')?.focus();

  const cm = $('centro-modelo');
  cm.className = `chip-modelo m-${familiaOrq}`;
  cm.replaceChildren(el('span', 'punto'), document.createTextNode(familiaOrq === 'desconocido' ? '—' : capitalizar(familiaOrq)));
}

// ---------- eventos ----------
function renderTimeline(s) {
  const items = (s?.timeline ?? []).filter((t) => TIPOS_EVENTO.has(t.tipo));
  if (!items.length) { $('timeline').replaceChildren(el('li', 'tenue', 'Sin eventos todavía.')); return; }
  $('timeline').replaceChildren(...items.map((t) => {
    const et = etiquetaEvento(t);
    const modelo = String(t.modelo ?? '').split('·').map((x) => x.trim()).filter((x) => x && x !== '—').map((x, i) => (i === 0 ? capitalizar(x) : x)).join(' · ');
    const partes = [t.agente && nombreAgente(t.agente), modelo, t.texto].filter(Boolean);
    if (t.tipo === 'fin' && t.costoUSD && costoVisible) partes.push(formatoCosto(t.costoUSD));
    if (t.regla) partes.push(`[${t.regla}]`);
    const li = el('li', 'evento');
    li.append(el('span', 'hora', hora(t.ts)), el('span', `etiqueta-evento ${et.clase}`, et.texto), el('span', 'texto', partes.join(' · ')));
    return li;
  }));
}

function renderSelector() {
  const sel = $('sesion');
  const ids = [...vista.orden].sort((a, b) => String(vista.sesiones[b].ultimo ?? '').localeCompare(String(vista.sesiones[a].ultimo ?? '')));
  sel.replaceChildren(...ids.map((id) => {
    const s = vista.sesiones[id];
    const o = el('option', null, `${base(s.cwd) || id.slice(0, 8)} · ${hora(s.ultimo)} · ${s.ordenNodos.length} deleg.`);
    o.value = id;
    o.selected = id === actual;
    return o;
  }));
}

function render() {
  const s = sesion();
  renderNodos(s);
  renderResumen(s);
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
  // La tarjeta que viaja también debe caber completa en el escenario.
  const r = escenario.getBoundingClientRect();
  hasta = { x: acotar(hasta.x, tarjeta.offsetWidth / 2 + 4, r.width - tarjeta.offsetWidth / 2 - 4), y: acotar(hasta.y, tarjeta.offsetHeight / 2 + 4, r.height - tarjeta.offsetHeight / 2 - 4) };
  tarjeta.getBoundingClientRect(); // fuerza el estado inicial antes de la transición
  tarjeta.classList.add('en-viaje');
  tarjeta.style.left = `${hasta.x}px`;
  tarjeta.style.top = `${hasta.y}px`;
  setTimeout(alLlegar, VIAJE_MS);
  setTimeout(() => { tarjeta.classList.add('se-va'); setTimeout(() => tarjeta.remove(), SALIDA_MS); }, VIAJE_MS + LECTURA_MS);
}

// Tarjeta viajera: "Modelo · esfuerzo → Agente #n".
function tarjetaEnvio(n, num) {
  const t = el('div', `tarjeta envio m-${familiaModelo(n.modelo)}`);
  t.append(el('div', 'rotulo', `${etiquetaModelo(n.modelo, n.esfuerzo)} → ${nombreAgente(n.agente)}${num ? ` ${num}` : ''}`));
  return t;
}

function tarjetaRecibo(n, num) {
  const r = n.resultado ?? {};
  const t = el('div', `tarjeta recibo ${n.estado === 'fallido' || n.alerta ? 'e-error' : 'e-listo'}`);
  t.append(el('div', 'rotulo', `${n.estado === 'fallido' ? '✕ Falló' : '✓ Listo'} ← ${nombreAgente(n.agente)}${num ? ` ${num}` : ''}`));
  t.append(el('div', 'titulo', r.modeloReal ?? 'modelo no informado'));
  const fila = el('div', 'fila');
  fila.append(el('span', 'chip', `${formatoTokens(r.tokensIn)} / ${formatoTokens(r.tokensOut)} tok`));
  if (costoVisible) fila.append(el('span', 'chip', formatoCosto(r.costoUSD)));
  fila.append(el('span', 'chip', formatoDuracion(r.duracionMs)));
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
    viajar(tarjetaEnvio(n, numeracion(s)[n.id]), px(centro), posPx[n.id] ?? px(posicionOrbital(n.slot)), () => {
      ocultos.delete(n.id);
      render();
      const nodo = $('nodos').querySelector(`[data-id="${CSS.escape(n.id)}"]`);
      nodo?.classList.add('nuevo');
      setTimeout(() => nodo?.classList.remove('nuevo'), 400);
    });
  } else if (efecto.tipo === 'volver') {
    const n = s.nodos[efecto.id];
    render();
    viajar(tarjetaRecibo(n, numeracion(s)[n.id]), posPx[n.id] ?? px(posicionOrbital(n.slot)), px(centro), () => {});
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
    else renderResumen(s);
  } catch { /* sin servidor: se usan los datos locales */ }
}

// ---------- demo ----------
function demo() {
  enReplay = false;
  const id = `demo-${Date.now()}`;
  const ahora = () => new Date().toISOString();
  const pasos = [
    [0, { tipo: 'sesion', cwd: 'demo/paper-rl' }],
    [400, { tipo: 'delegacion', id: 'd1', agente: 'orquestador:investigador-rl', meta: 'Diseñar ablation de reward shaping con 3 seeds', modelo: 'opus', esfuerzo: 'high', origenModelo: 'explicito', persona: 'Escéptico, obsesionado con seeds y baselines' }],
    [1300, { tipo: 'delegacion', id: 'd2', agente: 'orquestador:implementador', meta: 'Verificadores de CSV y paper', modelo: 'sonnet', esfuerzo: 'medium', origenModelo: 'explicito' }],
    [2200, { tipo: 'delegacion', id: 'd3', agente: 'orquestador:implementador', meta: 'Contactos, slides y git', modelo: 'sonnet', esfuerzo: 'medium', origenModelo: 'explicito' }],
    [4200, { tipo: 'fin', id: 'd2', modeloReal: 'claude-sonnet-5-5', tokensIn: 18400, tokensOut: 920, costoUSD: 0.0023, duracionMs: 3800, ok: true }],
    [5200, { tipo: 'bloqueo', agente: 'orquestador:revisor-codigo', regla: 'tope-fable', motivo: 'Tope de Fable alcanzado (2/2 en esta sesión). Usa opus con effort xhigh.' }],
    [6400, { tipo: 'delegacion', id: 'd4', agente: 'orquestador:revisor-codigo', meta: 'Revisar los verificadores', modelo: 'haiku', esfuerzo: 'low', origenModelo: 'explicito' }],
    [7600, { tipo: 'fin', id: 'd3', modeloReal: 'claude-sonnet-5-5', tokensIn: 9100, tokensOut: 400, costoUSD: 0.0011, duracionMs: 5100, ok: true }],
    [9000, { tipo: 'fin', id: 'd1', modeloReal: 'claude-sonnet-5-5', tokensIn: 41200, tokensOut: 2600, costoUSD: 0.108, duracionMs: 8400, ok: true }],
    [9050, { tipo: 'alerta', id: 'd1', agente: 'orquestador:investigador-rl', mensaje: 'se pidió opus pero corrió claude-sonnet-5-5' }],
    [11500, { tipo: 'fin', id: 'd4', modeloReal: 'claude-haiku-5-5', tokensIn: 52300, tokensOut: 3100, costoUSD: 0.021, duracionMs: 5000, ok: true }],
  ];
  actual = id;
  $('seguir').checked = false;
  servidor = { estado: { fableUsados: 2, modeloPrincipal: 'opus' }, config: { fableMaxPorSesion: 2, paraleloMax: 4 } };
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

export function fijarCostoVisible(visible) {
  costoVisible = !!visible;
  firmaResumen = null;
  render();
}

export function fijarOrquestador(conv) {
  const nuevo = conv ? { sessionId: conv.sessionId ?? null, modelo: conv.modelo ?? null, costoUSD: Number(conv.costoUSD) || 0 } : null;
  if (JSON.stringify(nuevo) === JSON.stringify(convOrquestador)) return;
  convOrquestador = nuevo;
  renderResumen(sesion());
}

function aplicarAnimacion() { document.body.classList.toggle('sin-animacion', !animado); $('animaciones').checked = animado; }

export function iniciarActividad({ alternarCosto: alternar = null } = {}) {
  alternarCosto = alternar;
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
