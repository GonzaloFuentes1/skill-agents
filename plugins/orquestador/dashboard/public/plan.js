// Tarjeta del plan en pipeline: etapas con sus agentes, barreras, obstáculos previstos y acciones.
import { el, boton, chipModelo, nombreAgente } from './dom.js';
import { agruparAgentes } from './plan-vista.js';

const TEXTO_ESTADO = { 'en-cola': 'En cola', trabajando: 'Trabajando', lista: 'Lista', fallida: 'Falló' };

export function renderPlan(plan, estados, { pendiente = false, onAprobar, onCambios } = {}) {
  const s = el('section', 'plan');
  s.setAttribute('aria-label', `Plan: ${plan.titulo}`);
  const barreras = plan.etapas.filter((e) => e.barrera).length;
  const delegaciones = plan.etapas.reduce((n, e) => n + e.agentes.length, 0);
  const cab = el('div', 'plan-cab');
  cab.append(
    el('span', `versalita ${pendiente ? 'e-accion' : 'e-trabajando'}`, pendiente ? 'Plan propuesto · espera tu aprobación' : 'Plan'),
    el('h3', 'serif', plan.titulo),
    el('span', 'tenue', `${plan.etapas.length} etapas · ${barreras} barreras · ${delegaciones} delegaciones`),
  );

  const tuberia = el('div', 'tuberia');
  for (const e of plan.etapas) {
    const estado = estados[e.id] ?? 'en-cola';
    const etapa = el('div', `etapa est-${estado}`);
    const titulo = el('div', 'etapa-titulo');
    titulo.append(el('span', 'mono tenue', e.id), el('span', 'versalita', e.titulo));
    etapa.append(titulo, el('div', 'tenue', e.meta));
    for (const a of agruparAgentes(e.agentes)) {
      const ag = el('div', 'etapa-agente');
      const nombre = el('span', 'nombre');
      if (a.cantidad > 1) nombre.append(el('span', 'cantidad', `${a.cantidad} × `));
      nombre.append(document.createTextNode(nombreAgente(a.tipo)));
      ag.append(nombre, chipModelo(a.modelo, a.esfuerzo));
      etapa.append(ag);
    }
    if (!e.agentes.length) {
      const ag = el('div', 'etapa-agente etapa-orquestador');
      ag.append(el('span', 'punto-orq'), el('span', 'nombre', 'Orquestador'));
      etapa.append(ag);
    }
    etapa.append(el('span', 'etapa-estado', TEXTO_ESTADO[estado]));
    tuberia.append(etapa);
    if (e.barrera) {
      const b = el('div', `barrera b-${e.barrera.tipo}`);
      b.setAttribute('title', e.barrera.criterio);
      const rombo = el('span', 'rombo');
      rombo.append(el('span', 'rombo-signo', e.barrera.tipo === 'humana' ? '!' : '✓'));
      b.append(rombo);
      tuberia.append(b);
    }
  }

  const detalle = el('div', 'plan-detalle');
  const colBarreras = el('div');
  colBarreras.append(el('h4', 'versalita', 'Barreras y verificaciones'));
  for (const e of plan.etapas.filter((x) => x.barrera)) {
    const f = el('div', `fila-barrera b-${e.barrera.tipo}`);
    f.append(el('strong', null, `Tras ${e.titulo}`), el('span', 'versalita', e.barrera.tipo === 'humana' ? ' Tú decides' : ' Automática'), el('div', 'tenue', e.barrera.criterio));
    colBarreras.append(f);
  }
  const colRiesgos = el('div');
  colRiesgos.append(el('h4', 'versalita e-error', 'Obstáculos previstos'));
  for (const r of plan.riesgos ?? []) {
    const f = el('div', 'riesgo');
    f.append(el('strong', null, r.titulo), el('div', 'tenue', `Plan B: ${r.planB}`));
    colRiesgos.append(f);
  }
  detalle.append(colBarreras, colRiesgos);
  s.append(cab, tuberia, detalle);

  if (pendiente) {
    const acciones = el('div', 'acciones');
    acciones.append(boton('Aprobar y Ejecutar', 'boton-primario', onAprobar), boton('Pedir Cambios', 'boton-secundario', onCambios));
    s.append(acciones);
  }
  return s;
}
