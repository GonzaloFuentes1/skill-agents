// Acceso a los campos de entrada de los hooks. Fuente: docs/specs/hallazgos-hooks.md.
// Si una versión de Claude Code renombra un campo, se corrige solo aquí.
export const leer = {
  modeloPedido: (e) => e?.tool_input?.model ?? null,
  esfuerzoPedido: (e) => e?.tool_input?.effort ?? null,
  tipoSubagente: (e) => e?.tool_input?.subagent_type || 'general-purpose',
  meta: (e) => e?.tool_input?.description ?? '',
  enSegundoPlano: (e) => e?.tool_input?.run_in_background,
  transcriptSubagente: (e) => e?.agent_transcript_path ?? null,
};
