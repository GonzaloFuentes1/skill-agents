# Fase 2: dashboard animado del orquestador (plan de implementación)

> **Para agentes que ejecutan este plan:** SUB-SKILL REQUERIDA: usa superpowers:subagent-driven-development (recomendada) o superpowers:executing-plans para implementarlo tarea por tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** una página local en vivo que muestra al orquestador al centro y, por cada delegación, una tarjeta que viaja hacia el subagente con su meta, tipo, persona, modelo y esfuerzo, y vuelve con el resultado: modelo real, tokens, costo y duración. Incluye alertas, bloqueos, un timeline y un modo demo.

**Arquitectura:**
- Un servidor `node:http` sin dependencias, en `127.0.0.1`, hace *tail* de `events.jsonl` con un seguidor por offset y lo reenvía por SSE: primero el historial (*replay*) y después las líneas nuevas.
- La página es un solo `index.html`, con SVG, CSS y JS vanilla sin build ni CDN. Usa un reductor puro (`estado-vista.js`) que se testea en Node.
- `/orquestador:dashboard` levanta el servidor separado del proceso si no está corriendo y abre el navegador.

**Stack:** Node ≥ 20 (`node:http`, `fetch`, `EventSource` en el navegador), `node:test`.

**Spec:** [docs/specs/2026-10-12-orquestador-design.md](../../specs/2026-10-12-orquestador-design.md) §6. Contrato de eventos: §4.1.

## Restricciones globales

- Cero dependencias npm. Nada de recursos externos en la página (ni CDN ni fuentes web): debe funcionar sin conexión.
- El servidor escucha **solo en `127.0.0.1`**. Rechaza con 403 cualquier `Host` que no sea localhost (protección contra DNS rebinding). Solo acepta GET.
- El puerto es `puertoDashboard` de `~/.claude/orquestador/config.json` (por defecto 4321).
- Los datos de los eventos se insertan **siempre con `textContent`** y nunca con `innerHTML`, porque las metas y los motivos vienen de prompts.
- Texto visible en español. Tema claro y oscuro con `prefers-color-scheme`. Con `prefers-reduced-motion` no hay animaciones de viaje.
- Las rutas de estado se resuelven con `lib/rutas.mjs` (`ORQUESTADOR_HOME` en los tests).

## Foco de revisión

1. **Reconexión del SSE**: el navegador reconecta y el servidor vuelve a enviar el historial. No deben duplicarse nodos ni contadores. Test: Tarea 3 (reducir dos veces el mismo replay sobre una vista nueva da el mismo estado) y el manejo de `open` en la Tarea 4.
2. **Escritura parcial de líneas**: un hook puede estar escribiendo cuando el seguidor lee. No se pierde ni se corta ningún evento. Test: Tarea 1.
3. **Caracteres multibyte cortados entre lecturas** (metas en español: ñ, tildes). Test: Tarea 1.
4. **Puerto ocupado por otra aplicación**: `lanzar` no debe confundirla con el dashboard. Test: Tarea 5 (`estaCorriendo` exige `app: orquestador-dashboard`).
5. **Muchas delegaciones**: los nodos no se encimen sin límite. Test: Tarea 3 (los slots se reutilizan y solo quedan visibles los activos más los últimos 8 terminados).

---

## Mapa de archivos

```
plugins/orquestador/dashboard/
  datos.mjs            seguidor de JSONL por offset, parseo y lista de sesiones
  server.mjs           http + SSE + /salud /sesiones /estado + estáticos
  lanzar.mjs           levanta el servidor (separado del proceso) y abre el navegador
  public/index.html    UI (SVG + CSS + JS módulo)
  public/estado-vista.js  reductor puro de la vista (lo usan la página y los tests)
plugins/orquestador/commands/dashboard.md
tests/dashboard-datos.test.mjs, tests/dashboard-server.test.mjs, tests/dashboard-vista.test.mjs, tests/dashboard-lanzar.test.mjs
```

---

### Tarea 1: `datos.mjs`, el seguidor de JSONL y la lista de sesiones

**Interfaces producidas:**
- `crearSeguidor(ruta) → { leerNuevas(): string[] }`: devuelve las líneas completas agregadas desde la última lectura. Conserva la línea parcial y los bytes multibyte cortados. Si el archivo se truncó, vuelve a empezar desde 0.
- `parsearLineas(lineas) → object[]`: ignora las líneas inválidas.
- `listarSesiones(eventos, max = 20) → [{ session, cwd, inicio, ultimo, delegaciones }]`, ordenada de la más reciente a la más antigua.

