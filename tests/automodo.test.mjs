import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  entornoAProsa, prosaAEntorno, leerAutoModo, escribirAutoModo, parsearReglas, etiquetaRegla, crearAutoModo, SUFIJO_RESPALDO,
} from '../plugins/orquestador/dashboard/automodo.mjs';
import { rutaSettingsUsuario } from '../plugins/orquestador/scripts/lib/rutas.mjs';
import { ErrorConversacion } from '../plugins/orquestador/dashboard/conversaciones.mjs';

const FALSO_CLI = fileURLToPath(new URL('./fixtures/claude-falso-cli.mjs', import.meta.url));

// CLAUDE_CONFIG_DIR con espacios y acentos, como un perfil de Windows.
function entorno(settings) {
  const dir = mkdtempSync(join(tmpdir(), 'orq auto ñ-'));
  const claude = join(dir, 'Claude Config');
  mkdirSync(claude);
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ rutaClaude: 'claude-falso' }));
  const env = { ...process.env, ORQUESTADOR_HOME: dir, CLAUDE_CONFIG_DIR: claude, FALSO_CLI_REGISTRO: join(dir, 'registro.jsonl') };
  if (settings !== undefined) writeFileSync(rutaSettingsUsuario(env), settings);
  const spawnFn = (_bin, args, opciones) => spawn(process.execPath, [FALSO_CLI, ...args], opciones);
  const invocaciones = () => (existsSync(env.FALSO_CLI_REGISTRO) ? readFileSync(env.FALSO_CLI_REGISTRO, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
  const leer = () => JSON.parse(readFileSync(rutaSettingsUsuario(env), 'utf8'));
  return { env, spawnFn, invocaciones, leer };
}
const rechaza = (fn, status) => assert.rejects(async () => fn(), (e) => e instanceof ErrorConversacion && e.status === status);

test('entorno de confianza: ida y vuelta en prosa; "$defaults" fuera y las otras entradas se conservan', () => {
  const prosa = entornoAProsa({ repos: ['github.com/GonzaloFuentes1/*', 'gitlab.com/x'], dominios: ['cenia.cl'], organizacion: 'CENIA' });
  assert.deepEqual(prosa, ['Source control: github.com/GonzaloFuentes1/*, gitlab.com/x', 'Trusted internal domains: cenia.cl', 'Organization: CENIA']);
  assert.deepEqual(prosaAEntorno(['$defaults', ...prosa, 'Uso Kubernetes interno']), {
    repos: ['github.com/GonzaloFuentes1/*', 'gitlab.com/x'], dominios: ['cenia.cl'], organizacion: 'CENIA', otras: ['Uso Kubernetes interno'],
  });
  assert.deepEqual(entornoAProsa({}), []);
  assert.deepEqual(prosaAEntorno(undefined), { repos: [], dominios: [], organizacion: '', otras: [] });
});

test('escribir: BOM, claves ajenas y hard_deny propio se conservan; respaldo idéntico; indentación de 2', () => {
  const original = '\uFEFF' + JSON.stringify({
    model: 'opus', hooks: { Stop: [] }, permissions: { allow: ['Bash(npm test)'], deny: ['Read(.env)'] },
    autoMode: { hard_deny: ['$defaults', 'Nunca borres datasets/'], environment: ['$defaults', 'Uso Kubernetes interno'], allow: ['vieja'] },
  }, null, 4);
  const { env, leer } = entorno(original);
  const r = escribirAutoModo({
    permitir: ['Correr uv run en bench/'], detener: ['Cualquier gh pr merge'],
    entorno: { repos: ['github.com/GonzaloFuentes1/*'], dominios: [], organizacion: '' }, classifyAllShell: true, defaultModeTerminal: false,
  }, env);
  const s = leer();
  assert.equal(s.model, 'opus');
  assert.deepEqual(s.hooks, { Stop: [] });
  assert.deepEqual(s.permissions, { allow: ['Bash(npm test)'], deny: ['Read(.env)'] });
  assert.deepEqual(s.autoMode.hard_deny, ['$defaults', 'Nunca borres datasets/']);
  assert.deepEqual(s.autoMode.allow, ['$defaults', 'Correr uv run en bench/']);
  assert.deepEqual(s.autoMode.soft_deny, ['$defaults', 'Cualquier gh pr merge']);
  assert.deepEqual(s.autoMode.environment, ['$defaults', 'Source control: github.com/GonzaloFuentes1/*', 'Uso Kubernetes interno']);
  assert.equal(s.autoMode.classifyAllShell, true);
  assert.equal(readFileSync(rutaSettingsUsuario(env) + SUFIJO_RESPALDO, 'utf8'), original);
  assert.match(readFileSync(rutaSettingsUsuario(env), 'utf8'), /^\{\n {2}"model"/);
  assert.deepEqual(r.personalizadas.permitir, ['Correr uv run en bench/']);
  assert.deepEqual(r.personalizadas.otrasEntorno, ['Uso Kubernetes interno']);
});

test('defaultModeTerminal: escribe y quita permissions.defaultMode sin tocar permissions.allow', () => {
  const { env, leer } = entorno(JSON.stringify({ permissions: { allow: ['Read'] } }));
  escribirAutoModo({ defaultModeTerminal: true }, env);
  assert.deepEqual(leer().permissions, { allow: ['Read'], defaultMode: 'auto' });
  assert.equal(leerAutoModo(env).defaultModeTerminal, true);
  escribirAutoModo({ defaultModeTerminal: false }, env);
  assert.deepEqual(leer().permissions, { allow: ['Read'] });
});

test('settings.json inválido: 409, no se escribe ni se respalda; ausente: se crea sin respaldo', async () => {
  const { env } = entorno('{roto');
  await rechaza(() => escribirAutoModo({ permitir: [] }, env), 409);
  assert.equal(readFileSync(rutaSettingsUsuario(env), 'utf8'), '{roto');
  assert.equal(existsSync(rutaSettingsUsuario(env) + SUFIJO_RESPALDO), false);
  assert.match(leerAutoModo(env).errorSettings, /no es JSON válido/);
  const nuevo = entorno();
  escribirAutoModo({ permitir: ['x'] }, nuevo.env);
  assert.deepEqual(nuevo.leer(), { autoMode: { environment: ['$defaults'], allow: ['$defaults', 'x'], soft_deny: ['$defaults'] } });
  assert.equal(existsSync(rutaSettingsUsuario(nuevo.env) + SUFIJO_RESPALDO), false);
});

test('validación: "$defaults" propio, comas en repos y saltos de línea dan 400 con errores por campo', async () => {
  const { env } = entorno();
  const con = (cuerpo, campo) => assert.rejects(async () => escribirAutoModo(cuerpo, env), (e) => e.status === 400 && !!e.extra?.errores?.[campo]);
  await con({ permitir: ['$defaults'] }, 'permitir');
  await con({ entorno: { repos: ['a, b'] } }, 'repos');
  await con({ detener: ['dos\nlíneas'] }, 'detener');
  await con({ classifyAllShell: 'sí' }, 'classifyAllShell');
  assert.equal(existsSync(rutaSettingsUsuario(env)), false);
});

test('leerAutoModo marca los arreglos propios que reemplazan los de fábrica', () => {
  const { env } = entorno(JSON.stringify({ autoMode: { allow: ['solo esta'], soft_deny: ['$defaults', 'y esta'] } }));
  const a = leerAutoModo(env);
  assert.deepEqual(a.sinFabrica, ['allow']);
  assert.deepEqual([a.personalizadas.permitir, a.personalizadas.detener], [['solo esta'], ['y esta']]);
});

test('parsearReglas y etiquetaRegla', () => {
  assert.deepEqual(parsearReglas(JSON.stringify({ autoMode: { allow: ['a: b'], hard_deny: ['c'] } })), { environment: [], allow: ['a: b'], soft_deny: [], hard_deny: ['c'] });
  assert.throws(() => parsearReglas('no json'), (e) => e.status === 502);
  assert.equal(etiquetaRegla('Git Destructive: force-push'), 'Git Destructive');
  assert.equal(etiquetaRegla('Sin etiqueta'), 'Sin etiqueta');
});

test('estado: conteos del binario falso con caché de 10 minutos; fabrica usa la misma caché', async () => {
  let t = 0;
  const { env, spawnFn, invocaciones } = entorno();
  const am = crearAutoModo({ env, spawnFn, ahora: () => t });
  const e1 = await am.estado();
  assert.deepEqual([e1.disponible, e1.conteosFabrica], [true, { allow: 3, soft_deny: 4, hard_deny: 1 }]);
  await am.estado();
  assert.deepEqual((await am.fabrica()).hard_deny, ['Data Exfiltration']);
  assert.equal(invocaciones().length, 1);
  t = 10 * 60 * 1000 + 1;
  await am.estado();
  assert.equal(invocaciones().length, 2);
  assert.deepEqual(invocaciones()[0].argv, ['auto-mode', 'defaults']);
});

test('sin binario: disponible false con el motivo, y las reglas propias se leen igual', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'orq-auto-sin-'));
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ autoMode: { allow: ['$defaults', 'x'] } }));
  const e = await crearAutoModo({ env: { ORQUESTADOR_HOME: dir, CLAUDE_CONFIG_DIR: dir, PATH: '', Path: '' } }).estado();
  assert.equal(e.disponible, false);
  assert.match(e.motivo, /No encontré el binario/);
  assert.deepEqual(e.personalizadas.permitir, ['x']);
  assert.equal(e.conteosFabrica, null);
});

