import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parsearFrontmatter } from './frontmatter.mjs';

const PLUGIN_PROPIO = 'orquestador';

// Agentes integrados de Claude Code sin archivo de definición: modelo fijo o "inherit".
export const AGENTES_INTEGRADOS = Object.freeze({ Explore: 'haiku', 'general-purpose': 'inherit', Plan: 'inherit' });

export const nombreBase = (agentType) => String(agentType ?? '').split(':').pop();

export function extraerPersona(cuerpo) {
  const m = /^Persona:\s*(.+)$/m.exec(cuerpo ?? '');
  return m ? m[1].trim() : null;
}

const subdirs = (dir) => { try { return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join(dir, d.name)); } catch { return []; } };

// Rutas candidatas para un agente de otro plugin: ~/.claude/plugins/cache/<marketplace>/<plugin>/<versión>/agents/<nombre>.md
function enCacheDePlugins(home, plugin, nombre) {
  return subdirs(join(home, '.claude', 'plugins', 'cache'))
    .flatMap((mk) => subdirs(join(mk, plugin)))
    .map((version) => join(version, 'agents', `${nombre}.md`));
}

// "orquestador:x" se busca en este plugin; "otro:x" en la caché de plugins; sin prefijo, en el proyecto y luego en el usuario.
export function buscarDefinicion(agentType, { raizPlugin, cwd, home = homedir(), env = process.env } = {}) {
  const nombre = nombreBase(agentType);
  if (!nombre || !/^[\w-]+$/.test(nombre)) return null;
  const tipo = String(agentType);
  let candidatos;
  if (tipo.includes(':')) {
    const plugin = tipo.split(':')[0];
    if (!/^[\w-]+$/.test(plugin)) return null;
    candidatos = plugin === PLUGIN_PROPIO ? [raizPlugin && join(raizPlugin, 'agents', `${nombre}.md`)] : enCacheDePlugins(home, plugin, nombre);
  } else {
    const dirUsuario = env.CLAUDE_CONFIG_DIR ? join(env.CLAUDE_CONFIG_DIR, 'agents') : join(home, '.claude', 'agents');
    candidatos = [cwd && join(cwd, '.claude', 'agents', `${nombre}.md`), join(dirUsuario, `${nombre}.md`)];
  }
  for (const ruta of candidatos.filter(Boolean)) {
    try {
      const { datos, cuerpo } = parsearFrontmatter(readFileSync(ruta, 'utf8'));
      return { ruta, ...datos, persona: extraerPersona(cuerpo) };
    } catch { /* no existe: probar el siguiente */ }
  }
  return null;
}