- [ ] **Paso 1: tests (deben fallar)**: `tests/dashboard-datos.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearSeguidor, parsearLineas, listarSesiones } from '../plugins/orquestador/dashboard/datos.mjs';

const archivo = () => join(mkdtempSync(join(tmpdir(), 'orq-dash-')), 'events.jsonl');

test('el seguidor entrega solo líneas completas y guarda la parcial', () => {
  const r = archivo();
  const s = crearSeguidor(r);
  assert.deepEqual(s.leerNuevas(), [], 'archivo inexistente');
  writeFileSync(r, '{"a":1}\n{"b":');
  assert.deepEqual(s.leerNuevas(), ['{"a":1}']);
  appendFileSync(r, '2}\n');
  assert.deepEqual(s.leerNuevas(), ['{"b":2}']);
  assert.deepEqual(s.leerNuevas(), []);
});

test('el seguidor no corta caracteres multibyte entre lecturas', () => {
  const r = archivo();
  const s = crearSeguidor(r);
  const linea = Buffer.from('{"meta":"Diseño ñandú"}\n', 'utf8');
  writeFileSync(r, linea.subarray(0, 14)); // corta en medio de "ñ"
  assert.deepEqual(s.leerNuevas(), []);
  appendFileSync(r, linea.subarray(14));
  assert.deepEqual(s.leerNuevas(), ['{"meta":"Diseño ñandú"}']);
});

test('el seguidor reinicia si el archivo se trunca', () => {
  const r = archivo();
  const s = crearSeguidor(r);
  writeFileSync(r, '{"a":1}\n{"a":2}\n');
  s.leerNuevas();
  writeFileSync(r, '{"z":9}\n');
  assert.deepEqual(s.leerNuevas(), ['{"z":9}']);
});

test('parsearLineas ignora basura', () => {
  assert.deepEqual(parsearLineas(['{"a":1}', 'x', '']), [{ a: 1 }]);
});

test('listarSesiones agrupa, cuenta delegaciones y ordena por actividad reciente', () => {
  const ev = [
    { session: 'a', tipo: 'sesion', cwd: '/p/uno', ts: '2026-10-12T10:00:00Z' },
    { session: 'a', tipo: 'delegacion', ts: '2026-10-12T10:01:00Z' },
    { session: 'b', tipo: 'sesion', cwd: '/p/dos', ts: '2026-10-12T11:00:00Z' },
    { session: 'a', tipo: 'delegacion', ts: '2026-10-12T12:00:00Z' },
    { tipo: 'sin-sesion' },
  ];
  assert.deepEqual(listarSesiones(ev), [
    { session: 'a', cwd: '/p/uno', inicio: '2026-10-12T10:00:00Z', ultimo: '2026-10-12T12:00:00Z', delegaciones: 2 },
    { session: 'b', cwd: '/p/dos', inicio: '2026-10-12T11:00:00Z', ultimo: '2026-10-12T11:00:00Z', delegaciones: 0 },
  ]);
});
```

Ejecuta `node --test tests/dashboard-datos.test.mjs`. **Esperado:** FALLA porque el módulo no existe.

- [ ] **Paso 2: implementar `plugins/orquestador/dashboard/datos.mjs`**

```js
// Lectura incremental de events.jsonl para el dashboard.
import { openSync, readSync, fstatSync, closeSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';

// Sigue un archivo JSONL por offset: entrega líneas completas y conserva la línea parcial y los bytes UTF-8 cortados.
export function crearSeguidor(ruta) {
  let offset = 0;
  let resto = '';
  let decodificador = new StringDecoder('utf8');
  return {
    leerNuevas() {
      let fd;
      try { fd = openSync(ruta, 'r'); } catch { return []; }
      try {
        const { size } = fstatSync(fd);
        if (size < offset) { offset = 0; resto = ''; decodificador = new StringDecoder('utf8'); }
        if (size === offset) return [];
        const buf = Buffer.alloc(size - offset);
        readSync(fd, buf, 0, buf.length, offset);
        offset = size;
        const partes = (resto + decodificador.write(buf)).split('\n');
        resto = partes.pop();
        return partes.filter((l) => l.trim());
      } finally {
        closeSync(fd);
      }
    },
  };
}

export function parsearLineas(lineas) {
  const eventos = [];
  for (const l of lineas) { try { eventos.push(JSON.parse(l)); } catch { /* línea inválida */ } }
  return eventos;
}

export function listarSesiones(eventos, max = 20) {
  const porSesion = new Map();
  for (const e of eventos) {
    if (!e?.session) continue;
    const s = porSesion.get(e.session) ?? { session: e.session, cwd: null, inicio: e.ts, ultimo: e.ts, delegaciones: 0 };
    if (e.tipo === 'sesion' && e.cwd) s.cwd = e.cwd;
    if (e.tipo === 'delegacion') s.delegaciones += 1;
    s.ultimo = e.ts;
    porSesion.set(e.session, s);
  }
  return [...porSesion.values()].sort((a, b) => String(b.ultimo).localeCompare(String(a.ultimo))).slice(0, max);
}
```

Ejecuta `node --test tests/dashboard-datos.test.mjs`. **Esperado:** PASAN los 5 tests. Después, commit con `feat: seguidor de eventos y lista de sesiones para el dashboard`.

---

### Tarea 2: `server.mjs`, con HTTP, SSE y seguridad

**Interfaces producidas:**
- `crearServidor({ env, intervaloMs }) → http.Server`, con el método extra `detener(): Promise<void>`. Rutas GET:
  - `/` y `/estado-vista.js`: archivos estáticos de una lista blanca.
  - `/salud`: `{ ok: true, app: 'orquestador-dashboard' }`.
  - `/sesiones`: `listarSesiones(historial)`.
  - `/estado?session=ID`: `{ estado, config: { fableMaxPorSesion, paraleloMax, modelosOrquestador } }`.
  - `/eventos`: SSE. Por cada evento del historial envía `event: evento` (como máximo los últimos 2000), luego `event: replay-fin` y después los eventos en vivo.
- Si el `Host` no es localhost responde 403; con otro método, 405; si la ruta no existe, 404.

