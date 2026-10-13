# Dashboard v2, entrega 1: plan de implementación

> **Para agentes que ejecutan:** SUB-SKILL REQUERIDA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** convertir el dashboard en la ventana principal de trabajo. Debe tener un chat con un orquestador propio (con permisos con botones, historial y varias conversaciones), el detalle en vivo de cada agente, planes en pipeline, el rediseño oscuro con colores con significado y un modo remoto con token.

**Arquitectura:** el servidor Node del dashboard gestiona conversaciones. Cada una es un proceso `claude -p` en modo stream-json, encapsulado en `proceso-claude.mjs`, el único módulo que conoce el protocolo. El chat viaja por el SSE existente con eventos `chat`. El detalle de un agente lee su transcript de forma incremental. Todo lo que modifica estado exige cookie de sesión (canjeada con un token por arranque) y `Origin` válido. El frontend sigue sin frameworks: módulos ES con reductores puros probados en Node.

**Stack:** Node ≥ 20 en módulos `.mjs` sin dependencias npm, `node --test`, HTML/CSS/JS sin build.

**Spec:** `docs/specs/2026-10-12-dashboard-v2-design.md`. Léela antes de empezar. El mockup aprobado está en https://claude.ai/artifact/USYiSrfF94aGybRFiHST2t.

## Restricciones globales

- Node ≥ 20, `.mjs`, **cero dependencias npm**. Solo `node:*`.
- Todo el texto visible y los comentarios van **en español**. Los nombres de agentes y modelos se muestran con mayúscula inicial (`Implementador`, `Sonnet`), y las etiquetas técnicas van entre corchetes (`[FEAT]`, `[CI]`).
- Debe funcionar en **Windows y Linux**. CI corre `node --test` en `ubuntu-latest` y `windows-latest`. Las rutas se arman siempre con `node:path`.
- **Ninguna prueba gasta uso de la cuenta.** Los tests usan `tests/fixtures/claude-falso.mjs`. Solo la sonda de la Tarea 1 llama a `claude` de verdad, y la corre el usuario.
- **Frontend sin `innerHTML`** ni recursos externos. Solo `textContent`, `setAttribute` y `replaceChildren`.
- Git: rama `feat/dashboard-v2-chat` (salvo la Tarea 1, ver más abajo), Conventional Commits en español y **sin coautoría de IA** en commits ni PRs. Nunca `--no-verify`.
- Colores con significado (fuente única en `tema.css`):
  - **Estado:** trabajando = `--activo` (clay), requiere permiso = `--accion` (ámbar), listo = `--listo` (verde), en cola = `--cola` (gris), error = `--error` (rojo).
  - **Modelo:** Haiku = `--haiku` (turquesa), Sonnet = `--sonnet` (azul), Opus = `--opus` (violeta), Fable = `--fable` (magenta).
- Los modos de permiso del dashboard se traducen así para `--permission-mode`: `preguntar → manual`, `ediciones → acceptEdits`, `auto → auto`.
- Valores por defecto nuevos en `config.json`: `conversacionesMax: 2`, `rutaClaude: null`, `remoto: { activo: false, escuchar: "127.0.0.1", hostsPermitidos: [] }`.

## Foco de revisión

Son casos que la spec implica pero que sus pruebas no cubren directamente. Cada uno tiene un test en la tarea dueña:

1. **Texto con acentos, emojis, saltos de línea, comillas y barras invertidas** enviado al orquestador: debe llegar intacto a `claude` (Tarea 3).
2. **Dos pestañas responden el mismo permiso:** la segunda respuesta debe dar 404 con un mensaje claro, sin romper nada (Tarea 4).
3. **Una carpeta con espacios y acentos** (como `OneDrive\Desktop\Mi Carpeta ñ`): se crea la conversación y el proceso corre en esa carpeta (Tareas 3 y 4).
4. **El servidor se reinicia mientras una conversación trabajaba:** al volver, queda `inactiva`, y el siguiente mensaje la retoma con `--resume <sessionId>` (Tarea 4).
5. **Cerrar una conversación mientras trabaja:** debe quedar `inactiva`, no en `error` (Tarea 4).
6. **El servidor del dashboard se lanzó desde una sesión de Claude Code:** el proceso hijo no debe heredar `CLAUDECODE`, que podría hacer que `claude` se niegue a correr anidado (Tarea 3).

## Estructura de archivos

```
plugins/orquestador/
  .claude-plugin/plugin.json             versión 0.2.0 (fuerza reinicio del servidor viejo)
  dashboard/
    server.mjs            MODIFICAR  estáticos por lista, auth, API /api/*, SSE con eventos chat, apagado ordenado
    lanzar.mjs            MODIFICAR  abre con token; --remoto imprime URLs remotas
    datos.mjs             (sin cambios)
    bloques.mjs           CREAR      mapeo de contenido de mensajes → bloques; resúmenes de herramientas
    proceso-claude.mjs    CREAR      spawn de claude -p stream-json; normalizador; interfaz fija
    conversaciones.mjs    CREAR      registro persistente y ciclo de vida; permisos; tope; reglas "siempre"
    historial.mjs         CREAR      reconstruye el chat desde el transcript de la sesión
    pasos-agente.mjs      CREAR      pasos de un subagente desde su transcript (incremental)
    auth.mjs              CREAR      token, cookie, Origin, Host, modo remoto, límite de intentos
    public/
      index.html          REESCRIBIR estructura nueva (lateral, cabecera con pestañas, chat, actividad, panel de agentes)
      tema.css            CREAR      tokens oscuro/claro, colores con significado, layout y componentes
      actividad.css       CREAR      CSS de la vista animada (movido desde index.html)
      actividad.js        CREAR      script de la vista animada (movido desde index.html) con exports
      app.js              CREAR      arranque: tema, pestañas, conversaciones, SSE, wiring
      dom.js              CREAR      utilidades DOM puras + helpers de nombres, modelos y estados
      chat-vista.js       CREAR      reductor puro del chat
      plan-vista.js       CREAR      extracción/validación de orquestador-plan y estado de etapas
      chat.js             CREAR      render del chat, permisos y delegaciones
      plan.js             CREAR      render de la tarjeta del plan en pipeline
      agentes-panel.js    CREAR      lista de agentes y detalle en vivo
      estado-vista.js     MODIFICAR  guarda agentId desde agente-inicio y fin
  scripts/
    lib/config.mjs        MODIFICAR  valores por defecto nuevos; remoto se fusiona por clave
    lib/rutas.mjs         MODIFICAR  rutaConversaciones, rutaToken
    subagent-start.mjs    MODIFICAR  emite agente-inicio con la ruta del transcript
    subagent-stop.mjs     MODIFICAR  el evento fin incluye transcript
    session-start.mjs     MODIFICAR  instrucciones de canal si ORQUESTADOR_CANAL=dashboard
  skills/orquestar/SKILL.md  MODIFICAR  sección de planes en pipeline
  commands/dashboard.md      MODIFICAR  opción --remoto
bench/sondas/stream-json.mjs     CREAR  sonda del protocolo (la corre el usuario)
bench/sondas/resumen-stream.mjs  CREAR  resumen puro de la captura
docs/specs/hallazgos-stream-json.md  CREAR  resultados de la sonda
tests/fixtures/claude-falso.mjs  CREAR  claude falso que reproduce guiones
tests/fixtures/guiones.mjs       CREAR  piezas de guion reutilizables
tests/helpers/http.mjs           CREAR  helpers HTTP/SSE para tests de servidor
tests/*.test.mjs                 CREAR/MODIFICAR (detallado en cada tarea)
```

---

### Tarea 1: sonda del protocolo stream-json

Esta tarea se hace en la rama de la spec (`docs/spec-dashboard-v2`), porque sus resultados pueden cambiar el plan. Tiene un **punto de control humano**: el usuario corre la sonda con su cuenta.

**Archivos:**
- Crear: `bench/sondas/resumen-stream.mjs`
- Crear: `bench/sondas/stream-json.mjs`
- Crear: `tests/sonda-stream.test.mjs`
- Crear (después de la corrida): `docs/specs/hallazgos-stream-json.md`

**Interfaces:**
- Produce: `resumirStreamJson(lineas: string[]) → { tipos, sessionId, textoParcial, permisoHost, ejemploPermiso, turnos, variosTurnosEnUnProceso, controles }`.

- [ ] **Paso 1: escribir el test que falla**

`tests/sonda-stream.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumirStreamJson } from '../bench/sondas/resumen-stream.mjs';

const L = (o) => JSON.stringify(o);

test('resumirStreamJson detecta init, parciales, permiso por host, varios turnos y controles', () => {
  const r = resumirStreamJson([
    L({ type: 'system', subtype: 'init', session_id: 'ses-9' }),
    L({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'v' } } }),
    L({ type: 'control_request', request_id: 'r1', request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'node --version' } } }),
    'línea que no es JSON',
    L({ type: 'result', subtype: 'success' }),
    L({ type: 'result', subtype: 'success' }),
    L({ type: 'control_response', response: { subtype: 'success', request_id: 'orq-1' } }),
  ]);
  assert.equal(r.sessionId, 'ses-9');
  assert.equal(r.textoParcial, true);
  assert.equal(r.permisoHost, true);
  assert.equal(r.ejemploPermiso.request.tool_name, 'Bash');
  assert.equal(r.turnos, 2);
  assert.equal(r.variosTurnosEnUnProceso, true);
  assert.deepEqual(r.controles, [{ id: 'orq-1', subtipo: 'success', error: null }]);
  assert.equal(r.tipos['system:init'], 1);
});

test('resumirStreamJson sin datos no rompe', () => {
  const r = resumirStreamJson([]);
  assert.deepEqual([r.permisoHost, r.turnos, r.sessionId], [false, 0, null]);
});
```

- [ ] **Paso 2: correr el test y ver que falla**

Ejecuta: `node --test tests/sonda-stream.test.mjs`
Esperado: FAIL con `Cannot find module '…/bench/sondas/resumen-stream.mjs'`.

- [ ] **Paso 3: implementar el resumen**

`bench/sondas/resumen-stream.mjs`:

```js
// Resume la captura de la sonda stream-json: qué tipos llegan y si se cumple el protocolo del plan A.
export function resumirStreamJson(lineas) {
  const msgs = [];
  for (const l of lineas) { try { msgs.push(JSON.parse(l)); } catch { /* línea no JSON */ } }
  const tipos = {};
  for (const m of msgs) {
    const k = m.type === 'system' || m.type === 'stream_event' ? `${m.type}:${m.subtype ?? m.event?.type ?? ''}` : m.type;
    tipos[k] = (tipos[k] ?? 0) + 1;
  }
  const permisos = msgs.filter((m) => m.type === 'control_request' && m.request?.subtype === 'can_use_tool');
  const resultados = msgs.filter((m) => m.type === 'result');
  return {
    tipos,
    sessionId: msgs.find((m) => m.type === 'system' && m.subtype === 'init')?.session_id ?? null,
    textoParcial: msgs.some((m) => m.type === 'stream_event' && m.event?.delta?.type === 'text_delta'),
    permisoHost: permisos.length > 0,
    ejemploPermiso: permisos[0] ?? null,
    turnos: resultados.length,
    variosTurnosEnUnProceso: resultados.length >= 2,
    controles: msgs.filter((m) => m.type === 'control_response')
      .map((m) => ({ id: m.response?.request_id ?? null, subtipo: m.response?.subtype ?? null, error: m.response?.error ?? null })),
  };
}
```

- [ ] **Paso 4: correr el test y ver que pasa**

Ejecuta: `node --test tests/sonda-stream.test.mjs`
Esperado: PASS (2 tests).

- [ ] **Paso 5: escribir la sonda**

`bench/sondas/stream-json.mjs`:

```js
#!/usr/bin/env node
// Sonda del protocolo stream-json para el chat del dashboard (entrega 1).
// Uso: node bench/sondas/stream-json.mjs   (consume uso de tu cuenta: 2 turnos cortos en haiku)
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { resumirStreamJson } from './resumen-stream.mjs';

const RESULTADOS = fileURLToPath(new URL('../resultados/', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'orq-sonda-stream-'));
const args = ['-p', '--model', 'haiku', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
  '--include-partial-messages', '--permission-prompts', 'host', '--permission-mode', 'manual'];
const env = { ...process.env };
delete env.CLAUDECODE; // si se corre con "!" desde Claude Code, que el hijo no se crea anidado
const hijo = spawn(process.env.CLAUDE_BIN || 'claude', args, { cwd: dir, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
const lineas = [];
const escribir = (o) => hijo.stdin.write(JSON.stringify(o) + '\n');
const usuario = (texto) => escribir({ type: 'user', message: { role: 'user', content: texto }, parent_tool_use_id: null, session_id: '' });
let turnos = 0;
const limite = setTimeout(() => { console.error('Tiempo agotado (120 s).'); hijo.kill(); }, 120000);

createInterface({ input: hijo.stdout }).on('line', (l) => {
  lineas.push(l);
  let m;
  try { m = JSON.parse(l); } catch { return; }
  if (m.type === 'control_request' && m.request?.subtype === 'can_use_tool') {
    escribir({ type: 'control_response', response: { subtype: 'success', request_id: m.request_id, response: { behavior: 'allow', updatedInput: m.request.input ?? {} } } });
  }
  if (m.type === 'result') {
    turnos += 1;
    if (turnos === 1) usuario('Responde exactamente: segundo turno');
    if (turnos === 2) {
      escribir({ type: 'control_request', request_id: 'orq-1', request: { subtype: 'set_permission_mode', mode: 'acceptEdits' } });
      escribir({ type: 'control_request', request_id: 'orq-2', request: { subtype: 'interrupt' } });
      setTimeout(() => hijo.stdin.end(), 1500);
    }
  }
});
let stderr = '';
hijo.stderr.on('data', (d) => { stderr += d; });
hijo.stdin.on('error', () => {});
hijo.on('error', (e) => { console.error(`No se pudo ejecutar claude: ${e.message}`); process.exitCode = 1; });
hijo.on('close', (codigo) => {
  clearTimeout(limite);
  mkdirSync(RESULTADOS, { recursive: true });
  const archivo = join(RESULTADOS, `stream-json-${Date.now()}.jsonl`);
  writeFileSync(archivo, lineas.join('\n') + '\n');
  console.log(JSON.stringify({ codigo, archivo, stderr: stderr.trim().slice(-500), ...resumirStreamJson(lineas) }, null, 2));
});
usuario('Ejecuta con Bash el comando `node --version` y responde solo con la versión.');
```

- [ ] **Paso 6: commit**

```bash
git add bench/sondas/resumen-stream.mjs bench/sondas/stream-json.mjs tests/sonda-stream.test.mjs
git commit -m "test: sonda del protocolo stream-json para el chat del dashboard"
```

- [ ] **Paso 7: PUNTO DE CONTROL. El usuario corre la sonda**

Detente y pídele al usuario que corra en una terminal (o con `!` en Claude Code):

```
node bench/sondas/stream-json.mjs
```

Pídele que pegue el JSON que imprime. La sonda gasta 2 turnos cortos de Haiku. No continúes sin ese resultado.

- [ ] **Paso 8: registrar los hallazgos**

Crea `docs/specs/hallazgos-stream-json.md` con esta estructura y los valores reales:

```markdown
# Hallazgos: protocolo stream-json (sonda del 2026-10-12)

Versión de Claude Code: <salida de `claude --version`>

| Supuesto (spec §2) | Resultado | Evidencia |
|---|---|---|
| Varios mensajes de usuario en un proceso | sí/no | `turnos` = N |
| Permisos por host (`control_request` can_use_tool) | sí/no | `ejemploPermiso` (pegar) |
| `set_permission_mode` | sí/no | `controles[0]` |
| `interrupt` | sí/no | `controles[1]` |
| Texto parcial (`stream_event` text_delta) | sí/no | `textoParcial` |

## Decisión
- Plan A completo / Plan B en: <lista>.
- Diferencias de formato que la Tarea 3 debe reflejar en `crearNormalizador` y en `tests/fixtures/guiones.mjs`: <lista o "ninguna">.
```

**Regla para seguir:** si algún formato real difiere de los que usan la Tarea 3 (nombres de campos de `control_request`, `stream_event`, `result`), corrige **solo** `crearNormalizador`, los codificadores de `proceso-claude.mjs` y `tests/fixtures/guiones.mjs` en la Tarea 3, y anótalo en los hallazgos. Si `can_use_tool` no llega al host, para y avisa al usuario: el plan B (un MCP propio de permisos) necesita su propio mini-plan.

- [ ] **Paso 9: commit**

```bash
git add docs/specs/hallazgos-stream-json.md
git commit -m "docs: hallazgos de la sonda stream-json"
```

Después crea la rama de implementación desde esta: `git checkout -b feat/dashboard-v2-chat`.

---

### Tarea 2: configuración, rutas y hooks

**Archivos:**
- Modificar: `plugins/orquestador/scripts/lib/config.mjs`
- Modificar: `plugins/orquestador/scripts/lib/rutas.mjs`
- Modificar: `plugins/orquestador/scripts/subagent-start.mjs`
- Modificar: `plugins/orquestador/scripts/subagent-stop.mjs` (función `manejar`)
- Modificar: `plugins/orquestador/scripts/session-start.mjs`
- Crear: `tests/hooks-v2.test.mjs`

**Interfaces:**
- Produce:
  - `rutaConversaciones(env) → string` y `rutaToken(env) → string`.
  - `cargarConfig(env).conversacionesMax: number`, `.rutaClaude: string|null` y `.remoto: { activo, escuchar, hostsPermitidos }`.
  - `rutaTranscriptSubagente(entrada) → string|null`.
  - `asignarAgente(...) → { evento, id }`.
  - Un evento nuevo en `events.jsonl`, `{ tipo: 'agente-inicio', session, id, agentId, agente, transcript }`, y el evento `fin` ahora trae `transcript`.
  - `CANAL_DASHBOARD: string`, exportado por `session-start.mjs`.

- [ ] **Paso 1: escribir los tests que fallan**

`tests/hooks-v2.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cargarConfig } from '../plugins/orquestador/scripts/lib/config.mjs';
import { rutaConfig, rutaConversaciones, rutaToken } from '../plugins/orquestador/scripts/lib/rutas.mjs';
import { asignarAgente, rutaTranscriptSubagente, manejar as manejarInicioAgente } from '../plugins/orquestador/scripts/subagent-start.mjs';
import { manejarInicio } from '../plugins/orquestador/scripts/session-start.mjs';
import { estadoVacio, guardarEstado } from '../plugins/orquestador/scripts/lib/estado.mjs';
import { leerEventos } from '../plugins/orquestador/scripts/lib/eventos.mjs';

const home = () => ({ ORQUESTADOR_HOME: mkdtempSync(join(tmpdir(), 'orq-v2-')) });

test('config: valores nuevos por defecto y remoto se fusiona por clave', () => {
  const env = home();
  const c = cargarConfig(env);
  assert.equal(c.conversacionesMax, 2);
  assert.equal(c.rutaClaude, null);
  assert.deepEqual(c.remoto, { activo: false, escuchar: '127.0.0.1', hostsPermitidos: [] });
  writeFileSync(rutaConfig(env), JSON.stringify({ remoto: { activo: true } }));
  assert.deepEqual(cargarConfig(env).remoto, { activo: true, escuchar: '127.0.0.1', hostsPermitidos: [] });
});

test('rutas nuevas viven en el directorio del orquestador', () => {
  const env = home();
  assert.equal(rutaConversaciones(env), join(env.ORQUESTADOR_HOME, 'conversaciones.json'));
  assert.equal(rutaToken(env), join(env.ORQUESTADOR_HOME, 'token'));
});

test('rutaTranscriptSubagente arma la ruta del patrón observado', () => {
  const r = rutaTranscriptSubagente({ transcript_path: join('/p', 'proj', 's1.jsonl'), session_id: 's1', agent_id: 'a9' });
  assert.equal(r, join('/p', 'proj', 's1', 'subagents', 'agent-a9.jsonl'));
  assert.equal(rutaTranscriptSubagente({ session_id: 's1' }), null);
});

test('asignarAgente devuelve el id de la delegación vinculada', () => {
  const e = estadoVacio('s');
  e.activas.tu1 = { agente: 'Explore', inicio: 1, agentId: null };
  assert.deepEqual(asignarAgente({ agent_id: 'a1', agent_type: 'Explore' }, e), { evento: null, id: 'tu1' });
  const r = asignarAgente({ agent_id: 'a2', agent_type: 'Plan' }, e, 5);
  assert.equal(r.id, 'agente-a2');
  assert.equal(r.evento.id, 'agente-a2');
});

test('SubagentStart emite agente-inicio con id, agentId y transcript', async () => {
  const env = home();
  const e = estadoVacio('s1');
  e.activas.tu1 = { agente: 'Explore', inicio: 1, agentId: null };
  guardarEstado(e, env);
  await manejarInicioAgente({ session_id: 's1', agent_id: 'a1', agent_type: 'Explore', transcript_path: join(env.ORQUESTADOR_HOME, 's1.jsonl') }, env);
  const ev = leerEventos({ session: 's1' }, env).find((x) => x.tipo === 'agente-inicio');
  assert.equal(ev.id, 'tu1');
  assert.equal(ev.agentId, 'a1');
  assert.equal(ev.transcript, join(env.ORQUESTADOR_HOME, 's1', 'subagents', 'agent-a1.jsonl'));
});

test('SessionStart agrega las instrucciones de canal solo en el dashboard', () => {
  const env = home();
  const sin = manejarInicio({ session_id: 's' }, env, '/raiz');
  assert.doesNotMatch(sin.hookSpecificOutput.additionalContext, /orquestador-plan/);
  const con = manejarInicio({ session_id: 's' }, { ...env, ORQUESTADOR_CANAL: 'dashboard' }, '/raiz');
  assert.match(con.hookSpecificOutput.additionalContext, /```orquestador-plan/);
  assert.match(con.hookSpecificOutput.additionalContext, /E2 · /);
});
```

- [ ] **Paso 2: correr los tests y ver que fallan**

Ejecuta: `node --test tests/hooks-v2.test.mjs`
Esperado: FAIL (`rutaConversaciones` no existe y `rutaTranscriptSubagente` no se exporta).

- [ ] **Paso 3: implementar**

En `scripts/lib/rutas.mjs`, agrega al final:

```js
export const rutaConversaciones = (env = process.env) => join(dirBase(env), 'conversaciones.json');
export const rutaToken = (env = process.env) => join(dirBase(env), 'token');
```

En `scripts/lib/config.mjs`, agrega dentro de `CONFIG_DEFECTO`, después de `ramasProtegidas`:

```js
  conversacionesMax: 2,
  rutaClaude: null,
  remoto: { activo: false, escuchar: '127.0.0.1', hostsPermitidos: [] },
```

En `cargarConfig`, reemplaza la línea del `return` dentro del `try` por:

```js
    return {
      ...CONFIG_DEFECTO, ...usuario,
      precios: { ...CONFIG_DEFECTO.precios, ...(usuario.precios ?? {}) },
      remoto: { ...CONFIG_DEFECTO.remoto, ...(usuario.remoto ?? {}) },
    };
```

Reemplaza `scripts/subagent-start.mjs` completo por:

```js
#!/usr/bin/env node
// SubagentStart: vincula agent_id con la delegación registrada por pre-agent y anuncia dónde queda su transcript.
import { dirname, join } from 'node:path';
import { conEstado } from './lib/estado.mjs';
import { emitir } from './lib/eventos.mjs';
import { nombreBase } from './lib/agentes.mjs';
import { ejecutarHook, esPrincipal } from './lib/hook-io.mjs';

// Patrón observado: <dir del transcript principal>/<session_id>/subagents/agent-<agent_id>.jsonl.
export function rutaTranscriptSubagente(entrada) {
  const { transcript_path: t, session_id: s, agent_id: a } = entrada ?? {};
  if (!t || !s || !a) return null;
  return join(dirname(t), s, 'subagents', `agent-${a}.jsonl`);
}

export function asignarAgente(entrada, estado, ahora = Date.now()) {
  const tipo = nombreBase(entrada.agent_type);
  const candidatas = Object.entries(estado.activas)
    .filter(([, a]) => !a.agentId && nombreBase(a.agente) === tipo)
    .sort(([, x], [, y]) => x.inicio - y.inicio);
  if (candidatas.length) {
    candidatas[0][1].agentId = entrada.agent_id;
    return { evento: null, id: candidatas[0][0] };
  }
  const id = `agente-${entrada.agent_id}`;
  const agente = entrada.agent_type ?? 'desconocido';
  estado.activas[id] = { agente, meta: '', modelo: 'desconocido', esfuerzo: 'desconocido', inicio: ahora, agentId: entrada.agent_id };
  return { evento: { tipo: 'delegacion', session: estado.session, id, agente, meta: '', modelo: 'desconocido', esfuerzo: 'desconocido', origenModelo: 'externo' }, id };
}

export async function manejar(entrada, env = process.env) {
  const { evento, id } = await conEstado(entrada.session_id, (e) => asignarAgente(entrada, e), env);
  emitir(evento, env);
  emitir({ tipo: 'agente-inicio', session: entrada.session_id, id, agentId: entrada.agent_id, agente: entrada.agent_type ?? null, transcript: rutaTranscriptSubagente(entrada) }, env);
  return null;
}

if (esPrincipal(import.meta.url)) ejecutarHook((e) => manejar(e));
```

En `scripts/subagent-stop.mjs`, dentro de `manejar`, reemplaza:

```js
  for (const ev of r.eventos) emitir(ev, env);
```

por:

```js
  for (const ev of r.eventos) emitir(ev.tipo === 'fin' ? { ...ev, transcript: ruta } : ev, env);
```

En `scripts/session-start.mjs`, agrega después de `RECORDATORIO`:

```js
export const CANAL_DASHBOARD = 'Canal: dashboard. Si la tarea requiere 3 o más delegaciones o incluye una acción irreversible, '
  + 'primero presenta el plan en un bloque ```orquestador-plan con este JSON: {"titulo","etapas":[{"id":"E1","titulo","meta",'
  + '"agentes":[{"tipo","modelo","esfuerzo"}],"barrera":{"tipo":"auto|humana","criterio"}}],"riesgos":[{"titulo","planB"}]}, '
  + 'y termina el turno esperando aprobación. Al delegar una etapa, empieza la description del tool Agent con su id: "E2 · <meta>". '
  + 'En una barrera humana, termina el turno con la pregunta.';
```

y reemplaza `return contexto('SessionStart', RECORDATORIO);` por:

```js
  return contexto('SessionStart', env.ORQUESTADOR_CANAL === 'dashboard' ? `${RECORDATORIO}\n\n${CANAL_DASHBOARD}` : RECORDATORIO);
