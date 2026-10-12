#!/usr/bin/env node
// /orquestador:setup. Sin --aplicar solo muestra el plan; con --aplicar escribe.
// Uso: node setup.mjs [--aplicar] [--repo <dir>] [--reemplazar-statusline]
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirBase, rutaConfig, rutaRaizPlugin } from './lib/rutas.mjs';
import { asegurarConfig } from './lib/config.mjs';
import { esPrincipal } from './lib/hook-io.mjs';

const RAIZ_PLUGIN = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
const MARCA = '# orquestador: hook generado por /orquestador:setup';
const ATRIBUCION = { commit: '', pr: '', sessionUrl: false };
const STATUS = [['statusLine', 'statusline.mjs'], ['subagentStatusLine', 'subagent-statusline.mjs']];

export function fusionarSettings(actual, { binDir, reemplazarStatusline = false }) {
  const nuevo = structuredClone(actual ?? {});
  const cambios = [];
  const conflictos = [];
  const a = nuevo.attribution;
  if (!a || typeof a !== 'object' || a.commit !== '' || a.pr !== '' || a.sessionUrl !== false) {
    nuevo.attribution = { ...(a && typeof a === 'object' ? a : {}), ...ATRIBUCION };
    cambios.push('attribution: sin coautoría de Claude en commits ni PRs');
  }
  for (const [clave, script] of STATUS) {
    const comando = `node "${join(binDir, script).replace(/\\/g, '/')}"`;
    const act = nuevo[clave];
    if (act?.command === comando) continue;
    if (act && !reemplazarStatusline) {
      conflictos.push(`${clave} ya existe ("${act.command}"); usa --reemplazar-statusline para cambiarlo`);
      continue;
    }
    nuevo[clave] = clave === 'statusLine' ? { type: 'command', command: comando, refreshInterval: 2 } : { type: 'command', command: comando };
    cambios.push(`${clave}: ${comando}`);
  }
  return { nuevo, cambios, conflictos };
}

export function compararVersion(texto, minima = '2.1.170') {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(String(texto ?? ''));
  if (!m) return { ok: false, version: null };
  const v = m.slice(1).map(Number);
  const w = minima.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (v[i] !== w[i]) return { ok: v[i] > w[i], version: m[0] };
  return { ok: true, version: m[0] };
}

export function generarStub(script) {
  return `// Generado por /orquestador:setup: carga ${script} desde la versión instalada del plugin.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
const base = process.env.ORQUESTADOR_HOME || join(homedir(), '.claude', 'orquestador');
try {
  const raiz = readFileSync(join(base, 'plugin-root.txt'), 'utf8').trim();
  const m = await import(pathToFileURL(join(raiz, 'scripts', '${script}')).href);
  await m.main();
} catch {
  process.stdout.write('🎛 orquestador (reinicia Claude Code para activar)');
}
`;
}

export function instalarStubs(env = process.env) {
  const bin = join(dirBase(env), 'bin');
  mkdirSync(bin, { recursive: true });
  for (const [, script] of STATUS) writeFileSync(join(bin, script), generarStub(script));
  return bin;
}

export function instalarGitHooks(dirHooks, origen) {
  const destino = join(dirHooks, 'orquestador');
  mkdirSync(destino, { recursive: true });
  for (const f of ['reglas-git.mjs', 'commit-msg.mjs', 'pre-push.mjs']) copyFileSync(join(origen, f), join(destino, f));
  const r = { instalados: [], conflictos: [] };
  for (const h of ['commit-msg', 'pre-push']) {
    const ruta = join(dirHooks, h);
    const existente = existsSync(ruta) ? readFileSync(ruta, 'utf8') : null;
    if (existente && !existente.includes(MARCA)) { r.conflictos.push(`${h} ya existe y no es del orquestador; no se tocó`); continue; }
    writeFileSync(ruta, `#!/bin/sh\n${MARCA}\nexec node "$(dirname "$0")/orquestador/${h}.mjs" "$@"\n`, { mode: 0o755 });
    r.instalados.push(h);
  }
  return r;
}

function ejecutar(cmd, args, opciones = {}) {
  try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...opciones }).trim(); } catch { return ''; }
}

async function main(argv, env = process.env) {
  const aplicar = argv.includes('--aplicar');
  const iRepo = argv.indexOf('--repo');
  const repo = resolve(iRepo >= 0 ? argv[iRepo + 1] : process.cwd());
  const rutaSettings = join(homedir(), '.claude', 'settings.json');
  let actual = {};
  try { actual = JSON.parse(readFileSync(rutaSettings, 'utf8')); } catch { /* sin settings o ilegible */ }
  const binDir = join(dirBase(env), 'bin');
  const { nuevo, cambios, conflictos } = fusionarSettings(actual, { binDir, reemplazarStatusline: argv.includes('--reemplazar-statusline') });
  const version = compararVersion(ejecutar('claude', ['--version']));
  const rutaHooks = ejecutar('git', ['-C', repo, 'rev-parse', '--git-path', 'hooks']);
  const dirHooks = rutaHooks ? resolve(repo, rutaHooks) : null;
  const plan = {
    aplicado: aplicar,
    settings: { ruta: rutaSettings, cambios, conflictos },
    versionClaude: version.ok ? version.version : `${version.version ?? 'desconocida'} (se requiere ≥ 2.1.170: ejecuta "claude update")`,
    config: rutaConfig(env),
    gitHooks: dirHooks ?? 'el directorio no es un repo git',
  };
  if (aplicar) {
    if (cambios.length) {
      if (existsSync(rutaSettings)) copyFileSync(rutaSettings, `${rutaSettings}.bak-orquestador`);
      mkdirSync(join(homedir(), '.claude'), { recursive: true });
      writeFileSync(rutaSettings, JSON.stringify(nuevo, null, 2) + '\n');
    }
    asegurarConfig(env);
    instalarStubs(env);
    writeFileSync(rutaRaizPlugin(env), RAIZ_PLUGIN);
    if (dirHooks) plan.gitHooks = { dir: dirHooks, ...instalarGitHooks(dirHooks, join(RAIZ_PLUGIN, 'scripts', 'git-hooks')) };
  }
  console.log(JSON.stringify(plan, null, 2));
}

if (esPrincipal(import.meta.url)) main(process.argv.slice(2));