- [ ] **Paso 1: tests (deben fallar)**: `tests/dashboard-server.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { crearServidor } from '../plugins/orquestador/dashboard/server.mjs';
import { rutaEventos } from '../plugins/orquestador/scripts/lib/rutas.mjs';
import { guardarEstado, estadoVacio } from '../plugins/orquestador/scripts/lib/estado.mjs';

async function levantar() {
  const env = { ORQUESTADOR_HOME: mkdtempSync(join(tmpdir(), 'orq-srv-')) };
  writeFileSync(rutaEventos(env), JSON.stringify({ v: 1, ts: '2026-10-12T10:00:00Z', session: 's1', tipo: 'sesion', cwd: '/p' }) + '\n');
  const srv = crearServidor({ env, intervaloMs: 30 });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { env, srv, base: `http://127.0.0.1:${srv.address().port}` };
}

function get(base, ruta, headers = {}) {
  return new Promise((ok, mal) => {
    const req = request(base + ruta, { headers }, (res) => { let t = ''; res.on('data', (d) => { t += d; }); res.on('end', () => ok({ status: res.statusCode, tipo: res.headers['content-type'], texto: t })); });
    req.on('error', mal);
    req.end();
  });
}

test('salud, sesiones, estado y estáticos', async () => {
  const { env, srv, base } = await levantar();
  try {
    assert.deepEqual(JSON.parse((await get(base, '/salud')).texto), { ok: true, app: 'orquestador-dashboard' });
    assert.equal(JSON.parse((await get(base, '/sesiones')).texto)[0].session, 's1');
    const e = estadoVacio('s1'); e.fableUsados = 1; e.modeloPrincipal = 'opus'; guardarEstado(e, env);
    const est = JSON.parse((await get(base, '/estado?session=s1')).texto);
    assert.equal(est.estado.fableUsados, 1);
    assert.equal(est.config.fableMaxPorSesion, 2);
    const html = await get(base, '/');
    assert.match(html.tipo, /text\/html/);
    assert.match(html.texto, /id="escenario"/);
    assert.match((await get(base, '/estado-vista.js')).tipo, /javascript/);
  } finally { await srv.detener(); }
});

test('seguridad: host ajeno 403, ruta desconocida o traversal 404', async () => {
  const { srv, base } = await levantar();
  try {
    assert.equal((await get(base, '/salud', { host: 'evil.example' })).status, 403);
    assert.equal((await get(base, '/../../etc/passwd')).status, 404);
    assert.equal((await get(base, '/server.mjs')).status, 404);
  } finally { await srv.detener(); }
});

test('SSE: replay del historial, marca de fin y eventos en vivo', async () => {
  const { env, srv, base } = await levantar();
  try {
    const recibidos = await new Promise((ok, mal) => {
      const vistos = [];
      const req = request(base + '/eventos', (res) => {
        assert.match(res.headers['content-type'], /text\/event-stream/);
        let buf = '';
        res.on('data', (d) => {
          buf += d;
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const bloque = buf.slice(0, i); buf = buf.slice(i + 2);
            const ev = /^event: (.+)$/m.exec(bloque)?.[1];
            const data = /^data: (.+)$/m.exec(bloque)?.[1];
            if (!ev) continue;
            vistos.push([ev, JSON.parse(data)]);
            if (ev === 'replay-fin') appendFileSync(rutaEventos(env), JSON.stringify({ session: 's1', tipo: 'delegacion', id: 't1', meta: 'Diseño' }) + '\n');
            if (ev === 'evento' && vistos.length === 3) { req.destroy(); ok(vistos); }
          }
        });
      });
      req.on('error', (e) => { if (vistos.length < 3) mal(e); });
      req.end();
    });
    assert.deepEqual(recibidos.map(([ev]) => ev), ['evento', 'replay-fin', 'evento']);
    assert.equal(recibidos[0][1].tipo, 'sesion');
    assert.equal(recibidos[2][1].meta, 'Diseño');
  } finally { await srv.detener(); }
});
```

Ejecuta `node --test tests/dashboard-server.test.mjs`. **Esperado:** FALLA porque el módulo no existe.

- [ ] **Paso 2: implementar `plugins/orquestador/dashboard/server.mjs`**

```js
#!/usr/bin/env node
// Servidor local del dashboard: sirve la página y reenvía events.jsonl por SSE (historial + vivo).
// Uso: node server.mjs [puerto]
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarConfig } from '../scripts/lib/config.mjs';
import { rutaEventos } from '../scripts/lib/rutas.mjs';
import { leerEstado } from '../scripts/lib/estado.mjs';
import { esPrincipal } from '../scripts/lib/hook-io.mjs';
import { crearSeguidor, parsearLineas, listarSesiones } from './datos.mjs';

const PUBLICO = fileURLToPath(new URL('./public/', import.meta.url));
const ESTATICOS = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/estado-vista.js': ['estado-vista.js', 'text/javascript; charset=utf-8'],
};
const MAX_HISTORIAL = 2000;
const LATIDO_MS = 15000;
const HOST_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

