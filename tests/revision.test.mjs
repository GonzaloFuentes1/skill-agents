// Regresiones de la revisión final de la Fase 1 (C1, I1–I3, I6–I8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decidirDelegacion, manejar as manejarPre } from '../plugins/orquestador/scripts/pre-agent.mjs';
import { buscarDefinicion } from '../plugins/orquestador/scripts/lib/agentes.mjs';
import { cerrarDelegacion } from '../plugins/orquestador/scripts/subagent-stop.mjs';
import { asignarAgente } from '../plugins/orquestador/scripts/subagent-start.mjs';
import { cerrarFallida } from '../plugins/orquestador/scripts/post-agent-fallo.mjs';
import { hashPrompt, ultimoModelo, primerPrompt } from '../plugins/orquestador/scripts/lib/transcript.mjs';
import { estadoVacio, leerEstado, limpiarVencidas } from '../plugins/orquestador/scripts/lib/estado.mjs';
import { CONFIG_DEFECTO } from '../plugins/orquestador/scripts/lib/config.mjs';
import { rutaConfig, rutaSesion } from '../plugins/orquestador/scripts/lib/rutas.mjs';
import { esPrincipal } from '../plugins/orquestador/scripts/lib/hook-io.mjs';
import { leerSettings } from '../plugins/orquestador/scripts/setup.mjs';

const PRE = fileURLToPath(new URL('../plugins/orquestador/scripts/pre-agent.mjs', import.meta.url));
const nuevoEnv = () => ({ ORQUESTADOR_HOME: mkdtempSync(join(tmpdir(), 'orq-')) });
const entrada = (ti, id = 'tu1', extra = {}) => ({ session_id: 's', tool_name: 'Agent', tool_use_id: id, cwd: tmpdir(), tool_input: { subagent_type: 'general-purpose', description: 'm', prompt: 'x', ...ti }, ...extra });
const transcriptDe = (prompt, modelo) => [
  { type: 'user', message: { role: 'user', content: prompt } },
  { type: 'assistant', message: { id: 'm1', model: modelo, usage: { input_tokens: 10, output_tokens: 1 } } },
].map((x) => JSON.stringify(x)).join('\n');

// C1: procesos reales concurrentes + un lector constante (como la status line) no deben saltarse el tope.
test('C1: 10 pre-agent concurrentes con lector activo respetan el tope de Fable exacto', async () => {
  const env = { ...process.env, ...nuevoEnv() };
  writeFileSync(rutaConfig(env), JSON.stringify({ fableMaxPorSesion: 2, paraleloMax: 50 }));
  const ruta = rutaSesion('s', env);
  const lector = spawn(process.execPath, ['-e', `const fs=require('fs');const fin=Date.now()+15000;(function l(){try{fs.readFileSync(${JSON.stringify(ruta)})}catch{};if(Date.now()<fin)setImmediate(l)})()`]);
  const correr = (i) => new Promise((ok) => {
    const p = spawn(process.execPath, [PRE], { env });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('close', () => ok(out));
    p.stdin.end(JSON.stringify(entrada({ model: 'fable' }, `t${i}`)));
  });
  try {
    const salidas = await Promise.all(Array.from({ length: 10 }, (_, i) => correr(i)));
    const permitidas = salidas.filter((o) => !o.includes('"deny"')).length;
    assert.equal(permitidas, 2, `pasaron ${permitidas}: ${salidas.filter((o) => o && !o.includes('Tope')).join(' | ')}`);
    assert.equal(leerEstado('s', env).fableUsados, 2);
  } finally { lector.kill(); }
});

// I1: agentes integrados y desconocidos no heredan el modelo del orquestador.
test('I1: Explore se registra como haiku aunque el orquestador esté en fable', () => {
  const e = estadoVacio('s'); e.modeloPrincipal = 'fable';
  const r = decidirDelegacion(entrada({ subagent_type: 'Explore' }), e, CONFIG_DEFECTO, null);
  assert.equal(r.evento.modelo, 'haiku');
  assert.equal(r.evento.origenModelo, 'integrado');
  assert.equal(e.fableUsados, 0);
});
test('I1: agente sin definición conocida queda desconocido, no heredado', () => {
  const e = estadoVacio('s'); e.modeloPrincipal = 'opus';
  const r = decidirDelegacion(entrada({ subagent_type: 'otro:raro' }), e, CONFIG_DEFECTO, null);
  assert.equal(r.evento.modelo, 'desconocido');
});
test('I1: general-purpose sí hereda el modelo principal', () => {
  const e = estadoVacio('s'); e.modeloPrincipal = 'fable';
  assert.equal(decidirDelegacion(entrada({}), e, CONFIG_DEFECTO, null).evento.modelo, 'fable');
});
test('I1: buscarDefinicion encuentra agentes de otros plugins en la caché de plugins', () => {
  const home = mkdtempSync(join(tmpdir(), 'orq-home-'));
  const dir = join(home, '.claude', 'plugins', 'cache', 'mk', 'otroplugin', '1.0.0', 'agents');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'x.md'), '---\nname: x\nmodel: sonnet\neffort: low\n---\nPersona: P.\n');
  assert.equal(buscarDefinicion('otroplugin:x', { raizPlugin: '/nada', home }).model, 'sonnet');
});
test('I1: SubagentStop cuenta Fable si el modelo real fue fable y no estaba contado', () => {
  const e = estadoVacio('s');
  e.activas.t = { agente: 'otro:raro', modelo: 'desconocido', esfuerzo: '?', inicio: 0, agentId: 'a1' };
  cerrarDelegacion({ agent_id: 'a1' }, e, { modeloReal: 'claude-fable-5-1', uso: {}, costoUSD: 0 });
  assert.equal(e.fableUsados, 1);
});

