// Markdown del chat: un parser puro (texto → árbol, testeable sin DOM) y un render que solo crea nodos DOM.
// Nunca se inserta HTML en cadenas: el HTML que escriba el modelo se muestra como texto.

const SEGURO = /^(https?:|mailto:)/i;
const ENLACE = /^\[((?:[^[\]]|\[[^\]]*\])+)\]\(([^()\s]*(?:\([^()\s]*\)[^()\s]*)*)\)/;
const URL_SUELTA = /^https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"]/;
const ESCAPABLE = /[\\`*_~[\]()#>|!-]/;
const palabra = (c) => /[\p{L}\p{N}_]/u.test(c ?? '');
const espacio = (c) => c === undefined || /\s/.test(c);

// Cierre de un delimitador (**, __, ~~, *, _): no precedido por espacio y, para _, no seguido de una letra.
function cierre(s, marca, desde) {
  for (let j = s.indexOf(marca, desde); j > -1; j = s.indexOf(marca, j + 1)) {
    if (j === desde || espacio(s[j - 1])) continue;
    if (marca[0] === '_' && palabra(s[j + marca.length])) continue;
    if (marca === '*' && s[j + 1] === '*') { j++; continue; }
    return j;
  }
  return -1;
}

export function parsearInline(texto) {
  const s = String(texto ?? '');
  const out = [];
  let buf = '';
  const texto_ = () => { if (buf) { out.push({ t: 'txt', v: buf }); buf = ''; } };
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\' && ESCAPABLE.test(s[i + 1] ?? '')) { buf += s[i + 1]; i += 2; continue; }
    if (c === '`') {
      let n = 1;
      while (s[i + n] === '`') n++;
      const marca = '`'.repeat(n);
      const fin = s.indexOf(marca, i + n);
      if (fin > -1) {
        texto_();
        const v = s.slice(i + n, fin);
        out.push({ t: 'code', v: /^ .* $/.test(v) ? v.slice(1, -1) : v });
        i = fin + n;
      } else { buf += marca; i += n; }
      continue;
    }
    const doble = ['**', '__', '~~'].find((m) => s.startsWith(m, i));
    if (doble) {
      const fin = doble === '__' && palabra(s[i - 1]) ? -1 : espacio(s[i + 2]) ? -1 : cierre(s, doble, i + 2);
      if (fin > -1) {
        texto_();
        out.push({ t: doble === '~~' ? 's' : 'b', hijos: parsearInline(s.slice(i + 2, fin)) });
        i = fin + 2;
      } else { buf += doble; i += 2; }
      continue;
    }
    if (c === '*' || c === '_') {
      const fin = (c === '_' && palabra(s[i - 1])) || espacio(s[i + 1]) ? -1 : cierre(s, c, i + 1);
      if (fin > -1) {
        texto_();
        out.push({ t: 'i', hijos: parsearInline(s.slice(i + 1, fin)) });
        i = fin + 1;
      } else { buf += c; i += 1; }
      continue;
    }
    if (c === '[') {
      const m = s.slice(i).match(ENLACE);
      if (m) {
        if (SEGURO.test(m[2])) { texto_(); out.push({ t: 'a', href: m[2], hijos: parsearInline(m[1]) }); } else buf += m[0];
        i += m[0].length;
        continue;
      }
    }
    if (c === 'h' && !palabra(s[i - 1])) {
      const m = s.slice(i).match(URL_SUELTA);
      if (m) { texto_(); out.push({ t: 'a', href: m[0], hijos: [{ t: 'txt', v: m[0] }] }); i += m[0].length; continue; }
    }
    buf += c;
    i += 1;
  }
  texto_();
  return out;
}

