// Estado de la vista del dashboard: reductor puro, sin DOM. Lo usan index.html y los tests.
const PALETA = ['#7c6cf0', '#2bb39a', '#e0913a', '#d85a8c', '#3d9be0', '#9bb83a', '#c96fd6', '#e0603a'];
const COLORES = { red: '#e05252', blue: '#3d9be0', green: '#2bb39a', yellow: '#d6a92b', purple: '#7c6cf0', orange: '#e0913a', pink: '#d85a8c', cyan: '#2bb3c9' };
const MAX_TIMELINE = 200;

export const nombreCorto = (agente) => String(agente ?? '').split(':').pop() || 'subagente';

export function familia(modelo) {
  const m = String(modelo ?? '').toLowerCase();
  return ['haiku', 'sonnet', 'opus', 'fable'].find((f) => m.includes(f)) ?? (m || '—');
}

export function colorDe(agente, color) {
  if (color && COLORES[color]) return COLORES[color];
  let h = 0;
  for (const ch of String(agente)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
}

export const vistaVacia = () => ({ sesiones: {}, orden: [] });

const sesionVacia = (id) => ({
  id, cwd: null, ultimo: null, nodos: {}, ordenNodos: [], timeline: [],
  stats: { activos: 0, completados: 0, costoUSD: 0, alertas: 0, bloqueos: 0, fable: 0 },
});

// Activos + los últimos `maxTerminados` terminados, en orden de llegada.
export function nodosVisibles(sesion, maxTerminados = 8) {
  const ids = sesion.ordenNodos;
  const terminados = ids.filter((id) => sesion.nodos[id].estado !== 'activo').slice(-maxTerminados);
  const visibles = new Set([...ids.filter((id) => sesion.nodos[id].estado === 'activo'), ...terminados]);
  return ids.filter((id) => visibles.has(id));
}

function slotLibre(sesion) {
  const ocupados = new Set(nodosVisibles(sesion).map((id) => sesion.nodos[id].slot));
  let slot = 0;
  while (ocupados.has(slot)) slot += 1;
  return slot;
}

export function reducir(vista, e) {
  if (!e?.session) return { vista, efecto: null };
  let s = vista.sesiones[e.session];
  if (!s) { s = sesionVacia(e.session); vista.sesiones[e.session] = s; vista.orden.push(e.session); }
  if (e.ts) s.ultimo = e.ts;
  const anotar = (extra) => {
    s.timeline.unshift({ ts: e.ts ?? null, tipo: e.tipo, agente: e.agente ? nombreCorto(e.agente) : null, ...extra });
    if (s.timeline.length > MAX_TIMELINE) s.timeline.pop();
  };
  switch (e.tipo) {
    case 'sesion':
      s.cwd = e.cwd ?? s.cwd;
      return { vista, efecto: null };
    case 'delegacion': {
      if (s.nodos[e.id]) return { vista, efecto: null };
      s.nodos[e.id] = {
        id: e.id, agente: nombreCorto(e.agente), meta: e.meta ?? '', modelo: e.modelo ?? '—', esfuerzo: e.esfuerzo ?? '—',
        origen: e.origenModelo ?? null, persona: e.persona ?? null, color: colorDe(e.agente, e.color),
        slot: slotLibre(s), estado: 'activo', alerta: null, resultado: null,
      };
      s.ordenNodos.push(e.id);
      s.stats.activos += 1;
      if (familia(e.modelo) === 'fable') s.stats.fable += 1;
      anotar({ texto: e.meta ?? '', modelo: `${familia(e.modelo)}·${e.esfuerzo ?? '—'}` });
      return { vista, efecto: { tipo: 'enviar', sesion: s.id, id: e.id } };
    }
    case 'fin': {
      const n = s.nodos[e.id];
      if (!n || n.estado !== 'activo') return { vista, efecto: null };
      n.estado = e.ok === false ? 'fallido' : 'terminado';
      n.resultado = { modeloReal: e.modeloReal ?? null, tokensIn: e.tokensIn ?? 0, tokensOut: e.tokensOut ?? 0, costoUSD: e.costoUSD ?? 0, duracionMs: e.duracionMs ?? 0 };
      s.stats.activos -= 1;
      s.stats.completados += 1;
      s.stats.costoUSD += e.costoUSD ?? 0;
      anotar({ agente: n.agente, texto: n.meta, modelo: e.modeloReal ? familia(e.modeloReal) : '—', costoUSD: e.costoUSD ?? 0, ok: e.ok !== false });
      return { vista, efecto: { tipo: 'volver', sesion: s.id, id: e.id } };
    }
    case 'alerta': {
      const n = s.nodos[e.id];
      if (n) n.alerta = e.mensaje ?? 'Modelo distinto al pedido';
      s.stats.alertas += 1;
      anotar({ agente: n?.agente ?? null, texto: e.mensaje ?? '' });
      return { vista, efecto: { tipo: 'alerta', sesion: s.id, id: e.id } };
    }
    case 'bloqueo':
      s.stats.bloqueos += 1;
      anotar({ texto: e.motivo ?? '', regla: e.regla ?? null });
      return { vista, efecto: { tipo: 'bloqueo', sesion: s.id, motivo: e.motivo ?? '' } };
    default:
      return { vista, efecto: null };
  }
}

// Posición normalizada (0..1) en anillos concéntricos de 8 nodos; el primero arriba del centro.
export function posicionOrbital(slot, { porAnillo = 8, radioBase = 0.3, paso = 0.13 } = {}) {
  const anillo = Math.floor(slot / porAnillo);
  const k = slot % porAnillo;
  const angulo = -Math.PI / 2 + (2 * Math.PI * k) / porAnillo + anillo * (Math.PI / porAnillo);
  const r = Math.min(radioBase + anillo * paso, 0.45);
  return { x: 0.5 + r * Math.cos(angulo), y: 0.5 + r * Math.sin(angulo), anillo };
}

export const formatoCosto = (usd) => `$${(usd ?? 0).toFixed((usd ?? 0) >= 1 ? 2 : 3)}`;
export function formatoDuracion(ms) {
  if (!ms) return '—';
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}
export const formatoTokens = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n ?? 0));
