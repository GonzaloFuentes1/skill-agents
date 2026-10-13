# Dashboard v2, entrega 2: Configuración, Agentes, Actividad rediseñada y endurecimiento

**Fecha:** 2026-10-13 · **Estado:** aprobada por instrucción del usuario ("entrega el producto completo") · **Mockup:** https://claude.ai/artifact/USYiSrfF94aGybRFiHST2t (pantallas Actividad, Agentes y Configuración) · **Base:** entrega 1 (`docs/specs/2026-10-12-dashboard-v2-design.md`, PR #3)

## 1. Alcance

1. **Actividad rediseñada (entrega 1.1).** Igual al mockup:
   - Tarjetas por agente con el color de su estado y un chip con su modelo, conectadas al orquestador por líneas del color de su estado.
   - Tarjeta viajera "Modelo · esfuerzo → Agente #n".
   - Lista de **Eventos** con etiquetas de color.
   - Columna de resumen con el costo ocultable, los límites (paralelo y Fable), el modelo pedido frente al real y la leyenda de colores.
   - La lógica de `estado-vista.js` (posiciones, reductor y animación) se conserva; solo cambia el render.
   - La cabecera muestra el chip del modelo del orquestador ("Opus").
2. **Pestaña Configuración.**
   - Modo automático: reglas propias, entorno de confianza, por defecto en el dashboard y en la terminal, "Revisar con Claude" y "Restablecer".
   - Límites, orquestador (modelos permitidos y permisos por defecto) y rúbrica de ruteo editable.
   - Visibilidad (mostrar costo y alertas de modelo), precios, ramas protegidas, puerto y modo remoto.
   - Barra de "cambios sin guardar".
3. **Pestaña Agentes.**
   - Catálogo de **56 agentes en 9 packs** que se activan y desactivan, cada uno con un prompt profesional.
   - Detalle de cada agente con su prompt completo.
   - Crear, editar y eliminar agentes personalizados con un prompt por secciones y el botón **"Redactar con Claude"**.
   - Lista de los agentes integrados y de los del plugin.
4. **Chat, mejoras:**
   - Tarjeta cuando el modo automático detiene una acción, con "Autorizar y reintentar".
   - Barreras humanas en ámbar con "Aprobar" y "Pedir cambios".
   - Renombrar la conversación.
   - Costo del propio orquestador en el resumen.
   - Mensajes encolados a mitad de turno.
5. **Endurecimiento:** los menores diferidos de la entrega 1 (sección 8).

Fuera de alcance: hablarles a los subagentes, el benchmark (Fase 3) y la sincronización entre máquinas.

## 2. Configuración (`~/.claude/orquestador/config.json`)

### 2.1 Claves

| Clave | Tipo / rango | Defecto | Efecto |
|---|---|---|---|
| `paraleloMax` | entero 1–8 | 4 | Ya existe; pre-agent la aplica |
| `fableMaxPorSesion` | entero 0–5 | 2 | Ya existe |
| `conversacionesMax` | entero 1–4 | 2 | Ya existe |
| `modelosOrquestador` | subconjunto de haiku/sonnet/opus/fable, al menos 1 | `["opus","fable"]` | Ya existe (status line) |
| `modoPermisoDefecto` | `preguntar`/`ediciones`/`auto` | `preguntar` | Modo inicial de las conversaciones nuevas del dashboard (el diálogo "Nueva conversación" lo preselecciona) |
| `alBloquear` | `preguntar`/`denegar` | `preguntar` | Qué hace el chat cuando el modo automático detiene una acción (sección 4.2) |
| `mostrarCosto` | booleano | `true` | Oculta el costo en el dashboard **y en la status line** (fuente de verdad; la preferencia local de la entrega 1 pasa a ser solo un atajo de sesión) |
| `alertasModelo` | booleano | `true` | Si es false, SubagentStop no emite el `systemMessage` de alerta; el evento `alerta` se sigue registrando |
| `rubrica` | 6 filas `{clase, modelo, esfuerzo}` | la tabla de la skill | SessionStart la inyecta como contexto (sección 2.2) |
| `precios`, `ramasProtegidas`, `puertoDashboard`, `remoto` | como hoy | como hoy | Se editan desde la UI |

### 2.2 Validación, guardado y rúbrica

