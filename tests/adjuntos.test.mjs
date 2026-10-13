import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  LIMITES, MAX_CUERPO_MENSAJE, sanearNombre, tipoImagen, validarAdjuntos, guardarAdjuntos, textoConAdjuntos, contenidoMensaje,
} from '../plugins/orquestador/dashboard/adjuntos.mjs';
import { ErrorConversacion, crearGestor } from '../plugins/orquestador/dashboard/conversaciones.mjs';
import { argumentos, abrirProceso, mensajeUsuario } from '../plugins/orquestador/dashboard/proceso-claude.mjs';
import { mensajesDesdeTranscript } from '../plugins/orquestador/dashboard/historial.mjs';
import { rutaAdjuntos } from '../plugins/orquestador/scripts/lib/rutas.mjs';
import { crearServidor } from '../plugins/orquestador/dashboard/server.mjs';
import * as front from '../plugins/orquestador/dashboard/public/adjuntos.js';
import { chatVacio, desdeHistorial, reducirChat } from '../plugins/orquestador/dashboard/public/chat-vista.js';
import { pedir, pedirCrudo, login, post } from './helpers/http.mjs';
import { ESPERAR_USUARIO, INIT, texto, fin, turnoSimple } from './fixtures/guiones.mjs';

const FALSO = fileURLToPath(new URL('./fixtures/claude-falso.mjs', import.meta.url));
const MB = 1024 * 1024;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('cuerpo de png')]);
const b64 = (x) => Buffer.from(x).toString('base64');
const lanza = (fn, status, patron) => assert.throws(fn, (e) => e instanceof ErrorConversacion && e.status === status && (!patron || patron.test(e.message)), `esperaba ${status}`);

// ---------- saneo de nombres ----------
test('sanearNombre: sin carpetas, "..", separadores ni caracteres de control', () => {
  assert.equal(sanearNombre('informe.pdf'), 'informe.pdf');
  assert.equal(sanearNombre('../../etc/passwd'), 'passwd');
  assert.equal(sanearNombre('C:\\Windows\\system32\\x.dll'), 'x.dll');
  assert.equal(sanearNombre('a\u0000b\u001f\u007fc.txt'), 'abc.txt');
  assert.equal(sanearNombre('a\nb\r.txt'), 'ab.txt');
  assert.equal(sanearNombre('ma..lo.txt'), 'ma.lo.txt');
  assert.equal(sanearNombre('..'), 'archivo');
  assert.equal(sanearNombre('...txt'), 'txt');
  assert.equal(sanearNombre('  .oculto.  '), 'oculto');
  assert.equal(sanearNombre('a<b>c:d"e|f?g*h.txt'), 'a_b_c_d_e_f_g_h.txt');
  assert.equal(sanearNombre('fac\u202Etxt.exe'), 'factxt.exe'); // sin marcas de dirección que disfrazan la extensión
  assert.equal(sanearNombre('CON.txt'), '_CON.txt');
  assert.equal(sanearNombre(''), 'archivo');
  assert.equal(sanearNombre(null), 'archivo');
  assert.equal(sanearNombre('/'), 'archivo');
  assert.equal(sanearNombre('reunión 2026 (final).docx'), 'reunión 2026 (final).docx');
  const largo = sanearNombre(`${'x'.repeat(300)}.pdf`);
  assert.ok(largo.length <= 120, largo.length);
  assert.ok(largo.endsWith('.pdf'));
});

// ---------- límites y validación ----------
test('tipoImagen: reconoce png, jpeg, gif y webp por su firma, no por el nombre', () => {
  assert.equal(tipoImagen(PNG), 'image/png');
  assert.equal(tipoImagen(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2])), 'image/jpeg');
  assert.equal(tipoImagen(Buffer.from('GIF89a...')), 'image/gif');
  assert.equal(tipoImagen(Buffer.from('RIFF\0\0\0\0WEBPVP8 ')), 'image/webp');
  assert.equal(tipoImagen(Buffer.from('%PDF-1.7')), null);
  assert.equal(tipoImagen(Buffer.alloc(0)), null);
});

