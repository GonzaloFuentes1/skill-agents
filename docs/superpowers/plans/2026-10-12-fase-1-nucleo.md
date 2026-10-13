# Fase 1 (núcleo) del plugin `orquestador`: plan de implementación

> **Para agentes que ejecutan este plan:** SUB-SKILL REQUERIDA: usa superpowers:subagent-driven-development (recomendada) o superpowers:executing-plans para implementarlo tarea por tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** construir el núcleo del plugin `orquestador`:
- registra cada delegación a subagentes (meta, agente, modelo y esfuerzo pedidos, y modelo real);
- impone el tope de Fable y de paralelismo;
- bloquea operaciones git que violan el flujo estricto;
- muestra los agentes activos en la status line;
- trae la skill de ruteo `orquestar`.

**Arquitectura:**
- Cada hook es un script Node `.mjs` sin dependencias. Separa una función pura de decisión, que es la que se testea, de una capa de I/O delgada (`ejecutarHook`).
- El estado vive fuera del repo, en `~/.claude/orquestador/`: un log `events.jsonl` y un archivo por sesión protegido con un lock de directorio. Así las delegaciones en paralelo no se pisan los contadores.
- La status line y los git hooks se instalan como *stubs* que cargan la versión vigente del plugin. Así sobreviven a las actualizaciones del plugin.

**Stack:** Node ≥ 20 (ESM `.mjs`), `node:test`, Claude Code ≥ 2.1.170 (instalado: 2.1.296), `gh` CLI y GitHub Actions.

**Spec:** [docs/specs/2026-10-12-orquestador-design.md](../../specs/2026-10-12-orquestador-design.md). Esta fase cubre §4, §5, la capa 2 de §10 (sondas), la capa 1 (unit) y §11.

## Restricciones globales

- Node ≥ 20 y **cero dependencias npm**. Solo módulos `node:*`. Los archivos son `.mjs` (ESM).
- El estado y los logs viven en `~/.claude/orquestador/`, o en `$ORQUESTADOR_HOME` si está definida (los tests siempre la definen apuntando a un temporal).
- Config por defecto: `{ "fableMaxPorSesion": 2, "paraleloMax": 4, "puertoDashboard": 4321, "modelosOrquestador": ["opus", "fable"], "ramasProtegidas": ["main", "master"] }`.
- Formato de evento: una línea JSON con `v: 1`, `ts` ISO, `session` y `tipo`, que toma uno de los valores `sesion`, `delegacion`, `bloqueo`, `fin` o `alerta` (spec §4.1).
- Si un hook falla por un error propio, **sale con código 0 y no bloquea**. Solo niegan las reglas git y los topes de Fable y paralelismo, y solo cuando la regla aplica con certeza.
- **Nunca** coautoría de Claude: ni `Co-Authored-By: …Claude/anthropic…`, ni `noreply@anthropic.com`, ni "Generated with Claude" en commits ni en PRs.
- Conventional Commits: `^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?: .+`.
- Todo el texto visible para el usuario va en español.
- Windows es plataforma de primera clase: rutas con `node:path` y fin de línea LF forzado por `.gitattributes`.
- Todo el trabajo va en la rama `feat/fase-1-nucleo` y entra a `main` por PR con squash. `main` está protegida.

## Foco de revisión

Estos son casos que el spec implica pero que no salen solos de los tests de cada tarea. Cada uno tiene su test en la tarea que es dueña del código.

1. **Delegaciones en paralelo**: 2 o más hooks PreToolUse simultáneos podrían perder conteos y saltarse el tope de Fable. Se espera que los conteos sean exactos. Tests: Tarea 3 (`conEstado` concurrente) y Tarea 4 (dos Fable simultáneos con tope 1).
2. **Git vía PowerShell**: el usuario corre git también con el tool PowerShell, que usa here-strings `@'…'@`. Las reglas deben aplicarse igual. Tests: Tarea 6 (matcher `Bash|PowerShell` y casos con here-string).
3. **Texto entre comillas o en heredocs que parece un comando**: por ejemplo `-m "docs: explicar --no-verify y git push origin main"` o `echo "git push origin main"`. No debe bloquear. Test: Tarea 6.
4. **Crear rama y commitear en el mismo comando estando en `main`**: `git checkout -b feat/x && git commit …` debe permitirse. Test: Tarea 6.
5. **Modelo heredado con el orquestador en Fable**: un subagente sin `model` hereda Fable y debe contar para el tope. Test: Tarea 4.

---

## Mapa de archivos

```
.gitattributes                                  LF en todo el repo
package.json                                    "type": "module", script test
.claude-plugin/marketplace.json                 marketplace "skill-agents"
.github/workflows/ci.yml                        node --test en ubuntu y windows, título de PR
plugins/orquestador/
  .claude-plugin/plugin.json
  hooks/hooks.json                              registro de hooks (forma exec: command node + args)
  scripts/
    lib/frontmatter.mjs                         parsea el frontmatter de agentes y skills
    lib/rutas.mjs                               rutas de estado (ORQUESTADOR_HOME)
    lib/config.mjs                              config por defecto, precios y carga
    lib/modelos.mjs                             familia(modelo), costoUSD(uso)
    lib/eventos.mjs                             emitir() y leerEventos()
    lib/estado.mjs                              estado por sesión con lock (conEstado)
    lib/hook-io.mjs                             stdin→JSON, salida, deny/contexto, esPrincipal
    lib/campos.mjs                              acceso a campos de entrada de hooks (según sondas)
    lib/agentes.mjs                             busca la definición del agente (model/effort/color/persona)
    pre-agent.mjs                               PreToolUse Agent|Task
    subagent-start.mjs                          SubagentStart
    subagent-stop.mjs                           SubagentStop: modelo real, costo, alerta
    post-agent.mjs                              PostToolUse Agent|Task (respaldo)
    git-guard.mjs                               PreToolUse Bash|PowerShell
    git-hooks/reglas-git.mjs                    reglas git autocontenidas (también se copian a .git/hooks)
    git-hooks/commit-msg.mjs                    git hook de respaldo
    git-hooks/pre-push.mjs                      git hook de respaldo
    session-start.mjs                           registra la raíz del plugin e inyecta el recordatorio
    statusline.mjs                              línea principal
    subagent-statusline.mjs                     línea por subagente
    setup.mjs                                   /orquestador:setup
    reporte-estado.mjs                          /orquestador:estado
  commands/setup.md, estado.md
  skills/orquestar/SKILL.md, skills/flujo-git/SKILL.md
  agents/guardian-git.md
bench/sondas.mjs, bench/sondas/grabador.mjs, bench/sondas/resumen.mjs
docs/specs/hallazgos-hooks.md                   resultado de las sondas
tests/*.test.mjs
```

---

### Tarea 1: andamiaje, manifiestos, validador y CI

**Archivos:**
- Crear: `.gitattributes`, `package.json`, `.claude-plugin/marketplace.json`, `plugins/orquestador/.claude-plugin/plugin.json`, `plugins/orquestador/hooks/hooks.json`, `plugins/orquestador/scripts/lib/frontmatter.mjs`, `.github/workflows/ci.yml`
- Test: `tests/frontmatter.test.mjs`, `tests/plugin-valido.test.mjs`

**Interfaces:**
- Produce: `parsearFrontmatter(texto: string) → { datos: Record<string,string>, cuerpo: string }`
- Produce: el test `plugin-valido` exige lo siguiente a todo agente y skill que se agregue después:
  - **Agentes:** `name` igual al nombre del archivo; `description`; `model` ∈ {haiku, sonnet, opus, fable, inherit}; `effort` ∈ {low, medium, high, xhigh, max}; una línea `Persona: …` en el cuerpo; una sección `## REGLAS CRÍTICAS` que mencione "coautoría".
  - **Skills:** `name` igual a la carpeta, y `description`.
  - **Hooks:** cada script referenciado en `hooks.json` debe existir.

- [ ] **Paso 1: archivos base**

`.gitattributes`:
```
* text=auto eol=lf
```

`package.json`:
```json
{
  "name": "skill-agents",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": { "test": "node --test" }
}
```

`.claude-plugin/marketplace.json`:
```json
{
  "name": "skill-agents",
  "owner": { "name": "Gonzalo Fuentes" },
  "plugins": [
    {
      "name": "orquestador",
      "source": "./plugins/orquestador",
      "description": "Orquestador de agentes: ruteo de modelo y esfuerzo, verificación del modelo real, git estricto y visibilidad en vivo.",
      "version": "0.1.0"
    }
  ]
}
```

`plugins/orquestador/.claude-plugin/plugin.json`:
```json
{
  "name": "orquestador",
  "version": "0.1.0",
  "description": "Orquestador de agentes: ruteo de modelo y esfuerzo, verificación del modelo real, git estricto y visibilidad en vivo.",
  "author": { "name": "Gonzalo Fuentes" },
  "license": "MIT"
}
```

`plugins/orquestador/hooks/hooks.json`:
```json
{ "hooks": {} }
```

- [ ] **Paso 2: escribir el test de frontmatter, que debe fallar**

`tests/frontmatter.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsearFrontmatter } from '../plugins/orquestador/scripts/lib/frontmatter.mjs';

test('parsea pares clave: valor y separa el cuerpo', () => {
  const r = parsearFrontmatter('---\nname: guardian-git\nmodel: haiku\n---\nPersona: estricto\n');
  assert.deepEqual(r.datos, { name: 'guardian-git', model: 'haiku' });
  assert.equal(r.cuerpo, 'Persona: estricto\n');
});

test('quita comillas y admite dos puntos dentro del valor', () => {
  const r = parsearFrontmatter('---\ndescription: "Úsalo para: commits"\n---\n');
  assert.equal(r.datos.description, 'Úsalo para: commits');
});

test('acepta CRLF', () => {
  const r = parsearFrontmatter('---\r\nname: x\r\n---\r\ncuerpo');
  assert.equal(r.datos.name, 'x');
  assert.equal(r.cuerpo, 'cuerpo');
});

test('sin frontmatter devuelve datos vacíos y el texto como cuerpo', () => {
  assert.deepEqual(parsearFrontmatter('hola'), { datos: {}, cuerpo: 'hola' });
});
```

Ejecuta: `node --test tests/frontmatter.test.mjs`
Esperado: FALLA con `Cannot find module …frontmatter.mjs`.

- [ ] **Paso 3: implementar `frontmatter.mjs`**

```js
// Parser mínimo de frontmatter YAML: solo pares `clave: valor` de una línea.
export function parsearFrontmatter(texto) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(texto);
  if (!m) return { datos: {}, cuerpo: texto };
  const datos = {};
  for (const linea of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(linea);
    if (!kv) continue;
    let valor = kv[2].trim();
    if (/^(['"]).*\1$/.test(valor)) valor = valor.slice(1, -1);
    datos[kv[1]] = valor;
  }
  return { datos, cuerpo: m[2] };
}
```

Ejecuta: `node --test tests/frontmatter.test.mjs`
Esperado: PASA (4 tests).

- [ ] **Paso 4: escribir el validador del plugin**

`tests/plugin-valido.test.mjs`:
```js
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
```

Ejecuta: `node --test`
Esperado: PASA. Agentes y skills todavía no existen, así que sus bucles quedan vacíos.

- [ ] **Paso 5: CI**

`.github/workflows/ci.yml`:
```yaml
name: ci
on:
  pull_request:
    types: [opened, edited, synchronize, reopened]
  push:
    branches: [main]
jobs:
  pruebas:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: node --test
  titulo-pr:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - name: Título en Conventional Commits y sin atribución de IA
        env:
          TITULO: ${{ github.event.pull_request.title }}
          CUERPO: ${{ github.event.pull_request.body }}
        run: |
          printf '%s' "$TITULO" | grep -Eq '^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?: .+' \
            || { echo "El título del PR no sigue Conventional Commits"; exit 1; }
          if printf '%s' "$CUERPO" | grep -Eiq 'co-authored-by:.*(claude|anthropic)|noreply@anthropic\.com|generated with \[?claude'; then
            echo "El PR contiene atribución de IA"; exit 1
          fi
```

- [ ] **Paso 6: commit**

```bash
git add .gitattributes package.json .claude-plugin plugins tests .github
git commit -m "build: andamiaje del plugin orquestador, validador y CI"
```

---

### Tarea 2: sondas, para verificar los supuestos sobre los hooks (capa 2)

Esta tarea es una **compuerta**. Sus hallazgos confirman o corrigen los nombres de campos que usan las Tareas 3 a 5. Con 2 corridas cortas de `claude -p` en Sonnet, el costo de uso es mínimo.

**Archivos:**
- Crear: `bench/sondas/grabador.mjs`, `bench/sondas/resumen.mjs`, `bench/sondas.mjs`, `docs/specs/hallazgos-hooks.md`
- Test: `tests/sondas-resumen.test.mjs`

**Interfaces:**
- Produce: `resumirCaptura(lineas: Array<{argv: string[], entrada: object}>, leerArchivo: (ruta) => string) → Resumen`
- Produce: `modelosEnTranscript(texto: string) → string[]`
- Produce: `docs/specs/hallazgos-hooks.md`, la fuente de verdad que usa `lib/campos.mjs` en la Tarea 3.

- [ ] **Paso 1: escribir el test del resumen, que debe fallar**

`tests/sondas-resumen.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumirCaptura, modelosEnTranscript } from '../bench/sondas/resumen.mjs';

const transcript = [
  { type: 'assistant', message: { id: 'm1', model: 'claude-haiku-5-5', usage: { input_tokens: 10 } } },
  { type: 'assistant', message: { id: 'm1', model: 'claude-haiku-5-5', usage: { input_tokens: 10 } } },
  { type: 'assistant', message: { id: 'm2', model: '<synthetic>' } },
  { type: 'user', message: { role: 'user' } },
].map((x) => JSON.stringify(x)).join('\n');

const lineas = [
  { argv: ['SessionStart'], entrada: { session_id: 's', source: 'startup', cwd: '/t' } },
  { argv: ['PreToolUse'], entrada: { session_id: 's', tool_name: 'Agent', tool_use_id: 'tu1',
    tool_input: { subagent_type: 'sonda-eco', description: 'eco', prompt: 'x', model: 'haiku', effort: 'low' } } },
  { argv: ['SubagentStart'], entrada: { session_id: 's', agent_id: 'a1', agent_type: 'sonda-eco' } },
  { argv: ['SubagentStop'], entrada: { session_id: 's', agent_id: 'a1', agent_type: 'sonda-eco', agent_transcript_path: '/t/a1.jsonl' } },
  { argv: ['PostToolUse'], entrada: { session_id: 's', tool_name: 'Agent', tool_use_id: 'tu1', tool_input: {}, tool_response: { status: 'completed' } } },
];

test('modelosEnTranscript ignora duplicados y <synthetic>', () => {
  assert.deepEqual(modelosEnTranscript(transcript), ['claude-haiku-5-5']);
});

test('resumirCaptura reporta herramienta, campos y modelo real', () => {
  const r = resumirCaptura(lineas, () => transcript);
  assert.equal(r.herramienta, 'Agent');
  assert.equal(r.modelEnToolInput, true);
  assert.equal(r.effortEnToolInput, true);
  assert.deepEqual(r.camposTranscriptSubagente, ['agent_transcript_path']);
  assert.deepEqual(r.modelosReales, { a1: ['claude-haiku-5-5'] });
  assert.deepEqual(r.eventosVistos, { SessionStart: 1, PreToolUse: 1, SubagentStart: 1, SubagentStop: 1, PostToolUse: 1 });
  assert.ok(r.campos.SubagentStop.includes('agent_id'));
  assert.deepEqual(r.camposToolResponse, ['status']);
});
```

Ejecuta: `node --test tests/sondas-resumen.test.mjs`
Esperado: FALLA (no existe el módulo).

- [ ] **Paso 2: implementar `bench/sondas/resumen.mjs`**

