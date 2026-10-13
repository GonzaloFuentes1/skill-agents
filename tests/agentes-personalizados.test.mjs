import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  slugAgente, validarAgente, construirArchivo, seccionesDe, crearPersonalizado, editarPersonalizado, eliminarPersonalizado,
  activarCatalogo, listarAgentes, redactarPrompt, REGLAS_CRITICAS,
} from '../plugins/orquestador/dashboard/agentes.mjs';
import { ErrorConversacion } from '../plugins/orquestador/dashboard/conversaciones.mjs';
import { parsearFrontmatter } from '../plugins/orquestador/scripts/lib/frontmatter.mjs';
import { rutaAgentesUsuario } from '../plugins/orquestador/scripts/lib/rutas.mjs';
import { crearPluginFalso } from './helpers/plugin-falso.mjs';

const FALSO_CLI = fileURLToPath(new URL('./fixtures/claude-falso-cli.mjs', import.meta.url));

function preparar() {
  const raizPlugin = crearPluginFalso();
  const base = mkdtempSync(join(tmpdir(), 'orq pers ñ-'));
  const env = { CLAUDE_CONFIG_DIR: join(base, 'Claude Config') };
  const cwd = join(base, 'Mi Repo ñ');
  mkdirSync(cwd);
  return { o: { env, raizPlugin }, env, cwd };
}
const campos = (extra = {}) => ({
  nombre: 'Investigador RL', descripcion: 'Diseña experimentos de RL. Úsalo para planificar, no para implementar.', modelo: 'opus', esfuerzo: 'high',
  herramientas: ['Read', 'WebSearch'], alcance: 'usuario',
  secciones: { rol: 'Investigador de RL escéptico. Hipótesis antes que código.', metodo: '1. Define la hipótesis.\n2. Diseña ablations.', entregable: 'Plan experimental.', restricciones: '- No implementa.', retorno: 'Máximo 300 palabras.' },
  ...extra,
});
const lanza = (fn, status, patron) => assert.throws(fn, (e) => e instanceof ErrorConversacion && e.status === status && (!patron || patron.test(e.message)));

