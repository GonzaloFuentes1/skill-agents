# Dashboard v2: chat con el orquestador (entrega 1)

**Fecha:** 2026-10-12 · **Estado:** propuesta, pendiente de revisión · **Mockup aprobado:** https://claude.ai/artifact/USYiSrfF94aGybRFiHST2t (privado)

## 1. Qué se construye

Hoy el dashboard solo lee `events.jsonl` y muestra la animación "orquestador al centro". Esta entrega lo convierte en la ventana principal de trabajo:

1. **Chat con un orquestador que vive en el dashboard.** El servidor levanta y mantiene sesiones propias de Claude Code. Estas sesiones usan la cuenta del usuario a través del binario `claude` ya logueado y tienen el plugin cargado.
2. **Permisos con botones** en el chat: Permitir, Permitir siempre en esta conversación y Denegar. Hay un selector de modo (Preguntar, Aceptar ediciones o Auto) por conversación.
3. **Varias conversaciones con historial.** Cada una tiene su carpeta y se puede retomar, porque son sesiones normales de Claude Code y también aparecen en `claude --resume`.
4. **Detalle en vivo de cada agente**, en modo solo lectura: meta, modelo pedido frente al real, tiempo, tokens y un timeline de pasos (razonamiento visible, herramientas con sus argumentos y resultados resumidos).
5. **Planes en pipeline.** Antes de una tarea grande, el orquestador propone etapas con barreras de verificación y obstáculos previstos, y espera la aprobación del usuario.
6. **Rediseño visual** según el mockup:
   - Tema oscuro por defecto, con opción de tema claro.
   - Las zonas de la pantalla separadas con contraste fuerte.
   - Nombres con mayúscula inicial y etiquetas técnicas entre corchetes (`[FEAT]`, `[CI]`).
   - Colores con significado.
   - Costo ocultable.
7. **Modo remoto.** Permite abrir el dashboard desde otro equipo o desde el celular, a través de una red privada como Tailscale, con un token. Viene apagado por defecto.

**Fuera de esta entrega** (entrega 2, con su propia spec): las pestañas **Configuración** (incluida la del modo automático) y **Agentes** (el catálogo de 18 agentes y la creación de agentes personalizados), además de la rúbrica editable. **Fuera del todo:** hablarles a los subagentes, detenerlos uno por uno y conectarse a una sesión abierta en la terminal.

### Criterios de éxito

- Desde `/orquestador:dashboard` se puede crear una conversación en una carpeta, chatear, aprobar o denegar permisos y ver a los agentes trabajar, sin abrir la terminal.
- Cerrar el navegador no mata las conversaciones. Al volver, el historial y el estado se ven completos.
- Cerrar el servidor deja las sesiones retomables con `claude --resume <id>`.
- Toda la suite pasa en Ubuntu y Windows sin gastar uso de la cuenta. Las pruebas usan un `claude` falso.
- Ninguna petición que modifique estado se acepta sin token y sin un `Origin` permitido.

## 2. Supuestos que se verifican primero (spike)

El diseño depende de un protocolo que no está documentado en este repo. La **tarea 1 del plan** es un script de sondeo (`bench/sondas/stream-json.mjs`) que hace una sola llamada corta con la cuenta del usuario, la corre él mismo y deja anotados los hallazgos en `docs/specs/hallazgos-stream-json.md`:

| Supuesto | Plan B si falla |
|---|---|
| `claude -p --input-format stream-json --output-format stream-json --verbose --include-partial-messages` acepta varios mensajes de usuario por stdin en un mismo proceso | Un proceso por turno con `--resume <id>` (más lento, pero funciona) |
| `--permission-prompts host` envía solicitudes `control_request` (`can_use_tool`) por stdout y espera la `control_response` por stdin | Un servidor MCP propio y mínimo (stdio, sin dependencias) registrado con `--permission-prompt-tool` |
| Existen los controles `interrupt` y `set_permission_mode` | Interrumpir = matar el proceso y retomar con `--resume`. Cambiar de modo = reiniciar el proceso con `--resume` y el modo nuevo |
| En modo `auto`, una acción que el clasificador detiene llega al host como solicitud de permiso | Se informa como denegada en el chat, con un botón "Reintentar con permiso" que reenvía en modo Preguntar |
| Los hooks del plugin corren igual en `-p` | Ya está comprobado en la Fase 1 (`hallazgos-hooks.md`); solo se confirma |

