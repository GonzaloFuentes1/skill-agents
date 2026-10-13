#!/usr/bin/env node
// git pre-push: bloquea push directo a ramas protegidas. Instalado por /orquestador:setup.
import { RAMAS_PROTEGIDAS_DEFECTO } from './reglas-git.mjs';

let entrada = '';
process.stdin.setEncoding('utf8');
for await (const c of process.stdin) entrada += c;
for (const linea of entrada.split(/\r?\n/)) {
  const remoto = linea.trim().split(/\s+/)[2] ?? '';
  const rama = remoto.replace(/^refs\/heads\//, '');
  if (RAMAS_PROTEGIDAS_DEFECTO.includes(rama)) {
    console.error(`[orquestador] Push directo a '${rama}' bloqueado. Sube tu rama y abre un PR.`);
    process.exitCode = 1;
    break;
  }
}