```

- [ ] **Paso 4: correr los tests nuevos y toda la suite**

Ejecuta: `node --test tests/hooks-v2.test.mjs` y después `node --test`.
Esperado: todo PASS. El test existente `asignarAgente vincula…` sigue pasando porque solo mira `.evento`.

- [ ] **Paso 5: commit**

```bash
git add plugins/orquestador/scripts tests/hooks-v2.test.mjs
git commit -m "feat: config y hooks para el chat del dashboard (agente-inicio y canal)"
```

---

### Tarea 3: bloques, proceso de Claude y el claude falso

**Archivos:**
- Crear: `plugins/orquestador/dashboard/bloques.mjs`
- Crear: `plugins/orquestador/dashboard/proceso-claude.mjs`
- Crear: `tests/fixtures/claude-falso.mjs`
- Crear: `tests/fixtures/guiones.mjs`
- Crear: `tests/bloques.test.mjs`
- Crear: `tests/proceso-claude.test.mjs`

**Interfaces:**
- Produce (`bloques.mjs`):
  - `textoPlano(content) → string`, `recortar(t, n) → string` y `bloquesDe(content) → Bloque[]`, donde `Bloque = {tipo:'texto',texto} | {tipo:'pensando',texto} | {tipo:'herramienta',usoId,nombre,entrada}`.
  - `resultadosDe(content) → {usoId, ok, texto}[]` y `resumenHerramienta(nombre, entrada) → string`.
- Produce (`proceso-claude.mjs`):
  - `MODOS = { preguntar:'manual', ediciones:'acceptEdits', auto:'auto' }`.
  - `resolverBinario(config, env, plataforma) → string|null`, `argumentos({sessionId, modo}) → string[]` y `crearNormalizador() → (msg) → Evento[]`.
  - `abrirProceso({cwd, sessionId, modo, binario, env, spawnFn}) → EventEmitter`, que expone `pid`, `enviar(texto)`, `responderPermiso(id, {permitir, mensaje})`, `cambiarModo(modo)`, `interrumpir()` y `cerrar()`. Emite `'evento'` con alguno de estos objetos:
    - `{tipo:'sesion', sessionId, modelo}`
    - `{tipo:'texto-parcial', mensajeId, delta}`
    - `{tipo:'mensaje', mensajeId, rol:'asistente'|'herramienta', bloques}` (con `rol:'herramienta'` los bloques son `{tipo:'resultado', usoId, ok, texto}`)
    - `{tipo:'permiso', solicitudId, herramienta, entrada, motivo}`
    - `{tipo:'fin-turno', ok, costoUSD, duracionMs, error, sessionId}`
    - `{tipo:'salida', codigo, error}`
  - Nota: la spec lista también un evento `herramienta`. No hace falta, porque las herramientas ya vienen dentro de `mensaje.bloques`.

- [ ] **Paso 1: crear el claude falso y los guiones**

`tests/fixtures/claude-falso.mjs`:

```js
#!/usr/bin/env node
// Claude Code falso para tests: reproduce un guion JSONL y registra lo que recibe por stdin.
// Guion (FALSO_GUION): [{ esperar: 'user'|'control_response'|'control_request' }, { emitir: {...} }, { crudo: '...' }, { salir: 1, stderr: '...' }]
import { readFileSync, appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const guion = JSON.parse(readFileSync(process.env.FALSO_GUION, 'utf8'));
const anotar = (x) => { if (process.env.FALSO_REGISTRO) appendFileSync(process.env.FALSO_REGISTRO, JSON.stringify(x) + '\n'); };
anotar({ argv: process.argv.slice(2), canal: process.env.ORQUESTADOR_CANAL ?? null, claudecode: process.env.CLAUDECODE ?? null, cwd: process.cwd() });

const entradas = [];
let despertar = null;
const rl = createInterface({ input: process.stdin });
rl.on('line', (l) => {
  let m;
  try { m = JSON.parse(l); } catch { return; }
  anotar({ stdin: m });
  entradas.push(m);
  despertar?.();
});
rl.on('close', () => { entradas.push({ type: '__fin' }); despertar?.(); });

async function esperar(tipo) {
  for (;;) {
    const i = entradas.findIndex((m) => m.type === tipo || m.type === '__fin');
    if (i >= 0) {
      const [m] = entradas.splice(i, 1);
      if (m.type === '__fin') process.exit(0);
      return m;
    }
    await new Promise((ok) => { despertar = ok; });
  }
}

for (const paso of guion) {
  if (paso.esperar) await esperar(paso.esperar);
  if (paso.emitir) process.stdout.write(JSON.stringify(paso.emitir) + '\n');
  if (paso.crudo) process.stdout.write(paso.crudo + '\n');
  if (paso.salir !== undefined) {
    if (paso.stderr) process.stderr.write(paso.stderr);
    process.exitCode = paso.salir;
    process.stdout.end(() => process.exit(paso.salir));
    await new Promise(() => {});
  }
}
await esperar('__nunca'); // vive hasta que se cierre stdin
```

`tests/fixtures/guiones.mjs`:

```js
// Piezas de guion para claude-falso.mjs: formatos del protocolo stream-json (plan A, ver hallazgos-stream-json.md).
export const ESPERAR_USUARIO = { esperar: 'user' };
export const ESPERAR_RESPUESTA = { esperar: 'control_response' };
export const ESPERAR_PEDIDO = { esperar: 'control_request' };
export const INIT = { emitir: { type: 'system', subtype: 'init', session_id: 'ses-1', model: 'claude-opus-5-5' } };

export const texto = (id, ...trozos) => [
  { emitir: { type: 'stream_event', event: { type: 'message_start', message: { id } }, parent_tool_use_id: null } },
  ...trozos.map((t) => ({ emitir: { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } }, parent_tool_use_id: null } })),
  { emitir: { type: 'assistant', message: { id, content: [{ type: 'text', text: trozos.join('') }] }, parent_tool_use_id: null } },
];
export const permiso = (rid, command) => ({ emitir: { type: 'control_request', request_id: rid, request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command } } } });
export const fin = (extra = {}) => ({ emitir: { type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0.01, duration_ms: 900, session_id: 'ses-1', ...extra } });
export const finInterrumpido = { emitir: { type: 'result', subtype: 'error_during_execution', is_error: true, session_id: 'ses-1', result: 'Interrumpido' } };
export const turnoSimple = (t = 'Hola') => [ESPERAR_USUARIO, INIT, ...texto('m1', t), fin()];
```

- [ ] **Paso 2: escribir los tests que fallan**

`tests/bloques.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bloquesDe, resultadosDe, resumenHerramienta, textoPlano, recortar } from '../plugins/orquestador/dashboard/bloques.mjs';

test('bloquesDe: string, texto, razonamiento vacío omitido y herramienta', () => {
  assert.deepEqual(bloquesDe('hola'), [{ tipo: 'texto', texto: 'hola' }]);
  assert.deepEqual(bloquesDe('  '), []);
  assert.deepEqual(bloquesDe([
    { type: 'thinking', thinking: '' },
    { type: 'thinking', thinking: 'pienso' },
    { type: 'text', text: 'ok' },
    { type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'ls' } },
  ]), [
    { tipo: 'pensando', texto: 'pienso' },
    { tipo: 'texto', texto: 'ok' },
    { tipo: 'herramienta', usoId: 'tu1', nombre: 'Bash', entrada: { command: 'ls' } },
  ]);
});

test('resultadosDe: ok/error, primera línea no vacía y recorte a 200', () => {
  const largo = 'x'.repeat(300);
  assert.deepEqual(resultadosDe([
    { type: 'tool_result', tool_use_id: 'a', content: '\n\nprimera\nsegunda' },
    { type: 'tool_result', tool_use_id: 'b', is_error: true, content: [{ type: 'text', text: largo }] },
    { type: 'text', text: 'ignorado' },
  ]), [
    { usoId: 'a', ok: true, texto: 'primera' },
    { usoId: 'b', ok: false, texto: recortar(largo, 200) },
  ]);
  assert.equal(recortar(largo, 200).length, 200);
  assert.equal(textoPlano([{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'text', text: 'b' }]), 'a\nb');
});

test('resumenHerramienta por herramienta', () => {
  assert.equal(resumenHerramienta('Bash', { command: 'npm test' }), 'npm test');
  assert.equal(resumenHerramienta('Edit', { file_path: 'a.js', old_string: 'x', new_string: 'y\nz' }), 'a.js +2 −1');
  assert.equal(resumenHerramienta('Grep', { pattern: 'TODO' }), 'TODO');
  assert.equal(resumenHerramienta('WebSearch', { query: 'claude' }), 'claude');
  assert.equal(resumenHerramienta('Agent', { description: 'E2 · Verificar' }), 'E2 · Verificar');
  assert.equal(resumenHerramienta('Rara', { a: 1 }), '{"a":1}');
});
```

`tests/proceso-claude.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { abrirProceso, argumentos, resolverBinario, crearNormalizador, MODOS } from '../plugins/orquestador/dashboard/proceso-claude.mjs';
import { ESPERAR_USUARIO, ESPERAR_RESPUESTA, ESPERAR_PEDIDO, INIT, texto, permiso, fin, turnoSimple } from './fixtures/guiones.mjs';

const FALSO = fileURLToPath(new URL('./fixtures/claude-falso.mjs', import.meta.url));

function arrancar(guion, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'orq-proc-'));
  const archivoGuion = join(dir, 'guion.json');
  writeFileSync(archivoGuion, JSON.stringify(guion));
  const registro = join(dir, 'registro.jsonl');
  const p = abrirProceso({
    cwd: extra.cwd ?? dir, modo: extra.modo ?? 'preguntar', sessionId: extra.sessionId ?? null, binario: 'claude-falso',
    env: { ...process.env, CLAUDECODE: '1', FALSO_GUION: archivoGuion, FALSO_REGISTRO: registro },
    spawnFn: (_bin, args, opciones) => spawn(process.execPath, [FALSO, ...args], opciones),
  });
  const eventos = [];
  const basura = [];
  p.on('evento', (e) => eventos.push(e));
  p.on('basura', (l) => basura.push(l));
  const hasta = (pred, ms = 5000) => new Promise((ok, mal) => {
    const t0 = Date.now();
    const mirar = () => {
      const e = eventos.find(pred);
      if (e) return ok(e);
      if (Date.now() - t0 > ms) return mal(new Error(`timeout; eventos: ${eventos.map((x) => x.tipo).join(',')}`));
      setTimeout(mirar, 10);
    };
    mirar();
  });
  const leerRegistro = () => readFileSync(registro, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  return { p, eventos, basura, hasta, leerRegistro, dir };
}

test('argumentos: stream-json, permisos por host, modo y resume', () => {
  const a = argumentos({ modo: 'auto' });
  for (const x of ['-p', '--input-format', 'stream-json', '--output-format', '--verbose', '--include-partial-messages', '--permission-prompts', 'host']) assert.ok(a.includes(x), x);
  assert.equal(a[a.indexOf('--permission-mode') + 1], 'auto');
  assert.equal(argumentos({ modo: 'preguntar' })[argumentos({ modo: 'preguntar' }).indexOf('--permission-mode') + 1], 'manual');
  assert.ok(!a.includes('--resume'));
  const r = argumentos({ modo: 'ediciones', sessionId: 'ses-1' });
  assert.equal(r[r.indexOf('--resume') + 1], 'ses-1');
  assert.deepEqual(MODOS, { preguntar: 'manual', ediciones: 'acceptEdits', auto: 'auto' });
});

test('resolverBinario: config manda; busca en PATH (Windows con Path y .exe); null si no hay', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orq-bin-'));
  writeFileSync(join(dir, 'claude.exe'), '');
  assert.equal(resolverBinario({ rutaClaude: 'C:/x/claude.exe' }, {}, 'win32'), 'C:/x/claude.exe');
  assert.equal(resolverBinario({}, { Path: `C:\\nada;${dir}` }, 'win32'), join(dir, 'claude.exe'));
  assert.equal(resolverBinario({}, { PATH: '/no/existe' }, 'linux'), null);
});

test('normalizador: ignora mensajes de subagentes y tipos desconocidos', () => {
  const n = crearNormalizador();
  assert.deepEqual(n({ type: 'assistant', parent_tool_use_id: 'toolu_x', message: { id: 'm', content: [{ type: 'text', text: 'sub' }] } }), []);
  assert.deepEqual(n({ type: 'rate_limit_event' }), []);
  assert.deepEqual(n(null), []);
});

test('turno simple: sesión, texto parcial, mensaje y fin; canal dashboard y sin CLAUDECODE', async () => {
  const { p, eventos, hasta, leerRegistro } = arrancar([ESPERAR_USUARIO, INIT, ...texto('m1', 'Ho', 'la'), fin()]);
  p.enviar('hola');
  await hasta((e) => e.tipo === 'fin-turno');
  assert.deepEqual(eventos.filter((e) => e.tipo === 'texto-parcial').map((e) => [e.mensajeId, e.delta]), [['m1', 'Ho'], ['m1', 'la']]);
  assert.deepEqual(eventos.find((e) => e.tipo === 'sesion'), { tipo: 'sesion', sessionId: 'ses-1', modelo: 'claude-opus-5-5' });
  assert.deepEqual(eventos.find((e) => e.tipo === 'mensaje').bloques, [{ tipo: 'texto', texto: 'Hola' }]);
  assert.deepEqual(eventos.find((e) => e.tipo === 'fin-turno'), { tipo: 'fin-turno', ok: true, costoUSD: 0.01, duracionMs: 900, error: null, sessionId: 'ses-1' });
  const [arranque] = leerRegistro();
  assert.equal(arranque.canal, 'dashboard');
  assert.equal(arranque.claudecode, null);
  p.cerrar();
  await hasta((e) => e.tipo === 'salida');
});

test('el texto del usuario llega intacto (acentos, emojis, saltos, comillas y barras)', async () => {
  const { p, hasta, leerRegistro } = arrancar(turnoSimple());
  const t = 'Revisa "ñandú" 🚀\nlínea 2 \\ fin';
  p.enviar(t);
  await hasta((e) => e.tipo === 'fin-turno');
  assert.equal(leerRegistro().find((r) => r.stdin?.type === 'user').stdin.message.content, t);
  p.cerrar();
  await hasta((e) => e.tipo === 'salida');
});

test('corre en una carpeta con espacios y acentos', async () => {
  const base = mkdtempSync(join(tmpdir(), 'orq-cwd-'));
  const cwd = join(base, 'Mi Carpeta ñ');
  mkdirSync(cwd);
  const { p, hasta, leerRegistro } = arrancar(turnoSimple(), { cwd });
  p.enviar('x');
  await hasta((e) => e.tipo === 'fin-turno');
  assert.equal(leerRegistro()[0].cwd, cwd);
  p.cerrar();
  await hasta((e) => e.tipo === 'salida');
});

test('permiso: llega al host y la respuesta lleva la entrada original o el motivo de denegación', async () => {
  const { p, hasta, leerRegistro } = arrancar([ESPERAR_USUARIO, INIT, permiso('r1', 'ls'), ESPERAR_RESPUESTA, permiso('r2', 'rm x'), ESPERAR_RESPUESTA, fin()]);
  p.enviar('lista');
  const e1 = await hasta((e) => e.tipo === 'permiso' && e.solicitudId === 'r1');
  assert.deepEqual([e1.herramienta, e1.entrada], ['Bash', { command: 'ls' }]);
  p.responderPermiso('r1', { permitir: true });
  await hasta((e) => e.tipo === 'permiso' && e.solicitudId === 'r2');
  p.responderPermiso('r2', { permitir: false });
  await hasta((e) => e.tipo === 'fin-turno');
  const resp = leerRegistro().filter((r) => r.stdin?.type === 'control_response').map((r) => r.stdin.response);
  assert.deepEqual(resp[0], { subtype: 'success', request_id: 'r1', response: { behavior: 'allow', updatedInput: { command: 'ls' } } });
  assert.equal(resp[1].response.behavior, 'deny');
  assert.match(resp[1].response.message, /denegó/);
  p.cerrar();
  await hasta((e) => e.tipo === 'salida');
});

test('interrumpir y cambiarModo envían control_request', async () => {
  const { p, hasta, leerRegistro } = arrancar([ESPERAR_USUARIO, INIT, ESPERAR_PEDIDO, ESPERAR_PEDIDO, fin()]);
  p.enviar('x');
  await hasta((e) => e.tipo === 'sesion');
  p.cambiarModo('auto');
  p.interrumpir();
  await hasta((e) => e.tipo === 'fin-turno');
  const pedidos = leerRegistro().filter((r) => r.stdin?.type === 'control_request').map((r) => r.stdin.request);
  assert.deepEqual(pedidos, [{ subtype: 'set_permission_mode', mode: 'auto' }, { subtype: 'interrupt' }]);
  p.cerrar();
  await hasta((e) => e.tipo === 'salida');
});

test('líneas basura se descartan; salida con error informa la última línea de stderr', async () => {
  const { p, basura, hasta } = arrancar([ESPERAR_USUARIO, { crudo: 'esto no es json' }, { salir: 1, stderr: 'algo\nError: no hay sesión iniciada\n' }]);
  p.enviar('x');
  const s = await hasta((e) => e.tipo === 'salida');
  assert.equal(s.codigo, 1);
  assert.match(s.error, /no hay sesión iniciada/);
  assert.deepEqual(basura, ['esto no es json']);
});

test('binario inexistente produce una sola salida con error', async () => {
  const p = abrirProceso({ cwd: tmpdir(), modo: 'preguntar', binario: join(tmpdir(), 'no-existe-claude'), env: process.env });
  const salidas = [];
  p.on('evento', (e) => { if (e.tipo === 'salida') salidas.push(e); });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(salidas.length, 1);
  assert.match(salidas[0].error, /No se pudo ejecutar Claude Code/);
});
```

- [ ] **Paso 3: correr y ver que fallan**

Ejecuta: `node --test tests/bloques.test.mjs tests/proceso-claude.test.mjs`
Esperado: FAIL con `Cannot find module …/dashboard/bloques.mjs`.

- [ ] **Paso 4: implementar `bloques.mjs`**

```js
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
```

- [ ] **Paso 5: implementar `proceso-claude.mjs`**

```js
// Único módulo que conoce el protocolo stream-json de `claude -p`. El resto del dashboard ve eventos normalizados.
import { spawn as spawnNodo } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { StringDecoder } from 'node:string_decoder';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { bloquesDe, resultadosDe } from './bloques.mjs';

export const MODOS = Object.freeze({ preguntar: 'manual', ediciones: 'acceptEdits', auto: 'auto' });

export function resolverBinario(config = {}, env = process.env, plataforma = process.platform) {
  if (config.rutaClaude) return config.rutaClaude;
  const nombres = plataforma === 'win32' ? ['claude.exe', 'claude.cmd'] : ['claude'];
  const separador = plataforma === 'win32' ? ';' : ':';
  for (const dir of String(env.PATH ?? env.Path ?? '').split(separador)) {
    if (!dir) continue;
    for (const n of nombres) { const r = join(dir, n); if (existsSync(r)) return r; }
  }
  return null;
}

export function argumentos({ sessionId = null, modo = 'preguntar' } = {}) {
  const a = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
    '--include-partial-messages', '--permission-prompts', 'host', '--permission-mode', MODOS[modo] ?? MODOS.preguntar];
  if (sessionId) a.push('--resume', sessionId);
  return a;
}

export function crearNormalizador() {
  let mensajeActual = null;
  return (msg) => {
    if (!msg || typeof msg !== 'object' || msg.parent_tool_use_id) return [];
    switch (msg.type) {
      case 'system':
        return msg.subtype === 'init' ? [{ tipo: 'sesion', sessionId: msg.session_id ?? null, modelo: msg.model ?? null }] : [];
      case 'stream_event': {
        const ev = msg.event ?? {};
        if (ev.type === 'message_start') mensajeActual = ev.message?.id ?? null;
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
          return [{ tipo: 'texto-parcial', mensajeId: mensajeActual, delta: ev.delta.text }];
        }
        return [];
      }
      case 'assistant': {
        const bloques = bloquesDe(msg.message?.content);
        return bloques.length ? [{ tipo: 'mensaje', mensajeId: msg.message?.id ?? null, rol: 'asistente', bloques }] : [];
      }
      case 'user': {
        const r = resultadosDe(msg.message?.content);
        return r.length ? [{ tipo: 'mensaje', mensajeId: null, rol: 'herramienta', bloques: r.map((x) => ({ tipo: 'resultado', ...x })) }] : [];
      }
      case 'result': {
        const ok = msg.subtype === 'success' && !msg.is_error;
        return [{ tipo: 'fin-turno', ok, costoUSD: msg.total_cost_usd ?? null, duracionMs: msg.duration_ms ?? null, error: ok ? null : String(msg.result ?? msg.subtype ?? 'error'), sessionId: msg.session_id ?? null }];
      }
      case 'control_request': {
        const r = msg.request ?? {};
        return r.subtype === 'can_use_tool'
          ? [{ tipo: 'permiso', solicitudId: msg.request_id, herramienta: r.tool_name, entrada: r.input ?? {}, motivo: r.decision_reason ?? null }]
          : [];
      }
      default:
        return [];
    }
  };
}

export const mensajeUsuario = (texto) => ({ type: 'user', message: { role: 'user', content: texto }, parent_tool_use_id: null, session_id: '' });
export const respuestaPermiso = (solicitudId, { permitir, mensaje, entrada }) => ({
  type: 'control_response',
  response: {
    subtype: 'success', request_id: solicitudId,
    response: permitir ? { behavior: 'allow', updatedInput: entrada ?? {} } : { behavior: 'deny', message: mensaje ?? 'El usuario denegó el permiso desde el dashboard.' },
  },
});
const pedidoControl = (id, request) => ({ type: 'control_request', request_id: id, request });
const ultimaLinea = (t) => String(t ?? '').trim().split('\n').filter(Boolean).pop() ?? '';

export function abrirProceso({ cwd, sessionId = null, modo = 'preguntar', binario, env = process.env, spawnFn = spawnNodo }) {
  const em = new EventEmitter();
  const entornoHijo = { ...env, ORQUESTADOR_CANAL: 'dashboard' };
  delete entornoHijo.CLAUDECODE; // lanzado desde una sesión de Claude Code: el hijo no debe creerse anidado
  const hijo = spawnFn(binario, argumentos({ sessionId, modo }), {
    cwd, env: entornoHijo, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: /\.cmd$/i.test(String(binario)),
  });
  const normalizar = crearNormalizador();
  const entradas = new Map();
  const decodificador = new StringDecoder('utf8');
  let resto = '';
  let stderr = '';
  let contador = 0;
  let terminado = false;

  const salir = (codigo, error) => {
    if (terminado) return;
    terminado = true;
    em.emit('evento', { tipo: 'salida', codigo, error });
  };
  hijo.stdout?.on('data', (d) => {
    const partes = (resto + decodificador.write(d)).split('\n');
    resto = partes.pop();
    for (const l of partes) {
      if (!l.trim()) continue;
      let msg;
      try { msg = JSON.parse(l); } catch { em.emit('basura', l); continue; }
      for (const e of normalizar(msg)) {
        if (e.tipo === 'permiso') entradas.set(e.solicitudId, e.entrada);
        em.emit('evento', e);
      }
    }
  });
  hijo.stderr?.on('data', (d) => { stderr = (stderr + d).slice(-4000); });
  hijo.stdin?.on('error', () => {});
  hijo.on('error', (err) => salir(null, `No se pudo ejecutar Claude Code: ${err.message}`));
  hijo.on('close', (codigo) => salir(codigo, codigo ? (ultimaLinea(stderr) || `Claude Code terminó con código ${codigo}`) : null));

  const escribir = (obj) => { if (hijo.stdin?.writable) hijo.stdin.write(JSON.stringify(obj) + '\n'); };
  em.pid = hijo.pid ?? null;
  em.enviar = (texto) => escribir(mensajeUsuario(texto));
  em.responderPermiso = (id, { permitir, mensaje } = {}) => {
    const entrada = entradas.get(id);
    entradas.delete(id);
    escribir(respuestaPermiso(id, { permitir, mensaje, entrada }));
  };
  em.cambiarModo = (nuevo) => escribir(pedidoControl(`orq-${++contador}`, { subtype: 'set_permission_mode', mode: MODOS[nuevo] ?? MODOS.preguntar }));
  em.interrumpir = () => escribir(pedidoControl(`orq-${++contador}`, { subtype: 'interrupt' }));
  em.cerrar = () => {
    try { hijo.stdin?.end(); } catch { /* ya cerrado */ }
    setTimeout(() => { if (!terminado) hijo.kill(); }, 3000).unref();
  };
  return em;
}
```

- [ ] **Paso 6: correr y ver que pasan**

Ejecuta: `node --test tests/bloques.test.mjs tests/proceso-claude.test.mjs`
Esperado: PASS. Si los hallazgos de la Tarea 1 marcaron diferencias de formato, aplícalas ahora en `crearNormalizador`, `respuestaPermiso`/`pedidoControl` y `guiones.mjs`, y vuelve a correr.

- [ ] **Paso 7: commit**

```bash
git add plugins/orquestador/dashboard/bloques.mjs plugins/orquestador/dashboard/proceso-claude.mjs tests/fixtures tests/bloques.test.mjs tests/proceso-claude.test.mjs
git commit -m "feat: proceso de Claude en modo stream-json con normalizador y claude falso para tests"
```

---

### Tarea 4: gestor de conversaciones

**Archivos:**
- Crear: `plugins/orquestador/dashboard/conversaciones.mjs`
- Crear: `tests/conversaciones.test.mjs`

**Interfaces:**
- Consume:
  - `abrirProceso`, `resolverBinario` y `MODOS` (Tarea 3).
  - `rutaConversaciones` (Tarea 2) y `cargarConfig(env).conversacionesMax` (Tarea 2).
- Produce:
  - `class ErrorConversacion extends Error { status }`, `etiquetaDe({rama, titulo}) → '[FEAT]'|null` y `clavePermiso(herramienta, entrada) → string`.
  - `crearGestor({ env, spawnFn, ahora }) → Gestor`, con estas operaciones:
    - `on(fn)`: `fn` recibe eventos `chat:*`.
    - `listar() → Conv[]`, `obtener(id) → Conv`, `pendientesDe(id) → Permiso[]` y `hayProcesos() → boolean`.
    - `crear({cwd, modo}) → Conv` y `enviar(id, texto)`.
    - `responderPermiso(id, solicitudId, 'permitir'|'siempre'|'denegar')`, `cambiarModo(id, modo) → Conv` y `renombrar(id, titulo) → Conv`.
    - `interrumpir(id)`, `cerrar(id)` y `apagar(ms) → Promise`.
  - `Conv = { id, sessionId, titulo, cwd, rama, modo, creada, ultima, estado, pid, error, etiqueta }`.
  - Eventos que emite:
    - `chat:estado {conversacion, conv}` y `chat:usuario {conversacion, id, texto}`.
    - `chat:texto-parcial {conversacion, mensajeId, delta}` y `chat:mensaje {conversacion, mensajeId, rol, bloques}`.
    - `chat:permiso {conversacion, solicitudId, herramienta, entrada, motivo}` y `chat:permiso-resuelto {conversacion, solicitudId, decision, herramienta, entrada}`.
    - `chat:fin-turno {conversacion, ok, error, costoUSD, interrumpido}`.

- [ ] **Paso 1: escribir los tests que fallan**

`tests/conversaciones.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { crearGestor, etiquetaDe, clavePermiso, ErrorConversacion } from '../plugins/orquestador/dashboard/conversaciones.mjs';
import { rutaConversaciones } from '../plugins/orquestador/scripts/lib/rutas.mjs';
import { ESPERAR_USUARIO, ESPERAR_RESPUESTA, ESPERAR_PEDIDO, INIT, texto, permiso, fin, finInterrumpido, turnoSimple } from './fixtures/guiones.mjs';