const RE = {
  cerco: /^\s{0,3}(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/,
  titulo: /^\s{0,3}(#{1,6})\s+(.*)$/,
  linea: /^\s{0,3}([-*_])(\s*\1){2,}\s*$/,
  cita: /^\s{0,3}>\s?/,
  item: /^(\s*)([-*+]|(\d{1,9})[.)])\s+(.*)$/,
  separador: /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/,
};
const vacia = (l) => !l.trim();
const sangria = (l) => l.match(/^\s*/)[0].length;
const esTabla = (lineas, i) => lineas[i].includes('|') && i + 1 < lineas.length && RE.separador.test(lineas[i + 1]) && lineas[i + 1].includes('-')
  && (lineas[i + 1].includes('|') || lineas[i].trim().startsWith('|'));
const iniciaBloque = (lineas, i) => {
  const l = lineas[i];
  return RE.cerco.test(l) || RE.titulo.test(l) || RE.linea.test(l) || RE.cita.test(l) || RE.item.test(l) || esTabla(lineas, i);
};
const lineasAInline = (ls) => ls.flatMap((l, k) => [...(k ? [{ t: 'br' }] : []), ...parsearInline(l.trim())]);

function celdas(linea) {
  let l = linea.trim();
  if (l.startsWith('|')) l = l.slice(1);
  if (l.endsWith('|') && !l.endsWith('\\|')) l = l.slice(0, -1);
  return l.split(/(?<!\\)\|/).map((x) => x.trim().replace(/\\\|/g, '|'));
}

function lista(lineas, i0) {
  const m0 = lineas[i0].match(RE.item);
  const base = m0[1].length;
  const ordenada = m0[3] !== undefined;
  const mismoNivel = (l) => { const m = l.match(RE.item); return m && m[1].length <= base + 1 && m[1].length >= base && (m[3] !== undefined) === ordenada ? m : null; };
  const items = [];
  let i = i0;
  while (i < lineas.length) {
    const m = mismoNivel(lineas[i]);
    if (!m) break;
    const ancho = m[0].length - m[4].length;
    const propias = [m[4]];
    i++;
    while (i < lineas.length) {
      const l = lineas[i];
      if (vacia(l)) {
        let k = i;
        while (k < lineas.length && vacia(lineas[k])) k++;
        if (k < lineas.length && sangria(lineas[k]) > base && !mismoNivel(lineas[k])) { propias.push(...lineas.slice(i, k).map(() => '')); i = k; continue; }
        break;
      }
      if (sangria(l) <= base) break;
      propias.push(l.slice(Math.min(sangria(l), ancho)));
      i++;
    }
    items.push(parsearMarkdown(propias.join('\n')));
    // Una línea en blanco entre ítems del mismo nivel no corta la lista.
    let k = i;
    while (k < lineas.length && vacia(lineas[k])) k++;
    if (k > i && k < lineas.length && mismoNivel(lineas[k])) i = k;
  }
  const bloque = ordenada ? { t: 'ol', inicio: Number(m0[3]), items } : { t: 'ul', items };
  return [bloque, i];
}

export function parsearMarkdown(texto) {
  const lineas = String(texto ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lineas.length) {
    const l = lineas[i];
    if (vacia(l)) { i++; continue; }
    let m = l.match(RE.cerco);
    if (m) {
      const marca = m[1];
      const lang = m[2] ?? '';
      const cuerpo = [];
      i++;
      while (i < lineas.length && !new RegExp(`^\\s{0,3}${marca[0] === '`' ? '`' : '~'}{${marca.length},}\\s*$`).test(lineas[i])) cuerpo.push(lineas[i++]);
      i++;
      out.push({ t: 'code', lang, v: cuerpo.join('\n') });
      continue;
    }
    if ((m = l.match(RE.titulo))) {
      out.push({ t: 'h', nivel: m[1].length, inl: parsearInline(m[2].replace(/\s+#+\s*$/, '').trim()) });
      i++;
      continue;
    }
    if (RE.linea.test(l)) { out.push({ t: 'hr' }); i++; continue; }
    if (RE.cita.test(l)) {
      const propias = [];
      while (i < lineas.length && RE.cita.test(lineas[i])) propias.push(lineas[i++].replace(RE.cita, ''));
      out.push({ t: 'quote', hijos: parsearMarkdown(propias.join('\n')) });
      continue;
    }
    if (RE.item.test(l)) {
      const [bloque, sig] = lista(lineas, i);
      out.push(bloque);
      i = sig;
      continue;
    }
    if (esTabla(lineas, i)) {
      const cab = celdas(lineas[i]);
      const alin = celdas(lineas[i + 1]).slice(0, cab.length).map((x) => (x.startsWith(':') && x.endsWith(':') ? 'center' : x.endsWith(':') ? 'right' : x.startsWith(':') ? 'left' : null));
      i += 2;
      const filas = [];
      while (i < lineas.length && !vacia(lineas[i]) && lineas[i].includes('|')) {
        const f = celdas(lineas[i++]);
        filas.push(cab.map((_, k) => parsearInline(f[k] ?? '')));
      }
      out.push({ t: 'tabla', alin, cab: cab.map((x) => parsearInline(x)), filas });
      continue;
    }
    const propias = [l];
    i++;
    while (i < lineas.length && !vacia(lineas[i]) && !iniciaBloque(lineas, i)) propias.push(lineas[i++]);
    out.push({ t: 'p', inl: lineasAInline(propias) });
  }
  return out;
}

// ---- Render a DOM (solo en el navegador) ----
function nodo(tag, clase) {
  const e = document.createElement(tag);
  if (clase) e.className = clase;
  return e;
}

function renderInline(inl, padre) {
  for (const x of inl) {
    if (x.t === 'txt') padre.append(document.createTextNode(x.v));
    else if (x.t === 'br') padre.append(nodo('br'));
    else if (x.t === 'code') { const c = nodo('code'); c.textContent = x.v; padre.append(c); }
    else if (x.t === 'a') {
      const a = nodo('a');
      a.href = x.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      renderInline(x.hijos, a);
      padre.append(a);
    } else {
      const e = nodo({ b: 'strong', i: 'em', s: 'del' }[x.t] ?? 'span');
      renderInline(x.hijos ?? [], e);
      padre.append(e);
    }
  }
  return padre;
}

function renderBloques(bloques, padre) {
  for (const b of bloques) {
    if (b.t === 'p') padre.append(renderInline(b.inl, nodo('p')));
    else if (b.t === 'h') padre.append(renderInline(b.inl, nodo(`h${b.nivel}`)));
    else if (b.t === 'hr') padre.append(nodo('hr'));
    else if (b.t === 'code') {
      const pre = nodo('pre', 'bloque-codigo');
      const c = nodo('code');
      c.textContent = b.v;
      if (b.lang) pre.dataset.lang = b.lang;
      pre.append(c);
      padre.append(pre);
    } else if (b.t === 'quote') padre.append(renderBloques(b.hijos, nodo('blockquote')));
    else if (b.t === 'ul' || b.t === 'ol') {
      const l = nodo(b.t);
      if (b.t === 'ol' && b.inicio !== 1) l.start = b.inicio;
      for (const item of b.items) {
        const li = nodo('li');
        // Ítem simple: el texto va directo en el <li>, sin márgenes de párrafo.
        if (item[0]?.t === 'p') { renderInline(item[0].inl, li); renderBloques(item.slice(1), li); } else renderBloques(item, li);
        l.append(li);
      }
      padre.append(l);
    } else if (b.t === 'tabla') {
      const caja = nodo('div', 'tabla-md');
      const t = nodo('table');
      const fila = (celdasFila, tag) => {
        const tr = nodo('tr');
        celdasFila.forEach((inl, k) => { const td = renderInline(inl, nodo(tag)); if (b.alin[k]) td.style.textAlign = b.alin[k]; tr.append(td); });
        return tr;
      };
      const thead = nodo('thead');
      thead.append(fila(b.cab, 'th'));
      const tbody = nodo('tbody');
      for (const f of b.filas) tbody.append(fila(f, 'td'));
      t.append(thead, tbody);
      caja.append(t);
      padre.append(caja);
    }
  }
  return padre;
}

export function renderMarkdown(texto, clase = 'texto md') {
  return renderBloques(parsearMarkdown(texto), nodo('div', clase));
}
