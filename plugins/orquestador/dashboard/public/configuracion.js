// Pestaña Configuración: modo automático, límites, orquestador, rúbrica, visibilidad, precios, Git y dashboard.
// El estado vive en dos formularios puros (config-vista.js): config.json y la sección autoMode de settings.json.
import { el, boton, interruptor, segmentado, confirmar, capitalizar } from './dom.js';
import { renderMarkdown } from './markdown.js';
import {
  CLAVES_CONFIG, EJEMPLOS_RUBRICA, MODELOS, ESFUERZOS, LIMITES,
  formularioDesde, reducirFormulario, hayCambios, parcialAGuardar, autoModoDesde, accionPrecio,
} from './config-vista.js';

const SECCIONES = [['auto', 'Modo Automático'], ['limites', 'Límites'], ['orquestador', 'Orquestador'], ['rubrica', 'Rúbrica'], ['visibilidad', 'Visibilidad'], ['precios', 'Precios'], ['git', 'Git y Dashboard']];
const CAMPOS_PRECIO = [['entrada', 'Entrada'], ['salida', 'Salida'], ['cacheLectura', 'Lectura de Caché'], ['cacheEscritura', 'Escritura de Caché']];
const TEXTO_LIMITES = [
  ['paraleloMax', 'Agentes en Paralelo', 'Máximo de delegaciones corriendo al mismo tiempo. Las demás esperan en cola.'],
  ['fableMaxPorSesion', 'Fable por Sesión', 'Cuántas delegaciones a Fable se permiten en una misma sesión.'],
  ['conversacionesMax', 'Conversaciones a la Vez', 'Conversaciones del dashboard trabajando al mismo tiempo.'],
];
const MODELOS_OPCIONES = MODELOS.map((m) => [m, capitalizar(m), `m-${m}`]);

let ctx = null;        // { api, toast, alGuardar }
let cfg = null;        // formulario de config.json
let auto = null;       // formulario de autoMode
let datosAuto = null;  // última respuesta de /api/automodo
let fabrica = null;    // etiquetas de las reglas de fábrica (lista plegable)
let critica = null;    // { texto, error } de "Revisar con Claude"
let mensaje = null;    // { clase, texto } tras guardar o fallar
let ocupado = false;

export function iniciarConfiguracion(contexto) { ctx = contexto; }
export const hayCambiosConfig = () => hayCambios(cfg) || hayCambios(auto);

export async function abrirConfiguracion() {
  const raiz = document.getElementById('vista-config');
  if (hayCambiosConfig()) { render(); return; } // al volver a la pestaña no se pisan los cambios sin guardar
  raiz.replaceChildren(el('p', 'tenue', 'Cargando configuración…'));
  try {
    const [config, am] = await Promise.all([ctx.api('GET', '/api/config'), ctx.api('GET', '/api/automodo')]);
    cfg = formularioDesde(config, CLAVES_CONFIG);
    datosAuto = am;
    auto = formularioDesde(autoModoDesde(am));
  } catch (e) {
    raiz.replaceChildren(el('p', 'aviso', `No se pudo cargar la configuración: ${e.message}`));
    return;
  }
  render();
}

function cambiar(cual, accion) {
  if (cual === 'cfg') cfg = reducirFormulario(cfg, accion);
  else auto = reducirFormulario(auto, accion);
  mensaje = null;
  render();
}

// Cambio desde un campo de texto o de precio: actualiza el estado al escribir, sin re-render (el foco y el cursor no se pierden),
// y solo refresca la barra de cambios. Así un clic en "Guardar" al salir del campo no cae en un botón que ya se reemplazó.
function cambiarEnSitio(cual, accion, claveError = accion.ruta[0]) {
  const quitarError = (f) => { const errores = { ...f.errores }; delete errores[claveError]; return { ...f, errores }; };
  if (cual === 'cfg') cfg = quitarError(reducirFormulario(cfg, accion));
  else auto = quitarError(reducirFormulario(auto, accion));
  mensaje = null;
  const raiz = document.getElementById('vista-config');
  raiz.querySelector('.barra-cambios')?.replaceWith(barraCambios());
  raiz.querySelector(`[data-error="${CSS.escape(claveError)}"]`)?.remove();
}

const conFoco = (nodo, clave) => { nodo.dataset.foco = clave; return nodo; };
function errorCampo(f, k) {
  if (!f?.errores?.[k]) return null;
  const p = el('p', 'error-campo', f.errores[k]);
  p.dataset.error = k;
  return p;
}

