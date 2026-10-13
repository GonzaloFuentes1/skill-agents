// Raíz de plugin temporal con un catálogo mínimo, para probar agentes.mjs y la API sin depender del catálogo real.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const cuerpoAgente = (id) => [
  '---', `name: ${id}`, `description: Hace ${id}. Úsalo para ${id}; no lo uses para otra cosa.`, 'model: sonnet', 'effort: medium', 'tools: Read, Bash', 'color: blue', '---', '',
  `Persona: Persona de ${id}.`, '', '## Rol', '', `Rol de ${id}.`, '', '## Método', '', '1. Lee.', '2. Hace.', '',
  '## Entregable', '', 'Un informe.', '', '## Restricciones', '', '- No inventa.', '', '## Formato de retorno', '', 'Máximo ~300 palabras.', '',
  '## REGLAS CRÍTICAS', '', '- Sin coautoría de IA.', '',
].join('\n');

export function crearPluginFalso(version = '9.9.9') {
  const raiz = mkdtempSync(join(tmpdir(), 'orq-plugin-'));
  mkdirSync(join(raiz, '.claude-plugin'));
  writeFileSync(join(raiz, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'orquestador', version }));
  mkdirSync(join(raiz, 'agents'));
  writeFileSync(join(raiz, 'agents', 'guardian-git.md'), cuerpoAgente('guardian-git'));
  mkdirSync(join(raiz, 'catalogo', 'uno'), { recursive: true });
  mkdirSync(join(raiz, 'catalogo', 'dos'), { recursive: true });
  writeFileSync(join(raiz, 'catalogo', 'packs.json'), JSON.stringify([
    { id: 'uno', nombre: 'Uno', descripcion: 'Pack uno.', agentes: ['alfa', 'beta'], nombres: { alfa: 'Alfa', beta: 'Beta' } },
    { id: 'dos', nombre: 'Dos', descripcion: 'Pack dos.', agentes: ['gamma', 'pendiente'], nombres: { gamma: 'Gamma', pendiente: 'Pendiente' } },
  ]));
  for (const [pack, id] of [['uno', 'alfa'], ['uno', 'beta'], ['dos', 'gamma']]) writeFileSync(join(raiz, 'catalogo', pack, `${id}.md`), cuerpoAgente(id));
  return raiz;
}