test('validarAdjuntos: lista vacía o ausente; forma inválida da 400', () => {
  assert.deepEqual(validarAdjuntos(undefined), []);
  assert.deepEqual(validarAdjuntos(null), []);
  assert.deepEqual(validarAdjuntos([]), []);
  lanza(() => validarAdjuntos('x'), 400);
  lanza(() => validarAdjuntos([null]), 400);
  lanza(() => validarAdjuntos([{ nombre: 'a.txt' }]), 400);
  lanza(() => validarAdjuntos([{ nombre: 3, datos: b64('x') }]), 400);
  lanza(() => validarAdjuntos([{ nombre: 'a.txt', datos: 'no es base64!' }]), 400, /a\.txt/);
  const [a] = validarAdjuntos([{ nombre: '../a.txt', tipo: 'text/plain', datos: b64('hola') }]);
  assert.equal(a.nombre, 'a.txt');
  assert.equal(a.datos.toString(), 'hola');
  assert.equal(a.mediaType, null);
});

test('validarAdjuntos: hasta 10 adjuntos, archivos de hasta 20 MB e imágenes de hasta 5 MB', () => {
  assert.deepEqual([LIMITES.cantidad, LIMITES.archivoBytes, LIMITES.imagenBytes], [10, 20 * MB, 5 * MB]);
  const uno = { nombre: 'a.txt', datos: b64('x') };
  assert.equal(validarAdjuntos(Array(10).fill(uno)).length, 10);
  lanza(() => validarAdjuntos(Array(11).fill(uno)), 400, /10/);
  // Un archivo justo en el límite pasa; uno más grande da 413.
  assert.equal(validarAdjuntos([{ nombre: 'g.bin', datos: Buffer.alloc(20 * MB).toString('base64') }])[0].datos.length, 20 * MB);
  lanza(() => validarAdjuntos([{ nombre: 'g.bin', datos: Buffer.alloc(20 * MB + 1).toString('base64') }]), 413, /g\.bin.*20 MB/);
  // Una imagen (por firma) de más de 5 MB da 413; el mismo tamaño en un archivo que no es imagen pasa.
  const grande = Buffer.concat([PNG, Buffer.alloc(5 * MB)]);
  lanza(() => validarAdjuntos([{ nombre: 'foto.png', datos: grande.toString('base64') }]), 413, /foto\.png.*5 MB/);
  assert.equal(validarAdjuntos([{ nombre: 'datos.csv', datos: Buffer.alloc(5 * MB + 10).toString('base64') }])[0].mediaType, null);
  assert.equal(validarAdjuntos([{ nombre: 'foto.png', datos: PNG.toString('base64') }])[0].mediaType, 'image/png');
});

test('guardarAdjuntos: <dir>/<marca>-<nombre saneado>, sin pisar archivos con el mismo nombre', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'orq-adj-')), 'conv');
  const lista = validarAdjuntos([{ nombre: 'a.txt', datos: b64('uno') }, { nombre: 'a.txt', datos: b64('dos') }]);
  const g = guardarAdjuntos(dir, lista, { ahora: () => 1700000000000 });
  assert.equal(g.length, 2);
  assert.match(basename(g[0].ruta), /^1700000000000-a\.txt$/);
  assert.notEqual(g[0].ruta, g[1].ruta);
  assert.match(basename(g[1].ruta), /^\d+-a\.txt$/);
  assert.equal(dirname(g[0].ruta), dir);
  assert.deepEqual(g.map((x) => readFileSync(x.ruta, 'utf8')), ['uno', 'dos']);
  assert.deepEqual(g.map((x) => x.nombre), ['a.txt', 'a.txt']);
});

test('rutaAdjuntos: bajo el directorio del orquestador y con el id saneado', () => {
  const env = { ORQUESTADOR_HOME: join(tmpdir(), 'orq-x') };
  assert.equal(rutaAdjuntos('abc-123', env), join(tmpdir(), 'orq-x', 'adjuntos', 'abc-123'));
  assert.equal(rutaAdjuntos('../../x', env), join(tmpdir(), 'orq-x', 'adjuntos', '______x'));
});

