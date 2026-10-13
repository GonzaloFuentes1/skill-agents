#!/usr/bin/env node
// Claude Code falso para los procesos auxiliares del dashboard (nunca gasta uso):
//   auto-mode defaults | config | critique | reset -y   y   -p … --json-schema <schema> (prompt por stdin).
// Variables: FALSO_CLI_REGISTRO (JSONL con argv, canal, CLAUDECODE y stdin de cada invocación),
//   FALSO_CLI_MODO (estructurado | solo-result | is-error | error | basura; solo para -p),
//   FALSO_CLI_DEMORA_MS (espera antes de responder) y FALSO_CLI_DEFAULTS (JSON que reemplaza las reglas de fábrica).
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const FABRICA = {
  environment: ['Source control: (sin configurar)', 'Trusted internal domains: (sin configurar)'],
  allow: ['Read-Only Operations: leer archivos y listar directorios', 'Local Operations: editar archivos dentro del repo', 'Declared Dependencies: instalar las dependencias declaradas'],
  soft_deny: ['Git Destructive: force-push o reescritura de historia', 'Production Deploy: desplegar a producción', 'Credential Leakage: leer o enviar credenciales', 'Out-of-Repo Deletion: borrar fuera del repo'],
  hard_deny: ['Data Exfiltration: enviar datos sensibles fuera del entorno de confianza'],
};
const args = process.argv.slice(2);
const sinBom = (t) => (t.charCodeAt(0) === 0xfeff ? t.slice(1) : t);
const rutaSettings = () => join(process.env.CLAUDE_CONFIG_DIR ?? '.', 'settings.json');
const leerSettings = () => (existsSync(rutaSettings()) ? JSON.parse(sinBom(readFileSync(rutaSettings(), 'utf8'))) : {});
const fabrica = () => (process.env.FALSO_CLI_DEFAULTS ? JSON.parse(readFileSync(process.env.FALSO_CLI_DEFAULTS, 'utf8')) : FABRICA);
const salida = (t) => process.stdout.write(`${t}\n`);

// Lo que imprimiría `claude auto-mode config`: las reglas propias con "$defaults" expandido.
function efectiva() {
  const am = leerSettings().autoMode ?? {};
  const f = fabrica();
  const expandir = (k) => (Array.isArray(am[k]) ? am[k].flatMap((x) => (x === '$defaults' ? f[k] : [x])) : f[k]);
  return { environment: expandir('environment'), allow: expandir('allow'), soft_deny: expandir('soft_deny'), hard_deny: expandir('hard_deny') };
}

function redactar(stdin) {
  const modo = process.env.FALSO_CLI_MODO || 'estructurado';
  if (modo === 'error') { process.stderr.write('Error: límite de uso alcanzado\n'); process.exitCode = 1; return; }
  if (modo === 'basura') { salida('esto no es json'); return; }
  if (modo === 'is-error') { salida(JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'No se pudo completar' })); return; }
  const nombre = /Nombre: (.+)/.exec(stdin)?.[1] ?? 'agente';
  const secciones = {
    rol: `Rol redactado para ${nombre}. Trabaja con método y sin relleno.`,
    metodo: '1. Lee el encargo.\n2. Hace el trabajo.\n3. Verifica el resultado.',
    entregable: 'Un informe breve con lo hecho.',
    restricciones: '- No inventa datos.',
    retorno: 'Máximo 300 palabras: resumen, hallazgos y pendientes.',
  };
  const r = { type: 'result', subtype: 'success', is_error: false, result: modo === 'solo-result' ? JSON.stringify(secciones) : 'listo' };
  if (modo === 'estructurado') r.structured_output = secciones;
  salida(JSON.stringify(r));
}

function responder(stdin) {
  if (process.env.FALSO_CLI_REGISTRO) {
    appendFileSync(process.env.FALSO_CLI_REGISTRO, `${JSON.stringify({ argv: args, canal: process.env.ORQUESTADOR_CANAL ?? null, claudecode: process.env.CLAUDECODE ?? null, stdin })}\n`);
  }
  const [a, b] = args;
  if (a === 'auto-mode' && b === 'defaults') return salida(JSON.stringify(fabrica(), null, 2));
  if (a === 'auto-mode' && b === 'config') return salida(JSON.stringify(efectiva(), null, 2));
  if (a === 'auto-mode' && b === 'critique') return salida('Revisión de tus reglas: están bien acotadas. Sugerencia: escribe la ruta completa en las reglas que nombran carpetas.');
  if (a === 'auto-mode' && b === 'reset' && (args.includes('-y') || args.includes('--yes'))) {
    const s = leerSettings();
    delete s.autoMode;
    if (existsSync(rutaSettings())) writeFileSync(rutaSettings(), `${JSON.stringify(s, null, 2)}\n`);
    return salida('Se restableció la configuración del modo automático.');
  }
  if (args.includes('-p') && args.includes('--json-schema')) return redactar(stdin);
  process.stderr.write(`claude-falso-cli: comando desconocido: ${args.join(' ')}\n`);
  process.exitCode = 2;
  return undefined;
}

let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { stdin += d; });
process.stdin.on('end', () => setTimeout(() => responder(stdin), Number(process.env.FALSO_CLI_DEMORA_MS) || 0));
