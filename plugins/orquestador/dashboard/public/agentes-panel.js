// Panel lateral de agentes: lista de la sesión con colores de estado y modelo, y detalle en vivo de uno.
import { el, boton, chipModelo, nombreAgente, horaCorta, claseEstado, textoEstado, familiaModelo, capitalizar } from './dom.js';
import { formatoDuracion, formatoTokens } from './estado-vista.js';

const ETIQUETA_PASO = { encargo: 'Encargo', pensando: 'Pensando', texto: 'Respuesta', resultado: 'Resultado' };

export function verificacion(n) {
  const real = n.resultado?.modeloReal;
  if (!real) return { texto: n.estado === 'activo' ? 'Corriendo' : '—', clase: 'tenue' };
  const pedido = familiaModelo(n.modelo);
  const ok = familiaModelo(real) === pedido || pedido === 'heredado' || pedido === 'desconocido';
  const familiaReal = familiaModelo(real);
  return { texto: `${ok ? '✓' : '⚠'} ${familiaReal === 'desconocido' ? real : capitalizar(familiaReal)}`, clase: ok ? 'e-listo' : 'e-error' };
}

function leyenda() {
  const l = el('div', 'leyenda');
  const fila = (titulo, items) => {
    const f = el('div', 'fila-leyenda');
    f.append(el('span', 'versalita tenue', titulo));
    for (const [clase, texto] of items) { const i = el('span', clase); i.append(el('span', 'punto'), document.createTextNode(texto)); f.append(i); }
    return f;
  };
  l.append(
    fila('Estado', [['e-trabajando', 'Trabajando'], ['e-accion', 'Requiere permiso'], ['e-listo', 'Listo'], ['e-cola', 'En cola'], ['e-error', 'Error o alerta']]),
    fila('Modelo', [['m-haiku', 'Haiku'], ['m-sonnet', 'Sonnet'], ['m-opus', 'Opus'], ['m-fable', 'Fable']]),
  );
  return l;
}

function detalle(n, pasos, onVolver) {
  const d = el('div', 'detalle-agente');
  const cab = el('div', `fila e-${claseEstado(n)}`);
  cab.append(el('span', 'punto'), el('strong', null, nombreAgente(n.agente)), el('span', 'estado', textoEstado(n)));
  const v = verificacion(n);
  const datos = el('div', 'datos');
  const dato = (k, valor) => { const c = el('div', 'dato'); c.append(el('span', 'versalita tenue', k), valor); return c; };
  datos.append(
    dato('Pedido', chipModelo(n.modelo, n.esfuerzo)),
    dato('Modelo real', el('span', v.clase, v.texto)),
    dato('Tiempo', el('span', null, n.resultado ? formatoDuracion(n.resultado.duracionMs) : 'En curso')),
    dato('Tokens', el('span', null, n.resultado ? `${formatoTokens(n.resultado.tokensIn)} / ${formatoTokens(n.resultado.tokensOut)}` : '—')),
  );
  const lista = el('ol', 'pasos');
  if (!n.agentId) lista.append(el('li', 'tenue', 'Este agente todavía no informó su transcript.'));
  else if (!pasos.length) lista.append(el('li', 'tenue', 'Esperando al agente…'));
  for (const p of pasos) {
    const li = el('li', `paso p-${p.tipo}${p.ok === false ? ' e-error' : ''}`);
    const t = el('div', 'paso-titulo');
    t.append(el('strong', null, p.tipo === 'herramienta' ? p.nombre : ETIQUETA_PASO[p.tipo] ?? p.tipo), el('span', 'tenue', horaCorta(p.hora)));
    li.append(t, el('div', p.tipo === 'herramienta' ? 'mono' : 'texto', p.resumen));
    lista.append(li);
  }
  d.append(boton('← Todos los Agentes', 'volver', onVolver), cab, el('h2', 'serif', n.meta || 'Sin meta'), datos, el('h3', 'versalita tenue', 'Qué está haciendo'), lista);
  return d;
}

export function renderAgentes(contenedor, { sesion, seleccionado, pasos = [], onSeleccionar, onVolver, onCerrar }) {
  // Solo se ve en modo cajón (≤1180 px; ver tema.css).
  const cerrar = onCerrar ? [boton('Cerrar panel', 'cerrar-cajon boton-secundario', onCerrar, 'Cerrar el panel de agentes')] : [];
  if (seleccionado && sesion?.nodos[seleccionado]) { contenedor.replaceChildren(...cerrar, detalle(sesion.nodos[seleccionado], pasos, onVolver)); return; }
  const nodos = sesion ? sesion.ordenNodos.map((id) => sesion.nodos[id]) : [];
  const activos = nodos.filter((n) => n.estado === 'activo').length;
  const cab = el('div', 'agentes-cab');
  cab.append(el('h2', 'serif', 'Agentes'), el('span', 'tenue', nodos.length ? `${activos} activos · ${nodos.length - activos} terminados` : ''));
  const hijos = [...cerrar, cab];
  if (!nodos.length) hijos.push(el('p', 'tenue', 'Cuando el orquestador delegue, sus agentes aparecen aquí.'));
  for (const n of [...nodos].reverse()) {
    const t = boton(null, `tarjeta-agente e-${claseEstado(n)}`, () => onSeleccionar(n.id));
    const l1 = el('span', 'fila');
    l1.append(el('span', 'punto'), el('strong', null, nombreAgente(n.agente)), el('span', 'estado', textoEstado(n)));
    const v = verificacion(n);
    const l3 = el('span', 'fila');
    l3.append(chipModelo(n.modelo, n.esfuerzo), el('span', v.clase, v.texto));
    t.append(l1, el('span', 'meta', n.meta || 'Sin meta'), l3);
    hijos.push(t);
  }
  hijos.push(leyenda());
  contenedor.replaceChildren(...hijos);
}