function render() {
  const raiz = document.getElementById('vista-config');
  if (!cfg || !auto) return;
  const foco = document.activeElement?.dataset?.foco ?? null;
  try {
    const nav = el('nav', 'config-nav');
    nav.setAttribute('aria-label', 'Secciones de la configuración');
    for (const [id, titulo] of SECCIONES) { const a = el('a', null, titulo); a.href = `#cfg-${id}`; nav.append(a); }
    const cuerpo = el('div', 'config-cuerpo');
    cuerpo.append(barraCambios(), seccionAuto(), seccionLimites(), seccionOrquestador(), seccionRubrica(), seccionVisibilidad(), seccionPrecios(), seccionGit());
    raiz.replaceChildren(nav, cuerpo);
  } catch (e) {
    // Un valor que la vista no sabe dibujar no deja la pestaña en "Cargando configuración…": se explica el problema.
    console.error(e);
    raiz.replaceChildren(el('p', 'aviso e-error', `No se pudo mostrar la configuración: ${e.message}. Revisa ~/.claude/orquestador/config.json y vuelve a abrir la pestaña.`));
    return;
  }
  if (foco) raiz.querySelector(`[data-foco="${CSS.escape(foco)}"]`)?.focus();
}

// ---------- piezas ----------
function seccion(id, titulo, subtitulo, ...hijos) {
  const s = el('section', 'config-seccion');
  s.id = `cfg-${id}`;
  s.setAttribute('aria-labelledby', `cfg-${id}-titulo`);
  const cab = el('div', 'config-cab');
  const h = el('h2', 'serif', titulo);
  h.id = `cfg-${id}-titulo`;
  cab.append(h);
  if (subtitulo) cab.append(el('span', 'tenue', subtitulo));
  s.append(cab, ...hijos.filter(Boolean));
  return s;
}

function fila(titulo, desc, control, { clave = null, error = null } = {}) {
  const f = el('div', 'config-fila');
  const t = el('div', 'config-texto');
  t.append(el('strong', null, titulo));
  if (desc) t.append(el('span', 'tenue', desc));
  if (clave) t.append(el('code', 'tenue', clave));
  f.append(t, control);
  if (error) f.append(error);
  return f;
}

function campoAgregar(titulo, ayuda, alAgregar, deshabilitado, clave) {
  const f = el('form', 'agregar');
  const input = conFoco(el('input'), `agregar:${clave}`);
  input.type = 'text';
  input.placeholder = ayuda;
  input.setAttribute('aria-label', `Agregar a ${titulo}`);
  input.disabled = deshabilitado;
  const b = el('button', 'boton-secundario', '+ Agregar');
  b.type = 'submit';
  b.disabled = deshabilitado;
  f.append(input, b);
  f.addEventListener('submit', (ev) => { ev.preventDefault(); if (input.value.trim()) alAgregar(input.value); });
  return f;
}

function listaEditable(cual, titulo, valores, ruta, ayuda, { deshabilitado = false, error = null } = {}) {
  const caja = el('div', 'lista-editable');
  caja.append(el('span', 'versalita tenue', titulo));
  const chips = el('div', 'chips');
  for (const v of valores) {
    const chip = el('span', 'chip-valor');
    const quitar = conFoco(boton('×', 'quitar', () => cambiar(cual, { tipo: 'quitar', ruta, valor: v }), `Quitar ${v}`), `quitar:${ruta.join('.')}:${v}`);
    quitar.disabled = deshabilitado;
    chip.append(el('span', 'mono', v), quitar);
    chips.append(chip);
  }
  if (!valores.length) chips.append(el('span', 'tenue', 'Sin configurar'));
  caja.append(chips, campoAgregar(titulo, ayuda, (v) => cambiar(cual, { tipo: 'agregar', ruta, valor: v }), deshabilitado, ruta.join('.')));
  if (error) caja.append(error);
  return caja;
}

