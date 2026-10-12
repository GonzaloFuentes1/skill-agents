// Reglas git del orquestador. Autocontenido (solo node:*): /orquestador:setup lo copia a .git/hooks/orquestador/.
import { resolve } from 'node:path';

export const RAMAS_PROTEGIDAS_DEFECTO = ['main', 'master'];
const RE_CONVENTIONAL = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]+\))?!?: \S.*/;
const RE_EXENTOS = /^(Merge |Revert "|fixup! |squash! )/;
const RE_ATRIBUCION = /co-authored-by:[^\n]*(claude|anthropic)|noreply@anthropic\.com|generated with \[?claude/i;
const RE_HEREDOC = /<<-?\s*(['"]?)(\w+)\1[^\n]*\n([\s\S]*?)\n\s*\2(?=\s|$|\))/;
const RE_HERESTRING = /@(['"])\r?\n([\s\S]*?)\r?\n\1@/;
// Opciones globales de git antes del subcomando: -C <dir>, -c <clave=valor>, --opcion[=valor], -p/-P.
const OPCION_GLOBAL = String.raw`(?:\s+(?:-[Cc]\s+(?:"[^"]*"|'[^']*'|\S+)|--[\w-]+(?:=\S+)?|-[pP]))`;
const RE_OPS = new RegExp(String.raw`\b(git)(${OPCION_GLOBAL}*)\s+(commit|push|checkout|switch)\b|\b(gh)\s+pr\s+(create|edit|merge)\b`, 'g');
const RE_HOOKS_PATH = /-c\s+["']?core\.hooksPath\s*=/i;

export const esConventional = (linea) => {
  const l = String(linea ?? '').trim();
  return RE_CONVENTIONAL.test(l) || RE_EXENTOS.test(l);
};
export const contieneAtribucion = (texto) => RE_ATRIBUCION.test(String(texto ?? ''));
const primeraLinea = (t) => String(t ?? '').split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? '';
const blanco = (s) => s.replace(/[^\n]/g, ' ');

// Blanquea el cuerpo de heredocs y here-strings, sin cambiar el largo.
function enmascararCuerpos(texto) {
  return String(texto)
    .replace(/<<-?\s*(['"]?)(\w+)\1([^\n]*\n)([\s\S]*?)(\n\s*\2(?=\s|$|\)))/g,
      (t, _q, _tag, _cola, cuerpo, fin) => t.slice(0, t.length - cuerpo.length - fin.length) + blanco(cuerpo) + fin)
    .replace(/@(['"])\r?\n[\s\S]*?\r?\n\1@/g, (t) => t.slice(0, 2) + blanco(t.slice(2, -2)) + t.slice(-2));
}

// Reemplaza el contenido de heredocs, here-strings y comillas por espacios, sin cambiar el largo.
export function enmascarar(texto) {
  return enmascararCuerpos(texto)
    .replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, (t) => t[0] + blanco(t.slice(1, -1)) + t[t.length - 1]);
}

// Fin del comando actual: primer separador (salto de línea, ;, |, &&) fuera de comillas.
function finSegmento(mascara, desde) {
  let comilla = null;
  for (let i = desde; i < mascara.length; i++) {
    const ch = mascara[i];
    if (comilla) { if (ch === comilla) comilla = null; continue; }
    if (ch === '"' || ch === "'") { comilla = ch; continue; }
    if (ch === '\n' || ch === ';' || ch === '|' || (ch === '&' && mascara[i + 1] === '&')) return i;
  }
  return mascara.length;
}

// Tokenizador de shell mínimo: separa por espacios y quita comillas conservando su contenido.
function tokenizar(s) {
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    let t = '';
    while (i < s.length && !/\s/.test(s[i])) {
      const ch = s[i];
      if (ch === '"') {
        i++;
        while (i < s.length && s[i] !== '"') { if (s[i] === '\\' && i + 1 < s.length) i++; t += s[i++]; }
        i++;
      } else if (ch === "'") {
        i++;
        while (i < s.length && s[i] !== "'") t += s[i++];
        i++;
      } else {
        t += s[i++];
      }
    }
    tokens.push(t);
  }
  return tokens;
}

function valorDeFlag(resto, flags) {
  const re = new RegExp(`(?:^|\\s)(?:${flags})(?:\\s+|=)(?:"((?:[^"\\\\]|\\\\.)*)"|'([^']*)'|(\\S+))`);
  const m = re.exec(resto);
  return m ? { valor: m[1] ?? m[2] ?? m[3], indice: m.index } : null;
}

function mensajeDe(resto, flagsTexto, flagsArchivo, ctx, cwd) {
  const t = valorDeFlag(resto, flagsTexto);
  if (t) {
    const desdeFlag = resto.slice(t.indice);
    if (t.valor.startsWith('$(') || t.valor.startsWith('<<')) { const h = RE_HEREDOC.exec(desdeFlag); return h ? h[3] : null; }
    if (/^@['"]$/.test(t.valor)) { const h = RE_HERESTRING.exec(desdeFlag); return h ? h[2] : null; }
    return t.valor;
  }
  const a = flagsArchivo ? valorDeFlag(resto, flagsArchivo) : null;
  if (a) { try { return ctx.leerArchivo(resolve(cwd, a.valor)); } catch { return null; } }
  return null;
}

function nuevaRama(sub, tokens, ctx, cwd) {
  const i = tokens.findIndex((t) => (sub === 'checkout' ? /^-[bB]$/ : /^(-[cC]|--create)$/).test(t));
  if (i >= 0) return tokens[i + 1] ?? null;
  if (tokens.includes('--')) return null;
  const nombre = tokens.find((t) => !t.startsWith('-'));
  if (!nombre) return null;
  if (sub === 'switch') return nombre;
  return ctx.esRama(cwd, nombre) ? nombre : null;
}

const ATRIBUCION = { regla: 'atribucion', motivo: 'El mensaje contiene coautoría o atribución de Claude/IA. Quítala.' };
const NO_VERIFY = { regla: 'no-verify', motivo: 'No se permite saltarse los hooks (--no-verify / -n).' };

// --no-verify o -n (también agrupado, p. ej. -nm), sin confundir el valor de -m/-F con una opción.
function saltaHooksEnCommit(tokens) {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '--no-verify') return true;
    if (/^(-m|--message|-F|--file|-C|-c|--author|--date|-t|--template)$/.test(t)) { i++; continue; }
    const m = /^-([a-zA-Z]+)/.exec(t);
    if (m && !t.startsWith('--')) {
      const corte = m[1].search(/[mFCct]/);
      if ((corte < 0 ? m[1] : m[1].slice(0, corte)).includes('n')) return true;
    }
  }
  return false;
}

function reglaCommit(texto, desde, tokens, rama, protegidas, ctx, cwd, opciones) {
  if (protegidas.includes(rama)) {
    return { regla: 'commit-en-protegida', motivo: `No se permite commit directo en '${rama}'. Crea una rama: git switch -c tipo/descripcion` };
  }
  if (RE_HOOKS_PATH.test(opciones) || saltaHooksEnCommit(tokens)) return NO_VERIFY;
  const mensaje = mensajeDe(texto.slice(desde), '-m|--message', '-F|--file', ctx, cwd);
  if (contieneAtribucion(texto) || contieneAtribucion(mensaje)) return ATRIBUCION;
  if (mensaje !== null && !esConventional(primeraLinea(mensaje))) {
    return { regla: 'conventional', motivo: `"${primeraLinea(mensaje)}" no sigue Conventional Commits (tipo(ámbito): descripción).` };
  }
  return null;
}

function reglaPush(tokens, rama, protegidas, opciones) {
  if (RE_HOOKS_PATH.test(opciones) || tokens.includes('--no-verify')) return NO_VERIFY;
  const posicionales = tokens.filter((t) => !t.startsWith('-'));
  const refspecs = posicionales.slice(1);
  const fuerza = refspecs.some((r) => r.startsWith('+'))
    || tokens.some((t) => /^--force(-with-lease|-if-includes)?(=.*)?$/.test(t) || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(t));
  const masivo = tokens.includes('--all') || tokens.includes('--mirror');
  let destinos = refspecs.map((r) => {
    let d = r.replace(/^\+/, '');
    if (d.includes(':')) d = d.split(':').pop();
    d = d.replace(/^refs\/heads\//, '');
    return d === 'HEAD' ? rama : d;
  });
  if (!destinos.length && !tokens.includes('--tags')) destinos = [rama];
  const destino = destinos.find((d) => protegidas.includes(d));
  if (masivo || destino) {
    return fuerza
      ? { regla: 'force-push', motivo: `No se permite force-push a '${destino ?? 'ramas protegidas'}'.` }
      : { regla: 'push-a-protegida', motivo: `No se permite push directo a '${destino ?? 'todas las ramas'}'. Sube tu rama y abre un PR.` };
  }
  return null;
}

function reglaGh(sub, texto, desde, tokens, ctx) {
  if (sub === 'merge') {
    if (tokens.includes('--admin')) return { regla: 'merge-admin', motivo: 'No se permite saltarse la protección con --admin.' };
    if (!tokens.some((t) => t === '--squash' || t === '-s')) return { regla: 'merge-sin-squash', motivo: 'Usa squash-merge: gh pr merge --squash' };
    return null;
  }
  const resto = texto.slice(desde);
  const archivo = valorDeFlag(resto, '--body-file|-F');
  let cuerpo = '';
  if (archivo) { try { cuerpo = ctx.leerArchivo(resolve(ctx.cwd, archivo.valor)); } catch { /* sin archivo */ } }
  if (contieneAtribucion(texto) || contieneAtribucion(cuerpo)) return ATRIBUCION;
  const titulo = mensajeDe(resto, '--title|-t', null, ctx, ctx.cwd);
  if (titulo !== null && !esConventional(primeraLinea(titulo))) {
    return { regla: 'conventional', motivo: `El título "${primeraLinea(titulo)}" no sigue Conventional Commits; con squash será el mensaje del commit.` };
  }
  return null;
}

export function evaluarComando(comando, ctx) {
  const texto = String(comando ?? '');
  const mascara = enmascarar(texto);
  const parcial = enmascararCuerpos(texto);
  const protegidas = ctx.ramasProtegidas ?? RAMAS_PROTEGIDAS_DEFECTO;
  let rama = null;
  for (const m of mascara.matchAll(RE_OPS)) {
    const fin = m.index + m[0].length;
    const tokens = tokenizar(parcial.slice(fin, finSegmento(mascara, fin)));
    if (m[1] === 'git') {
      const opciones = texto.slice(m.index, fin);
      const c = /-C\s+(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(opciones);
      const cwd = c ? resolve(ctx.cwd, c[1] ?? c[2] ?? c[3]) : ctx.cwd;
      const ramaEn = () => rama ?? ctx.ramaActual(cwd);
      if (m[3] === 'checkout' || m[3] === 'switch') { rama = nuevaRama(m[3], tokens, ctx, cwd) ?? rama; continue; }
      const v = m[3] === 'commit'
        ? reglaCommit(texto, fin, tokens, ramaEn(), protegidas, ctx, cwd, opciones)
        : reglaPush(tokens, ramaEn(), protegidas, opciones);
      if (v) return v;
    } else {
      const v = reglaGh(m[5], texto, fin, tokens, ctx);
      if (v) return v;
    }
  }
  return null;
}
