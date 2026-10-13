#!/usr/bin/env node
// Status line principal: orquestador, subagentes activos, uso de Fable y costo de la sesión.
import { cargarConfig } from './lib/config.mjs';
import { leerEstado, conEstado } from './lib/estado.mjs';
import { familia } from './lib/modelos.mjs';
import { nombreBase } from './lib/agentes.mjs';
import { leerEntrada, esPrincipal } from './lib/hook-io.mjs';

const modeloDe = (entrada) => familia(entrada?.model?.id ?? entrada?.model?.display_name);

export function renderLinea(entrada, estado, config) {
  const modelo = modeloDe(entrada);
  const esfuerzo = typeof entrada.effort === 'string' ? entrada.effort : entrada.effort?.level;
  const partes = [`🎛 ${modelo}${esfuerzo ? `·${esfuerzo}` : ''}`];
  if (!config.modelosOrquestador.includes(modelo)) partes.push(`⚠ orquestador en ${modelo}`);
  const activas = Object.values(estado.activas ?? {});
  if (activas.length) partes.push(activas.map((a) => `▶ ${nombreBase(a.agente)} (${familia(a.modelo)}·${a.esfuerzo})`).join(' '));
  partes.push(`fable ${estado.fableUsados}/${config.fableMaxPorSesion}`);
  const costo = entrada.cost?.total_cost_usd;
  if (typeof costo === 'number' && config.mostrarCosto !== false) partes.push(`$${costo.toFixed(2)}`);
  return partes.join(' │ ');
}

export async function main({ stdin = process.stdin, stdout = process.stdout, env = process.env } = {}) {
  let entrada = {};
  try {
    entrada = await leerEntrada(stdin);
    const config = cargarConfig(env);
    let estado = leerEstado(entrada.session_id, env);
    const modelo = modeloDe(entrada);
    if (entrada.session_id && estado.modeloPrincipal !== modelo) {
      await conEstado(entrada.session_id, (e) => { e.modeloPrincipal = modelo; estado = e; }, env);
    }
    stdout.write(renderLinea(entrada, estado, config));
  } catch {
    stdout.write(`🎛 ${modeloDe(entrada)}`);
  }
}

if (esPrincipal(import.meta.url)) main();