function grupoReglas(titulo, desc, clase, reglas, ruta, deshabilitado, error) {
  const g = el('div', `grupo-reglas ${clase}`);
  const cab = el('span', 'fila');
  cab.append(el('span', 'punto'), el('strong', null, titulo));
  const ul = el('ul', 'lista-reglas');
  for (const r of reglas) {
    const li = el('li');
    const q = conFoco(boton('×', 'quitar', () => cambiar('auto', { tipo: 'quitar', ruta, valor: r }), 'Quitar regla'), `quitar:${ruta.join('.')}:${r}`);
    q.disabled = deshabilitado;
    li.append(el('span', null, r), q);
    ul.append(li);
  }
  if (!reglas.length) ul.append(el('li', 'tenue', 'Sin reglas propias.'));
  g.append(cab, el('span', 'tenue', desc), ul,
    campoAgregar(titulo, 'Escribe la regla en lenguaje natural', (v) => cambiar('auto', { tipo: 'agregar', ruta, valor: v }), deshabilitado, ruta.join('.')));
  if (error) g.append(error);
  return g;
}

function campoTexto(titulo, valor, ayuda, alCambiar, { deshabilitado = false, clave, tipo = 'text' } = {}) {
  const l = el('label', 'campo');
  l.append(el('span', 'versalita tenue', titulo));
  const i = conFoco(el('input'), clave);
  i.type = tipo;
  i.value = valor ?? '';
  i.placeholder = ayuda;
  i.disabled = deshabilitado;
  i.addEventListener('input', () => alCambiar(i.value)); // alCambiar usa cambiarEnSitio: sin re-render mientras se escribe
  l.append(i);
  return l;
}

// ---------- barra de cambios sin guardar ----------
function barraCambios() {
  const b = el('div', 'barra-cambios');
  b.setAttribute('role', 'status');
  if (!hayCambiosConfig()) {
    if (mensaje) { b.classList.add('visible', mensaje.clase); b.append(el('span', 'texto-cambios', mensaje.texto)); }
    return b;
  }
  b.classList.add('visible', 'e-accion');
  const descartar = conFoco(boton('Descartar', 'boton-secundario', () => {
    cfg = reducirFormulario(cfg, { tipo: 'descartar' });
    auto = reducirFormulario(auto, { tipo: 'descartar' });
    mensaje = null;
    render();
  }), 'descartar');
  const guardarB = conFoco(boton(ocupado ? 'Guardando…' : 'Guardar', 'boton-primario', guardar), 'guardar');
  guardarB.disabled = ocupado;
  b.append(el('span', 'punto'), el('span', 'texto-cambios', 'Tienes cambios sin guardar'), descartar, guardarB);
  return b;
}

async function guardar() {
  if (ocupado) return;
  // Reglas propias sin "$defaults": guardar vuelve a incluir las de fábrica, así que se avisa antes.
  if (hayCambios(auto) && datosAuto?.sinFabrica?.length) {
    const ok = await confirmar({
      titulo: 'Guardar el modo automático',
      texto: `Tus reglas de ${datosAuto.sinFabrica.join(', ')} hoy reemplazan las de fábrica. Al guardar desde aquí se vuelven a incluir las de fábrica ("$defaults").`,
      aceptar: 'Guardar',
    });
    if (!ok) return;
  }
  ocupado = true;
  render();
  try {
    let reiniciar = false;
    if (hayCambios(cfg)) {
      try {
        const r = await ctx.api('POST', '/api/config', { parcial: parcialAGuardar(cfg) }); // solo lo cambiado: otra pestaña no se pisa
        cfg = reducirFormulario(cfg, { tipo: 'guardado', datos: r.config });
        reiniciar = r.reiniciar;
        ctx.alGuardar?.(r.config);
      } catch (e) {
        if (e.datos?.errores) cfg = reducirFormulario(cfg, { tipo: 'errores', errores: e.datos.errores });
        throw e;
      }
    }
    if (hayCambios(auto)) {
      try {
        datosAuto = await ctx.api('POST', '/api/automodo', auto.actual);
        auto = reducirFormulario(auto, { tipo: 'guardado', datos: autoModoDesde(datosAuto) });
      } catch (e) {
        if (e.datos?.errores) auto = reducirFormulario(auto, { tipo: 'errores', errores: e.datos.errores });
        throw e;
      }
    }
    mensaje = { clase: 'e-listo', texto: reiniciar ? 'Guardado. El puerto y el modo remoto se aplican al reiniciar el dashboard.' : 'Guardado. Se aplica en la próxima delegación.' };
  } catch (e) {
    mensaje = { clase: 'e-error', texto: e.message };
  } finally {
    ocupado = false;
    render();
  }
}