```js
// Resume lo que capturaron los hooks de sondeo, para confirmar los supuestos del spec.
export function modelosEnTranscript(texto) {
  const modelos = new Set();
  for (const linea of String(texto).split('\n')) {
    if (!linea.trim()) continue;
    let e;
    try { e = JSON.parse(linea); } catch { continue; }
    const m = e?.message?.model;
    if (e?.type === 'assistant' && m && m !== '<synthetic>') modelos.add(m);
  }
  return [...modelos];
}

export function resumirCaptura(lineas, leerArchivo) {
  const campos = {};
  const eventosVistos = {};
  let herramienta = null;
  let toolInput = {};
  let toolResponse = {};
  const camposTranscript = new Set();
  const modelosReales = {};
  for (const { argv, entrada } of lineas) {
    const evento = argv[0];
    eventosVistos[evento] = (eventosVistos[evento] ?? 0) + 1;
    campos[evento] = [...new Set([...(campos[evento] ?? []), ...Object.keys(entrada ?? {})])];
    if (evento === 'PreToolUse') { herramienta = entrada.tool_name; toolInput = entrada.tool_input ?? {}; }
    if (evento === 'PostToolUse') toolResponse = entrada.tool_response ?? {};
    if (evento === 'SubagentStop') {
      for (const k of Object.keys(entrada)) {
        if (!/transcript/i.test(k) || k === 'transcript_path') continue;
        camposTranscript.add(k);
        try { modelosReales[entrada.agent_id] = modelosEnTranscript(leerArchivo(entrada[k])); } catch { modelosReales[entrada.agent_id] = []; }
      }
    }
  }
  return {
    herramienta,
    camposToolInput: Object.keys(toolInput),
    modelEnToolInput: 'model' in toolInput,
    effortEnToolInput: 'effort' in toolInput,
    campos,
    camposToolResponse: typeof toolResponse === 'object' && toolResponse ? Object.keys(toolResponse) : [],
    camposTranscriptSubagente: [...camposTranscript],
    modelosReales,
    eventosVistos,
  };
}
```

Ejecuta: `node --test tests/sondas-resumen.test.mjs`
Esperado: PASA.

- [ ] **Paso 3: el grabador y el runner**

`bench/sondas/grabador.mjs`:
```js
#!/usr/bin/env node
// Hook de sondeo: agrega el input crudo del evento a $SONDA_SALIDA (JSONL). Nunca bloquea.
import { appendFileSync } from 'node:fs';

let datos = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { datos += c; });
process.stdin.on('end', () => {
  let entrada;
  try { entrada = JSON.parse(datos); } catch { entrada = { crudo: datos }; }
  if (process.env.SONDA_SALIDA) {
    appendFileSync(process.env.SONDA_SALIDA, JSON.stringify({ argv: process.argv.slice(2), entrada }) + '\n');
  }
  process.exit(0);
});
```

`bench/sondas.mjs`:
```js
#!/usr/bin/env node
// Capa 2: lanza claude -p mínimos con hooks grabadores y resume qué campos llegan de verdad.
// Uso: node bench/sondas.mjs   (consume uso de tu cuenta: 2 corridas cortas en sonnet)
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resumirCaptura } from './sondas/resumen.mjs';

const GRABADOR = fileURLToPath(new URL('./sondas/grabador.mjs', import.meta.url));
const RESULTADOS = fileURLToPath(new URL('./resultados/', import.meta.url));
const hook = (evento) => ({ type: 'command', command: 'node', args: [GRABADOR, evento], timeout: 10 });

const settings = {
  hooks: {
    SessionStart: [{ hooks: [hook('SessionStart')] }],
    PreToolUse: [{ matcher: 'Agent|Task', hooks: [hook('PreToolUse')] }],
    PostToolUse: [{ matcher: 'Agent|Task', hooks: [hook('PostToolUse')] }],
    SubagentStart: [{ hooks: [hook('SubagentStart')] }],
    SubagentStop: [{ hooks: [hook('SubagentStop')] }],
  },
};

const casos = [
  { nombre: 'modelo-explicito', esperado: 'haiku',
    prompt: "Usa el tool Agent con subagent_type 'sonda-eco', model 'haiku' y effort 'low', con la descripción 'eco' y el prompt 'Responde exactamente: ok'. Espera su resultado y no hagas nada más." },
  { nombre: 'modelo-frontmatter', esperado: 'sonnet',
    prompt: "Usa el tool Agent con subagent_type 'sonda-eco' SIN indicar model ni effort, con la descripción 'eco' y el prompt 'Responde exactamente: ok'. Espera su resultado y no hagas nada más." },
];

function correrClaude(args, opciones) {
  let r = spawnSync('claude', args, opciones);
  if (r.error?.code === 'ENOENT') r = spawnSync('claude', args, { ...opciones, shell: true });
  return r;
}

mkdirSync(RESULTADOS, { recursive: true });
const salida = { fecha: new Date().toISOString(), casos: [] };
for (const caso of casos) {
  const dir = mkdtempSync(join(tmpdir(), `orq-sonda-${caso.nombre}-`));
  mkdirSync(join(dir, '.claude', 'agents'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'agents', 'sonda-eco.md'),
    '---\nname: sonda-eco\ndescription: Agente de sondeo que responde ok.\nmodel: sonnet\neffort: low\n---\nResponde exactamente lo que te pidan.\n');
  const rutaSettings = join(dir, 'settings-sonda.json');
  writeFileSync(rutaSettings, JSON.stringify(settings));
  const captura = join(dir, 'captura.jsonl');
  const r = correrClaude(
    ['-p', caso.prompt, '--settings', rutaSettings, '--output-format', 'json', '--model', 'sonnet',
      '--allowedTools', 'Agent', '--permission-mode', 'dontAsk'],
    { cwd: dir, env: { ...process.env, SONDA_SALIDA: captura }, encoding: 'utf8', timeout: 300_000 },
  );
  const lineas = existsSync(captura)
    ? readFileSync(captura, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : [];
  const resumen = resumirCaptura(lineas, (ruta) => readFileSync(ruta, 'utf8'));
  let costo = null;
  try { costo = JSON.parse(r.stdout).total_cost_usd ?? null; } catch {}
  const reales = Object.values(resumen.modelosReales).flat();
  salida.casos.push({ ...caso, dir, exit: r.status, stderr: (r.stderr ?? '').slice(0, 2000), costo, resumen,
    veredicto: reales.length ? (reales.every((m) => m.includes(caso.esperado)) ? 'OK' : `MISMATCH: ${reales.join(',')}`) : 'SIN TRANSCRIPT' });
}
const archivo = join(RESULTADOS, `sondas-${Date.now()}.json`);
writeFileSync(archivo, JSON.stringify(salida, null, 2));
for (const c of salida.casos) console.log(`${c.nombre}: exit=${c.exit} veredicto=${c.veredicto} costo=${c.costo}`);
console.log(`Detalle: ${archivo}`);
```

- [ ] **Paso 4: correr las sondas**

Ejecuta: `node bench/sondas.mjs`
Esperado: dos líneas `exit=0`, más la ruta al JSON de detalle. Lee el JSON completo.

- [ ] **Paso 5: escribir `docs/specs/hallazgos-hooks.md`**

Llena esta plantilla con los **valores reales** del JSON:
```markdown
# Hallazgos de sondas: hooks de Claude Code <versión de `claude --version`>

Fecha: <fecha> · Fuente: bench/resultados/sondas-<ts>.json

| Pregunta | Respuesta observada |
|---|---|
| Tool de delegación | <herramienta> |
| Campos de tool_input | <camposToolInput> |
| ¿`model` en tool_input? | <sí/no> |
| ¿`effort` en tool_input? | <sí/no> |
| Campos de SubagentStart | <campos.SubagentStart> |
| Campos de SubagentStop | <campos.SubagentStop> |
| Campo con transcript del subagente | <camposTranscriptSubagente> |
| Campos de tool_response (PostToolUse) | <camposToolResponse> |
| ¿PostToolUse llega antes o después de SubagentStop? | <orden en captura.jsonl> |
| Caso modelo-explicito (esperado haiku) | <veredicto> |
| Caso modelo-frontmatter (esperado sonnet) | <veredicto> |

## Consecuencias para la Fase 1
<una línea por cada supuesto que cambió, con el ajuste concreto en lib/campos.mjs; o "ninguna">
```

**Compuerta:** las Tareas 3 a 5 asumen lo siguiente:
- herramienta `Agent`;
- `tool_input.model`, `tool_input.effort`, `tool_input.subagent_type`, `tool_input.description` y `tool_input.run_in_background`;
- `agent_id`, `agent_type` y `agent_transcript_path` en SubagentStop.

Si algún nombre difiere, corrígelo **solo** en `lib/campos.mjs` (Tarea 3) y en los fixtures de los tests de las Tareas 4 y 5. Anótalo en "Consecuencias".

Si `--settings` con la forma `args` no disparó ningún hook (`eventosVistos` vacío), cambia la forma de hook en este runner y en `hooks.json` a `"command": "node \"<ruta>\" <Evento>"` (forma shell) y vuelve a correr las sondas.

- [ ] **Paso 6: commit**

```bash
git add bench/sondas.mjs bench/sondas tests/sondas-resumen.test.mjs docs/specs/hallazgos-hooks.md
git commit -m "test: sondas de hooks y hallazgos sobre la versión instalada"
```

---

### Tarea 3: librerías base (rutas, config, modelos, eventos, estado con lock, I/O de hooks, campos)

**Archivos:**
- Crear: `plugins/orquestador/scripts/lib/{rutas,config,modelos,eventos,estado,hook-io,campos}.mjs`
- Test: `tests/lib-base.test.mjs`, `tests/estado.test.mjs`, `tests/hook-io.test.mjs`

**Interfaces:**
- Produce `rutas.mjs`: `dirBase(env) → string`, `rutaEventos(env)`, `rutaSesion(id, env)`, `rutaConfig(env)`, `rutaRaizPlugin(env)` y `limpiarId(id) → string`.
- Produce `config.mjs`: `CONFIG_DEFECTO`, `cargarConfig(env) → Config` y `asegurarConfig(env) → void`.
  - `Config = { fableMaxPorSesion, paraleloMax, puertoDashboard, modelosOrquestador: string[], ramasProtegidas: string[], precios: Record<familia,{entrada,salida,cacheLectura,cacheEscritura}> }`
- Produce `modelos.mjs`: `familia(modelo) → 'haiku'|'sonnet'|'opus'|'fable'|'heredado'|'desconocido'`, `ESFUERZOS: string[]` y `costoUSD(uso, modelo, precios) → number`.
- Produce `eventos.mjs`: `emitir(evento, env) → void` (nunca lanza) y `leerEventos({ session? }, env) → object[]`.
- Produce `estado.mjs`:
  - `estadoVacio(session)`, `leerEstado(session, env)`, `guardarEstado(estado, env)`;
  - `conEstado(session, fn, env) → Promise<ret de fn>`: `fn` muta el estado y este se guarda al terminar;
  - `limpiarVencidas(estado, ahora, maxMs?)`.
  - `Estado = { session, fableUsados: number, activas: Record<id,{agente,meta,modelo,esfuerzo,inicio,agentId,lanzada?}>, costoUSD: number, modeloPrincipal: string|null }`
- Produce `hook-io.mjs`: `leerEntrada(stream) → Promise<object>`, `ejecutarHook(manejador, io?)`, `denegar(evento, motivo)`, `contexto(evento, texto)` y `esPrincipal(urlModulo, argv1?) → boolean`.
- Produce `campos.mjs`: `leer.{modeloPedido, esfuerzoPedido, tipoSubagente, meta, enSegundoPlano, transcriptSubagente}(entrada)`.

- [ ] **Paso 1: escribir los tests, que deben fallar**

`tests/lib-base.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { dirBase, rutaSesion, limpiarId, rutaConfig, rutaEventos } from '../plugins/orquestador/scripts/lib/rutas.mjs';
import { cargarConfig, CONFIG_DEFECTO } from '../plugins/orquestador/scripts/lib/config.mjs';
import { familia, costoUSD } from '../plugins/orquestador/scripts/lib/modelos.mjs';
import { emitir, leerEventos } from '../plugins/orquestador/scripts/lib/eventos.mjs';

const nuevoEnv = () => ({ ORQUESTADOR_HOME: mkdtempSync(join(tmpdir(), 'orq-')) });

test('dirBase respeta ORQUESTADOR_HOME y limpiarId evita rutas peligrosas', () => {
  const env = nuevoEnv();
  assert.equal(dirBase(env), env.ORQUESTADOR_HOME);
  assert.equal(limpiarId('../x'), '___x');
  assert.equal(limpiarId(undefined), 'sin-sesion');
  assert.equal(rutaSesion('abc', env), join(env.ORQUESTADOR_HOME, 'sessions', 'abc.json'));
});

test('cargarConfig: valores por defecto, merge con el usuario y JSON roto', () => {
  const env = nuevoEnv();
  assert.equal(cargarConfig(env).fableMaxPorSesion, 2);
  writeFileSync(rutaConfig(env), JSON.stringify({ fableMaxPorSesion: 5, precios: { haiku: { entrada: 9, salida: 9, cacheLectura: 9, cacheEscritura: 9 } } }));
  const c = cargarConfig(env);
  assert.equal(c.fableMaxPorSesion, 5);
  assert.equal(c.paraleloMax, 4);
  assert.equal(c.precios.haiku.entrada, 9);
  assert.equal(c.precios.opus.entrada, CONFIG_DEFECTO.precios.opus.entrada);
  writeFileSync(rutaConfig(env), '{roto');
  assert.equal(cargarConfig(env).fableMaxPorSesion, 2);
});

test('familia reconoce alias, IDs completos y heredado', () => {
  assert.equal(familia('claude-opus-5-5'), 'opus');
  assert.equal(familia('haiku'), 'haiku');
  assert.equal(familia('claude-fable-5-1'), 'fable');
  assert.equal(familia('inherit'), 'heredado');
  assert.equal(familia('heredado'), 'heredado');
  assert.equal(familia(undefined), 'desconocido');
});

test('costoUSD usa la tabla de precios por millón de tokens', () => {
  const precios = { sonnet: { entrada: 2, salida: 10, cacheLectura: 0.2, cacheEscritura: 2.5 } };
  const uso = { input_tokens: 1_000_000, output_tokens: 100_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  assert.equal(costoUSD(uso, 'claude-sonnet-5-5', precios), 3);
  assert.equal(costoUSD(uso, 'desconocido', precios), 0);
});

test('emitir agrega líneas; leerEventos filtra por sesión e ignora líneas rotas', () => {
  const env = nuevoEnv();
  emitir({ session: 'a', tipo: 'sesion' }, env);
  emitir({ session: 'b', tipo: 'sesion' }, env);
  appendFileSync(rutaEventos(env), 'no-json\n');
  const a = leerEventos({ session: 'a' }, env);
  assert.equal(a.length, 1);
  assert.equal(a[0].v, 1);
  assert.match(a[0].ts, /^\d{4}-/);
  assert.equal(leerEventos({}, env).length, 2);
});

test('emitir nunca lanza aunque la ruta sea inválida', () => {
  const env = nuevoEnv();
  mkdirSync(rutaEventos(env));          // un directorio donde debería ir el archivo
  assert.doesNotThrow(() => emitir({ session: 'x', tipo: 'sesion' }, env));
});
```

`tests/estado.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { conEstado, leerEstado, limpiarVencidas, estadoVacio } from '../plugins/orquestador/scripts/lib/estado.mjs';

const nuevoEnv = () => ({ ORQUESTADOR_HOME: mkdtempSync(join(tmpdir(), 'orq-')) });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

test('leerEstado devuelve el estado vacío si no hay archivo', () => {
  assert.deepEqual(leerEstado('s1', nuevoEnv()), estadoVacio('s1'));
});

test('conEstado serializa las escrituras concurrentes (no se pierden conteos)', async () => {
  const env = nuevoEnv();
  await Promise.all(Array.from({ length: 10 }, () =>
    conEstado('s1', async (e) => { const v = e.fableUsados; await esperar(5); e.fableUsados = v + 1; }, env)));
  assert.equal(leerEstado('s1', env).fableUsados, 10);
});

test('conEstado devuelve lo que devuelve fn', async () => {
  assert.equal(await conEstado('s2', () => 42, nuevoEnv()), 42);
});

test('limpiarVencidas elimina delegaciones de más de 2 horas', () => {
  const e = estadoVacio('s');
  e.activas.viejo = { inicio: 0 };
  e.activas.nuevo = { inicio: 3 * 3600e3 };
  limpiarVencidas(e, 3 * 3600e3);
  assert.deepEqual(Object.keys(e.activas), ['nuevo']);
});
```

