import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsearFrontmatter } from '../plugins/orquestador/scripts/lib/frontmatter.mjs';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const PLUGIN = join(RAIZ, 'plugins', 'orquestador');
const leerJson = (r) => JSON.parse(readFileSync(r, 'utf8'));
const listar = (d, filtro) => (existsSync(d) ? readdirSync(d).filter(filtro) : []);

test('marketplace apunta a un plugin existente', () => {
  const m = leerJson(join(RAIZ, '.claude-plugin', 'marketplace.json'));
  assert.equal(m.name, 'skill-agents');
  const p = m.plugins.find((x) => x.name === 'orquestador');
  assert.ok(p, 'falta la entrada orquestador');
  assert.ok(existsSync(join(RAIZ, p.source, '.claude-plugin', 'plugin.json')));
});

test('plugin.json tiene nombre y versión semver', () => {
  const p = leerJson(join(PLUGIN, '.claude-plugin', 'plugin.json'));
  assert.equal(p.name, 'orquestador');
  assert.match(p.version, /^\d+\.\d+\.\d+$/);
});

test('cada agente tiene frontmatter válido, persona y reglas críticas', () => {
  for (const f of listar(join(PLUGIN, 'agents'), (x) => x.endsWith('.md'))) {
    const { datos, cuerpo } = parsearFrontmatter(readFileSync(join(PLUGIN, 'agents', f), 'utf8'));
    assert.equal(datos.name, basename(f, '.md'), `${f}: name`);
    assert.ok(datos.description, `${f}: description`);
    assert.ok(['haiku', 'sonnet', 'opus', 'fable', 'inherit'].includes(datos.model), `${f}: model`);
    assert.ok(['low', 'medium', 'high', 'xhigh', 'max'].includes(datos.effort), `${f}: effort`);
    assert.match(cuerpo, /^Persona: .+/m, `${f}: falta "Persona:"`);
    assert.match(cuerpo, /## REGLAS CRÍTICAS[\s\S]*coautoría/, `${f}: faltan reglas críticas`);
  }
});

test('cada skill tiene name igual a su carpeta y description', () => {
  const dir = join(PLUGIN, 'skills');
  for (const d of listar(dir, () => true)) {
    const { datos } = parsearFrontmatter(readFileSync(join(dir, d, 'SKILL.md'), 'utf8'));
    assert.equal(datos.name, d, `${d}: name`);
    assert.ok(datos.description, `${d}: description`);
  }
});

test('hooks.json solo referencia scripts que existen', () => {
  const { hooks } = leerJson(join(PLUGIN, 'hooks', 'hooks.json'));
  for (const grupos of Object.values(hooks)) {
    for (const g of grupos) {
      for (const h of g.hooks) {
        for (const a of h.args ?? []) {
          const ruta = a.replace('${CLAUDE_PLUGIN_ROOT}', PLUGIN);
          assert.ok(existsSync(ruta), `no existe ${ruta}`);
        }
      }
    }
  }
});