El resto de la spec usa la versión "plan A". Si un supuesto falla, cambia solo el módulo `proceso-claude.mjs`, que esconde el protocolo detrás de una interfaz fija (sección 4.2).

## 3. Arquitectura

```
Navegador (pestañas Chat · Actividad)
   │  GET estáticos, GET /api/*, SSE /eventos
   │  POST /api/* (token + Origin)
   ▼
dashboard/server.mjs ── auth.mjs (token, Origin, Host, modo remoto)
   ├─ datos.mjs              (ya existe: sigue events.jsonl)
   ├─ conversaciones.mjs     (registro + ciclo de vida, persiste en conversaciones.json)
   │     └─ proceso-claude.mjs  (spawn de `claude -p` stream-json; protocolo detrás de una interfaz)
   ├─ pasos-agente.mjs       (lee el transcript de un subagente → pasos)
   └─ historial.mjs          (reconstruye el chat desde el transcript de la sesión)
Hooks del plugin (ya existen) → events.jsonl → SSE (sin cambios de formato salvo 4.5)
```

Las reglas del repo se mantienen: Node 20 o superior, `.mjs`, **cero dependencias**, todo en español y funcionamiento en Windows y Linux.

## 4. Componentes

### 4.1 `conversaciones.mjs`: registro y ciclo de vida

- **Persistencia** en `~/.claude/orquestador/conversaciones.json`, con la forma `[{ id, sessionId, titulo, cwd, rama, modo, creada, ultima, estado }]`. La escritura es atómica: se escribe en un temporal y luego se renombra.
- **Valores de `estado`:**
  - `inactiva`: sin proceso vivo.
  - `lista`: el proceso está vivo y esperando.
  - `trabajando`: hay un turno en curso.
  - `esperando-permiso`: hay solicitudes pendientes.
  - `error`: el proceso terminó con un código distinto de 0. Se guarda el mensaje de error.
- **Operaciones:**
  - `crear({ cwd, modo })` valida que `cwd` exista y sea un directorio.
  - `enviar(id, texto)` levanta el proceso si está inactivo (con `--resume sessionId`).
  - `responderPermiso(id, solicitudId, decision)` acepta `permitir`, `siempre` o `denegar`.
  - `cambiarModo(id, modo)`, `interrumpir(id)`, `cerrar(id)` y `renombrar(id, titulo)`.
- **Tope de conversaciones** activas a la vez: `conversacionesMax` en `config.json`, con valor por defecto 2. Si se supera, `enviar` responde `409` con el mensaje "Hay N conversaciones trabajando; espera o detén una".
- **"Permitir siempre en esta conversación"** queda como una regla en memoria del servidor por conversación, de la forma `{ herramienta, patrón }`. Para Bash el patrón es el comando exacto, y para Edit y Write es la ruta exacta. Esas solicitudes se responden solas. Las reglas no se escriben en `settings.json`.
- **Título:** son los primeros 60 caracteres del primer mensaje, editable. La **etiqueta entre corchetes** sale de la rama actual de `cwd`: el prefijo `tipo/` en mayúsculas (`feat/x` da `[FEAT]`). Para títulos que empiezan con `ci:`, `fix:`, etc., la etiqueta sale de ese prefijo.
- **Apagado:** al apagarse el servidor, cada proceso recibe `interrumpir` y luego se termina tras 3 s. Las sesiones quedan retomables.
- **Procesos huérfanos:** si el servidor se cae, el próximo arranque marca como `inactiva` toda conversación con un `pid` que ya no existe.

### 4.2 `proceso-claude.mjs`: el único módulo que conoce el protocolo

