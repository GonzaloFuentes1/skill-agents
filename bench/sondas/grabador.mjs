#!/usr/bin/env node
// Hook de sondeo: agrega el input crudo del evento a $SONDA_SALIDA (JSONL). Nunca bloquea.
import { appendFileSync } from 'node:fs';

let datos = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { datos += c; });
process.stdin.on('end', () => {
  let entrada;
  try { entrada = JSON.parse(datos); } catch { entrada = { crudo: datos }; }
  if (process.env.SONDA_SALIDA) {
    appendFileSync(process.env.SONDA_SALIDA, JSON.stringify({ argv: process.argv.slice(2), entrada }) + '\n');
  }
  process.exit(0);
});