// ---------- pie [Adjuntos] y mensaje stream-json ----------
test('textoConAdjuntos: pie con el formato exacto; sin texto, solo el pie; sin adjuntos, el texto tal cual', () => {
  const g = [{ nombre: 'informe.pdf', ruta: '/tmp/adj/1-informe.pdf' }, { nombre: 'foto.png', ruta: 'C:\\adj\\2-foto.png' }];
  assert.equal(textoConAdjuntos('Revisa esto', g), 'Revisa esto\n\n[Adjuntos]\n- informe.pdf: /tmp/adj/1-informe.pdf\n- foto.png: C:\\adj\\2-foto.png');
  assert.equal(textoConAdjuntos('', g.slice(0, 1)), '[Adjuntos]\n- informe.pdf: /tmp/adj/1-informe.pdf');
  assert.equal(textoConAdjuntos('Hola', []), 'Hola');
});

test('la vista separa el pie que arma el servidor: texto limpio y adjuntos con nombre y ruta', () => {
  const g = [{ nombre: 'informe final.pdf', ruta: 'C:\\Users\\Ana María\\adj\\1-informe final.pdf' }, { nombre: 'b.csv', ruta: '/x/2-b.csv' }];
  assert.deepEqual(front.separarAdjuntos(textoConAdjuntos('Línea 1\nLínea 2', g)), {
    texto: 'Línea 1\nLínea 2',
    adjuntos: [{ nombre: 'informe final.pdf', ruta: 'C:\\Users\\Ana María\\adj\\1-informe final.pdf' }, { nombre: 'b.csv', ruta: '/x/2-b.csv' }],
  });
  assert.deepEqual(front.separarAdjuntos(textoConAdjuntos('', g.slice(1))), { texto: '', adjuntos: [{ nombre: 'b.csv', ruta: '/x/2-b.csv' }] });
  // Sin pie, o con "[Adjuntos]" en medio del texto, no se toca nada.
  assert.deepEqual(front.separarAdjuntos('hola'), { texto: 'hola', adjuntos: [] });
  const medio = 'Mira:\n\n[Adjuntos]\n- a: b\n\ny sigo escribiendo';
  assert.deepEqual(front.separarAdjuntos(medio), { texto: medio, adjuntos: [] });
});

test('contenidoMensaje: sin imágenes es un string; con imágenes, bloques image en base64 y luego el texto', () => {
  assert.equal(contenidoMensaje('hola', [{ nombre: 'a.txt', ruta: '/a', mediaType: null, datos: Buffer.from('x') }]), 'hola');
  const c = contenidoMensaje('mira', [{ nombre: 'f.png', ruta: '/f', mediaType: 'image/png', datos: PNG }, { nombre: 'a.txt', ruta: '/a', mediaType: null, datos: Buffer.from('x') }]);
  assert.deepEqual(c, [
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG.toString('base64') } },
    { type: 'text', text: 'mira' },
  ]);
  assert.deepEqual(mensajeUsuario(c), { type: 'user', message: { role: 'user', content: c }, parent_tool_use_id: null, session_id: '' });
  assert.equal(mensajeUsuario('hola').message.content, 'hola');
});

// ---------- --add-dir ----------
test('argumentos: --add-dir por cada carpeta adicional', () => {
  const a = argumentos({ modo: 'auto', dirsAdicionales: ['/h/adjuntos/c1'] });
  assert.equal(a[a.indexOf('--add-dir') + 1], '/h/adjuntos/c1');
  assert.ok(!argumentos({ modo: 'auto' }).includes('--add-dir'));
});

test('un claude .cmd recibe intacta una carpeta de --add-dir con espacios (spawn real con shell)', { skip: process.platform !== 'win32' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'orq-adjcmd-'));
  const adj = join(dir, 'Ana María', 'adjuntos & más');
  mkdirSync(adj, { recursive: true });
  const cmd = join(dir, 'claude falso.cmd');
  writeFileSync(cmd, `@echo off\r\n"${process.execPath}" "${FALSO}" %*\r\n`);
  writeFileSync(join(dir, 'guion.json'), JSON.stringify([{ salir: 0 }]));
  const registro = join(dir, 'registro.jsonl');
  const p = abrirProceso({
    cwd: dir, binario: cmd, dirsAdicionales: [adj],
    env: { ...process.env, FALSO_GUION: join(dir, 'guion.json'), FALSO_REGISTRO: registro },
  });
  const salida = await new Promise((ok) => p.on('evento', (e) => { if (e.tipo === 'salida') ok(e); }));
  assert.equal(salida.codigo, 0, salida.error);
  const { argv } = JSON.parse(readFileSync(registro, 'utf8').split('\n')[0]);
  assert.equal(argv[argv.indexOf('--add-dir') + 1], adj);
});

