#!/usr/bin/env node
// PreToolUse(Agent|Task): registra la delegación y aplica los topes de Fable y paralelismo.
import { fileURLToPath } from 'node:url';
import { cargarConfig } from './lib/config.mjs';
import { conEstado, limpiarVencidas } from './lib/estado.mjs';
import { emitir } from './lib/eventos.mjs';
import { familia } from './lib/modelos.mjs';
import { leer } from './lib/campos.mjs';
import { buscarDefinicion } from './lib/agentes.mjs';
import { ejecutarHook, denegar, esPrincipal } from './lib/hook-io.mjs';

const RAIZ_PLUGIN = fileURLToPath(new URL('..', import.meta.url));

export function decidirDelegacion(entrada, estado, config, definicion) {
  const agente = leer.tipoSubagente(entrada);
  const id = entrada.tool_use_id ?? `sin-id-${Date.now()}`;
  const base = { session: entrada.session_id, id, agente };
  const pedido = leer.modeloPedido(entrada);
  const delFrontmatter = definicion?.model && definicion.model !== 'inherit' ? definicion.model : null;
  const modelo = pedido ?? delFrontmatter ?? estado.modeloPrincipal ?? 'heredado';
  const origenModelo = pedido ? 'explicito' : delFrontmatter ? 'frontmatter' : 'heredado';
  const esfuerzo = leer.esfuerzoPedido(entrada) ?? definicion?.effort ?? 'heredado';

  if (familia(modelo) === 'fable' && estado.fableUsados >= config.fableMaxPorSesion) {
    const motivo = `[orquestador] Tope de Fable alcanzado (${estado.fableUsados}/${config.fableMaxPorSesion} en esta sesión). `
      + 'Usa opus con effort xhigh, o pide al usuario subir fableMaxPorSesion en ~/.claude/orquestador/config.json.';
    return { denegar: motivo, evento: { ...base, tipo: 'bloqueo', regla: 'tope-fable', motivo } };
  }
  const activas = Object.keys(estado.activas).length;
  if (activas >= config.paraleloMax) {
    const motivo = `[orquestador] Ya hay ${activas} subagentes en paralelo (máximo ${config.paraleloMax}). Espera a que terminen.`;
    return { denegar: motivo, evento: { ...base, tipo: 'bloqueo', regla: 'paralelo', motivo } };
  }
  const meta = leer.meta(entrada);
  estado.activas[id] = { agente, meta, modelo, esfuerzo, inicio: Date.now(), agentId: null };
  if (familia(modelo) === 'fable') estado.fableUsados += 1;
  return {
    evento: { ...base, tipo: 'delegacion', meta, modelo, esfuerzo, origenModelo,
      persona: definicion?.persona ?? null, color: definicion?.color ?? null },
  };
}

export async function manejar(entrada, env = process.env) {
  const config = cargarConfig(env);
  const definicion = buscarDefinicion(leer.tipoSubagente(entrada), { raizPlugin: RAIZ_PLUGIN, cwd: entrada.cwd });
  const r = await conEstado(entrada.session_id, (estado) => {
    limpiarVencidas(estado);
    return decidirDelegacion(entrada, estado, config, definicion);
  }, env);
  emitir(r.evento, env);
  return r.denegar ? denegar('PreToolUse', r.denegar) : null;
}

if (esPrincipal(import.meta.url)) ejecutarHook((e) => manejar(e));