// ---------- secciones ----------
function seccionAuto() {
  const a = auto.actual;
  const c = cfg.actual;
  const disponible = !!datosAuto?.disponible;
  const bloqueado = !!datosAuto?.errorSettings;
  const n = datosAuto?.conteosFabrica;
  const intro = el('div', 'config-texto');
  intro.append(
    el('span', null, 'El orquestador trabaja solo; un clasificador revisa cada acción antes de ejecutarla.'),
    el('span', 'tenue', 'Lo seguro pasa sin preguntarte. Lo riesgoso se detiene. Las reglas se guardan en la sección autoMode de ~/.claude/settings.json.'),
  );
  const avisos = [];
  if (!disponible) avisos.push(el('p', 'aviso', `Claude Code no respondió a "auto-mode": ${datosAuto?.motivo ?? 'sin respuesta'}. Puedes editar tus reglas, pero no ver las de fábrica ni revisarlas con Claude.`));
  if (bloqueado) avisos.push(el('p', 'aviso', `${datosAuto.errorSettings}. Corrígelo antes de editar el modo automático.`));
  if (datosAuto?.sinFabrica?.length) avisos.push(el('p', 'aviso', `Tus reglas de ${datosAuto.sinFabrica.join(', ')} hoy reemplazan las de fábrica; al guardar desde aquí se vuelven a incluir con "$defaults".`));

  const defectos = el('div', 'config-interruptores');
  defectos.append(
    fila('Por defecto en conversaciones nuevas del dashboard', 'Las conversaciones nuevas empiezan en modo Auto.',
      interruptor('Modo automático por defecto en el dashboard', c.modoPermisoDefecto === 'auto', (v) => cambiar('cfg', { tipo: 'fijar', ruta: ['modoPermisoDefecto'], valor: v ? 'auto' : 'preguntar' }))),
    fila('También en la terminal', 'Escribe permissions.defaultMode: "auto" en ~/.claude/settings.json (con respaldo).',
      interruptor('Modo automático por defecto en la terminal', a.defaultModeTerminal, (v) => cambiar('auto', { tipo: 'fijar', ruta: ['defaultModeTerminal'], valor: v }), { deshabilitado: bloqueado })),
    fila('Clasificar todos los comandos de shell', 'El clasificador revisa también los comandos que parecen de solo lectura.',
      interruptor('Clasificar todos los comandos de shell', a.classifyAllShell, (v) => cambiar('auto', { tipo: 'fijar', ruta: ['classifyAllShell'], valor: v }), { deshabilitado: bloqueado })),
  );

  const niveles = el('div', 'niveles');
  for (const [k, titulo, desc, clase, propias] of [
    ['allow', 'Pasa Solo', 'Leer, editar dentro del repo e instalar las dependencias declaradas.', 'e-listo', a.permitir.length],
    ['soft_deny', 'Se Detiene', 'Acciones riesgosas: borrar fuera del repo, force-push, deploy o tocar credenciales.', 'e-accion', a.detener.length],
    ['hard_deny', 'Nunca', 'Sacar datos sensibles fuera de tu entorno de confianza.', 'e-error', 0],
  ]) {
    const t = el('div', `nivel ${clase}`);
    const cab = el('span', 'fila');
    cab.append(el('strong', 'cantidad', n ? String(n[k]) : '—'), el('span', 'versalita', titulo));
    t.append(cab, el('span', 'tenue', desc));
    if (propias) t.append(el('span', 'tenue', `+ ${propias} ${propias === 1 ? 'tuya' : 'tuyas'}`));
    niveles.append(t);
  }

  const alBloquear = fila('Cuando el clasificador detiene una acción', 'Las acciones de bloqueo absoluto se deniegan siempre, elijas lo que elijas.',
    segmentado('Cuando se detiene una acción', [['preguntar', 'Preguntarme en el Chat'], ['denegar', 'Denegar y Buscar Otra Vía']], c.alBloquear,
      (v) => cambiar('cfg', { tipo: 'fijar', ruta: ['alBloquear'], valor: v })));

  const entorno = el('div', 'entorno');
  entorno.append(...[
    listaEditable('auto', 'Repos', a.entorno.repos, ['entorno', 'repos'], 'github.com/tu-usuario/*', { deshabilitado: bloqueado, error: errorCampo(auto, 'repos') }),
    listaEditable('auto', 'Dominios', a.entorno.dominios, ['entorno', 'dominios'], 'tu-dominio.com', { deshabilitado: bloqueado, error: errorCampo(auto, 'dominios') }),
    campoTexto('Organización', a.entorno.organizacion, 'Sin configurar', (v) => cambiarEnSitio('auto', { tipo: 'fijar', ruta: ['entorno', 'organizacion'], valor: v }, 'organizacion'), { deshabilitado: bloqueado, clave: 'organizacion' }),
    errorCampo(auto, 'organizacion'),
  ].filter(Boolean)); // append(null) insertaría el texto "null"
  const otras = datosAuto?.personalizadas?.otrasEntorno ?? [];
  if (otras.length) {
    const p = el('p', 'tenue');
    p.append(el('strong', null, 'Otras entradas (se conservan tal cual): '), document.createTextNode(otras.join(' · ')));
    entorno.append(p);
  }

  const reglas = el('div', 'reglas');
  reglas.append(
    grupoReglas('Permitir Siempre', 'Excepciones tuyas que el clasificador debe dejar pasar.', 'e-listo', a.permitir, ['permitir'], bloqueado, errorCampo(auto, 'permitir')),
    grupoReglas('Detener Siempre', 'Cosas que quieres revisar tú aunque parezcan seguras.', 'e-accion', a.detener, ['detener'], bloqueado, errorCampo(auto, 'detener')),
  );

  const acciones = el('div', 'acciones');
  const revisar = conFoco(boton('Revisar mis Reglas con Claude', 'boton-secundario', revisarConClaude), 'revisar');
  revisar.disabled = !disponible || bloqueado || ocupado;
  const total = n ? n.allow + n.soft_deny + n.hard_deny : null;
  const verFabrica = conFoco(boton(fabrica ? 'Ocultar Reglas de Fábrica' : total ? `Ver las ${total} Reglas de Fábrica` : 'Ver Reglas de Fábrica', 'boton-secundario', alternarFabrica), 'fabrica');
  verFabrica.disabled = !disponible;
  const restablecer = conFoco(boton('Restablecer de Fábrica', 'boton-peligro', restablecerAuto), 'restablecer');
  restablecer.disabled = !disponible || bloqueado || ocupado;
  acciones.append(revisar, verFabrica, restablecer);

  return seccion('auto', 'Modo Automático', null, intro, ...avisos, defectos, niveles, alBloquear,
    fila('Tu entorno de confianza', 'Le dice al clasificador qué repos y dominios son tuyos, para que no los trate como destinos externos.', entorno),
    reglas, acciones, el('p', 'tenue aviso-uso', '"Revisar con Claude" gasta uso de tu plan y revisa las reglas guardadas.'),
    critica ? panelCritica() : null, fabrica ? panelFabrica() : null);
}