const enviar = (res, evento, datos) => res.write(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`);
const json = (res, datos) => res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }).end(JSON.stringify(datos));

export function crearServidor({ env = process.env, intervaloMs = 400 } = {}) {
  const seguidor = crearSeguidor(rutaEventos(env));
  const historial = parsearLineas(seguidor.leerNuevas()).slice(-MAX_HISTORIAL);
  const clientes = new Set();

  const tick = setInterval(() => {
    for (const e of parsearLineas(seguidor.leerNuevas())) {
      historial.push(e);
      if (historial.length > MAX_HISTORIAL) historial.shift();
      for (const c of clientes) enviar(c, 'evento', e);
    }
  }, intervaloMs);
  const latido = setInterval(() => { for (const c of clientes) c.write(': latido\n\n'); }, LATIDO_MS);

  const servidor = createServer((req, res) => {
    if (!HOST_LOCAL.test(req.headers.host ?? '')) { res.writeHead(403).end('Host no permitido'); return; }
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    const url = new URL(req.url, 'http://localhost');
    const estatico = ESTATICOS[url.pathname];
    if (estatico) {
      res.writeHead(200, { 'content-type': estatico[1], 'cache-control': 'no-store' }).end(readFileSync(join(PUBLICO, estatico[0])));
      return;
    }
    if (url.pathname === '/salud') return json(res, { ok: true, app: 'orquestador-dashboard' });
    if (url.pathname === '/sesiones') return json(res, listarSesiones(historial));
    if (url.pathname === '/estado') {
      const session = url.searchParams.get('session');
      const c = cargarConfig(env);
      return json(res, {
        estado: session ? leerEstado(session, env) : null,
        config: { fableMaxPorSesion: c.fableMaxPorSesion, paraleloMax: c.paraleloMax, modelosOrquestador: c.modelosOrquestador },
      });
    }
    if (url.pathname === '/eventos') {
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write('retry: 2000\n\n');
      for (const e of historial) enviar(res, 'evento', e);
      enviar(res, 'replay-fin', { total: historial.length });
      clientes.add(res);
      req.on('close', () => clientes.delete(res));
      return;
    }
    res.writeHead(404).end('No encontrado');
  });

  servidor.detener = () => new Promise((ok) => {
    clearInterval(tick);
    clearInterval(latido);
    for (const c of clientes) c.end();
    servidor.closeAllConnections?.();
    servidor.close(() => ok());
  });
  return servidor;
}

if (esPrincipal(import.meta.url)) {
  const puerto = Number(process.argv[2]) || cargarConfig().puertoDashboard;
  crearServidor().listen(puerto, '127.0.0.1', () => console.log(`Dashboard del orquestador: http://127.0.0.1:${puerto}/`));
}
```

Ejecuta `node --test tests/dashboard-server.test.mjs`. **Esperado:** FALLA solo en la aserción de `/` (`id="escenario"`) y de `/estado-vista.js`, que todavía no existen. Esos dos archivos se crean en las Tareas 3 y 4. Para poder hacer commit, crea `public/index.html` con `<main id="escenario"></main>` y `public/estado-vista.js` vacío. Vuelve a correr. **Esperado:** PASA. Commit con `feat: servidor local del dashboard con SSE`.

---

### Tarea 3: `estado-vista.js`, el reductor puro de la vista

**Interfaces producidas (ESM, sin DOM):**
- `vistaVacia()` → `{ sesiones: {}, orden: [] }`
- `reducir(vista, evento) → { vista, efecto }`. `efecto` vale `{ tipo: 'enviar' | 'volver' | 'alerta' | 'bloqueo', sesion, id?, motivo? }` o `null`.
- Estructura de cada sesión: `{ id, cwd, ultimo, nodos: { [id]: Nodo }, ordenNodos: string[], timeline: Item[], stats: { activos, completados, costoUSD, alertas, bloqueos, fable } }`.
- Estructura de cada nodo: `Nodo = { id, agente, meta, modelo, esfuerzo, origen, persona, color, slot, estado: 'activo'|'terminado'|'fallido', alerta, resultado }`.
- Funciones auxiliares: `posicionOrbital(slot) → { x, y, anillo }` (de 0 a 1), `nodosVisibles(sesion, maxTerminados = 8) → string[]`, `colorDe(agente, color)`, `nombreCorto(agente)`, `familia(modelo)`, `formatoCosto(usd)`, `formatoDuracion(ms)` y `formatoTokens(n)`.

- [ ] **Paso 1: tests (deben fallar)**: `tests/dashboard-vista.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vistaVacia, reducir, posicionOrbital, nodosVisibles, colorDe, formatoCosto, formatoDuracion, formatoTokens } from '../plugins/orquestador/dashboard/public/estado-vista.js';

const ts = (s) => `2026-10-12T10:00:${String(s).padStart(2, '0')}Z`;
const del = (id, extra = {}) => ({ session: 's', tipo: 'delegacion', id, agente: 'orquestador:investigador-rl', meta: 'Diseñar', modelo: 'opus', esfuerzo: 'high', origenModelo: 'explicito', persona: 'Escéptico', color: 'purple', ts: ts(1), ...extra });
const aplicar = (eventos) => eventos.reduce((acc, e) => { acc.efectos.push(reducir(acc.vista, e).efecto); return acc; }, { vista: vistaVacia(), efectos: [] });

test('delegación crea un nodo activo y pide la animación de envío', () => {
  const { vista, efectos } = aplicar([{ session: 's', tipo: 'sesion', cwd: '/p', ts: ts(0) }, del('t1')]);
  const s = vista.sesiones.s;
  assert.equal(s.cwd, '/p');
  assert.equal(s.nodos.t1.agente, 'investigador-rl');
  assert.equal(s.nodos.t1.estado, 'activo');
  assert.equal(s.nodos.t1.color, colorDe('x', 'purple'));
  assert.equal(s.stats.activos, 1);
  assert.deepEqual(efectos[1], { tipo: 'enviar', sesion: 's', id: 't1' });
  assert.equal(s.timeline[0].tipo, 'delegacion');
});