- **Validación:** `validarConfig(parcial)` valida los tipos y rangos, y devuelve los errores por campo.
- **Guardado:** `guardarConfig(config)` escribe de forma atómica. Se escriben solo las claves conocidas y se conservan las desconocidas.
- **Rúbrica editable:** las clases son fijas y en este orden: Mecánica, Producción acotada, Síntesis y análisis, Juicio experto, Problema abierto, Máxima consecuencia. El usuario cambia el modelo y el esfuerzo de cada una.
  - Si la rúbrica difiere de la de fábrica, `session-start.mjs` agrega al contexto una tabla Markdown con el texto "Rúbrica personalizada del usuario (manda sobre la de la skill)".
  - La skill `orquestar` dice: "si el contexto de inicio trae una rúbrica personalizada, úsala".

## 3. Modo automático (`~/.claude/settings.json`, sección `autoMode`)

Hechos de la documentación oficial, verificados el 2026-10-13 en https://code.claude.com/docs/en/auto-mode-config y en permission-modes:

- `autoMode` admite `environment`, `allow`, `soft_deny` y `hard_deny` (arreglos de strings en prosa) y el booleano `classifyAllShell`.
- Un arreglo propio **reemplaza** el de fábrica, salvo que incluya el string literal `"$defaults"`, que inserta las reglas de fábrica en esa posición.
- `autoMode` **solo se lee desde `~/.claude/settings.json`**, managed settings o `--settings`. No se lee desde `.claude/` del proyecto.
- `permissions.defaultMode: "auto"` en settings de usuario hace que las sesiones de la terminal empiecen en auto.
- `claude auto-mode config` imprime la configuración efectiva en JSON, `claude auto-mode defaults` imprime la de fábrica, `claude auto-mode critique` pide a una IA una opinión sobre las reglas propias y `claude auto-mode reset -y` borra la sección.
- En `-p`, las denegaciones del clasificador llegan como mensajes `system` con subtipo `permission_denied`, y en `permission_denials` del `result`.

### 3.1 Qué escribe el dashboard

`automodo.mjs` escribe siempre así:
- `environment: ["$defaults", ...entorno]`;
- `allow: ["$defaults", ...permitir]`;
- `soft_deny: ["$defaults", ...detener]`;
- `classifyAllShell` según el interruptor.

Reglas:
- **Nunca toca `hard_deny`.**
- Antes de escribir, copia el archivo a `settings.json.orquestador.bak`.
- Conserva todas las demás claves. Tolera BOM y respeta la indentación de 2 espacios.
- Si el JSON existente es inválido, no escribe y devuelve el error.

### 3.2 Entorno de confianza

La UI tiene tres campos: repos, dominios y organización. Se convierten en entradas en prosa con el formato de la doc:
- `Source control: github.com/GonzaloFuentes1/*`
- `Trusted internal domains: …`
- `Organization: …`

Al leer, el parseo es inverso: las entradas que no siguen esos prefijos se muestran como "otras" y se conservan sin cambios.

### 3.3 Lectura

`GET /api/automodo` devuelve:
- `{ personalizadas: {permitir, detener, entorno, otrasEntorno}, classifyAllShell, conteosFabrica: {allow, soft_deny, hard_deny}, defaultModeTerminal, disponible }`.
- Los conteos salen de `claude auto-mode defaults` (local, no gasta uso; se cachean 10 min).
- Si el binario no está, `disponible: false` y la sección se muestra deshabilitada con el motivo.

### 3.4 Acciones

| Acción | Detalle |
|---|---|
| "Revisar mis reglas con Claude" | `claude auto-mode critique` (gasta uso: la UI lo advierte y pide confirmación; timeout de 120 s). Muestra la salida en un panel |
| "Restablecer de fábrica" | Diálogo de confirmación, luego `claude auto-mode reset -y` |
| "Ver reglas de fábrica" | Lista plegable con la etiqueta (el texto antes de ":") de cada regla de fábrica por categoría |
| "También en la terminal" | Escribe `permissions.defaultMode: "auto"` (o lo quita, quedando la conducta de fábrica) en settings de usuario, con el mismo respaldo |

## 4. Chat

### 4.1 Costo y mensajes encolados

- **Costo del orquestador:** `total_cost_usd` es acumulado por proceso (la sonda lo confirmó: 0,00336 y luego 0,00370). El gestor guarda `costoUSD = costoAnterior + total_cost_usd_del_proceso_actual` y suma el del proceso al terminarlo. El resumen muestra "Orquestador" y "Agentes" por separado, más el total, todo ocultable.
- **Mensajes encolados:** si `result.queued_turn_count > 0`, la conversación sigue en `trabajando`.