async function revisarConClaude() {
  const ok = await confirmar({
    titulo: 'Revisar tus reglas con Claude',
    texto: 'Esto ejecuta "claude auto-mode critique" sobre las reglas guardadas y gasta uso de tu plan. Puede tardar hasta 2 minutos.',
    aceptar: 'Revisar',
  });
  if (!ok) return;
  ocupado = true;
  critica = { texto: 'Claude está revisando tus reglas…', error: false };
  render();
  try { critica = { texto: (await ctx.api('POST', '/api/automodo/critica', {})).texto, error: false }; } catch (e) { critica = { texto: e.message, error: true }; }
  finally { ocupado = false; render(); }
}

async function restablecerAuto() {
  const ok = await confirmar({
    titulo: 'Restablecer el modo automático',
    texto: 'Se borra la sección autoMode de ~/.claude/settings.json; queda un respaldo en settings.json.orquestador.bak. Tus reglas propias se pierden.',
    aceptar: 'Restablecer', peligro: true,
  });
  if (!ok) return;
  ocupado = true;
  render();
  try {
    datosAuto = await ctx.api('POST', '/api/automodo/restablecer', { confirmar: true });
    auto = formularioDesde(autoModoDesde(datosAuto));
    mensaje = { clase: 'e-listo', texto: 'Modo automático restablecido de fábrica.' };
  } catch (e) { mensaje = { clase: 'e-error', texto: e.message }; }
  finally { ocupado = false; render(); }
}

async function alternarFabrica() {
  if (fabrica) { fabrica = null; render(); return; }
  try { fabrica = await ctx.api('GET', '/api/automodo/fabrica'); } catch (e) { mensaje = { clase: 'e-error', texto: e.message }; }
  render();
}