Expone esta interfaz:

```js
const p = abrirProceso({ cwd, sessionId?, modo, binario, env, spawnFn });
p.enviar(texto); p.responderPermiso(solicitudId, { permitir, mensaje? });
p.cambiarModo(modo); p.interrumpir(); p.cerrar();
p.on('evento', (e) => …);  // eventos normalizados (abajo)
```

**Eventos normalizados**, que son lo único que ve el resto del sistema:

| Evento | Campos |
|---|---|
| `sesion` | `sessionId`, `modelo` |
| `texto-parcial` | `mensajeId`, `delta` |
| `mensaje` | `mensajeId`, `rol`, `bloques` (texto, herramienta, resultado) |
| `herramienta` | `usoId`, `nombre`, `entrada` |
| `permiso` | `solicitudId`, `herramienta`, `entrada`, `motivo?` |
| `fin-turno` | `ok`, `costoUSD?`, `duracionMs`, `error?` |
| `salida` | `codigo` |

- **Binario:** `config.rutaClaude` si está definido. Si no, se busca `claude` en el `PATH` (en Windows, `claude.exe`; si solo hay `claude.cmd`, se ejecuta con `shell: true` y los argumentos escapados).
- **Entorno del proceso hijo:** se le agrega `ORQUESTADOR_CANAL=dashboard`. El hook `SessionStart` lo detecta y agrega como contexto las instrucciones de canal (sección 4.6).
- **Robustez:** las líneas de stdout que no son JSON se descartan y se cuentan en un registro de depuración. Un JSON parcial espera a la siguiente línea, igual que en `datos.mjs`.
- **Pruebas:** `spawnFn` se puede inyectar. Los tests usan `tests/fixtures/claude-falso.mjs`, un script que reproduce guiones JSONL (texto, herramienta, permiso, fin) y registra lo que recibe por stdin.

### 4.3 API HTTP

Todas las rutas bajo `/api` responden JSON. Las de modificación de estado son `POST` y exigen auth (sección 4.7).

| Método y ruta | Uso |
|---|---|
| `GET /api/conversaciones` | Lista para la barra lateral |
| `POST /api/conversaciones` `{cwd, modo}` | Crea una conversación |
| `GET /api/conversaciones/:id/historial` | Mensajes reconstruidos (sección 4.4) + estado + permisos pendientes |
| `POST /api/conversaciones/:id/mensajes` `{texto}` | Envía un mensaje |
| `POST /api/conversaciones/:id/permisos/:sid` `{decision}` | Responde un permiso |
| `POST /api/conversaciones/:id/modo` `{modo}` | Cambia el modo de permisos |
| `POST /api/conversaciones/:id/interrumpir` | Detiene el turno en curso |
| `POST /api/conversaciones/:id/cerrar` | Cierra el proceso (el historial queda) |
| `GET /api/agentes/:session/:agentId/pasos?desde=<offset>` | Pasos del subagente desde un offset de bytes |
| `GET /api/carpetas?prefijo=` | Autocompletado de carpetas para "Nueva conversación" (solo directorios, sin contenido) |

Lo que ya existe se mantiene: `/eventos` (SSE), `/sesiones`, `/estado` y `/salud`. El SSE suma eventos con el prefijo `chat:` (`chat:texto-parcial`, `chat:mensaje`, `chat:permiso`, `chat:estado`), cada uno con su `conversacion`. Estos eventos no se guardan en `events.jsonl` (viven en memoria y se reconstruyen desde el transcript) para no inflar el log.

### 4.4 `historial.mjs`

Busca el transcript de la sesión, que es `<sessionId>.jsonl` dentro de `~/.claude/projects/*/`, y lo convierte en mensajes de chat: usuario, texto del asistente, herramientas agrupadas y bloques de plan. Lee como máximo los últimos 4 MB. Si el transcript no está, devuelve el historial vacío con el aviso "No se encontró el transcript".

### 4.5 Detalle de agente: `pasos-agente.mjs`

