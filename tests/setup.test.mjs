import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
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
