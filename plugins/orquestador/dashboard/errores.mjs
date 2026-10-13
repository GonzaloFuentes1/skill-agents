// Error con código HTTP que el servidor devuelve tal cual. Lo usan conversaciones, adjuntos y server.
export class ErrorConversacion extends Error {
  // extra: datos que acompañan al error en la respuesta JSON (p. ej. { errores: { campo: mensaje } }).
  constructor(status, mensaje, extra = null) { super(mensaje); this.status = status; this.extra = extra; }
}
