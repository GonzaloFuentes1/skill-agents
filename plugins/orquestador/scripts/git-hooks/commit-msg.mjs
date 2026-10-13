#!/usr/bin/env node
// git commit-msg: Conventional Commits y sin atribución de IA. Instalado por /orquestador:setup.
import { readFileSync } from 'node:fs';
import { esConventional, contieneAtribucion } from './reglas-git.mjs';

const mensaje = readFileSync(process.argv[2], 'utf8').split(/\r?\n/).filter((l) => !l.startsWith('#')).join('\n');
const primera = mensaje.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
if (contieneAtribucion(mensaje)) {
  console.error('[orquestador] El mensaje contiene coautoría o atribución de IA. Quítala.');
  process.exitCode = 1;
} else if (!esConventional(primera)) {
  console.error(`[orquestador] "${primera}" no sigue Conventional Commits (tipo(ámbito): descripción).`);
  process.exitCode = 1;
}
