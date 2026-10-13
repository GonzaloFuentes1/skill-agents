#!/usr/bin/env node
// /orquestador:estado. Tabla de delegaciones de la sesión (por defecto, la más reciente del directorio actual).
// Uso: node reporte-estado.mjs [session_id]
import { leerEventos } from './lib/eventos.mjs';
import { nombreBase } from './lib/agentes.mjs';
import { esPrincipal } from './lib/hook-io.mjs';

const celda = (t) => String(t ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function sesionReciente(eventos, cwd) {
  const delCwd = eventos.filter((e) => e.tipo === 'sesion' && e.cwd === cwd).at(-1);
  return delCwd?.session ?? eventos.at(-1)?.session ?? null;
}

export function generarTabla(eventos) {
  const filas = new Map();
  const bloqueos = [];
  for (const e of eventos) {
    if (e.tipo === 'delegacion') filas.set(e.id, { ...e, real: '—', tokens: '—', costo: '—', alerta: '' });
    if (e.tipo === 'bloqueo') bloqueos.push(e);
    const f = filas.get(e.id);
    if (!f) continue;
    if (e.tipo === 'fin') Object.assign(f, { real: e.modeloReal ?? '?', tokens: `${e.tokensIn ?? 0}/${e.tokensOut ?? 0}`, costo: `$${(e.costoUSD ?? 0).toFixed(3)}` });
    if (e.tipo === 'alerta') f.alerta = `⚠ ${e.mensaje}`;
  }
  if (!filas.size && !bloqueos.length) return 'Sin delegaciones registradas en esta sesión.';
  const lineas = [
    '| Agente | Meta | Modelo pedido | Esfuerzo | Modelo real | Tokens in/out | Costo | Alerta |',
    '|---|---|---|---|---|---|---|---|',
    ...[...filas.values()].map((f) => `| ${celda(nombreBase(f.agente))} | ${celda(f.meta)} | ${celda(f.modelo)} | ${celda(f.esfuerzo)} | ${celda(f.real)} | ${f.tokens} | ${f.costo} | ${celda(f.alerta)} |`),
    '',
    `Bloqueos: ${bloqueos.length}`,
    ...bloqueos.map((b) => `- ${b.regla}: ${b.motivo}`),
  ];
  return lineas.join('\n');
}

if (esPrincipal(import.meta.url)) {
  const todos = leerEventos();
  const session = process.argv[2] ?? sesionReciente(todos, process.cwd());
  console.log(`Sesión: ${session ?? 'ninguna'}\n`);
  console.log(generarTabla(todos.filter((e) => e.session === session)));
}
