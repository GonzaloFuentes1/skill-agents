#!/usr/bin/env node
// Sonda del protocolo stream-json para el chat del dashboard (entrega 1).
// Uso: node bench/sondas/stream-json.mjs   (consume uso de tu cuenta: 2 turnos cortos en haiku)
//      node bench/sondas/stream-json.mjs --escritura   (fuerza una solicitud de permiso; gasta lo mismo: 2 turnos cortos en haiku)
//      node bench/sondas/stream-json.mjs --interrumpir (interrumpe el primer turno al llegar el primer delta; combinable con --escritura)
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
const interrumpir = process.argv.includes('--interrumpir');
// Qué pasa tras el interrupt: ¿llega result (y con qué subtype), control_cancel_request o la respuesta al pedido?
let interrupcion = null;
const limite = setTimeout(() => { console.error('Tiempo agotado (120 s).'); hijo.kill(); }, 120000);

createInterface({ input: hijo.stdout }).on('line', (l) => {
  lineas.push(l);
  let m;
  try { m = JSON.parse(l); } catch { return; }
  if (interrumpir && !interrupcion && turnos === 0 && m.type === 'stream_event' && m.event?.type === 'content_block_delta') {
    escribir({ type: 'control_request', request_id: 'orq-int', request: { subtype: 'interrupt' } });
    interrupcion = { enviadaTrasLinea: lineas.length, result: false, subtypeResult: null, cancelaciones: [], respuesta: null };
    // Si nunca llega el result, se cierra stdin para no quedar colgados hasta el límite de 120 s.
    setTimeout(() => { if (!interrupcion.result) hijo.stdin.end(); }, 15000).unref();
  }
  if (interrupcion) {
    if (m.type === 'result' && !interrupcion.result) { interrupcion.result = true; interrupcion.subtypeResult = m.subtype ?? null; }
    if (m.type === 'control_cancel_request') interrupcion.cancelaciones.push(m.request_id ?? null);
    if (m.type === 'control_response' && m.response?.request_id === 'orq-int') interrupcion.respuesta = { subtipo: m.response.subtype ?? null, error: m.response.error ?? null };
  }
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
  console.log(JSON.stringify({ codigo, archivo, stderr: stderr.trim().slice(-500), ...resumirStreamJson(lineas), ...(interrumpir ? { interrupcion } : {}) }, null, 2));
});
usuario(process.argv.includes('--escritura')
  ? 'Crea el archivo prueba.txt con el contenido hola usando la herramienta Write y responde solo "listo".'
  : 'Ejecuta con Bash el comando `node --version` y responde solo con la versión.');