function entorno(guion, config = {}) {
  const home = mkdtempSync(join(tmpdir(), 'orq-adjg-'));
  writeFileSync(join(home, 'config.json'), JSON.stringify({ rutaClaude: 'claude-falso', ...config }));
  const archivo = join(home, 'guion.json');
  writeFileSync(archivo, JSON.stringify(guion));
  const registro = join(home, 'registro.jsonl');
  const env = { ORQUESTADOR_HOME: home, FALSO_GUION: archivo, FALSO_REGISTRO: registro, PATH: process.env.PATH, SystemRoot: process.env.SystemRoot };
  const spawnFn = (_bin, args, opciones) => spawn(process.execPath, [FALSO, ...args], opciones);
  const leerRegistro = () => readFileSync(registro, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  return { home, env, spawnFn, leerRegistro };
}
function recolector(gestor) {
  const eventos = [];
  gestor.on((e) => eventos.push(e));
  const hasta = (pred, ms = 5000) => new Promise((ok, mal) => {
    const t0 = Date.now();
    const mirar = () => (eventos.some(pred) ? ok() : Date.now() - t0 > ms ? mal(new Error('timeout')) : setTimeout(mirar, 10));
    mirar();
  });
  return { eventos, hasta };
}

test('gestor: el proceso se lanza siempre con --add-dir de la carpeta de adjuntos, ya creada', async (t) => {
  const { env, spawnFn, home, leerRegistro } = entorno(turnoSimple());
  const g = crearGestor({ env, spawnFn });
  t.after(() => g.apagar());
  const { hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  g.enviar(c.id, 'hola sin adjuntos');
  await hasta((e) => e.tipo === 'chat:fin-turno');
  const { argv } = leerRegistro().find((r) => r.argv);
  const dir = argv[argv.indexOf('--add-dir') + 1];
  assert.equal(dir, rutaAdjuntos(c.id, env));
  assert.ok(statSync(dir).isDirectory());
  assert.equal(leerRegistro().find((r) => r.stdin?.type === 'user').stdin.message.content, 'hola sin adjuntos');
});

test('gestor: enviar con adjuntos guarda los archivos, manda la imagen en línea y el pie con las rutas', async (t) => {
  const { env, spawnFn, home, leerRegistro } = entorno(turnoSimple());
  const g = crearGestor({ env, spawnFn });
  t.after(() => g.apagar());
  const { eventos, hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  g.enviar(c.id, 'Revisa', [{ nombre: 'foto.png', tipo: 'image/png', datos: PNG.toString('base64') }, { nombre: '../notas.txt', datos: b64('apuntes') }]);
  await hasta((e) => e.tipo === 'chat:fin-turno');
  const dir = rutaAdjuntos(c.id, env);
  const archivos = readdirSync(dir).sort();
  assert.equal(archivos.length, 2);
  assert.ok(archivos.some((f) => /^\d+-foto\.png$/.test(f)) && archivos.some((f) => /^\d+-notas\.txt$/.test(f)), archivos.join());
  const rutaNotas = join(dir, archivos.find((f) => f.endsWith('notas.txt')));
  assert.equal(readFileSync(rutaNotas, 'utf8'), 'apuntes');
  const content = leerRegistro().find((r) => r.stdin?.type === 'user').stdin.message.content;
  assert.deepEqual(content[0], { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG.toString('base64') } });
  assert.equal(content[1].type, 'text');
  assert.ok(content[1].text.startsWith('Revisa\n\n[Adjuntos]\n- foto.png: '), content[1].text);
  assert.ok(content[1].text.endsWith(`- notas.txt: ${rutaNotas}`), content[1].text);
  // El evento en vivo lleva el texto con el pie (la vista lo separa) y nunca el base64.
  const usuario = eventos.find((e) => e.tipo === 'chat:usuario');
  assert.equal(usuario.texto, content[1].text);
  assert.ok(!JSON.stringify(usuario).includes(PNG.toString('base64')));
  assert.equal(g.obtener(c.id).titulo, 'Revisa');
});

test('gestor: solo adjuntos (sin texto) se acepta y titula la conversación; vacío del todo sigue dando 400; límites con 400/413', async (t) => {
  const { env, spawnFn, home } = entorno(turnoSimple());
  const g = crearGestor({ env, spawnFn });
  t.after(() => g.apagar());
  const { hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  lanza(() => g.enviar(c.id, '  ', []), 400);
  lanza(() => g.enviar(c.id, 'x', Array(11).fill({ nombre: 'a.txt', datos: b64('x') })), 400);
  const dir = rutaAdjuntos(c.id, env);
  assert.ok(!existsSync(dir) || readdirSync(dir).length === 0, 'un envío rechazado no guarda archivos');
  g.enviar(c.id, '', [{ nombre: 'plan.pdf', datos: b64('%PDF-1.7') }]);
  await hasta((e) => e.tipo === 'chat:fin-turno');
  assert.equal(g.obtener(c.id).titulo, 'Adjuntos: plan.pdf');
});

test('gestor: un mensaje con adjuntos que llega mientras el proceso se cierra se manda completo al proceso nuevo', async (t) => {
  const { env, spawnFn, home, leerRegistro } = entorno(turnoSimple());
  const g = crearGestor({ env, spawnFn });
  t.after(() => g.apagar());
  const { eventos, hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  g.enviar(c.id, 'uno');
  await hasta((e) => e.tipo === 'chat:fin-turno');
  g.cerrar(c.id);
  g.enviar(c.id, 'dos', [{ nombre: 'f.png', datos: PNG.toString('base64') }]);
  await hasta(() => eventos.filter((e) => e.tipo === 'chat:fin-turno').length === 2);
  const contenidos = leerRegistro().filter((r) => r.stdin?.type === 'user').map((r) => r.stdin.message.content);
  assert.equal(contenidos[0], 'uno');
  assert.equal(contenidos[1][0].type, 'image');
  assert.match(contenidos[1][1].text, /^dos\n\n\[Adjuntos\]\n- f\.png: /);
});

// ---------- historial ----------
test('historial: los bloques image del usuario llegan como bloques imagen, sin base64', () => {
  const linea = JSON.stringify({ type: 'user', uuid: 'u1', message: { role: 'user', content: [
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'QUJD' } },
    { type: 'text', text: 'mira\n\n[Adjuntos]\n- f.png: /x/1-f.png' },
  ] } });
  const solo = JSON.stringify({ type: 'user', uuid: 'u2', message: { role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } }] } });
  const m = mensajesDesdeTranscript(`${linea}\n${solo}\n`);
  assert.deepEqual(m.map((x) => x.rol), ['usuario', 'usuario']);
  assert.deepEqual(m[0].bloques, [{ tipo: 'texto', texto: 'mira\n\n[Adjuntos]\n- f.png: /x/1-f.png' }, { tipo: 'imagen' }]);
  assert.deepEqual(m[1].bloques, [{ tipo: 'imagen' }]);
  assert.ok(!JSON.stringify(m).includes('QUJD'));
});

