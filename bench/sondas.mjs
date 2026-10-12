#!/usr/bin/env node
// Capa 2: lanza claude -p mínimos con hooks grabadores y resume qué campos llegan de verdad.
// Uso: node bench/sondas.mjs   (consume uso de tu cuenta: 2 corridas cortas en sonnet)
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resumirCaptura } from './sondas/resumen.mjs';

const GRABADOR = fileURLToPath(new URL('./sondas/grabador.mjs', import.meta.url));
const RESULTADOS = fileURLToPath(new URL('./resultados/', import.meta.url));
const hook = (evento) => ({ type: 'command', command: 'node', args: [GRABADOR, evento], timeout: 10 });

const settings = {
  hooks: {
    SessionStart: [{ hooks: [hook('SessionStart')] }],
    PreToolUse: [{ matcher: 'Agent|Task', hooks: [hook('PreToolUse')] }],
    PostToolUse: [{ matcher: 'Agent|Task', hooks: [hook('PostToolUse')] }],
    SubagentStart: [{ hooks: [hook('SubagentStart')] }],
    SubagentStop: [{ hooks: [hook('SubagentStop')] }],
  },
};

const casos = [
  { nombre: 'modelo-explicito', esperado: 'haiku',
    prompt: "Usa el tool Agent con subagent_type 'sonda-eco', model 'haiku' y effort 'low', con la descripción 'eco' y el prompt 'Responde exactamente: ok'. Espera su resultado y no hagas nada más." },
  { nombre: 'modelo-frontmatter', esperado: 'sonnet',
    prompt: "Usa el tool Agent con subagent_type 'sonda-eco' SIN indicar model ni effort, con la descripción 'eco' y el prompt 'Responde exactamente: ok'. Espera su resultado y no hagas nada más." },
];

function correrClaude(args, opciones) {
  let r = spawnSync('claude', args, opciones);
  if (r.error?.code === 'ENOENT') r = spawnSync('claude', args, { ...opciones, shell: true });
  return r;
}

mkdirSync(RESULTADOS, { recursive: true });
const salida = { fecha: new Date().toISOString(), casos: [] };
for (const caso of casos) {
  const dir = mkdtempSync(join(tmpdir(), `orq-sonda-${caso.nombre}-`));
  mkdirSync(join(dir, '.claude', 'agents'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'agents', 'sonda-eco.md'),
    '---\nname: sonda-eco\ndescription: Agente de sondeo que responde ok.\nmodel: sonnet\neffort: low\n---\nResponde exactamente lo que te pidan.\n');
  const rutaSettings = join(dir, 'settings-sonda.json');
  writeFileSync(rutaSettings, JSON.stringify(settings));
  const captura = join(dir, 'captura.jsonl');
  const r = correrClaude(
    ['-p', caso.prompt, '--settings', rutaSettings, '--output-format', 'json', '--model', 'sonnet',
      '--allowedTools', 'Agent', '--permission-mode', 'dontAsk'],
    { cwd: dir, env: { ...process.env, SONDA_SALIDA: captura }, encoding: 'utf8', timeout: 300_000 },
  );
  const lineas = existsSync(captura)
    ? readFileSync(captura, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : [];
  const resumen = resumirCaptura(lineas, (ruta) => readFileSync(ruta, 'utf8'));
  let costo = null;
  try { costo = JSON.parse(r.stdout).total_cost_usd ?? null; } catch {}
  const reales = Object.values(resumen.modelosReales).flat();
  salida.casos.push({ ...caso, dir, exit: r.status, stderr: (r.stderr ?? '').slice(0, 2000), costo, resumen,
    veredicto: reales.length ? (reales.every((m) => m.includes(caso.esperado)) ? 'OK' : `MISMATCH: ${reales.join(',')}`) : 'SIN TRANSCRIPT' });
}
const archivo = join(RESULTADOS, `sondas-${Date.now()}.json`);
writeFileSync(archivo, JSON.stringify(salida, null, 2));
for (const c of salida.casos) console.log(`${c.nombre}: exit=${c.exit} veredicto=${c.veredicto} costo=${c.costo}`);
console.log(`Detalle: ${archivo}`);