### 4.2 Denegaciones del modo automático

- El normalizador mapea `system` `permission_denied` a `{tipo:'denegado', herramienta, entrada, motivo}`, con extracción tolerante de `tool_name|tool`, `tool_input|input` y `reason|message|decision_reason`.
- El chat muestra una tarjeta ámbar: "El modo automático detuvo **Bash**: <motivo>", con el resumen de la entrada.
- Con `alBloquear: 'preguntar'`, la tarjeta trae el botón **"Autorizar y reintentar"**. Envía el mensaje `Autorizo explícitamente esta acción: <herramienta> <resumen>. Hazla.`, porque según la doc la intención explícita del usuario anula un `soft_deny`. Con `'denegar'` solo informa.

### 4.3 Barreras humanas y renombrar

- **Barreras humanas:** si el último mensaje del asistente de un turno terminado contiene un plan aprobado previamente (hay un mensaje `Apruebo el plan.` antes), termina en `?` y el plan tiene una etapa con barrera `humana` en curso o la siguiente en cola, el chat muestra bajo ese mensaje una franja ámbar "Barrera: <criterio>" con **Aprobar** (envía `Apruebo, continúa.`) y **Pedir cambios** (llena el composer).
- **Renombrar:** el título de la cabecera se edita en el lugar (Enter guarda, Escape cancela) y usa `POST /titulo`.

## 5. Agentes

### 5.1 Catálogo

- **Ubicación:** `plugins/orquestador/catalogo/<pack>/<id>.md`, más `catalogo/packs.json` con `[{id, nombre, descripcion, agentes:[id…]}]`.
- **Activar** un agente copia el archivo a `~/.claude/agents/<id>.md`, agregando al final del cuerpo el marcador `<!-- orquestador:catalogo id=<id> version=<versión del plugin> -->`.
- **Desactivar** borra el archivo solo si tiene el marcador.
- **Colisión:** si existe `~/.claude/agents/<id>.md` sin marcador, la activación se rechaza con 409 y el mensaje "Ya tienes un agente propio llamado <id>".
- Activar o desactivar un **pack** aplica la misma operación a todos sus agentes y devuelve el resultado por agente.
- Un agente activado con una versión anterior se marca "Actualización disponible", y activarlo de nuevo lo reemplaza.
- Los agentes activados aparecen en la siguiente sesión de Claude Code. La UI lo indica: "Disponible en sesiones nuevas".

### 5.2 Los 56 agentes

**Packs** (id de pack: agentes):

| Pack | Agentes |
|---|---|
| `investigacion` | investigador, analista-literatura, verificador-hechos, investigador-mercado, investigador-tecnico, sintetizador |
| `datos` | analista-datos, limpiador-datos, estadistico, visualizador-datos, ingeniero-datos, analista-sql |
| `ml` | cientifico-ml, ingeniero-ml, evaluador-modelos, investigador-rl, optimizador-hiperparametros, ingeniero-mlops, critico-papers |
| `ingenieria` | arquitecto, implementador, depurador, revisor-codigo, tester, refactorizador, optimizador-rendimiento, documentador-codigo, migrador |
| `diseno` | disenador-ui, disenador-visual, ingeniero-frontend, auditor-accesibilidad, redactor-ux, disenador-sistemas |
| `infra` | ingeniero-devops, ingeniero-cloud, auditor-seguridad, revisor-dependencias, administrador-bd, ingeniero-sre |
| `escritura` | redactor, editor, traductor, redactor-tecnico, redactor-academico, comunicador |
| `negocio` | estratega, analista-financiero, product-manager, investigador-usuarios, analista-competencia, redactor-propuestas |
| `operacion` | verificador, extractor, planificador, organizador-archivos |

**Formato de cada archivo:**
- Frontmatter: `name` (= id), `description` (una o dos frases: qué hace y **cuándo usarlo y cuándo no**, sin solaparse con los demás), `model`, `effort` según la rúbrica, `tools` (lista mínima necesaria) y `color`.
- Cuerpo en español:
  - `Persona: …`;
  - las secciones `## Rol`, `## Método` (pasos numerados), `## Entregable`, `## Restricciones` y `## Formato de retorno` (máximo de unas 300 palabras y estructura fija);
  - `## REGLAS CRÍTICAS` con: sin coautoría de IA; no inventar fuentes ni datos; no hacer commits ni push (eso es del Guardián Git); respetar los permisos; responder en español.

