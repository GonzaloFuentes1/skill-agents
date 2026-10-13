// Arranque del dashboard: tema, pestañas, conversaciones, SSE y wiring entre chat, actividad y panel de agentes.
import { el, boton, preferencia, guardarPreferencia, familiaModelo, capitalizar } from './dom.js';
import { chatVacio, desdeHistorial, reducirChat } from './chat-vista.js';
import { renderChat } from './chat.js';
import { renderAgentes } from './agentes-panel.js';
import {
  iniciarActividad, procesarEvento, inicioConexion, finReplay, mostrarSesion, vistaActual, alCambiar, fijarCostoVisible, fijarModeloOrquestador,
} from './actividad.js';
import { formatoCosto } from './estado-vista.js';
import { costoVisible } from './config-vista.js';

const $ = (id) => document.getElementById(id);
const ESTADO_CLASE = { trabajando: 'e-trabajando', 'esperando-permiso': 'e-accion', error: 'e-error', lista: 'e-listo', inactiva: 'e-cola' };
const estado = { conversaciones: [], actual: null, chat: chatVacio(), agente: null, pasos: [], desde: 0, consultaFinal: null, config: null };
const leerSesion = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const guardarSesion = (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
// config.mostrarCosto manda; el botón Mostrar/Ocultar deja solo un atajo para esta sesión del navegador.
let atajoCosto = leerSesion('orq-costo-atajo');
let sinSesionVisible = false;
let editandoTitulo = false;
let firmaUso = null;
const verCosto = () => costoVisible(estado.config?.mostrarCosto, atajoCosto);

// ---------- tema ----------
function aplicarTema(t) { document.documentElement.dataset.tema = t; guardarPreferencia('orq-tema', t); }
aplicarTema(preferencia('orq-tema', 'oscuro') === 'claro' ? 'claro' : 'oscuro');
$('tema').addEventListener('click', () => aplicarTema(document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro'));

// ---------- utilidades ----------
function toast(texto) {
  const t = $('toast');
  t.textContent = texto;
  t.classList.add('visible');
  clearTimeout(toast.temporizador);
  toast.temporizador = setTimeout(() => t.classList.remove('visible'), 4500);
}

function sinSesion() {
  sinSesionVisible = true; // el render que esté en curso no debe pisar este aviso
  $('mensajes').replaceChildren(el('div', 'vacio-chat', 'Falta iniciar sesión en el dashboard. Ábrelo con /orquestador:dashboard desde Claude Code.'));
}

async function api(metodo, ruta, cuerpo) {
  const r = await fetch(ruta, { method: metodo, headers: cuerpo ? { 'content-type': 'application/json' } : {}, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const datos = await r.json().catch(() => ({}));
  if (r.status === 401) { sinSesion(); throw new Error(datos.error ?? 'Falta iniciar sesión'); }
  if (!r.ok) {
    const e = new Error(datos.error ?? `Error ${r.status}`);
    e.datos = datos; // p. ej. { errores: { campo: mensaje } }
    throw e;
  }
  return datos;
}

const convActual = () => estado.conversaciones.find((c) => c.id === estado.actual) ?? null;
const sesionActual = () => { const c = convActual(); return c?.sessionId ? vistaActual().sesiones[c.sessionId] ?? null : null; };
const ruta = (c, sufijo) => `/api/conversaciones/${encodeURIComponent(c.id)}/${sufijo}`;
const llenarComposer = (t) => { $('entrada').value = t; $('entrada').focus(); };

// ---------- costo ----------
function aplicarCosto() { fijarCostoVisible(verCosto()); firmaUso = null; actualizarUso(); }
function alternarCosto() { atajoCosto = verCosto() ? 'ocultar' : 'mostrar'; guardarSesion('orq-costo-atajo', atajoCosto); aplicarCosto(); }
async function cargarConfigUI() {
  try { estado.config = await api('GET', '/api/config'); } catch { /* sin config: valores por defecto */ }
  aplicarCosto();
}

// ---------- pestañas y cajones ----------
function mostrarPestana(p) {
  guardarPreferencia('orq-pestana', p);
  for (const [tab, vista] of [['tab-chat', 'vista-chat'], ['tab-actividad', 'vista-actividad']]) {
    const activa = tab === `tab-${p}`;
    $(tab).setAttribute('aria-selected', String(activa));
    $(vista).hidden = !activa;
  }
  if (p === 'actividad') dispatchEvent(new Event('resize'));
}
$('tab-chat').addEventListener('click', () => mostrarPestana('chat'));
$('tab-actividad').addEventListener('click', () => mostrarPestana('actividad'));
$('menu').addEventListener('click', () => document.body.classList.toggle('lateral-abierto'));
$('ver-agentes').addEventListener('click', () => document.body.classList.toggle('panel-abierto'));
// Cajones (≤1180 px): se cierran con el velo, con Escape o con el botón "Cerrar panel".
const cerrarCajones = () => document.body.classList.remove('lateral-abierto', 'panel-abierto');
$('velo').addEventListener('click', cerrarCajones);
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && !document.querySelector('dialog[open]')) cerrarCajones();
});

// ---------- render ----------
function renderLista() {
  const nav = $('conversaciones');
  if (!estado.conversaciones.length) { nav.replaceChildren(el('p', 'tenue', 'Aún no hay conversaciones.')); return; }
  nav.replaceChildren(...estado.conversaciones.map((c) => {
    const b = boton(null, `conv ${ESTADO_CLASE[c.estado] ?? 'e-cola'}${c.id === estado.actual ? ' actual' : ''}`, () => { document.body.classList.remove('lateral-abierto'); abrir(c.id); });
    if (c.id === estado.actual) b.setAttribute('aria-current', 'page');
    const l1 = el('span', 'fila');
    l1.append(el('span', 'punto'));
    if (c.etiqueta) l1.append(el('span', 'etiqueta mono', c.etiqueta));
    l1.append(el('span', 'titulo', c.titulo));
    b.append(l1, el('span', 'ruta', c.cwd));
    return b;
  }));
}

function renderCabecera() {
  const c = convActual();
  if (!editandoTitulo) $('titulo').textContent = c?.titulo ?? 'Orquestador';
  $('titulo').disabled = !c;
  $('titulo').title = c ? 'Renombrar conversación' : '';
  const chip = $('chip-orquestador');
  const fam = familiaModelo(c?.modelo);
  chip.hidden = !c || fam === 'desconocido';
  chip.className = `chip-modelo m-${fam}`;
  chip.title = c?.modelo ? `Modelo del orquestador: ${c.modelo}` : '';
  chip.replaceChildren(el('span', 'punto'), document.createTextNode(capitalizar(fam)));
  fijarModeloOrquestador(c?.modelo ?? null);
  const sub = $('subtitulo');
  sub.replaceChildren();
  if (c) {
    sub.append(document.createTextNode(c.cwd));
    if (c.rama) {
      sub.append(document.createTextNode(' · '));
      if (c.etiqueta) sub.append(el('strong', null, c.etiqueta), document.createTextNode(' '));
      sub.append(document.createTextNode(c.etiqueta ? c.rama.replace(/^[a-z]+\//i, '') : c.rama));
    }
  }
  $('modo').value = c?.modo ?? 'preguntar';
  $('modo').disabled = !c;
  $('entrada').disabled = !c;
  $('enviar').disabled = !c;
  const enCurso = !!c && ['trabajando', 'esperando-permiso'].includes(c.estado);
  $('detener').hidden = !enCurso;
  // Libera el proceso de Claude Code de la conversación; el siguiente mensaje lo retoma con --resume.
  $('cerrar-conv').hidden = !c;
  $('cerrar-conv').disabled = !c?.pid || enCurso;
}

// Renombrar en el lugar: Enter guarda, Escape (o salir del campo) cancela.
function empezarRenombrar() {
  const c = convActual();
  if (!c) return;
  editandoTitulo = true;
  const input = $('titulo-input');
  input.value = c.titulo;
  $('titulo').hidden = true;
  input.hidden = false;
  input.focus();
  input.select();
}
function terminarRenombrar(guardar) {
  if (!editandoTitulo) return;
  editandoTitulo = false;
  const c = convActual();
  const nuevo = $('titulo-input').value.trim();
  $('titulo-input').hidden = true;
  $('titulo').hidden = false;
  $('titulo').focus();
  if (guardar && c && nuevo && nuevo !== c.titulo) api('POST', ruta(c, 'titulo'), { titulo: nuevo }).catch((e) => toast(e.message));
  renderCabecera();
}
$('titulo').addEventListener('click', empezarRenombrar);
$('titulo-input').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') { ev.preventDefault(); terminarRenombrar(true); }
  else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); terminarRenombrar(false); }
});
$('titulo-input').addEventListener('blur', () => terminarRenombrar(false));

function renderPanel() {
  renderAgentes($('panel-agentes'), {
    sesion: sesionActual(), seleccionado: estado.agente, pasos: estado.pasos,
    onSeleccionar: seleccionarAgente, onVolver: () => { estado.agente = null; renderPanel(); },
    onCerrar: () => document.body.classList.remove('panel-abierto'),
  });
}

function contextoChat() {
  const c = convActual();
  const s = sesionActual();
  return {
    nombreUsuario: 'Tú',
    nodos: s ? s.ordenNodos.map((k) => s.nodos[k]) : [],
    nodosPorId: s?.nodos ?? {},
    vacio: c ? 'Escríbele al orquestador para empezar.' : 'Crea una conversación para empezar.',
    alBloquear: estado.config?.alBloquear ?? 'preguntar',
    verAgente: (id) => { seleccionarAgente(id); document.body.classList.add('panel-abierto'); },
    responderPermiso: (sid, decision) => api('POST', ruta(c, `permisos/${encodeURIComponent(sid)}`), { decision }).catch((e) => toast(e.message)),
    retomar: () => enviar('Continúa donde quedaste.'), // enviar relanza el proceso con --resume
    reintentar: (mensaje) => enviar(mensaje),
    planAcciones: { onAprobar: () => enviar('Apruebo el plan.'), onCambios: () => llenarComposer('Cambios al plan: ') },
    barreraAcciones: { onAprobar: () => enviar('Apruebo, continúa.'), onCambios: () => llenarComposer('Cambios antes de continuar: ') },
  };
}

let renderPendiente = false;
function renderTodo() {
  if (renderPendiente) return;
  renderPendiente = true;
  requestAnimationFrame(() => {
    renderPendiente = false;
    renderCabecera();
    if (!sinSesionVisible) renderChat($('mensajes'), estado.chat, contextoChat());
    renderPanel();
  });
}

// ---------- uso de la conversación (Fable, paralelo y costo ocultable) ----------
function filaUso(nombre, valor, clase, fraccion) {
  const f = el('div', `uso-fila ${clase}`);
  const l = el('div', 'fila');
  l.append(el('span', 'tenue', nombre), el('strong', null, valor));
  const pista = el('div', 'pista');
  const barra = el('div', 'barra');
  barra.style.width = `${Math.min(100, Math.round(fraccion * 100))}%`;
  pista.append(barra);
  f.append(l, pista);
  return f;
}

async function actualizarUso() {
  const c = convActual();
  if (!c?.sessionId) { $('uso').hidden = true; firmaUso = null; return; }
  try {
    const d = await api('GET', `/estado?session=${encodeURIComponent(c.sessionId)}`);
    const fable = d.estado?.fableUsados ?? 0;
    const activos = sesionActual()?.stats.activos ?? 0;
    const visible = verCosto();
    const orquestador = convActual()?.costoUSD ?? 0;
    const agentes = d.estado?.costoUSD ?? 0;
    // Se reconstruye solo si cambió algo: así el botón Mostrar/Ocultar no pierde el foco cada 3 s.
    const firma = JSON.stringify([c.sessionId, fable, activos, d.config.fableMaxPorSesion, d.config.paraleloMax, orquestador, agentes, visible]);
    if (firma === firmaUso && !$('uso').hidden) return;
    firmaUso = firma;
    const teniaFoco = $('uso').contains(document.activeElement);
    const costo = el('div', 'bloque-costo');
    const cab = el('div', 'fila');
    cab.append(el('span', 'tenue', 'Costo estimado'), boton(visible ? 'Ocultar' : 'Mostrar', 'boton-texto', alternarCosto, visible ? 'Ocultar costo' : 'Mostrar costo'));
    const linea = (nombre, usd, clase = '') => {
      const f = el('div', `fila ${clase}`);
      f.append(el('span', 'tenue', nombre), el('strong', null, visible ? formatoCosto(usd) : '••••'));
      return f;
    };
    costo.append(cab, linea('Orquestador', orquestador), linea('Agentes', agentes), linea('Total', orquestador + agentes, 'total'));
    $('uso').replaceChildren(
      el('div', 'versalita tenue', 'Esta conversación'),
      filaUso('Fable usados', `${fable} de ${d.config.fableMaxPorSesion}`, 'm-fable', fable / Math.max(1, d.config.fableMaxPorSesion)),
      filaUso('Agentes en paralelo', `${activos} de ${d.config.paraleloMax}`, 'e-trabajando', activos / Math.max(1, d.config.paraleloMax)),
      costo,
    );
    $('uso').hidden = false;
    if (teniaFoco) $('uso').querySelector('button')?.focus();
  } catch { /* sin datos de uso todavía */ }
}

// ---------- agentes ----------
function seleccionarAgente(id) {
  estado.agente = id;
  estado.pasos = [];
  estado.desde = 0;
  estado.consultaFinal = null;
  renderPanel();
  consultarPasos();
}

// Una consulta a la vez; si mientras tanto cambió el agente o el punto de lectura, la respuesta se descarta.
let pasosEnVuelo = false;
async function consultarPasos() {
  if (pasosEnVuelo) return;
  const c = convActual();
  const agente = estado.agente;
  const desde = estado.desde;
  const n = sesionActual()?.nodos[agente];
  if (!c || !n?.agentId) return;
  const terminado = n.estado !== 'activo';
  pasosEnVuelo = true;
  try {
    const r = await api('GET', `/api/pasos/${encodeURIComponent(c.sessionId)}/${encodeURIComponent(n.agentId)}?desde=${desde}`);
    if (estado.agente !== agente || estado.desde !== desde) return;
    if (r.siguiente < desde) estado.pasos = [];
    estado.pasos.push(...r.pasos);
    estado.desde = r.siguiente;
    if (terminado) estado.consultaFinal = agente; // la lectura posterior al cierre ya está hecha
    renderPanel();
  } catch { /* se reintenta en el próximo ciclo */ } finally { pasosEnVuelo = false; }
}

setInterval(() => {
  const n = sesionActual()?.nodos[estado.agente];
  if (!n) return;
  if (n.estado === 'activo' || estado.consultaFinal !== estado.agente) consultarPasos();
}, 1000);

// ---------- conversaciones ----------
async function cargarConversaciones() {
  estado.conversaciones = await api('GET', '/api/conversaciones');
  renderLista();
}

// recarga: misma conversación tras reconectar el SSE; se conserva el detalle del agente abierto.
async function abrir(id, { recarga = false } = {}) {
  if (!(recarga && id === estado.actual)) {
    estado.agente = null;
    estado.pasos = [];
    estado.desde = 0;
    terminarRenombrar(false);
  }
  estado.actual = id;
  guardarPreferencia('orq-conversacion', id);
  renderLista();
  try {
    const h = await api('GET', `/api/conversaciones/${encodeURIComponent(id)}/historial`);
    if (estado.actual !== id) return;
    estado.chat = desdeHistorial(h);
    const i = estado.conversaciones.findIndex((c) => c.id === id);
    if (i >= 0) estado.conversaciones[i] = h.conversacion;
    if (h.aviso) toast(h.aviso);
    if (h.conversacion.sessionId) mostrarSesion(h.conversacion.sessionId);
  } catch (e) { toast(e.message); }
  firmaUso = null;
  renderTodo();
  actualizarUso();
}

async function enviar(texto) {
  const c = convActual();
  const t = String(texto ?? '').trim();
  if (!c || !t) return;
  try {
    await api('POST', ruta(c, 'mensajes'), { texto: t });
    $('entrada').value = '';
  } catch (e) { toast(e.message); }
}

$('composer').addEventListener('submit', (ev) => { ev.preventDefault(); enviar($('entrada').value); });
$('entrada').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); enviar($('entrada').value); }
});
$('detener').addEventListener('click', () => { const c = convActual(); if (c) api('POST', ruta(c, 'interrumpir'), {}).catch((e) => toast(e.message)); });
$('cerrar-conv').addEventListener('click', () => { const c = convActual(); if (c?.pid) api('POST', ruta(c, 'cerrar'), {}).catch((e) => toast(e.message)); });
$('modo').addEventListener('change', (ev) => { const c = convActual(); if (c) api('POST', ruta(c, 'modo'), { modo: ev.target.value }).catch((e) => toast(e.message)); });

