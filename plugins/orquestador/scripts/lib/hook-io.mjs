import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function leerEntrada(stream = process.stdin) {
  let datos = '';
  stream.setEncoding?.('utf8');
  for await (const c of stream) datos += c;
  try { return JSON.parse(datos || '{}'); } catch { return {}; }
}

// Ejecuta un manejador de hook. Un error propio nunca bloquea: sale con 0 y avisa.
// Se usa exitCode en vez de process.exit(): en pipes de Windows stdout es asíncrono y exit() truncaría la respuesta.
export async function ejecutarHook(manejador, { stdin = process.stdin, stdout = process.stdout, salir = (c) => { process.exitCode = c; } } = {}) {
  let resultado;
  try {
    resultado = await manejador(await leerEntrada(stdin));
  } catch (e) {
    try { stdout.write(JSON.stringify({ systemMessage: `orquestador: un hook falló (${e.message}); se deja pasar.` })); } catch {}
    return salir(0);
  }
  if (resultado) stdout.write(JSON.stringify(resultado));
  return salir(0);
}

export const denegar = (evento, motivo) => ({
  hookSpecificOutput: { hookEventName: evento, permissionDecision: 'deny', permissionDecisionReason: motivo },
});

export const contexto = (evento, texto) => ({
  hookSpecificOutput: { hookEventName: evento, additionalContext: texto },
});

// Compara rutas reales: si el plugin se invoca a través de un symlink o junction, argv[1] conserva el enlace
// mientras import.meta.url ya viene resuelto, y una comparación literal apagaría el hook en silencio.
const real = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };

export function esPrincipal(urlModulo, argv1 = process.argv[1]) {
  if (!argv1) return false;
  const a = real(fileURLToPath(urlModulo));
  const b = real(argv1);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}
