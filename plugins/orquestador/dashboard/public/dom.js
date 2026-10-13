// Utilidades de DOM compartidas (solo textContent y atributos, nunca HTML en cadenas) y helpers puros de nombres y estados.
export function el(tag, clase, texto) {
  const e = document.createElement(tag);
  if (clase) e.className = clase;
  if (texto != null) e.textContent = texto;
  return e;
}

export function boton(texto, clase, alClic, etiqueta) {
  const b = el('button', clase, texto);
  b.type = 'button';
  if (etiqueta) b.setAttribute('aria-label', etiqueta);
  if (alClic) b.addEventListener('click', alClic);
  return b;
}

export function familiaModelo(modelo) {
  const s = String(modelo ?? '').toLowerCase();
  const f = ['haiku', 'sonnet', 'opus', 'fable'].find((x) => s.includes(x));
  if (f) return f;
  return s === 'heredado' || s === 'inherit' ? 'heredado' : 'desconocido';
}

export const capitalizar = (t) => { const s = String(t ?? ''); return s.charAt(0).toUpperCase() + s.slice(1); };

export function nombreAgente(agente) {
  const base = String(agente ?? '').split(':').pop() || 'subagente';
  return base.split(/[-_]/).filter(Boolean).map(capitalizar).join(' ');
}

export function chipModelo(modelo, esfuerzo) {
  const f = familiaModelo(modelo);
  const c = el('span', `chip-modelo m-${f}`);
  const nombre = f === 'desconocido' ? '—' : f === 'heredado' ? 'Hereda' : capitalizar(f);
  c.append(el('span', 'punto'), document.createTextNode(esfuerzo && esfuerzo !== '—' && esfuerzo !== 'desconocido' ? `${nombre} · ${esfuerzo}` : nombre));
  return c;
}

export const claseEstado = (n) => (!n ? 'cola' : n.estado === 'activo' ? 'trabajando' : n.estado === 'fallido' ? 'error' : n.estado === 'sin-cierre' ? 'cola' : 'listo');
export const textoEstado = (n) => ({ cola: 'En cola', trabajando: 'Trabajando', error: 'Falló', listo: 'Listo' })[claseEstado(n)];
export const horaCorta = (ts) => (ts ? new Date(ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }) : '');

export function preferencia(clave, defecto) {
  try { return localStorage.getItem(clave) ?? defecto; } catch { return defecto; }
}
export function guardarPreferencia(clave, valor) {
  try { localStorage.setItem(clave, valor); } catch { /* sin almacenamiento */ }
}
