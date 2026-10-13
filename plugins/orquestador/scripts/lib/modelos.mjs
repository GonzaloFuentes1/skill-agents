const FAMILIAS = ['haiku', 'sonnet', 'opus', 'fable'];
export const ESFUERZOS = ['low', 'medium', 'high', 'xhigh', 'max'];

export function familia(modelo) {
  if (!modelo) return 'desconocido';
  const m = String(modelo).toLowerCase();
  if (m === 'inherit' || m === 'heredado') return 'heredado';
  return FAMILIAS.find((f) => m.includes(f)) ?? 'desconocido';
}

export function costoUSD(uso, modelo, precios) {
  const p = precios?.[familia(modelo)];
  if (!p || !uso) return 0;
  return ((uso.input_tokens ?? 0) * p.entrada
    + (uso.output_tokens ?? 0) * p.salida
    + (uso.cache_read_input_tokens ?? 0) * p.cacheLectura
    + (uso.cache_creation_input_tokens ?? 0) * p.cacheEscritura) / 1e6;
}
