import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ejecutarClaude, entornoAuxiliar, citarParaShell } from '../plugins/orquestador/dashboard/cli-claude.mjs';
import { ErrorConversacion } from '../plugins/orquestador/dashboard/conversaciones.mjs';
import { manejarInicio } from '../plugins/orquestador/scripts/session-start.mjs';
import { leerEventos } from '../plugins/orquestador/scripts/lib/eventos.mjs';

const FALSO_CLI = fileURLToPath(new URL('./fixtures/claude-falso-cli.mjs', import.meta.url));

// Carpeta con espacio y acento: así se prueba también la ruta de Windows con espacios.
function entornoCli(extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'orq cli ñ-'));
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ rutaClaude: 'claude-falso' }));
  const registro = join(dir, 'registro.jsonl');
  const env = { ...process.env, ORQUESTADOR_HOME: dir, CLAUDE_CONFIG_DIR: dir, CLAUDECODE: '1', ORQUESTADOR_CANAL: 'dashboard', FALSO_CLI_REGISTRO: registro, ...extra };
  const spawnFn = (_bin, args, opciones) => spawn(process.execPath, [FALSO_CLI, ...args], opciones);
  const leer = () => (existsSync(registro) ? readFileSync(registro, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
  return { dir, env, spawnFn, leer };
}
const rechazaCon = (promesa, status, patron) => assert.rejects(promesa, (e) => e instanceof ErrorConversacion && e.status === status && patron.test(e.message));

test('ErrorConversacion lleva status y un extra opcional', () => {
  const e = new ErrorConversacion(400, 'mal', { errores: { a: 'b' } });
  assert.deepEqual([e.status, e.message, e.extra], [400, 'mal', { errores: { a: 'b' } }]);
  assert.equal(new ErrorConversacion(404, 'x').extra, null);
});

test('entornoAuxiliar: sin CLAUDECODE y con ORQUESTADOR_CANAL vacío', () => {
  const e = entornoAuxiliar({ CLAUDECODE: '1', ORQUESTADOR_CANAL: 'dashboard', PATH: '/x' });
  assert.deepEqual(e, { ORQUESTADOR_CANAL: '', PATH: '/x' });
});

test('citarParaShell: vacío, espacios, comillas y barra final', () => {
  assert.equal(citarParaShell('sonnet'), 'sonnet');
  assert.equal(citarParaShell(''), '""');
  assert.equal(citarParaShell('a b'), '"a b"');
  assert.equal(citarParaShell('{"x":"y z"}'), '"{\\"x\\":\\"y z\\"}"');
  assert.equal(citarParaShell('C:\\Mi Carpeta\\'), '"C:\\Mi Carpeta\\\\"');
});

test('auto-mode defaults con el binario falso: JSON, canal vacío y sin CLAUDECODE', async () => {
  const { env, spawnFn, leer } = entornoCli();
  const r = await ejecutarClaude(['auto-mode', 'defaults'], { env, spawnFn });
  assert.equal(r.codigo, 0);
  const reglas = JSON.parse(r.stdout);
  assert.deepEqual([reglas.allow.length, reglas.soft_deny.length, reglas.hard_deny.length], [3, 4, 1]);
  const [inv] = leer();
  assert.deepEqual([inv.argv, inv.canal, inv.claudecode], [['auto-mode', 'defaults'], '', null]);
});

test('auto-mode config expande "$defaults" de settings.json', async () => {
  const { env, spawnFn, dir } = entornoCli();
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ autoMode: { allow: ['$defaults', 'Mía: x'] } }));
  const r = await ejecutarClaude(['auto-mode', 'config'], { env, spawnFn });
  assert.equal(JSON.parse(r.stdout).allow.length, 4);
});

test('un argumento vacío, un JSON con comillas y la entrada por stdin llegan intactos', async () => {
  const { env, spawnFn, leer } = entornoCli();
  const args = ['-p', '--tools', '', '--json-schema', '{"a":"b c"}'];
  const entrada = 'Nombre: Ñandú "x"\nlínea 2 \\ fin';
  await ejecutarClaude(args, { env, spawnFn, entrada });
  const [inv] = leer();
  assert.deepEqual(inv.argv, args);
  assert.equal(inv.stdin, entrada);
});

test('un código distinto de 0 se devuelve con stderr, sin rechazar', async () => {
  const { env, spawnFn } = entornoCli();
  const r = await ejecutarClaude(['inventado'], { env, spawnFn });
  assert.equal(r.codigo, 2);
  assert.match(r.stderr, /comando desconocido/);
});

test('tiempo agotado: 504 y el proceso se termina', async () => {
  const { env, spawnFn } = entornoCli({ FALSO_CLI_DEMORA_MS: '3000' });
  await rechazaCon(ejecutarClaude(['auto-mode', 'critique'], { env, spawnFn, timeoutMs: 200 }), 504, /no respondió/);
});

test('sin binario: 503 con el mensaje de rutaClaude', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'orq-cli-sin-'));
  await rechazaCon(ejecutarClaude(['auto-mode', 'defaults'], { env: { ORQUESTADOR_HOME: dir, PATH: '', Path: '' } }), 503, /No encontré el binario de Claude Code/);
});

test('session-start en un proceso auxiliar (ORQUESTADOR_CANAL vacío) no emite sesion ni inyecta contexto', () => {
  const env = { ORQUESTADOR_HOME: mkdtempSync(join(tmpdir(), 'orq-aux-')), ORQUESTADOR_CANAL: '' };
  assert.equal(manejarInicio({ session_id: 'aux' }, env, '/raiz'), null);
  assert.deepEqual(leerEventos({ session: 'aux' }, env), []);
});

test('un claude .cmd con espacios en la ruta recibe los argumentos intactos (spawn real con shell)', { skip: process.platform !== 'win32' }, async () => {
  const { env, dir, leer } = entornoCli();
  const carpeta = join(dir, 'Mi Carpeta ñ');
  mkdirSync(carpeta);
  const cmd = join(carpeta, 'claude falso.cmd');
  writeFileSync(cmd, `@echo off\r\n"${process.execPath}" "${FALSO_CLI}" %*\r\n`);
  const args = ['-p', '--tools', '', '--json-schema', '{"a":"b c"}', 'texto con espacios'];
  const r = await ejecutarClaude(args, { env, binario: cmd, entrada: 'Nombre: X' });
  assert.equal(r.codigo, 0, r.stderr);
  const [inv] = leer();
  assert.deepEqual(inv.argv, args);
});