`tests/hook-io.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { ejecutarHook, denegar, contexto, leerEntrada } from '../plugins/orquestador/scripts/lib/hook-io.mjs';

const salidaFalsa = () => { const s = { texto: '', write(t) { s.texto += t; } }; return s; };

test('leerEntrada parsea JSON y tolera entrada vacía o inválida', async () => {
  assert.deepEqual(await leerEntrada(Readable.from(['{"a":1}'])), { a: 1 });
  assert.deepEqual(await leerEntrada(Readable.from([''])), {});
  assert.deepEqual(await leerEntrada(Readable.from(['{x'])), {});
});

test('ejecutarHook escribe el resultado y sale con 0', async () => {
  const stdout = salidaFalsa(); let codigo;
  await ejecutarHook(async (e) => denegar('PreToolUse', `no ${e.x}`), { stdin: Readable.from(['{"x":"y"}']), stdout, salir: (c) => { codigo = c; } });
  assert.equal(codigo, 0);
  assert.deepEqual(JSON.parse(stdout.texto), { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'no y' } });
});

test('ejecutarHook ante un error propio no bloquea: sale con 0 y avisa', async () => {
  const stdout = salidaFalsa(); let codigo;
  await ejecutarHook(async () => { throw new Error('boom'); }, { stdin: Readable.from(['{}']), stdout, salir: (c) => { codigo = c; } });
  assert.equal(codigo, 0);
  assert.match(JSON.parse(stdout.texto).systemMessage, /boom/);
});

test('contexto anida additionalContext en hookSpecificOutput', () => {
  assert.deepEqual(contexto('SessionStart', 'hola'), { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'hola' } });
});
```

Ejecuta: `node --test`
Esperado: FALLAN las tres suites nuevas (módulos inexistentes).

- [ ] **Paso 2: implementar `rutas.mjs`**

```js
import { homedir } from 'node:os';
import { join } from 'node:path';

export function dirBase(env = process.env) {
  return env.ORQUESTADOR_HOME || join(homedir(), '.claude', 'orquestador');
}
export function limpiarId(id) {
  return String(id || 'sin-sesion').replace(/[^A-Za-z0-9_-]/g, '_');
}
export const rutaEventos = (env = process.env) => join(dirBase(env), 'events.jsonl');
export const rutaSesion = (id, env = process.env) => join(dirBase(env), 'sessions', `${limpiarId(id)}.json`);
export const rutaConfig = (env = process.env) => join(dirBase(env), 'config.json');
export const rutaRaizPlugin = (env = process.env) => join(dirBase(env), 'plugin-root.txt');
```

- [ ] **Paso 3: implementar `config.mjs`**

Los precios están en USD por millón de tokens y son la lista oficial de los modelos vigentes al 2026-10-06 (Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 5.5). La escritura de caché se toma como 1,25× la entrada. El usuario los puede editar en `config.json`.
```js
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { rutaConfig } from './rutas.mjs';

export const CONFIG_DEFECTO = Object.freeze({
  fableMaxPorSesion: 2,
  paraleloMax: 4,
  puertoDashboard: 4321,
  modelosOrquestador: ['opus', 'fable'],
  ramasProtegidas: ['main', 'master'],
  precios: {
    haiku: { entrada: 0.1, salida: 0.5, cacheLectura: 0.01, cacheEscritura: 0.125 },
    sonnet: { entrada: 2, salida: 10, cacheLectura: 0.2, cacheEscritura: 2.5 },
    opus: { entrada: 4, salida: 20, cacheLectura: 0.2, cacheEscritura: 5 },
    fable: { entrada: 10, salida: 50, cacheLectura: 0.25, cacheEscritura: 12.5 },
  },
});

export function cargarConfig(env = process.env) {
  try {
    const usuario = JSON.parse(readFileSync(rutaConfig(env), 'utf8'));
    return { ...CONFIG_DEFECTO, ...usuario, precios: { ...CONFIG_DEFECTO.precios, ...(usuario.precios ?? {}) } };
  } catch {
    return { ...CONFIG_DEFECTO };
  }
}

export function asegurarConfig(env = process.env) {
  const ruta = rutaConfig(env);
  if (existsSync(ruta)) return;
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, JSON.stringify(CONFIG_DEFECTO, null, 2) + '\n');
}
```

- [ ] **Paso 4: implementar `modelos.mjs`**

```js
const FAMILIAS = ['haiku', 'sonnet', 'opus', 'fable'];
export const ESFUERZOS = ['low', 'medium', 'high', 'xhigh', 'max'];

export function familia(modelo) {
  if (!modelo) return 'desconocido';
  const m = String(modelo).toLowerCase();
  if (m === 'inherit' || m === 'heredado') return 'heredado';
  return FAMILIAS.find((f) => m.includes(f)) ?? 'desconocido';
}

export function costoUSD(uso, modelo, precios) {
  const p = precios?.[familia(modelo)];
  if (!p || !uso) return 0;
  return ((uso.input_tokens ?? 0) * p.entrada
    + (uso.output_tokens ?? 0) * p.salida
    + (uso.cache_read_input_tokens ?? 0) * p.cacheLectura
    + (uso.cache_creation_input_tokens ?? 0) * p.cacheEscritura) / 1e6;
}
```

- [ ] **Paso 5: implementar `eventos.mjs`**

```js
import { appendFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { rutaEventos } from './rutas.mjs';

export function emitir(evento, env = process.env) {
  if (!evento) return;
  try {
    const ruta = rutaEventos(env);
    mkdirSync(dirname(ruta), { recursive: true });
    appendFileSync(ruta, JSON.stringify({ v: 1, ts: new Date().toISOString(), ...evento }) + '\n');
  } catch {
    // El log nunca bloquea ni rompe un hook.
  }
}

export function leerEventos({ session } = {}, env = process.env) {
  let texto;
  try { texto = readFileSync(rutaEventos(env), 'utf8'); } catch { return []; }
  const eventos = [];
  for (const linea of texto.split('\n')) {
    if (!linea.trim()) continue;
    try {
      const e = JSON.parse(linea);
      if (!session || e.session === session) eventos.push(e);
    } catch { /* línea corrupta: se ignora */ }
  }
  return eventos;
}
```

- [ ] **Paso 6: implementar `estado.mjs`**

```js
import { readFileSync, writeFileSync, renameSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { rutaSesion } from './rutas.mjs';

const ESPERA_MAX_MS = 3000;
const LOCK_VENCIDO_MS = 5000;
const DOS_HORAS = 2 * 3600e3;

export function estadoVacio(session) {
  return { session, fableUsados: 0, activas: {}, costoUSD: 0, modeloPrincipal: null };
}

export function leerEstado(session, env = process.env) {
  try {
    return { ...estadoVacio(session), ...JSON.parse(readFileSync(rutaSesion(session, env), 'utf8')) };
  } catch {
    return estadoVacio(session);
  }
}

export function guardarEstado(estado, env = process.env) {
  const ruta = rutaSesion(estado.session, env);
  mkdirSync(dirname(ruta), { recursive: true });
  const tmp = `${ruta}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(estado));
  renameSync(tmp, ruta);
}

async function tomarLock(lock) {
  const limite = Date.now() + ESPERA_MAX_MS;
  for (;;) {
    try { mkdirSync(lock); return; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        if (Date.now() - statSync(lock).mtimeMs > LOCK_VENCIDO_MS) { rmSync(lock, { recursive: true, force: true }); continue; }
      } catch { /* el lock desapareció entre medio: reintentar */ }
      if (Date.now() > limite) throw new Error('no se pudo tomar el lock del estado');
      await new Promise((r) => setTimeout(r, 10 + Math.random() * 15));
    }
  }
}

// Lee el estado, ejecuta fn (que lo muta), lo guarda y libera el lock. Devuelve lo que devuelva fn.
export async function conEstado(session, fn, env = process.env) {
  const lock = `${rutaSesion(session, env)}.lock`;
  mkdirSync(dirname(lock), { recursive: true });
  await tomarLock(lock);
  try {
    const estado = leerEstado(session, env);
    const resultado = await fn(estado);
    guardarEstado(estado, env);
    return resultado;
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

export function limpiarVencidas(estado, ahora = Date.now(), maxMs = DOS_HORAS) {
  for (const [id, a] of Object.entries(estado.activas)) {
    if (ahora - (a.inicio ?? 0) > maxMs) delete estado.activas[id];
  }
}
```

- [ ] **Paso 7: implementar `hook-io.mjs`**

```js
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function leerEntrada(stream = process.stdin) {
  let datos = '';
  stream.setEncoding?.('utf8');
  for await (const c of stream) datos += c;
  try { return JSON.parse(datos || '{}'); } catch { return {}; }
}

// Ejecuta un manejador de hook. Un error propio nunca bloquea: sale con 0 y avisa.
// Se usa exitCode en vez de process.exit(): en pipes de Windows stdout es asíncrono y exit() truncaría la respuesta.
export async function ejecutarHook(manejador, { stdin = process.stdin, stdout = process.stdout, salir = (c) => { process.exitCode = c; } } = {}) {
  let resultado;
  try {
    resultado = await manejador(await leerEntrada(stdin));
  } catch (e) {
    try { stdout.write(JSON.stringify({ systemMessage: `orquestador: un hook falló (${e.message}); se deja pasar.` })); } catch {}
    return salir(0);
  }
  if (resultado) stdout.write(JSON.stringify(resultado));
  return salir(0);
}

export const denegar = (evento, motivo) => ({
  hookSpecificOutput: { hookEventName: evento, permissionDecision: 'deny', permissionDecisionReason: motivo },
});

export const contexto = (evento, texto) => ({
  hookSpecificOutput: { hookEventName: evento, additionalContext: texto },
});

export function esPrincipal(urlModulo, argv1 = process.argv[1]) {
  if (!argv1) return false;
  const a = fileURLToPath(urlModulo);
  const b = resolve(argv1);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}
```

- [ ] **Paso 8: implementar `campos.mjs`**

Usa los nombres confirmados en `docs/specs/hallazgos-hooks.md`. Lo que sigue son los valores por defecto, que aplican si las sondas confirmaron los supuestos.
```js
// Acceso a los campos de entrada de los hooks. Fuente: docs/specs/hallazgos-hooks.md.
// Si una versión de Claude Code renombra un campo, se corrige solo aquí.
export const leer = {
  modeloPedido: (e) => e?.tool_input?.model ?? null,
  esfuerzoPedido: (e) => e?.tool_input?.effort ?? null,
  tipoSubagente: (e) => e?.tool_input?.subagent_type || 'general-purpose',
  meta: (e) => e?.tool_input?.description ?? '',
  enSegundoPlano: (e) => e?.tool_input?.run_in_background,
  transcriptSubagente: (e) => e?.agent_transcript_path ?? null,
};
```

- [ ] **Paso 9: correr los tests**

Ejecuta: `node --test`
Esperado: PASAN todos.

- [ ] **Paso 10: commit**

```bash
git add plugins/orquestador/scripts/lib tests
git commit -m "feat: librerías base de estado, eventos, config y modelos"
```

---

### Tarea 4: `pre-agent`, que registra las delegaciones y aplica los topes de Fable y paralelismo

**Archivos:**
- Crear: `plugins/orquestador/scripts/lib/agentes.mjs`, `plugins/orquestador/scripts/pre-agent.mjs`
- Modificar: `plugins/orquestador/hooks/hooks.json`
- Test: `tests/pre-agent.test.mjs`

**Interfaces:**
- Consume: `conEstado`, `limpiarVencidas` (estado), `cargarConfig`, `emitir`, `familia`, `leer.*` (campos), `ejecutarHook`, `denegar` y `esPrincipal`.
- Produce: `nombreBase(agentType) → string`, `buscarDefinicion(agentType, { raizPlugin, cwd, home }) → { ruta, name, model, effort, color, persona } | null` y `extraerPersona(cuerpo) → string|null`.
- Produce: `decidirDelegacion(entrada, estado, config, definicion) → { evento, denegar?: string }`. Muta `estado` solo cuando permite la delegación.
- Produce: `manejar(entrada, env) → Promise<salidaHook|null>`.
- Produce: `estado.activas[tool_use_id] = { agente, meta, modelo, esfuerzo, inicio, agentId: null }`.

- [ ] **Paso 1: escribir los tests, que deben fallar**

`tests/pre-agent.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decidirDelegacion, manejar } from '../plugins/orquestador/scripts/pre-agent.mjs';
import { buscarDefinicion, nombreBase } from '../plugins/orquestador/scripts/lib/agentes.mjs';
import { estadoVacio, leerEstado } from '../plugins/orquestador/scripts/lib/estado.mjs';
import { CONFIG_DEFECTO } from '../plugins/orquestador/scripts/lib/config.mjs';
import { leerEventos } from '../plugins/orquestador/scripts/lib/eventos.mjs';
import { rutaConfig } from '../plugins/orquestador/scripts/lib/rutas.mjs';

const SCRIPT = fileURLToPath(new URL('../plugins/orquestador/scripts/pre-agent.mjs', import.meta.url));
const nuevoEnv = () => ({ ORQUESTADOR_HOME: mkdtempSync(join(tmpdir(), 'orq-')) });
const entrada = (ti, id = 'tu1') => ({ session_id: 's', tool_name: 'Agent', tool_use_id: id, cwd: tmpdir(), tool_input: { subagent_type: 'investigador-rl', description: 'Diseñar ablation', prompt: 'x', ...ti } });

test('nombreBase quita el prefijo del plugin', () => {
  assert.equal(nombreBase('orquestador:investigador-rl'), 'investigador-rl');
  assert.equal(nombreBase('general-purpose'), 'general-purpose');
});

test('buscarDefinicion: agente de proyecto con persona; prefijo de plugin; nombre inválido', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'orq-proy-'));
  mkdirSync(join(cwd, '.claude', 'agents'), { recursive: true });
  writeFileSync(join(cwd, '.claude', 'agents', 'eco.md'), '---\nname: eco\nmodel: sonnet\neffort: low\ncolor: cyan\n---\nPersona: Lacónico.\n');
  const d = buscarDefinicion('eco', { cwd, home: cwd });
  assert.equal(d.model, 'sonnet');
  assert.equal(d.persona, 'Lacónico.');
  const raizPlugin = mkdtempSync(join(tmpdir(), 'orq-plug-'));
  mkdirSync(join(raizPlugin, 'agents'));
  writeFileSync(join(raizPlugin, 'agents', 'eco.md'), '---\nname: eco\nmodel: opus\neffort: high\n---\nPersona: Otro.\n');
  assert.equal(buscarDefinicion('orquestador:eco', { raizPlugin, cwd, home: cwd }).model, 'opus');
  assert.equal(buscarDefinicion('../x', { cwd, home: cwd }), null);
  assert.equal(buscarDefinicion('general-purpose', { cwd, home: cwd }), null);
});

test('modelo explícito gana al frontmatter y queda registrado', () => {
  const e = estadoVacio('s');
  const r = decidirDelegacion(entrada({ model: 'haiku', effort: 'low' }), e, CONFIG_DEFECTO, { model: 'opus', effort: 'high', color: 'purple', persona: 'Escéptico' });
  assert.equal(r.denegar, undefined);
  assert.equal(r.evento.tipo, 'delegacion');
  assert.equal(r.evento.modelo, 'haiku');
  assert.equal(r.evento.origenModelo, 'explicito');
  assert.equal(r.evento.meta, 'Diseñar ablation');
  assert.equal(r.evento.persona, 'Escéptico');
  assert.equal(e.activas.tu1.esfuerzo, 'low');
});

test('sin modelo explícito usa el frontmatter; con inherit usa el modelo principal', () => {
  const e = estadoVacio('s');
  assert.equal(decidirDelegacion(entrada({}), e, CONFIG_DEFECTO, { model: 'opus', effort: 'high' }).evento.origenModelo, 'frontmatter');
  e.modeloPrincipal = 'opus';
  const r = decidirDelegacion(entrada({}, 'tu2'), e, CONFIG_DEFECTO, { model: 'inherit' });
  assert.equal(r.evento.modelo, 'opus');
  assert.equal(r.evento.origenModelo, 'heredado');
});

test('tope de Fable: la tercera delegación a fable se niega', () => {
  const e = estadoVacio('s');
  decidirDelegacion(entrada({ model: 'fable' }, 'a'), e, CONFIG_DEFECTO, null);
  decidirDelegacion(entrada({ model: 'fable' }, 'b'), e, CONFIG_DEFECTO, null);
  const r = decidirDelegacion(entrada({ model: 'fable' }, 'c'), e, CONFIG_DEFECTO, null);
  assert.match(r.denegar, /Tope de Fable/);
  assert.equal(r.evento.tipo, 'bloqueo');
  assert.equal(r.evento.regla, 'tope-fable');
  assert.equal(e.fableUsados, 2);
  assert.equal(e.activas.c, undefined);
});

test('heredar Fable del orquestador cuenta para el tope', () => {
  const e = estadoVacio('s');
  e.modeloPrincipal = 'fable';
  decidirDelegacion(entrada({}, 'a'), e, { ...CONFIG_DEFECTO, fableMaxPorSesion: 1 }, null);
  const r = decidirDelegacion(entrada({}, 'b'), e, { ...CONFIG_DEFECTO, fableMaxPorSesion: 1 }, null);
  assert.match(r.denegar, /Tope de Fable/);
});