function panelFabrica() {
  const d = el('div', 'panel-fabrica');
  for (const [k, titulo, clase] of [['allow', 'Pasa Solo', 'e-listo'], ['soft_deny', 'Se Detiene', 'e-accion'], ['hard_deny', 'Nunca', 'e-error']]) {
    const det = el('details', clase);
    det.append(el('summary', null, `${titulo} (${fabrica[k].length})`));
    const ul = el('ul');
    for (const r of fabrica[k]) ul.append(el('li', null, r));
    det.append(ul);
    d.append(det);
  }
  return d;
}

function panelCritica() {
  const d = el('div', `panel-critica${critica.error ? ' e-error' : ''}`);
  d.setAttribute('aria-live', 'polite');
  d.append(el('strong', null, 'Opinión de Claude sobre tus reglas'), critica.error ? el('div', 'texto', critica.texto) : renderMarkdown(critica.texto));
  return d;
}

function seccionLimites() {
  const filas = TEXTO_LIMITES.map(([k, titulo, desc]) => {
    const [min, max] = LIMITES[k];
    const v = cfg.actual[k];
    const ctl = el('div', 'contador');
    const menos = conFoco(boton('−', 'boton-contador', () => cambiar('cfg', { tipo: 'sumar', ruta: [k], delta: -1 }), `Bajar ${titulo.toLowerCase()}`), `${k}:-`);
    const mas = conFoco(boton('+', 'boton-contador', () => cambiar('cfg', { tipo: 'sumar', ruta: [k], delta: 1 }), `Subir ${titulo.toLowerCase()}`), `${k}:+`);
    menos.disabled = v <= min;
    mas.disabled = v >= max;
    ctl.append(menos, el('output', 'valor', String(v)), mas);
    return fila(titulo, desc, ctl, { clave: k, error: errorCampo(cfg, k) });
  });
  return seccion('limites', 'Límites', null, ...filas);
}

function seccionOrquestador() {
  const c = cfg.actual;
  return seccion('orquestador', 'Orquestador', null,
    fila('Modelos permitidos para el orquestador', 'Si la sesión principal corre con otro modelo, la status line te avisa.',
      segmentado('Modelos permitidos', MODELOS_OPCIONES, c.modelosOrquestador,
        (m) => cambiar('cfg', { tipo: 'alternar', ruta: ['modelosOrquestador'], valor: m, minimo: 1, orden: MODELOS }), { multiple: true }),
      { error: errorCampo(cfg, 'modelosOrquestador') }),
    fila('Permisos por defecto en conversaciones nuevas', 'Se puede cambiar en cada conversación desde el chat.',
      segmentado('Permisos por defecto', [['preguntar', 'Preguntar'], ['ediciones', 'Aceptar Ediciones'], ['auto', 'Auto']], c.modoPermisoDefecto,
        (v) => cambiar('cfg', { tipo: 'fijar', ruta: ['modoPermisoDefecto'], valor: v }))),
  );
}

function seccionRubrica() {
  const filas = cfg.actual.rubrica.map((r, i) => {
    const f = el('div', 'fila-rubrica');
    const t = el('div', 'config-texto');
    t.append(el('strong', null, r.clase), el('span', 'tenue', EJEMPLOS_RUBRICA[r.clase] ?? ''));
    f.append(t,
      segmentado(`Modelo para ${r.clase}`, MODELOS_OPCIONES, r.modelo, (m) => cambiar('cfg', { tipo: 'fijar', ruta: ['rubrica', i, 'modelo'], valor: m })),
      segmentado(`Esfuerzo para ${r.clase}`, ESFUERZOS.map((e) => [e, e]), r.esfuerzo, (e) => cambiar('cfg', { tipo: 'fijar', ruta: ['rubrica', i, 'esfuerzo'], valor: e })));
    return f;
  });
  const nota = el('p', 'tenue nota');
  nota.append(el('span', 'punto m-fable'), document.createTextNode('Fable solo se usa si se cumplen dos condiciones de máxima consecuencia, y nunca más allá del tope por sesión.'));
  return seccion('rubrica', 'Rúbrica de Ruteo', 'Qué modelo y esfuerzo usa el orquestador según la clase de tarea. Si difiere de la de fábrica, se le entrega al iniciar cada sesión.',
    ...filas, errorCampo(cfg, 'rubrica'), nota);
}