// ---------- nueva conversación ----------
const dialogo = $('dialogo-nueva');
let temporizadorCarpetas = null;
$('nueva').addEventListener('click', () => {
  $('carpeta').value = preferencia('orq-ultima-carpeta', '');
  $('modo-nueva').value = estado.config?.modoPermisoDefecto ?? 'preguntar';
  $('error-nueva').textContent = '';
  dialogo.showModal();
  $('carpeta').focus();
});
$('cancelar-nueva').addEventListener('click', () => dialogo.close());
$('carpeta').addEventListener('input', () => {
  clearTimeout(temporizadorCarpetas);
  temporizadorCarpetas = setTimeout(async () => {
    try {
      const lista = await api('GET', `/api/carpetas?prefijo=${encodeURIComponent($('carpeta').value)}`);
      $('carpetas').replaceChildren(...lista.map((p) => { const o = el('option'); o.value = p; return o; }));
    } catch { /* sin sugerencias */ }
  }, 200);
});
$('form-nueva').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  try {
    const c = await api('POST', '/api/conversaciones', { cwd: $('carpeta').value.trim(), modo: $('modo-nueva').value });
    guardarPreferencia('orq-ultima-carpeta', c.cwd);
    dialogo.close();
    await cargarConversaciones();
    mostrarPestana('chat');
    await abrir(c.id);
    $('entrada').focus();
  } catch (e) { $('error-nueva').textContent = e.message; }
});

