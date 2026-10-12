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