test('fin cierra el nodo con resultado, suma costo y pide el regreso', () => {
  const { vista, efectos } = aplicar([del('t1'), { session: 's', tipo: 'fin', id: 't1', modeloReal: 'claude-opus-5-5', tokensIn: 1200, tokensOut: 30, costoUSD: 0.5, duracionMs: 2500, ok: true, ts: ts(5) }]);
  const s = vista.sesiones.s;
  assert.equal(s.nodos.t1.estado, 'terminado');
  assert.equal(s.nodos.t1.resultado.modeloReal, 'claude-opus-5-5');
  assert.deepEqual([s.stats.activos, s.stats.completados, s.stats.costoUSD], [0, 1, 0.5]);
  assert.deepEqual(efectos[1], { tipo: 'volver', sesion: 's', id: 't1' });
});

test('fin con ok:false marca el nodo como fallido; fin duplicado se ignora', () => {
  const { vista, efectos } = aplicar([del('t1'), { session: 's', tipo: 'fin', id: 't1', ok: false, ts: ts(2) }, { session: 's', tipo: 'fin', id: 't1', ts: ts(3) }]);
  assert.equal(vista.sesiones.s.nodos.t1.estado, 'fallido');
  assert.equal(vista.sesiones.s.stats.completados, 1);
  assert.equal(efectos[2], null);
});

test('alerta y bloqueo', () => {
  const { vista, efectos } = aplicar([del('t1'), { session: 's', tipo: 'alerta', id: 't1', mensaje: 'se pidió opus pero corrió sonnet', ts: ts(3) }, { session: 's', tipo: 'bloqueo', regla: 'tope-fable', motivo: 'Tope de Fable', ts: ts(4) }]);
  const s = vista.sesiones.s;
  assert.equal(s.nodos.t1.alerta, 'se pidió opus pero corrió sonnet');
  assert.deepEqual([s.stats.alertas, s.stats.bloqueos], [1, 1]);
  assert.deepEqual(efectos[2], { tipo: 'bloqueo', sesion: 's', motivo: 'Tope de Fable' });
});

test('delegación a fable suma al contador local de Fable', () => {
  assert.equal(aplicar([del('t1', { modelo: 'fable' })]).vista.sesiones.s.stats.fable, 1);
});

test('reaplicar el mismo historial sobre una vista nueva da el mismo estado (reconexión SSE)', () => {
  const eventos = [del('t1'), del('t2', { modelo: 'haiku' }), { session: 's', tipo: 'fin', id: 't1', costoUSD: 0.1, ts: ts(9) }];
  assert.deepEqual(aplicar(eventos).vista, aplicar(eventos).vista);
});

test('los slots se reutilizan y solo quedan visibles activos + últimos 8 terminados', () => {
  const eventos = [];
  for (let i = 0; i < 12; i++) { eventos.push(del(`t${i}`)); eventos.push({ session: 's', tipo: 'fin', id: `t${i}`, ts: ts(i) }); }
  eventos.push(del('nuevo'));
  const s = aplicar(eventos).vista.sesiones.s;
  const visibles = nodosVisibles(s);
  assert.equal(visibles.length, 9);
  assert.ok(visibles.includes('nuevo'));
  const slots = visibles.map((id) => s.nodos[id].slot);
  assert.equal(new Set(slots).size, slots.length, 'sin slots repetidos entre visibles');
  assert.ok(Math.max(...slots) < 9);
});

test('posicionOrbital: primer nodo arriba, dentro del escenario, anillos crecientes', () => {
  const p0 = posicionOrbital(0);
  assert.ok(Math.abs(p0.x - 0.5) < 1e-9 && p0.y < 0.5);
  for (let i = 0; i < 24; i++) { const p = posicionOrbital(i); assert.ok(p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1); }
  assert.equal(posicionOrbital(8).anillo, 1);
});

test('eventos sin sesión no rompen nada', () => {
  assert.deepEqual(reducir(vistaVacia(), { tipo: 'delegacion' }), { vista: vistaVacia(), efecto: null });
});

test('formatos', () => {
  assert.equal(formatoCosto(0.0041), '$0.004');
  assert.equal(formatoCosto(1.234), '$1.23');
  assert.equal(formatoDuracion(1450), '1.5 s');
  assert.equal(formatoDuracion(125000), '2 min 5 s');
  assert.equal(formatoTokens(32951), '33.0k');
  assert.equal(formatoTokens(4), '4');
});
```

Ejecuta `node --test tests/dashboard-vista.test.mjs`. **Esperado:** FALLA porque todavía no hay exports.

- [ ] **Paso 2: implementar `plugins/orquestador/dashboard/public/estado-vista.js`**

```js
// Estado de la vista del dashboard: reductor puro, sin DOM. Lo usan index.html y los tests.
const PALETA = ['#7c6cf0', '#2bb39a', '#e0913a', '#d85a8c', '#3d9be0', '#9bb83a', '#c96fd6', '#e0603a'];
const COLORES = { red: '#e05252', blue: '#3d9be0', green: '#2bb39a', yellow: '#d6a92b', purple: '#7c6cf0', orange: '#e0913a', pink: '#d85a8c', cyan: '#2bb3c9' };
const MAX_TIMELINE = 200;

export const nombreCorto = (agente) => String(agente ?? '').split(':').pop() || 'subagente';