- El hook `SubagentStart` emite siempre un evento `agente-inicio` con `{ id, agentId, transcript }`. La ruta del transcript se calcula como `<dirname(transcript_path)>/<session_id>/subagents/agent-<agent_id>.jsonl`, que es el patrón observado. Si `SubagentStop` informa otro `agent_transcript_path`, ese manda.
- `GET …/pasos?desde=` lee de forma incremental y devuelve `{ pasos, siguiente }`. Cada paso es `{ tipo: pensando|texto|herramienta|resultado, hora, resumen, detalle, ok? }`. Los resúmenes por herramienta son estos:
  - Read, Edit y Write: la ruta (más `+N −M` líneas en Edit).
  - Bash: el comando.
  - Grep y Glob: el patrón.
  - Web: la URL o la consulta.
  - Resultado: `ok` o `error` + la primera línea, con un máximo de 200 caracteres.
- El panel consulta cada 1 s mientras está abierto y el agente sigue activo, y deja de hacerlo al cerrarse o cuando el agente termina.
- Si el razonamiento llega vacío o redactado, el paso `pensando` se omite.

### 4.6 Planes en pipeline

- **Formato:** cuando corre en el canal dashboard, el orquestador presenta los planes en un bloque cercado ```` ```orquestador-plan ```` con un JSON validado en ambos lados:

  ```json
  { "titulo": "…", "etapas": [ { "id": "E1", "titulo": "Entender", "meta": "…",
      "agentes": [ { "tipo": "Explore", "modelo": "haiku", "esfuerzo": "low" } ],
      "barrera": { "tipo": "auto|humana", "criterio": "…" } } ],
    "riesgos": [ { "titulo": "…", "planB": "…" } ] }
  ```

- **Cuándo se presenta un plan:** la skill `orquestar` agrega la regla. Corresponde si la tarea requiere 3 o más delegaciones, o si incluye una acción irreversible. Después de presentarlo, el orquestador **termina el turno y espera**.
- **En la terminal**, sin `ORQUESTADOR_CANAL`, el mismo plan se presenta como una tabla en Markdown.
- **Botones:** "Aprobar y Ejecutar" envía el mensaje `Apruebo el plan.` y "Pedir Cambios" abre el composer con el prefijo `Cambios al plan: `.
- **Progreso en vivo:** al delegar, el orquestador antepone el id de la etapa a la meta (`E3 · Verificadores de CSV`). El dashboard asigna cada delegación a su etapa por ese prefijo. Una etapa queda en estado *trabajando* si tiene delegaciones activas, *lista* si todas terminaron y *en cola* en otro caso.
- **Barreras:**
  - Las automáticas las cumple el agente **Verificador**. Mientras no exista (entrega 2), las cumple el propio orquestador, que corre los comandos de verificación y responde `APROBADO` o `RECHAZADO` con la evidencia.
  - Las barreras humanas son un turno que termina con una pregunta. El dashboard las muestra en ámbar con los botones Aprobar y Pedir cambios.
- **Si el JSON es inválido**, se muestra como texto normal y se registra un aviso. El plan nunca rompe el chat.

### 4.7 Seguridad y modo remoto: `auth.mjs`

Ahora el dashboard puede ejecutar código, y eso cambia el modelo de amenaza.

- **Token:** se genera al arrancar con `crypto.randomBytes(32)` y se guarda en `~/.claude/orquestador/token`. En POSIX el archivo queda con permisos `0600`; en Windows se depende del ACL del perfil del usuario.
- **Uso local:**
  - `lanzar.mjs` abre `http://127.0.0.1:<puerto>/?t=<token>`.
  - El servidor cambia ese token por una cookie `HttpOnly; SameSite=Strict` y redirige sin el token en la URL.
  - Todo `POST` exige la cookie y además un `Origin` igual al host servido.
  - Las peticiones `GET` de datos (`/api/*`, `/eventos`, `/sesiones` y `/estado`) también exigen la cookie, porque exponen el contenido de las conversaciones. Solo `/salud` y los estáticos quedan abiertos.