// ---------- SSE ----------
function conectar() {
  const fuente = new EventSource('/eventos');
  const conexion = (texto, clase) => { $('conexion').textContent = texto; $('conexion').className = `conexion ${clase}`; };
  fuente.addEventListener('open', () => { inicioConexion(); conexion('En vivo', 'ok'); });
  fuente.addEventListener('error', () => { conexion('Reconectando…', 'error'); api('GET', '/api/conversaciones').catch(() => {}); });
  fuente.addEventListener('evento', (m) => { try { procesarEvento(JSON.parse(m.data)); } catch { /* evento inválido */ } });
  fuente.addEventListener('replay-fin', () => { finReplay(); if (estado.actual) abrir(estado.actual, { recarga: true }); });
  fuente.addEventListener('chat', (m) => {
    let e;
    try { e = JSON.parse(m.data); } catch { return; }
    if (e.tipo === 'chat:estado') {
      const i = estado.conversaciones.findIndex((c) => c.id === e.conversacion);
      if (i >= 0) estado.conversaciones[i] = e.conv; else estado.conversaciones.unshift(e.conv);
      renderLista();
      if (e.conversacion === estado.actual && e.conv.sessionId) mostrarSesion(e.conv.sessionId);
    }
    if (e.conversacion !== estado.actual) return;
    reducirChat(estado.chat, e);
    renderTodo();
    if (e.tipo === 'chat:fin-turno' || e.tipo === 'chat:estado') actualizarUso();
  });
}

alCambiar(() => renderTodo());

async function arrancar() {
  iniciarActividad({ alternarCosto });
  mostrarPestana(preferencia('orq-pestana', 'chat') === 'actividad' ? 'actividad' : 'chat');
  renderTodo();
  try {
    await cargarConversaciones();
    await cargarConfigUI();
    const previa = preferencia('orq-conversacion', null);
    const inicial = estado.conversaciones.find((c) => c.id === previa) ?? estado.conversaciones[0];
    if (inicial) await abrir(inicial.id);
  } catch {
    return; // sin sesión: sinSesion() ya avisó
  }
  conectar();
  setInterval(actualizarUso, 3000);
}

arrancar();
