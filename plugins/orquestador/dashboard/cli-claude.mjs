// Procesos `claude` auxiliares del dashboard (auto-mode y "Redactar con Claude"): cortos, sin canal y con tiempo máximo.
import { spawn as spawnNodo } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { tmpdir } from 'node:os';
import { cargarConfig } from '../scripts/lib/config.mjs';
import { resolverBinario, invocacion } from './proceso-claude.mjs';
import { ErrorConversacion } from './conversaciones.mjs';

// El hijo no debe creerse anidado (CLAUDECODE) ni recibir las instrucciones del canal dashboard.
export function entornoAuxiliar(env = process.env) {
  const e = { ...env, ORQUESTADOR_CANAL: '' };
  delete e.CLAUDECODE;
  return e;
}

// Un .cmd corre a través de cmd.exe, que no cita nada: sin esto, `--tools ""` desaparece y un JSON con comillas se rompe.
// Reglas de citado de MSVCRT: las comillas internas se escapan con \ y las barras que preceden a una comilla se duplican.
export function citarParaShell(arg) {
  const s = String(arg);
  if (s && !/[\s"^&|<>()%!]/.test(s)) return s;
  return `"${s.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`;
}

export function ejecutarClaude(args, { env = process.env, entrada = null, timeoutMs = 30_000, spawnFn = spawnNodo, binario, cwd = tmpdir() } = {}) {
  const bin = binario ?? resolverBinario(cargarConfig(env), env);
  if (!bin) return Promise.reject(new ErrorConversacion(503, 'No encontré el binario de Claude Code; define rutaClaude en config.json'));
  const { comando, args: argv, shell } = invocacion(bin, args);
  return new Promise((ok, mal) => {
    let hijo;
    try {
      hijo = spawnFn(comando, shell ? argv.map(citarParaShell) : argv, { cwd, env: entornoAuxiliar(env), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell });
    } catch (e) {
      mal(new ErrorConversacion(502, `No se pudo ejecutar Claude Code: ${e.message}`));
      return;
    }
    const dOut = new StringDecoder('utf8');
    const dErr = new StringDecoder('utf8');
    let stdout = '';
    let stderr = '';
    let listo = false;
    const terminar = (fn) => { if (listo) return; listo = true; clearTimeout(reloj); fn(); };
    const reloj = setTimeout(() => terminar(() => {
      try { hijo.kill(); } catch { /* ya terminó */ }
      mal(new ErrorConversacion(504, `Claude Code no respondió en ${Math.ceil(timeoutMs / 1000)} s`));
    }), timeoutMs);
    hijo.stdout?.on('data', (d) => { stdout += dOut.write(d); });
    hijo.stderr?.on('data', (d) => { stderr = (stderr + dErr.write(d)).slice(-4000); });
    hijo.stdin?.on('error', () => {});
    hijo.on('error', (e) => terminar(() => mal(new ErrorConversacion(502, `No se pudo ejecutar Claude Code: ${e.message}`))));
    hijo.on('close', (codigo) => terminar(() => ok({ codigo, stdout: stdout + dOut.end(), stderr: (stderr + dErr.end()).trim() })));
    hijo.stdin?.end(entrada ?? undefined);
  });
}