- **Modo remoto** (`config.remoto = { activo: false, escuchar: "127.0.0.1", hostsPermitidos: [] }`):
  - Al activarlo, el servidor escucha en la IP configurada (por ejemplo, la IP de Tailscale) y acepta solo los `Host` de `hostsPermitidos`.
  - El acceso inicial necesita el token, que se muestra con `/orquestador:dashboard --remoto`.
  - El servidor **se niega a arrancar** si `escuchar` es `0.0.0.0` o `::` sin `hostsPermitidos`.
  - La cookie en remoto lleva `Secure` cuando hay HTTPS (por ejemplo, `tailscale serve`).
- **Límites:** máximo 10 intentos fallidos de token por minuto por IP. Después de eso se responde `429`.
- **Lo que no cambia:** las respuestas `403` por Host no permitido y los `405` siguen igual.

### 4.8 Frontend

Se mantiene sin frameworks ni dependencias, con módulos ES servidos como estáticos. El servidor pasa de una tabla fija a una lista de archivos permitidos dentro de `public/`, con tipos por extensión.

| Archivo | Responsabilidad |
|---|---|
| `index.html` | Estructura: barra lateral, cabecera con pestañas y zona principal |
| `tema.css` | Tokens de color (oscuro y claro), tipografía y colores con significado |
| `app.js` | Router de pestañas, conexión SSE, token y preferencias locales |
| `chat.js` + `chat-vista.js` | Composer, mensajes y tarjetas de permiso. `chat-vista.js` es un reductor puro (eventos → mensajes) que se prueba en Node |
| `plan.js` + `plan-vista.js` | Parse y validación de `orquestador-plan` y estado de las etapas (puro y probado) |
| `agentes-panel.js` | Lista lateral y panel de detalle con el timeline |
| `actividad.js` | La vista animada actual, portada al tema nuevo. `estado-vista.js` se conserva |

- **Colores con significado**, que son una sola fuente en `tema.css` y la misma leyenda en la UI:
  - **Estado:** trabajando = clay `#D97757`, requiere permiso = ámbar, listo = verde, en cola = gris, error o alerta = rojo.
  - **Modelo:** Haiku = turquesa, Sonnet = azul, Opus = violeta, Fable = magenta.
  - Los valores exactos para el tema oscuro y el claro son los del mockup.
- **Preferencias locales** (`localStorage`, envueltas en try/catch): tema, costo oculto y la última pestaña. En la entrega 2, "mostrar costo" pasa a `config.json`.
- **Accesibilidad:** elementos `<button>` y `<label>` reales, contraste de 4.5:1, foco visible y objetivos táctiles de al menos 44 px. Entre 390 px y 1440 px de ancho no hay scroll horizontal de página: en el celular, la barra lateral y el panel de agentes se convierten en cajones.

## 5. Flujo de datos de un turno

1. El navegador hace `POST /mensajes`. `conversaciones` levanta el proceso si hace falta y llama a `proceso.enviar`.
2. El proceso emite `texto-parcial`, que se reenvía por SSE como `chat:texto-parcial` y se pinta en vivo.
3. Cuando el orquestador delega, los hooks emiten `delegacion` y `agente-inicio` a `events.jsonl`. El SSE existente los reenvía, aparece la tarjeta del agente y, si tiene el prefijo `E#`, la etapa pasa a *trabajando*.
4. Si llega un `permiso`: con una regla "siempre" que coincide, se responde solo. Si no, va al SSE como `chat:permiso`, aparece la tarjeta ámbar y el botón responde con `POST /permisos/:sid`.
5. Con `fin-turno`, la conversación vuelve a `lista`, se actualiza `ultima` y el costo se suma al resumen (oculto si el usuario lo prefiere).

## 6. Errores