const FALSO = fileURLToPath(new URL('./fixtures/claude-falso.mjs', import.meta.url));

function entorno(guion, config = {}) {
  const home = mkdtempSync(join(tmpdir(), 'orq-conv-'));
  writeFileSync(join(home, 'config.json'), JSON.stringify({ rutaClaude: 'claude-falso', ...config }));
  const archivo = join(home, 'guion.json');
  writeFileSync(archivo, JSON.stringify(guion));
  const registro = join(home, 'registro.jsonl');
  const env = { ORQUESTADOR_HOME: home, FALSO_GUION: archivo, FALSO_REGISTRO: registro, PATH: process.env.PATH, SystemRoot: process.env.SystemRoot };
  const spawnFn = (_bin, args, opciones) => spawn(process.execPath, [FALSO, ...args], opciones);
  const leerRegistro = () => readFileSync(registro, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  return { home, env, spawnFn, leerRegistro };
}

function recolector(gestor) {
  const eventos = [];
  gestor.on((e) => eventos.push(e));
  const hasta = (pred, ms = 5000) => new Promise((ok, mal) => {
    const t0 = Date.now();
    const mirar = () => {
      const e = eventos.find(pred);
      if (e) return ok(e);
      if (Date.now() - t0 > ms) return mal(new Error(`timeout; eventos: ${eventos.map((x) => x.tipo).join(',')}`));
      setTimeout(mirar, 10);
    };
    mirar();
  });
  return { eventos, hasta };
}

const lanza = (fn, status) => assert.throws(fn, (e) => e instanceof ErrorConversacion && e.status === status);

test('etiquetaDe y clavePermiso', () => {
  assert.equal(etiquetaDe({ rama: 'feat/bench-verificadores' }), '[FEAT]');
  assert.equal(etiquetaDe({ titulo: 'ci: windows en rojo', rama: 'main' }), '[CI]');
  assert.equal(etiquetaDe({ rama: 'main' }), null);
  assert.equal(clavePermiso('Bash', { command: 'ls -la' }), 'Bash:ls -la');
  assert.equal(clavePermiso('Edit', { file_path: 'a.js', old_string: 'x' }), 'Edit:a.js');
});

test('crear valida carpeta y modo, persiste y lista', () => {
  const { env, spawnFn, home } = entorno(turnoSimple());
  const g = crearGestor({ env, spawnFn });
  lanza(() => g.crear({ cwd: join(home, 'no-existe') }), 400);
  lanza(() => g.crear({ cwd: home, modo: 'raro' }), 400);
  const c = g.crear({ cwd: home, modo: 'auto' });
  assert.equal(c.titulo, 'Nueva conversación');
  assert.equal(c.estado, 'inactiva');
  assert.equal(JSON.parse(readFileSync(rutaConversaciones(env), 'utf8'))[0].id, c.id);
  assert.equal(g.listar()[0].id, c.id);
  lanza(() => g.obtener('nada'), 404);
});

test('enviar: título, sessionId, eventos de chat y estado lista', async () => {
  const { env, spawnFn, home } = entorno([ESPERAR_USUARIO, INIT, ...texto('m1', 'Ho', 'la'), fin()]);
  const g = crearGestor({ env, spawnFn });
  const { eventos, hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  lanza(() => g.enviar(c.id, '   '), 400);
  g.enviar(c.id, 'Arma los verificadores del benchmark');
  await hasta((e) => e.tipo === 'chat:fin-turno');
  const conv = g.obtener(c.id);
  assert.equal(conv.titulo, 'Arma los verificadores del benchmark');
  assert.equal(conv.sessionId, 'ses-1');
  assert.equal(conv.estado, 'lista');
  const tipos = eventos.filter((e) => e.conversacion === c.id).map((e) => e.tipo);
  for (const t of ['chat:usuario', 'chat:texto-parcial', 'chat:mensaje', 'chat:fin-turno', 'chat:estado']) assert.ok(tipos.includes(t), t);
  await g.apagar();
});

test('tope de conversaciones trabajando responde 409', async () => {
  const { env, spawnFn, home } = entorno([ESPERAR_USUARIO, INIT], { conversacionesMax: 1 });
  const g = crearGestor({ env, spawnFn });
  const a = g.crear({ cwd: home });
  const b = g.crear({ cwd: home });
  g.enviar(a.id, 'uno');
  assert.throws(() => g.enviar(b.id, 'dos'), (e) => e.status === 409 && /1 conversaciones trabajando/.test(e.message));
  await g.apagar();
});

test('permiso: pendiente, "siempre" auto-responde el siguiente igual, y responder dos veces da 404', async () => {
  const { env, spawnFn, home, leerRegistro } = entorno([ESPERAR_USUARIO, INIT, permiso('r1', 'ls'), ESPERAR_RESPUESTA, permiso('r2', 'ls'), ESPERAR_RESPUESTA, fin()]);
  const g = crearGestor({ env, spawnFn });
  const { eventos, hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  g.enviar(c.id, 'lista');
  await hasta((e) => e.tipo === 'chat:permiso' && e.solicitudId === 'r1');
  assert.equal(g.obtener(c.id).estado, 'esperando-permiso');
  assert.equal(g.pendientesDe(c.id)[0].solicitudId, 'r1');
  g.responderPermiso(c.id, 'r1', 'siempre');
  lanza(() => g.responderPermiso(c.id, 'r1', 'permitir'), 404); // otra pestaña responde lo mismo
  lanza(() => g.responderPermiso(c.id, 'r1', 'quizas'), 400);
  await hasta((e) => e.tipo === 'chat:fin-turno');
  assert.equal(eventos.filter((e) => e.tipo === 'chat:permiso').length, 1);
  const respuestas = leerRegistro().filter((r) => r.stdin?.type === 'control_response');
  assert.deepEqual(respuestas.map((r) => r.stdin.response.response.behavior), ['allow', 'allow']);
  await g.apagar();
});

test('salida con error durante el turno deja la conversación en error con el motivo', async () => {
  const { env, spawnFn, home } = entorno([ESPERAR_USUARIO, { salir: 1, stderr: 'Error: no hay sesión iniciada\n' }]);
  const g = crearGestor({ env, spawnFn });
  const { hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  g.enviar(c.id, 'x');
  const e = await hasta((x) => x.tipo === 'chat:estado' && x.conv.estado === 'error');
  assert.match(e.conv.error, /no hay sesión iniciada/);
  assert.equal(g.hayProcesos(), false);
});

test('interrumpir: el fin de turno no queda como error', async () => {
  const { env, spawnFn, home } = entorno([ESPERAR_USUARIO, INIT, ESPERAR_PEDIDO, finInterrumpido]);
  const g = crearGestor({ env, spawnFn });
  const { hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  g.enviar(c.id, 'x');
  await hasta((e) => e.tipo === 'chat:estado' && e.conv.sessionId === 'ses-1');
  g.interrumpir(c.id);
  const f = await hasta((e) => e.tipo === 'chat:fin-turno');
  assert.equal(f.interrumpido, true);
  assert.equal(g.obtener(c.id).estado, 'lista');
  await g.apagar();
});

test('cerrar mientras trabaja deja la conversación inactiva, no en error', async () => {
  const { env, spawnFn, home } = entorno([ESPERAR_USUARIO, INIT]);
  const g = crearGestor({ env, spawnFn });
  const { hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  g.enviar(c.id, 'x');
  await hasta((e) => e.tipo === 'chat:estado' && e.conv.sessionId === 'ses-1');
  g.cerrar(c.id);
  await hasta((e) => e.tipo === 'chat:estado' && e.conv.estado === 'inactiva');
  assert.equal(g.obtener(c.id).error, null);
});

test('al reiniciar, lo que trabajaba queda inactivo y el siguiente mensaje retoma con --resume', async () => {
  const { env, spawnFn, home, leerRegistro } = entorno(turnoSimple());
  mkdirSync(home, { recursive: true });
  writeFileSync(rutaConversaciones(env), JSON.stringify([{ id: 'c1', sessionId: 'ses-1', titulo: 'Previa', cwd: home, rama: null, modo: 'preguntar', creada: 'x', ultima: 'x', estado: 'trabajando', pid: 999999, error: null }]));
  const g = crearGestor({ env, spawnFn });
  const { hasta } = recolector(g);
  assert.deepEqual([g.obtener('c1').estado, g.obtener('c1').pid], ['inactiva', null]);
  g.enviar('c1', 'sigue');
  await hasta((e) => e.tipo === 'chat:fin-turno');
  const argv = leerRegistro()[0].argv;
  assert.equal(argv[argv.indexOf('--resume') + 1], 'ses-1');
  await g.apagar();
});

test('cambiarModo y renombrar validan y persisten', () => {
  const { env, spawnFn, home } = entorno(turnoSimple());
  const g = crearGestor({ env, spawnFn });
  const c = g.crear({ cwd: home });
  assert.equal(g.cambiarModo(c.id, 'auto').modo, 'auto');
  lanza(() => g.cambiarModo(c.id, 'yolo'), 400);
  assert.equal(g.renombrar(c.id, '  ci: arreglar  ').titulo, 'ci: arreglar');
  assert.equal(g.obtener(c.id).etiqueta, '[CI]');
  lanza(() => g.renombrar(c.id, ''), 400);
});
```

- [ ] **Paso 2: correr y ver que fallan**

Ejecuta: `node --test tests/conversaciones.test.mjs`
Esperado: FAIL con `Cannot find module …/conversaciones.mjs`.

- [ ] **Paso 3: implementar**

`plugins/orquestador/dashboard/conversaciones.mjs`:

```js
// Registro y ciclo de vida de las conversaciones del dashboard. Persiste en ~/.claude/orquestador/conversaciones.json.
import { readFileSync, writeFileSync, renameSync, mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { rutaConversaciones } from '../scripts/lib/rutas.mjs';
import { cargarConfig } from '../scripts/lib/config.mjs';
import { abrirProceso, resolverBinario, MODOS } from './proceso-claude.mjs';

export class ErrorConversacion extends Error {
  constructor(status, mensaje) { super(mensaje); this.status = status; }
}

const EN_CURSO = new Set(['trabajando', 'esperando-permiso']);
const TITULO_NUEVO = 'Nueva conversación';
const DE_ARCHIVO = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

export function etiquetaDe({ rama, titulo } = {}) {
  const t = /^([a-z]+)(\([^)]*\))?!?:/i.exec(titulo ?? '');
  if (t) return `[${t[1].toUpperCase()}]`;
  const r = /^([a-z]+)\//i.exec(rama ?? '');
  return r ? `[${r[1].toUpperCase()}]` : null;
}

export function clavePermiso(herramienta, entrada = {}) {
  if (herramienta === 'Bash' || herramienta === 'PowerShell') return `${herramienta}:${entrada.command ?? ''}`;
  if (DE_ARCHIVO.has(herramienta)) return `${herramienta}:${entrada.file_path ?? entrada.notebook_path ?? ''}`;
  return `${herramienta}:${JSON.stringify(entrada)}`;
}

function ramaDe(cwd) {
  try {
    return execFileSync('git', ['-C', cwd, 'branch', '--show-current'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000, windowsHide: true }).trim() || null;
  } catch { return null; }
}

function leerLista(env) {
  try { const l = JSON.parse(readFileSync(rutaConversaciones(env), 'utf8')); return Array.isArray(l) ? l : []; } catch { return []; }
}

export function crearGestor({ env = process.env, spawnFn, ahora = () => new Date().toISOString() } = {}) {
  // Un proceso de una vida anterior del servidor no se puede recuperar: al cerrarse su stdin, claude -p termina solo.
  const lista = leerLista(env).map((c) => (EN_CURSO.has(c.estado) || c.pid ? { ...c, estado: 'inactiva', pid: null } : c));
  const procesos = new Map();
  const pendientes = new Map();
  const reglas = new Map();
  const cerrando = new Set();
  const interrumpidas = new Set();
  const emisor = new EventEmitter();
  emisor.setMaxListeners(0);

  const guardar = () => {
    const ruta = rutaConversaciones(env);
    mkdirSync(dirname(ruta), { recursive: true });
    const tmp = `${ruta}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(lista, null, 2));
    renameSync(tmp, ruta);
  };
  const emitir = (e) => emisor.emit('chat', e);
  const publica = (c) => ({ ...c, etiqueta: etiquetaDe(c) });
  const emitirEstado = (c) => emitir({ tipo: 'chat:estado', conversacion: c.id, conv: publica(c) });
  const buscar = (id) => {
    const c = lista.find((x) => x.id === id);
    if (!c) throw new ErrorConversacion(404, 'No existe esa conversación');
    return c;
  };
  const enCurso = () => lista.filter((c) => EN_CURSO.has(c.estado)).length;
  if (lista.length) guardar();

  function asegurarProceso(c) {
    if (procesos.has(c.id)) return procesos.get(c.id);
    const binario = resolverBinario(cargarConfig(env), env);
    if (!binario) throw new ErrorConversacion(500, 'No encontré el binario de Claude Code; define rutaClaude en config.json');
    const p = abrirProceso({ cwd: c.cwd, sessionId: c.sessionId, modo: c.modo, binario, env, spawnFn });
    procesos.set(c.id, p);
    pendientes.set(c.id, new Map());
    c.pid = p.pid;
    p.on('evento', (e) => manejarEvento(c, e));
    return p;
  }

  function manejarEvento(c, e) {
    switch (e.tipo) {
      case 'sesion':
        if (e.sessionId && e.sessionId !== c.sessionId) { c.sessionId = e.sessionId; guardar(); emitirEstado(c); }
        return;
      case 'permiso': {
        if ((reglas.get(c.id) ?? []).includes(clavePermiso(e.herramienta, e.entrada))) {
          procesos.get(c.id)?.responderPermiso(e.solicitudId, { permitir: true });
          return;
        }
        const p = { solicitudId: e.solicitudId, herramienta: e.herramienta, entrada: e.entrada ?? {}, motivo: e.motivo ?? null };
        pendientes.get(c.id)?.set(e.solicitudId, p);
        c.estado = 'esperando-permiso';
        emitir({ tipo: 'chat:permiso', conversacion: c.id, ...p });
        emitirEstado(c);
        return;
      }
      case 'texto-parcial':
      case 'mensaje':
        emitir({ ...e, tipo: `chat:${e.tipo}`, conversacion: c.id });
        return;
      case 'fin-turno': {
        const interrumpido = interrumpidas.delete(c.id);
        if (e.sessionId) c.sessionId = e.sessionId;
        const ok = e.ok || interrumpido;
        c.estado = ok ? 'lista' : 'error';
        c.error = ok ? null : e.error;
        c.ultima = ahora();
        guardar();
        emitir({ tipo: 'chat:fin-turno', conversacion: c.id, ok: e.ok, error: c.error, costoUSD: e.costoUSD ?? null, interrumpido });
        emitirEstado(c);
        return;
      }
      case 'salida':
        procesos.delete(c.id);
        pendientes.delete(c.id);
        interrumpidas.delete(c.id);
        c.pid = null;
        if (cerrando.delete(c.id)) { c.estado = 'inactiva'; c.error = null; }
        else if (EN_CURSO.has(c.estado) || e.codigo !== 0) { c.estado = 'error'; c.error = e.error ?? 'Claude Code terminó inesperadamente'; }
        else if (c.estado !== 'error') c.estado = 'inactiva';
        guardar();
        emitirEstado(c);
        return;
      default:
    }
  }

  return {
    on: (fn) => emisor.on('chat', fn),
    listar: () => [...lista].sort((a, b) => String(b.ultima).localeCompare(String(a.ultima))).map(publica),
    obtener: (id) => publica(buscar(id)),
    pendientesDe: (id) => [...(pendientes.get(buscar(id).id)?.values() ?? [])],
    hayProcesos: () => procesos.size > 0,

    crear({ cwd, modo = 'preguntar' } = {}) {
      if (!MODOS[modo]) throw new ErrorConversacion(400, `Modo desconocido: ${modo}`);
      let esDir = false;
      try { esDir = !!cwd && statSync(String(cwd)).isDirectory(); } catch { /* no existe */ }
      if (!esDir) throw new ErrorConversacion(400, 'La carpeta no existe o no es un directorio');
      const c = { id: randomUUID(), sessionId: null, titulo: TITULO_NUEVO, cwd: String(cwd), rama: ramaDe(String(cwd)), modo, creada: ahora(), ultima: ahora(), estado: 'inactiva', pid: null, error: null };
      lista.push(c);
      guardar();
      emitirEstado(c);
      return publica(c);
    },

    enviar(id, texto) {
      const c = buscar(id);
      const t = String(texto ?? '').trim();
      if (!t) throw new ErrorConversacion(400, 'El mensaje está vacío');
      const max = cargarConfig(env).conversacionesMax;
      if (!EN_CURSO.has(c.estado) && enCurso() >= max) throw new ErrorConversacion(409, `Hay ${enCurso()} conversaciones trabajando; espera o detén una`);
      const p = asegurarProceso(c);
      if (c.titulo === TITULO_NUEVO) c.titulo = t.length > 60 ? `${t.slice(0, 59)}…` : t;
      c.estado = 'trabajando';
      c.error = null;
      c.ultima = ahora();
      emitir({ tipo: 'chat:usuario', conversacion: c.id, id: randomUUID(), texto: t });
      p.enviar(t);
      guardar();
      emitirEstado(c);
    },

    responderPermiso(id, solicitudId, decision) {
      const c = buscar(id);
      if (!['permitir', 'siempre', 'denegar'].includes(decision)) throw new ErrorConversacion(400, 'Decisión inválida');
      const mapa = pendientes.get(c.id);
      const p = mapa?.get(solicitudId);
      if (!p) throw new ErrorConversacion(404, 'Ese permiso ya no está pendiente');
      if (decision === 'siempre') reglas.set(c.id, [...(reglas.get(c.id) ?? []), clavePermiso(p.herramienta, p.entrada)]);
      procesos.get(c.id)?.responderPermiso(solicitudId, { permitir: decision !== 'denegar' });
      mapa.delete(solicitudId);
      if (!mapa.size && c.estado === 'esperando-permiso') c.estado = 'trabajando';
      emitir({ tipo: 'chat:permiso-resuelto', conversacion: c.id, solicitudId, decision, herramienta: p.herramienta, entrada: p.entrada });
      emitirEstado(c);
    },

    cambiarModo(id, modo) {
      const c = buscar(id);
      if (!MODOS[modo]) throw new ErrorConversacion(400, `Modo desconocido: ${modo}`);
      c.modo = modo;
      procesos.get(c.id)?.cambiarModo(modo);
      guardar();
      emitirEstado(c);
      return publica(c);
    },

    renombrar(id, titulo) {
      const c = buscar(id);
      const t = String(titulo ?? '').trim();
      if (!t || t.length > 120) throw new ErrorConversacion(400, 'El título debe tener entre 1 y 120 caracteres');
      c.titulo = t;
      guardar();
      emitirEstado(c);
      return publica(c);
    },

    interrumpir(id) {
      const c = buscar(id);
      const p = procesos.get(c.id);
      if (p) { interrumpidas.add(c.id); p.interrumpir(); }
    },

    cerrar(id) {
      const c = buscar(id);
      const p = procesos.get(c.id);
      if (p) { cerrando.add(c.id); p.cerrar(); }
    },

    async apagar(ms = 3500) {
      const vivos = [...procesos.entries()];
      if (!vivos.length) return;
      await Promise.race([
        Promise.all(vivos.map(([id, p]) => new Promise((ok) => {
          p.on('evento', (e) => { if (e.tipo === 'salida') ok(); });
          cerrando.add(id);
          p.interrumpir();
          p.cerrar();
        }))),
        new Promise((ok) => setTimeout(ok, ms).unref()),
      ]);
    },
  };
}
```

- [ ] **Paso 4: correr y ver que pasan**

Ejecuta: `node --test tests/conversaciones.test.mjs`
Esperado: PASS (10 tests).

- [ ] **Paso 5: commit**

```bash
git add plugins/orquestador/dashboard/conversaciones.mjs tests/conversaciones.test.mjs
git commit -m "feat: gestor de conversaciones con permisos, tope y retoma por --resume"
```

---

### Tarea 5: lectores de transcripts (historial y pasos de agente)

**Archivos:**
- Crear: `plugins/orquestador/dashboard/historial.mjs`
- Crear: `plugins/orquestador/dashboard/pasos-agente.mjs`
- Crear: `tests/transcripts.test.mjs`

**Interfaces:**
- Consume: `bloquesDe`, `resultadosDe`, `resumenHerramienta`, `recortar` y `textoPlano` (Tarea 3).
- Produce (`historial.mjs`):
  - `dirProyectos(env)`, `buscarTranscript(sessionId, env) → string|null` y `leerCola(ruta, max) → string`.
  - `mensajesDesdeTranscript(texto) → Mensaje[]` y `historialDe(sessionId, env) → { mensajes, aviso }`.
  - `Mensaje = { rol: 'usuario'|'asistente', id, bloques }`. Los bloques de herramienta llevan `resultado: {ok, texto}` cuando hay resultado.
- Produce (`pasos-agente.mjs`):
  - `leerDesde(ruta, desde, max) → { texto, siguiente, existe }`, `pasosDesdeLineas(texto) → Paso[]` y `pasosAgente(ruta, desde) → { pasos, siguiente, existe }`.
  - `Paso = { tipo: 'encargo'|'pensando'|'texto'|'herramienta'|'resultado', hora, resumen, nombre?, usoId?, ok? }`.

- [ ] **Paso 1: escribir los tests que fallan**

`tests/transcripts.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mensajesDesdeTranscript, buscarTranscript, leerCola, historialDe } from '../plugins/orquestador/dashboard/historial.mjs';
import { leerDesde, pasosDesdeLineas, pasosAgente } from '../plugins/orquestador/dashboard/pasos-agente.mjs';

const L = (o) => JSON.stringify(o);
const TRANSCRIPT = [
  '\uFEFF' + L({ type: 'user', uuid: 'u1', message: { role: 'user', content: 'Arma los verificadores' } }),
  L({ type: 'user', uuid: 'u0', message: { role: 'user', content: '<command-name>/clear</command-name>' } }),
  L({ type: 'user', uuid: 'um', isMeta: true, message: { role: 'user', content: 'meta' } }),
  L({ type: 'assistant', message: { id: 'm1', content: [{ type: 'text', text: 'Voy.' }] } }),
  L({ type: 'assistant', message: { id: 'm1', content: [{ type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'ls' } }] } }),
  L({ type: 'assistant', isSidechain: true, message: { id: 'mx', content: [{ type: 'text', text: 'de un subagente' }] } }),
  L({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'a.txt\nb.txt' }] } }),
  '{"type":"assistant","message":{"id":"m2","content":[{"type":"te',
  L({ type: 'assistant', message: { id: 'm3', content: [{ type: 'text', text: 'Listo.' }] } }),
].join('\n');

test('mensajesDesdeTranscript: usuario, asistente fusionado por id, resultado adjunto; omite meta, comandos, sidechain y líneas cortadas', () => {
  const m = mensajesDesdeTranscript(TRANSCRIPT);
  assert.deepEqual(m.map((x) => [x.rol, x.id]), [['usuario', 'u1'], ['asistente', 'm1'], ['asistente', 'm3']]);
  assert.deepEqual(m[1].bloques[1], { tipo: 'herramienta', usoId: 'tu1', nombre: 'Bash', entrada: { command: 'ls' }, resultado: { ok: true, texto: 'a.txt' } });
});

test('buscarTranscript usa CLAUDE_CONFIG_DIR, valida el id y historialDe avisa si no existe', () => {
  const conf = mkdtempSync(join(tmpdir(), 'orq-cfg-'));
  mkdirSync(join(conf, 'projects', 'C--x'), { recursive: true });
  writeFileSync(join(conf, 'projects', 'C--x', 'ses-1.jsonl'), TRANSCRIPT);
  const env = { CLAUDE_CONFIG_DIR: conf };
  assert.equal(buscarTranscript('ses-1', env), join(conf, 'projects', 'C--x', 'ses-1.jsonl'));
  assert.equal(buscarTranscript('../evil', env), null);
  assert.equal(historialDe('ses-1', env).mensajes.length, 3);
  assert.deepEqual(historialDe('ses-2', env), { mensajes: [], aviso: 'No se encontró el transcript de esta conversación' });
  assert.deepEqual(historialDe(null, env), { mensajes: [], aviso: null });
});

test('leerCola descarta la primera línea cortada al truncar', () => {
  const r = join(mkdtempSync(join(tmpdir(), 'orq-cola2-')), 't.jsonl');
  writeFileSync(r, ['aaaaaaaaaa', 'bbb', 'ccc'].join('\n'));
  assert.equal(leerCola(r, 9), 'bbb\nccc');
  assert.equal(leerCola(join(tmpdir(), 'no-existe.jsonl')), '');
});

test('pasosDesdeLineas: encargo, herramienta con resumen, resultado, texto y razonamiento', () => {
  const p = pasosDesdeLineas([
    L({ type: 'user', timestamp: 't0', message: { content: 'Verifica CSV' } }),
    L({ type: 'assistant', timestamp: 't1', message: { content: [{ type: 'thinking', thinking: 'Primero leo' }, { type: 'tool_use', id: 'x', name: 'Read', input: { file_path: 'a.csv' } }] } }),
    L({ type: 'user', timestamp: 't2', message: { content: [{ type: 'tool_result', tool_use_id: 'x', is_error: true, content: 'ENOENT' }] } }),
    L({ type: 'assistant', timestamp: 't3', message: { content: [{ type: 'text', text: 'No existe.' }] } }),
  ].join('\n'));
  assert.deepEqual(p.map((x) => x.tipo), ['encargo', 'pensando', 'herramienta', 'resultado', 'texto']);
  assert.deepEqual([p[2].nombre, p[2].resumen, p[3].ok, p[3].resumen], ['Read', 'a.csv', false, 'ENOENT']);
});

test('leerDesde es incremental, ignora la línea a medias y se reinicia si el archivo se achicó', () => {
  const r = join(mkdtempSync(join(tmpdir(), 'orq-inc-')), 'agent-a1.jsonl');
  writeFileSync(r, `${L({ n: 1 })}\n${L({ n: 2 })}\n`);
  const a = leerDesde(r, 0);
  assert.equal(a.texto.trim().split('\n').length, 2);
  appendFileSync(r, `${L({ n: 3 })}\n{"n":`);
  const b = leerDesde(r, a.siguiente);
  assert.deepEqual(b.texto.trim().split('\n').map((l) => JSON.parse(l).n), [3]);
  assert.equal(leerDesde(r, 10 ** 9).siguiente > 0, true); // desde mayor que el tamaño → desde 0
  assert.deepEqual(leerDesde(join(tmpdir(), 'nada.jsonl'), 0), { texto: '', siguiente: 0, existe: false });
});

test('pasosAgente rechaza rutas que no son .jsonl', () => {
  assert.deepEqual(pasosAgente('/etc/passwd', 0), { pasos: [], siguiente: 0, existe: false });
});
```

- [ ] **Paso 2: correr y ver que fallan**

Ejecuta: `node --test tests/transcripts.test.mjs`
Esperado: FAIL con `Cannot find module …/historial.mjs`.

- [ ] **Paso 3: implementar `historial.mjs`**

```js
// Reconstruye el chat de una conversación desde el transcript de Claude Code (~/.claude/projects/*/<sessionId>.jsonl).
import { readdirSync, existsSync, openSync, readSync, fstatSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { bloquesDe, resultadosDe } from './bloques.mjs';

const MAX_BYTES = 4 * 1024 * 1024;
const ESCONDIDO = /^\s*<(command-|local-command|system-reminder)/;
const mismoBloque = (a, b) => a.tipo === b.tipo && (a.tipo === 'herramienta' ? a.usoId === b.usoId : a.texto === b.texto);

export const dirProyectos = (env = process.env) => join(env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects');

export function buscarTranscript(sessionId, env = process.env) {
  if (!/^[A-Za-z0-9_-]+$/.test(String(sessionId ?? ''))) return null;
  let dirs;
  try { dirs = readdirSync(dirProyectos(env)); } catch { return null; }
  for (const d of dirs) {
    const r = join(dirProyectos(env), d, `${sessionId}.jsonl`);
    if (existsSync(r)) return r;
  }
  return null;
}

export function leerCola(ruta, max = MAX_BYTES) {
  let fd;
  try {
    fd = openSync(ruta, 'r');
    const { size } = fstatSync(fd);
    const n = Math.min(size, max);
    const buf = Buffer.alloc(n);
    readSync(fd, buf, 0, n, size - n);
    const texto = buf.toString('utf8');
    return n < size ? texto.slice(texto.indexOf('\n') + 1) : texto;
  } catch {
    return '';
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function mensajesDesdeTranscript(texto) {
  const mensajes = [];
  const porId = new Map();
  const herramientas = new Map();
  for (const linea of String(texto ?? '').replace(/^\uFEFF/, '').split('\n')) {
    if (!linea.trim()) continue;
    let e;
    try { e = JSON.parse(linea); } catch { continue; }
    if (e.isSidechain || e.isMeta) continue;
    const c = e.message?.content;
    if (e.type === 'user') {
      for (const r of resultadosDe(c)) {
        const h = herramientas.get(r.usoId);
        if (h) h.resultado = { ok: r.ok, texto: r.texto };
      }
      const bloques = bloquesDe(c).filter((b) => b.tipo === 'texto' && !ESCONDIDO.test(b.texto));
      if (bloques.length) mensajes.push({ rol: 'usuario', id: e.uuid ?? `u${mensajes.length}`, bloques });
    } else if (e.type === 'assistant') {
      const id = e.message?.id ?? e.uuid ?? `a${mensajes.length}`;
      let m = porId.get(id);
      if (!m) { m = { rol: 'asistente', id, bloques: [] }; porId.set(id, m); mensajes.push(m); }
      for (const b of bloquesDe(c)) {
        if (m.bloques.some((x) => mismoBloque(x, b))) continue;
        m.bloques.push(b);
        if (b.tipo === 'herramienta') herramientas.set(b.usoId, b);
      }
    }
  }
  return mensajes.filter((m) => m.bloques.length);
}

export function historialDe(sessionId, env = process.env) {
  if (!sessionId) return { mensajes: [], aviso: null };
  const ruta = buscarTranscript(sessionId, env);
  if (!ruta) return { mensajes: [], aviso: 'No se encontró el transcript de esta conversación' };
  return { mensajes: mensajesDesdeTranscript(leerCola(ruta)), aviso: null };
}
```

- [ ] **Paso 4: implementar `pasos-agente.mjs`**

```js
// Pasos de un subagente leídos de su transcript, de forma incremental por offset de bytes.
import { openSync, readSync, fstatSync, closeSync } from 'node:fs';
import { bloquesDe, resultadosDe, resumenHerramienta, recortar, textoPlano } from './bloques.mjs';

const MAX = 1024 * 1024;

export function leerDesde(ruta, desde = 0, max = MAX) {
  let fd;
  try {
    fd = openSync(ruta, 'r');
    const { size } = fstatSync(fd);
    const inicio = Number.isInteger(desde) && desde >= 0 && desde <= size ? desde : 0;
    const n = Math.min(size - inicio, max);
    if (n <= 0) return { texto: '', siguiente: inicio, existe: true };
    const buf = Buffer.alloc(n);
    readSync(fd, buf, 0, n, inicio);
    const corte = buf.lastIndexOf(0x0a);
    if (corte < 0) return { texto: '', siguiente: inicio, existe: true };
    return { texto: buf.subarray(0, corte + 1).toString('utf8'), siguiente: inicio + corte + 1, existe: true };
  } catch {
    return { texto: '', siguiente: 0, existe: false };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function pasosDesdeLineas(texto) {
  const pasos = [];
  for (const linea of String(texto ?? '').replace(/^\uFEFF/, '').split('\n')) {
    if (!linea.trim()) continue;
    let e;
    try { e = JSON.parse(linea); } catch { continue; }
    const hora = e.timestamp ?? null;
    const c = e.message?.content;
    if (e.type === 'user') {
      const resultados = resultadosDe(c);
      for (const r of resultados) pasos.push({ tipo: 'resultado', hora, usoId: r.usoId, ok: r.ok, resumen: r.texto });
      const t = textoPlano(c);
      if (!resultados.length && t.trim()) pasos.push({ tipo: 'encargo', hora, resumen: recortar(t, 300) });
    } else if (e.type === 'assistant') {
      for (const b of bloquesDe(c)) {
        if (b.tipo === 'herramienta') pasos.push({ tipo: 'herramienta', hora, usoId: b.usoId, nombre: b.nombre, resumen: resumenHerramienta(b.nombre, b.entrada) });
        else pasos.push({ tipo: b.tipo, hora, resumen: recortar(b.texto, 300) });
      }
    }
  }
  return pasos;
}

export function pasosAgente(ruta, desde = 0) {
  if (!ruta || !String(ruta).endsWith('.jsonl')) return { pasos: [], siguiente: 0, existe: false };
  const r = leerDesde(ruta, desde);
  return { pasos: pasosDesdeLineas(r.texto), siguiente: r.siguiente, existe: r.existe };
}
```

- [ ] **Paso 5: correr y ver que pasan**

Ejecuta: `node --test tests/transcripts.test.mjs`
Esperado: PASS (6 tests).

- [ ] **Paso 6: commit**

```bash
git add plugins/orquestador/dashboard/historial.mjs plugins/orquestador/dashboard/pasos-agente.mjs tests/transcripts.test.mjs
git commit -m "feat: historial del chat y pasos de agentes desde los transcripts"
```

---

### Tarea 6: autenticación y modo remoto

**Archivos:**
- Crear: `plugins/orquestador/dashboard/auth.mjs`
- Crear: `tests/auth.test.mjs`

**Interfaces:**
- Consume: `rutaToken` (Tarea 2).
- Produce:
  - `validarRemoto(remoto) → host de escucha` (lanza `Error` si `escuchar` es `0.0.0.0` o `::` sin `hostsPermitidos`).
  - `crearAuth({ env, remoto, ahora }) → { token, hostPermitido(host), autenticado(req), origenValido(req), canjear(req, token) → { status: 302|401|429, cookie? } }`. Escribe el token en `rutaToken(env)`.

- [ ] **Paso 1: escribir los tests que fallan**

`tests/auth.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearAuth, validarRemoto } from '../plugins/orquestador/dashboard/auth.mjs';
import { rutaToken } from '../plugins/orquestador/scripts/lib/rutas.mjs';

const env = () => ({ ORQUESTADOR_HOME: mkdtempSync(join(tmpdir(), 'orq-auth-')) });
const req = (headers = {}, ip = '127.0.0.1') => ({ headers, socket: { remoteAddress: ip } });

test('token: 64 hex, guardado en disco', () => {
  const e = env();
  const a = crearAuth({ env: e });
  assert.match(a.token, /^[0-9a-f]{64}$/);
  assert.equal(readFileSync(rutaToken(e), 'utf8'), a.token);
});

test('canjear: token malo 401, bueno 302 con cookie HttpOnly SameSite=Strict, y la cookie autentica', () => {
  const a = crearAuth({ env: env() });
  assert.equal(a.canjear(req(), 'malo').status, 401);
  const r = a.canjear(req(), a.token);
  assert.equal(r.status, 302);
  assert.match(r.cookie, /^orq_sesion=[0-9a-f]{48}; HttpOnly; SameSite=Strict; Path=\/$/);
  assert.equal(a.autenticado(req({ cookie: `otra=1; ${r.cookie.split(';')[0]}` })), true);
  assert.equal(a.autenticado(req({ cookie: 'orq_sesion=inventada' })), false);
  assert.equal(a.autenticado(req()), false);
  assert.match(a.canjear(req({ 'x-forwarded-proto': 'https' }), a.token).cookie, /; Secure$/);
});

test('límite: 10 intentos fallidos por minuto por IP, luego 429 incluso con el token correcto', () => {
  let t = 0;
  const a = crearAuth({ env: env(), ahora: () => t });
  for (let i = 0; i < 10; i++) assert.equal(a.canjear(req({}, '10.0.0.5'), 'x').status, 401);
  assert.equal(a.canjear(req({}, '10.0.0.5'), a.token).status, 429);
  assert.equal(a.canjear(req({}, '10.0.0.6'), a.token).status, 302);
  t = 61_000;
  assert.equal(a.canjear(req({}, '10.0.0.5'), a.token).status, 302);
});

test('Origin debe coincidir con Host', () => {
  const a = crearAuth({ env: env() });
  assert.equal(a.origenValido(req({ host: '127.0.0.1:4321', origin: 'http://127.0.0.1:4321' })), true);
  assert.equal(a.origenValido(req({ host: '127.0.0.1:4321', origin: 'http://evil.example' })), false);
  assert.equal(a.origenValido(req({ host: '127.0.0.1:4321' })), false);
});

test('hosts: locales siempre; remotos solo si el modo remoto está activo y listados', () => {
  const local = crearAuth({ env: env() });
  assert.equal(local.hostPermitido('127.0.0.1:4321'), true);
  assert.equal(local.hostPermitido('localhost'), true);
  assert.equal(local.hostPermitido('mi-pc.tailnet.ts.net:4321'), false);
  const remoto = crearAuth({ env: env(), remoto: { activo: true, escuchar: '100.64.0.7', hostsPermitidos: ['mi-pc.tailnet.ts.net'] } });
  assert.equal(remoto.hostPermitido('mi-pc.tailnet.ts.net:4321'), true);
  assert.equal(remoto.hostPermitido('100.64.0.7:4321'), true);
  assert.equal(remoto.hostPermitido('evil.example'), false);
});

test('validarRemoto', () => {
  assert.equal(validarRemoto({ activo: false, escuchar: '0.0.0.0' }), '127.0.0.1');
  assert.equal(validarRemoto({ activo: true, escuchar: '100.64.0.7', hostsPermitidos: [] }), '100.64.0.7');
  assert.throws(() => validarRemoto({ activo: true, escuchar: '0.0.0.0', hostsPermitidos: [] }), /hostsPermitidos/);
  assert.equal(validarRemoto({ activo: true, escuchar: '0.0.0.0', hostsPermitidos: ['a.ts.net'] }), '0.0.0.0');
});
```

- [ ] **Paso 2: correr y ver que fallan**

Ejecuta: `node --test tests/auth.test.mjs`
Esperado: FAIL con `Cannot find module …/auth.mjs`.

- [ ] **Paso 3: implementar**

`plugins/orquestador/dashboard/auth.mjs`:

```js
// Autenticación del dashboard: token por arranque, cookie de sesión, Origin y Host permitidos, modo remoto.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { rutaToken } from '../scripts/lib/rutas.mjs';

const HOST_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const COOKIE = 'orq_sesion';
const VENTANA_MS = 60_000;
const MAX_INTENTOS = 10;
const TODAS = new Set(['0.0.0.0', '::']);

export function validarRemoto(remoto = {}) {
  if (!remoto.activo) return '127.0.0.1';
  const escuchar = remoto.escuchar || '127.0.0.1';
  if (TODAS.has(escuchar) && !(remoto.hostsPermitidos ?? []).length) {
    throw new Error('Modo remoto: escuchar en todas las interfaces exige hostsPermitidos en ~/.claude/orquestador/config.json');
  }
  return escuchar;
}

const sinPuerto = (host) => String(host ?? '').toLowerCase().replace(/:\d+$/, '').replace(/^\[|\]$/g, '');

export function crearAuth({ env = process.env, remoto = {}, ahora = Date.now } = {}) {
  const token = randomBytes(32).toString('hex');
  const ruta = rutaToken(env);
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, token, { mode: 0o600 });
  try { chmodSync(ruta, 0o600); } catch { /* en Windows manda el ACL del perfil */ }

  const sesiones = new Set();
  const intentos = new Map();
  const permitidos = new Set(remoto.activo ? (remoto.hostsPermitidos ?? []).map(sinPuerto) : []);
  if (remoto.activo && remoto.escuchar && !TODAS.has(remoto.escuchar)) permitidos.add(sinPuerto(remoto.escuchar));

  const cookieDe = (req) => {
    for (const parte of String(req.headers.cookie ?? '').split(';')) {
      const [k, ...v] = parte.trim().split('=');
      if (k === COOKIE) return v.join('=');
    }
    return null;
  };
  const igual = (a, b) => {
    const x = Buffer.from(String(a ?? ''));
    const y = Buffer.from(String(b));
    return x.length === y.length && timingSafeEqual(x, y);
  };

  return {
    token,
    hostPermitido: (host) => HOST_LOCAL.test(host ?? '') || permitidos.has(sinPuerto(host)),
    autenticado: (req) => { const c = cookieDe(req); return !!c && sesiones.has(c); },
    origenValido: (req) => { try { return new URL(req.headers.origin).host === req.headers.host; } catch { return false; } },
    canjear(req, candidato) {
      const ip = req.socket?.remoteAddress ?? '?';
      const t = ahora();
      const recientes = (intentos.get(ip) ?? []).filter((x) => t - x < VENTANA_MS);
      intentos.set(ip, recientes);
      if (recientes.length >= MAX_INTENTOS) return { status: 429 };
      if (!igual(candidato, token)) { recientes.push(t); return { status: 401 }; }
      const s = randomBytes(24).toString('hex');
      sesiones.add(s);
      const seguro = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      return { status: 302, cookie: `${COOKIE}=${s}; HttpOnly; SameSite=Strict; Path=/${seguro}` };
    },
  };
}
```

- [ ] **Paso 4: correr y ver que pasan**

Ejecuta: `node --test tests/auth.test.mjs`
Esperado: PASS (6 tests).

- [ ] **Paso 5: commit**

```bash
git add plugins/orquestador/dashboard/auth.mjs tests/auth.test.mjs
git commit -m "feat: autenticación del dashboard con token, cookie, Origin y modo remoto"
```

---

### Tarea 7: servidor con API, estáticos por lista y SSE de chat, más el lanzador

**Archivos:**
- Modificar: `plugins/orquestador/dashboard/server.mjs` (se reescribe; ver código)
- Modificar: `plugins/orquestador/dashboard/lanzar.mjs`
- Crear: `tests/helpers/http.mjs`
- Crear: `tests/dashboard-api.test.mjs`
- Modificar: `tests/dashboard-server.test.mjs` y `tests/dashboard-revision.test.mjs` (autenticación en los tests existentes)
- Modificar: `tests/dashboard-lanzar.test.mjs` (test de `urlsRemotas`)

**Interfaces:**
- Consume: `crearGestor`, `ErrorConversacion` (Tarea 4), `crearAuth`, `validarRemoto` (Tarea 6), `historialDe` y `pasosAgente` (Tarea 5).
- Produce:
  - `crearServidor({ env, intervaloMs, inactividadMs, alInactivo, gestor, spawnFn }) → http.Server`, con `.auth`, `.conversaciones` y `.detener() → Promise`.
  - `listarEstaticos(dir) → { '/ruta': 'archivo' }`, `carpetasCon(prefijo) → string[]` y, en `lanzar.mjs`, `urlsRemotas(config, token) → string[]`.
  - El SSE emite `event: chat` con los eventos del gestor. Los eventos `evento` y `replay-fin` no cambian.

- [ ] **Paso 1: crear los helpers HTTP de tests**

`tests/helpers/http.mjs`:

```js
// Helpers HTTP/SSE para tests del servidor del dashboard (http.request permite fijar Host y Origin).
import { request } from 'node:http';

export function pedir(base, ruta, { metodo = 'GET', headers = {}, cuerpo } = {}) {
  return new Promise((ok, mal) => {
    const datos = cuerpo === undefined ? null : JSON.stringify(cuerpo);
    const req = request(base + ruta, { method: metodo, headers: { ...(datos ? { 'content-type': 'application/json' } : {}), ...headers } }, (res) => {
      let t = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { t += d; });
      res.on('end', () => ok({ status: res.statusCode, headers: res.headers, texto: t, json: () => JSON.parse(t) }));
    });
    req.on('error', mal);
    if (datos) req.write(datos);
    req.end();
  });
}

export async function login(base, token) {
  const r = await pedir(base, `/?t=${token}`);
  if (r.status !== 302) throw new Error(`login falló: ${r.status}`);
  return r.headers['set-cookie'][0].split(';')[0];
}

export const post = (base, ruta, cuerpo, cookie, origin = base) => pedir(base, ruta, { metodo: 'POST', cuerpo, headers: { cookie, origin } });

export function escucharSse(base, cookie, alEvento) {
  const req = request(base + '/eventos', { headers: { cookie } }, (res) => {
    let buf = '';
    res.setEncoding('utf8');
    res.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const bloque = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const ev = /^event: (.+)$/m.exec(bloque)?.[1];
        const data = /^data: (.+)$/m.exec(bloque)?.[1];
        if (ev && data) alEvento(ev, JSON.parse(data));
      }
    });
  });
  req.on('error', () => {});
  req.end();
  return req;
}
```

- [ ] **Paso 2: escribir los tests que fallan**

`tests/dashboard-api.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { crearServidor, carpetasCon } from '../plugins/orquestador/dashboard/server.mjs';
import { rutaEventos } from '../plugins/orquestador/scripts/lib/rutas.mjs';
import { pedir, login, post, escucharSse } from './helpers/http.mjs';
import { ESPERAR_USUARIO, ESPERAR_RESPUESTA, INIT, texto, permiso, fin } from './fixtures/guiones.mjs';

const FALSO = fileURLToPath(new URL('./fixtures/claude-falso.mjs', import.meta.url));

async function levantar(guion = [ESPERAR_USUARIO, INIT, ...texto('m1', 'Hola'), fin()]) {
  const home = mkdtempSync(join(tmpdir(), 'orq-api-'));
  writeFileSync(join(home, 'config.json'), JSON.stringify({ rutaClaude: 'claude-falso' }));
  writeFileSync(join(home, 'guion.json'), JSON.stringify(guion));
  writeFileSync(join(home, 'events.jsonl'), '');
  const env = { ORQUESTADOR_HOME: home, CLAUDE_CONFIG_DIR: mkdtempSync(join(tmpdir(), 'orq-cfg-')), FALSO_GUION: join(home, 'guion.json'), FALSO_REGISTRO: join(home, 'registro.jsonl'), PATH: process.env.PATH, SystemRoot: process.env.SystemRoot };
  const spawnFn = (_b, args, o) => spawn(process.execPath, [FALSO, ...args], o);
  const srv = crearServidor({ env, intervaloMs: 20, spawnFn });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { env, home, srv, base };
}

const esperarQue = (lista, pred, ms = 5000) => new Promise((ok, mal) => {
  const t0 = Date.now();
  const mirar = () => { const e = lista.find(pred); if (e) return ok(e); if (Date.now() - t0 > ms) return mal(new Error('timeout')); setTimeout(mirar, 10); };
  mirar();
});

test('login: token malo 401, bueno 302 con cookie; datos protegidos sin cookie 401; /salud abierto', async () => {
  const { srv, base } = await levantar();
  try {
    assert.equal((await pedir(base, '/?t=malo')).status, 401);
    assert.equal((await pedir(base, '/sesiones')).status, 401);
    assert.equal((await pedir(base, '/api/conversaciones')).status, 401);
    assert.equal((await pedir(base, '/eventos')).status, 401);
    assert.equal((await pedir(base, '/salud')).status, 200);
    const cookie = await login(base, srv.auth.token);
    assert.equal((await pedir(base, '/sesiones', { headers: { cookie } })).status, 200);
    assert.deepEqual((await pedir(base, '/api/conversaciones', { headers: { cookie } })).json(), []);
  } finally { await srv.detener(); }
});

test('POST exige Origin del mismo host; cuerpo inválido 400; demasiado grande 413', async () => {
  const { srv, base, home } = await levantar();
  try {
    const cookie = await login(base, srv.auth.token);
    assert.equal((await post(base, '/api/conversaciones', { cwd: home }, cookie, 'http://evil.example')).status, 403);
    assert.equal((await pedir(base, '/api/conversaciones', { metodo: 'POST', cuerpo: { cwd: home }, headers: { cookie } })).status, 403);
    const malo = await pedir(base, '/api/conversaciones', { metodo: 'POST', headers: { cookie, origin: base, 'content-type': 'application/json' } });
    assert.equal(malo.status, 400); // cuerpo vacío → {} → cwd faltante
    assert.equal((await post(base, '/api/conversaciones', { cwd: 'x'.repeat(70_000) }, cookie)).status, 413);
    const ok = await post(base, '/api/conversaciones', { cwd: home }, cookie);
    assert.equal(ok.status, 201);
    assert.equal(ok.json().cwd, home);
  } finally { await srv.detener(); }
});

test('flujo completo: mensaje → SSE chat → permiso → fin → historial', async () => {
  const { srv, base, home } = await levantar([ESPERAR_USUARIO, INIT, permiso('r1', 'ls'), ESPERAR_RESPUESTA, ...texto('m1', 'Listo'), fin()]);
  const recibidos = [];
  let sse;
  try {
    const cookie = await login(base, srv.auth.token);
    sse = escucharSse(base, cookie, (ev, data) => { if (ev === 'chat') recibidos.push(data); });
    const conv = (await post(base, '/api/conversaciones', { cwd: home }, cookie)).json();
    assert.equal((await post(base, `/api/conversaciones/${conv.id}/mensajes`, { texto: 'hola' }, cookie)).status, 202);
    const p = await esperarQue(recibidos, (e) => e.tipo === 'chat:permiso');
    const h1 = (await pedir(base, `/api/conversaciones/${conv.id}/historial`, { headers: { cookie } })).json();
    assert.equal(h1.permisos[0].solicitudId, 'r1');
    assert.equal(h1.conversacion.estado, 'esperando-permiso');
    assert.equal((await post(base, `/api/conversaciones/${conv.id}/permisos/${p.solicitudId}`, { decision: 'permitir' }, cookie)).status, 200);
    assert.equal((await post(base, `/api/conversaciones/${conv.id}/permisos/${p.solicitudId}`, { decision: 'permitir' }, cookie)).status, 404);
    await esperarQue(recibidos, (e) => e.tipo === 'chat:fin-turno');
    for (const t of ['chat:usuario', 'chat:texto-parcial', 'chat:mensaje', 'chat:permiso-resuelto']) assert.ok(recibidos.some((e) => e.tipo === t), t);
    const h2 = (await pedir(base, `/api/conversaciones/${conv.id}/historial`, { headers: { cookie } })).json();
    assert.equal(h2.conversacion.estado, 'lista');
    assert.equal(h2.aviso, 'No se encontró el transcript de esta conversación');
    assert.equal((await post(base, `/api/conversaciones/${conv.id}/modo`, { modo: 'auto' }, cookie)).json().modo, 'auto');
    assert.equal((await post(base, `/api/conversaciones/nada/mensajes`, { texto: 'x' }, cookie)).status, 404);
  } finally { sse?.destroy(); await srv.detener(); }
});

test('pasos de agente: sin transcript conocido existe:false; con agente-inicio en el log devuelve pasos', async () => {
  const { srv, base, env, home } = await levantar();
  try {
    const cookie = await login(base, srv.auth.token);
    assert.deepEqual((await pedir(base, '/api/agentes/s1/a1/pasos', { headers: { cookie } })).json(), { pasos: [], siguiente: 0, existe: false });
    assert.equal((await pedir(base, '/api/agentes/s1/..%2Fx/pasos', { headers: { cookie } })).status, 400);
    const ruta = join(home, 's1', 'subagents', 'agent-a1.jsonl');
    mkdirSync(join(home, 's1', 'subagents'), { recursive: true });
    writeFileSync(ruta, JSON.stringify({ type: 'user', message: { content: 'Haz X' } }) + '\n');
    appendFileSync(rutaEventos(env), JSON.stringify({ session: 's1', tipo: 'agente-inicio', id: 't1', agentId: 'a1', transcript: ruta }) + '\n');
    await new Promise((r) => setTimeout(r, 120));
    const r = (await pedir(base, '/api/agentes/s1/a1/pasos?desde=0', { headers: { cookie } })).json();
    assert.deepEqual(r.pasos.map((p) => p.tipo), ['encargo']);
    assert.ok(r.siguiente > 0);
  } finally { await srv.detener(); }
});

test('estáticos por lista: los de public/ se sirven con su tipo; módulos del servidor no', async () => {
  const { srv, base } = await levantar();
  try {
    assert.match((await pedir(base, '/')).headers['content-type'], /text\/html/);
    assert.match((await pedir(base, '/estado-vista.js')).headers['content-type'], /javascript/);
    assert.equal((await pedir(base, '/conversaciones.mjs')).status, 404);
    assert.equal((await pedir(base, '/../server.mjs')).status, 404);
  } finally { await srv.detener(); }
});

test('carpetasCon lista subcarpetas por prefijo e ignora rutas relativas', () => {
  const base = mkdtempSync(join(tmpdir(), 'orq-carp-'));
  for (const d of ['Proyecto A', 'proyecto-b', 'otra', '.oculta']) mkdirSync(join(base, d));
  writeFileSync(join(base, 'proyecto.txt'), '');
  assert.deepEqual(carpetasCon(join(base, 'proy')).sort(), [join(base, 'Proyecto A'), join(base, 'proyecto-b')].sort());
  assert.equal(carpetasCon(base + '/').length, 3);
  assert.deepEqual(carpetasCon('relativa/x'), []);
});
```

Agrega a `tests/dashboard-lanzar.test.mjs`. En el import, agrega `urlsRemotas`:

```js
import { estaCorriendo, comandoAbrir, urlsRemotas } from '../plugins/orquestador/dashboard/lanzar.mjs';
```

y al final:

```js
test('urlsRemotas: vacío si el modo remoto está apagado; una URL con token por host', () => {
  assert.deepEqual(urlsRemotas({ puertoDashboard: 4321, remoto: { activo: false } }, 't'), []);
  assert.deepEqual(urlsRemotas({ puertoDashboard: 4321, remoto: { activo: true, escuchar: '100.64.0.7', hostsPermitidos: [] } }, 't'), ['http://100.64.0.7:4321/?t=t']);
  assert.deepEqual(urlsRemotas({ puertoDashboard: 4321, remoto: { activo: true, escuchar: '0.0.0.0', hostsPermitidos: ['pc.ts.net'] } }, 't'), ['http://pc.ts.net:4321/?t=t']);
});
```

- [ ] **Paso 3: correr y ver que fallan**

Ejecuta: `node --test tests/dashboard-api.test.mjs tests/dashboard-lanzar.test.mjs`
Esperado: FAIL (`carpetasCon` y `urlsRemotas` no existen; `srv.auth` es undefined).

- [ ] **Paso 4: reescribir `server.mjs`**

Reemplaza `plugins/orquestador/dashboard/server.mjs` completo por:

```js
#!/usr/bin/env node
// Servidor local del dashboard: estáticos, SSE (events.jsonl + chat), API de conversaciones y autenticación.
// Uso: node server.mjs [puerto]
import { createServer } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { join, extname, dirname, basename, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { cargarConfig } from '../scripts/lib/config.mjs';
import { rutaEventos } from '../scripts/lib/rutas.mjs';
import { leerEstado } from '../scripts/lib/estado.mjs';
import { esPrincipal } from '../scripts/lib/hook-io.mjs';
import { crearSeguidor, parsearLineas, listarSesiones } from './datos.mjs';
import { crearGestor, ErrorConversacion } from './conversaciones.mjs';
import { crearAuth, validarRemoto } from './auth.mjs';
import { historialDe } from './historial.mjs';
import { pasosAgente } from './pasos-agente.mjs';

export const RAIZ_DASHBOARD = fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
export const VERSION = (() => {
  try { return JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8')).version; } catch { return null; }
})();
const PUBLICO = join(RAIZ_DASHBOARD, 'public');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const PROTEGIDAS = new Set(['/eventos', '/sesiones', '/estado']);
const MAX_HISTORIAL = 2000;
const COLA_INICIAL_BYTES = 4 * 1024 * 1024; // al arrancar se lee solo el final del log
const MAX_CUERPO = 64 * 1024;
const LATIDO_MS = 15000;
const INACTIVIDAD_MS = 30 * 60 * 1000;

const enviar = (res, evento, datos) => res.write(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`);
const json = (res, datos, status = 200) => res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }).end(JSON.stringify(datos));

// Lista blanca de estáticos: solo los archivos de public/ con extensión conocida.
export function listarEstaticos(dir = PUBLICO) {
  const mapa = { '/': 'index.html' };
  for (const f of readdirSync(dir)) if (TIPOS[extname(f)]) mapa[`/${f}`] = f;
  return mapa;
}

// Autocompletado de "Nueva conversación": subcarpetas visibles que empiezan con el prefijo (máx. 20).
export function carpetasCon(prefijo) {
  const p = String(prefijo ?? '').trim();
  const terminaEnSeparador = /[\\/]$/.test(p);
  const base = !p ? homedir() : terminaEnSeparador ? p : dirname(p);
  const inicio = p && !terminaEnSeparador ? basename(p).toLowerCase() : '';
  if (!isAbsolute(base)) return [];
  try {
    return readdirSync(base, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name.toLowerCase().startsWith(inicio))
      .slice(0, 20)
      .map((d) => join(base, d.name));
  } catch {
    return [];
  }
}

function leerCuerpo(req) {
  return new Promise((ok, mal) => {
    let texto = '';
    let bytes = 0;
    req.setEncoding('utf8');
    req.on('data', (d) => {
      bytes += Buffer.byteLength(d);
      if (bytes > MAX_CUERPO) { mal(new ErrorConversacion(413, 'El cuerpo es demasiado grande')); req.resume(); return; }
      texto += d;
    });
    req.on('end', () => { if (bytes > MAX_CUERPO) return; try { ok(texto ? JSON.parse(texto) : {}); } catch { mal(new ErrorConversacion(400, 'JSON inválido')); } });
    req.on('error', mal);
  });
}

export function crearServidor({ env = process.env, intervaloMs = 400, inactividadMs = null, alInactivo = () => {}, gestor = null, spawnFn } = {}) {
  const config = cargarConfig(env);
  const auth = crearAuth({ env, remoto: config.remoto });
  const conversaciones = gestor ?? crearGestor({ env, spawnFn });
  const estaticos = listarEstaticos();
  const seguidor = crearSeguidor(rutaEventos(env), { cola: COLA_INICIAL_BYTES });
  const historial = parsearLineas(seguidor.leerNuevas()).slice(-MAX_HISTORIAL);
  const clientes = new Set();
  const transcripts = new Map();
  let ultimaActividad = Date.now();

  const recordar = (e) => {
    if ((e?.tipo === 'agente-inicio' || e?.tipo === 'fin') && e.agentId && e.transcript) transcripts.set(`${e.session}:${e.agentId}`, e.transcript);
  };
  for (const e of historial) recordar(e);

  const tick = setInterval(() => {
    try {
      for (const e of parsearLineas(seguidor.leerNuevas())) {
        recordar(e);
        historial.push(e);
        if (historial.length > MAX_HISTORIAL) historial.shift();
        for (const c of clientes) enviar(c, 'evento', e);
      }
    } catch { /* un error transitorio no debe tumbar el servidor */ }
  }, intervaloMs);
  conversaciones.on((e) => { for (const c of clientes) enviar(c, 'chat', e); });
  const latido = setInterval(() => { for (const c of clientes) c.write(': latido\n\n'); }, LATIDO_MS);
  // Sin pestañas ni conversaciones vivas durante `inactividadMs`, el servidor separado se apaga solo.
  const vigilancia = inactividadMs ? setInterval(() => {
    if (clientes.size > 0 || conversaciones.hayProcesos()) { ultimaActividad = Date.now(); return; }
    if (Date.now() - ultimaActividad > inactividadMs) alInactivo();
  }, Math.max(20, Math.min(inactividadMs / 2, 60000))) : null;

  async function api(req, res, url) {
    const [, recurso, id, accion, extra] = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (req.method === 'GET') {
      if (recurso === 'conversaciones' && !id) return json(res, conversaciones.listar());
      if (recurso === 'conversaciones' && accion === 'historial') {
        const c = conversaciones.obtener(id);
        const h = historialDe(c.sessionId, env);
        return json(res, { conversacion: c, mensajes: h.mensajes, aviso: h.aviso, permisos: conversaciones.pendientesDe(id) });
      }
      if (recurso === 'agentes' && id && extra === 'pasos') {
        if (!/^[A-Za-z0-9_-]+$/.test(accion ?? '')) throw new ErrorConversacion(400, 'Identificador de agente inválido');
        const ruta = transcripts.get(`${id}:${accion}`);
        const desde = Number.parseInt(url.searchParams.get('desde') ?? '0', 10) || 0;
        return json(res, ruta ? pasosAgente(ruta, desde) : { pasos: [], siguiente: 0, existe: false });
      }
      if (recurso === 'carpetas') return json(res, carpetasCon(url.searchParams.get('prefijo')));
      throw new ErrorConversacion(404, 'No encontrado');
    }
    if (req.method !== 'POST') throw new ErrorConversacion(405, 'Método no permitido');
    if (!auth.origenValido(req)) throw new ErrorConversacion(403, 'Origen no permitido');
    const cuerpo = await leerCuerpo(req);
    if (recurso === 'conversaciones' && !id) return json(res, conversaciones.crear(cuerpo), 201);
    if (recurso === 'conversaciones') {
      switch (accion) {
        case 'mensajes': conversaciones.enviar(id, cuerpo.texto); return json(res, { ok: true }, 202);
        case 'permisos': conversaciones.responderPermiso(id, extra, cuerpo.decision); return json(res, { ok: true });
        case 'modo': return json(res, conversaciones.cambiarModo(id, cuerpo.modo));
        case 'titulo': return json(res, conversaciones.renombrar(id, cuerpo.titulo));
        case 'interrumpir': conversaciones.interrumpir(id); return json(res, { ok: true });
        case 'cerrar': conversaciones.cerrar(id); return json(res, { ok: true });
        default:
      }
    }
    throw new ErrorConversacion(404, 'No encontrado');
  }

  async function atender(req, res) {
    if (!auth.hostPermitido(req.headers.host)) { res.writeHead(403).end('Host no permitido'); return; }
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400).end('Petición inválida'); return; }
    if (url.pathname === '/salud') return json(res, { ok: true, app: 'orquestador-dashboard', version: VERSION, raiz: RAIZ_DASHBOARD, pid: process.pid });
    if (url.pathname === '/' && url.searchParams.has('t')) {
      const r = auth.canjear(req, url.searchParams.get('t'));
      if (r.status === 302) { res.writeHead(302, { 'set-cookie': r.cookie, location: '/', 'cache-control': 'no-store' }).end(); return; }
      res.writeHead(r.status, { 'content-type': 'text/plain; charset=utf-8' })
        .end(r.status === 429 ? 'Demasiados intentos; espera un minuto.' : 'Token inválido. Abre el dashboard con /orquestador:dashboard.');
      return;
    }
    const estatico = req.method === 'GET' ? estaticos[url.pathname] : null;
    if (estatico) {
      let cuerpo;
      try { cuerpo = readFileSync(join(PUBLICO, estatico)); } catch { res.writeHead(500).end('Archivo del dashboard no disponible'); return; }
      res.writeHead(200, { 'content-type': TIPOS[extname(estatico)], 'cache-control': 'no-store' }).end(cuerpo);
      return;
    }
    const esApi = url.pathname.startsWith('/api/');
    if (!esApi && !PROTEGIDAS.has(url.pathname)) { res.writeHead(404).end('No encontrado'); return; }
    if (!auth.autenticado(req)) return json(res, { error: 'Falta iniciar sesión. Abre el dashboard con /orquestador:dashboard.' }, 401);
    if (esApi) return api(req, res, url);
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    if (url.pathname === '/sesiones') return json(res, listarSesiones(historial));
    if (url.pathname === '/estado') {
      const session = url.searchParams.get('session');
      const c = cargarConfig(env);
      return json(res, {
        estado: session ? leerEstado(session, env) : null,
        config: { fableMaxPorSesion: c.fableMaxPorSesion, paraleloMax: c.paraleloMax, modelosOrquestador: c.modelosOrquestador },
      });
    }
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write('retry: 2000\n\n');
    for (const e of historial) enviar(res, 'evento', e);
    enviar(res, 'replay-fin', { total: historial.length });
    clientes.add(res);
    ultimaActividad = Date.now();
    res.on('close', () => { clientes.delete(res); ultimaActividad = Date.now(); });
  }

  const servidor = createServer((req, res) => {
    atender(req, res).catch((e) => {
      if (res.headersSent) { res.end(); return; }
      if (e instanceof ErrorConversacion) json(res, { error: e.message }, e.status);
      else json(res, { error: 'Error interno del dashboard' }, 500);
    });
  });
  servidor.on('clientError', (_err, socket) => { if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); });
  servidor.auth = auth;
  servidor.conversaciones = conversaciones;

  servidor.detener = async () => {
    clearInterval(tick);
    clearInterval(latido);
    if (vigilancia) clearInterval(vigilancia);
    for (const c of clientes) c.end();
    await conversaciones.apagar();
    servidor.closeAllConnections?.();
    await new Promise((ok) => servidor.close(() => ok()));
  };
  return servidor;
}

if (esPrincipal(import.meta.url)) {
  const config = cargarConfig();
  const puerto = Number(process.argv[2]) || config.puertoDashboard;
  let host;
  try { host = validarRemoto(config.remoto); } catch (e) { console.error(e.message); process.exit(1); }
  const srv = crearServidor({ inactividadMs: INACTIVIDAD_MS, alInactivo: () => srv.detener().then(() => process.exit(0)) });
  for (const senal of ['SIGINT', 'SIGTERM']) process.on(senal, () => srv.detener().then(() => process.exit(0)));
  srv.listen(puerto, host, () => console.log(`Dashboard del orquestador: http://${host}:${puerto}/`));
}
```

- [ ] **Paso 5: actualizar `lanzar.mjs`**

Agrega `readFileSync` al import de `node:fs` (queda `import { openSync, mkdirSync, readFileSync } from 'node:fs';`), agrega `import { dirBase, rutaToken } from '../scripts/lib/rutas.mjs';` (en lugar del import actual de `dirBase`) y agrega antes de `async function main`:

```js
export function urlsRemotas(config, token) {
  const r = config.remoto ?? {};
  if (!r.activo) return [];
  const hosts = r.hostsPermitidos?.length ? r.hostsPermitidos : [r.escuchar];
  return hosts.map((h) => `http://${h}:${config.puertoDashboard}/?t=${token}`);
}
```

En `main`, reemplaza `const puerto = cargarConfig().puertoDashboard;` por:

```js
  const config = cargarConfig();
  const puerto = config.puertoDashboard;
```

y reemplaza el bloque final, desde `if (!argv.includes('--no-abrir')) {` hasta `console.log(...)`, por:

```js
  let token = '';
  try { token = readFileSync(rutaToken(), 'utf8').trim(); } catch { /* servidor antiguo sin token */ }
  if (!argv.includes('--no-abrir')) {
    const [cmd, args] = comandoAbrir(token ? `${url}?t=${token}` : url);
    spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  }
  console.log(`Dashboard del orquestador: ${url}`);
  if (argv.includes('--remoto')) {
    const urls = urlsRemotas(config, token);
    if (!urls.length) console.log('El modo remoto está apagado. Actívalo en ~/.claude/orquestador/config.json (remoto.activo, escuchar y hostsPermitidos) y vuelve a abrir el dashboard.');
    for (const u of urls) console.log(`Desde otro equipo: ${u}`);
    if (urls.length) console.log('Trátalo como una contraseña: quien tenga este enlace puede ejecutar código en este equipo.');
  }
```

- [ ] **Paso 6: adaptar los tests existentes a la autenticación**

En `tests/dashboard-server.test.mjs`:

1. Agrega `import { login } from './helpers/http.mjs';` a los imports.
2. En `levantar()`, cambia la primera línea a `const env = { ORQUESTADOR_HOME: mkdtempSync(join(tmpdir(), 'orq-srv-')), CLAUDE_CONFIG_DIR: mkdtempSync(join(tmpdir(), 'orq-cfg-')) };` y reemplaza el `return` por:
   ```js
   const base = `http://127.0.0.1:${srv.address().port}`;
   return { env, srv, base, cookie: await login(base, srv.auth.token) };
   ```
3. En el test `salud, sesiones, estado y estáticos`, cambia `const { env, srv, base } = await levantar();` por `const { env, srv, base, cookie } = await levantar();`, `get(base, '/sesiones')` por `get(base, '/sesiones', { cookie })` y `get(base, '/estado?session=s1')` por `get(base, '/estado?session=s1', { cookie })`.
4. En el test `SSE: replay del historial…`, cambia `const { env, srv, base } = await levantar();` por `const { env, srv, base, cookie } = await levantar();` y `request(base + '/eventos', (res) => {` por `request(base + '/eventos', { headers: { cookie } }, (res) => {`.

En `tests/dashboard-revision.test.mjs`, reemplaza el helper `levantar` por:

```js
const levantar = async (opciones = {}) => {
  const env = { ORQUESTADOR_HOME: mkdtempSync(join(tmpdir(), 'orq-rev-')) };
  if (opciones.eventosComoDirectorio) mkdirSync(rutaEventos(env));
  const srv = crearServidor({ env, intervaloMs: 20, ...opciones });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const puerto = srv.address().port;
  const r = await fetch(`http://127.0.0.1:${puerto}/?t=${srv.auth.token}`, { redirect: 'manual' });
  return { srv, puerto, cookie: r.headers.get('set-cookie').split(';')[0] };
};
```

En el test `I3: sin clientes SSE…`, cambia `const { srv, puerto } = await levantar(` por `const { srv, puerto, cookie } = await levantar(` y `request(\`http://127.0.0.1:${puerto}/eventos\`)` por `request(\`http://127.0.0.1:${puerto}/eventos\`, { headers: { cookie } })`.

- [ ] **Paso 7: correr toda la suite**

Ejecuta: `node --test`
Esperado: PASS, salvo el test `index.html: estructura…` de `dashboard-server.test.mjs` y el `M5` de `dashboard-revision.test.mjs`, que siguen pasando porque `index.html` todavía no cambió. Si algo más falla, corrígelo antes de seguir.

- [ ] **Paso 8: commit**

```bash
git add plugins/orquestador/dashboard/server.mjs plugins/orquestador/dashboard/lanzar.mjs tests/helpers tests/dashboard-api.test.mjs tests/dashboard-server.test.mjs tests/dashboard-revision.test.mjs tests/dashboard-lanzar.test.mjs
git commit -m "feat: API de conversaciones, autenticación y SSE de chat en el servidor del dashboard"
```

---

### Tarea 8: módulos puros del frontend

**Archivos:**
- Crear: `plugins/orquestador/dashboard/public/dom.js`
- Crear: `plugins/orquestador/dashboard/public/chat-vista.js`
- Crear: `plugins/orquestador/dashboard/public/plan-vista.js`
- Modificar: `plugins/orquestador/dashboard/public/estado-vista.js` (`reducir`: casos `agente-inicio` y `fin`)
- Crear: `tests/dashboard-ui-puro.test.mjs`

**Interfaces:**
- Produce (`dom.js`):
  - `el(tag, clase, texto)`, `boton(texto, clase, alClic, etiqueta)` y `chipModelo(modelo, esfuerzo)`.
  - `familiaModelo(m) → 'haiku'|'sonnet'|'opus'|'fable'|'heredado'|'desconocido'`, `capitalizar(t)` y `nombreAgente(agente) → 'Guardian Git'`.
  - `claseEstado(nodo) → 'cola'|'trabajando'|'error'|'listo'`, `textoEstado(nodo)` y `horaCorta(ts)`.
  - `preferencia(clave, defecto)` y `guardarPreferencia(clave, valor)`.
- Produce (`chat-vista.js`): `chatVacio()`, `desdeHistorial({conversacion, mensajes, permisos})` y `reducirChat(chat, e) → chat`. La forma es `Chat = { mensajes, parcial, permisos, estado, error }`.
- Produce (`plan-vista.js`): `validarPlan(p) → {ok, plan|error}`, `segmentar(texto) → ({tipo:'texto', texto, aviso?} | {tipo:'plan', plan})[]`, `etapaDeMeta(meta) → 'E3'|null` y `estadoEtapas(plan, nodos) → { E1: 'en-cola'|'trabajando'|'lista'|'fallida' }`.
- Produce (`estado-vista.js`): los nodos guardan `agentId` cuando llega `agente-inicio` o `fin` con `agentId`.

- [ ] **Paso 1: escribir los tests que fallan**

`tests/dashboard-ui-puro.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { familiaModelo, capitalizar, nombreAgente, claseEstado, textoEstado } from '../plugins/orquestador/dashboard/public/dom.js';
import { chatVacio, desdeHistorial, reducirChat } from '../plugins/orquestador/dashboard/public/chat-vista.js';
import { validarPlan, segmentar, etapaDeMeta, estadoEtapas } from '../plugins/orquestador/dashboard/public/plan-vista.js';
import { vistaVacia, reducir } from '../plugins/orquestador/dashboard/public/estado-vista.js';

const PLAN = {
  titulo: 'Rediseño', riesgos: [{ titulo: 'Permisos', planB: 'MCP propio' }],
  etapas: [
    { id: 'E1', titulo: 'Entender', meta: 'Mapear', agentes: [{ tipo: 'Explore', modelo: 'haiku', esfuerzo: 'low' }], barrera: { tipo: 'auto', criterio: 'Spike ok' } },
    { id: 'E2', titulo: 'Construir', meta: 'Tres frentes', agentes: [{ tipo: 'orquestador:implementador', modelo: 'Sonnet' }] },
  ],
};

test('dom: familias, mayúsculas, nombres y estados', () => {
  assert.equal(familiaModelo('claude-sonnet-5-5'), 'sonnet');
  assert.equal(familiaModelo('inherit'), 'heredado');
  assert.equal(familiaModelo(undefined), 'desconocido');
  assert.equal(capitalizar('opus'), 'Opus');
  assert.equal(nombreAgente('orquestador:guardian-git'), 'Guardian Git');
  assert.equal(nombreAgente('Explore'), 'Explore');
  assert.deepEqual([claseEstado(null), claseEstado({ estado: 'activo' }), claseEstado({ estado: 'fallido' }), claseEstado({ estado: 'terminado' })], ['cola', 'trabajando', 'error', 'listo']);
  assert.equal(textoEstado({ estado: 'activo' }), 'Trabajando');
});

test('chat: usuario, parciales, mensaje que reemplaza el parcial y fusión por id sin duplicar', () => {
  const c = chatVacio();
  reducirChat(c, { tipo: 'chat:usuario', id: 'u1', texto: 'hola' });
  reducirChat(c, { tipo: 'chat:texto-parcial', delta: 'Ho' });
  reducirChat(c, { tipo: 'chat:texto-parcial', delta: 'la' });
  assert.equal(c.parcial, 'Hola');
  reducirChat(c, { tipo: 'chat:mensaje', mensajeId: 'm1', rol: 'asistente', bloques: [{ tipo: 'texto', texto: 'Hola' }] });
  reducirChat(c, { tipo: 'chat:mensaje', mensajeId: 'm1', rol: 'asistente', bloques: [{ tipo: 'texto', texto: 'Hola' }, { tipo: 'herramienta', usoId: 't1', nombre: 'Bash', entrada: { command: 'ls' } }] });
  assert.equal(c.parcial, '');
  assert.equal(c.mensajes.length, 2);
  assert.equal(c.mensajes[1].bloques.length, 2);
  reducirChat(c, { tipo: 'chat:mensaje', rol: 'herramienta', bloques: [{ tipo: 'resultado', usoId: 't1', ok: false, texto: 'ENOENT' }] });
  assert.deepEqual(c.mensajes[1].bloques[1].resultado, { ok: false, texto: 'ENOENT' });
});

test('chat: permisos aparecen una vez, se resuelven con registro y el estado final los limpia', () => {
  const c = chatVacio();
  const p = { tipo: 'chat:permiso', solicitudId: 'r1', herramienta: 'Bash', entrada: { command: 'ls' } };
  reducirChat(c, p);
  reducirChat(c, p);
  assert.equal(c.permisos.length, 1);
  reducirChat(c, { tipo: 'chat:permiso-resuelto', solicitudId: 'r1', decision: 'denegar', herramienta: 'Bash', entrada: { command: 'ls' } });
  assert.equal(c.permisos.length, 0);
  assert.equal(c.mensajes.at(-1).bloques[0].decision, 'denegar');
  reducirChat(c, p);
  reducirChat(c, { tipo: 'chat:estado', conv: { estado: 'error', error: 'murió' } });
  assert.deepEqual([c.permisos.length, c.estado, c.error], [0, 'error', 'murió']);
});

test('chat: fin con error agrega un mensaje de error; interrumpido no', () => {
  const c = chatVacio();
  reducirChat(c, { tipo: 'chat:fin-turno', ok: false, error: 'Límite de uso alcanzado' });
  reducirChat(c, { tipo: 'chat:fin-turno', ok: false, interrumpido: true, error: null });
  assert.deepEqual(c.mensajes.map((m) => m.rol), ['error', 'decision']);
  const h = desdeHistorial({ conversacion: { estado: 'lista' }, mensajes: [{ rol: 'usuario', id: 'u', bloques: [{ tipo: 'texto', texto: 'x' }] }], permisos: [] });
  assert.equal(h.mensajes.length, 1);
});

test('plan: valida, segmenta, rechaza inválidos sin romper y calcula estados por prefijo E#', () => {
  assert.equal(validarPlan(PLAN).ok, true);
  assert.equal(validarPlan({ ...PLAN, etapas: [{ ...PLAN.etapas[0], id: 'X1' }] }).ok, false);
  assert.equal(validarPlan({ ...PLAN, etapas: [{ ...PLAN.etapas[0], agentes: [{ tipo: 'a', modelo: 'gpt' }] }] }).ok, false);
  const s = segmentar(`Propongo:\n\`\`\`orquestador-plan\n${JSON.stringify(PLAN)}\n\`\`\`\n¿Apruebas?`);
  assert.deepEqual(s.map((x) => x.tipo), ['texto', 'plan', 'texto']);
  const malo = segmentar('```orquestador-plan\n{no json}\n```');
  assert.equal(malo[0].tipo, 'texto');
  assert.match(malo[0].aviso, /JSON inválido/);
  assert.equal(etapaDeMeta('E2 · Verificadores'), 'E2');
  assert.equal(etapaDeMeta('Verificadores'), null);
  const estados = estadoEtapas(PLAN, [{ meta: 'E1 · Mapear', estado: 'terminado' }, { meta: 'E2 · Frente 1', estado: 'activo' }]);
  assert.deepEqual(estados, { E1: 'lista', E2: 'trabajando' });
  assert.deepEqual(estadoEtapas(PLAN, []), { E1: 'en-cola', E2: 'en-cola' });
});

test('estado-vista: agente-inicio y fin guardan agentId en el nodo', () => {
  const v = vistaVacia();
  reducir(v, { session: 's', tipo: 'delegacion', id: 't1', agente: 'Explore', modelo: 'haiku', ts: '2026-10-12T10:00:00Z' });
  reducir(v, { session: 's', tipo: 'agente-inicio', id: 't1', agentId: 'a1', transcript: '/x/agent-a1.jsonl' });
  assert.equal(v.sesiones.s.nodos.t1.agentId, 'a1');
  reducir(v, { session: 's', tipo: 'delegacion', id: 't2', agente: 'Plan', modelo: 'opus', ts: '2026-10-12T10:00:01Z' });
  reducir(v, { session: 's', tipo: 'fin', id: 't2', agentId: 'a2', ts: '2026-10-12T10:00:02Z' });
  assert.equal(v.sesiones.s.nodos.t2.agentId, 'a2');
});
```

- [ ] **Paso 2: correr y ver que fallan**

Ejecuta: `node --test tests/dashboard-ui-puro.test.mjs`
Esperado: FAIL con `Cannot find module …/public/dom.js`.

- [ ] **Paso 3: implementar `dom.js`**

```js
// Utilidades de DOM compartidas (solo textContent y atributos, nunca innerHTML) y helpers puros de nombres y estados.
export function el(tag, clase, texto) {
  const e = document.createElement(tag);
  if (clase) e.className = clase;
  if (texto != null) e.textContent = texto;
  return e;
}

export function boton(texto, clase, alClic, etiqueta) {
  const b = el('button', clase, texto);
  b.type = 'button';
  if (etiqueta) b.setAttribute('aria-label', etiqueta);
  if (alClic) b.addEventListener('click', alClic);
  return b;
}

export function familiaModelo(modelo) {
  const s = String(modelo ?? '').toLowerCase();
  const f = ['haiku', 'sonnet', 'opus', 'fable'].find((x) => s.includes(x));
  if (f) return f;
  return s === 'heredado' || s === 'inherit' ? 'heredado' : 'desconocido';
}

export const capitalizar = (t) => { const s = String(t ?? ''); return s.charAt(0).toUpperCase() + s.slice(1); };

export function nombreAgente(agente) {
  const base = String(agente ?? '').split(':').pop() || 'subagente';
  return base.split(/[-_]/).filter(Boolean).map(capitalizar).join(' ');
}

export function chipModelo(modelo, esfuerzo) {
  const f = familiaModelo(modelo);
  const c = el('span', `chip-modelo m-${f}`);
  const nombre = f === 'desconocido' ? '—' : f === 'heredado' ? 'Hereda' : capitalizar(f);
  c.append(el('span', 'punto'), document.createTextNode(esfuerzo && esfuerzo !== '—' && esfuerzo !== 'desconocido' ? `${nombre} · ${esfuerzo}` : nombre));
  return c;
}

export const claseEstado = (n) => (!n ? 'cola' : n.estado === 'activo' ? 'trabajando' : n.estado === 'fallido' ? 'error' : n.estado === 'sin-cierre' ? 'cola' : 'listo');
export const textoEstado = (n) => ({ cola: 'En cola', trabajando: 'Trabajando', error: 'Falló', listo: 'Listo' })[claseEstado(n)];
export const horaCorta = (ts) => (ts ? new Date(ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }) : '');

export function preferencia(clave, defecto) {
  try { return localStorage.getItem(clave) ?? defecto; } catch { return defecto; }
}
export function guardarPreferencia(clave, valor) {
  try { localStorage.setItem(clave, valor); } catch { /* sin almacenamiento */ }
}
```

- [ ] **Paso 4: implementar `chat-vista.js`**

```js
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
```

- [ ] **Paso 5: implementar `plan-vista.js`**

```js
// Planes en pipeline: extracción y validación del bloque ```orquestador-plan y estado de cada etapa.
const FAMILIAS = new Set(['haiku', 'sonnet', 'opus', 'fable', 'heredado']);
const BLOQUE = /```orquestador-plan[^\n]*\n([\s\S]*?)```/g;
const esTexto = (x, max = 400) => typeof x === 'string' && x.trim().length > 0 && x.length <= max;

export function validarPlan(p) {
  if (!p || typeof p !== 'object') return { ok: false, error: 'el plan no es un objeto' };
  if (!esTexto(p.titulo, 200)) return { ok: false, error: 'falta el título' };
  if (!Array.isArray(p.etapas) || !p.etapas.length || p.etapas.length > 12) return { ok: false, error: 'debe tener entre 1 y 12 etapas' };
  const ids = new Set();
  for (const [i, e] of p.etapas.entries()) {
    const donde = `etapa ${i + 1}`;
    if (!/^E\d{1,2}$/.test(e?.id ?? '') || ids.has(e.id)) return { ok: false, error: `${donde}: id inválido o repetido` };
    ids.add(e.id);
    if (!esTexto(e.titulo, 80) || !esTexto(e.meta)) return { ok: false, error: `${donde}: falta título o meta` };
    if (!Array.isArray(e.agentes) || !e.agentes.length) return { ok: false, error: `${donde}: sin agentes` };
    for (const a of e.agentes) if (!esTexto(a?.tipo, 80) || !FAMILIAS.has(String(a?.modelo ?? '').toLowerCase())) return { ok: false, error: `${donde}: agente inválido` };
    if (e.barrera != null && (!['auto', 'humana'].includes(e.barrera?.tipo) || !esTexto(e.barrera?.criterio))) return { ok: false, error: `${donde}: barrera inválida` };
  }
  if (p.riesgos != null && (!Array.isArray(p.riesgos) || p.riesgos.some((r) => !esTexto(r?.titulo) || !esTexto(r?.planB)))) return { ok: false, error: 'riesgos inválidos' };
  return { ok: true, plan: p };
}

export function segmentar(texto) {
  const t = String(texto ?? '');
  const out = [];
  let ultimo = 0;
  for (const m of t.matchAll(BLOQUE)) {
    if (m.index > ultimo) out.push({ tipo: 'texto', texto: t.slice(ultimo, m.index) });
    let r;
    try { r = validarPlan(JSON.parse(m[1])); } catch { r = { ok: false, error: 'JSON inválido' }; }
    out.push(r.ok ? { tipo: 'plan', plan: r.plan } : { tipo: 'texto', texto: m[0], aviso: `Plan no válido: ${r.error}` });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < t.length) out.push({ tipo: 'texto', texto: t.slice(ultimo) });
  return out.filter((s) => s.tipo !== 'texto' || s.texto.trim());
}

export const etapaDeMeta = (meta) => /^\s*(E\d{1,2})\s*·/.exec(String(meta ?? ''))?.[1] ?? null;

export function estadoEtapas(plan, nodos = []) {
  const estados = {};
  for (const e of plan.etapas) {
    const suyas = nodos.filter((n) => etapaDeMeta(n.meta) === e.id);
    if (suyas.some((n) => n.estado === 'activo')) estados[e.id] = 'trabajando';
    else if (suyas.some((n) => n.estado === 'fallido')) estados[e.id] = 'fallida';
    else if (suyas.length) estados[e.id] = 'lista';
    else estados[e.id] = 'en-cola';
  }
  return estados;
}
```

- [ ] **Paso 6: guardar `agentId` en `estado-vista.js`**

En `reducir`, dentro del `switch`, agrega antes de `case 'fin': {`:

```js
    case 'agente-inicio': {
      const n = s.nodos[e.id];
      if (n && e.agentId) n.agentId = e.agentId;
      return { vista, efecto: null };
    }
```

y dentro de `case 'fin': {`, justo después de `const n = s.nodos[e.id];`, agrega:

```js
      if (n && e.agentId) n.agentId = e.agentId;
```

- [ ] **Paso 7: correr los tests nuevos y toda la suite**

Ejecuta: `node --test tests/dashboard-ui-puro.test.mjs` y después `node --test`.
Esperado: PASS.

- [ ] **Paso 8: commit**

```bash
git add plugins/orquestador/dashboard/public/dom.js plugins/orquestador/dashboard/public/chat-vista.js plugins/orquestador/dashboard/public/plan-vista.js plugins/orquestador/dashboard/public/estado-vista.js tests/dashboard-ui-puro.test.mjs
git commit -m "feat: reductores puros del chat y de los planes en pipeline"
```

---

### Tarea 9: render del chat, del plan y del panel de agentes

**Archivos:**
- Crear: `plugins/orquestador/dashboard/public/plan.js`
- Crear: `plugins/orquestador/dashboard/public/chat.js`
- Crear: `plugins/orquestador/dashboard/public/agentes-panel.js`
- Modificar: `tests/dashboard-ui-puro.test.mjs` (tests de `verificacion` y `resumenEntrada`)

**Interfaces:**
- Consume: todo `dom.js`, más `segmentar` y `estadoEtapas` (Tarea 8) y `formatoDuracion` y `formatoTokens` (de `estado-vista.js`).
- Produce:
  - `renderPlan(plan, estados, { pendiente, onAprobar, onCambios }) → HTMLElement`.
  - `renderChat(contenedor, chat, ctx)`, con `ctx = { nombreUsuario, nodos, nodosPorId, vacio, verAgente(id), responderPermiso(sid, decision), retomar(), planAcciones: { onAprobar, onCambios } }`. También `resumenEntrada(nombre, entrada) → string`.
  - `renderAgentes(contenedor, { sesion, seleccionado, pasos, onSeleccionar, onVolver })` y `verificacion(nodo) → { texto, clase }`.

- [ ] **Paso 1: escribir los tests que fallan**

Agrega a `tests/dashboard-ui-puro.test.mjs`:

```js
import { verificacion } from '../plugins/orquestador/dashboard/public/agentes-panel.js';
import { resumenEntrada } from '../plugins/orquestador/dashboard/public/chat.js';

test('verificacion: coincide, no coincide, sin resultado, heredado', () => {
  assert.deepEqual(verificacion({ modelo: 'sonnet', resultado: { modeloReal: 'claude-sonnet-5-5' } }), { texto: '✓ Sonnet', clase: 'e-listo' });
  assert.deepEqual(verificacion({ modelo: 'opus', resultado: { modeloReal: 'claude-sonnet-5-5' } }), { texto: '⚠ Sonnet', clase: 'e-error' });
  assert.deepEqual(verificacion({ modelo: 'opus', estado: 'activo' }), { texto: 'Corriendo', clase: 'tenue' });
  assert.equal(verificacion({ modelo: 'heredado', resultado: { modeloReal: 'claude-opus-5-5' } }).clase, 'e-listo');
});

test('resumenEntrada: campo clave por herramienta y JSON recortado para las demás', () => {
  assert.equal(resumenEntrada('Bash', { command: 'npm test' }), 'npm test');
  assert.equal(resumenEntrada('Read', { file_path: 'a.js' }), 'a.js');
  assert.equal(resumenEntrada('X', { a: 1 }), '{"a":1}');
  assert.equal(resumenEntrada('X', { a: 'y'.repeat(500) }).length, 200);
});
```

(Los imports de arriba van con los demás, al principio del archivo.)

- [ ] **Paso 2: correr y ver que fallan**

Ejecuta: `node --test tests/dashboard-ui-puro.test.mjs`
Esperado: FAIL con `Cannot find module …/agentes-panel.js`.

- [ ] **Paso 3: implementar `plan.js`**

```js
// Tarjeta del plan en pipeline: etapas con sus agentes, barreras, obstáculos previstos y acciones.
import { el, boton, chipModelo, nombreAgente } from './dom.js';

const TEXTO_ESTADO = { 'en-cola': 'En cola', trabajando: 'Trabajando', lista: 'Lista', fallida: 'Falló' };

export function renderPlan(plan, estados, { pendiente = false, onAprobar, onCambios } = {}) {
  const s = el('section', 'plan');
  s.setAttribute('aria-label', `Plan: ${plan.titulo}`);
  const barreras = plan.etapas.filter((e) => e.barrera).length;
  const delegaciones = plan.etapas.reduce((n, e) => n + e.agentes.length, 0);
  const cab = el('div', 'plan-cab');
  cab.append(
    el('span', `versalita ${pendiente ? 'e-accion' : 'e-trabajando'}`, pendiente ? 'Plan propuesto · espera tu aprobación' : 'Plan'),
    el('h3', 'serif', plan.titulo),
    el('span', 'tenue', `${plan.etapas.length} etapas · ${barreras} barreras · ${delegaciones} delegaciones`),
  );

  const tuberia = el('div', 'tuberia');
  for (const e of plan.etapas) {
    const estado = estados[e.id] ?? 'en-cola';
    const etapa = el('div', `etapa est-${estado}`);
    const titulo = el('div', 'etapa-titulo');
    titulo.append(el('span', 'mono tenue', e.id), el('span', 'versalita', e.titulo));
    etapa.append(titulo, el('div', 'tenue', e.meta));
    for (const a of e.agentes) {
      const ag = el('div', 'etapa-agente');
      ag.append(el('span', 'nombre', nombreAgente(a.tipo)), chipModelo(a.modelo, a.esfuerzo));
      etapa.append(ag);
    }
    etapa.append(el('span', 'etapa-estado', TEXTO_ESTADO[estado]));
    tuberia.append(etapa);
    if (e.barrera) {
      const b = el('div', `barrera b-${e.barrera.tipo}`);
      b.setAttribute('title', e.barrera.criterio);
      b.append(el('span', 'rombo', e.barrera.tipo === 'humana' ? '!' : '✓'));
      tuberia.append(b);
    }
  }

  const detalle = el('div', 'plan-detalle');
  const colBarreras = el('div');
  colBarreras.append(el('h4', 'versalita', 'Barreras y verificaciones'));
  for (const e of plan.etapas.filter((x) => x.barrera)) {
    const f = el('div', `fila-barrera b-${e.barrera.tipo}`);
    f.append(el('strong', null, `Tras ${e.titulo}`), el('span', 'versalita', e.barrera.tipo === 'humana' ? ' Tú decides' : ' Automática'), el('div', 'tenue', e.barrera.criterio));
    colBarreras.append(f);
  }
  const colRiesgos = el('div');
  colRiesgos.append(el('h4', 'versalita e-error', 'Obstáculos previstos'));
  for (const r of plan.riesgos ?? []) {
    const f = el('div', 'riesgo');
    f.append(el('strong', null, r.titulo), el('div', 'tenue', `Plan B: ${r.planB}`));
    colRiesgos.append(f);
  }
  detalle.append(colBarreras, colRiesgos);
  s.append(cab, tuberia, detalle);

  if (pendiente) {
    const acciones = el('div', 'acciones');
    acciones.append(boton('Aprobar y Ejecutar', 'boton-primario', onAprobar), boton('Pedir Cambios', 'boton-secundario', onCambios));
    s.append(acciones);
  }
  return s;
}
```

- [ ] **Paso 4: implementar `chat.js`**

```js
// Render del chat: mensajes, herramientas, delegaciones, permisos y planes. Sin innerHTML.
import { el, boton, chipModelo, nombreAgente, claseEstado, textoEstado } from './dom.js';
import { segmentar, estadoEtapas } from './plan-vista.js';
import { renderPlan } from './plan.js';

const CAMPO = { Bash: 'command', PowerShell: 'command', Read: 'file_path', Write: 'file_path', Edit: 'file_path', MultiEdit: 'file_path', Grep: 'pattern', Glob: 'pattern', WebFetch: 'url', WebSearch: 'query' };
const DECISION = { permitir: 'Permitiste una vez', siempre: 'Permitido siempre en esta conversación', denegar: 'Denegaste' };

export function resumenEntrada(nombre, entrada = {}) {
  const v = CAMPO[nombre] && entrada[CAMPO[nombre]] != null ? String(entrada[CAMPO[nombre]]) : JSON.stringify(entrada);
  return v.length > 200 ? v.slice(0, 200) : v;
}

function rotuloOrquestador(extra) {
  const r = el('div', 'rotulo');
  r.append(el('span', 'punto-orq'), el('span', 'versalita', 'Orquestador'));
  if (extra) r.append(el('span', 'tenue', extra));
  return r;
}

function bloqueTexto(texto, ctx) {
  const frag = document.createDocumentFragment();
  for (const s of segmentar(texto)) {
    if (s.tipo === 'plan') frag.append(renderPlan(s.plan, estadoEtapas(s.plan, ctx.nodos), { ...ctx.planAcciones, pendiente: ctx.planPendiente }));
    else {
      frag.append(el('div', 'texto', s.texto.trim()));
      if (s.aviso) frag.append(el('div', 'aviso', s.aviso));
    }
  }
  return frag;
}

function bloqueHerramienta(b, ctx) {
  if (b.nombre === 'Agent' || b.nombre === 'Task') {
    const n = ctx.nodosPorId[b.usoId];
    const fila = boton(null, `delegacion e-${claseEstado(n)}`, () => ctx.verAgente?.(b.usoId));
    fila.append(
      el('span', 'punto'), el('span', 'nombre', nombreAgente(b.entrada?.subagent_type ?? 'general-purpose')),
      el('span', 'meta', b.entrada?.description ?? ''), chipModelo(b.entrada?.model, b.entrada?.effort), el('span', 'estado', textoEstado(n)),
    );
    return fila;
  }
  const d = el('div', `herramienta ${b.resultado ? (b.resultado.ok ? 'ok' : 'mal') : 'pendiente'}`);
  d.append(el('span', 'nombre', b.nombre), el('code', null, resumenEntrada(b.nombre, b.entrada)));
  if (b.resultado) d.append(el('span', 'resultado', b.resultado.texto || (b.resultado.ok ? 'ok' : 'error')));
  return d;
}

function renderMensaje(m, ctx) {
  if (m.rol === 'usuario') {
    const d = el('div', 'msg usuario');
    d.append(el('span', 'versalita tenue', ctx.nombreUsuario), el('div', 'burbuja', m.bloques.map((b) => b.texto).join('\n')));
    return d;
  }
  if (m.rol === 'error') {
    const d = el('div', 'msg error e-error');
    d.append(el('span', 'versalita', 'Error'), el('div', 'texto', m.bloques[0]?.texto ?? ''));
    if (ctx.retomar) d.append(boton('Retomar', 'boton-secundario', ctx.retomar));
    return d;
  }
  if (m.rol === 'decision') {
    const b = m.bloques[0];
    const texto = b.tipo === 'interrupcion' ? 'Detuviste el turno.' : `${DECISION[b.decision] ?? b.decision}: ${b.herramienta} ${resumenEntrada(b.herramienta, b.entrada)}`;
    return el('div', `msg decision ${b.decision === 'denegar' ? 'e-error' : 'e-listo'}`, texto);
  }
  const d = el('div', 'msg asistente');
  d.append(rotuloOrquestador());
  for (const b of m.bloques) {
    if (b.tipo === 'texto') d.append(bloqueTexto(b.texto, ctx));
    else if (b.tipo === 'herramienta') d.append(bloqueHerramienta(b, ctx));
    else if (b.tipo === 'pensando') {
      const det = el('details', 'pensando');
      det.append(el('summary', null, 'Razonamiento'), el('div', 'texto', b.texto));
      d.append(det);
    }
  }
  return d;
}

function tarjetaPermiso(p, responder) {
  const s = el('section', 'permiso');
  s.setAttribute('aria-label', 'Solicitud de permiso');
  const cuerpo = el('div', 'permiso-cuerpo');
  cuerpo.append(el('strong', null, `El orquestador quiere usar ${p.herramienta}`), el('code', 'bloque-codigo', resumenEntrada(p.herramienta, p.entrada)));
  if (p.motivo) cuerpo.append(el('span', 'tenue', p.motivo));
  const acciones = el('div', 'acciones');
  acciones.append(
    boton('Permitir', 'boton-primario', () => responder(p.solicitudId, 'permitir')),
    boton('Permitir Siempre en esta Conversación', 'boton-secundario', () => responder(p.solicitudId, 'siempre')),
    boton('Denegar', 'boton-peligro', () => responder(p.solicitudId, 'denegar')),
  );
  cuerpo.append(acciones);
  s.append(el('div', 'permiso-cab versalita', 'Requiere tu permiso'), cuerpo);
  return s;
}

export function renderChat(contenedor, chat, ctx) {
  const abajo = contenedor.scrollHeight - contenedor.scrollTop - contenedor.clientHeight < 80;
  let ultimoAsistente = -1;
  chat.mensajes.forEach((m, i) => { if (m.rol === 'asistente') ultimoAsistente = i; });
  const hijos = chat.mensajes.map((m, i) => renderMensaje(m, { ...ctx, planPendiente: i === ultimoAsistente && chat.estado === 'lista' }));
  if (chat.parcial) {
    const d = el('div', 'msg asistente');
    d.append(rotuloOrquestador('escribiendo'), el('div', 'texto escribiendo', chat.parcial));
    hijos.push(d);
  } else if (chat.estado === 'trabajando') {
    const d = el('div', 'msg asistente');
    d.append(rotuloOrquestador('trabajando…'));
    hijos.push(d);
  }
  for (const p of chat.permisos) hijos.push(tarjetaPermiso(p, ctx.responderPermiso));
  if (!hijos.length) hijos.push(el('div', 'vacio-chat', ctx.vacio));
  contenedor.replaceChildren(...hijos);
  if (abajo) contenedor.scrollTop = contenedor.scrollHeight;
}
```

- [ ] **Paso 5: implementar `agentes-panel.js`**

```js
// Panel lateral de agentes: lista de la sesión con colores de estado y modelo, y detalle en vivo de uno.
import { el, boton, chipModelo, nombreAgente, horaCorta, claseEstado, textoEstado, familiaModelo, capitalizar } from './dom.js';
import { formatoDuracion, formatoTokens } from './estado-vista.js';

const ETIQUETA_PASO = { encargo: 'Encargo', pensando: 'Pensando', texto: 'Respuesta', resultado: 'Resultado' };

export function verificacion(n) {
  const real = n.resultado?.modeloReal;
  if (!real) return { texto: n.estado === 'activo' ? 'Corriendo' : '—', clase: 'tenue' };
  const pedido = familiaModelo(n.modelo);
  const ok = familiaModelo(real) === pedido || pedido === 'heredado' || pedido === 'desconocido';
  return { texto: `${ok ? '✓' : '⚠'} ${capitalizar(familiaModelo(real))}`, clase: ok ? 'e-listo' : 'e-error' };
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

export function renderAgentes(contenedor, { sesion, seleccionado, pasos = [], onSeleccionar, onVolver }) {
  if (seleccionado && sesion?.nodos[seleccionado]) { contenedor.replaceChildren(detalle(sesion.nodos[seleccionado], pasos, onVolver)); return; }
  const nodos = sesion ? sesion.ordenNodos.map((id) => sesion.nodos[id]) : [];
  const activos = nodos.filter((n) => n.estado === 'activo').length;
  const cab = el('div', 'agentes-cab');
  cab.append(el('h2', 'serif', 'Agentes'), el('span', 'tenue', nodos.length ? `${activos} activos · ${nodos.length - activos} terminados` : ''));
  const hijos = [cab];
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
```

- [ ] **Paso 6: correr y ver que pasan**

Ejecuta: `node --test tests/dashboard-ui-puro.test.mjs`
Esperado: PASS.

- [ ] **Paso 7: commit**

```bash
git add plugins/orquestador/dashboard/public/plan.js plugins/orquestador/dashboard/public/chat.js plugins/orquestador/dashboard/public/agentes-panel.js tests/dashboard-ui-puro.test.mjs
git commit -m "feat: render del chat, del plan en pipeline y del panel de agentes"
```

---

### Tarea 10: estructura nueva, tema, actividad portada y app.js

**Archivos:**
- Reescribir: `plugins/orquestador/dashboard/public/index.html`
- Crear: `plugins/orquestador/dashboard/public/tema.css`
- Crear: `plugins/orquestador/dashboard/public/actividad.css` (movido desde `index.html`)
- Crear: `plugins/orquestador/dashboard/public/actividad.js` (movido desde `index.html`)
- Crear: `plugins/orquestador/dashboard/public/app.js`
- Modificar: `tests/dashboard-server.test.mjs` (test `index.html: estructura…`) y `tests/dashboard-revision.test.mjs` (test `M5`)

**Interfaces:**
- Consume: todo lo de las Tareas 8 y 9, más la API de la Tarea 7.
- Produce (`actividad.js`):
  - `iniciarActividad()`, `inicioConexion()`, `procesarEvento(e)` y `finReplay()`.
  - `mostrarSesion(id)`, `vistaActual() → vista` y `alCambiar(fn)`.

- [ ] **Paso 1: actualizar los tests de estructura**

En `tests/dashboard-server.test.mjs`, reemplaza el test `index.html: estructura, módulo de vista y sin innerHTML ni recursos externos` completo por:

```js
test('frontend: estructura, módulos y sin innerHTML ni recursos externos', async () => {
  const { srv, base } = await levantar();
  try {
    const html = (await get(base, '/')).texto;
    for (const id of ['escenario', 'lineas', 'nodos', 'tarjetas', 'centro', 'centro-modelo', 'sesion', 'seguir', 'animaciones', 'conexion', 'stats', 'timeline', 'toast', 'demo', 'vacio',
      'conversaciones', 'nueva', 'uso', 'titulo', 'subtitulo', 'tab-chat', 'tab-actividad', 'vista-chat', 'vista-actividad', 'mensajes', 'composer', 'entrada', 'enviar', 'detener',
      'modo', 'tema', 'panel-agentes', 'menu', 'ver-agentes', 'dialogo-nueva', 'form-nueva', 'carpeta', 'carpetas', 'modo-nueva', 'cancelar-nueva', 'error-nueva']) {
      assert.match(html, new RegExp(`id="${id}"`), `falta #${id}`);
    }
    assert.match(html, /<script type="module" src="\.\/app\.js"><\/script>/);
    assert.match((await get(base, '/actividad.js')).texto, /from '\.\/estado-vista\.js'/);
    assert.match((await get(base, '/actividad.js')).texto, /prefers-reduced-motion/);
    assert.match((await get(base, '/tema.css')).texto, /\[data-tema="claro"\]/);
    for (const archivo of ['/', '/app.js', '/actividad.js', '/chat.js', '/plan.js', '/agentes-panel.js', '/dom.js', '/chat-vista.js', '/plan-vista.js', '/tema.css', '/actividad.css']) {
      const r = await get(base, archivo);
      assert.equal(r.status, 200, archivo);
      assert.doesNotMatch(r.texto, /innerHTML/, `${archivo} usa innerHTML`);
      assert.doesNotMatch(r.texto, /https?:\/\/(?!127\.0\.0\.1)[a-z]/i, `${archivo} carga recursos externos`);
    }
  } finally { await srv.detener(); }
});
```

En `tests/dashboard-revision.test.mjs`, en el test `M5`, cambia `'../plugins/orquestador/dashboard/public/index.html'` por `'../plugins/orquestador/dashboard/public/actividad.css'` y la variable `html` por `css` (las dos apariciones).

- [ ] **Paso 2: correr y ver que fallan**

Ejecuta: `node --test tests/dashboard-server.test.mjs tests/dashboard-revision.test.mjs`
Esperado: FAIL (falta `#conversaciones`; `actividad.css` no existe).

- [ ] **Paso 3: crear `actividad.css` desde el `<style>` actual**

Crea `public/actividad.css` así:

1. Primera parte, literal:
   ```css
   /* Vista Actividad: el orquestador al centro (portada de la fase 2 al tema nuevo). */
   .vista-actividad {
     --fondo-2: var(--hundido); --panel: var(--tarjeta); --panel-2: var(--hundido);
     --suave: var(--texto-2); --tenue: var(--texto-3); --acento: var(--clay); --ok: var(--listo); --aviso: var(--accion);
   }
   ```
2. A continuación, copia **las líneas 31 a 187 del `index.html` actual**, que van desde el comentario `/* Barra superior */` hasta la regla `body.sin-animacion …` inclusive, quitando la indentación de dos espacios.
3. En lo copiado, **elimina** estas reglas, que pasan a `tema.css` o ya no se usan: `.marca`, `.marca .sub`, `.icono-marca`, `.conexion`, `.conexion::before`, `.conexion.ok::before`, `.conexion.error::before`, `.toast` y `.toast.visible`.
4. **Cambia** `.layout { … height: calc(100vh - 53px); … }` por `height: calc(100vh - 128px);` y `.barra { … background: var(--panel); }` por `background: var(--cabecera);`.

Todo lo demás se copia sin cambios: nodos, tarjetas, líneas, centro, chips, stats, timeline, el `@media (max-width: 860px)` y `body.sin-animacion`.

- [ ] **Paso 4: crear `actividad.js` desde el `<script type="module">` actual**

Crea `public/actividad.js` copiando **el contenido del `<script type="module">` del `index.html` actual (líneas 225 a 552)**, desde `import { vistaVacia, …` hasta antes de `</script>`. Después aplica estos cambios exactos:

1. Cambia la primera línea del import por:
   ```js
   // Vista Actividad: el orquestador al centro con tarjetas que viajan. La conexión SSE la maneja app.js.
   import { vistaVacia, reducir, posicionOrbital, disposicion, conciliarConServidor, familia, formatoCosto, formatoDuracion, formatoTokens } from './estado-vista.js';
   import { preferencia as leerPreferencia } from './dom.js'; // el script ya tiene su propia const preferencia (animaciones)
   ```
2. **Borra** la función `estadoConexion` completa y la función `conectar` completa.
3. En `renderStats`, cambia la entrada del costo:
   ```js
   ['Costo', formatoCosto(Math.max(st.costoUSD, servidor?.estado?.costoUSD ?? 0))],
   ```
   por:
   ```js
   ['Costo', leerPreferencia('orq-costo-oculto', '0') === '1' ? '••••' : formatoCosto(Math.max(st.costoUSD, servidor?.estado?.costoUSD ?? 0))],
   ```
4. Reemplaza todo el bloque final, desde `// ---------- arranque ----------` hasta el final del archivo, por:
   ```js
   // ---------- integración con app.js ----------
   const oyentes = new Set();
   const notificar = () => { for (const f of oyentes) f(vista); };
   export const alCambiar = (f) => { oyentes.add(f); };
   export const vistaActual = () => vista;

   // Cada conexión (también las reconexiones) reenvía el historial completo: se parte de cero.
   export function inicioConexion() { vista = vistaVacia(); enReplay = true; }

   export function procesarEvento(e) {
     procesar(e);
     if (!enReplay) notificar();
   }

   export function finReplay() {
     enReplay = false;
     if (!actual || !vista.sesiones[actual]) elegirMasReciente();
     pedirEstado();
     render();
     notificar();
   }

   // La conversación abierta en el chat fija la sesión que muestra la actividad.
   export function mostrarSesion(id) {
     if (!id || id === actual) return;
     actual = id;
     servidor = null;
     ocultos.clear();
     $('tarjetas').replaceChildren();
     $('seguir').checked = false;
     pedirEstado();
     render();
   }

   function aplicarAnimacion() { document.body.classList.toggle('sin-animacion', !animado); $('animaciones').checked = animado; }

   export function iniciarActividad() {
     $('sesion').addEventListener('change', (ev) => { actual = ev.target.value; servidor = null; ocultos.clear(); $('tarjetas').replaceChildren(); pedirEstado(); render(); });
     $('demo').addEventListener('click', demo);
     $('animaciones').addEventListener('change', (ev) => {
       animado = ev.target.checked;
       try { localStorage.setItem('orq-animaciones', animado ? '1' : '0'); } catch { /* sin almacenamiento */ }
       aplicarAnimacion();
     });
     aplicarAnimacion();
     setInterval(pedirEstado, 3000);
     addEventListener('resize', () => render());
     render();
     if (new URLSearchParams(location.search).has('demo')) demo();
   }
   ```

Verifica con `node --check plugins/orquestador/dashboard/public/actividad.js`. Esperado: sin errores de sintaxis.

- [ ] **Paso 5: crear `tema.css`**

```css
/* Tema del dashboard: tokens oscuro (por defecto) y claro, colores con significado, layout y componentes. */
:root, [data-tema="oscuro"] {
  --lateral: #141413; --fondo: #262624; --cabecera: #1F1E1D; --panel: #1A1918; --tarjeta: #30302E; --hundido: #262624;
  --burbuja: #3D3D3A; --codigo: #1A1918; --borde: rgba(250, 249, 245, .09); --borde-fuerte: rgba(250, 249, 245, .18);
  --texto: #FAF9F5; --texto-2: #C2C0B6; --texto-3: #9C9A92; --primario-fondo: #FAF9F5; --primario-texto: #141413;
  --seleccion: rgba(250, 249, 245, .09); --pista: #3D3D3A; --sombra: 0 4px 18px rgba(0, 0, 0, .35);
  --activo: #E08B6D; --accion: #E3B341; --listo: #8DB36B; --error: #E5776A; --cola: #9C9A92;
  --haiku: #4FB3B3; --sonnet: #7EADDB; --opus: #A992DB; --fable: #DB86AB; --heredado: #C2C0B6;
  --clay: #D97757; --enviar: #C6613F;
  --sans: 'Anthropic Sans', system-ui, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  --serif: 'Anthropic Serif', Georgia, 'Times New Roman', Times, serif;
  --mono: 'Anthropic Mono', 'JetBrains Mono', 'Cascadia Mono', Consolas, 'SF Mono', Monaco, monospace;
  color-scheme: dark;
}
[data-tema="claro"] {
  --lateral: #E8E6DC; --fondo: #FAF9F5; --cabecera: #F0EEE6; --panel: #F0EEE6; --tarjeta: #FFFFFF; --hundido: #F5F4ED;
  --burbuja: #E8E6DC; --codigo: #F5F4ED; --borde: rgba(31, 30, 29, .12); --borde-fuerte: rgba(31, 30, 29, .24);
  --texto: #141413; --texto-2: #4D4C48; --texto-3: #5E5D59; --primario-fondo: #141413; --primario-texto: #FAF9F5;
  --seleccion: rgba(31, 30, 29, .08); --pista: #DEDCD1; --sombra: 0 2px 12px rgba(20, 20, 19, .06);
  --activo: #C2593A; --accion: #8F6400; --listo: #3F6B2A; --error: #A63A2E; --cola: #73726C;
  --haiku: #1F7676; --sonnet: #2F6AA3; --opus: #6B4D9E; --fable: #A64D87; --heredado: #4D4C48;
  color-scheme: light;
}

* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body { background: var(--fondo); color: var(--texto); font: 15px/1.5 var(--sans); }
button, select, input, textarea { font: inherit; color: inherit; }
:focus-visible { outline: 2px solid var(--sonnet); outline-offset: 2px; }
.sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.versalita { font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
.serif { font-family: var(--serif); font-weight: 500; }
.mono, code { font-family: var(--mono); font-size: 12.5px; }
.tenue { color: var(--texto-3); }
.fila { display: flex; align-items: center; gap: 8px; min-width: 0; }

/* Colores con significado: estado (--c) y familia de modelo (--c). */
.e-trabajando { --c: var(--activo); } .e-accion { --c: var(--accion); } .e-listo { --c: var(--listo); }
.e-cola { --c: var(--cola); } .e-error { --c: var(--error); }
.m-haiku { --c: var(--haiku); } .m-sonnet { --c: var(--sonnet); } .m-opus { --c: var(--opus); } .m-fable { --c: var(--fable); }
.m-heredado, .m-desconocido { --c: var(--heredado); }
.e-listo.tenue, span.e-listo, span.e-error, span.e-accion { color: var(--c); }
.punto { width: 8px; height: 8px; border-radius: 50%; background: var(--c, var(--cola)); flex: none; display: inline-block; }
.e-trabajando .punto, .e-accion .punto { animation: pulso-punto 1.4s ease-in-out infinite; }
@keyframes pulso-punto { 50% { opacity: .3; } }
.estado { margin-left: auto; font-size: 12px; font-weight: 600; color: var(--c); white-space: nowrap; }
.chip-modelo { display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; border-radius: 6px; font-size: 12px; font-weight: 500; white-space: nowrap;
  color: var(--c); background: color-mix(in srgb, var(--c) 16%, transparent); }
.chip-modelo .punto { width: 6px; height: 6px; }

/* Botones */
.boton-primario, .boton-secundario, .boton-peligro, .boton-texto { min-height: 40px; padding: 0 16px; border-radius: 10px; cursor: pointer; font-size: 14px; }
.boton-primario { border: 0; background: var(--primario-fondo); color: var(--primario-texto); font-weight: 600; }
.boton-secundario { border: 1px solid var(--borde-fuerte); background: transparent; }
.boton-peligro { border: 1px solid color-mix(in srgb, var(--error) 50%, transparent); background: transparent; color: var(--error); }
.boton-texto { min-height: 32px; padding: 0 8px; border: 0; background: transparent; color: var(--texto-3); font-size: 12px; }
button:disabled { opacity: .45; cursor: not-allowed; }

/* Layout: lateral | principal | agentes */
.app { display: grid; grid-template-columns: 260px minmax(0, 1fr) 360px; height: 100vh; }
.lateral { background: var(--lateral); border-right: 1px solid var(--borde-fuerte); padding: 20px 14px; display: flex; flex-direction: column; gap: 18px; overflow-y: auto; }
.marca { display: flex; align-items: center; gap: 10px; padding: 4px 8px; font-family: var(--serif); font-size: 21px; font-weight: 500; }
.marca svg { width: 26px; height: 26px; }
#nueva { min-height: 44px; }
.conv { display: flex; flex-direction: column; gap: 2px; width: 100%; padding: 10px; border: 0; border-radius: 10px; background: transparent; text-align: left; cursor: pointer; }
.conv:hover { background: var(--seleccion); }
.conv.actual { background: var(--seleccion); font-weight: 600; }
.conv .titulo { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
.conv .etiqueta { font-size: 11px; font-weight: 700; color: var(--texto-2); }
.conv .ruta { padding-left: 16px; color: var(--texto-3); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uso { margin-top: auto; background: var(--tarjeta); border: 1px solid var(--borde); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 10px; font-size: 13px; }
.uso .fila { justify-content: space-between; }
.uso-fila .pista { height: 4px; border-radius: 2px; background: var(--pista); margin-top: 4px; }
.uso-fila .barra { height: 4px; border-radius: 2px; background: var(--c); }

.principal { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.cabecera { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; padding: 12px 24px; background: var(--cabecera); border-bottom: 1px solid var(--borde-fuerte); }
.titulo-conv { flex: 1 1 260px; min-width: 0; }
.titulo-conv h1 { margin: 0; font-family: var(--serif); font-size: 21px; font-weight: 500; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.titulo-conv #subtitulo { font-family: var(--mono); font-size: 12px; color: var(--texto-3); }
.pestanas { display: flex; padding: 3px; border-radius: 10px; background: var(--lateral); border: 1px solid var(--borde); }
.pestanas button { min-height: 36px; padding: 0 14px; border: 0; border-radius: 8px; background: transparent; color: var(--texto-2); cursor: pointer; }
.pestanas button[aria-selected="true"] { background: var(--tarjeta); color: var(--texto); font-weight: 600; }
.modo { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--texto-2); }
.modo select { min-height: 36px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--borde-fuerte); background: var(--tarjeta); }
#tema, .solo-movil { min-width: 40px; min-height: 40px; border: 1px solid var(--borde); border-radius: 8px; background: transparent; cursor: pointer; }
.solo-movil { display: none; }
.conexion { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--texto-3); }
.conexion::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--cola); }
.conexion.ok::before { background: var(--listo); }
.conexion.error::before { background: var(--error); }

/* Chat */
.vista-chat { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.mensajes { flex: 1; overflow-y: auto; padding: 28px 24px; display: flex; flex-direction: column; gap: 24px; }
.mensajes > * { width: 100%; max-width: 780px; margin: 0 auto; }
.vacio-chat { color: var(--texto-3); text-align: center; margin-top: 18vh !important; }
.msg { display: flex; flex-direction: column; gap: 8px; }
.msg.usuario { align-items: flex-end; }
.burbuja { max-width: 82%; background: var(--burbuja); border-radius: 16px 16px 4px 16px; padding: 12px 16px; white-space: pre-wrap; overflow-wrap: anywhere; }
.rotulo { display: flex; align-items: center; gap: 8px; }
.punto-orq { width: 10px; height: 10px; border-radius: 50%; background: var(--clay); }
.texto { white-space: pre-wrap; overflow-wrap: anywhere; }
.escribiendo::after { content: ""; display: inline-block; width: 8px; height: 1em; margin-left: 2px; vertical-align: -2px; background: var(--texto); animation: parpadeo 1s steps(1) infinite; }
@keyframes parpadeo { 50% { opacity: 0; } }
.aviso { font-size: 12px; color: var(--accion); }
.msg.error { border: 1px solid color-mix(in srgb, var(--error) 50%, transparent); border-radius: 12px; padding: 12px 14px; color: var(--error); }
.msg.decision { font-size: 13px; color: var(--c); }
.pensando summary { cursor: pointer; color: var(--texto-3); font-size: 13px; }
.herramienta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; padding: 8px 12px; border-radius: 10px; background: var(--hundido); border: 1px solid var(--borde); font-size: 13px; }
.herramienta .nombre { font-weight: 600; }
.herramienta code { overflow-wrap: anywhere; color: var(--texto-2); }
.herramienta .resultado { width: 100%; color: var(--texto-3); font-size: 12px; }
.herramienta.mal { border-color: color-mix(in srgb, var(--error) 50%, transparent); }
.herramienta.mal .resultado { color: var(--error); }
.delegacion { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 52px; padding: 10px 14px; border: 1px solid var(--borde-fuerte); border-radius: 12px; background: var(--tarjeta); text-align: left; cursor: pointer; }
.delegacion .nombre { font-weight: 600; white-space: nowrap; }
.delegacion .meta { flex: 1; min-width: 0; color: var(--texto-2); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.permiso { border: 1px solid var(--accion); border-radius: 14px; overflow: hidden; background: var(--tarjeta); box-shadow: var(--sombra); }
.permiso-cab { padding: 10px 18px; color: var(--accion); background: color-mix(in srgb, var(--accion) 14%, transparent); }
.permiso-cuerpo { padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; }
.bloque-codigo { display: block; padding: 12px 14px; border-radius: 8px; background: var(--codigo); border: 1px solid var(--borde); overflow-x: auto; white-space: pre; }
.acciones { display: flex; flex-wrap: wrap; gap: 8px; }
.composer { padding: 14px 24px 22px; border-top: 1px solid var(--borde); }
.composer > div, .composer > textarea { max-width: 780px; margin: 0 auto; }
.caja { max-width: 780px; margin: 0 auto; background: var(--tarjeta); border: 1px solid var(--borde-fuerte); border-radius: 16px; padding: 12px 12px 10px 16px; display: flex; flex-direction: column; gap: 8px; box-shadow: var(--sombra); }
.caja textarea { border: 0; resize: none; background: transparent; padding: 4px 0; outline: none; font-size: 15px; }
.caja textarea::placeholder { color: var(--texto-3); }
.composer-pie { display: flex; align-items: center; gap: 8px; }
.composer-pie .tenue { flex: 1; font-size: 12px; }
.boton-enviar { width: 40px; height: 40px; border: 0; border-radius: 10px; background: var(--enviar); color: #fff; cursor: pointer; font-size: 18px; }

/* Plan en pipeline */
.plan { border: 1px solid var(--borde-fuerte); border-radius: 16px; background: var(--tarjeta); overflow: hidden; }
.plan-cab { display: flex; flex-direction: column; gap: 2px; padding: 14px 18px; background: var(--hundido); border-bottom: 1px solid var(--borde-fuerte); }
.plan-cab .versalita { color: var(--c); }
.plan-cab h3 { margin: 0; font-size: 20px; }
.tuberia { display: flex; align-items: stretch; overflow-x: auto; padding: 18px; }
.etapa { flex: 0 0 190px; display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid var(--borde-fuerte); border-radius: 12px; }
.etapa.est-trabajando { --c: var(--activo); border-color: var(--activo); background: color-mix(in srgb, var(--activo) 8%, transparent); }
.etapa.est-lista { --c: var(--listo); } .etapa.est-fallida { --c: var(--error); } .etapa.est-en-cola { --c: var(--cola); }
.etapa-titulo { display: flex; gap: 8px; align-items: baseline; }
.etapa-agente { display: flex; flex-direction: column; gap: 4px; padding: 8px 10px; border-radius: 9px; background: var(--hundido); border: 1px solid var(--borde); }
.etapa-agente .nombre { font-size: 13px; font-weight: 600; }
.etapa-estado { margin-top: auto; font-size: 12px; font-weight: 600; color: var(--c); }
.barrera { flex: 0 0 56px; display: grid; place-items: center; position: relative; }
.barrera::before { content: ""; position: absolute; left: 0; right: 0; top: 50%; height: 2px; background: var(--borde-fuerte); }
.rombo { position: relative; width: 26px; height: 26px; transform: rotate(45deg); border-radius: 6px; display: grid; place-items: center; font-weight: 700; font-size: 12px; }
.rombo { border: 2px solid var(--c); background: color-mix(in srgb, var(--c) 18%, var(--tarjeta)); color: var(--c); }
.b-auto { --c: var(--listo); } .b-humana { --c: var(--accion); }
.plan-detalle { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; padding: 16px 18px; border-top: 1px solid var(--borde-fuerte); }
.plan-detalle h4 { margin: 0 0 8px; color: var(--c, var(--texto)); }
.fila-barrera { margin-bottom: 10px; } .fila-barrera .versalita { color: var(--c); }
.riesgo { margin-bottom: 8px; padding: 10px 12px; border-radius: 10px; background: color-mix(in srgb, var(--error) 9%, transparent); border: 1px solid color-mix(in srgb, var(--error) 35%, transparent); }
.plan > .acciones { padding: 14px 18px; background: var(--hundido); border-top: 1px solid var(--borde-fuerte); }

/* Panel de agentes */
.agentes { background: var(--panel); border-left: 1px solid var(--borde-fuerte); padding: 20px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; }
.agentes-cab { display: flex; align-items: baseline; justify-content: space-between; }
.agentes-cab h2 { margin: 0; font-size: 22px; }
.tarjeta-agente { display: flex; flex-direction: column; gap: 8px; width: 100%; padding: 14px; border: 1px solid var(--borde); border-radius: 12px; background: var(--tarjeta); text-align: left; cursor: pointer; }
.tarjeta-agente:hover { box-shadow: 0 0 0 1px var(--clay); }
.tarjeta-agente .meta { color: var(--texto-2); font-size: 14px; }
.tarjeta-agente.e-cola { opacity: .75; }
.volver { align-self: flex-start; min-height: 36px; border: 0; background: transparent; color: var(--texto-2); cursor: pointer; padding: 0 6px; }
.detalle-agente { display: flex; flex-direction: column; gap: 14px; }
.detalle-agente h2 { margin: 0; font-size: 21px; line-height: 1.3; }
.datos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.dato { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: 10px; background: var(--tarjeta); border: 1px solid var(--borde); }
.pasos { list-style: none; margin: 0; padding: 0; }
.paso { position: relative; padding: 0 0 14px 22px; border-left: 1px solid var(--borde-fuerte); margin-left: 5px; }
.paso::before { content: ""; position: absolute; left: -5px; top: 6px; width: 9px; height: 9px; border-radius: 50%; background: var(--c, var(--listo)); }
.paso.p-pensando, .paso.p-encargo { --c: var(--cola); }
.paso-titulo { display: flex; gap: 8px; align-items: baseline; font-size: 13px; }
.paso .mono, .paso .texto { font-size: 13px; overflow-wrap: anywhere; }
.leyenda { margin-top: auto; border-top: 1px solid var(--borde); padding-top: 12px; display: flex; flex-direction: column; gap: 8px; font-size: 12px; }
.fila-leyenda { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; }
.fila-leyenda > .versalita { width: 60px; }
.fila-leyenda > span:not(.versalita) { display: inline-flex; align-items: center; gap: 6px; color: var(--texto-2); }

/* Diálogo y toast */
dialog { border: 1px solid var(--borde-fuerte); border-radius: 16px; background: var(--tarjeta); color: var(--texto); padding: 22px; width: min(520px, calc(100vw - 32px)); }
dialog::backdrop { background: rgba(0, 0, 0, .5); }
dialog form { display: flex; flex-direction: column; gap: 14px; }
dialog label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--texto-2); }
dialog input, dialog select { min-height: 42px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--borde-fuerte); background: var(--fondo); }
#error-nueva { color: var(--error); font-size: 13px; min-height: 1em; }
.toast { position: fixed; left: 50%; bottom: 18px; transform: translate(-50%, 20px); opacity: 0; z-index: 20; max-width: min(560px, calc(100vw - 32px));
  background: var(--tarjeta); border: 1px solid var(--accion); border-radius: 10px; padding: 10px 14px; box-shadow: var(--sombra); transition: opacity .3s, transform .3s; }
.toast.visible { opacity: 1; transform: translate(-50%, 0); }

/* Pantallas medianas: el panel de agentes pasa a cajón. Celular: también la lista de conversaciones. */
@media (max-width: 1180px) {
  .app { grid-template-columns: 240px minmax(0, 1fr); }
  .agentes { position: fixed; right: 0; top: 0; bottom: 0; width: min(380px, 92vw); z-index: 15; transform: translateX(100%); transition: transform .25s; box-shadow: var(--sombra); }
  body.panel-abierto .agentes { transform: none; }
  #ver-agentes { display: inline-block; }
}
@media (max-width: 760px) {
  .app { grid-template-columns: minmax(0, 1fr); }
  .lateral { position: fixed; left: 0; top: 0; bottom: 0; width: min(300px, 88vw); z-index: 16; transform: translateX(-100%); transition: transform .25s; }
  body.lateral-abierto .lateral { transform: none; }
  #menu { display: inline-block; }
  .cabecera { padding: 10px 16px; }
  .mensajes { padding: 20px 16px; }
  .composer { padding: 12px 16px 16px; }
  .plan-detalle { grid-template-columns: minmax(0, 1fr); }
  .burbuja { max-width: 92%; }
}
@media (prefers-reduced-motion: reduce) { .punto, .escribiendo::after { animation: none !important; } }
```

- [ ] **Paso 6: reescribir `index.html`**

```html
<!doctype html>
<html lang="es" data-tema="oscuro">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Orquestador</title>
<link rel="stylesheet" href="./tema.css">
<link rel="stylesheet" href="./actividad.css">
</head>
<body>
<div class="app">
  <aside class="lateral" id="lateral" aria-label="Conversaciones">
    <div class="marca">
      <svg viewBox="0 0 26 26" fill="none" aria-hidden="true"><circle cx="13" cy="13" r="4.5" fill="#D97757"/><circle cx="4" cy="6" r="2.2" stroke="currentColor" stroke-width="1.4"/><circle cx="22" cy="6" r="2.2" stroke="currentColor" stroke-width="1.4"/><circle cx="13" cy="23" r="2.2" stroke="currentColor" stroke-width="1.4"/><path d="M6 7.2l3.6 3.2M20 7.2l-3.6 3.2M13 17.5v3.3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
      <span>Orquestador</span>
    </div>
    <button id="nueva" class="boton-primario" type="button">+ Nueva Conversación</button>
    <nav id="conversaciones" aria-label="Historial"></nav>
    <div id="uso" class="uso" hidden></div>
  </aside>

  <main class="principal">
    <header class="cabecera">
      <button id="menu" class="solo-movil" type="button" aria-label="Conversaciones">☰</button>
      <div class="titulo-conv"><h1 id="titulo">Orquestador</h1><div id="subtitulo"></div></div>
      <div class="pestanas" role="tablist" aria-label="Vista">
        <button id="tab-chat" type="button" role="tab" aria-selected="true">Chat</button>
        <button id="tab-actividad" type="button" role="tab" aria-selected="false">Actividad</button>
      </div>
      <label class="modo">Permisos
        <select id="modo">
          <option value="preguntar">Preguntar</option>
          <option value="ediciones">Aceptar Ediciones</option>
          <option value="auto">Auto</option>
        </select>
      </label>
      <button id="ver-agentes" class="solo-movil" type="button" aria-label="Agentes">◎</button>
      <button id="tema" type="button" aria-label="Cambiar entre tema oscuro y claro">◐</button>
      <span id="conexion" class="conexion">Conectando…</span>
    </header>

    <section id="vista-chat" class="vista-chat" role="tabpanel" aria-labelledby="tab-chat">
      <div id="mensajes" class="mensajes" aria-live="polite"></div>
      <form id="composer" class="composer">
        <div class="caja">
          <label for="entrada" class="sr">Mensaje para el orquestador</label>
          <textarea id="entrada" rows="2" placeholder="Escríbele al orquestador…"></textarea>
          <div class="composer-pie">
            <span class="tenue">Enter envía · Shift+Enter nueva línea</span>
            <button id="detener" type="button" class="boton-secundario" hidden>■ Detener</button>
            <button id="enviar" type="submit" class="boton-enviar" aria-label="Enviar">↑</button>
          </div>
        </div>
      </form>
    </section>

    <section id="vista-actividad" class="vista-actividad" role="tabpanel" aria-labelledby="tab-actividad" hidden>
      <div class="barra">
        <div class="controles">
          <label>Sesión <select id="sesion" aria-label="Sesión"></select></label>
          <label><input type="checkbox" id="seguir" checked> Seguir la más reciente</label>
          <label><input type="checkbox" id="animaciones"> Animaciones</label>
        </div>
      </div>
      <div class="layout">
        <section class="escenario" id="escenario" aria-label="Orquestador y subagentes">
          <svg id="lineas" class="lineas" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg>
          <div id="nodos"></div>
          <div id="centro" class="centro">
            <div class="centro-anillo"></div>
            <div>
              <div class="centro-icono"><svg class="icono-centro" viewBox="0 0 26 26" fill="none" aria-hidden="true"><circle cx="13" cy="13" r="4.5" fill="currentColor"/><circle cx="4" cy="6" r="2.2" stroke="currentColor" stroke-width="1.4"/><circle cx="22" cy="6" r="2.2" stroke="currentColor" stroke-width="1.4"/><circle cx="13" cy="23" r="2.2" stroke="currentColor" stroke-width="1.4"/></svg></div>
              <div class="centro-titulo">Orquestador</div>
              <span id="centro-modelo" class="chip">—</span>
            </div>
          </div>
          <div id="tarjetas" aria-live="polite"></div>
          <div id="vacio" class="vacio">
            <div>Esperando delegaciones…</div>
            <button id="demo" type="button">Ver demo</button>
          </div>
        </section>
        <aside class="panel">
          <div id="stats" class="stats"></div>
          <h2>Actividad</h2>
          <ol id="timeline" class="timeline"></ol>
        </aside>
      </div>
    </section>
  </main>

  <aside id="panel-agentes" class="agentes" aria-label="Agentes"></aside>
</div>

<dialog id="dialogo-nueva" aria-labelledby="titulo-nueva">
  <form id="form-nueva" method="dialog">
    <h2 id="titulo-nueva" class="serif">Nueva Conversación</h2>
    <label for="carpeta">Carpeta donde trabaja el orquestador
      <input id="carpeta" list="carpetas" autocomplete="off" required placeholder="C:\Users\tu\proyecto">
    </label>
    <datalist id="carpetas"></datalist>
    <label for="modo-nueva">Permisos
      <select id="modo-nueva">
        <option value="preguntar">Preguntar</option>
        <option value="ediciones">Aceptar Ediciones</option>
        <option value="auto">Auto</option>
      </select>
    </label>
    <div id="error-nueva" role="alert"></div>
    <div class="acciones">
      <button type="submit" class="boton-primario">Crear</button>
      <button id="cancelar-nueva" type="button" class="boton-secundario">Cancelar</button>
    </div>
  </form>
</dialog>

<div id="toast" class="toast" role="status"></div>
<script type="module" src="./app.js"></script>
</body>
</html>
```

- [ ] **Paso 7: crear `app.js`**

```js
// Arranque del dashboard: tema, pestañas, conversaciones, SSE y wiring entre chat, actividad y panel de agentes.
import { el, boton, preferencia, guardarPreferencia } from './dom.js';
import { chatVacio, desdeHistorial, reducirChat } from './chat-vista.js';
import { renderChat } from './chat.js';
import { renderAgentes } from './agentes-panel.js';
import { iniciarActividad, procesarEvento, inicioConexion, finReplay, mostrarSesion, vistaActual, alCambiar } from './actividad.js';
import { formatoCosto } from './estado-vista.js';

const $ = (id) => document.getElementById(id);
const ESTADO_CLASE = { trabajando: 'e-trabajando', 'esperando-permiso': 'e-accion', error: 'e-error', lista: 'e-listo', inactiva: 'e-cola' };
const estado = { conversaciones: [], actual: null, chat: chatVacio(), agente: null, pasos: [], desde: 0, consultaFinal: null };
let costoOculto = preferencia('orq-costo-oculto', '0') === '1';

// ---------- tema ----------
function aplicarTema(t) { document.documentElement.dataset.tema = t; guardarPreferencia('orq-tema', t); }
aplicarTema(preferencia('orq-tema', 'oscuro') === 'claro' ? 'claro' : 'oscuro');
$('tema').addEventListener('click', () => aplicarTema(document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro'));

// ---------- utilidades ----------
function toast(texto) {
  const t = $('toast');
  t.textContent = texto;
  t.classList.add('visible');
  clearTimeout(toast.temporizador);
  toast.temporizador = setTimeout(() => t.classList.remove('visible'), 4500);
}

function sinSesion() {
  $('mensajes').replaceChildren(el('div', 'vacio-chat', 'Falta iniciar sesión en el dashboard. Ábrelo con /orquestador:dashboard desde Claude Code.'));
}

async function api(metodo, ruta, cuerpo) {
  const r = await fetch(ruta, { method: metodo, headers: cuerpo ? { 'content-type': 'application/json' } : {}, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const datos = await r.json().catch(() => ({}));
  if (r.status === 401) { sinSesion(); throw new Error(datos.error ?? 'Falta iniciar sesión'); }
  if (!r.ok) throw new Error(datos.error ?? `Error ${r.status}`);
  return datos;
}

const convActual = () => estado.conversaciones.find((c) => c.id === estado.actual) ?? null;
const sesionActual = () => { const c = convActual(); return c?.sessionId ? vistaActual().sesiones[c.sessionId] ?? null : null; };
const ruta = (c, sufijo) => `/api/conversaciones/${encodeURIComponent(c.id)}/${sufijo}`;

// ---------- pestañas y cajones ----------
function mostrarPestana(p) {
  guardarPreferencia('orq-pestana', p);
  for (const [tab, vista] of [['tab-chat', 'vista-chat'], ['tab-actividad', 'vista-actividad']]) {
    const activa = tab === `tab-${p}`;
    $(tab).setAttribute('aria-selected', String(activa));
    $(vista).hidden = !activa;
  }
  if (p === 'actividad') dispatchEvent(new Event('resize'));
}
$('tab-chat').addEventListener('click', () => mostrarPestana('chat'));
$('tab-actividad').addEventListener('click', () => mostrarPestana('actividad'));
$('menu').addEventListener('click', () => document.body.classList.toggle('lateral-abierto'));
$('ver-agentes').addEventListener('click', () => document.body.classList.toggle('panel-abierto'));

// ---------- render ----------
function renderLista() {
  const nav = $('conversaciones');
  if (!estado.conversaciones.length) { nav.replaceChildren(el('p', 'tenue', 'Aún no hay conversaciones.')); return; }
  nav.replaceChildren(...estado.conversaciones.map((c) => {
    const b = boton(null, `conv ${ESTADO_CLASE[c.estado] ?? 'e-cola'}${c.id === estado.actual ? ' actual' : ''}`, () => { document.body.classList.remove('lateral-abierto'); abrir(c.id); });
    if (c.id === estado.actual) b.setAttribute('aria-current', 'page');
    const l1 = el('span', 'fila');
    l1.append(el('span', 'punto'));
    if (c.etiqueta) l1.append(el('span', 'etiqueta mono', c.etiqueta));
    l1.append(el('span', 'titulo', c.titulo));
    b.append(l1, el('span', 'ruta', c.cwd));
    return b;
  }));
}

function renderCabecera() {
  const c = convActual();
  $('titulo').textContent = c?.titulo ?? 'Orquestador';
  const sub = $('subtitulo');
  sub.replaceChildren();
  if (c) {
    sub.append(document.createTextNode(c.cwd));
    if (c.rama) {
      sub.append(document.createTextNode(' · '));
      if (c.etiqueta) sub.append(el('strong', null, c.etiqueta), document.createTextNode(' '));
      sub.append(document.createTextNode(c.etiqueta ? c.rama.replace(/^[a-z]+\//i, '') : c.rama));
    }
  }
  $('modo').value = c?.modo ?? 'preguntar';
  $('modo').disabled = !c;
  $('entrada').disabled = !c;
  $('enviar').disabled = !c;
  $('detener').hidden = !(c && ['trabajando', 'esperando-permiso'].includes(c.estado));
}

function renderPanel() {
  renderAgentes($('panel-agentes'), {
    sesion: sesionActual(), seleccionado: estado.agente, pasos: estado.pasos,
    onSeleccionar: seleccionarAgente, onVolver: () => { estado.agente = null; renderPanel(); },
  });
}

function contextoChat() {
  const c = convActual();
  const s = sesionActual();
  return {
    nombreUsuario: 'Tú',
    nodos: s ? s.ordenNodos.map((k) => s.nodos[k]) : [],
    nodosPorId: s?.nodos ?? {},
    vacio: c ? 'Escríbele al orquestador para empezar.' : 'Crea una conversación para empezar.',
    verAgente: (id) => { seleccionarAgente(id); document.body.classList.add('panel-abierto'); },
    responderPermiso: (sid, decision) => api('POST', ruta(c, `permisos/${encodeURIComponent(sid)}`), { decision }).catch((e) => toast(e.message)),
    retomar: () => enviar('Continúa donde quedaste.'), // enviar relanza el proceso con --resume
    planAcciones: {
      onAprobar: () => enviar('Apruebo el plan.'),
      onCambios: () => { $('entrada').value = 'Cambios al plan: '; $('entrada').focus(); },
    },
  };
}

let renderPendiente = false;
function renderTodo() {
  if (renderPendiente) return;
  renderPendiente = true;
  requestAnimationFrame(() => {
    renderPendiente = false;
    renderCabecera();
    renderChat($('mensajes'), estado.chat, contextoChat());
    renderPanel();
  });
}

// ---------- uso de la conversación (Fable, paralelo, costo ocultable) ----------
function filaUso(nombre, valor, clase, fraccion) {
  const f = el('div', `uso-fila ${clase}`);
  const l = el('div', 'fila');
  l.append(el('span', 'tenue', nombre), el('strong', null, valor));
  const pista = el('div', 'pista');
  const barra = el('div', 'barra');
  barra.style.width = `${Math.min(100, Math.round(fraccion * 100))}%`;
  pista.append(barra);
  f.append(l, pista);
  return f;
}

async function actualizarUso() {
  const c = convActual();
  if (!c?.sessionId) { $('uso').hidden = true; return; }
  try {
    const d = await api('GET', `/estado?session=${encodeURIComponent(c.sessionId)}`);
    const fable = d.estado?.fableUsados ?? 0;
    const activos = sesionActual()?.stats.activos ?? 0;
    const costo = el('div', 'fila');
    costo.append(
      el('span', 'tenue', 'Costo estimado'), el('strong', null, costoOculto ? '••••' : formatoCosto(d.estado?.costoUSD ?? 0)),
      boton(costoOculto ? 'Mostrar' : 'Ocultar', 'boton-texto', () => {
        costoOculto = !costoOculto;
        guardarPreferencia('orq-costo-oculto', costoOculto ? '1' : '0');
        actualizarUso();
      }, costoOculto ? 'Mostrar costo' : 'Ocultar costo'),
    );
    $('uso').replaceChildren(
      el('div', 'versalita tenue', 'Esta conversación'),
      filaUso('Fable usados', `${fable} de ${d.config.fableMaxPorSesion}`, 'm-fable', fable / Math.max(1, d.config.fableMaxPorSesion)),
      filaUso('Agentes en paralelo', `${activos} de ${d.config.paraleloMax}`, 'e-trabajando', activos / Math.max(1, d.config.paraleloMax)),
      costo,
    );
    $('uso').hidden = false;
  } catch { /* sin datos de uso todavía */ }
}

// ---------- agentes ----------
function seleccionarAgente(id) {
  estado.agente = id;
  estado.pasos = [];
  estado.desde = 0;
  estado.consultaFinal = null;
  renderPanel();
  consultarPasos();
}

async function consultarPasos() {
  const c = convActual();
  const n = sesionActual()?.nodos[estado.agente];
  if (!c || !n?.agentId) return;
  try {
    const r = await api('GET', `/api/agentes/${encodeURIComponent(c.sessionId)}/${encodeURIComponent(n.agentId)}/pasos?desde=${estado.desde}`);
    if (r.siguiente < estado.desde) estado.pasos = [];
    estado.pasos.push(...r.pasos);
    estado.desde = r.siguiente;
    renderPanel();
  } catch { /* se reintenta en el próximo ciclo */ }
}

setInterval(() => {
  const n = sesionActual()?.nodos[estado.agente];
  if (!n) return;
  if (n.estado === 'activo') { consultarPasos(); return; }
  if (estado.consultaFinal !== estado.agente) { estado.consultaFinal = estado.agente; consultarPasos(); } // última lectura al terminar
}, 1000);

// ---------- conversaciones ----------
async function cargarConversaciones() {
  estado.conversaciones = await api('GET', '/api/conversaciones');
  renderLista();
}

async function abrir(id) {
  estado.actual = id;
  estado.agente = null;
  estado.pasos = [];
  estado.desde = 0;
  guardarPreferencia('orq-conversacion', id);
  renderLista();
  try {
    const h = await api('GET', `/api/conversaciones/${encodeURIComponent(id)}/historial`);
    if (estado.actual !== id) return;
    estado.chat = desdeHistorial(h);
    const i = estado.conversaciones.findIndex((c) => c.id === id);
    if (i >= 0) estado.conversaciones[i] = h.conversacion;
    if (h.aviso) toast(h.aviso);
    if (h.conversacion.sessionId) mostrarSesion(h.conversacion.sessionId);
  } catch (e) { toast(e.message); }
  renderTodo();
  actualizarUso();
}

async function enviar(texto) {
  const c = convActual();
  const t = String(texto ?? '').trim();
  if (!c || !t) return;
  try {
    await api('POST', ruta(c, 'mensajes'), { texto: t });
    $('entrada').value = '';
  } catch (e) { toast(e.message); }
}

$('composer').addEventListener('submit', (ev) => { ev.preventDefault(); enviar($('entrada').value); });
$('entrada').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); enviar($('entrada').value); }
});
$('detener').addEventListener('click', () => { const c = convActual(); if (c) api('POST', ruta(c, 'interrumpir'), {}).catch((e) => toast(e.message)); });
$('modo').addEventListener('change', (ev) => { const c = convActual(); if (c) api('POST', ruta(c, 'modo'), { modo: ev.target.value }).catch((e) => toast(e.message)); });

// ---------- nueva conversación ----------
const dialogo = $('dialogo-nueva');
let temporizadorCarpetas = null;
$('nueva').addEventListener('click', () => {
  $('carpeta').value = preferencia('orq-ultima-carpeta', '');
  $('error-nueva').textContent = '';
  dialogo.showModal();
  $('carpeta').focus();
});
$('cancelar-nueva').addEventListener('click', () => dialogo.close());
$('carpeta').addEventListener('input', () => {
  clearTimeout(temporizadorCarpetas);
  temporizadorCarpetas = setTimeout(async () => {
    try {
      const lista = await api('GET', `/api/carpetas?prefijo=${encodeURIComponent($('carpeta').value)}`);
      $('carpetas').replaceChildren(...lista.map((p) => { const o = el('option'); o.value = p; return o; }));
    } catch { /* sin sugerencias */ }
  }, 200);
});
$('form-nueva').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  try {
    const c = await api('POST', '/api/conversaciones', { cwd: $('carpeta').value.trim(), modo: $('modo-nueva').value });
    guardarPreferencia('orq-ultima-carpeta', c.cwd);
    dialogo.close();
    await cargarConversaciones();
    mostrarPestana('chat');
    await abrir(c.id);
    $('entrada').focus();
  } catch (e) { $('error-nueva').textContent = e.message; }
});

// ---------- SSE ----------
function conectar() {
  const fuente = new EventSource('/eventos');
  const conexion = (texto, clase) => { $('conexion').textContent = texto; $('conexion').className = `conexion ${clase}`; };
  fuente.addEventListener('open', () => { inicioConexion(); conexion('En vivo', 'ok'); });
  fuente.addEventListener('error', () => { conexion('Reconectando…', 'error'); api('GET', '/api/conversaciones').catch(() => {}); });
  fuente.addEventListener('evento', (m) => { try { procesarEvento(JSON.parse(m.data)); } catch { /* evento inválido */ } });
  fuente.addEventListener('replay-fin', () => { finReplay(); if (estado.actual) abrir(estado.actual); });
  fuente.addEventListener('chat', (m) => {
    let e;
    try { e = JSON.parse(m.data); } catch { return; }
    if (e.tipo === 'chat:estado') {
      const i = estado.conversaciones.findIndex((c) => c.id === e.conversacion);
      if (i >= 0) estado.conversaciones[i] = e.conv; else estado.conversaciones.unshift(e.conv);
      renderLista();
      if (e.conversacion === estado.actual && e.conv.sessionId) mostrarSesion(e.conv.sessionId);
    }
    if (e.conversacion !== estado.actual) return;
    reducirChat(estado.chat, e);
    renderTodo();
    if (e.tipo === 'chat:fin-turno') actualizarUso();
  });
}

alCambiar(() => renderTodo());

async function arrancar() {
  iniciarActividad();
  mostrarPestana(preferencia('orq-pestana', 'chat') === 'actividad' ? 'actividad' : 'chat');
  renderTodo();
  try {
    await cargarConversaciones();
    const previa = preferencia('orq-conversacion', null);
    const inicial = estado.conversaciones.find((c) => c.id === previa) ?? estado.conversaciones[0];
    if (inicial) await abrir(inicial.id);
  } catch {
    return; // sin sesión: sinSesion() ya avisó
  }
  conectar();
  setInterval(actualizarUso, 3000);
}

arrancar();
```

- [ ] **Paso 8: correr toda la suite**

Ejecuta: `node --test`
Esperado: todo PASS, incluidos `frontend: estructura…` y `M5`.

- [ ] **Paso 9: verificación visual rápida (sin gastar la cuenta)**

Ejecuta: `node plugins/orquestador/dashboard/lanzar.mjs`. Se abre el navegador con sesión iniciada. Comprueba:
- El tema es oscuro, hay tres zonas con contraste y el botón ◐ cambia al tema claro.
- La pestaña Actividad muestra la vista animada. "Ver demo" funciona y el costo respeta "Ocultar" de la barra lateral.
- "Nueva Conversación" abre el diálogo, autocompleta carpetas y crea la conversación. **No envíes mensajes**: eso gasta uso de la cuenta y queda para la prueba manual final.
- Con el ancho de ventana en unos 400 px: no hay scroll horizontal, y ☰ y ◎ abren los cajones.

Anota lo que no se vea bien y corrígelo en `tema.css`, sin tocar la lógica.

- [ ] **Paso 10: commit**

```bash
git add plugins/orquestador/dashboard/public tests/dashboard-server.test.mjs tests/dashboard-revision.test.mjs
git commit -m "feat: interfaz nueva del dashboard con chat, tema oscuro y actividad portada"
```

---

### Tarea 11: skill, documentación y versión

**Archivos:**
- Modificar: `plugins/orquestador/skills/orquestar/SKILL.md`
- Modificar: `plugins/orquestador/commands/dashboard.md`
- Modificar: `plugins/orquestador/.claude-plugin/plugin.json` y `.claude-plugin/marketplace.json` (versión `0.2.0`)
- Modificar: `README.md`
- Modificar: `tests/plugin-valido.test.mjs`

- [ ] **Paso 1: escribir el test que falla**

Agrega a `tests/plugin-valido.test.mjs`:

```js
test('la skill orquestar documenta los planes en pipeline y la versión es la misma en plugin y marketplace', () => {
  const skill = readFileSync(join(PLUGIN, 'skills', 'orquestar', 'SKILL.md'), 'utf8');
  assert.match(skill, /## 6\. Planes en pipeline/);
  assert.match(skill, /orquestador-plan/);
  assert.match(skill, /E2 · /);
  const plugin = leerJson(join(PLUGIN, '.claude-plugin', 'plugin.json'));
  const entrada = leerJson(join(RAIZ, '.claude-plugin', 'marketplace.json')).plugins.find((x) => x.name === 'orquestador');
  assert.equal(entrada.version, plugin.version);
  assert.equal(plugin.version, '0.2.0');
});
```

- [ ] **Paso 2: correr y ver que falla**

Ejecuta: `node --test tests/plugin-valido.test.mjs`
Esperado: FAIL (falta la sección 6 y la versión es 0.1.0).

- [ ] **Paso 3: implementar**

En `skills/orquestar/SKILL.md`, inserta antes de `## 5. Reglas que siempre aplican` (y renumera esa sección a `## 7.`):

````markdown
## 6. Planes en pipeline

Si la tarea requiere **3 o más delegaciones** o incluye una **acción irreversible** (publicar, borrar, mergear, enviar), presenta primero el plan y **termina el turno** esperando aprobación.

- En el dashboard (te lo indica el contexto de inicio) usa un bloque con este JSON exacto:

  ```orquestador-plan
  {"titulo":"…","etapas":[{"id":"E1","titulo":"Entender","meta":"…",
    "agentes":[{"tipo":"Explore","modelo":"haiku","esfuerzo":"low"}],
    "barrera":{"tipo":"auto","criterio":"…"}}],
   "riesgos":[{"titulo":"…","planB":"…"}]}
  ```

- En la terminal, presenta lo mismo como una tabla: etapa, agentes con modelo y esfuerzo, y barrera. Después de la tabla, lista los obstáculos con su plan B.
- **Barreras:**
  - `auto` es una verificación que corres tú o un agente: tests verdes, checklist cumplida.
  - `humana` significa que terminas el turno con la pregunta y esperas.
  - Nunca saltes una barrera.
- Al delegar una etapa, empieza la `description` del tool Agent con su id: `E2 · Verificadores de CSV`. Así el dashboard sabe en qué etapa va cada agente.
- Si el usuario pide cambios al plan, presenta el plan corregido completo, no un diff.
````

En `commands/dashboard.md`, reemplaza el cuerpo por:

```markdown
Ejecuta `node "${CLAUDE_PLUGIN_ROOT}/dashboard/lanzar.mjs"` y agrega `--remoto` si el usuario pidió verlo desde otro equipo o desde el celular. Si la variable no se expandió, usa la raíz que está en `~/.claude/orquestador/plugin-root.txt`.

- Sin `--remoto`: responde con la URL que imprime, en una sola línea.
- Con `--remoto`: muestra las URLs remotas tal cual y repite la advertencia de que el enlace equivale a una contraseña. Si el modo remoto está apagado, explica las tres claves de `remoto` en `~/.claude/orquestador/config.json` (`activo`, `escuchar` con la IP de Tailscale y `hostsPermitidos`) y que hay que reabrir el dashboard.
- Si falla porque el puerto está ocupado, muestra el mensaje tal cual.
```

En `plugins/orquestador/.claude-plugin/plugin.json` y en la entrada `orquestador` de `.claude-plugin/marketplace.json`, cambia `"version": "0.1.0"` por `"version": "0.2.0"`.

En `README.md`:
- En "Qué hace", reemplaza el punto del dashboard por:
  ```markdown
  - **Dashboard local**: chat con un orquestador propio (permisos con botones, varias conversaciones con historial, planes en pipeline con barreras), detalle en vivo de cada agente y la vista animada de actividad. Tema oscuro, con colores que indican el estado y el modelo.
  ```
- Antes de "## Contribuir", agrega esta sección:

  ```markdown
  ## Dashboard remoto (opcional)

  Por defecto, el dashboard solo escucha en `127.0.0.1` y pide una sesión, que se inicia sola al abrirlo con `/orquestador:dashboard`. Para abrirlo desde otro equipo o desde el celular, usa una red privada como Tailscale. Nunca lo expongas a internet abierto.

  1. En `~/.claude/orquestador/config.json`, agrega: `"remoto": { "activo": true, "escuchar": "<IP de Tailscale>", "hostsPermitidos": ["<nombre>.ts.net"] }`.
  2. Cierra el dashboard y vuelve a abrirlo con `/orquestador:dashboard --remoto`. Imprime un enlace con token.
  3. Ese enlace equivale a una contraseña: quien lo tenga puede ejecutar código en tu equipo.
  ```

- [ ] **Paso 4: correr toda la suite**

Ejecuta: `node --test`
Esperado: todo PASS.

- [ ] **Paso 5: commit**

```bash
git add plugins/orquestador/skills/orquestar/SKILL.md plugins/orquestador/commands/dashboard.md plugins/orquestador/.claude-plugin/plugin.json .claude-plugin/marketplace.json README.md tests/plugin-valido.test.mjs
git commit -m "docs: planes en pipeline en la skill, modo remoto y versión 0.2.0"
```

---

### Tarea 12: verificación final y prueba manual

- [ ] **Paso 1: suite completa y sintaxis del frontend**

Ejecuta:

```bash
node --test
for f in plugins/orquestador/dashboard/public/*.js; do node --check "$f" || exit 1; done
```

Esperado: todo PASS y ningún error de sintaxis. Pega la salida resumida (`# pass N`, `# fail 0`).

- [ ] **Paso 2: revisar que no quedó nada prohibido**

```bash
grep -rn "innerHTML" plugins/orquestador/dashboard/public && echo "MAL: innerHTML" || echo "ok: sin innerHTML"
grep -rniE "co-authored-by|generated with" $(git diff --name-only main...HEAD) && echo "MAL: atribución" || echo "ok: sin atribución"
```

- [ ] **Paso 3: PUNTO DE CONTROL. Prueba manual del usuario**

Detente y entrega al usuario esta lista. Él la corre con su cuenta:

1. `/orquestador:dashboard`: se abre con la sesión iniciada y en tema oscuro.
2. Crea una conversación en un repo de prueba (por ejemplo, una carpeta nueva con `git init`), en modo **Preguntar**.
3. Pide: *"Crea un archivo hola.txt con la fecha de hoy usando Bash y después delega en dos agentes Explore en paralelo para que describan el repo"*.
   - Esperado: aparece la tarjeta ámbar de permiso. Al presionar Permitir, el turno sigue y se ven 2 delegaciones en el chat y en el panel de agentes.
4. Haz clic en un agente: se ve su timeline (encargo, herramientas, resultado) y el modelo pedido frente al real.
5. Cambia a la pestaña **Actividad**: la animación muestra esa misma sesión.
6. Pide algo grande, por ejemplo *"Planifica agregar un endpoint con tests, revisión y PR"*: aparece la tarjeta del plan en pipeline. **Pedir Cambios** llena el composer.
7. Presiona **Detener** a mitad de un turno: queda "Detuviste el turno.", sin error rojo.
8. Cierra el navegador y vuelve a abrir el dashboard: la conversación y su historial siguen ahí.
9. En la terminal: `claude --resume <id>` muestra la misma conversación.

- [ ] **Paso 4: con el visto bueno del usuario, cerrar la rama**

Usa la skill `superpowers:finishing-a-development-branch`. El PR se titula `feat: chat del orquestador en el dashboard (v2, entrega 1)`, sin atribución de IA, y se mergea con squash cuando CI esté verde en Ubuntu y Windows.
