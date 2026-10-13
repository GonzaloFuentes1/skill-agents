// Render del chat: mensajes, herramientas, delegaciones, permisos y planes. Solo nodos DOM, sin HTML en cadenas.
import { el, boton, chipModelo, nombreAgente, claseEstado, textoEstado } from './dom.js';
import { segmentar, estadoEtapas } from './plan-vista.js';
import { renderPlan } from './plan.js';

const CAMPO = { Bash: 'command', PowerShell: 'command', Read: 'file_path', Write: 'file_path', Edit: 'file_path', MultiEdit: 'file_path', Grep: 'pattern', Glob: 'pattern', WebFetch: 'url', WebSearch: 'query' };
const DECISION = { permitir: 'Permitiste una vez', siempre: 'Permitido siempre en esta conversación', denegar: 'Denegaste', cancelado: 'Solicitud cancelada' };

export function resumenEntrada(nombre, entrada = {}) {
  const v = CAMPO[nombre] && entrada[CAMPO[nombre]] != null ? String(entrada[CAMPO[nombre]]) : JSON.stringify(entrada);
  return v.length > 200 ? v.slice(0, 200) : v;
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
      frag.append(el('div', 'texto', s.texto.trim()));
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
  if (b.resultado) d.append(el('span', 'resultado', b.resultado.texto || (b.resultado.ok ? 'ok' : 'error')));
  return d;
}

function renderMensaje(m, ctx) {
  if (m.rol === 'usuario') {
    const d = el('div', 'msg usuario');
    d.append(el('span', 'versalita tenue', ctx.nombreUsuario), el('div', 'burbuja', m.bloques.map((b) => b.texto).join('\n')));
    return d;
  }
  if (m.rol === 'error') {
    const d = el('div', 'msg error e-error');
    d.append(el('span', 'versalita', 'Error'), el('div', 'texto', m.bloques[0]?.texto ?? ''));
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
      const det = el('details', 'pensando');
      det.append(el('summary', null, 'Razonamiento'), el('div', 'texto', b.texto));
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

export function renderChat(contenedor, chat, ctx) {
  const abajo = contenedor.scrollHeight - contenedor.scrollTop - contenedor.clientHeight < 80;
  let ultimoAsistente = -1;
  chat.mensajes.forEach((m, i) => { if (m.rol === 'asistente') ultimoAsistente = i; });
  const hijos = chat.mensajes.map((m, i) => renderMensaje(m, { ...ctx, planPendiente: i === ultimoAsistente && chat.estado === 'lista' }));
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