function seccionVisibilidad() {
  const c = cfg.actual;
  return seccion('visibilidad', 'Visibilidad', null,
    fila('Mostrar costo', 'Muestra el costo estimado en el dashboard y en la status line de la terminal.',
      interruptor('Mostrar costo', c.mostrarCosto, (v) => cambiar('cfg', { tipo: 'fijar', ruta: ['mostrarCosto'], valor: v }))),
    fila('Alertas de modelo', 'Avisa en la terminal cuando un agente corre con un modelo distinto al pedido. La alerta se registra igual.',
      interruptor('Alertas de modelo', c.alertasModelo, (v) => cambiar('cfg', { tipo: 'fijar', ruta: ['alertasModelo'], valor: v }))),
  );
}

function seccionPrecios() {
  const cab = el('tr');
  for (const t of ['Modelo', ...CAMPOS_PRECIO.map(([, x]) => x)]) { const th = el('th', null, t); th.setAttribute('scope', 'col'); cab.append(th); }
  const thead = el('thead');
  thead.append(cab);
  const tbody = el('tbody');
  for (const m of MODELOS) {
    const tr = el('tr');
    const th = el('th', `m-${m}`);
    th.setAttribute('scope', 'row');
    th.append(el('span', 'punto'), document.createTextNode(` ${capitalizar(m)}`));
    tr.append(th);
    for (const [k, t] of CAMPOS_PRECIO) {
      const td = el('td');
      const i = conFoco(el('input'), `precio:${m}:${k}`);
      i.type = 'number';
      i.min = '0';
      i.step = 'any';
      i.value = String(cfg.actual.precios?.[m]?.[k] ?? '');
      i.setAttribute('aria-label', `${t} de ${capitalizar(m)}`);
      i.placeholder = String(cfg.original.precios?.[m]?.[k] ?? ''); // vacío = se mantiene el valor guardado
      i.addEventListener('input', () => cambiarEnSitio('cfg', accionPrecio(cfg, m, k, i.value)));
      td.append(i);
      tr.append(td);
    }
    tbody.append(tr);
  }
  const tabla = el('table', 'tabla-precios');
  tabla.append(thead, tbody);
  const caja = el('div', 'tabla-desplazable');
  caja.append(tabla);
  return seccion('precios', 'Precios', 'USD por millón de tokens · solo para estimar el costo', caja, errorCampo(cfg, 'precios'));
}

function seccionGit() {
  const c = cfg.actual;
  const remoto = c.remoto ?? { activo: false, escuchar: '127.0.0.1', hostsPermitidos: [] };
  return seccion('git', 'Git y Dashboard', null,
    fila('Ramas protegidas', 'Nadie hace push directo ni force-push a estas ramas.',
      listaEditable('cfg', 'Ramas', c.ramasProtegidas, ['ramasProtegidas'], 'develop'), { error: errorCampo(cfg, 'ramasProtegidas') }),
    fila('Puerto del dashboard', 'Requiere reiniciar el dashboard.',
      campoTexto('Puerto', String(c.puertoDashboard ?? ''), '4321', (v) => cambiarEnSitio('cfg', { tipo: 'fijar', ruta: ['puertoDashboard'], valor: Number.parseInt(v, 10) }), { clave: 'puerto', tipo: 'number' }),
      { error: errorCampo(cfg, 'puertoDashboard') }),
    fila('Modo remoto', 'Abre el dashboard desde otro equipo por una red privada como Tailscale. El enlace con token equivale a una contraseña. Requiere reiniciar el dashboard.',
      interruptor('Modo remoto', remoto.activo, (v) => cambiar('cfg', { tipo: 'fijar', ruta: ['remoto', 'activo'], valor: v }))),
    remoto.activo ? campoTexto('Escuchar en (IP de la red privada)', remoto.escuchar, '100.x.y.z', (v) => cambiarEnSitio('cfg', { tipo: 'fijar', ruta: ['remoto', 'escuchar'], valor: v.trim() }, 'remoto'), { clave: 'escuchar' }) : null,
    remoto.activo ? listaEditable('cfg', 'Hosts permitidos', remoto.hostsPermitidos, ['remoto', 'hostsPermitidos'], 'mi-pc.tailnet.ts.net') : null,
    errorCampo(cfg, 'remoto'),
  );
}
