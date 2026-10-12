// Resume lo que capturaron los hooks de sondeo, para confirmar los supuestos del spec.
export function modelosEnTranscript(texto) {
  const modelos = new Set();
  for (const linea of String(texto).split('\n')) {
    if (!linea.trim()) continue;
    let e;
    try { e = JSON.parse(linea); } catch { continue; }
    const m = e?.message?.model;
    if (e?.type === 'assistant' && m && m !== '<synthetic>') modelos.add(m);
  }
  return [...modelos];
}

export function resumirCaptura(lineas, leerArchivo) {
  const campos = {};
  const eventosVistos = {};
  let herramienta = null;
  let toolInput = {};
  let toolResponse = {};
  const camposTranscript = new Set();
  const modelosReales = {};
  for (const { argv, entrada } of lineas) {
    const evento = argv[0];
    eventosVistos[evento] = (eventosVistos[evento] ?? 0) + 1;
    campos[evento] = [...new Set([...(campos[evento] ?? []), ...Object.keys(entrada ?? {})])];
    if (evento === 'PreToolUse') { herramienta = entrada.tool_name; toolInput = entrada.tool_input ?? {}; }
    if (evento === 'PostToolUse') toolResponse = entrada.tool_response ?? {};
    if (evento === 'SubagentStop') {
      for (const k of Object.keys(entrada)) {
        if (!/transcript/i.test(k) || k === 'transcript_path') continue;
        camposTranscript.add(k);
        try { modelosReales[entrada.agent_id] = modelosEnTranscript(leerArchivo(entrada[k])); } catch { modelosReales[entrada.agent_id] = []; }
      }
    }
  }
  return {
    herramienta,
    camposToolInput: Object.keys(toolInput),
    modelEnToolInput: 'model' in toolInput,
    effortEnToolInput: 'effort' in toolInput,
    campos,
    camposToolResponse: typeof toolResponse === 'object' && toolResponse ? Object.keys(toolResponse) : [],
    camposTranscriptSubagente: [...camposTranscript],
    modelosReales,
    eventosVistos,
  };
}
