// Planes en pipeline: extracción y validación del bloque ```orquestador-plan y estado de cada etapa.
import { familiaModelo } from './dom.js';

const BLOQUE = /```orquestador-plan[^\n]*\n([\s\S]*?)```/g;
const esTexto = (x, max = 400) => typeof x === 'string' && x.trim().length > 0 && x.length <= max;

export function validarPlan(p) {
  if (!p || typeof p !== 'object') return { ok: false, error: 'el plan no es un objeto' };
  if (!esTexto(p.titulo, 200)) return { ok: false, error: 'falta el título' };
  if (!Array.isArray(p.etapas) || !p.etapas.length || p.etapas.length > 12) return { ok: false, error: 'debe tener entre 1 y 12 etapas' };
  const ids = new Set();
  for (const [i, e] of p.etapas.entries()) {
    const donde = `etapa ${i + 1}`;
    if (!/^E\d{1,2}$/.test(e?.id ?? '') || ids.has(e.id)) return { ok: false, error: `${donde}: id inválido o repetido` };
    ids.add(e.id);
    if (!esTexto(e.titulo, 80) || !esTexto(e.meta)) return { ok: false, error: `${donde}: falta título o meta` };
    if (!Array.isArray(e.agentes) || !e.agentes.length) return { ok: false, error: `${donde}: sin agentes` };
    for (const a of e.agentes) if (!esTexto(a?.tipo, 80) || familiaModelo(a?.modelo) === 'desconocido') return { ok: false, error: `${donde}: agente inválido` };
    if (e.barrera != null && (!['auto', 'humana'].includes(e.barrera?.tipo) || !esTexto(e.barrera?.criterio))) return { ok: false, error: `${donde}: barrera inválida` };
  }
  if (p.riesgos != null && (!Array.isArray(p.riesgos) || p.riesgos.some((r) => !esTexto(r?.titulo) || !esTexto(r?.planB)))) return { ok: false, error: 'riesgos inválidos' };
  return { ok: true, plan: p };
}

export function segmentar(texto) {
  const t = String(texto ?? '');
  const out = [];
  let ultimo = 0;
  for (const m of t.matchAll(BLOQUE)) {
    if (m.index > ultimo) out.push({ tipo: 'texto', texto: t.slice(ultimo, m.index) });
    let r;
    try { r = validarPlan(JSON.parse(m[1])); } catch { r = { ok: false, error: 'JSON inválido' }; }
    out.push(r.ok ? { tipo: 'plan', plan: r.plan } : { tipo: 'texto', texto: m[0], aviso: `Plan no válido: ${r.error}` });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < t.length) out.push({ tipo: 'texto', texto: t.slice(ultimo) });
  return out.filter((s) => s.tipo !== 'texto' || s.texto.trim());
}

export const etapaDeMeta = (meta) => /^\s*(E\d{1,2})\s*[·:-]/.exec(String(meta ?? ''))?.[1] ?? null;

export function estadoEtapas(plan, nodos = []) {
  const estados = {};
  for (const e of plan.etapas) {
    const suyas = nodos.filter((n) => etapaDeMeta(n.meta) === e.id);
    if (suyas.some((n) => n.estado === 'activo')) estados[e.id] = 'trabajando';
    else if (suyas.some((n) => n.estado === 'fallido')) estados[e.id] = 'fallida';
    else if (suyas.length) estados[e.id] = 'lista';
    else estados[e.id] = 'en-cola';
  }
  return estados;
}

const APROBACION = 'Apruebo el plan.';

// Barrera humana pendiente: el turno terminó con una pregunta, el plan ya se aprobó y su etapa con barrera humana
// está en curso, o terminó y la siguiente sigue en cola.
export function barreraHumana(chat, nodos = []) {
  if (chat?.estado !== 'lista') return null;
  const mensajes = chat.mensajes ?? [];
  const ultimo = mensajes.at(-1);
  if (ultimo?.rol !== 'asistente') return null;
  const texto = [...ultimo.bloques].reverse().find((b) => b.tipo === 'texto')?.texto ?? '';
  if (!texto.trim().endsWith('?')) return null;
  const iAprobacion = mensajes.findLastIndex((m) => m.rol === 'usuario' && m.bloques.some((b) => b.texto?.trim() === APROBACION));
  if (iAprobacion < 0) return null;
  let plan = null;
  for (let i = iAprobacion - 1; i >= 0 && !plan; i--) {
    if (mensajes[i].rol !== 'asistente') continue;
    for (const b of mensajes[i].bloques) {
      if (b.tipo !== 'texto') continue;
      const p = segmentar(b.texto).filter((s) => s.tipo === 'plan').at(-1);
      if (p) plan = p.plan;
    }
  }
  if (!plan) return null;
  const estados = estadoEtapas(plan, nodos);
  for (const [i, e] of plan.etapas.entries()) {
    if (e.barrera?.tipo !== 'humana') continue;
    const siguiente = plan.etapas[i + 1];
    if (estados[e.id] === 'trabajando' || (estados[e.id] === 'lista' && (!siguiente || estados[siguiente.id] === 'en-cola'))) {
      return { etapa: e.id, titulo: e.titulo, criterio: e.barrera.criterio };
    }
  }
  return null;
}
