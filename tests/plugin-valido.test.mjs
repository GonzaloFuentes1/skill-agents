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

test('la skill orquestar documenta planes, catálogo y verificador; la versión es 0.5.0 en plugin y marketplace', () => {
  const skill = readFileSync(join(PLUGIN, 'skills', 'orquestar', 'SKILL.md'), 'utf8');
  assert.match(skill, /## 5\. Planes en pipeline/);
  assert.match(skill, /orquestador-plan/);
  assert.match(skill, /E2 · /);
  assert.match(skill, /catálogo/);
  assert.match(skill, /`verificador`/);
  const comando = readFileSync(join(PLUGIN, 'commands', 'dashboard.md'), 'utf8');
  assert.match(comando, /Configuración/);
  assert.match(comando, /Agentes/);
  const plugin = leerJson(join(PLUGIN, '.claude-plugin', 'plugin.json'));
  const entrada = leerJson(join(RAIZ, '.claude-plugin', 'marketplace.json')).plugins.find((x) => x.name === 'orquestador');
  assert.equal(entrada.version, plugin.version);
  assert.equal(plugin.version, '0.5.0');
});

test('la skill juegos enlaza referencias que existen y nombra solo agentes del catálogo', () => {
  const dir = join(PLUGIN, 'skills', 'juegos');
  const skill = readFileSync(join(dir, 'SKILL.md'), 'utf8');
  const enlaces = [...skill.matchAll(/\]\((referencias\/[a-z0-9-]+\.md)\)/g)].map((m) => m[1]);
  assert.ok(enlaces.length >= 5, 'faltan enlaces a las referencias');
  for (const e of enlaces) assert.ok(existsSync(join(dir, e)), `no existe ${e}`);
  const enDisco = listar(join(dir, 'referencias'), (x) => x.endsWith('.md')).map((x) => `referencias/${x}`).sort();
  assert.deepEqual([...new Set(enlaces)].sort(), enDisco, 'cada referencia en disco debe estar enlazada desde SKILL.md');
  const packs = leerJson(join(PLUGIN, 'catalogo', 'packs.json'));
  const ids = new Set(packs.flatMap((p) => p.agentes));
  const juegos = packs.find((p) => p.id === 'juegos');
  assert.ok(juegos, 'falta el pack juegos');
  for (const id of juegos.agentes) assert.ok(skill.includes(`\`${id}\``), `la skill no menciona ${id}`);
  const textos = [skill, ...enDisco.map((r) => readFileSync(join(dir, r), 'utf8'))];
  for (const texto of textos) {
    assert.doesNotMatch(texto, /\r/, 'usa LF como fin de línea');
    for (const m of texto.matchAll(/`((?:critico|implementador|disenador|director|ilustrador|auditor|revisor|analista|arquitecto|investigador)(?:-[a-z]+)*)`/g)) {
      assert.ok(ids.has(m[1]), `${m[1]} no es un agente del catálogo`);
    }
  }
});
