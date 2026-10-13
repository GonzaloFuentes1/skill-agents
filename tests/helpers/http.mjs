// Helpers HTTP/SSE para tests del servidor del dashboard (http.request permite fijar Host y Origin).
import { request } from 'node:http';

export function pedir(base, ruta, { metodo = 'GET', headers = {}, cuerpo } = {}) {
  return new Promise((ok, mal) => {
    const datos = cuerpo === undefined ? null : JSON.stringify(cuerpo);
    const req = request(base + ruta, { method: metodo, headers: { ...(datos ? { 'content-type': 'application/json' } : {}), ...headers } }, (res) => {
      let t = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { t += d; });
      res.on('end', () => ok({ status: res.statusCode, headers: res.headers, texto: t, json: () => JSON.parse(t) }));
    });
    req.on('error', mal);
    if (datos) req.write(datos);
    req.end();
  });
}

export async function login(base, token) {
  const r = await pedir(base, `/?t=${token}`);
  if (r.status !== 302) throw new Error(`login falló: ${r.status}`);
  return r.headers['set-cookie'][0].split(';')[0];
}

export const post = (base, ruta, cuerpo, cookie, origin = base) => pedir(base, ruta, { metodo: 'POST', cuerpo, headers: { cookie, origin } });

export function escucharSse(base, cookie, alEvento) {
  const req = request(base + '/eventos', { headers: { cookie } }, (res) => {
    let buf = '';
    res.setEncoding('utf8');
    res.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const bloque = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const ev = /^event: (.+)$/m.exec(bloque)?.[1];
        const data = /^data: (.+)$/m.exec(bloque)?.[1];
        if (ev && data) alEvento(ev, JSON.parse(data));
      }
    });
  });
  req.on('error', () => {});
  req.end();
  return req;
}

// Envía el cuerpo tal cual (sin JSON.stringify): para probar JSON mal formado o que no es un objeto.
export function pedirCrudo(base, ruta, { metodo = 'POST', cuerpo = '', headers = {} } = {}) {
  return new Promise((ok, mal) => {
    const req = request(base + ruta, { method: metodo, headers }, (res) => {
      let t = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { t += d; });
      res.on('end', () => ok({ status: res.statusCode, headers: res.headers, texto: t }));
    });
    req.on('error', mal);
    req.end(cuerpo);
  });
}