**Tests** (`tests/catalogo.test.mjs`):
- 56 agentes y 9 packs, con ids únicos y sin chocar con agentes del plugin ni integrados.
- `name` igual al nombre del archivo y frontmatter válido.
- `model` en {haiku, sonnet, opus, fable, inherit} y `effort` válido.
- Las secciones obligatorias presentes, un cuerpo de entre 120 y 600 palabras y descriptions distintas entre sí.

### 5.3 Agentes personalizados

- **Dónde viven:** en `~/.claude/agents/<id>.md` sin marcador (alcance usuario) o en `<cwd>/.claude/agents/<id>.md` (alcance proyecto, solo si hay una conversación abierta, usando su `cwd`).
- **Validación:** el id debe ser kebab de 3–40 caracteres. No puede chocar con un agente del catálogo, del plugin ni con uno integrado. Al crear, no se sobrescribe.
- **El formulario** construye el archivo con el mismo formato del catálogo, a partir de los campos y las 5 secciones.
- **Editar** solo se permite en personalizados y reescribe el archivo, con un `.bak` del anterior. **Eliminar** pide confirmación y borra.
- **"Redactar con Claude":**
  - Comando: `claude -p --model sonnet --tools "" --no-session-persistence --output-format json --json-schema <schema de las 5 secciones>`, con el prompt de redacción (nombre, cuándo usarlo, modelo, herramientas, y "escribe en español, profesional, sin relleno").
  - Gasta uso: la UI lo indica junto al botón. Timeout de 90 s.
  - La respuesta se toma de `structured_output` o, si no está, del `result` parseado como JSON.
  - Si falla, muestra el error y deja los campos como estaban.

### 5.4 Listado

`GET /api/agentes` devuelve:
- `{ packs:[{id,nombre,descripcion,activos,total,agentes:[{id,nombre,description,model,effort,tools,estado:'activo'|'inactivo'|'actualizable'|'conflicto'}]}], plugin:[…], integrados:[…], personalizados:[{…, alcance}] }`.
- `GET /api/agentes/:origen/:id` devuelve el detalle con el prompt completo. Los integrados se marcan como "prompt de Anthropic, no visible".

## 6. API nueva

Todas siguen las reglas de auth de la entrega 1: cookie, `Origin` en los POST, cuerpo máximo de 64 KB y errores con `ErrorConversacion`.

| Método y ruta | Uso |
|---|---|
| `GET /api/config` · `POST /api/config` `{parcial}` | Leer y guardar la configuración (400 con `{errores:{campo:msg}}`) |
| `GET /api/automodo` · `POST /api/automodo` `{permitir, detener, entorno, classifyAllShell, defaultModeTerminal}` | Modo automático |
| `POST /api/automodo/critica` · `POST /api/automodo/restablecer` | Acciones (la segunda exige `{confirmar:true}`) |
| `GET /api/automodo/fabrica` | Etiquetas de las reglas de fábrica por categoría |
| `GET /api/agentes` · `GET /api/agentes/:origen/:id` | Catálogo y detalle |
| `POST /api/agentes/packs/:pack` `{activo}` · `POST /api/agentes/catalogo/:id` `{activo}` | Activar o desactivar |
| `POST /api/agentes/personalizados` · `POST /api/agentes/personalizados/:id` · `POST /api/agentes/personalizados/:id/eliminar` | Crear, editar y eliminar (`{alcance, conversacion?}` para proyecto) |
| `POST /api/agentes/redactar` `{nombre, descripcion, modelo, herramientas}` | Borrador del prompt |

Las rutas de agentes de la entrega 1 (`/api/agentes/:session/:agentId/pasos`) se mantienen. Las nuevas se distinguen por el segundo segmento: `packs`, `catalogo`, `personalizados` y `redactar`, o `GET /api/agentes` sin más segmentos. Para evitar ambigüedades, las rutas de pasos se mueven a `/api/pasos/:session/:agentId` y se ajusta app.js.

Todos los procesos `claude` auxiliares (`auto-mode`, `redactar`) usan `resolverBinario` y `ORQUESTADOR_CANAL` vacío, y los tests usan un binario falso.

## 7. Frontend