export function familia(modelo) {
  const m = String(modelo ?? '').toLowerCase();
  return ['haiku', 'sonnet', 'opus', 'fable'].find((f) => m.includes(f)) ?? (m || '—');
}

export function colorDe(agente, color) {
  if (color && COLORES[color]) return COLORES[color];
  let h = 0;
  for (const ch of String(agente)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
}

export const vistaVacia = () => ({ sesiones: {}, orden: [] });

const sesionVacia = (id) => ({
  id, cwd: null, ultimo: null, nodos: {}, ordenNodos: [], timeline: [],
  stats: { activos: 0, completados: 0, costoUSD: 0, alertas: 0, bloqueos: 0, fable: 0 },
});

// Activos + los últimos `maxTerminados` terminados, en orden de llegada.
export function nodosVisibles(sesion, maxTerminados = 8) {
  const ids = sesion.ordenNodos;
  const terminados = ids.filter((id) => sesion.nodos[id].estado !== 'activo').slice(-maxTerminados);
  const visibles = new Set([...ids.filter((id) => sesion.nodos[id].estado === 'activo'), ...terminados]);
  return ids.filter((id) => visibles.has(id));
}

function slotLibre(sesion) {
  const ocupados = new Set(nodosVisibles(sesion).map((id) => sesion.nodos[id].slot));
  let slot = 0;
  while (ocupados.has(slot)) slot += 1;
  return slot;
}

export function reducir(vista, e) {
  if (!e?.session) return { vista, efecto: null };
  let s = vista.sesiones[e.session];
  if (!s) { s = sesionVacia(e.session); vista.sesiones[e.session] = s; vista.orden.push(e.session); }
  if (e.ts) s.ultimo = e.ts;
  const anotar = (extra) => {
    s.timeline.unshift({ ts: e.ts ?? null, tipo: e.tipo, agente: e.agente ? nombreCorto(e.agente) : null, ...extra });
    if (s.timeline.length > MAX_TIMELINE) s.timeline.pop();
  };
  switch (e.tipo) {
    case 'sesion':
      s.cwd = e.cwd ?? s.cwd;
      return { vista, efecto: null };
    case 'delegacion': {
      if (s.nodos[e.id]) return { vista, efecto: null };
      s.nodos[e.id] = {
        id: e.id, agente: nombreCorto(e.agente), meta: e.meta ?? '', modelo: e.modelo ?? '—', esfuerzo: e.esfuerzo ?? '—',
        origen: e.origenModelo ?? null, persona: e.persona ?? null, color: colorDe(e.agente, e.color),
        slot: slotLibre(s), estado: 'activo', alerta: null, resultado: null,
      };
      s.ordenNodos.push(e.id);
      s.stats.activos += 1;
      if (familia(e.modelo) === 'fable') s.stats.fable += 1;
      anotar({ texto: e.meta ?? '', modelo: `${familia(e.modelo)}·${e.esfuerzo ?? '—'}` });
      return { vista, efecto: { tipo: 'enviar', sesion: s.id, id: e.id } };
    }
    case 'fin': {
      const n = s.nodos[e.id];
      if (!n || n.estado !== 'activo') return { vista, efecto: null };
      n.estado = e.ok === false ? 'fallido' : 'terminado';
      n.resultado = { modeloReal: e.modeloReal ?? null, tokensIn: e.tokensIn ?? 0, tokensOut: e.tokensOut ?? 0, costoUSD: e.costoUSD ?? 0, duracionMs: e.duracionMs ?? 0 };
      s.stats.activos -= 1;
      s.stats.completados += 1;
      s.stats.costoUSD += e.costoUSD ?? 0;
      anotar({ agente: n.agente, texto: n.meta, modelo: e.modeloReal ? familia(e.modeloReal) : '—', costoUSD: e.costoUSD ?? 0, ok: e.ok !== false });
      return { vista, efecto: { tipo: 'volver', sesion: s.id, id: e.id } };
    }
    case 'alerta': {
      const n = s.nodos[e.id];
      if (n) n.alerta = e.mensaje ?? 'Modelo distinto al pedido';
      s.stats.alertas += 1;
      anotar({ agente: n?.agente ?? null, texto: e.mensaje ?? '' });
      return { vista, efecto: { tipo: 'alerta', sesion: s.id, id: e.id } };
    }
    case 'bloqueo':
      s.stats.bloqueos += 1;
      anotar({ texto: e.motivo ?? '', regla: e.regla ?? null });
      return { vista, efecto: { tipo: 'bloqueo', sesion: s.id, motivo: e.motivo ?? '' } };
    default:
      return { vista, efecto: null };
  }
}

// Posición normalizada (0..1) en anillos concéntricos de 8 nodos; el primero arriba del centro.
export function posicionOrbital(slot, { porAnillo = 8, radioBase = 0.3, paso = 0.13 } = {}) {
  const anillo = Math.floor(slot / porAnillo);
  const k = slot % porAnillo;
  const angulo = -Math.PI / 2 + (2 * Math.PI * k) / porAnillo + anillo * (Math.PI / porAnillo);
  const r = Math.min(radioBase + anillo * paso, 0.45);
  return { x: 0.5 + r * Math.cos(angulo), y: 0.5 + r * Math.sin(angulo), anillo };
}

export const formatoCosto = (usd) => `$${(usd ?? 0).toFixed((usd ?? 0) >= 1 ? 2 : 3)}`;
export function formatoDuracion(ms) {
  if (!ms) return '—';
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}
export const formatoTokens = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n ?? 0));
```

Ejecuta `node --test tests/dashboard-vista.test.mjs`. **Esperado:** PASAN los 10 tests. Después, commit con `feat: reductor de la vista del dashboard`.

---

### Tarea 4: `index.html`, la UI animada con modo demo

**Interfaces consumidas:** las de `estado-vista.js` (Tarea 3) y las rutas `/eventos`, `/sesiones` y `/estado` (Tarea 2).

**Comportamiento:**
1. **Al cargar:** abre un `EventSource('/eventos')`. Mientras dura el *replay* solo reduce los eventos, sin animarlos. Cuando llega `replay-fin` elige la sesión más reciente y dibuja el estado.
2. **En cada `open` (también al reconectar)** parte de una vista vacía, porque el servidor vuelve a enviar el historial (foco de revisión 1).
3. **Efectos en vivo:**
   - `enviar`: una tarjeta viaja del centro al slot mostrando la meta, `agente`, la persona, el chip `modelo·esfuerzo` y el origen. El nodo aparece al llegar y luego pulsa, con una línea animada.
   - `volver`: un recibo viaja del nodo al centro con `✓ modelo real · tokens in/out · costo · duración`, y el nodo queda atenuado.
   - `alerta`: el nodo recibe borde rojo, el badge ⚠ y un tooltip.
   - `bloqueo`: el centro destella en rojo y aparece un aviso con el motivo.
4. **Panel lateral:** estadísticas (activos, completados, Fable usado/tope desde `/estado` cada 3 s, costo, alertas, bloqueos) y un timeline. El chip central muestra el modelo principal tomado de `/estado`.
5. **Selector de sesión**, con la opción "seguir la más reciente". Una sesión nueva cambia la vista si esa opción está marcada.
6. **Modo demo** con el botón "Ver demo" o `?demo=1`: reproduce eventos de ejemplo sin servidor.
7. **Seguridad:** solo `textContent` y `setAttribute`, nunca `innerHTML` con datos de eventos.

- [ ] **Paso 1: test de humo (debe fallar)**. Agrega este test a `tests/dashboard-server.test.mjs`:

```js
test('index.html: estructura, módulo de vista y sin innerHTML ni recursos externos', async () => {
  const { srv, base } = await levantar();
  try {
    const { texto } = await get(base, '/');
    for (const id of ['escenario', 'lineas', 'nodos', 'tarjetas', 'centro', 'sesion', 'seguir', 'conexion', 'stats', 'timeline', 'toast', 'demo']) {
      assert.match(texto, new RegExp(`id="${id}"`), `falta #${id}`);
    }
    assert.match(texto, /from '\.\/estado-vista\.js'/);
    assert.match(texto, /prefers-reduced-motion/);
    assert.match(texto, /prefers-color-scheme/);
    assert.doesNotMatch(texto, /innerHTML/);
    assert.doesNotMatch(texto, /https?:\/\/(?!127\.0\.0\.1)/);
  } finally { await srv.detener(); }
});
```

Ejecuta `node --test tests/dashboard-server.test.mjs`. **Esperado:** FALLA porque falta `#lineas`, ya que el placeholder de la Tarea 2 solo tiene `#escenario`.