// ---------- vista ----------
test('vista: chat:usuario separa el pie; las fichas llevan el nombre', () => {
  const c = chatVacio();
  reducirChat(c, { tipo: 'chat:usuario', id: 'u1', texto: 'Revisa\n\n[Adjuntos]\n- informe.pdf: /a/1-informe.pdf' });
  assert.deepEqual(c.mensajes[0].bloques, [{ tipo: 'texto', texto: 'Revisa' }, { tipo: 'adjunto', nombre: 'informe.pdf', ruta: '/a/1-informe.pdf' }]);
  reducirChat(c, { tipo: 'chat:usuario', id: 'u2', texto: '[Adjuntos]\n- a.csv: /a/2-a.csv' });
  assert.deepEqual(c.mensajes[1].bloques, [{ tipo: 'adjunto', nombre: 'a.csv', ruta: '/a/2-a.csv' }]);
});

test('vista: al recargar, las imágenes del transcript son fichas "Imagen" salvo las que ya nombra el pie', () => {
  const h = desdeHistorial({ conversacion: { estado: 'lista' }, mensajes: [
    { rol: 'usuario', id: 'u1', bloques: [{ tipo: 'texto', texto: 'mira\n\n[Adjuntos]\n- f.png: /x/1-f.png\n- n.txt: /x/2-n.txt' }, { tipo: 'imagen' }] },
    { rol: 'usuario', id: 'u2', bloques: [{ tipo: 'imagen' }, { tipo: 'imagen' }] },
  ] });
  assert.deepEqual(h.mensajes[0].bloques, [{ tipo: 'texto', texto: 'mira' }, { tipo: 'adjunto', nombre: 'f.png', ruta: '/x/1-f.png' }, { tipo: 'adjunto', nombre: 'n.txt', ruta: '/x/2-n.txt' }]);
  assert.deepEqual(h.mensajes[1].bloques, [{ tipo: 'adjunto', nombre: 'Imagen', imagen: true }, { tipo: 'adjunto', nombre: 'Imagen', imagen: true }]);
});

