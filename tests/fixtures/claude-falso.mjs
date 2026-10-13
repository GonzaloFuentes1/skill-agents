#!/usr/bin/env node
// Claude Code falso para tests: reproduce un guion JSONL y registra lo que recibe por stdin.
// Guion (FALSO_GUION): [{ esperar: 'user'|'control_response'|'control_request' }, { emitir: {...} }, { emitirSinSalto: {...} }, { crudo: '...' }, { salir: 1, stderr: '...' }]
import { readFileSync, appendFileSync, existsSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';

const guion = JSON.parse(readFileSync(process.env.FALSO_GUION, 'utf8'));
const anotar = (x) => { if (process.env.FALSO_REGISTRO) appendFileSync(process.env.FALSO_REGISTRO, JSON.stringify(x) + '\n'); };
const argv = process.argv.slice(2);
anotar({ argv, canal: process.env.ORQUESTADOR_CANAL ?? null, claudecode: process.env.CLAUDECODE ?? null, cwd: process.cwd() });

// --add-dir <carpeta>: se acepta (una o varias veces) y, como el real, exige que la carpeta exista.
const sinCarpeta = argv.flatMap((a, i) => (a === '--add-dir' ? [argv[i + 1]] : [])).find((d) => !d || !existsSync(d) || !statSync(d).isDirectory());
if (sinCarpeta !== undefined) {
  process.stderr.write(`Error: --add-dir ${sinCarpeta ?? ''} no es una carpeta existente\n`);
  process.exitCode = 1;
}

const entradas = [];
let despertar = null;
const rl = createInterface({ input: process.stdin });
rl.on('line', (l) => {
  let m;
  try { m = JSON.parse(l); } catch { return; }
  anotar({ stdin: m });
  entradas.push(m);
  despertar?.();
});
rl.on('close', () => { entradas.push({ type: '__fin' }); despertar?.(); });

// Devuelve null cuando se cierra stdin. No se usa process.exit(): en pipes de Windows truncaría stdout/stderr.
async function esperar(tipo) {
  for (;;) {
    const i = entradas.findIndex((m) => m.type === tipo || m.type === '__fin');
    if (i >= 0) {
      const [m] = entradas.splice(i, 1);
      return m.type === '__fin' ? null : m;
    }
    await new Promise((ok) => { despertar = ok; });
  }
}

// Sin await de nivel superior: una promesa pendiente al vaciarse el loop haría salir con código 13.
async function correr() {
  for (const paso of guion) {
    if (paso.esperar && (await esperar(paso.esperar)) === null) return;
    if (paso.emitir) process.stdout.write(JSON.stringify(paso.emitir) + '\n');
    if (paso.crudo) process.stdout.write(paso.crudo + '\n');
    if (paso.emitirSinSalto) process.stdout.write(JSON.stringify(paso.emitirSinSalto)); // última línea sin "\n"
    if (paso.salir !== undefined) {
      if (paso.stderr) process.stderr.write(paso.stderr);
      process.exitCode = paso.salir;
      rl.close();
      process.stdin.destroy();
      return;
    }
  }
  await esperar('__nunca'); // vive hasta que se cierre stdin; entonces el proceso termina solo con código 0
}
if (sinCarpeta === undefined) correr();
else { rl.close(); process.stdin.destroy(); }