test('tope de paralelismo', () => {
  const e = estadoVacio('s');
  const config = { ...CONFIG_DEFECTO, paraleloMax: 2 };
  decidirDelegacion(entrada({ model: 'haiku' }, 'a'), e, config, null);
  decidirDelegacion(entrada({ model: 'haiku' }, 'b'), e, config, null);
  const r = decidirDelegacion(entrada({ model: 'haiku' }, 'c'), e, config, null);
  assert.equal(r.evento.regla, 'paralelo');
  assert.match(r.denegar, /en paralelo/);
});

test('manejar: dos Fable simultáneos con tope 1 → exactamente uno pasa', async () => {
  const env = nuevoEnv();
  writeFileSync(rutaConfig(env), JSON.stringify({ fableMaxPorSesion: 1 }));
  const [r1, r2] = await Promise.all([manejar(entrada({ model: 'fable' }, 'x'), env), manejar(entrada({ model: 'fable' }, 'y'), env)]);
  assert.equal([r1, r2].filter(Boolean).length, 1);
  assert.equal(leerEstado('s', env).fableUsados, 1);
  assert.deepEqual(leerEventos({ session: 's' }, env).map((e) => e.tipo).sort(), ['bloqueo', 'delegacion']);
});

test('el script responde por stdout a una entrada real', () => {
  const env = { ...process.env, ...nuevoEnv() };
  const r = spawnSync(process.execPath, [SCRIPT], { input: JSON.stringify(entrada({ model: 'haiku' })), env, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
  assert.equal(leerEventos({ session: 's' }, env)[0].modelo, 'haiku');
});
```

Ejecuta: `node --test tests/pre-agent.test.mjs`
Esperado: FALLA (módulos inexistentes).

- [ ] **Paso 2: implementar `lib/agentes.mjs`**

```js
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
```

- [ ] **Paso 3: implementar `pre-agent.mjs`**

```js
#!/usr/bin/env node
// PreToolUse(Agent|Task): registra la delegación y aplica los topes de Fable y paralelismo.
import { fileURLToPath } from 'node:url';
import { cargarConfig } from './lib/config.mjs';
import { conEstado, limpiarVencidas } from './lib/estado.mjs';
import { emitir } from './lib/eventos.mjs';
import { familia } from './lib/modelos.mjs';
import { leer } from './lib/campos.mjs';
import { buscarDefinicion } from './lib/agentes.mjs';
import { ejecutarHook, denegar, esPrincipal } from './lib/hook-io.mjs';

const RAIZ_PLUGIN = fileURLToPath(new URL('..', import.meta.url));

export function decidirDelegacion(entrada, estado, config, definicion) {
  const agente = leer.tipoSubagente(entrada);
  const id = entrada.tool_use_id ?? `sin-id-${Date.now()}`;
  const base = { session: entrada.session_id, id, agente };
  const pedido = leer.modeloPedido(entrada);
  const delFrontmatter = definicion?.model && definicion.model !== 'inherit' ? definicion.model : null;
  const modelo = pedido ?? delFrontmatter ?? estado.modeloPrincipal ?? 'heredado';
  const origenModelo = pedido ? 'explicito' : delFrontmatter ? 'frontmatter' : 'heredado';
  const esfuerzo = leer.esfuerzoPedido(entrada) ?? definicion?.effort ?? 'heredado';

  if (familia(modelo) === 'fable' && estado.fableUsados >= config.fableMaxPorSesion) {
    const motivo = `[orquestador] Tope de Fable alcanzado (${estado.fableUsados}/${config.fableMaxPorSesion} en esta sesión). `
      + 'Usa opus con effort xhigh, o pide al usuario subir fableMaxPorSesion en ~/.claude/orquestador/config.json.';
    return { denegar: motivo, evento: { ...base, tipo: 'bloqueo', regla: 'tope-fable', motivo } };
  }
  const activas = Object.keys(estado.activas).length;
  if (activas >= config.paraleloMax) {
    const motivo = `[orquestador] Ya hay ${activas} subagentes en paralelo (máximo ${config.paraleloMax}). Espera a que terminen.`;
    return { denegar: motivo, evento: { ...base, tipo: 'bloqueo', regla: 'paralelo', motivo } };
  }
  const meta = leer.meta(entrada);
  estado.activas[id] = { agente, meta, modelo, esfuerzo, inicio: Date.now(), agentId: null };
  if (familia(modelo) === 'fable') estado.fableUsados += 1;
  return {
    evento: { ...base, tipo: 'delegacion', meta, modelo, esfuerzo, origenModelo,
      persona: definicion?.persona ?? null, color: definicion?.color ?? null },
  };
}

export async function manejar(entrada, env = process.env) {
  const config = cargarConfig(env);
  const definicion = buscarDefinicion(leer.tipoSubagente(entrada), { raizPlugin: RAIZ_PLUGIN, cwd: entrada.cwd });
  const r = await conEstado(entrada.session_id, (estado) => {
    limpiarVencidas(estado);
    return decidirDelegacion(entrada, estado, config, definicion);
  }, env);
  emitir(r.evento, env);
  return r.denegar ? denegar('PreToolUse', r.denegar) : null;
}

if (esPrincipal(import.meta.url)) ejecutarHook((e) => manejar(e));
```

- [ ] **Paso 4: registrar el hook en `hooks.json`**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Agent|Task",
        "hooks": [{ "type": "command", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/pre-agent.mjs"], "timeout": 10 }]
      }
    ]
  }
}
```

- [ ] **Paso 5: correr los tests**

Ejecuta: `node --test`
Esperado: PASAN todos.

- [ ] **Paso 6: commit**

```bash
git add plugins/orquestador tests/pre-agent.test.mjs
git commit -m "feat: hook pre-agent con registro de delegaciones y topes de fable y paralelismo"
```

---

### Tarea 5: `subagent-start`, `subagent-stop` y `post-agent`, para el modelo real, el costo y las alertas

**Archivos:**
- Crear: `plugins/orquestador/scripts/subagent-start.mjs`, `subagent-stop.mjs`, `post-agent.mjs`
- Modificar: `plugins/orquestador/hooks/hooks.json`
- Test: `tests/subagentes.test.mjs`

**Interfaces:**
- Consume: lo de la Tarea 3, `nombreBase` (Tarea 4) y `estado.activas` tal como lo deja la Tarea 4.
- Produce: `asignarAgente(entrada, estado, ahora?) → { evento|null }`.
- Produce: `extraerUso(texto, precios) → { modeloReal: string|null, modelos: string[], uso: {input_tokens,output_tokens,cache_read_input_tokens,cache_creation_input_tokens}, costoUSD: number }`.
- Produce: `cerrarDelegacion(entrada, estado, analisis, ahora?) → { eventos: object[], alerta: string|null }`.
- Produce: `cerrarSincrona(entrada, estado, ahora?) → { evento|null }`.

- [ ] **Paso 1: escribir los tests, que deben fallar**

`tests/subagentes.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asignarAgente } from '../plugins/orquestador/scripts/subagent-start.mjs';
import { extraerUso, cerrarDelegacion, manejar as manejarStop } from '../plugins/orquestador/scripts/subagent-stop.mjs';
import { cerrarSincrona } from '../plugins/orquestador/scripts/post-agent.mjs';
import { estadoVacio, guardarEstado, leerEstado } from '../plugins/orquestador/scripts/lib/estado.mjs';
import { CONFIG_DEFECTO } from '../plugins/orquestador/scripts/lib/config.mjs';
import { leerEventos } from '../plugins/orquestador/scripts/lib/eventos.mjs';

const conActiva = (extra = {}) => {
  const e = estadoVacio('s');
  e.activas.tu1 = { agente: 'orquestador:investigador-rl', meta: 'm', modelo: 'haiku', esfuerzo: 'low', inicio: 1000, agentId: null, ...extra };
  return e;
};
const transcript = (modelo) => [
  { type: 'assistant', message: { id: 'm1', model: modelo, usage: { input_tokens: 1000, output_tokens: 100 } } },
  { type: 'assistant', message: { id: 'm1', model: modelo, usage: { input_tokens: 1000, output_tokens: 100 } } },
  { type: 'assistant', message: { id: 'm2', model: modelo, usage: { input_tokens: 500, output_tokens: 50, cache_read_input_tokens: 200 } } },
  { type: 'assistant', message: { id: 'm3', model: '<synthetic>' } },
].map((x) => JSON.stringify(x)).join('\n');

test('asignarAgente vincula agent_id con la delegación pendiente más antigua del mismo tipo', () => {
  const e = conActiva();
  e.activas.tu2 = { agente: 'investigador-rl', inicio: 2000, agentId: null };
  assert.equal(asignarAgente({ agent_id: 'a1', agent_type: 'orquestador:investigador-rl' }, e).evento, null);
  assert.equal(e.activas.tu1.agentId, 'a1');
  assert.equal(e.activas.tu2.agentId, null);
});

test('asignarAgente sin delegación previa crea una entrada externa', () => {
  const e = estadoVacio('s');
  const r = asignarAgente({ agent_id: 'a9', agent_type: 'Explore' }, e, 5);
  assert.equal(r.evento.origenModelo, 'externo');
  assert.equal(e.activas['agente-a9'].agentId, 'a9');
});

test('extraerUso deduplica por id de mensaje, ignora <synthetic> y calcula el costo', () => {
  const r = extraerUso(transcript('claude-haiku-5-5'), CONFIG_DEFECTO.precios);
  assert.equal(r.modeloReal, 'claude-haiku-5-5');
  assert.deepEqual(r.uso, { input_tokens: 1500, output_tokens: 150, cache_read_input_tokens: 200, cache_creation_input_tokens: 0 });
  assert.ok(Math.abs(r.costoUSD - (1500 * 0.1 + 150 * 0.5 + 200 * 0.01) / 1e6) < 1e-12);
});

test('cerrarDelegacion: modelo correcto → fin sin alerta', () => {
  const e = conActiva({ agentId: 'a1' });
  const r = cerrarDelegacion({ agent_id: 'a1', agent_type: 'orquestador:investigador-rl' }, e, extraerUso(transcript('claude-haiku-5-5'), CONFIG_DEFECTO.precios), 4000);
  assert.deepEqual(r.eventos.map((x) => x.tipo), ['fin']);
  assert.equal(r.eventos[0].duracionMs, 3000);
  assert.equal(r.eventos[0].tokensIn, 1700);
  assert.equal(r.alerta, null);
  assert.deepEqual(e.activas, {});
});

test('cerrarDelegacion: modelo distinto → alerta', () => {
  const e = conActiva({ agentId: 'a1' });
  const r = cerrarDelegacion({ agent_id: 'a1' }, e, extraerUso(transcript('claude-opus-5-5'), CONFIG_DEFECTO.precios));
  assert.deepEqual(r.eventos.map((x) => x.tipo), ['fin', 'alerta']);
  assert.match(r.alerta, /se pidió haiku pero corrió claude-opus-5-5/);
});

test('cerrarDelegacion sin agentId asignado cierra la más antigua del mismo tipo', () => {
  const e = conActiva();
  const r = cerrarDelegacion({ agent_id: 'zz', agent_type: 'investigador-rl' }, e, null);
  assert.equal(r.eventos[0].id, 'tu1');
  assert.equal(r.eventos[0].modeloReal, null);
});

test('cerrarSincrona: en segundo plano solo marca; en primer plano cierra', () => {
  const e = conActiva();
  assert.equal(cerrarSincrona({ tool_use_id: 'tu1', tool_input: {} }, e).evento, null);
  assert.equal(e.activas.tu1.lanzada, true);
  const r = cerrarSincrona({ tool_use_id: 'tu1', tool_input: { run_in_background: false } }, e, 1500);
  assert.equal(r.evento.tipo, 'fin');
  assert.deepEqual(e.activas, {});
});

test('manejar (stop) lee el transcript, emite eventos y devuelve systemMessage ante mismatch', async () => {
  const env = { ORQUESTADOR_HOME: mkdtempSync(join(tmpdir(), 'orq-')) };
  guardarEstado(conActiva({ agentId: 'a1' }), env);
  const ruta = join(env.ORQUESTADOR_HOME, 't.jsonl');
  writeFileSync(ruta, transcript('claude-sonnet-5-5'));
  const salida = await manejarStop({ session_id: 's', agent_id: 'a1', agent_transcript_path: ruta }, env);
  assert.match(salida.systemMessage, /corrió claude-sonnet-5-5/);
  assert.deepEqual(leerEventos({ session: 's' }, env).map((x) => x.tipo), ['fin', 'alerta']);
  assert.ok(leerEstado('s', env).costoUSD > 0);
});
```

Ejecuta: `node --test tests/subagentes.test.mjs`
Esperado: FALLA.

- [ ] **Paso 2: implementar `subagent-start.mjs`**

```js
#!/usr/bin/env node
// SubagentStart: vincula agent_id con la delegación registrada por pre-agent.
import { conEstado } from './lib/estado.mjs';
import { emitir } from './lib/eventos.mjs';
import { nombreBase } from './lib/agentes.mjs';
import { ejecutarHook, esPrincipal } from './lib/hook-io.mjs';

export function asignarAgente(entrada, estado, ahora = Date.now()) {
  const tipo = nombreBase(entrada.agent_type);
  const candidatas = Object.values(estado.activas)
    .filter((a) => !a.agentId && nombreBase(a.agente) === tipo)
    .sort((x, y) => x.inicio - y.inicio);
  if (candidatas.length) {
    candidatas[0].agentId = entrada.agent_id;
    return { evento: null };
  }
  const id = `agente-${entrada.agent_id}`;
  const agente = entrada.agent_type ?? 'desconocido';
  estado.activas[id] = { agente, meta: '', modelo: 'desconocido', esfuerzo: 'desconocido', inicio: ahora, agentId: entrada.agent_id };
  return { evento: { tipo: 'delegacion', session: estado.session, id, agente, meta: '', modelo: 'desconocido', esfuerzo: 'desconocido', origenModelo: 'externo' } };
}

export async function manejar(entrada, env = process.env) {
  const { evento } = await conEstado(entrada.session_id, (e) => asignarAgente(entrada, e), env);
  emitir(evento, env);
  return null;
}

if (esPrincipal(import.meta.url)) ejecutarHook((e) => manejar(e));
```

- [ ] **Paso 3: implementar `subagent-stop.mjs`**

```js
#!/usr/bin/env node
// SubagentStop: lee el transcript del subagente, registra modelo real y costo, y alerta si no coincide.
import { readFileSync } from 'node:fs';
import { cargarConfig } from './lib/config.mjs';
import { conEstado } from './lib/estado.mjs';
import { emitir } from './lib/eventos.mjs';
import { familia, costoUSD } from './lib/modelos.mjs';
import { leer } from './lib/campos.mjs';
import { nombreBase } from './lib/agentes.mjs';
import { ejecutarHook, esPrincipal } from './lib/hook-io.mjs';

const CAMPOS_USO = ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'];

export function extraerUso(texto, precios) {
  const porMensaje = new Map();
  for (const linea of String(texto ?? '').split('\n')) {
    if (!linea.trim()) continue;
    let e;
    try { e = JSON.parse(linea); } catch { continue; }
    const msg = e?.message;
    if (e?.type !== 'assistant' || !msg?.model || msg.model === '<synthetic>') continue;
    porMensaje.set(msg.id ?? `sin-id-${porMensaje.size}`, { modelo: msg.model, uso: msg.usage ?? {} });
  }
  const uso = Object.fromEntries(CAMPOS_USO.map((k) => [k, 0]));
  const conteo = {};
  let costo = 0;
  for (const { modelo, uso: u } of porMensaje.values()) {
    conteo[modelo] = (conteo[modelo] ?? 0) + 1;
    for (const k of CAMPOS_USO) uso[k] += u[k] ?? 0;
    costo += costoUSD(u, modelo, precios);
  }
  const modeloReal = Object.entries(conteo).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { modeloReal, modelos: Object.keys(conteo), uso, costoUSD: costo };
}

export function cerrarDelegacion(entrada, estado, analisis, ahora = Date.now()) {
  let id = Object.keys(estado.activas).find((k) => estado.activas[k].agentId === entrada.agent_id);
  if (!id) {
    const tipo = nombreBase(entrada.agent_type);
    id = Object.keys(estado.activas)
      .filter((k) => nombreBase(estado.activas[k].agente) === tipo)
      .sort((x, y) => estado.activas[x].inicio - estado.activas[y].inicio)[0];
  }
  if (!id) return { eventos: [], alerta: null };
  const a = estado.activas[id];
  delete estado.activas[id];
  const u = analisis?.uso ?? {};
  const fin = {
    tipo: 'fin', session: estado.session, id, agentId: entrada.agent_id, agente: a.agente,
    modeloReal: analisis?.modeloReal ?? null,
    tokensIn: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    tokensOut: u.output_tokens ?? 0,
    costoUSD: analisis?.costoUSD ?? 0,
    duracionMs: ahora - a.inicio,
    ok: true,
  };
  estado.costoUSD += fin.costoUSD;
  const eventos = [fin];
  const esperado = familia(a.modelo);
  let alerta = null;
  if (fin.modeloReal && !['heredado', 'desconocido'].includes(esperado) && familia(fin.modeloReal) !== esperado) {
    alerta = `⚠ ${a.agente}: se pidió ${a.modelo} pero corrió ${fin.modeloReal}`;
    eventos.push({ tipo: 'alerta', session: estado.session, id, agente: a.agente, esperado: a.modelo, real: fin.modeloReal, mensaje: alerta });
  }
  return { eventos, alerta };
}

export async function manejar(entrada, env = process.env) {
  const config = cargarConfig(env);
  const ruta = leer.transcriptSubagente(entrada);
  let analisis = null;
  if (ruta) { try { analisis = extraerUso(readFileSync(ruta, 'utf8'), config.precios); } catch { /* sin transcript legible */ } }
  const r = await conEstado(entrada.session_id, (e) => cerrarDelegacion(entrada, e, analisis), env);
  for (const ev of r.eventos) emitir(ev, env);
  return r.alerta ? { systemMessage: `[orquestador] ${r.alerta}` } : null;
}

if (esPrincipal(import.meta.url)) ejecutarHook((e) => manejar(e));
```

- [ ] **Paso 4: implementar `post-agent.mjs`**

```js
#!/usr/bin/env node
// PostToolUse(Agent|Task): respaldo. En segundo plano el tool vuelve al lanzar, así que solo se marca;
// en primer plano, si SubagentStop no cerró la delegación, se cierra aquí sin datos de modelo.
import { conEstado } from './lib/estado.mjs';
import { emitir } from './lib/eventos.mjs';
import { leer } from './lib/campos.mjs';
import { ejecutarHook, esPrincipal } from './lib/hook-io.mjs';

export function cerrarSincrona(entrada, estado, ahora = Date.now()) {
  const id = entrada.tool_use_id;
  const a = id ? estado.activas[id] : null;
  if (!a) return { evento: null };
  if (leer.enSegundoPlano(entrada) !== false) { a.lanzada = true; return { evento: null }; }
  delete estado.activas[id];
  return { evento: { tipo: 'fin', session: estado.session, id, agente: a.agente, modeloReal: null,
    tokensIn: 0, tokensOut: 0, costoUSD: 0, duracionMs: ahora - a.inicio, ok: true } };
}

export async function manejar(entrada, env = process.env) {
  const { evento } = await conEstado(entrada.session_id, (e) => cerrarSincrona(entrada, e), env);
  emitir(evento, env);
  return null;
}

if (esPrincipal(import.meta.url)) ejecutarHook((e) => manejar(e));
```

- [ ] **Paso 5: registrar los hooks**

En `hooks.json`, agrega estas claves al objeto `hooks`, junto a `PreToolUse`:
```json
"PostToolUse": [
  { "matcher": "Agent|Task", "hooks": [{ "type": "command", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/post-agent.mjs"], "timeout": 10 }] }
],
"SubagentStart": [
  { "hooks": [{ "type": "command", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/subagent-start.mjs"], "timeout": 10 }] }
],
"SubagentStop": [
  { "hooks": [{ "type": "command", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/subagent-stop.mjs"], "timeout": 15 }] }
]
```

- [ ] **Paso 6: correr los tests**

Ejecuta: `node --test`
Esperado: PASAN todos.

- [ ] **Paso 7: commit**

```bash
git add plugins/orquestador tests/subagentes.test.mjs
git commit -m "feat: verificación del modelo real, costo y alertas por subagente"
```

---

### Tarea 6: reglas git, `git-guard` y git hooks de respaldo

**Archivos:**
- Crear: `plugins/orquestador/scripts/git-hooks/reglas-git.mjs`, `git-hooks/commit-msg.mjs`, `git-hooks/pre-push.mjs`, `plugins/orquestador/scripts/git-guard.mjs`
- Modificar: `plugins/orquestador/hooks/hooks.json`
- Test: `tests/reglas-git.test.mjs`, `tests/git-hooks.test.mjs`

**Interfaces:**
- Produce desde `reglas-git.mjs`, que **solo importa `node:*`** porque se copia a `.git/hooks`:
  - `RAMAS_PROTEGIDAS_DEFECTO`;
  - `esConventional(linea) → boolean`;
  - `contieneAtribucion(texto) → boolean`;
  - `enmascarar(texto) → string`, del mismo largo que la entrada;
  - `evaluarComando(comando, ctx) → { regla, motivo } | null`.
- Contexto: `ctx = { cwd, ramasProtegidas?, ramaActual(dir) → string, esRama(dir, nombre) → boolean, leerArchivo(ruta) → string }`.
- Produce: `git-guard.mjs#manejar(entrada, env, ctx?) → salidaHook|null`.

- [ ] **Paso 1: escribir los tests de reglas, que deben fallar**

`tests/reglas-git.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basename } from 'node:path';
import { evaluarComando, esConventional, contieneAtribucion, enmascarar } from '../plugins/orquestador/scripts/git-hooks/reglas-git.mjs';

const ctx = (rama = 'feat/a', { archivos = {}, ramas = ['main', 'feat/a'] } = {}) => ({
  cwd: '/repo',
  ramaActual: (dir) => (dir.endsWith('otro repo') ? 'main' : rama),
  esRama: (_d, n) => ramas.includes(n),
  leerArchivo: (r) => { const t = archivos[basename(r)]; if (t === undefined) throw new Error('no'); return t; },
});
const regla = (cmd, c = ctx()) => evaluarComando(cmd, c)?.regla ?? null;

const HEREDOC_OK = `git commit -m "$(cat <<'EOF'\nfix: no se cae cuando falta config\n\nQue no explote si 'x' no existe.\nEOF\n)"`;
const HEREDOC_IA = `git commit -m "$(cat <<'EOF'\nfeat: algo\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nEOF\n)"`;
const PS_OK = "git commit -m @'\nfix: arregla el parser\n\ndetalle\n'@";
const PS_MAL = "git commit -m @'\narreglos varios\n'@";

test('esConventional y exentos', () => {
  assert.ok(esConventional('feat(cli): agrega flag'));
  assert.ok(esConventional('fix!: rompe api'));
  assert.ok(esConventional("Merge branch 'x'"));
  assert.ok(!esConventional('agrega cosas'));
  assert.ok(!esConventional('feat:sin espacio'));
});

test('contieneAtribucion', () => {
  assert.ok(contieneAtribucion('Co-Authored-By: Claude <noreply@anthropic.com>'));
  assert.ok(contieneAtribucion('🤖 Generated with [Claude Code](https://claude.com/claude-code)'));
  assert.ok(!contieneAtribucion('Co-Authored-By: Ana <ana@x.cl>'));
});

test('enmascarar conserva el largo y oculta comillas y heredocs', () => {
  const t = `echo "git push origin main" && ${HEREDOC_OK}`;
  const m = enmascarar(t);
  assert.equal(m.length, t.length);
  assert.ok(!m.includes('push origin'));
  assert.ok(!m.includes('no se cae'));
  assert.ok(m.includes('git commit'));
});

const casos = [
  ['commit en main', 'git commit -m "feat: x"', ctx('main'), 'commit-en-protegida'],
  ['commit en rama ok', 'git commit -m "feat: x"', ctx(), null],
  ['no conventional', 'git commit -m "agrega cosas"', ctx(), 'conventional'],
  ['heredoc con coautoría', HEREDOC_IA, ctx(), 'atribucion'],
  ['heredoc conventional con apóstrofo', HEREDOC_OK, ctx(), null],
  ['here-string PowerShell ok', PS_OK, ctx(), null],
  ['here-string PowerShell no conventional', PS_MAL, ctx(), 'conventional'],
  ['--no-verify en commit', 'git commit --no-verify -m "fix: a"', ctx(), 'no-verify'],
  ['-n combinado en commit', 'git commit -nm "fix: a"', ctx(), 'no-verify'],
  ['flags dentro del mensaje no cuentan', 'git commit -m "docs: explicar --no-verify y git push origin main"', ctx(), null],
  ['crear rama y commitear desde main (&&)', 'git checkout -b feat/x && git commit -m "feat: x"', ctx('main'), null],
  ['switch -c y commit (;) desde main', 'git switch -c feat/x; git commit -m "feat: x"', ctx('main'), null],
  ['checkout de archivo no cambia rama', 'git checkout README.md && git commit -m "fix: x"', ctx('main'), 'commit-en-protegida'],
  ['checkout a rama existente', 'git checkout feat/a && git commit -m "fix: x"', ctx('main'), null],
  ['-C a otro repo en main', 'git -C "otro repo" commit -m "feat: x"', ctx(), 'commit-en-protegida'],
  ['-F con coautoría', 'git commit -F msg.txt', ctx('feat/a', { archivos: { 'msg.txt': 'chore: x\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n' } }), 'atribucion'],
  ['-F conventional', 'git commit -F msg.txt', ctx('feat/a', { archivos: { 'msg.txt': 'chore: x\n' } }), null],
  ['amend sin mensaje', 'git commit --amend --no-edit', ctx(), null],
  ['merge commit', `git commit -m "Merge branch 'x'"`, ctx(), null],
  ['push de la rama', 'git push -u origin feat/a', ctx(), null],
  ['push HEAD:main', 'git push origin HEAD:main', ctx(), 'push-a-protegida'],
  ['push estando en main', 'git push', ctx('main'), 'push-a-protegida'],
  ['force a main', 'git push --force origin main', ctx(), 'force-push'],
  ['force a rama propia', 'git push -f', ctx(), null],
  ['borrar main remoto', 'git push origin --delete main', ctx(), 'push-a-protegida'],
  ['borrar con :main', 'git push origin :main', ctx(), 'push-a-protegida'],
  ['--no-verify en push', 'git push --no-verify', ctx(), 'no-verify'],
  ['push --all', 'git push --all', ctx(), 'push-a-protegida'],
  ['push --tags estando en main', 'git push --tags', ctx('main'), null],
  ['merge sin squash', 'gh pr merge 3', ctx(), 'merge-sin-squash'],
  ['merge con squash', 'gh pr merge 3 --squash --delete-branch', ctx(), null],
  ['merge --admin', 'gh pr merge 3 --squash --admin', ctx(), 'merge-admin'],
  ['pr con atribución', 'gh pr create --title "feat: algo" --body "🤖 Generated with [Claude Code](https://claude.com/claude-code)"', ctx(), 'atribucion'],
  ['pr con título no conventional', 'gh pr create --title "Agrega cosas" --body "x"', ctx(), 'conventional'],
  ['pr con body-file limpio', 'gh pr create --title "feat: x" --body-file cuerpo.md', ctx('feat/a', { archivos: { 'cuerpo.md': 'Resumen\n' } }), null],
  ['comando sin git', 'ls -la', ctx('main'), null],
  ['git dentro de un echo', 'echo "git push origin main"', ctx('main'), null],
];

for (const [nombre, cmd, c, esperado] of casos) {
  test(`evaluarComando: ${nombre}`, () => assert.equal(regla(cmd, c), esperado));
}
```

Ejecuta: `node --test tests/reglas-git.test.mjs`
Esperado: FALLA (módulo inexistente).

- [ ] **Paso 2: implementar `git-hooks/reglas-git.mjs`**

```js
// Reglas git del orquestador. Autocontenido (solo node:*): /orquestador:setup lo copia a .git/hooks/orquestador/.
import { resolve } from 'node:path';

export const RAMAS_PROTEGIDAS_DEFECTO = ['main', 'master'];
const RE_CONVENTIONAL = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]+\))?!?: \S.*/;
const RE_EXENTOS = /^(Merge |Revert "|fixup! |squash! )/;
const RE_ATRIBUCION = /co-authored-by:[^\n]*(claude|anthropic)|noreply@anthropic\.com|generated with \[?claude/i;
const RE_HEREDOC = /<<-?\s*(['"]?)(\w+)\1[^\n]*\n([\s\S]*?)\n\s*\2(?=\s|$|\))/;
const RE_HERESTRING = /@(['"])\r?\n([\s\S]*?)\r?\n\1@/;
const RE_OPS = /\b(git)((?:\s+-C\s+(?:"[^"]*"|'[^']*'|\S+))*)\s+(commit|push|checkout|switch)\b|\b(gh)\s+pr\s+(create|edit|merge)\b/g;
const SEPARADORES = /\n|&&|\|\||;|\|/;

export const esConventional = (linea) => {
  const l = String(linea ?? '').trim();
  return RE_CONVENTIONAL.test(l) || RE_EXENTOS.test(l);
};
export const contieneAtribucion = (texto) => RE_ATRIBUCION.test(String(texto ?? ''));
const primeraLinea = (t) => String(t ?? '').split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? '';
const blanco = (s) => s.replace(/[^\n]/g, ' ');

// Reemplaza el contenido de heredocs, here-strings y comillas por espacios, sin cambiar el largo.
export function enmascarar(texto) {
  return String(texto)
    .replace(/<<-?\s*(['"]?)(\w+)\1([^\n]*\n)([\s\S]*?)(\n\s*\2(?=\s|$|\)))/g,
      (t, _q, _tag, _cola, cuerpo, fin) => t.slice(0, t.length - cuerpo.length - fin.length) + blanco(cuerpo) + fin)
    .replace(/@(['"])\r?\n[\s\S]*?\r?\n\1@/g, (t) => t.slice(0, 2) + blanco(t.slice(2, -2)) + t.slice(-2))
    .replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, (t) => t[0] + blanco(t.slice(1, -1)) + t[t.length - 1]);
}

function valorDeFlag(resto, flags) {
  const re = new RegExp(`(?:^|\\s)(?:${flags})(?:\\s+|=)(?:"((?:[^"\\\\]|\\\\.)*)"|'([^']*)'|(\\S+))`);
  const m = re.exec(resto);
  return m ? { valor: m[1] ?? m[2] ?? m[3], indice: m.index } : null;
}

