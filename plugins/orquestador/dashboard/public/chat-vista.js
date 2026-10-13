// Estado del chat de una conversación: reductor puro (sin DOM). Lo usan chat.js y los tests.
const mismoBloque = (a, b) => a.tipo === b.tipo && (a.tipo === 'herramienta' ? a.usoId === b.usoId : a.texto === b.texto);

export const chatVacio = () => ({ mensajes: [], parcial: '', permisos: [], estado: 'inactiva', error: null });

export function desdeHistorial({ conversacion, mensajes = [], permisos = [] } = {}) {
  return {
    mensajes: mensajes.map((m) => ({ ...m, bloques: m.bloques.map((b) => ({ ...b })) })),
    parcial: '', permisos: [...permisos], estado: conversacion?.estado ?? 'inactiva', error: conversacion?.error ?? null,
  };
}

function herramientaPorId(chat, usoId) {
  for (let i = chat.mensajes.length - 1; i >= 0; i--) {
    const b = chat.mensajes[i].bloques.find((x) => x.tipo === 'herramienta' && x.usoId === usoId);
    if (b) return b;
  }
  return null;
}

export function reducirChat(chat, e) {
  switch (e?.tipo) {
    case 'chat:usuario':
      chat.mensajes.push({ rol: 'usuario', id: e.id, bloques: [{ tipo: 'texto', texto: e.texto }] });
      break;
    case 'chat:texto-parcial':
      chat.parcial += e.delta ?? '';
      break;
    case 'chat:mensaje': {
      if (e.rol === 'herramienta') {
        for (const r of e.bloques ?? []) { const h = herramientaPorId(chat, r.usoId); if (h) h.resultado = { ok: r.ok, texto: r.texto }; }
        break;
      }
      let m = e.mensajeId ? chat.mensajes.find((x) => x.rol === 'asistente' && x.id === e.mensajeId) : null;
      if (!m) { m = { rol: 'asistente', id: e.mensajeId ?? `a${chat.mensajes.length}`, bloques: [] }; chat.mensajes.push(m); }
      for (const b of e.bloques ?? []) if (!m.bloques.some((x) => mismoBloque(x, b))) m.bloques.push({ ...b });
      if ((e.bloques ?? []).some((b) => b.tipo === 'texto')) chat.parcial = '';
      break;
    }
    case 'chat:permiso':
      if (!chat.permisos.some((p) => p.solicitudId === e.solicitudId)) {
        chat.permisos.push({ solicitudId: e.solicitudId, herramienta: e.herramienta, entrada: e.entrada ?? {}, motivo: e.motivo ?? null });
      }
      break;
    case 'chat:permiso-resuelto':
      chat.permisos = chat.permisos.filter((p) => p.solicitudId !== e.solicitudId);
      chat.mensajes.push({ rol: 'decision', id: `d-${e.solicitudId}`, bloques: [{ tipo: 'decision', decision: e.decision, herramienta: e.herramienta, entrada: e.entrada ?? {} }] });
      break;
    case 'chat:fin-turno':
      chat.parcial = '';
      if (e.interrumpido) chat.mensajes.push({ rol: 'decision', id: `i${chat.mensajes.length}`, bloques: [{ tipo: 'interrupcion' }] });
      else if (!e.ok && e.error) chat.mensajes.push({ rol: 'error', id: `e${chat.mensajes.length}`, bloques: [{ tipo: 'texto', texto: e.error }] });
      break;
    case 'chat:estado':
      chat.estado = e.conv?.estado ?? chat.estado;
      chat.error = e.conv?.error ?? null;
      if (chat.estado !== 'esperando-permiso' && chat.estado !== 'trabajando') chat.permisos = [];
      break;
    default:
  }
  return chat;
}
