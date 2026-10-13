// Render del chat: mensajes, herramientas, delegaciones, permisos y planes. Solo nodos DOM, sin HTML en cadenas.
import { el, boton, chipModelo, nombreAgente, claseEstado, textoEstado } from './dom.js';
import { segmentar, estadoEtapas, barreraHumana } from './plan-vista.js';
import { renderPlan } from './plan.js';

const CAMPO = { Bash: 'command', PowerShell: 'command', Read: 'file_path', Write: 'file_path', Edit: 'file_path', MultiEdit: 'file_path', Grep: 'pattern', Glob: 'pattern', WebFetch: 'url', WebSearch: 'query' };
const DECISION = { permitir: 'Permitiste una vez', siempre: 'Permitido siempre en esta conversación', denegar: 'Denegaste', cancelado: 'Solicitud cancelada' };

const RESULTADO_MAX = 300;
const recortar = (t, n) => { const s = String(t ?? ''); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
// Nunca se generan div.texto vacíos.
const divTexto = (t) => (String(t ?? '').trim() ? el('div', 'texto', String(t).trim()) : null);

export function resumenEntrada(nombre, entrada) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  const v = CAMPO[nombre] && e[CAMPO[nombre]] != null ? String(e[CAMPO[nombre]]) : JSON.stringify(e);
  return v.length > 200 ? v.slice(0, 200) : v;
}

// Tarjeta de una acción que el modo automático detuvo. "Autorizar y reintentar" envía la intención explícita del usuario,
// que según la documentación de Claude Code anula un soft_deny.
export function modeloDenegacion(b, alBloquear) {
  const herramienta = b?.herramienta || 'una acción';
  const resumen = resumenEntrada(b?.herramienta, b?.entrada);
  return {
    titulo: `El modo automático detuvo ${herramienta}`,
    motivo: b?.motivo || 'El clasificador la consideró riesgosa.',
    resumen,
    accion: alBloquear === 'denegar' ? null : { texto: 'Autorizar y reintentar', mensaje: `Autorizo explícitamente esta acción: ${herramienta} ${resumen}. Hazla.` },
  };
}

function rotuloOrquestador(extra) {
  const r = el('div', 'rotulo');
  r.append(el('span', 'punto-orq'), el('span', 'versalita', 'Orquestador'));
  if (extra) r.append(el('span', 'tenue', extra));
  return r;
}

function bloqueTexto(texto, ctx) {
  const frag = document.createDocumentFragment();
  for (const s of segmentar(texto)) {
    if (s.tipo === 'plan') frag.append(renderPlan(s.plan, estadoEtapas(s.plan, ctx.nodos), { ...ctx.planAcciones, pendiente: ctx.planPendiente }));
    else {
      const d = divTexto(s.texto);
      if (d) frag.append(d);
      if (s.aviso) frag.append(el('div', 'aviso', s.aviso));
    }
  }
  return frag;
}

function bloqueHerramienta(b, ctx) {
  if (b.nombre === 'Agent' || b.nombre === 'Task') {
    const n = ctx.nodosPorId[b.usoId];
    const fila = boton(null, `delegacion e-${claseEstado(n)}`, () => ctx.verAgente?.(b.usoId));
    fila.append(
      el('span', 'punto'), el('span', 'nombre', nombreAgente(b.entrada?.subagent_type ?? 'general-purpose')),
      el('span', 'meta', b.entrada?.description ?? ''), chipModelo(b.entrada?.model, b.entrada?.effort), el('span', 'estado', textoEstado(n)),
    );
    return fila;
  }
  const d = el('div', `herramienta ${b.resultado ? (b.resultado.ok ? 'ok' : 'mal') : 'pendiente'}`);
  d.append(el('span', 'nombre', b.nombre), el('code', null, resumenEntrada(b.nombre, b.entrada)));
  if (b.resultado) d.append(el('span', 'resultado', recortar(b.resultado.texto || (b.resultado.ok ? 'ok' : 'error'), RESULTADO_MAX)));
  return d;
}