- [ ] **Paso 2: escribir `plugins/orquestador/dashboard/public/index.html`**

El contenido completo está en el archivo del repo. Esta es su especificación verificable:
- **Tokens de color** en `:root` y en `@media (prefers-color-scheme: light)`. `body` con fondo explícito.
- **Layout de grilla** con `1fr 340px`. Bajo 860 px pasa a una sola columna, con el escenario de 70vh de alto y un margen de 16 px.
- **`#escenario`** (`position: relative`) contiene:
  - un SVG `#lineas` con `viewBox="0 0 100 100"`, `preserveAspectRatio="none"` y líneas con `vector-effect: non-scaling-stroke`;
  - `#nodos`, con nodos posicionados en % según `posicionOrbital(slot)`;
  - `#centro`, que pulsa con `.trabajando` y destella con `.bloqueo`;
  - `#tarjetas`;
  - `#vacio`, que lleva dentro el botón `#demo`.
- **Viaje de tarjetas:** `left`/`top` en px con una transición de 0,9 s, una pausa de lectura de 1,4 s y salida en 0,4 s. Se cronometra con `setTimeout`, no con `transitionend`.
- **Durante el viaje** se usa un `Set` de ids ocultos, para que un `render()` intermedio no muestre el nodo antes de tiempo.
- **Movimiento reducido:** con `matchMedia('(prefers-reduced-motion: reduce)')` no se anima el viaje y solo se dibuja el estado.

Ejecuta `node --test`. **Esperado:** toda la suite PASA.

- [ ] **Paso 3: verificación visual en el navegador** (no se puede automatizar sin navegador). Levanta `node plugins/orquestador/dashboard/server.mjs 4399`, abre `http://127.0.0.1:4399/?demo=1` y comprueba esto:
  - las tarjetas viajan y muestran meta, agente, persona y modelo·esfuerzo;
  - los nodos pulsan;
  - el recibo vuelve con costo y duración;
  - el nodo con alerta queda en rojo;
  - el bloqueo destella y muestra el aviso;
  - el timeline y las estadísticas se actualizan;
  - el tema oscuro y el claro se ven bien;
  - a 375 px no hay scroll horizontal.

Commit con `feat: interfaz animada del dashboard con modo demo`.

