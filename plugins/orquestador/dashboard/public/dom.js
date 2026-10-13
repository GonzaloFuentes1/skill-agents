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

export const claseEstado = (n) => (!n ? 'cola' : n.estado === 'activo' ? 'trabajando' : n.estado === 'fallido' ? 'error' : n.estado === 'sin-cierre' || n.estado === 'detenido' ? 'cola' : 'listo');
export const textoEstado = (n) => (n?.estado === 'detenido' ? 'Detenido' : { cola: 'En cola', trabajando: 'Trabajando', error: 'Falló', listo: 'Listo' }[claseEstado(n)]);
export const horaCorta = (ts) => (ts ? new Date(ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }) : '');

export function preferencia(clave, defecto) {
  try { return localStorage.getItem(clave) ?? defecto; } catch { return defecto; }
}
export function guardarPreferencia(clave, valor) {
  try { localStorage.setItem(clave, valor); } catch { /* sin almacenamiento */ }
}

// Interruptor accesible (role="switch"): botón de 44 px; la pista y el pomo se dibujan en CSS.
export function interruptor(etiqueta, marcado, alCambiar, { deshabilitado = false } = {}) {
  const b = boton(null, 'interruptor', () => alCambiar(!marcado), etiqueta);
  b.setAttribute('role', 'switch');
  b.setAttribute('aria-checked', String(!!marcado));
  b.dataset.foco = `sw:${etiqueta}`;
  b.disabled = deshabilitado;
  b.append(el('span', 'pomo'));
  return b;
}

// Botones segmentados: radiogroup (una opción) o grupo de botones con aria-pressed (varias). opciones = [[valor, texto, clase?]].
export function segmentado(etiqueta, opciones, valor, alElegir, { multiple = false, deshabilitado = false } = {}) {
  const g = el('div', 'segmentado');
  g.setAttribute('role', multiple ? 'group' : 'radiogroup');
  g.setAttribute('aria-label', etiqueta);
  for (const [v, texto, clase] of opciones) {
    const marcado = multiple ? valor.includes(v) : v === valor;
    const b = boton(texto, `opcion${clase ? ` ${clase}` : ''}`, () => alElegir(v));
    if (multiple) b.setAttribute('aria-pressed', String(marcado));
    else { b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(marcado)); }
    b.dataset.foco = `${etiqueta}:${v}`;
    b.disabled = deshabilitado;
    g.append(b);
  }
  return g;
}

// Diálogo de confirmación (#dialogo-confirmar). Resuelve true solo si el usuario acepta.
export function confirmar({ titulo, texto, aceptar = 'Confirmar', peligro = false }) {
  const d = document.getElementById('dialogo-confirmar');
  document.getElementById('confirmar-titulo').textContent = titulo;
  document.getElementById('confirmar-texto').textContent = texto;
  const ok = document.getElementById('confirmar-aceptar');
  ok.textContent = aceptar;
  ok.className = peligro ? 'boton-peligro' : 'boton-primario';
  d.returnValue = '';
  return new Promise((resolver) => {
    d.addEventListener('close', () => resolver(d.returnValue === 'si'), { once: true });
    d.showModal();
  });
}