test('front: límites iguales a los del servidor y el total cabe en el cuerpo del POST', () => {
  assert.equal(front.LIMITES.cantidad, LIMITES.cantidad);
  assert.equal(front.LIMITES.archivoBytes, LIMITES.archivoBytes);
  assert.equal(front.LIMITES.imagenBytes, LIMITES.imagenBytes);
  assert.ok(Math.ceil(front.LIMITES.totalBytes / 3) * 4 + 64 * 1024 < MAX_CUERPO_MENSAJE, 'el total en base64 más el texto cabe en el cuerpo');
  assert.ok(MAX_CUERPO_MENSAJE >= 39 * MB && MAX_CUERPO_MENSAJE <= 41 * MB);
});

test('front: admitir respeta la cantidad, el tamaño por archivo, el de las imágenes y el total, con errores en español', () => {
  const f = (name, size, type = 'application/pdf') => ({ name, size, type });
  const ok = front.admitir([], [f('a.pdf', 10), f('b.png', 10, 'image/png')]);
  assert.equal(ok.aceptados.length, 2);
  assert.deepEqual(ok.errores, []);
  const muchos = front.admitir(Array(9).fill(f('x', 1)), [f('a', 1), f('b', 1), f('c', 1)]);
  assert.deepEqual(muchos.aceptados.map((x) => x.name), ['a']);
  assert.match(muchos.errores.join(' '), /hasta 10 archivos/);
  const grande = front.admitir([], [f('g.zip', 20 * MB + 1), f('ok.zip', 20 * MB)]);
  assert.deepEqual(grande.aceptados.map((x) => x.name), ['ok.zip']);
  assert.match(grande.errores[0], /g\.zip.*20 MB/);
  const imagen = front.admitir([], [f('foto.jpg', 5 * MB + 1, 'image/jpeg')]);
  assert.deepEqual(imagen.aceptados, []);
  assert.match(imagen.errores[0], /foto\.jpg.*5 MB/);
  const total = front.admitir([f('a', 20 * MB)], [f('b', 20 * MB)]);
  assert.deepEqual(total.aceptados, []);
  assert.match(total.errores[0], /en total/);
});

test('front: formato de tamaño, extensión y nombre de imágenes pegadas', () => {
  assert.equal(front.formatoTamano(512), '512 B');
  assert.equal(front.formatoTamano(1536), '1,5 KB');
  assert.equal(front.formatoTamano(2.25 * MB), '2,3 MB');
  assert.equal(front.extension('informe.final.PDF'), 'PDF');
  assert.equal(front.extension('sin-extension'), 'ARCH');
  assert.equal(front.nombrePegada('image/png', 2), 'imagen-pegada-2.png');
  assert.equal(front.nombrePegada('image/jpeg', 1), 'imagen-pegada-1.jpg');
  assert.ok(front.esImagen('image/webp') && !front.esImagen('image/svg+xml'));
});

