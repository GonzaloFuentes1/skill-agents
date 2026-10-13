// Formulario de Configuración: reductor puro (sin DOM). Lo usan configuracion.js y los tests.
export const CLASES_RUBRICA = ['Mecánica', 'Producción acotada', 'Síntesis y análisis', 'Juicio experto', 'Problema abierto', 'Máxima consecuencia'];
export const EJEMPLOS_RUBRICA = {
  'Mecánica': 'Buscar archivos, extraer datos, formatear, perfilar un CSV',
  'Producción acotada': 'Una función con su test, una sección, slides desde un esquema',
  'Síntesis y análisis': 'Revisión de literatura, debugging, análisis con conclusiones',
  'Juicio experto': 'Diseño experimental ML/RL, estrategia, arquitectura',
  'Problema abierto': 'Derivaciones, decisiones irreversibles, auditoría final',
  'Máxima consecuencia': 'Opus falló, ambigüedad extrema o error muy costoso',
};
export const MODELOS = ['haiku', 'sonnet', 'opus', 'fable'];
export const ESFUERZOS = ['low', 'medium', 'high', 'xhigh', 'max'];
export const LIMITES = { paraleloMax: [1, 8], fableMaxPorSesion: [0, 5], conversacionesMax: [1, 4] };
export const CLAVES_CONFIG = ['paraleloMax', 'fableMaxPorSesion', 'conversacionesMax', 'modelosOrquestador', 'modoPermisoDefecto', 'alBloquear',
  'mostrarCosto', 'alertasModelo', 'rubrica', 'precios', 'ramasProtegidas', 'puertoDashboard', 'remoto'];

const copia = (x) => JSON.parse(JSON.stringify(x ?? null));
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export const obtener = (obj, ruta) => ruta.reduce((o, k) => (o == null ? undefined : o[k]), obj);

export function fijar(obj, ruta, valor) {
  if (!ruta.length) return valor;
  const [k, ...resto] = ruta;
  const base = Array.isArray(obj) ? [...obj] : { ...(obj ?? {}) };
  base[k] = fijar(base[k], resto, valor);
  return base;
}

// Solo las claves pedidas: el formulario nunca reenvía claves que no edita (p. ej. rutaClaude).
export function formularioDesde(datos, claves = null) {
  const d = datos ?? {};
  const elegidos = claves ? Object.fromEntries(claves.filter((k) => k in d).map((k) => [k, d[k]])) : d;
  return { original: copia(elegidos), actual: copia(elegidos), errores: {} };
}

export const hayCambios = (f) => !!f && !igual(f.original, f.actual);

// Solo lo modificado: si otra pestaña guardó otras claves, este guardado no las pisa.
export function parcialAGuardar(f) {
  return Object.fromEntries(Object.keys(f.actual ?? {}).filter((k) => !igual(f.actual[k], f.original?.[k])).map((k) => [k, copia(f.actual[k])]));
}

const sinError = (errores, ruta) => { const e = { ...errores }; delete e[ruta[0]]; return e; };

export function reducirFormulario(f, a) {
  switch (a?.tipo) {
    case 'fijar':
      return { ...f, actual: fijar(f.actual, a.ruta, a.valor), errores: sinError(f.errores, a.ruta) };
    case 'sumar': {
      const [min, max] = LIMITES[a.ruta[0]] ?? [-Infinity, Infinity];
      const v = Math.min(max, Math.max(min, (Number(obtener(f.actual, a.ruta)) || 0) + a.delta));
      return reducirFormulario(f, { tipo: 'fijar', ruta: a.ruta, valor: v });
    }
    case 'alternar': {
      const lista = obtener(f.actual, a.ruta) ?? [];
      const tiene = lista.includes(a.valor);
      if (tiene && lista.length <= (a.minimo ?? 0)) return f;
      const nueva = tiene ? lista.filter((x) => x !== a.valor) : [...lista, a.valor];
      return reducirFormulario(f, { tipo: 'fijar', ruta: a.ruta, valor: a.orden ? a.orden.filter((x) => nueva.includes(x)) : nueva });
    }
    case 'agregar': {
      const v = String(a.valor ?? '').trim();
      const lista = obtener(f.actual, a.ruta) ?? [];
      if (!v || lista.includes(v)) return f;
      return reducirFormulario(f, { tipo: 'fijar', ruta: a.ruta, valor: [...lista, v] });
    }
    case 'quitar':
      return reducirFormulario(f, { tipo: 'fijar', ruta: a.ruta, valor: (obtener(f.actual, a.ruta) ?? []).filter((x) => x !== a.valor) });
    case 'descartar':
      return { ...f, actual: copia(f.original), errores: {} };
    case 'guardado':
      return formularioDesde(a.datos, Object.keys(f.original ?? {}));
    case 'errores':
      return { ...f, errores: { ...(a.errores ?? {}) } };
    default:
      return f;
  }
}

// Acción para una celda de precios. Un campo vacío nunca se guarda como 0: se ignora y la celda vuelve al valor guardado.
export function accionPrecio(f, modelo, campo, texto) {
  const ruta = ['precios', modelo, campo];
  const t = String(texto ?? '').trim();
  return { tipo: 'fijar', ruta, valor: t === '' ? obtener(f.original, ruta) : Number(t) };
}

export function autoModoDesde(e) {
  const p = e?.personalizadas ?? {};
  return {
    permitir: [...(p.permitir ?? [])],
    detener: [...(p.detener ?? [])],
    entorno: { repos: [...(p.entorno?.repos ?? [])], dominios: [...(p.entorno?.dominios ?? [])], organizacion: p.entorno?.organizacion ?? '' },
    classifyAllShell: !!e?.classifyAllShell,
    defaultModeTerminal: !!e?.defaultModeTerminal,
  };
}

// mostrarCosto (config.json) es la fuente de verdad; el botón Mostrar/Ocultar solo fija un atajo para esta sesión del navegador.
export const costoVisible = (mostrarCosto, atajoSesion) => (atajoSesion === 'mostrar' ? true : atajoSesion === 'ocultar' ? false : mostrarCosto !== false);