function renderMensaje(m, ctx) {
  if (m.rol === 'denegado') return tarjetaDenegacion(m.bloques[0], ctx);
  if (m.rol === 'usuario') {
    const d = el('div', 'msg usuario');
    d.append(el('span', 'versalita tenue', ctx.nombreUsuario), el('div', 'burbuja', m.bloques.map((b) => b.texto).join('\n')));
    return d;
  }
  if (m.rol === 'error') {
    const d = el('div', 'msg error e-error');
    d.append(el('span', 'versalita', 'Error'));
    const t = divTexto(m.bloques[0]?.texto);
    if (t) d.append(t);
    if (ctx.retomar) d.append(boton('Retomar', 'boton-secundario', ctx.retomar));
    return d;
  }
  if (m.rol === 'decision') {
    const b = m.bloques[0];
    const texto = b.tipo === 'interrupcion' ? 'Detuviste el turno.' : `${DECISION[b.decision] ?? b.decision}: ${b.herramienta} ${resumenEntrada(b.herramienta, b.entrada)}`;
    const clase = b.decision === 'denegar' ? 'e-error' : b.decision === 'cancelado' ? 'e-cola' : 'e-listo';
    return el('div', `msg decision ${clase}`, texto);
  }
  const d = el('div', 'msg asistente');
  d.append(rotuloOrquestador());
  for (const b of m.bloques) {
    if (b.tipo === 'texto') d.append(bloqueTexto(b.texto, ctx));
    else if (b.tipo === 'herramienta') d.append(bloqueHerramienta(b, ctx));
    else if (b.tipo === 'pensando') {
      const t = divTexto(b.texto);
      if (!t) continue;
      const det = el('details', 'pensando');
      det.append(el('summary', null, 'Razonamiento'), t);
      d.append(det);
    }
  }
  return d;
}

function tarjetaPermiso(p, responder) {
  const s = el('section', 'permiso');
  s.setAttribute('aria-label', 'Solicitud de permiso');
  const cuerpo = el('div', 'permiso-cuerpo');
  cuerpo.append(el('strong', null, `El orquestador quiere usar ${p.herramienta}`), el('code', 'bloque-codigo', resumenEntrada(p.herramienta, p.entrada)));
  if (p.motivo) cuerpo.append(el('span', 'tenue', p.motivo));
  const acciones = el('div', 'acciones');
  acciones.append(
    boton('Permitir', 'boton-primario', () => responder(p.solicitudId, 'permitir')),
    boton('Permitir Siempre en esta Conversación', 'boton-secundario', () => responder(p.solicitudId, 'siempre')),
    boton('Denegar', 'boton-peligro', () => responder(p.solicitudId, 'denegar')),
  );
  cuerpo.append(acciones);
  s.append(el('div', 'permiso-cab versalita', 'Requiere tu permiso'), cuerpo);
  return s;
}

function tarjetaDenegacion(b, ctx) {
  const m = modeloDenegacion(b, ctx.alBloquear);
  const s = el('section', 'denegacion');
  s.setAttribute('aria-label', m.titulo);
  const p = el('p', 'denegacion-titulo');
  p.append(document.createTextNode('El modo automático detuvo '), el('strong', null, b?.herramienta || 'una acción'), document.createTextNode(`: ${m.motivo}`));
  s.append(el('span', 'versalita', 'Modo automático'), p, el('code', 'bloque-codigo', m.resumen));
  if (m.accion) s.append(boton(m.accion.texto, 'boton-secundario', () => ctx.reintentar?.(m.accion.mensaje)));
  else s.append(el('span', 'tenue', 'Según tu configuración, el orquestador busca otra vía sin preguntarte.'));
  return s;
}

function franjaBarrera(b, { onAprobar, onCambios }) {
  const f = el('section', 'barrera-humana');
  f.setAttribute('aria-label', `Barrera humana de ${b.etapa}`);
  const t = el('div', 'texto-barrera');
  t.append(el('span', 'rombo-mini', ''), el('strong', null, 'Barrera:'), el('span', null, b.criterio));
  const acciones = el('div', 'acciones');
  acciones.append(boton('Aprobar', 'boton-primario', onAprobar), boton('Pedir Cambios', 'boton-secundario', onCambios));
  f.append(t, acciones);
  return f;
}

export function renderChat(contenedor, chat, ctx) {
  const abajo = contenedor.scrollHeight - contenedor.scrollTop - contenedor.clientHeight < 80;
  let ultimoAsistente = -1;
  chat.mensajes.forEach((m, i) => { if (m.rol === 'asistente') ultimoAsistente = i; });
  const hijos = chat.mensajes.map((m, i) => renderMensaje(m, { ...ctx, planPendiente: i === ultimoAsistente && chat.estado === 'lista' }));
  const barrera = ctx.barreraAcciones ? barreraHumana(chat, ctx.nodos) : null;
  if (barrera) hijos.push(franjaBarrera(barrera, ctx.barreraAcciones));
  if (chat.parcial) {
    const d = el('div', 'msg asistente');
    d.append(rotuloOrquestador('escribiendo'), el('div', 'texto escribiendo', chat.parcial));
    hijos.push(d);
  } else if (chat.estado === 'trabajando') {
    const d = el('div', 'msg asistente');
    d.append(rotuloOrquestador('trabajando…'));
    hijos.push(d);
  }
  for (const p of chat.permisos) hijos.push(tarjetaPermiso(p, ctx.responderPermiso));
  if (!hijos.length) hijos.push(el('div', 'vacio-chat', ctx.vacio));
  contenedor.replaceChildren(...hijos);
  if (abajo) contenedor.scrollTop = contenedor.scrollHeight;
}