test('critica: devuelve el texto de `claude auto-mode critique`', async () => {
  const { env, spawnFn, invocaciones } = entorno();
  assert.match((await crearAutoModo({ env, spawnFn }).critica()).texto, /Sugerencia/);
  assert.deepEqual(invocaciones()[0].argv, ['auto-mode', 'critique']);
});

test('restablecer: sin {confirmar:true} da 400 y no hace nada; con confirmación respalda y corre reset -y', async () => {
  const original = JSON.stringify({ model: 'opus', autoMode: { allow: ['$defaults', 'x'] } });
  const { env, spawnFn, invocaciones, leer } = entorno(original);
  const am = crearAutoModo({ env, spawnFn });
  await rechaza(() => am.restablecer({}), 400);
  await rechaza(() => am.restablecer({ confirmar: 'true' }), 400);
  assert.equal(invocaciones().length, 0);
  assert.equal(readFileSync(rutaSettingsUsuario(env), 'utf8'), original);
  const e = await am.restablecer({ confirmar: true });
  assert.deepEqual(leer(), { model: 'opus' });
  assert.equal(readFileSync(rutaSettingsUsuario(env) + SUFIJO_RESPALDO, 'utf8'), original);
  assert.deepEqual(invocaciones().map((i) => i.argv), [['auto-mode', 'reset', '-y'], ['auto-mode', 'defaults']]);
  assert.deepEqual(e.personalizadas.permitir, []);
});
