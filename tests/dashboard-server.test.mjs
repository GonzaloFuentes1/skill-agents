import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { login } from './helpers/http.mjs';
import { crearServidor } from '../plugins/orquestador/dashboard/server.mjs';
import { rutaEventos } from '../plugins/orquestador/scripts/lib/rutas.mjs';
import { guardarEstado, estadoVacio } from '../plugins/orquestador/scripts/lib/estado.mjs';

async function levantar() {
  const env = { ORQUESTADOR_HOME: mkdtempSync(join(tmpdir(), 'orq-srv-')), CLAUDE_CONFIG_DIR: mkdtempSync(join(tmpdir(), 'orq-cfg-')) };
  writeFileSync(rutaEventos(env), JSON.stringify({ v: 1, ts: '2026-10-12T10:00:00Z', session: 's1', tipo: 'sesion', cwd: '/p' }) + '\n');
  const srv = crearServidor({ env, intervaloMs: 30 });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { env, srv, base, cookie: await login(base, srv.auth.token) };
}

function get(base, ruta, headers = {}) {
  return new Promise((ok, mal) => {
    const req = request(base + ruta, { headers }, (res) => { let t = ''; res.on('data', (d) => { t += d; }); res.on('end', () => ok({ status: res.statusCode, tipo: res.headers['content-type'], texto: t })); });
    req.on('error', mal);
    req.end();
  });
}

test('salud, sesiones, estado y estáticos', async () => {
  const { env, srv, base, cookie } = await levantar();
  try {
    const sal = JSON.parse((await get(base, '/salud')).texto);
    assert.deepEqual([sal.ok, sal.app], [true, 'orquestador-dashboard']);
    assert.equal(JSON.parse((await get(base, '/sesiones', { cookie })).texto)[0].session, 's1');
    const e = estadoVacio('s1'); e.fableUsados = 1; e.modeloPrincipal = 'opus'; guardarEstado(e, env);
    const est = JSON.parse((await get(base, '/estado?session=s1', { cookie })).texto);
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
  const { env, srv, base, cookie } = await levantar();
  try {
    const recibidos = await new Promise((ok, mal) => {
      const vistos = [];
      const req = request(base + '/eventos', { headers: { cookie } }, (res) => {
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

test('frontend: estructura, módulos y sin innerHTML ni recursos externos', async () => {
  const { srv, base } = await levantar();
  try {
    const html = (await get(base, '/')).texto;
    for (const id of ['escenario', 'lineas', 'nodos', 'tarjetas', 'centro', 'centro-modelo', 'sesion', 'seguir', 'animaciones', 'conexion', 'stats', 'timeline', 'toast', 'demo', 'vacio',
      'conversaciones', 'nueva', 'uso', 'titulo', 'subtitulo', 'tab-chat', 'tab-actividad', 'vista-chat', 'vista-actividad', 'mensajes', 'composer', 'entrada', 'enviar', 'detener',
      'modo', 'tema', 'panel-agentes', 'menu', 'ver-agentes', 'cerrar-conv', 'velo', 'dialogo-nueva', 'form-nueva', 'carpeta', 'carpetas', 'modo-nueva', 'cancelar-nueva', 'error-nueva', 'titulo-input', 'chip-orquestador', 'titulo-eventos']) {
      assert.match(html, new RegExp(`id="${id}"`), `falta #${id}`);
    }
    assert.match(html, /<script type="module" src="\.\/app\.js"><\/script>/);
    assert.match((await get(base, '/actividad.js')).texto, /from '\.\/estado-vista\.js'/);
    assert.match((await get(base, '/actividad.js')).texto, /prefers-reduced-motion/);
    assert.match((await get(base, '/tema.css')).texto, /\[data-tema="claro"\]/);
    for (const archivo of ['/', '/app.js', '/actividad.js', '/chat.js', '/plan.js', '/agentes-panel.js', '/dom.js', '/chat-vista.js', '/plan-vista.js', '/config-vista.js', '/agentes-vista.js', '/tema.css', '/actividad.css']) {
      const r = await get(base, archivo);
      assert.equal(r.status, 200, archivo);
      assert.doesNotMatch(r.texto, /innerHTML/, `${archivo} usa innerHTML`);
      assert.doesNotMatch(r.texto, /https?:\/\/(?!127\.0\.0\.1)[a-z]/i, `${archivo} carga recursos externos`);
    }
  } finally { await srv.detener(); }
});