| Caso | Comportamiento |
|---|---|
| `claude` no está en el PATH | `POST /conversaciones` responde 500: "No encontré el binario de Claude Code; define rutaClaude en config.json" |
| La sesión no está logueada o el plan llegó a su límite | Se muestra el texto del error de `fin-turno` en un mensaje rojo. La conversación queda en `error` y se puede reintentar |
| El proceso muere a mitad de un turno | Estado `error` y botón "Retomar", que relanza con `--resume` |
| El permiso queda pendiente y el navegador se cierra | Queda pendiente en el servidor. Al volver, `historial` lo devuelve y la tarjeta reaparece |
| Se supera `conversacionesMax` | `409` con un mensaje claro |
| `cwd` no existe o no es un directorio | `400` |
| El transcript de un subagente no existe todavía | `pasos: []`, y el panel muestra "Esperando al agente…" |
| Se pierde el SSE | Reconexión automática (ya existe) y recarga del historial de la conversación abierta |

## 7. Pruebas

Ninguna prueba gasta uso de la cuenta. El protocolo real se valida solo con la sonda de la sección 2, que corre el usuario.

- `proceso-claude`: guiones con `claude-falso.mjs` para texto en partes, herramienta, permiso concedido o denegado, interrupción, salida con error y líneas basura.
- `conversaciones`: crear, persistir, retomar, tope, reglas "siempre", huérfanos al arrancar y apagado ordenado.
- `auth`:
  - Sin token hay 401.
  - Un token correcto entrega una cookie.
  - Un `POST` sin `Origin`, o con un `Origin` distinto, recibe 403.
  - El modo remoto se niega a arrancar con `0.0.0.0` sin hosts.
  - El límite de intentos responde 429.
- `historial` y `pasos-agente`: fixtures de transcripts reales anonimizados, incluido un JSON cortado y una línea con BOM.
- `chat-vista` y `plan-vista`: reductores puros (parciales que se arman, permisos que aparecen y se resuelven, plan válido, plan inválido y etapas por prefijo).
- Servidor: integración con `claude-falso` y un flujo completo `POST mensaje → SSE → permiso → fin`.
- Sigue existiendo `plugin-valido.test.mjs`. Se agrega la verificación de que todos los archivos de `public/` servidos están en la lista permitida.
- **Prueba manual final**, que hace el usuario: crear una conversación en un repo de prueba, pedir algo que delegue en 2 agentes y pida un permiso, aprobarlo y abrir el detalle de un agente.

## 8. Cambios fuera del dashboard

- `scripts/subagent-start.mjs`: emitir `agente-inicio` con la ruta del transcript.
- `scripts/session-start.mjs`: si `ORQUESTADOR_CANAL=dashboard`, agregar como contexto las instrucciones de canal (formato `orquestador-plan` y el prefijo `E#`).
- `skills/orquestar/SKILL.md`: la regla de cuándo presentar un plan, las barreras y los obstáculos.
- `scripts/lib/config.mjs`: los nuevos valores por defecto `conversacionesMax: 2`, `rutaClaude: null` y `remoto: { activo: false, escuchar: "127.0.0.1", hostsPermitidos: [] }`.
- `commands/dashboard.md` y `lanzar.mjs`: abrir con el token y agregar la opción `--remoto`.
- `README.md`: una sección corta sobre el chat del dashboard y el modo remoto, con sus advertencias de seguridad.

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| El protocolo stream-json cambia entre versiones de Claude Code | Está aislado en `proceso-claude.mjs`, con pruebas por guion; la versión mínima se registra en los hallazgos |
| Un dashboard expuesto equivale a ejecución remota de código | Token, cookie `SameSite=Strict`, `Origin`, lista de Host permitidos y modo remoto apagado por defecto, que se niega a escuchar en todas las interfaces sin hosts |
| Los procesos de `claude` quedan colgados | Apagado ordenado, limpieza de huérfanos al arrancar y botón "Cerrar" por conversación |
| El consumo del plan se multiplica con varias conversaciones | `conversacionesMax` y el tope de Fable existente |
| El transcript de un subagente está en otra ruta en versiones futuras | Si `SubagentStop` trae `agent_transcript_path`, ese manda. Si no se encuentra el archivo, el panel lo dice en vez de fallar |