---

### Tarea 5: `lanzar.mjs` y `/orquestador:dashboard`

**Interfaces producidas:**
- `estaCorriendo(puerto, intentos = 1) → Promise<boolean>`: es `true` solo si `/salud` responde con `app: 'orquestador-dashboard'`.
- `comandoAbrir(url, plataforma) → [cmd, args]`: en win32 usa `cmd /c start "" url`, en darwin `open` y en el resto `xdg-open`.

- [ ] **Paso 1: tests (deben fallar)**: `tests/dashboard-lanzar.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { estaCorriendo, comandoAbrir } from '../plugins/orquestador/dashboard/lanzar.mjs';

const servir = (cuerpo) => new Promise((ok) => {
  const s = createServer((_q, r) => r.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(cuerpo)));
  s.listen(0, '127.0.0.1', () => ok(s));
});

test('estaCorriendo reconoce el dashboard y rechaza otra aplicación en el puerto', async () => {
  const propio = await servir({ ok: true, app: 'orquestador-dashboard' });
  const ajeno = await servir({ ok: true, app: 'otra' });
  try {
    assert.equal(await estaCorriendo(propio.address().port), true);
    assert.equal(await estaCorriendo(ajeno.address().port), false);
  } finally { propio.close(); ajeno.close(); }
  assert.equal(await estaCorriendo(1), false);
});

test('comandoAbrir por plataforma', () => {
  assert.deepEqual(comandoAbrir('http://x/', 'win32'), ['cmd', ['/c', 'start', '', 'http://x/']]);
  assert.deepEqual(comandoAbrir('http://x/', 'darwin'), ['open', ['http://x/']]);
  assert.deepEqual(comandoAbrir('http://x/', 'linux'), ['xdg-open', ['http://x/']]);
});
```

Ejecuta `node --test tests/dashboard-lanzar.test.mjs`. **Esperado:** FALLA porque el módulo no existe.

- [ ] **Paso 2: implementar `plugins/orquestador/dashboard/lanzar.mjs`**

```js
#!/usr/bin/env node
// /orquestador:dashboard: levanta el servidor si no está corriendo y abre el navegador.
// Uso: node lanzar.mjs [--no-abrir]
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cargarConfig } from '../scripts/lib/config.mjs';
import { esPrincipal } from '../scripts/lib/hook-io.mjs';

const SERVIDOR = fileURLToPath(new URL('./server.mjs', import.meta.url));

export async function estaCorriendo(puerto, intentos = 1) {
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${puerto}/salud`, { signal: AbortSignal.timeout(800) });
      if (r.ok && (await r.json()).app === 'orquestador-dashboard') return true;
    } catch { /* no responde todavía */ }
    if (i < intentos - 1) await new Promise((ok) => setTimeout(ok, 250));
  }
  return false;
}

export function comandoAbrir(url, plataforma = process.platform) {
  if (plataforma === 'win32') return ['cmd', ['/c', 'start', '', url]];
  if (plataforma === 'darwin') return ['open', [url]];
  return ['xdg-open', [url]];
}

async function main(argv) {
  const puerto = cargarConfig().puertoDashboard;
  const url = `http://127.0.0.1:${puerto}/`;
  if (!(await estaCorriendo(puerto))) {
    spawn(process.execPath, [SERVIDOR, String(puerto)], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    if (!(await estaCorriendo(puerto, 20))) {
      console.error(`No se pudo iniciar el dashboard en el puerto ${puerto}. ¿Lo usa otra aplicación? Cambia "puertoDashboard" en ~/.claude/orquestador/config.json.`);
      process.exitCode = 1;
      return;
    }
  }
  if (!argv.includes('--no-abrir')) {
    const [cmd, args] = comandoAbrir(url);
    spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  }
  console.log(`Dashboard del orquestador: ${url}`);
}

if (esPrincipal(import.meta.url)) main(process.argv.slice(2));
```

`plugins/orquestador/commands/dashboard.md`:

```markdown
---
description: Abre el dashboard en vivo del orquestador (agentes, modelos, esfuerzo, metas, costo)
---

Ejecuta `node "${CLAUDE_PLUGIN_ROOT}/dashboard/lanzar.mjs"`. Si la variable no se expandió, usa la raíz que está en `~/.claude/orquestador/plugin-root.txt`. Responde con la URL que imprime en una sola línea. Si falla porque el puerto está ocupado, muestra el mensaje tal cual.
```

Ejecuta `node --test`. **Esperado:** toda la suite PASA. Después, commit con `feat: comando /orquestador:dashboard`.

---

### Tarea 6: verificación de punta a punta y PR

- [ ] **Paso 1:** con `ORQUESTADOR_HOME` apuntando a un temporal, levanta `server.mjs` en un puerto libre y conecta un cliente SSE. Corre `claude -p --plugin-dir plugins/orquestador` con dos delegaciones en paralelo. **Esperado:** el cliente recibe en vivo `delegacion` ×2 y `fin` ×2, con `modeloReal`.
- [ ] **Paso 2:** `claude plugin validate plugins/orquestador` en verde. En el README, una sección "Dashboard" con `/orquestador:dashboard` y `?demo=1`.
- [ ] **Paso 3:** revisión final de toda la rama con un revisor nuevo, más una sola pasada de correcciones con TDD.
- [ ] **Paso 4:** push, PR con título Conventional y CI en verde. El merge queda sujeto a la confirmación del usuario.
