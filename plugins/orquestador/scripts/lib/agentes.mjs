import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parsearFrontmatter } from './frontmatter.mjs';

export const nombreBase = (agentType) => String(agentType ?? '').split(':').pop();

export function extraerPersona(cuerpo) {
  const m = /^Persona:\s*(.+)$/m.exec(cuerpo ?? '');
  return m ? m[1].trim() : null;
}

// Agentes con prefijo "plugin:" se buscan en el plugin; los demás, en el proyecto y luego en el usuario.
export function buscarDefinicion(agentType, { raizPlugin, cwd, home = homedir() } = {}) {
  const nombre = nombreBase(agentType);
  if (!nombre || !/^[\w-]+$/.test(nombre)) return null;
  const candidatos = String(agentType).includes(':')
    ? [raizPlugin && join(raizPlugin, 'agents', `${nombre}.md`)]
    : [cwd && join(cwd, '.claude', 'agents', `${nombre}.md`), join(home, '.claude', 'agents', `${nombre}.md`)];
  for (const ruta of candidatos.filter(Boolean)) {
    try {
      const { datos, cuerpo } = parsearFrontmatter(readFileSync(ruta, 'utf8'));
      return { ruta, ...datos, persona: extraerPersona(cuerpo) };
    } catch { /* no existe: probar el siguiente */ }
  }
  return null;
}