function cli(modo, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'orq-redactar-'));
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ rutaClaude: 'claude-falso' }));
  const registro = join(dir, 'registro.jsonl');
  const env = { ...process.env, ORQUESTADOR_HOME: dir, CLAUDE_CONFIG_DIR: dir, FALSO_CLI_REGISTRO: registro, FALSO_CLI_MODO: modo, ...extra };
  const spawnFn = (_bin, args, opciones) => spawn(process.execPath, [FALSO_CLI, ...args], opciones);
  const invocaciones = () => (existsSync(registro) ? readFileSync(registro, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
  return { env, spawnFn, invocaciones };
}
const pedido = { nombre: 'Investigador RL', descripcion: 'Diseña experimentos de RL.', modelo: 'opus', herramientas: ['Read'] };

test('slugAgente: minúsculas, sin tildes y con guiones', () => {
  assert.equal(slugAgente('Investigador RL'), 'investigador-rl');
  assert.equal(slugAgente('  Diseñador Ñandú / UX  '), 'disenador-nandu-ux');
  assert.equal(slugAgente('!!'), '');
  assert.ok(slugAgente('x'.repeat(60)).length <= 40);
});

test('construirArchivo: mismo formato del catálogo y secciones recuperables', () => {
  const { errores, limpio } = validarAgente(campos());
  assert.deepEqual(errores, {});
  const texto = construirArchivo(limpio);
  const { datos, cuerpo } = parsearFrontmatter(texto);
  assert.deepEqual([datos.name, datos.model, datos.effort, datos.tools, datos.color], ['investigador-rl', 'opus', 'high', 'Read, WebSearch', 'purple']);
  assert.equal(datos.description, campos().descripcion);
  assert.match(texto, /^description: "/m);
  assert.match(cuerpo, /^Persona: Investigador de RL escéptico\.$/m);
  assert.deepEqual(seccionesDe(cuerpo), campos().secciones);
  assert.ok(cuerpo.includes(REGLAS_CRITICAS));
});

test('validarAgente: errores por campo', () => {
  const { errores } = validarAgente(campos({ nombre: 'x', descripcion: 'corta', modelo: 'gpt', esfuerzo: 'turbo', herramientas: [], alcance: 'todos', secciones: { rol: '## Rol falso', metodo: '' } }));
  assert.deepEqual(Object.keys(errores).sort(), ['alcance', 'descripcion', 'entregable', 'esfuerzo', 'herramientas', 'metodo', 'modelo', 'nombre', 'restricciones', 'retorno', 'rol'].sort());
  assert.match(validarAgente(campos({ descripcion: 'Con "comillas" que romperían el YAML del frontmatter' })).errores.descripcion, /comillas/);
  assert.match(validarAgente(campos({ herramientas: ['Read', 'Inventada'] })).errores.herramientas, /herramienta/);
});

test('crear (usuario): escribe sin marcador, no sobrescribe y aparece en personalizados', () => {
  const { o, env } = preparar();
  const d = crearPersonalizado(campos(), o);
  assert.deepEqual([d.id, d.origen, d.alcance, d.editable], ['investigador-rl', 'usuario', 'usuario', true]);
  assert.doesNotMatch(readFileSync(join(rutaAgentesUsuario(env), 'investigador-rl.md'), 'utf8'), /orquestador:catalogo/);
  lanza(() => crearPersonalizado(campos(), o), 409, /Ya existe un agente llamado investigador-rl/);
  assert.deepEqual(listarAgentes(o).personalizados.map((a) => a.id), ['investigador-rl']);
});

test('crear: un id del catálogo, del plugin o integrado da 409; uno inválido, 400 con errores', () => {
  const { o } = preparar();
  lanza(() => crearPersonalizado(campos({ nombre: 'Alfa' }), o), 409, /catálogo/);
  lanza(() => crearPersonalizado(campos({ nombre: 'Guardian Git' }), o), 409, /plugin o integrado/);
  lanza(() => crearPersonalizado(campos({ nombre: 'Explore' }), o), 409, /plugin o integrado/);
  assert.throws(() => crearPersonalizado(campos({ nombre: '¡!' }), o), (e) => e.status === 400 && !!e.extra?.errores?.nombre);
});

test('crear (proyecto): exige conversación y escribe en <cwd>/.claude/agents aunque la ruta tenga espacios y tildes', () => {
  const { o, cwd } = preparar();
  lanza(() => crearPersonalizado(campos({ alcance: 'proyecto' }), o), 400, /abre una conversación/);
  crearPersonalizado(campos({ alcance: 'proyecto' }), { ...o, cwdProyecto: cwd });
  assert.ok(existsSync(join(cwd, '.claude', 'agents', 'investigador-rl.md')));
  assert.deepEqual(listarAgentes({ ...o, cwdProyecto: cwd }).personalizados.map((a) => [a.id, a.alcance]), [['investigador-rl', 'proyecto']]);
});

test('editar: respalda en .bak, reescribe, ignora el nombre nuevo y no edita un agente activado del catálogo', () => {
  const { o, env } = preparar();
  crearPersonalizado(campos(), o);
  const ruta = join(rutaAgentesUsuario(env), 'investigador-rl.md');
  const antes = readFileSync(ruta, 'utf8');
  const d = editarPersonalizado('investigador-rl', campos({ esfuerzo: 'xhigh', nombre: 'Otro nombre' }), o);
  assert.deepEqual([d.id, d.effort], ['investigador-rl', 'xhigh']);
  assert.equal(readFileSync(`${ruta}.bak`, 'utf8'), antes);
  activarCatalogo('alfa', o);
  lanza(() => editarPersonalizado('alfa', campos(), o), 409);
  lanza(() => editarPersonalizado('no-existe', campos(), o), 404);
});

test('eliminar: sin {confirmar:true} da 400 y no toca nada; con confirmación borra y deja .bak', () => {
  const { o, env } = preparar();
  crearPersonalizado(campos(), o);
  const ruta = join(rutaAgentesUsuario(env), 'investigador-rl.md');
  lanza(() => eliminarPersonalizado('investigador-rl', {}, o), 400);
  lanza(() => eliminarPersonalizado('investigador-rl', { confirmar: 'true' }, o), 400);
  assert.ok(existsSync(ruta));
  assert.deepEqual(eliminarPersonalizado('investigador-rl', { confirmar: true }, o), { id: 'investigador-rl', eliminado: true });
  assert.equal(existsSync(ruta), false);
  assert.ok(existsSync(`${ruta}.bak`));
  activarCatalogo('alfa', o);
  lanza(() => eliminarPersonalizado('alfa', { confirmar: true }, o), 409);
});

test('redactar: argumentos exactos, prompt por stdin y secciones desde structured_output', async () => {
  const { env, spawnFn, invocaciones } = cli('estructurado');
  const s = await redactarPrompt(pedido, { env, spawnFn });
  assert.deepEqual(Object.keys(s), ['rol', 'metodo', 'entregable', 'restricciones', 'retorno']);
  assert.match(s.rol, /Investigador RL/);
  const [inv] = invocaciones();
  assert.deepEqual(inv.argv.slice(0, 9), ['-p', '--model', 'sonnet', '--tools', '', '--no-session-persistence', '--output-format', 'json', '--json-schema']);
  assert.deepEqual(JSON.parse(inv.argv[9]).required, ['rol', 'metodo', 'entregable', 'restricciones', 'retorno']);
  assert.match(inv.stdin, /Nombre: Investigador RL/);
  assert.match(inv.stdin, /escribe en español, profesional, sin relleno/i);
  assert.equal(inv.canal, '');
});

test('redactar: sin structured_output usa el result parseado como JSON', async () => {
  const { env, spawnFn } = cli('solo-result');
  assert.match((await redactarPrompt(pedido, { env, spawnFn })).metodo, /^1\. /);
});

test('redactar: los fallos de Claude dan 502 con su mensaje', async () => {
  for (const [modo, patron] of [['error', /límite de uso/], ['basura', /borrador válido/], ['is-error', /No se pudo completar/]]) {
    const { env, spawnFn } = cli(modo);
    await assert.rejects(redactarPrompt(pedido, { env, spawnFn }), (e) => e.status === 502 && patron.test(e.message), modo);
  }
});

test('redactar: tiempo agotado da 504; datos inválidos dan 400 sin lanzar procesos', async () => {
  const lento = cli('estructurado', { FALSO_CLI_DEMORA_MS: '3000' });
  await assert.rejects(redactarPrompt(pedido, { env: lento.env, spawnFn: lento.spawnFn, timeoutMs: 200 }), (e) => e.status === 504);
  const { env, spawnFn, invocaciones } = cli('estructurado');
  await assert.rejects(redactarPrompt({ ...pedido, nombre: '' }, { env, spawnFn }), (e) => e.status === 400);
  await assert.rejects(redactarPrompt({ ...pedido, modelo: 'gpt' }, { env, spawnFn }), (e) => e.status === 400);
  assert.equal(invocaciones().length, 0);
});
