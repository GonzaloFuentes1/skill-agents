// Parser mínimo de frontmatter YAML: solo pares `clave: valor` de una línea.
export function parsearFrontmatter(texto) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(texto);
  if (!m) return { datos: {}, cuerpo: texto };
  const datos = {};
  for (const linea of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(linea);
    if (!kv) continue;
    let valor = kv[2].trim();
    if (/^(['"]).*\1$/.test(valor)) valor = valor.slice(1, -1);
    datos[kv[1]] = valor;
  }
  return { datos, cuerpo: m[2] };
}
