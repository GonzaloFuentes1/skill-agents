// Contenido de mensajes de Claude Code → bloques del dashboard. Lo usan proceso-claude, historial y pasos-agente.
export const recortar = (t, n) => { const s = String(t ?? ''); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const primeraLinea = (t) => String(t ?? '').split('\n').find((l) => l.trim()) ?? '';
const lineas = (s) => (s ? String(s).split('\n').length : 0);

export function textoPlano(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((b) => b?.type === 'text').map((b) => b.text).join('\n');
}

export function bloquesDe(content) {
  if (typeof content === 'string') return content.trim() ? [{ tipo: 'texto', texto: content }] : [];
  const out = [];
  for (const b of Array.isArray(content) ? content : []) {
    if (b?.type === 'text' && b.text?.trim()) out.push({ tipo: 'texto', texto: b.text });
    else if (b?.type === 'thinking' && b.thinking?.trim()) out.push({ tipo: 'pensando', texto: b.thinking });
    else if (b?.type === 'tool_use') out.push({ tipo: 'herramienta', usoId: b.id, nombre: b.name, entrada: b.input ?? {} });
  }
  return out;
}

export function resultadosDe(content) {
  return (Array.isArray(content) ? content : [])
    .filter((b) => b?.type === 'tool_result')
    .map((b) => ({ usoId: b.tool_use_id, ok: !b.is_error, texto: recortar(primeraLinea(textoPlano(b.content)), 200) }));
}

export function resumenHerramienta(nombre, entrada = {}) {
  switch (nombre) {
    case 'Read': case 'Write': return entrada.file_path ?? '';
    case 'Edit': return `${entrada.file_path ?? ''} +${lineas(entrada.new_string)} −${lineas(entrada.old_string)}`;
    case 'MultiEdit': return entrada.file_path ?? '';
    case 'NotebookEdit': return entrada.notebook_path ?? '';
    case 'Bash': case 'PowerShell': return entrada.command ?? '';
    case 'Grep': case 'Glob': return entrada.pattern ?? '';
    case 'WebFetch': return entrada.url ?? '';
    case 'WebSearch': return entrada.query ?? '';
    case 'Agent': case 'Task': return entrada.description ?? '';
    default: return recortar(JSON.stringify(entrada), 200);
  }
}
