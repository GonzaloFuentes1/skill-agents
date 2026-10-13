import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumirCaptura, modelosEnTranscript } from '../bench/sondas/resumen.mjs';

const transcript = [
  { type: 'assistant', message: { id: 'm1', model: 'claude-haiku-5-5', usage: { input_tokens: 10 } } },
  { type: 'assistant', message: { id: 'm1', model: 'claude-haiku-5-5', usage: { input_tokens: 10 } } },
  { type: 'assistant', message: { id: 'm2', model: '<synthetic>' } },
  { type: 'user', message: { role: 'user' } },
].map((x) => JSON.stringify(x)).join('\n');

const lineas = [
  { argv: ['SessionStart'], entrada: { session_id: 's', source: 'startup', cwd: '/t' } },
  { argv: ['PreToolUse'], entrada: { session_id: 's', tool_name: 'Agent', tool_use_id: 'tu1',
    tool_input: { subagent_type: 'sonda-eco', description: 'eco', prompt: 'x', model: 'haiku', effort: 'low' } } },
  { argv: ['SubagentStart'], entrada: { session_id: 's', agent_id: 'a1', agent_type: 'sonda-eco' } },
  { argv: ['SubagentStop'], entrada: { session_id: 's', agent_id: 'a1', agent_type: 'sonda-eco', agent_transcript_path: '/t/a1.jsonl' } },
  { argv: ['PostToolUse'], entrada: { session_id: 's', tool_name: 'Agent', tool_use_id: 'tu1', tool_input: {}, tool_response: { status: 'completed' } } },
];

test('modelosEnTranscript ignora duplicados y <synthetic>', () => {
  assert.deepEqual(modelosEnTranscript(transcript), ['claude-haiku-5-5']);
});

test('resumirCaptura reporta herramienta, campos y modelo real', () => {
  const r = resumirCaptura(lineas, () => transcript);
  assert.equal(r.herramienta, 'Agent');
  assert.equal(r.modelEnToolInput, true);
  assert.equal(r.effortEnToolInput, true);
  assert.deepEqual(r.camposTranscriptSubagente, ['agent_transcript_path']);
  assert.deepEqual(r.modelosReales, { a1: ['claude-haiku-5-5'] });
  assert.deepEqual(r.eventosVistos, { SessionStart: 1, PreToolUse: 1, SubagentStart: 1, SubagentStop: 1, PostToolUse: 1 });
  assert.ok(r.campos.SubagentStop.includes('agent_id'));
  assert.deepEqual(r.camposToolResponse, ['status']);
});