// I2: el modelo principal se lee del transcript de la sesión, sin depender de la status line.
test('I2: ultimoModelo lee el último modelo del asistente', () => {
  const r = join(mkdtempSync(join(tmpdir(), 'orq-t-')), 't.jsonl');
  writeFileSync(r, transcriptDe('hola', 'claude-opus-5-5') + '\n' + JSON.stringify({ type: 'assistant', message: { id: 'z', model: 'claude-fable-5-1' } }) + '\n');
  assert.equal(ultimoModelo(r), 'claude-fable-5-1');
  assert.equal(ultimoModelo(join(tmpdir(), 'no-existe.jsonl')), null);
});
test('I2: sin status line, heredar Fable del transcript cuenta para el tope', async () => {
  const env = nuevoEnv();
  writeFileSync(rutaConfig(env), JSON.stringify({ fableMaxPorSesion: 0 }));
  const r = join(env.ORQUESTADOR_HOME, 'main.jsonl');
  writeFileSync(r, transcriptDe('hola', 'claude-fable-5-1'));
  const salida = await manejarPre(entrada({}, 'tu1', { transcript_path: r }), env);
  assert.equal(salida?.hookSpecificOutput?.permissionDecision, 'deny');
});

// I3: delegaciones que fallan antes de correr se cierran y devuelven el cupo.
test('I3: cerrarFallida elimina la delegación y devuelve el cupo de Fable', () => {
  const e = estadoVacio('s'); e.fableUsados = 1;
  e.activas.tu1 = { agente: 'general-purpose', modelo: 'fable', esfuerzo: 'low', inicio: 0, agentId: null, contadaFable: true };
  const r = cerrarFallida({ tool_use_id: 'tu1' }, e, 10);
  assert.equal(r.evento.tipo, 'fin');
  assert.equal(r.evento.ok, false);
  assert.equal(e.fableUsados, 0);
  assert.deepEqual(e.activas, {});
});
test('I3: limpiarVencidas poda las no asignadas de más de 10 minutos y conserva las asignadas', () => {
  const e = estadoVacio('s');
  e.activas.huerfana = { inicio: 0, agentId: null };
  e.activas.corriendo = { inicio: 0, agentId: 'a1' };
  limpiarVencidas(e, 11 * 60e3);
  assert.deepEqual(Object.keys(e.activas), ['corriendo']);
});

// I6: settings ilegible no se pisa.
test('I6: leerSettings acepta BOM, distingue inexistente y rechaza JSON roto', () => {
  const d = mkdtempSync(join(tmpdir(), 'orq-set-'));
  writeFileSync(join(d, 'bom.json'), '﻿{"model":"opus"}');
  writeFileSync(join(d, 'roto.json'), '{"model":"opus",}');
  assert.deepEqual(leerSettings(join(d, 'bom.json')), { ok: true, datos: { model: 'opus' } });
  assert.deepEqual(leerSettings(join(d, 'nada.json')), { ok: true, datos: {} });
  const roto = leerSettings(join(d, 'roto.json'));
  assert.equal(roto.ok, false);
  assert.match(roto.error, /JSON/i);
});

// I7: el hook se ejecuta aunque se invoque a través de un enlace (junction/symlink).
test('I7: esPrincipal reconoce el módulo invocado vía junction', () => {
  const real = mkdtempSync(join(tmpdir(), 'orq-real-'));
  writeFileSync(join(real, 'h.mjs'), '');
  const enlace = join(mkdtempSync(join(tmpdir(), 'orq-link-')), 'plug');
  symlinkSync(real, enlace, 'junction');
  assert.equal(esPrincipal(pathToFileURL(join(real, 'h.mjs')).href, join(enlace, 'h.mjs')), true);
});

// I8: correlación exacta por prompt cuando hay paralelas del mismo tipo.
test('I8: paralelas del mismo tipo se emparejan por prompt, sin alertas falsas', () => {
  const e = estadoVacio('s');
  decidirDelegacion(entrada({ model: 'haiku', prompt: 'A' }, 'tA'), e, CONFIG_DEFECTO, null);
  decidirDelegacion(entrada({ model: 'opus', prompt: 'B' }, 'tB'), e, CONFIG_DEFECTO, null);
  assert.equal(e.activas.tA.promptHash, hashPrompt('A'));
  asignarAgente({ agent_id: 'a1', agent_type: 'general-purpose' }, e); // FIFO asigna a1 a tA (haiku)...
  asignarAgente({ agent_id: 'a2', agent_type: 'general-purpose' }, e);
  // ...pero a1 era en realidad el prompt B (opus).
  const r1 = cerrarDelegacion({ agent_id: 'a1', agent_type: 'general-purpose' }, e, { modeloReal: 'claude-opus-5-5', uso: {}, costoUSD: 0, promptHash: hashPrompt('B') });
  assert.equal(r1.eventos[0].id, 'tB');
  assert.equal(r1.alerta, null);
  const r2 = cerrarDelegacion({ agent_id: 'a2', agent_type: 'general-purpose' }, e, { modeloReal: 'claude-haiku-5-5', uso: {}, costoUSD: 0, promptHash: hashPrompt('A') });
  assert.equal(r2.eventos[0].id, 'tA');
  assert.equal(r2.alerta, null);
});
test('I8: primerPrompt extrae el primer mensaje de usuario (texto o bloques)', () => {
  assert.equal(primerPrompt(transcriptDe('Responde: ok', 'm')), 'Responde: ok');
  const bloques = JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: 'Hola' }] } });
  assert.equal(primerPrompt(bloques), 'Hola');
});
