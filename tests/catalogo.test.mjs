import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsearFrontmatter } from '../plugins/orquestador/scripts/lib/frontmatter.mjs';
import { INTEGRADOS, ID_AGENTE } from '../plugins/orquestador/dashboard/agentes.mjs';

// Catálogo completo: un archivo de agente que falte es un fallo, no un TODO.
const CONTENIDO_COMPLETO = true;

const PLUGIN = fileURLToPath(new URL('../plugins/orquestador/', import.meta.url));
const packs = JSON.parse(readFileSync(join(PLUGIN, 'catalogo', 'packs.json'), 'utf8'));
const ids = packs.flatMap((p) => p.agentes);
const PACKS = ['investigacion', 'datos', 'ml', 'ingenieria', 'diseno', 'infra', 'escritura', 'negocio', 'operacion'];
const MODELOS = ['haiku', 'sonnet', 'opus', 'fable', 'inherit'];
const ESFUERZOS = ['low', 'medium', 'high', 'xhigh', 'max'];
const TOOLS = ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash', 'WebSearch', 'WebFetch', 'NotebookEdit'];
const COLORES = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan'];
const ORDEN = [/^Persona: \S/m, /^## Rol$/m, /^## Método$/m, /^## Entregable$/m, /^## Restricciones$/m, /^## Formato de retorno$/m, /^## REGLAS CRÍTICAS$/m];
const palabras = (t) => t.split(/\s+/).filter(Boolean).length;

test('packs.json: 9 packs en orden y 56 agentes con ids kebab únicos y nombre visible', () => {
  assert.deepEqual(packs.map((p) => p.id), PACKS);
  assert.deepEqual(packs.map((p) => p.agentes.length), [6, 6, 7, 9, 6, 6, 6, 6, 4]);
  assert.equal(ids.length, 56);
  assert.equal(new Set(ids).size, 56);
  for (const p of packs) {
    assert.ok(p.nombre && p.descripcion, `${p.id}: falta nombre o descripcion`);
    for (const id of p.agentes) {
      assert.match(id, ID_AGENTE, id);
      assert.ok(id.length >= 3 && id.length <= 40, id);
      assert.ok(p.nombres?.[id], `${id}: falta el nombre visible`);
    }
    assert.deepEqual(Object.keys(p.nombres).sort(), [...p.agentes].sort(), `${p.id}: nombres que sobran`);
  }
});

test('ningún id del catálogo choca con un agente del plugin ni con uno integrado', () => {
  const delPlugin = readdirSync(join(PLUGIN, 'agents')).filter((f) => f.endsWith('.md')).map((f) => basename(f, '.md').toLowerCase());
  const reservados = new Set([...delPlugin, ...INTEGRADOS.map((a) => a.id.toLowerCase())]);
  for (const id of ids) assert.ok(!reservados.has(id), `${id} choca con un agente reservado`);
});

test('no hay archivos de agentes que no estén en packs.json', () => {
  for (const p of packs) {
    const dir = join(PLUGIN, 'catalogo', p.id);
    const archivos = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => basename(f, '.md')) : [];
    for (const a of archivos) assert.ok(p.agentes.includes(a), `${p.id}/${a}.md no está en packs.json`);
  }
});

const descripciones = new Map();
for (const p of packs) {
  for (const id of p.agentes) {
    const ruta = join(PLUGIN, 'catalogo', p.id, `${id}.md`);
    const pendiente = !CONTENIDO_COMPLETO && !existsSync(ruta);
    test(`catálogo ${p.id}/${id}: frontmatter, secciones y longitud`, { todo: pendiente ? 'se escribe en las Tareas 13 a 15' : false }, () => {
      if (pendiente) return; // TODO limpio: sin trazas de ENOENT en la salida
      const texto = readFileSync(ruta, 'utf8');
      assert.doesNotMatch(texto, /\r/, 'usa LF como fin de línea');
      const { datos, cuerpo } = parsearFrontmatter(texto);
      assert.equal(datos.name, id);
      const d = datos.description ?? '';
      assert.ok(d.length >= 60 && d.length <= 330, `description de ${d.length} caracteres`);
      assert.match(d, /Úsalo /);
      assert.match(d, /no lo uses/i);
      assert.doesNotMatch(d, /: | #/, 'la description no puede tener ": " ni " #"');
      assert.ok(MODELOS.includes(datos.model), `model ${datos.model}`);
      assert.ok(ESFUERZOS.includes(datos.effort), `effort ${datos.effort}`);
      const tools = String(datos.tools ?? '').split(',').map((t) => t.trim());
      assert.ok(tools.length > 0 && tools.every((t) => TOOLS.includes(t)), `tools ${datos.tools}`);
      assert.ok(COLORES.includes(datos.color), `color ${datos.color}`);
      let ultimo = -1;
      for (const r of ORDEN) {
        const i = cuerpo.search(r);
        assert.ok(i > ultimo, `falta o está fuera de orden: ${r}`);
        ultimo = i;
      }
      assert.match(cuerpo, /^1\. /m);
      assert.match(cuerpo, /^2\. /m);
      assert.match(cuerpo.slice(cuerpo.search(/^## Formato de retorno$/m)), /300 palabras/);
      const reglas = cuerpo.slice(cuerpo.search(/^## REGLAS CRÍTICAS$/m));
      for (const r of [/coautoría/, /No inventes/, /commits ni push/, /permisos/, /español/]) assert.match(reglas, r);
      const n = palabras(cuerpo);
      assert.ok(n >= 120 && n <= 600, `cuerpo de ${n} palabras`);
      assert.doesNotMatch(texto, /orquestador:catalogo/, 'el marcador lo agrega la activación');
      assert.ok(!descripciones.has(d), `description repetida con ${descripciones.get(d)}`);
      descripciones.set(d, id);
    });
  }
}