function mensajeDe(resto, flagsTexto, flagsArchivo, ctx, cwd) {
  const t = valorDeFlag(resto, flagsTexto);
  if (t) {
    const desdeFlag = resto.slice(t.indice);
    if (t.valor.startsWith('$(') || t.valor.startsWith('<<')) { const h = RE_HEREDOC.exec(desdeFlag); return h ? h[3] : null; }
    if (/^@['"]$/.test(t.valor)) { const h = RE_HERESTRING.exec(desdeFlag); return h ? h[2] : null; }
    return t.valor;
  }
  const a = flagsArchivo ? valorDeFlag(resto, flagsArchivo) : null;
  if (a) { try { return ctx.leerArchivo(resolve(cwd, a.valor)); } catch { return null; } }
  return null;
}

function tokensDe(mascara, desde) {
  return mascara.slice(desde).replace(/"\s*"|'\s*'/g, 'Q').split(SEPARADORES)[0].trim().split(/\s+/).filter(Boolean);
}

function nuevaRama(sub, tokens, ctx, cwd) {
  const i = tokens.findIndex((t) => (sub === 'checkout' ? /^-[bB]$/ : /^(-[cC]|--create)$/).test(t));
  if (i >= 0) return tokens[i + 1] ?? null;
  if (tokens.includes('--')) return null;
  const nombre = tokens.find((t) => !t.startsWith('-') && t !== 'Q');
  if (!nombre) return null;
  if (sub === 'switch') return nombre;
  return ctx.esRama(cwd, nombre) ? nombre : null;
}

const ATRIBUCION = { regla: 'atribucion', motivo: 'El mensaje contiene coautoría o atribución de Claude/IA. Quítala.' };
const NO_VERIFY = { regla: 'no-verify', motivo: 'No se permite saltarse los hooks (--no-verify / -n).' };

function reglaCommit(texto, desde, tokens, rama, protegidas, ctx, cwd) {
  if (protegidas.includes(rama)) {
    return { regla: 'commit-en-protegida', motivo: `No se permite commit directo en '${rama}'. Crea una rama: git switch -c tipo/descripcion` };
  }
  if (tokens.some((t) => t === '--no-verify' || /^-[a-zA-Z]*n[a-zA-Z]*$/.test(t))) return NO_VERIFY;
  const mensaje = mensajeDe(texto.slice(desde), '-m|--message', '-F|--file', ctx, cwd);
  if (contieneAtribucion(texto) || contieneAtribucion(mensaje)) return ATRIBUCION;
  if (mensaje !== null && !esConventional(primeraLinea(mensaje))) {
    return { regla: 'conventional', motivo: `"${primeraLinea(mensaje)}" no sigue Conventional Commits (tipo(ámbito): descripción).` };
  }
  return null;
}

function reglaPush(tokens, rama, protegidas) {
  if (tokens.includes('--no-verify')) return NO_VERIFY;
  const posicionales = tokens.filter((t) => !t.startsWith('-') && t !== 'Q');
  const refspecs = posicionales.slice(1);
  const fuerza = refspecs.some((r) => r.startsWith('+'))
    || tokens.some((t) => /^--force(-with-lease|-if-includes)?(=.*)?$/.test(t) || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(t));
  const masivo = tokens.includes('--all') || tokens.includes('--mirror');
  let destinos = refspecs.map((r) => {
    let d = r.replace(/^\+/, '');
    if (d.includes(':')) d = d.split(':').pop();
    d = d.replace(/^refs\/heads\//, '');
    return d === 'HEAD' ? rama : d;
  });
  if (!destinos.length && !tokens.includes('--tags')) destinos = [rama];
  const destino = destinos.find((d) => protegidas.includes(d));
  if (masivo || destino) {
    return fuerza
      ? { regla: 'force-push', motivo: `No se permite force-push a '${destino ?? 'ramas protegidas'}'.` }
      : { regla: 'push-a-protegida', motivo: `No se permite push directo a '${destino ?? 'todas las ramas'}'. Sube tu rama y abre un PR.` };
  }
  return null;
}

function reglaGh(sub, texto, desde, tokens, ctx) {
  if (sub === 'merge') {
    if (tokens.includes('--admin')) return { regla: 'merge-admin', motivo: 'No se permite saltarse la protección con --admin.' };
    if (!tokens.some((t) => t === '--squash' || t === '-s')) return { regla: 'merge-sin-squash', motivo: 'Usa squash-merge: gh pr merge --squash' };
    return null;
  }
  const resto = texto.slice(desde);
  const archivo = valorDeFlag(resto, '--body-file|-F');
  let cuerpo = '';
  if (archivo) { try { cuerpo = ctx.leerArchivo(resolve(ctx.cwd, archivo.valor)); } catch { /* sin archivo */ } }
  if (contieneAtribucion(texto) || contieneAtribucion(cuerpo)) return ATRIBUCION;
  const titulo = mensajeDe(resto, '--title|-t', null, ctx, ctx.cwd);
  if (titulo !== null && !esConventional(primeraLinea(titulo))) {
    return { regla: 'conventional', motivo: `El título "${primeraLinea(titulo)}" no sigue Conventional Commits; con squash será el mensaje del commit.` };
  }
  return null;
}

export function evaluarComando(comando, ctx) {
  const texto = String(comando ?? '');
  const mascara = enmascarar(texto);
  const protegidas = ctx.ramasProtegidas ?? RAMAS_PROTEGIDAS_DEFECTO;
  let rama = null;
  for (const m of mascara.matchAll(RE_OPS)) {
    const fin = m.index + m[0].length;
    const tokens = tokensDe(mascara, fin);
    if (m[1] === 'git') {
      const c = /-C\s+(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(texto.slice(m.index, fin));
      const cwd = c ? resolve(ctx.cwd, c[1] ?? c[2] ?? c[3]) : ctx.cwd;
      const ramaEn = () => rama ?? ctx.ramaActual(cwd);
      if (m[3] === 'checkout' || m[3] === 'switch') { rama = nuevaRama(m[3], tokens, ctx, cwd) ?? rama; continue; }
      const v = m[3] === 'commit'
        ? reglaCommit(texto, fin, tokens, ramaEn(), protegidas, ctx, cwd)
        : reglaPush(tokens, ramaEn(), protegidas);
      if (v) return v;
    } else {
      const v = reglaGh(m[5], texto, fin, tokens, ctx);
      if (v) return v;
    }
  }
  return null;
}
```

Ejecuta: `node --test tests/reglas-git.test.mjs`
Esperado: PASAN todos. Si falla algún caso, corrige `reglas-git.mjs`, no el test. Los casos son el contrato.

- [ ] **Paso 3: implementar `git-guard.mjs`**

```js
#!/usr/bin/env node
// PreToolUse(Bash|PowerShell): niega operaciones git que violan el flujo estricto.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { cargarConfig } from './lib/config.mjs';
import { emitir } from './lib/eventos.mjs';
import { ejecutarHook, denegar, esPrincipal } from './lib/hook-io.mjs';
import { evaluarComando } from './git-hooks/reglas-git.mjs';

const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

export function ctxReal(cwd, config) {
  return {
    cwd,
    ramasProtegidas: config.ramasProtegidas,
    ramaActual: (dir) => { try { return git(['-C', dir, 'branch', '--show-current']).trim(); } catch { return ''; } },
    esRama: (dir, n) => { try { git(['-C', dir, 'show-ref', '--verify', '--quiet', `refs/heads/${n}`]); return true; } catch { return false; } },
    leerArchivo: (ruta) => readFileSync(ruta, 'utf8'),
  };
}

export async function manejar(entrada, env = process.env, ctx = null) {
  const comando = entrada?.tool_input?.command;
  if (typeof comando !== 'string' || !/\b(git|gh)\b/.test(comando)) return null;
  const config = cargarConfig(env);
  const v = evaluarComando(comando, ctx ?? ctxReal(entrada.cwd ?? process.cwd(), config));
  if (!v) return null;
  emitir({ tipo: 'bloqueo', session: entrada.session_id, regla: v.regla, motivo: v.motivo }, env);
  return denegar('PreToolUse', `[orquestador] ${v.motivo}`);
}

if (esPrincipal(import.meta.url)) ejecutarHook((e) => manejar(e));
```

- [ ] **Paso 4: implementar los git hooks de respaldo**

`git-hooks/commit-msg.mjs`:
```js
#!/usr/bin/env node
// git commit-msg: Conventional Commits y sin atribución de IA. Instalado por /orquestador:setup.
import { readFileSync } from 'node:fs';
import { esConventional, contieneAtribucion } from './reglas-git.mjs';

const mensaje = readFileSync(process.argv[2], 'utf8').split(/\r?\n/).filter((l) => !l.startsWith('#')).join('\n');
const primera = mensaje.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
if (contieneAtribucion(mensaje)) {
  console.error('[orquestador] El mensaje contiene coautoría o atribución de IA. Quítala.');
  process.exitCode = 1;
} else if (!esConventional(primera)) {
  console.error(`[orquestador] "${primera}" no sigue Conventional Commits (tipo(ámbito): descripción).`);
  process.exitCode = 1;
}
```

`git-hooks/pre-push.mjs`:
```js
#!/usr/bin/env node
// git pre-push: bloquea push directo a ramas protegidas. Instalado por /orquestador:setup.
import { RAMAS_PROTEGIDAS_DEFECTO } from './reglas-git.mjs';

let entrada = '';
process.stdin.setEncoding('utf8');
for await (const c of process.stdin) entrada += c;
for (const linea of entrada.split(/\r?\n/)) {
  const remoto = linea.trim().split(/\s+/)[2] ?? '';
  const rama = remoto.replace(/^refs\/heads\//, '');
  if (RAMAS_PROTEGIDAS_DEFECTO.includes(rama)) {
    console.error(`[orquestador] Push directo a '${rama}' bloqueado. Sube tu rama y abre un PR.`);
    process.exitCode = 1;
    break;
  }
}
```

`tests/git-hooks.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { manejar } from '../plugins/orquestador/scripts/git-guard.mjs';

const DIR = fileURLToPath(new URL('../plugins/orquestador/scripts/git-hooks/', import.meta.url));
const correr = (script, args, input = '') => spawnSync(process.execPath, [join(DIR, script), ...args], { input, encoding: 'utf8' });
const msg = (texto) => { const r = join(mkdtempSync(join(tmpdir(), 'orq-msg-')), 'MSG'); writeFileSync(r, texto); return r; };

test('commit-msg acepta conventional e ignora comentarios', () => {
  assert.equal(correr('commit-msg.mjs', [msg('# comentario\nfeat: algo\n')]).status, 0);
});
test('commit-msg rechaza no conventional y atribución', () => {
  assert.equal(correr('commit-msg.mjs', [msg('cosas\n')]).status, 1);
  assert.equal(correr('commit-msg.mjs', [msg('feat: a\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n')]).status, 1);
});
test('pre-push bloquea refs/heads/main y deja pasar ramas', () => {
  assert.equal(correr('pre-push.mjs', ['origin', 'url'], 'refs/heads/feat/a abc refs/heads/main def\n').status, 1);
  assert.equal(correr('pre-push.mjs', ['origin', 'url'], 'refs/heads/feat/a abc refs/heads/feat/a def\n').status, 0);
});

const ctxFalso = { cwd: '/r', ramaActual: () => 'main', esRama: () => false, leerArchivo: () => { throw new Error('no'); } };
test('git-guard niega vía Bash y vía PowerShell con el mismo motivo', async () => {
  const env = { ORQUESTADOR_HOME: mkdtempSync(join(tmpdir(), 'orq-')) };
  for (const tool_name of ['Bash', 'PowerShell']) {
    const r = await manejar({ session_id: 's', tool_name, tool_input: { command: 'git commit -m "feat: x"' } }, env, ctxFalso);
    assert.equal(r.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(r.hookSpecificOutput.permissionDecisionReason, /commit directo en 'main'/);
  }
});
test('git-guard ignora comandos sin git ni gh', async () => {
  assert.equal(await manejar({ tool_input: { command: 'ls' } }, {}, ctxFalso), null);
});
```

- [ ] **Paso 5: registrar el hook**

En `hooks.json`, agrega un segundo elemento al arreglo `PreToolUse`:
```json
{
  "matcher": "Bash|PowerShell",
  "hooks": [{ "type": "command", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/git-guard.mjs"], "timeout": 10 }]
}
```

- [ ] **Paso 6: correr los tests**

Ejecuta: `node --test`
Esperado: PASAN todos.

- [ ] **Paso 7: commit**

```bash
git add plugins/orquestador tests/reglas-git.test.mjs tests/git-hooks.test.mjs
git commit -m "feat: guardia git para Bash y PowerShell y git hooks de respaldo"
```

---

### Tarea 7: `session-start`, status line y status line por subagente

**Archivos:**
- Crear: `plugins/orquestador/scripts/session-start.mjs`, `statusline.mjs`, `subagent-statusline.mjs`
- Modificar: `plugins/orquestador/hooks/hooks.json`
- Test: `tests/statusline.test.mjs`

**Interfaces:**
- Consume: `rutaRaizPlugin`, `leerEstado`, `conEstado`, `cargarConfig`, `familia`, `nombreBase`, `emitir`, `contexto` y `leerEntrada`.
- Produce: `manejarInicio(entrada, env, raizPlugin) → salidaHook` (escribe `plugin-root.txt`).
- Produce: `renderLinea(entrada, estado, config) → string` y `main({stdin, stdout, env})` en `statusline.mjs`.
- Produce: `renderSubagente(entrada, estado) → string` y `main(...)` en `subagent-statusline.mjs`.
- Los stubs de la Tarea 8 importan `statusline.mjs` y `subagent-statusline.mjs` y llaman a su `main()`.

- [ ] **Paso 1: escribir los tests, que deben fallar**

`tests/statusline.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { renderLinea, main } from '../plugins/orquestador/scripts/statusline.mjs';
import { renderSubagente } from '../plugins/orquestador/scripts/subagent-statusline.mjs';
import { manejarInicio } from '../plugins/orquestador/scripts/session-start.mjs';
import { estadoVacio, leerEstado } from '../plugins/orquestador/scripts/lib/estado.mjs';
import { CONFIG_DEFECTO } from '../plugins/orquestador/scripts/lib/config.mjs';
import { rutaRaizPlugin } from '../plugins/orquestador/scripts/lib/rutas.mjs';
import { leerEventos } from '../plugins/orquestador/scripts/lib/eventos.mjs';

const conDos = () => {
  const e = estadoVacio('s');
  e.fableUsados = 1;
  e.activas.a = { agente: 'orquestador:investigador-rl', modelo: 'opus', esfuerzo: 'high', meta: 'Diseñar ablation de reward shaping con 3 seeds', agentId: 'x1' };
  e.activas.b = { agente: 'auditor-datos', modelo: 'claude-haiku-5-5', esfuerzo: 'low', meta: 'Perfilar CSV', agentId: 'x2' };
  return e;
};

test('renderLinea muestra orquestador, activos, fable y costo', () => {
  const l = renderLinea({ model: { id: 'claude-opus-5-5' }, cost: { total_cost_usd: 0.4212 } }, conDos(), CONFIG_DEFECTO);
  assert.equal(l, '🎛 opus │ ▶ investigador-rl (opus·high) ▶ auditor-datos (haiku·low) │ fable 1/2 │ $0.42');
});

test('renderLinea advierte si el orquestador no está en opus o fable', () => {
  assert.match(renderLinea({ model: { id: 'claude-sonnet-5-5' } }, estadoVacio('s'), CONFIG_DEFECTO), /⚠ orquestador en sonnet/);
});

test('renderLinea incluye el esfuerzo si viene en la entrada', () => {
  assert.match(renderLinea({ model: { id: 'claude-opus-5-5' }, effort: { level: 'xhigh' } }, estadoVacio('s'), CONFIG_DEFECTO), /^🎛 opus·xhigh/);
});

test('main registra modeloPrincipal y no lanza con entrada rota', async () => {
  const env = { ORQUESTADOR_HOME: mkdtempSync(join(tmpdir(), 'orq-')) };
  const out = { texto: '', write(t) { this.texto += t; } };
  await main({ stdin: Readable.from([JSON.stringify({ session_id: 's', model: { id: 'claude-fable-5-1' } })]), stdout: out, env });
  assert.equal(leerEstado('s', env).modeloPrincipal, 'fable');
  const out2 = { texto: '', write(t) { this.texto += t; } };
  await main({ stdin: Readable.from(['{roto']), stdout: out2, env });
  assert.match(out2.texto, /^🎛/);
});

test('renderSubagente usa agent_id y recorta la meta', () => {
  const l = renderSubagente({ agent_id: 'x1' }, conDos());
  assert.equal(l, '▶ investigador-rl · opus·high · "Diseñar ablation de reward shaping con 3…"');
  assert.equal(renderSubagente({ agent_type: 'Explore' }, estadoVacio('s')), '▶ Explore');
});

test('manejarInicio guarda la raíz del plugin, emite sesion e inyecta el recordatorio', () => {
  const env = { ORQUESTADOR_HOME: mkdtempSync(join(tmpdir(), 'orq-')) };
  const r = manejarInicio({ session_id: 's', cwd: '/p', source: 'startup' }, env, '/raiz/plugin');
  assert.equal(readFileSync(rutaRaizPlugin(env), 'utf8'), '/raiz/plugin');
  assert.match(r.hookSpecificOutput.additionalContext, /orquestador:orquestar/);
  assert.equal(leerEventos({ session: 's' }, env)[0].tipo, 'sesion');
});
```

Ejecuta: `node --test tests/statusline.test.mjs`
Esperado: FALLA.

- [ ] **Paso 2: implementar `session-start.mjs`**

```js
#!/usr/bin/env node
// SessionStart: registra la raíz del plugin (para los stubs de status line) e inyecta el recordatorio.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rutaRaizPlugin } from './lib/rutas.mjs';
import { emitir } from './lib/eventos.mjs';
import { ejecutarHook, contexto, esPrincipal } from './lib/hook-io.mjs';

const RAIZ_PLUGIN = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
export const RECORDATORIO = 'Orquestador activo. Antes de delegar trabajo de varios pasos, carga la skill `orquestador:orquestar` '
  + 'y pasa siempre `model` y `effort` explícitos al tool Agent. Nunca agregues coautoría de Claude en commits ni PRs.';

export function manejarInicio(entrada, env = process.env, raizPlugin = RAIZ_PLUGIN) {
  try {
    const ruta = rutaRaizPlugin(env);
    mkdirSync(dirname(ruta), { recursive: true });
    writeFileSync(ruta, raizPlugin);
  } catch { /* sin raíz registrada la status line muestra un fallback */ }
  emitir({ tipo: 'sesion', session: entrada.session_id, cwd: entrada.cwd ?? null, fuente: entrada.source ?? null }, env);
  return contexto('SessionStart', RECORDATORIO);
}

if (esPrincipal(import.meta.url)) ejecutarHook(async (e) => manejarInicio(e));
```

- [ ] **Paso 3: implementar `statusline.mjs`**

```js
#!/usr/bin/env node
// Status line principal: orquestador, subagentes activos, uso de Fable y costo de la sesión.
import { cargarConfig } from './lib/config.mjs';
import { leerEstado, conEstado } from './lib/estado.mjs';
import { familia } from './lib/modelos.mjs';
import { nombreBase } from './lib/agentes.mjs';
import { leerEntrada, esPrincipal } from './lib/hook-io.mjs';

const modeloDe = (entrada) => familia(entrada?.model?.id ?? entrada?.model?.display_name);

export function renderLinea(entrada, estado, config) {
  const modelo = modeloDe(entrada);
  const esfuerzo = typeof entrada.effort === 'string' ? entrada.effort : entrada.effort?.level;
  const partes = [`🎛 ${modelo}${esfuerzo ? `·${esfuerzo}` : ''}`];
  if (!config.modelosOrquestador.includes(modelo)) partes.push(`⚠ orquestador en ${modelo}`);
  const activas = Object.values(estado.activas ?? {});
  if (activas.length) partes.push(activas.map((a) => `▶ ${nombreBase(a.agente)} (${familia(a.modelo)}·${a.esfuerzo})`).join(' '));
  partes.push(`fable ${estado.fableUsados}/${config.fableMaxPorSesion}`);
  const costo = entrada.cost?.total_cost_usd;
  if (typeof costo === 'number') partes.push(`$${costo.toFixed(2)}`);
  return partes.join(' │ ');
}

export async function main({ stdin = process.stdin, stdout = process.stdout, env = process.env } = {}) {
  let entrada = {};
  try {
    entrada = await leerEntrada(stdin);
    const config = cargarConfig(env);
    let estado = leerEstado(entrada.session_id, env);
    const modelo = modeloDe(entrada);
    if (entrada.session_id && estado.modeloPrincipal !== modelo) {
      await conEstado(entrada.session_id, (e) => { e.modeloPrincipal = modelo; estado = e; }, env);
    }
    stdout.write(renderLinea(entrada, estado, config));
  } catch {
    stdout.write(`🎛 ${modeloDe(entrada)}`);
  }
}

if (esPrincipal(import.meta.url)) main();
```

- [ ] **Paso 4: implementar `subagent-statusline.mjs`**

```js
#!/usr/bin/env node
// Status line por subagente: tipo, modelo·esfuerzo y meta de la delegación.
import { leerEstado } from './lib/estado.mjs';
import { familia } from './lib/modelos.mjs';
import { nombreBase } from './lib/agentes.mjs';
import { leerEntrada, esPrincipal } from './lib/hook-io.mjs';

const MAX_META = 40;
const recortar = (t) => (t.length > MAX_META ? `${t.slice(0, MAX_META).trimEnd()}…` : t);

export function renderSubagente(entrada, estado) {
  const idAgente = entrada.agent_id ?? entrada.id;
  const a = Object.values(estado.activas ?? {}).find((x) => idAgente && x.agentId === idAgente);
  if (!a) return `▶ ${nombreBase(entrada.agent_type ?? entrada.name ?? 'subagente')}`;
  return `▶ ${nombreBase(a.agente)} · ${familia(a.modelo)}·${a.esfuerzo} · "${recortar(a.meta ?? '')}"`;
}

export async function main({ stdin = process.stdin, stdout = process.stdout, env = process.env } = {}) {
  let entrada = {};
  try {
    entrada = await leerEntrada(stdin);
    stdout.write(renderSubagente(entrada, leerEstado(entrada.session_id, env)));
  } catch {
    stdout.write(`▶ ${entrada.agent_type ?? 'subagente'}`);
  }
}

if (esPrincipal(import.meta.url)) main();
```

- [ ] **Paso 5: registrar SessionStart**

Agrega la clave `SessionStart` en `hooks.json`:
```json
"SessionStart": [
  { "hooks": [{ "type": "command", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/session-start.mjs"], "timeout": 10 }] }
]
```

- [ ] **Paso 6: correr los tests**

Ejecuta: `node --test`
Esperado: PASAN todos.

- [ ] **Paso 7: commit**

```bash
git add plugins/orquestador tests/statusline.test.mjs
git commit -m "feat: status line del orquestador y por subagente, y recordatorio de inicio"
```

---

### Tarea 8: comandos `/orquestador:setup` y `/orquestador:estado`

**Archivos:**
- Crear: `plugins/orquestador/scripts/setup.mjs`, `plugins/orquestador/scripts/reporte-estado.mjs`, `plugins/orquestador/commands/setup.md`, `plugins/orquestador/commands/estado.md`
- Test: `tests/setup.test.mjs`, `tests/reporte-estado.test.mjs`

**Interfaces:**
- Produce `setup.mjs`:
  - `fusionarSettings(actual, { binDir, reemplazarStatusline? }) → { nuevo, cambios: string[], conflictos: string[] }`;
  - `compararVersion(texto, minima?) → { ok, version }`;
  - `generarStub(script) → string`;
  - `instalarStubs(env)`;
  - `instalarGitHooks(dirHooks, origen) → { instalados: string[], conflictos: string[] }`.
- Produce `reporte-estado.mjs`: `generarTabla(eventos) → string` (markdown) y `sesionReciente(eventos, cwd) → string|null`.

- [ ] **Paso 1: escribir los tests, que deben fallar**

`tests/setup.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fusionarSettings, compararVersion, instalarGitHooks, generarStub } from '../plugins/orquestador/scripts/setup.mjs';

const ORIGEN = fileURLToPath(new URL('../plugins/orquestador/scripts/git-hooks/', import.meta.url));

test('fusionarSettings agrega attribution y status lines sin tocar lo demás', () => {
  const actual = { model: 'opus', permissions: { allow: ['Bash(git add *)'] } };
  const { nuevo, cambios, conflictos } = fusionarSettings(actual, { binDir: 'C:\\h\\bin' });
  assert.deepEqual(nuevo.attribution, { commit: '', pr: '', sessionUrl: false });
  assert.equal(nuevo.statusLine.command, 'node "C:/h/bin/statusline.mjs"');
  assert.equal(nuevo.subagentStatusLine.command, 'node "C:/h/bin/subagent-statusline.mjs"');
  assert.deepEqual(nuevo.permissions, actual.permissions);
  assert.equal(cambios.length, 3);
  assert.deepEqual(conflictos, []);
  assert.equal(actual.attribution, undefined, 'no muta la entrada');
});

test('fusionarSettings es idempotente y respeta una statusLine ajena', () => {
  const primera = fusionarSettings({}, { binDir: '/b' }).nuevo;
  assert.deepEqual(fusionarSettings(primera, { binDir: '/b' }).cambios, []);
  const ajena = fusionarSettings({ statusLine: { type: 'command', command: 'otra' } }, { binDir: '/b' });
  assert.equal(ajena.nuevo.statusLine.command, 'otra');
  assert.equal(ajena.conflictos.length, 1);
  assert.equal(fusionarSettings({ statusLine: { type: 'command', command: 'otra' } }, { binDir: '/b', reemplazarStatusline: true }).nuevo.statusLine.command, 'node "/b/statusline.mjs"');
});

test('compararVersion', () => {
  assert.deepEqual(compararVersion('2.1.296 (Claude Code)'), { ok: true, version: '2.1.296' });
  assert.equal(compararVersion('2.1.139 (Claude Code)').ok, false);
  assert.equal(compararVersion('').ok, false);
});

test('generarStub importa el script desde plugin-root.txt y llama a main', () => {
  const s = generarStub('statusline.mjs');
  assert.match(s, /plugin-root\.txt/);
  assert.match(s, /scripts', 'statusline\.mjs'/);
  assert.match(s, /\.main\(\)/);
});

test('instalarGitHooks copia las reglas, escribe envoltorios y no pisa hooks ajenos', () => {
  const hooks = mkdtempSync(join(tmpdir(), 'orq-hooks-'));
  writeFileSync(join(hooks, 'pre-push'), '#!/bin/sh\necho ajeno\n');
  const r = instalarGitHooks(hooks, ORIGEN);
  assert.deepEqual(r.instalados, ['commit-msg']);
  assert.equal(r.conflictos.length, 1);
  assert.ok(existsSync(join(hooks, 'orquestador', 'reglas-git.mjs')));
  assert.match(readFileSync(join(hooks, 'commit-msg'), 'utf8'), /orquestador\/commit-msg\.mjs/);
  assert.deepEqual(instalarGitHooks(hooks, ORIGEN).instalados, ['commit-msg'], 'reinstalar el propio es idempotente');
});
```

`tests/reporte-estado.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generarTabla, sesionReciente } from '../plugins/orquestador/scripts/reporte-estado.mjs';

const eventos = [
  { tipo: 'sesion', session: 'a', cwd: '/p' },
  { tipo: 'delegacion', session: 'a', id: 't1', agente: 'orquestador:auditor-datos', meta: 'Perfilar | CSV', modelo: 'haiku', esfuerzo: 'low' },
  { tipo: 'fin', session: 'a', id: 't1', modeloReal: 'claude-sonnet-5-5', tokensIn: 100, tokensOut: 20, costoUSD: 0.0012 },
  { tipo: 'alerta', session: 'a', id: 't1', mensaje: 'se pidió haiku pero corrió claude-sonnet-5-5' },
  { tipo: 'bloqueo', session: 'a', regla: 'tope-fable', motivo: 'Tope de Fable alcanzado' },
  { tipo: 'sesion', session: 'b', cwd: '/otro' },
];

test('generarTabla une delegación, fin y alerta, y escapa |', () => {
  const t = generarTabla(eventos.filter((e) => e.session === 'a'));
  assert.match(t, /\| auditor-datos \| Perfilar \\\| CSV \| haiku \| low \| claude-sonnet-5-5 \| 100\/20 \| \$0\.001 \| ⚠ se pidió haiku/);
  assert.match(t, /Bloqueos: 1/);
  assert.match(t, /tope-fable/);
});

test('generarTabla sin delegaciones', () => {
  assert.match(generarTabla([]), /Sin delegaciones/);
});

test('sesionReciente prefiere la última sesión del cwd', () => {
  assert.equal(sesionReciente(eventos, '/p'), 'a');
  assert.equal(sesionReciente(eventos, '/nada'), 'b');
});
```

Ejecuta: `node --test tests/setup.test.mjs tests/reporte-estado.test.mjs`
Esperado: FALLA.

- [ ] **Paso 2: implementar `setup.mjs`**

```js
#!/usr/bin/env node
// /orquestador:setup. Sin --aplicar solo muestra el plan; con --aplicar escribe.
// Uso: node setup.mjs [--aplicar] [--repo <dir>] [--reemplazar-statusline]
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirBase, rutaConfig, rutaRaizPlugin } from './lib/rutas.mjs';
import { asegurarConfig } from './lib/config.mjs';
import { esPrincipal } from './lib/hook-io.mjs';

const RAIZ_PLUGIN = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
const MARCA = '# orquestador: hook generado por /orquestador:setup';
const ATRIBUCION = { commit: '', pr: '', sessionUrl: false };
const STATUS = [['statusLine', 'statusline.mjs'], ['subagentStatusLine', 'subagent-statusline.mjs']];

export function fusionarSettings(actual, { binDir, reemplazarStatusline = false }) {
  const nuevo = structuredClone(actual ?? {});
  const cambios = [];
  const conflictos = [];
  const a = nuevo.attribution;
  if (!a || typeof a !== 'object' || a.commit !== '' || a.pr !== '' || a.sessionUrl !== false) {
    nuevo.attribution = { ...(a && typeof a === 'object' ? a : {}), ...ATRIBUCION };
    cambios.push('attribution: sin coautoría de Claude en commits ni PRs');
  }
  for (const [clave, script] of STATUS) {
    const comando = `node "${join(binDir, script).replace(/\\/g, '/')}"`;
    const act = nuevo[clave];
    if (act?.command === comando) continue;
    if (act && !reemplazarStatusline) {
      conflictos.push(`${clave} ya existe ("${act.command}"); usa --reemplazar-statusline para cambiarlo`);
      continue;
    }
    nuevo[clave] = clave === 'statusLine' ? { type: 'command', command: comando, refreshInterval: 2 } : { type: 'command', command: comando };
    cambios.push(`${clave}: ${comando}`);
  }
  return { nuevo, cambios, conflictos };
}

export function compararVersion(texto, minima = '2.1.170') {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(String(texto ?? ''));
  if (!m) return { ok: false, version: null };
  const v = m.slice(1).map(Number);
  const w = minima.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (v[i] !== w[i]) return { ok: v[i] > w[i], version: m[0] };
  return { ok: true, version: m[0] };
}

export function generarStub(script) {
  return `// Generado por /orquestador:setup: carga ${script} desde la versión instalada del plugin.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
const base = process.env.ORQUESTADOR_HOME || join(homedir(), '.claude', 'orquestador');
try {
  const raiz = readFileSync(join(base, 'plugin-root.txt'), 'utf8').trim();
  const m = await import(pathToFileURL(join(raiz, 'scripts', '${script}')).href);
  await m.main();
} catch {
  process.stdout.write('🎛 orquestador (reinicia Claude Code para activar)');
}
`;
}

export function instalarStubs(env = process.env) {
  const bin = join(dirBase(env), 'bin');
  mkdirSync(bin, { recursive: true });
  for (const [, script] of STATUS) writeFileSync(join(bin, script), generarStub(script));
  return bin;
}

export function instalarGitHooks(dirHooks, origen) {
  const destino = join(dirHooks, 'orquestador');
  mkdirSync(destino, { recursive: true });
  for (const f of ['reglas-git.mjs', 'commit-msg.mjs', 'pre-push.mjs']) copyFileSync(join(origen, f), join(destino, f));
  const r = { instalados: [], conflictos: [] };
  for (const h of ['commit-msg', 'pre-push']) {
    const ruta = join(dirHooks, h);
    const existente = existsSync(ruta) ? readFileSync(ruta, 'utf8') : null;
    if (existente && !existente.includes(MARCA)) { r.conflictos.push(`${h} ya existe y no es del orquestador; no se tocó`); continue; }
    writeFileSync(ruta, `#!/bin/sh\n${MARCA}\nexec node "$(dirname "$0")/orquestador/${h}.mjs" "$@"\n`, { mode: 0o755 });
    r.instalados.push(h);
  }
  return r;
}

function ejecutar(cmd, args, opciones = {}) {
  try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...opciones }).trim(); } catch { return ''; }
}

async function main(argv, env = process.env) {
  const aplicar = argv.includes('--aplicar');
  const iRepo = argv.indexOf('--repo');
  const repo = resolve(iRepo >= 0 ? argv[iRepo + 1] : process.cwd());
  const rutaSettings = join(homedir(), '.claude', 'settings.json');
  let actual = {};
  try { actual = JSON.parse(readFileSync(rutaSettings, 'utf8')); } catch { /* sin settings o ilegible */ }
  const binDir = join(dirBase(env), 'bin');
  const { nuevo, cambios, conflictos } = fusionarSettings(actual, { binDir, reemplazarStatusline: argv.includes('--reemplazar-statusline') });
  const version = compararVersion(ejecutar('claude', ['--version']));
  const rutaHooks = ejecutar('git', ['-C', repo, 'rev-parse', '--git-path', 'hooks']);
  const dirHooks = rutaHooks ? resolve(repo, rutaHooks) : null;
  const plan = {
    aplicado: aplicar,
    settings: { ruta: rutaSettings, cambios, conflictos },
    versionClaude: version.ok ? version.version : `${version.version ?? 'desconocida'} (se requiere ≥ 2.1.170: ejecuta "claude update")`,
    config: rutaConfig(env),
    gitHooks: dirHooks ?? 'el directorio no es un repo git',
  };
  if (aplicar) {
    if (cambios.length) {
      if (existsSync(rutaSettings)) copyFileSync(rutaSettings, `${rutaSettings}.bak-orquestador`);
      mkdirSync(join(homedir(), '.claude'), { recursive: true });
      writeFileSync(rutaSettings, JSON.stringify(nuevo, null, 2) + '\n');
    }
    asegurarConfig(env);
    instalarStubs(env);
    writeFileSync(rutaRaizPlugin(env), RAIZ_PLUGIN);
    if (dirHooks) plan.gitHooks = { dir: dirHooks, ...instalarGitHooks(dirHooks, join(RAIZ_PLUGIN, 'scripts', 'git-hooks')) };
  }
  console.log(JSON.stringify(plan, null, 2));
}

if (esPrincipal(import.meta.url)) main(process.argv.slice(2));
```

- [ ] **Paso 3: implementar `reporte-estado.mjs`**

```js
#!/usr/bin/env node
// /orquestador:estado. Tabla de delegaciones de la sesión (por defecto, la más reciente del directorio actual).
// Uso: node reporte-estado.mjs [session_id]
import { leerEventos } from './lib/eventos.mjs';
import { nombreBase } from './lib/agentes.mjs';
import { esPrincipal } from './lib/hook-io.mjs';

const celda = (t) => String(t ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function sesionReciente(eventos, cwd) {
  const delCwd = eventos.filter((e) => e.tipo === 'sesion' && e.cwd === cwd).at(-1);
  return delCwd?.session ?? eventos.at(-1)?.session ?? null;
}

export function generarTabla(eventos) {
  const filas = new Map();
  const bloqueos = [];
  for (const e of eventos) {
    if (e.tipo === 'delegacion') filas.set(e.id, { ...e, real: '—', tokens: '—', costo: '—', alerta: '' });
    if (e.tipo === 'bloqueo') bloqueos.push(e);
    const f = filas.get(e.id);
    if (!f) continue;
    if (e.tipo === 'fin') Object.assign(f, { real: e.modeloReal ?? '?', tokens: `${e.tokensIn ?? 0}/${e.tokensOut ?? 0}`, costo: `$${(e.costoUSD ?? 0).toFixed(3)}` });
    if (e.tipo === 'alerta') f.alerta = `⚠ ${e.mensaje}`;
  }
  if (!filas.size && !bloqueos.length) return 'Sin delegaciones registradas en esta sesión.';
  const lineas = [
    '| Agente | Meta | Modelo pedido | Esfuerzo | Modelo real | Tokens in/out | Costo | Alerta |',
    '|---|---|---|---|---|---|---|---|',
    ...[...filas.values()].map((f) => `| ${celda(nombreBase(f.agente))} | ${celda(f.meta)} | ${celda(f.modelo)} | ${celda(f.esfuerzo)} | ${celda(f.real)} | ${f.tokens} | ${f.costo} | ${celda(f.alerta)} |`),
    '',
    `Bloqueos: ${bloqueos.length}`,
    ...bloqueos.map((b) => `- ${b.regla}: ${b.motivo}`),
  ];
  return lineas.join('\n');
}

if (esPrincipal(import.meta.url)) {
  const todos = leerEventos();
  const session = process.argv[2] ?? sesionReciente(todos, process.cwd());
  console.log(`Sesión: ${session ?? 'ninguna'}\n`);
  console.log(generarTabla(todos.filter((e) => e.session === session)));
}
```

- [ ] **Paso 4: escribir los comandos**

`plugins/orquestador/commands/setup.md`:
```markdown
---
description: Configura el orquestador (sin coautoría, status lines, git hooks) y ofrece proteger la rama main
---

Configura el plugin orquestador en este equipo y en el repo actual. La raíz del plugin es `${CLAUDE_PLUGIN_ROOT}`. Si esa variable no se expandió, léela del archivo `~/.claude/orquestador/plugin-root.txt`.

1. Ejecuta `node "<raíz>/scripts/setup.mjs" --repo "<directorio actual>"` (simulación) y muestra al usuario, en una lista breve, los `cambios`, los `conflictos`, la `versionClaude` y si hay git hooks por instalar.
2. Pregunta si aplica. Solo con un sí explícito, ejecuta el mismo comando con `--aplicar`. Si hay un conflicto de status line, pregunta si se reemplaza antes de agregar `--reemplazar-statusline`.
3. Si `versionClaude` indica que hay que actualizar, dile que ejecute `claude update`.
4. Si el repo tiene remoto en GitHub, ofrece proteger `main`. Esto cambia la configuración de GitHub, así que **pide confirmación** y muestra los comandos antes de correrlos:
   - `gh api -X PATCH repos/<owner>/<repo> -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false -F delete_branch_on_merge=true`
   - `gh api -X PUT repos/<owner>/<repo>/branches/main/protection --input <archivo>`, con `{"required_status_checks":null,"enforce_admins":true,"required_pull_request_reviews":{"required_approving_review_count":0},"restrictions":null,"required_linear_history":true,"allow_force_pushes":false,"allow_deletions":false}`
5. Recuerda al usuario reiniciar Claude Code para que la status line tome efecto.
```

`plugins/orquestador/commands/estado.md`:
```markdown
---
description: Muestra las delegaciones de la sesión (agente, meta, modelo pedido y real, esfuerzo, tokens, costo, alertas)
---

Ejecuta `node "${CLAUDE_PLUGIN_ROOT}/scripts/reporte-estado.mjs"`. Si la variable no se expandió, usa la raíz que está en `~/.claude/orquestador/plugin-root.txt`. Muestra la tabla tal cual. Después, en una o dos líneas, señala las alertas de modelo y los bloqueos, si los hay.
```

- [ ] **Paso 5: correr los tests**

Ejecuta: `node --test`
Esperado: PASAN todos.

- [ ] **Paso 6: commit**

```bash
git add plugins/orquestador tests/setup.test.mjs tests/reporte-estado.test.mjs
git commit -m "feat: comandos setup y estado del orquestador"
```

---

### Tarea 9: skills `orquestar` y `flujo-git`, y agente `guardian-git`

**Archivos:**
- Crear: `plugins/orquestador/skills/orquestar/SKILL.md`, `plugins/orquestador/skills/flujo-git/SKILL.md`, `plugins/orquestador/agents/guardian-git.md`
- Test: `tests/plugin-valido.test.mjs`, ya existente; ahora valida estos archivos.

- [ ] **Paso 1: escribir `skills/orquestar/SKILL.md`**

```markdown
---
name: orquestar
description: Úsala antes de delegar a subagentes o cuando una tarea tenga varios pasos o partes independientes (research, código, escritura, datos, mercado, presentaciones). Define qué modelo (haiku/sonnet/opus/fable) y qué esfuerzo usar en cada delegación y cómo escribir el encargo.
---

# Orquestar

Eres el orquestador. Tu trabajo es decidir **qué** se delega, **a quién**, con **qué modelo y esfuerzo**, y revisar lo que vuelve. El usuario ve cada delegación en la status line y en el log, así que cada decisión debe poder justificarse con esta rúbrica.

## 1. ¿Delegar o hacerlo tú?

- **Hazlo tú** si toma menos de 3 pasos, si ya tienes el contexto cargado o si explicarlo cuesta más que hacerlo.
- **Delega** si es independiente y largo, si llenaría tu contexto con lectura, o si conviene un especialista del catálogo.

## 2. Rúbrica de modelo y esfuerzo

| Clase de tarea | Ejemplos | model / effort |
|---|---|---|
| Mecánica | buscar archivos, extraer datos, formatear, perfilar un CSV, listar contactos públicos, convertir formatos | `haiku` / `low` |
| Producción acotada | redactar una sección, una función con su test, slides a partir de un esquema, emails | `sonnet` / `medium` |
| Síntesis y análisis | revisión de literatura, debugging, investigación de mercado, análisis de datos con conclusiones | `sonnet` / `high` |
| Juicio experto | diseño experimental ML/RL, estrategia o pricing, revisión crítica de un paper, arquitectura | `opus` / `high` |
| Problema abierto | derivaciones o pruebas, decisiones irreversibles, auditoría final antes de enviar o publicar | `opus` / `xhigh` |
| Máxima consecuencia | solo si se cumplen **dos** de estas: (a) Opus ya falló o se contradijo; (b) la ambigüedad es extrema y no se resuelve preguntando; (c) un error sería muy costoso | `fable` / `high` (tope por sesión) |

Pasa **siempre** `subagent_type`, `model` y `effort` explícitos al tool Agent, aunque coincidan con el frontmatter del agente. Si el hook niega una delegación (por el tope de Fable o por paralelismo), no insistas. Baja un escalón o espera a que terminen las delegaciones en curso.

## 3. Plantilla del encargo (el prompt del subagente)

Los subagentes no ven esta conversación. Escribe un prompt autocontenido:

    Meta: <una frase con el resultado esperado>
    Contexto mínimo: <rutas, decisiones ya tomadas, datos clave>
    Entregable: <archivo o formato exacto>
    Restricciones: <qué no hacer; idioma; fuentes>
    Formato de retorno: <estructura fija, máximo ~300 palabras>

La `description` del tool Agent es la **meta corta**: es lo que el usuario ve en la status line y en el dashboard.

## 4. Paralelismo y revisión

- Paraleliza solo lo que sea independiente, y como máximo el `paraleloMax` de la config (4 por defecto).
- Revisa cada retorno antes de seguir. Si no alcanza la calidad, re-delega **subiendo un escalón** de la rúbrica; no repitas el mismo encargo con el mismo modelo.
- Al cerrar una tarea grande, ofrece `/orquestador:estado` para mostrar qué se delegó y cuánto costó.

## 5. Reglas que siempre aplican

- Nunca agregues coautoría de Claude (`Co-Authored-By`, "Generated with Claude") en commits ni PRs.
- Para operaciones git, sigue la skill `orquestador:flujo-git` o delega en `orquestador:guardian-git`.
- No inventes fuentes, datos ni citas. Si algo no se puede verificar, dilo.
```

- [ ] **Paso 2: escribir `skills/flujo-git/SKILL.md`**

```markdown
---
name: flujo-git
description: Úsala para cualquier commit, push, pull request o merge. Define el flujo estricto (rama por tarea, Conventional Commits, PR con CI, squash-merge, sin coautoría de IA).
---

# Flujo git estricto

Los hooks del orquestador **bloquean** lo que viole estas reglas. Seguirlas evita reintentos.

1. **Nunca** se commitea ni se hace push a `main` o `master`. Crea una rama: `git switch -c <tipo>/<descripcion-corta>`.
2. Los mensajes siguen Conventional Commits: `tipo(ámbito opcional): descripción en minúscula`. Tipos: feat, fix, docs, style, refactor, perf, test, build, ci, chore y revert.
3. **Sin** `Co-Authored-By` de Claude, sin `noreply@anthropic.com` y sin "Generated with Claude" en commits ni PRs.
4. Prohibido: `--no-verify`, `-n` en commit, force-push a ramas protegidas y `gh pr merge --admin`.
5. Sube la rama (`git push -u origin <rama>`) y abre el PR: `gh pr create --title "<tipo>: <descripción>" --body "<resumen y cómo se probó>"`. El título del PR será el mensaje del commit final, así que debe ser Conventional.
6. Mergea solo con CI verde y con squash: `gh pr merge <n> --squash --delete-branch`.

Plantilla del cuerpo del PR:

    ## Resumen
    <qué cambia y por qué, 1-3 viñetas>

    ## Cómo se probó
    <comandos ejecutados y resultado>
```

- [ ] **Paso 3: escribir `agents/guardian-git.md`**

```markdown
---
name: guardian-git
description: Ejecuta operaciones git y GitHub siguiendo el flujo estricto (rama, Conventional Commit, push, PR, squash-merge). Úsalo para commitear, subir y abrir o mergear PRs; no para escribir ni revisar código.
model: haiku
effort: low
color: yellow
tools: Bash, Read, Glob, Grep
---

Persona: Estricto con el proceso, breve y literal; prefiere detenerse antes que improvisar.

Recibes un encargo con la meta (por ejemplo "commitear los cambios de X y abrir un PR"). Haz esto:

1. Ejecuta `git status` y `git branch --show-current`. Si estás en `main` o `master`, crea una rama `tipo/descripcion` antes de cualquier commit.
2. Agrega solo los archivos que pide el encargo. Nunca uses `git add -A` sin revisar antes `git status`.
3. Escribe el mensaje en Conventional Commits, con un resumen en la primera línea de menos de 72 caracteres.
4. Para subir y abrir el PR, sigue la skill `orquestador:flujo-git`.
5. Si un hook bloquea la operación, **no lo rodees**. Informa el motivo exacto.

Formato de retorno (máximo 10 líneas): rama, commits creados (hash y mensaje), URL del PR si existe, y bloqueos encontrados.

## REGLAS CRÍTICAS

- Nunca agregues coautoría de Claude ni atribución de IA (`Co-Authored-By`, `noreply@anthropic.com`, "Generated with Claude") en commits ni PRs.
- Nunca uses `--no-verify`, `--force` hacia ramas protegidas ni `gh pr merge --admin`.
- Responde en español.
```

- [ ] **Paso 4: correr los tests**

Ejecuta: `node --test`
Esperado: PASAN todos. `plugin-valido` ahora recorre 1 agente y 2 skills.

- [ ] **Paso 5: commit**

```bash
git add plugins/orquestador/skills plugins/orquestador/agents
git commit -m "feat: skills orquestar y flujo-git y agente guardian-git"
```

---

### Tarea 10: verificación de punta a punta, PR y check requerido

Esta tarea no tiene código nuevo. Se verifica el plugin real en Claude Code y se integra a `main`.

- [ ] **Paso 1: validar el plugin con la CLI**

Ejecuta: `claude plugin validate plugins/orquestador`
Esperado: sin errores. Si el comando no existe en la versión instalada, registra eso en el PR y sigue con el paso 2.

- [ ] **Paso 2: probarlo en una sesión real, en un repo de prueba**

```bash
DIR=$(mktemp -d) && cd "$DIR" && git init -b main && git commit --allow-empty -m "chore: inicio"
claude --plugin-dir "C:/Users/gfuen/OneDrive/Desktop/skill-agents/plugins/orquestador"
```

Dentro de la sesión, verifica cada punto y anota el resultado:
1. `/orquestador:setup`: muestra el plan. Aplica, reinicia Claude Code y comprueba que la status line muestre `🎛 opus…`.
2. Pide: "Usa dos subagentes en paralelo: uno con haiku/low que liste los archivos del repo y otro con sonnet/medium que escriba un README de 3 líneas". La status line debe mostrar los dos `▶`. Después, `/orquestador:estado` debe listarlos con el modelo real.
3. Pide tres delegaciones con `model: fable`. La tercera debe salir negada con "Tope de Fable".
4. Pide "haz commit de README en main". Debe quedar bloqueado con el motivo en español.
5. Pide un commit con un mensaje que incluya `Co-Authored-By: Claude`. Debe quedar bloqueado.
6. Repite el punto 4 pidiéndole que use PowerShell. Debe quedar bloqueado igual.
7. Mira `~/.claude/orquestador/events.jsonl`: tiene que haber eventos `sesion`, `delegacion`, `fin` y `bloqueo` con los campos del spec §4.1.

Si algo falla, abre la tarea correspondiente, agrega un test que reproduzca el fallo y corrígelo antes de seguir.

- [ ] **Paso 3: subir la rama y abrir el PR**

```bash
git push -u origin feat/fase-1-nucleo
gh pr create --title "feat: núcleo del plugin orquestador (fase 1)" --body "$(cat <<'EOF'
## Resumen
- Hooks: registro de delegaciones, modelo real y alertas, topes de Fable y paralelismo, guardia git (Bash y PowerShell).
- Status line principal y por subagente; comandos /orquestador:setup y /orquestador:estado.
- Skills orquestar y flujo-git; agente guardian-git; sondas de hooks y hallazgos.

## Cómo se probó
- node --test (ubuntu y windows en CI)
- Verificación de punta a punta en sesión real (ver checklist de la Tarea 10)
EOF
)"
```

- [ ] **Paso 4: exigir el CI en `main` y mergear**

Cuando el CI esté verde, convierte en obligatorios los checks (requiere confirmación del usuario, porque modifica GitHub):
```bash
gh api -X PATCH repos/GonzaloFuentes1/skill-agents/branches/main/protection/required_status_checks \
  -F strict=true -f "contexts[]=pruebas (ubuntu-latest)" -f "contexts[]=pruebas (windows-latest)" -f "contexts[]=titulo-pr"
```
Si responde 404 porque todavía no hay checks requeridos, usa `PUT` en `.../protection` con el JSON completo de la protección y `"required_status_checks": {"strict": true, "contexts": [...]}`.

Después: `gh pr merge --squash --delete-branch`.

- [ ] **Paso 5: verificación final**

Usa la skill superpowers:verification-before-completion: `node --test` en `main` actualizado, `gh pr view --json state,mergeCommit` y la lista del paso 2 completa.
