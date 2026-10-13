import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarPlan, segmentar, estadoEtapas, agruparAgentes, barreraHumana } from '../plugins/orquestador/dashboard/public/plan-vista.js';

const inv = { tipo: 'investigador', modelo: 'sonnet', esfuerzo: 'high' };
const PLAN = {
  titulo: 'Ronda 2 de investigación',
  etapas: [
    { id: 'E1', titulo: 'Investigar vacíos', meta: '4 frentes', agentes: [inv, inv, inv, inv], barrera: { tipo: 'auto', criterio: 'URL oficial' } },
    { id: 'E2', titulo: 'Consolidar', meta: 'Escribir 09-ronda2.md', agentes: [], barrera: { tipo: 'humana', criterio: 'Revisas el top 10' } },
    { id: 'E3', titulo: 'Redactar', meta: 'Borradores' },
  ],
};

test('plan: una etapa sin agentes (o sin el campo) es válida y la hace el orquestador', () => {
  const r = validarPlan(structuredClone(PLAN));
  assert.equal(r.ok, true);
  assert.deepEqual(r.plan.etapas[1].agentes, []);
  assert.deepEqual(r.plan.etapas[2].agentes, []);
  assert.equal(validarPlan({ ...PLAN, etapas: [{ ...PLAN.etapas[0], agentes: 'x' }] }).ok, false);
});

test('plan: agentes iguales se agrupan con su cantidad, en orden de aparición', () => {
  const ver = { tipo: 'verificador', modelo: 'haiku', esfuerzo: 'low' };
  assert.deepEqual(agruparAgentes([inv, ver, inv, { ...inv, esfuerzo: 'medium' }, inv]), [
    { ...inv, cantidad: 3 }, { ...ver, cantidad: 1 }, { ...inv, esfuerzo: 'medium', cantidad: 1 },
  ]);
  assert.deepEqual(agruparAgentes([]), []);
});

test('plan: la etapa del orquestador queda lista cuando termina la anterior o empieza una posterior', () => {
  const p = validarPlan(structuredClone(PLAN)).plan;
  assert.deepEqual(estadoEtapas(p, []), { E1: 'en-cola', E2: 'en-cola', E3: 'en-cola' });
  assert.equal(estadoEtapas(p, [{ meta: 'E1 · a', estado: 'activo' }]).E2, 'en-cola');
  assert.equal(estadoEtapas(p, [{ meta: 'E1 · a', estado: 'terminado' }]).E2, 'lista');
  assert.equal(estadoEtapas(p, [{ meta: 'E1 · a', estado: 'terminado' }, { meta: 'E3 · b', estado: 'activo' }]).E2, 'lista');
});

test('plan inválido: conserva el JSON aparte para mostrarlo plegado', () => {
  const [s] = segmentar('```orquestador-plan\n{"titulo":"x","etapas":[]}\n```');
  assert.equal(s.tipo, 'texto');
  assert.match(s.aviso, /entre 1 y 12 etapas/);
  assert.equal(s.json, '{"titulo":"x","etapas":[]}');
});

test('barrera humana en una etapa del orquestador aparece al terminar la etapa anterior', () => {
  const bloque = (p) => '```orquestador-plan\n' + JSON.stringify(p) + '\n```';
  const plan = bloque(PLAN);
  const chat = { estado: 'lista', mensajes: [
    { rol: 'asistente', bloques: [{ tipo: 'texto', texto: plan }] },
    { rol: 'usuario', bloques: [{ tipo: 'texto', texto: 'Apruebo el plan.' }] },
    { rol: 'asistente', bloques: [{ tipo: 'texto', texto: 'Consolidé el top 10. ¿Preparamos Amazon?' }] },
  ] };
  assert.equal(barreraHumana(chat, [{ meta: 'E1 · a', estado: 'terminado' }])?.etapa, 'E2');
  assert.equal(barreraHumana(chat, [{ meta: 'E1 · a', estado: 'activo' }]), null);
  const primera = { ...PLAN, etapas: [{ ...PLAN.etapas[1], id: 'E1' }, { ...PLAN.etapas[2], id: 'E2' }] };
  const chat2 = structuredClone(chat);
  chat2.mensajes[0].bloques[0].texto = bloque(primera);
  assert.equal(barreraHumana(chat2, [])?.etapa, 'E1');
});