- **Pestañas:** Chat, Actividad, Agentes y Configuración, como en el mockup. Mismo tema y colores con significado. Sin `innerHTML`. Objetivos de al menos 44 px. Sin scroll horizontal entre 390 y 1440 px.
- **Archivos nuevos:** `config-vista.js` (reductor puro del formulario, con el estado de cambios sin guardar), `configuracion.js` (render), `agentes-catalogo.js` (render del catálogo, el detalle y el formulario) y `actividad.js` (render rediseñado).
- **Configuración:** reproduce el mockup:
  - primero la sección "Modo automático", con los tres conteos (Pasa solo / Se detiene / Nunca), el interruptor por defecto, "Cuando el clasificador detiene una acción", el entorno de confianza, las listas de reglas con su campo de alta y sus botones, y "Revisar" y "Restablecer";
  - después Límites (con − y +), Orquestador, Rúbrica (botones segmentados por modelo con el color de cada familia y por esfuerzo), Visibilidad (interruptores), Precios (tabla) y Git y Dashboard;
  - una barra ámbar de "cambios sin guardar" con Descartar y Guardar;
  - navegación lateral por secciones.
- **Agentes:** reproduce el mockup:
  - las tarjetas se agrupan por pack, cada pack con un interruptor "Activar pack" y su contador (activos/total), y cada tarjeta con su interruptor;
  - el panel derecho muestra el detalle (prompt completo, Duplicar como personalizado, Editar o Eliminar si es propio) o el formulario Nuevo Agente;
  - el formulario tiene nombre, cuándo usarlo, modelo, esfuerzo, herramientas, alcance, las 5 secciones y "Redactar con Claude";
  - un filtro de texto arriba del catálogo.

## 8. Endurecimiento (menores diferidos de la entrega 1)

- **auth:**
  - IPv6 con y sin corchetes en `sinPuerto` y en Host.
  - `TODAS` reconoce `0:0:0:0:0:0:0:0` y `[::]`.
  - `hostsPermitidos` ignora las entradas vacías.
  - Se poda el mapa de intentos.
  - El canje solo se acepta con GET.
- **server:**
  - Un `%` mal formado da 400.
  - Un cuerpo JSON que no es un objeto plano da 400.
  - `detener` vacía los clientes y quita el listener.
  - `HEAD` en los estáticos.
- **proceso:**
  - Se vacía `resto` al cerrar.
  - `responderPermiso` con un id desconocido no envía nada.
- **gestor:**
  - Un mensaje enviado mientras un proceso se cierra espera la `salida` y abre uno nuevo.
  - Un `fin-turno` que llega con `cerrando` activo se ignora.
  - El JSON corrupto se respalda en `.corrupto` antes de empezar de cero.
  - `ramaDe` es asíncrono y se refresca al abrir la conversación.
- **frontend:**
  - `resumenEntrada(null)` no falla.
  - No se generan `div.texto` vacíos.
  - El resultado de una herramienta se recorta.
  - "⚠ Desconocido" pasa a mostrar el valor crudo.
  - `#demo` y los checkboxes llegan a 44 px.
  - `sin-animacion` se acota a la vista Actividad.
  - El render inicial no pisa `sinSesion()`.
- **tests:**
  - El test inefectivo de "no cierra un proceso que trabaja" queda corregido.
  - Hay tests HTTP de `titulo`, `interrumpir`, `cerrar`, `carpetas`, 405 y JSON mal formado.
  - Hay tests de `fin` con transcript y de `agente-inicio` en una delegación externa.

## 9. Seguridad

Escribir `~/.claude/settings.json` y `~/.claude/agents/` desde el dashboard amplía lo que puede hacer quien tenga la cookie. Se mantiene el modelo de amenaza de la entrega 1 (token, cookie, Origin y Host) y se agrega:
- respaldo antes de cada escritura;
- validación estricta de ids y rutas, con todas las rutas construidas en el servidor y nunca tomadas de la petición;
- `hard_deny` y `permissions.allow/deny` nunca se tocan;
- `auto-mode reset` y eliminar un agente exigen `{confirmar:true}`.

## 10. Pruebas

- Ninguna prueba gasta uso.
  - Los procesos `claude` auxiliares usan un binario falso: `tests/fixtures/claude-falso-cli.mjs` responde a `auto-mode config|defaults|critique|reset` y a `-p --json-schema`.
  - El home se redirige con `CLAUDE_CONFIG_DIR` y `ORQUESTADOR_HOME` a directorios temporales.
- Los reductores puros se prueban en Node: config-vista, el render de la tarjeta de denegación y el estado del catálogo.
- La suite debe pasar en Ubuntu y Windows. La prueba manual final incluye las pantallas nuevas.
