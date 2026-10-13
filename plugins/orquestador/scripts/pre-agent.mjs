#!/usr/bin/env node
// PreToolUse(Agent|Task): registra la delegación y aplica los topes de Fable y paralelismo.
import { fileURLToPath } from 'node:url';
import { cargarConfig } from './lib/config.mjs';
import { conEstado, limpiarVencidas } from './lib/estado.mjs';
import { emitir } from './lib/eventos.mjs';
import { familia } from './lib/modelos.mjs';
import { leer } from './lib/campos.mjs';
import { buscarDefinicion, AGENTES_INTEGRADOS } from './lib/agentes.mjs';
import { hashPrompt, ultimoModelo } from './lib/transcript.mjs';
import { ejecutarHook, denegar, esPrincipal } from './lib/hook-io.mjs';

const RAIZ_PLUGIN = fileURLToPath(new URL('..', import.meta.url));

// Orden: explícito → frontmatter → modelo fijo de un agente integrado → heredado (si el agente hereda) → desconocido.
function resolverModelo(entrada, estado, definicion) {
  const pedido = leer.modeloPedido(entrada);
  if (pedido) return { modelo: pedido, origenModelo: 'explicito' };
  if (definicion?.model && definicion.model !== 'inherit') return { modelo: definicion.model, origenModelo: 'frontmatter' };
  const integrado = AGENTES_INTEGRADOS[leer.tipoSubagente(entrada)];
  if (integrado && integrado !== 'inherit') return { modelo: integrado, origenModelo: 'integrado' };
  if (definicion || integrado === 'inherit') return { modelo: estado.modeloPrincipal ?? 'heredado', origenModelo: 'heredado' };
  return { modelo: 'desconocido', origenModelo: 'desconocido' };
}

export function decidirDelegacion(entrada, estado, config, definicion) {
  const agente = leer.tipoSubagente(entrada);
  const id = entrada.tool_use_id ?? `sin-id-${Date.now()}`;
  const base = { session: entrada.session_id, id, agente };
  const { modelo, origenModelo } = resolverModelo(entrada, estado, definicion);
  const esfuerzo = leer.esfuerzoPedido(entrada) ?? definicion?.effort ?? 'heredado';
  const esFable = familia(modelo) === 'fable';

  if (esFable && estado.fableUsados >= config.fableMaxPorSesion) {
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
  estado.activas[id] = { agente, meta, modelo, esfuerzo, inicio: Date.now(), agentId: null,
    promptHash: hashPrompt(entrada.tool_input?.prompt), contadaFable: esFable };
  if (esFable) estado.fableUsados += 1;
  return {
    evento: { ...base, tipo: 'delegacion', meta, modelo, esfuerzo, origenModelo,
      persona: definicion?.persona ?? null, color: definicion?.color ?? null },
  };
}

export async function manejar(entrada, env = process.env) {
  const config = cargarConfig(env);
  const definicion = buscarDefinicion(leer.tipoSubagente(entrada), { raizPlugin: RAIZ_PLUGIN, cwd: entrada.cwd });
  const principal = ultimoModelo(entrada.transcript_path);
  let r;
  try {
    r = await conEstado(entrada.session_id, (estado) => {
      if (principal) estado.modeloPrincipal = familia(principal);
      limpiarVencidas(estado);
      return decidirDelegacion(entrada, estado, config, definicion);
    }, env);
  } catch (e) {
    // Sin estado confiable el tope de Fable no se puede garantizar: se niega Fable y se deja pasar lo demás.
    const posible = leer.modeloPedido(entrada) ?? definicion?.model ?? principal;
    if (familia(posible) === 'fable') return denegar('PreToolUse', `[orquestador] No se pudo verificar el tope de Fable (${e.message}). Reintenta en unos segundos.`);
    throw e;
  }
  emitir(r.evento, env);
  return r.denegar ? denegar('PreToolUse', r.denegar) : null;
}

if (esPrincipal(import.meta.url)) ejecutarHook((e) => manejar(e));