// ---------- HTTP ----------
async function levantar() {
  const home = mkdtempSync(join(tmpdir(), 'orq-adjs-'));
  writeFileSync(join(home, 'config.json'), JSON.stringify({ rutaClaude: 'claude-falso' }));
  writeFileSync(join(home, 'guion.json'), JSON.stringify([ESPERAR_USUARIO, INIT, ...texto('m1', 'Hola'), fin()]));
  writeFileSync(join(home, 'events.jsonl'), '');
  const env = { ORQUESTADOR_HOME: home, CLAUDE_CONFIG_DIR: mkdtempSync(join(tmpdir(), 'orq-cfg-')), FALSO_GUION: join(home, 'guion.json'), PATH: process.env.PATH, SystemRoot: process.env.SystemRoot };
  const srv = crearServidor({ env, intervaloMs: 20, spawnFn: (_b, args, o) => spawn(process.execPath, [FALSO, ...args], o) });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { env, home, srv, base, cookie: await login(base, srv.auth.token) };
}

test('HTTP: enviar mensaje acepta un cuerpo grande; el resto de las rutas conserva el tope de 64 KB', async () => {
  const { srv, base, cookie, home, env } = await levantar();
  try {
    const conv = (await post(base, '/api/conversaciones', { cwd: home }, cookie)).json();
    const pesado = Buffer.alloc(3 * MB, 7).toString('base64'); // ~4 MB de JSON
    const r = await post(base, `/api/conversaciones/${conv.id}/mensajes`, { texto: 'toma', adjuntos: [{ nombre: 'datos.bin', datos: pesado }] }, cookie);
    assert.equal(r.status, 202, r.texto);
    assert.equal(readdirSync(rutaAdjuntos(conv.id, env)).length, 1);
    assert.equal((await post(base, `/api/conversaciones/${conv.id}/titulo`, { titulo: 'x'.repeat(70_000) }, cookie)).status, 413);
    assert.equal((await post(base, '/api/conversaciones', { cwd: 'x'.repeat(70_000) }, cookie)).status, 413);
    // La ruta de mensajes con otra forma (sin id, o con algo detrás) no hereda el tope grande.
    assert.equal((await post(base, `/api/conversaciones/${conv.id}/mensajes/x`, { relleno: 'x'.repeat(70_000) }, cookie)).status, 413);
  } finally { await srv.detener(); }
});

test('HTTP: enviar mensaje responde 413 por encima de ~40 MB y 400/413 con adjuntos inválidos', async () => {
  const { srv, base, cookie, home } = await levantar();
  try {
    const conv = (await post(base, '/api/conversaciones', { cwd: home }, cookie)).json();
    const ruta = `/api/conversaciones/${conv.id}/mensajes`;
    const h = { cookie, origin: base, 'content-type': 'application/json' };
    const enorme = JSON.stringify({ texto: 'x', adjuntos: [{ nombre: 'a', datos: 'A'.repeat(MAX_CUERPO_MENSAJE) }] });
    assert.equal((await pedirCrudo(base, ruta, { cuerpo: enorme, headers: h })).status, 413);
    assert.equal((await pedirCrudo(base, ruta, { cuerpo: '{roto', headers: h })).status, 400);
    const muchos = Array(11).fill({ nombre: 'a.txt', datos: b64('x') });
    const r400 = await post(base, ruta, { texto: 'x', adjuntos: muchos }, cookie);
    assert.equal(r400.status, 400);
    assert.match(r400.json().error, /10/);
    assert.equal((await post(base, ruta, { texto: 'x', adjuntos: 'nada' }, cookie)).status, 400);
    const imagen = Buffer.concat([PNG, Buffer.alloc(5 * MB)]).toString('base64');
    const r413 = await post(base, ruta, { texto: 'x', adjuntos: [{ nombre: 'foto.png', datos: imagen }] }, cookie);
    assert.equal(r413.status, 413);
    assert.match(r413.json().error, /5 MB/);
    // Tras los rechazos, un envío normal sigue funcionando.
    assert.equal((await post(base, ruta, { texto: 'hola' }, cookie)).status, 202);
    assert.equal((await pedir(base, '/api/conversaciones', { headers: { cookie } })).status, 200);
  } finally { await srv.detener(); }
});
