# Dashboard v2, entrega 2: plan de implementación

> **Para agentes que ejecutan:** SUB-SKILL REQUERIDA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** completar el dashboard con las pestañas Configuración (incluido el modo automático) y Agentes (catálogo de 56 agentes en 9 packs y agentes personalizados), rediseñar la vista Actividad, sumar al chat las denegaciones del modo automático, las barreras humanas, el renombrado y el costo del orquestador, y cerrar los menores diferidos de la entrega 1.

**Arquitectura:** el backend suma módulos con una responsabilidad cada uno: `scripts/lib/archivos.mjs` (JSON del usuario con BOM, escritura atómica y respaldo), `config.mjs` (validar y guardar), `dashboard/cli-claude.mjs` (procesos `claude` auxiliares cortos), `dashboard/automodo.mjs` (sección `autoMode` de `~/.claude/settings.json`) y `dashboard/agentes.mjs` (catálogo, activación con marcador, personalizados y "Redactar con Claude"). `server.mjs` solo enruta. Todas las rutas a disco se construyen en el servidor a partir de ids validados. El frontend sigue sin frameworks: los reductores puros (`config-vista.js`, `agentes-vista.js` y las funciones nuevas de `chat-vista.js`, `plan-vista.js` y `estado-vista.js`) se prueban en Node, y los módulos de render (`configuracion.js`, `agentes-catalogo.js`, `actividad.js`, `chat.js`) solo arman nodos DOM.

**Stack:** Node ≥ 20 en módulos `.mjs` sin dependencias npm, `node --test`, HTML/CSS/JS sin build.

**Spec:** `docs/specs/2026-10-13-dashboard-v2-entrega-2-design.md`. Léela antes de empezar, junto con `docs/specs/hallazgos-stream-json.md`. El mockup aprobado (pantallas Actividad, Agentes y Configuración) está en https://claude.ai/artifact/USYiSrfF94aGybRFiHST2t.

**Validación previa del plan:** el código de las Tareas 1 a 12 se aplicó tal cual en una copia descartable del repo (Windows, Node 24):
- `node --test` dio 407 tests, `fail 0` y `todo 56`;
- `node --check` pasó en todo `public/`;
- todos los imports entre módulos resuelven;
- una prueba de humo en Chrome headless recorrió las 4 pestañas sin excepciones ni scroll horizontal en 390 y 1440 px.

Si un ancla de "reemplaza X por Y" no aparece literal en tu copia, alguien cambió ese archivo después del commit `d60066d`: revisa el diff antes de seguir.

## Restricciones globales

- Node ≥ 20, `.mjs`, **cero dependencias npm**. Solo `node:*`.
- Todo el texto visible, los comentarios y los mensajes de error van **en español**. Los nombres de agentes y modelos se muestran con mayúscula inicial (`Implementador`, `Sonnet`).
- Debe funcionar en **Windows y Linux**. CI corre `node --test` en `ubuntu-latest` y `windows-latest` con Node 20. Las rutas se arman siempre con `node:path`.
- **Ninguna prueba gasta uso de la cuenta.** El chat usa `tests/fixtures/claude-falso.mjs`; los procesos `claude` auxiliares (`auto-mode config|defaults|critique|reset` y `-p --json-schema`) usan `tests/fixtures/claude-falso-cli.mjs`. Los homes se redirigen a directorios temporales con `ORQUESTADOR_HOME` y `CLAUDE_CONFIG_DIR`; `~/.claude/agents` y `~/.claude/settings.json` se obtienen **siempre** con `rutaAgentesUsuario(env)` y `rutaSettingsUsuario(env)` de `scripts/lib/rutas.mjs`, que derivan de `CLAUDE_CONFIG_DIR`.
- Los resúmenes de `node --test` se citan como `fail N` y `todo N`. En la terminal aparecen como `ℹ todo N` y en CI (TAP) como `# todo N`. Mientras falten agentes del catálogo (Tareas 5 a 14), sus pruebas son `todo`: no fallan la suite.
- **Frontend sin `innerHTML`** ni recursos externos. Solo `textContent`, `setAttribute` y `replaceChildren`. Objetivos táctiles de **al menos 44 px**. **Sin scroll horizontal** de página entre 390 y 1440 px.
- Git: rama `feat/dashboard-v2-entrega-2`, Conventional Commits en español y **sin coautoría de IA** en commits ni PRs. Nunca `--no-verify`.
- Colores con significado (fuente única en `tema.css`, sin cambios): estado trabajando = `--activo`, requiere permiso = `--accion` (ámbar), listo = `--listo`, en cola = `--cola`, error = `--error`; modelo Haiku = `--haiku`, Sonnet = `--sonnet`, Opus = `--opus`, Fable = `--fable`.
- Claves nuevas de `~/.claude/orquestador/config.json` (spec §2.1), con estos rangos y defectos exactos:
  - `paraleloMax` entero 1–8 (4) · `fableMaxPorSesion` entero 0–5 (2) · `conversacionesMax` entero 1–4 (2).
  - `modelosOrquestador` subconjunto de haiku/sonnet/opus/fable con al menos 1 (`["opus","fable"]`).
  - `modoPermisoDefecto` `preguntar`/`ediciones`/`auto` (`preguntar`) · `alBloquear` `preguntar`/`denegar` (`preguntar`).
  - `mostrarCosto` booleano (`true`) · `alertasModelo` booleano (`true`).
  - `rubrica` 6 filas `{clase, modelo, esfuerzo}` con las clases fijas y en este orden: Mecánica, Producción acotada, Síntesis y análisis, Juicio experto, Problema abierto, Máxima consecuencia.
  - `precios`, `ramasProtegidas`, `puertoDashboard`, `remoto` como hoy.
- `guardarConfig` escribe de forma atómica, **solo las claves conocidas**, y **conserva las desconocidas**.
- Modo automático (spec §3.1): se escribe siempre `environment: ["$defaults", ...entorno]`, `allow: ["$defaults", ...permitir]`, `soft_deny: ["$defaults", ...detener]` y `classifyAllShell` según el interruptor. **Nunca se toca `hard_deny` ni `permissions.allow`/`permissions.deny`.** Antes de escribir se copia el archivo a `settings.json.orquestador.bak`. Se conservan todas las demás claves, se tolera BOM y se escribe con indentación de 2 espacios. Si el JSON existente es inválido, no se escribe y se devuelve el error.
- Prefijos del entorno de confianza: `Source control: `, `Trusted internal domains: `, `Organization: `.
- `claude auto-mode defaults` se cachea **10 min**; `critique` tiene timeout de **120 s** (gasta uso: la UI lo advierte y pide confirmación); "Redactar con Claude" tiene timeout de **90 s** y corre exactamente `claude -p --model sonnet --tools "" --no-session-persistence --output-format json --json-schema <schema>`. Todos los procesos auxiliares usan `resolverBinario` y `ORQUESTADOR_CANAL` vacío.
- Marcador de activación, exacto: `<!-- orquestador:catalogo id=<id> version=<versión del plugin> -->`, al final del cuerpo.
- Textos exactos de la spec:
  - colisión: `Ya tienes un agente propio llamado <id>`;
  - contexto de inicio: `Rúbrica personalizada del usuario (manda sobre la de la skill)`;
  - reintento: `Autorizo explícitamente esta acción: <herramienta> <resumen>. Hazla.`;
  - barrera: `Apruebo, continúa.`;
  - agentes: `Disponible en sesiones nuevas`.
- API nueva: cookie, `Origin` en los POST, cuerpo máximo de 64 KB, cuerpo JSON que sea un objeto plano y errores con `ErrorConversacion`. `POST /api/automodo/restablecer` y eliminar un agente exigen `{confirmar:true}`. Las rutas de pasos pasan a `/api/pasos/:session/:agentId`.
- Versión del plugin al cerrar: **0.3.0** en `plugin.json` y en `marketplace.json`.

## Foco de revisión

Son casos que la spec implica pero que sus pruebas no nombran. Cada uno tiene un test en la tarea dueña:

1. **`settings.json` con BOM, claves ajenas (`model`, `hooks`, `permissions.allow`) y un `hard_deny` propio:** después de guardar el modo automático, todas esas claves siguen con el mismo valor, el `.bak` es idéntico al original y el archivo nuevo usa indentación de 2 espacios (Tarea 4).
2. **Un agente propio con el mismo id que uno del catálogo:** activar ese agente o su pack responde 409 `Ya tienes un agente propio llamado <id>` sin tocar el archivo; el pack activa los demás; desactivar no lo borra; crear un personalizado con un id del catálogo da 409 (Tareas 5 y 6).
3. **Restablecer el modo automático o eliminar un agente sin `{confirmar:true}`:** 400 y ningún efecto en disco, tanto en el módulo como por HTTP (Tareas 4, 6 y 9).
4. **Rúbrica con valores inválidos** en un `config.json` editado a mano (modelo `"gpt"`, 5 filas, BOM): `cargarConfig` cae a la fila de fábrica por clase, `session-start` no falla ni inyecta basura y `POST /api/config` con esa rúbrica responde 400 con el error en `errores.rubrica` (Tareas 1, 2 y 9).
5. **Dos pestañas guardando la configuración a la vez**, cada una con un cambio en una clave distinta: ambos cambios quedan en el archivo, porque el formulario envía solo las claves modificadas y el servidor fusiona (Tareas 1, 9 y 10).
6. **Windows con rutas con espacios y acentos** (`CLAUDE_CONFIG_DIR`, `cwd` del proyecto) y un binario `.cmd`: la escritura y el `spawn` funcionan, y un argumento vacío (`--tools ""`) o un JSON con comillas llegan intactos (Tareas 3, 4 y 6).

## Estructura de archivos

```
plugins/orquestador/
  .claude-plugin/plugin.json             versión 0.3.0
  catalogo/
    packs.json                           CREAR  9 packs: id, nombre, descripcion, agentes[id…], nombres{id: nombre visible}
    <pack>/<id>.md                       CREAR  56 agentes (Tareas 13–15)
  dashboard/
    cli-claude.mjs        CREAR      procesos `claude` auxiliares: entorno, citado para .cmd, timeout
    automodo.mjs          CREAR      lectura/escritura de autoMode, entorno en prosa, defaults cacheados, critique, reset
    agentes.mjs           CREAR      catálogo, activación con marcador, packs, personalizados, redactar
    server.mjs            MODIFICAR  rutas nuevas, /api/pasos, endurecimiento (400 por %, objeto plano, HEAD, detener)
    auth.mjs              MODIFICAR  IPv6, TODAS, hosts vacíos, poda de intentos, canje solo GET
    proceso-claude.mjs    MODIFICAR  permission_denied → denegado, queued_turn_count, resto al cerrar, permiso desconocido
    conversaciones.mjs    MODIFICAR  costo acumulado, encolados, denegados, envío durante cierre, corrupto, rama async, modelo
    public/
      index.html          MODIFICAR  4 pestañas, chip del orquestador, título editable, actividad nueva, vistas nuevas, diálogo de confirmación
      tema.css            MODIFICAR  componentes nuevos (interruptor, segmentado, barra de cambios, tarjetas de agentes, denegación, barrera)
      actividad.css       MODIFICAR  rediseño de nodos, eventos y resumen; sin-animacion acotada
      actividad.js        MODIFICAR  render rediseñado (estado-vista se conserva)
      app.js              MODIFICAR  pestañas, renombrar, costo separado, config, pasos en /api/pasos
      dom.js              MODIFICAR  interruptor, segmentado, confirmar
      chat.js             MODIFICAR  tarjeta de denegación, barrera, texto vacío, resultado recortado, resumenEntrada(null)
      chat-vista.js       MODIFICAR  chat:denegado y denegados del historial
      plan-vista.js       MODIFICAR  barreraHumana
      estado-vista.js     MODIFICAR  helpers puros nuevos (etiquetaEvento, numeracion, pedidoVsReal, claseNodo)
      agentes-panel.js    MODIFICAR  verificacion muestra el modelo crudo si es desconocido
      config-vista.js     CREAR      reductor puro del formulario de configuración y modo automático
      configuracion.js    CREAR      render de la pestaña Configuración
      agentes-vista.js    CREAR      estado puro del catálogo y del formulario de agentes
      agentes-catalogo.js CREAR      render del catálogo, el detalle y el formulario
  scripts/
    lib/rutas.mjs         MODIFICAR  dirClaude, rutaSettingsUsuario, rutaAgentesUsuario, rutaAgentesProyecto
    lib/archivos.mjs      CREAR      leerJsonUsuario (BOM), escribirAtomico, textoJson, respaldar
    lib/config.mjs        MODIFICAR  claves nuevas, rúbrica, validarConfig, guardarConfig
    lib/agentes.mjs       MODIFICAR  buscarDefinicion respeta CLAUDE_CONFIG_DIR
    session-start.mjs     MODIFICAR  inyecta la rúbrica personalizada
    statusline.mjs        MODIFICAR  respeta mostrarCosto
    subagent-stop.mjs     MODIFICAR  respeta alertasModelo
  skills/orquestar/SKILL.md  MODIFICAR  rúbrica personalizada; catálogo y verificador
  commands/dashboard.md      MODIFICAR  pestañas nuevas
README.md                    MODIFICAR
.claude-plugin/marketplace.json  MODIFICAR  versión 0.3.0
tests/fixtures/claude-falso.mjs      MODIFICAR  paso emitirSinSalto
tests/fixtures/guiones.mjs           MODIFICAR  denegado, fin con costo y encolados
tests/fixtures/claude-falso-cli.mjs  CREAR      auto-mode config|defaults|critique|reset y -p --json-schema
tests/helpers/plugin-falso.mjs       CREAR      raíz de plugin temporal con un catálogo mínimo
tests/helpers/http.mjs               MODIFICAR  pedirCrudo (cuerpos que no son JSON válido)
tests/*.test.mjs                     CREAR/MODIFICAR (detallado en cada tarea)
```

## Decisiones donde la spec era ambigua

Son decisiones de este plan; quien revise puede objetarlas antes de ejecutar.

- **`POST /api/config`.** Recibe `{ parcial: {…} }`, como lo escribe la tabla de la spec, y responde `{ config, reiniciar }`. `reiniciar` es true si cambió el puerto o el modo remoto, que solo se leen al arrancar.
- **Nombre visible de los agentes.** `packs.json` suma `nombres: { id: "Nombre visible" }` por pack, porque la spec no dice dónde vive el nombre visible ("Analista de Datos"). Los personalizados derivan su id del nombre (slug) y muestran `nombreDesdeId(id)`.
- **Entorno de confianza.** Va una entrada por prefijo con los valores separados por `, ` (`Source control: a, b`). Por eso un valor no puede contener comas. Si hay una segunda entrada `Organization:`, queda en "otras".
- **Interruptor "Por defecto en conversaciones nuevas".** Es un atajo de `modoPermisoDefecto` (`auto` ↔ `preguntar`). La sección Orquestador permite elegir cualquiera de los tres modos.
- **Prompt de "Redactar con Claude".** Va por stdin y no como argumento, para no depender del citado de Windows. Si el binario es un `.cmd`, los argumentos se citan con las reglas de MSVCRT (`citarParaShell`), así `--tools ""` y el JSON del esquema llegan intactos.
- **Procesos auxiliares.** Corren con `ORQUESTADOR_CANAL` vacío, y en ese caso SessionStart no emite el evento `sesion` ni inyecta contexto. Así `auto-mode` y "Redactar" no ensucian la vista Actividad con sesiones fantasma.
- **Personalizados: colisiones y validación.** Una colisión con el catálogo, el plugin, un integrado o un archivo existente da 409, igual que en el catálogo. Un error de formato da 400 con `errores` por campo.
- **Denegaciones del modo automático.** Viven en memoria (las últimas 20 por conversación) y vuelven en el historial. No se persisten: el transcript de Claude Code no las trae.
- **`alBloquear`.** Solo cambia la interfaz: con `denegar` la tarjeta informa sin botón. El gestor no hace nada distinto.
- **"Requiere permiso" en Actividad.** No se puede atribuir a un subagente (la solicitud llega por el proceso del orquestador), así que no se pinta por tarjeta. La leyenda conserva el color.
- **Costo.** Total = Orquestador + Agentes, como dice la spec. La prueba manual compara con `/cost` por si `total_cost_usd` ya incluyera a los subagentes.
- **Pruebas del catálogo.** Mientras faltan archivos, sus pruebas son `todo`. La Tarea 15 activa el modo estricto.
- **`description` de los agentes.** Usan la forma "… Úsalo para …; no lo uses para … (vecino)" y no llevan `: ` ni ` #`, que romperían el YAML real del frontmatter.
- **`buscarDefinicion` (pre-agent).** Busca los agentes del usuario en `$CLAUDE_CONFIG_DIR/agents` cuando esa variable existe, para ver los agentes que activa el dashboard.

## Catálogo de agentes (tablas por pack)

Fuente de verdad para `catalogo/packs.json` (Tarea 5) y para los archivos de las Tareas 13–15. La `description` va **literal** al frontmatter. Las reglas de la columna `model / effort` siguen la rúbrica de la skill `orquestar`: Mecánica `haiku/low`, Producción acotada `sonnet/medium`, Síntesis y análisis `sonnet/high`, Juicio experto `opus/high`. Ningún agente del catálogo trae `fable` por defecto: Fable lo decide el orquestador caso a caso. Las `tools` son la lista mínima, separada por comas y espacio, tal cual van en el frontmatter.

### Pack `investigacion` · "Investigación" · "Buscar, verificar y sintetizar información con fuentes citadas."

| id | Nombre visible | model / effort | tools | color | description |
|---|---|---|---|---|---|
| `investigador` | Investigador | sonnet / high | Read, WebSearch, WebFetch | blue | Investiga una pregunta abierta en fuentes públicas y entrega hallazgos con cita y nivel de confianza. Úsalo para preguntas generales que cruzan dominios; no lo uses para papers académicos (analista-literatura), mercados (investigador-mercado) ni tecnologías (investigador-tecnico). |
| `analista-literatura` | Analista de Literatura | sonnet / high | Read, WebSearch, WebFetch | blue | Revisa literatura académica, agrupa los papers por enfoque y resume el estado del arte con citas verificables. Úsalo para un related work o un estado del arte; no lo uses para criticar un paper puntual (critico-papers). |
| `verificador-hechos` | Verificador de Hechos | sonnet / medium | Read, WebSearch, WebFetch | blue | Comprueba afirmaciones puntuales contra fuentes primarias y marca cada una como confirmada, refutada o no verificable. Úsalo antes de publicar cifras, citas o fechas; no lo uses para investigar un tema desde cero (investigador). |
| `investigador-mercado` | Investigador de Mercado | sonnet / high | Read, WebSearch, WebFetch | blue | Dimensiona mercados, segmentos y tendencias de demanda con fuentes públicas y supuestos explícitos. Úsalo para TAM, SAM, SOM y tendencias; no lo uses para comparar competidores uno a uno (analista-competencia). |
| `investigador-tecnico` | Investigador Técnico | sonnet / high | Read, Grep, Glob, WebSearch, WebFetch | blue | Evalúa librerías, APIs y herramientas leyendo su documentación y su código, y recomienda con trade-offs. Úsalo para elegir o entender una tecnología; no lo uses para diseñar la arquitectura de tu sistema (arquitecto). |
| `sintetizador` | Sintetizador | sonnet / high | Read | blue | Integra varios informes o hallazgos en una síntesis única que resuelve contradicciones y señala vacíos. Úsalo cuando ya tienes material de varias fuentes o agentes; no lo uses para buscar información nueva (investigador). |

### Pack `datos` · "Datos" · "Limpiar, analizar, consultar y visualizar datos con resultados reproducibles."

| id | Nombre visible | model / effort | tools | color | description |
|---|---|---|---|---|---|
| `analista-datos` | Analista de Datos | sonnet / high | Read, Bash, Glob | green | Responde preguntas con análisis exploratorio de un dataset y conclusiones respaldadas por números y un script reproducible. Úsalo para saber qué dicen unos datos; no lo uses para limpiarlos (limpiador-datos) ni para pruebas estadísticas formales (estadistico). |
| `limpiador-datos` | Limpiador de Datos | sonnet / medium | Read, Write, Bash | green | Limpia y normaliza datasets (tipos, nulos, duplicados y formatos) sin tocar el original y registrando cada cambio. Úsalo antes de analizar datos sucios; no lo uses para sacar conclusiones (analista-datos). |
| `estadistico` | Estadístico | opus / high | Read, Bash | green | Diseña y ejecuta pruebas estadísticas, intervalos y análisis de potencia, revisando los supuestos antes de concluir. Úsalo para afirmar diferencias o efectos con rigor; no lo uses para exploración general (analista-datos). |
| `visualizador-datos` | Visualizador de Datos | sonnet / medium | Read, Write, Bash | green | Convierte datos en gráficos claros y honestos (escalas, ejes y color) junto con el script que los genera. Úsalo para figuras de informes o papers; no lo uses para diseñar slides completas (disenador-visual). |
| `ingeniero-datos` | Ingeniero de Datos | sonnet / high | Read, Edit, Write, Bash, Grep, Glob | green | Construye pipelines de ingesta y transformación reproducibles, con validaciones en cada etapa. Úsalo para mover y transformar datos de forma repetible; no lo uses para consultas SQL puntuales (analista-sql) ni para infraestructura cloud (ingeniero-cloud). |
| `analista-sql` | Analista SQL | sonnet / medium | Read, Bash | green | Escribe y optimiza consultas SQL de solo lectura contra un esquema dado y explica el resultado. Úsalo para responder preguntas con SQL; no lo uses para cambiar esquemas ni administrar la base (administrador-bd). |

### Pack `ml` · "Machine Learning" · "Diseñar, implementar, evaluar y desplegar modelos de ML y RL."

| id | Nombre visible | model / effort | tools | color | description |
|---|---|---|---|---|---|
| `cientifico-ml` | Científico de ML | opus / high | Read, WebSearch, WebFetch | purple | Diseña experimentos de ML supervisado (hipótesis, métricas, baselines y ablations) con costo de cómputo estimado. Úsalo para planificar antes de entrenar; no lo uses para implementar el pipeline (ingeniero-ml) ni para aprendizaje por refuerzo (investigador-rl). |
| `ingeniero-ml` | Ingeniero de ML | sonnet / high | Read, Edit, Write, Bash, Grep, Glob | purple | Implementa pipelines de entrenamiento y evaluación reproducibles, con semillas fijas y una corrida de humo. Úsalo para convertir un plan experimental en código; no lo uses para decidir qué experimentar (cientifico-ml). |
| `evaluador-modelos` | Evaluador de Modelos | sonnet / high | Read, Bash | purple | Evalúa modelos ya entrenados con métricas, cortes por subgrupo y análisis de errores, y detecta fugas de datos. Úsalo después de entrenar; no lo uses para ajustar hiperparámetros (optimizador-hiperparametros). |
| `investigador-rl` | Investigador de RL | opus / high | Read, WebSearch, WebFetch | purple | Diseña experimentos de aprendizaje por refuerzo (entornos, rewards, baselines, seeds y ablations). Úsalo para problemas de RL; no lo uses para ML supervisado (cientifico-ml) ni para implementar (ingeniero-ml). |
| `optimizador-hiperparametros` | Optimizador de Hiperparámetros | sonnet / medium | Read, Edit, Bash | purple | Planifica y corre búsquedas de hiperparámetros dentro de un presupuesto y reporta la mejor configuración con su varianza. Úsalo cuando el pipeline ya funciona; no lo uses para cambiar la arquitectura del modelo (cientifico-ml). |
| `ingeniero-mlops` | Ingeniero de MLOps | sonnet / high | Read, Edit, Write, Bash, Grep, Glob | purple | Empaqueta, versiona y despliega modelos con monitoreo de deriva y plan de rollback. Úsalo para llevar un modelo a servicio; no lo uses para entrenar (ingeniero-ml) ni para infraestructura general (ingeniero-devops). |
| `critico-papers` | Crítico de Papers | opus / high | Read, WebFetch | purple | Revisa críticamente un paper como revisor de conferencia (supuestos, validez experimental y amenazas) y da un veredicto. Úsalo para evaluar un paper concreto, propio o ajeno; no lo uses para resumir un área (analista-literatura). |

### Pack `ingenieria` · "Ingeniería" · "Diseñar, construir, probar y mantener software."

| id | Nombre visible | model / effort | tools | color | description |
|---|---|---|---|---|---|
| `arquitecto` | Arquitecto | opus / high | Read, Grep, Glob | orange | Diseña sistemas y planes de implementación con dos o tres alternativas y sus trade-offs explícitos. Úsalo antes de construir algo nuevo o reestructurar; no lo uses para escribir el código (implementador). |
| `implementador` | Implementador | sonnet / medium | Read, Edit, Write, Bash, Grep, Glob | orange | Implementa una tarea acotada con TDD siguiendo el estilo del repo y deja la suite en verde. Úsalo para una función, un endpoint o un arreglo con alcance claro; no lo uses para diseñar (arquitecto) ni para cazar un bug de causa desconocida (depurador). |
| `depurador` | Depurador | sonnet / high | Read, Edit, Bash, Grep, Glob | orange | Encuentra la causa raíz de un bug con evidencia (reproducción, bisección y logs) antes de proponer un arreglo mínimo. Úsalo cuando algo falla y no sabes por qué; no lo uses para implementar features (implementador). |
| `revisor-codigo` | Revisor de Código | sonnet / high | Read, Grep, Glob, Bash | orange | Revisa un diff buscando bugs, problemas de seguridad y casos borde verificados, sin reescribirlo. Úsalo antes de mergear; no lo uses para una auditoría de seguridad completa (auditor-seguridad) ni para refactorizar (refactorizador). |
| `tester` | Tester | sonnet / medium | Read, Edit, Write, Bash, Grep, Glob | orange | Escribe los tests que faltan (unitarios, de integración y de casos borde) para código existente y reporta la cobertura. Úsalo para blindar código ya escrito; no lo uses para implementar features (implementador). |
| `refactorizador` | Refactorizador | sonnet / medium | Read, Edit, Bash, Grep, Glob | orange | Mejora la estructura del código sin cambiar su comportamiento, en pasos pequeños y con la suite siempre verde. Úsalo para deuda técnica acotada; no lo uses para cambiar funcionalidad (implementador) ni para subir versiones (migrador). |
| `optimizador-rendimiento` | Optimizador de Rendimiento | sonnet / high | Read, Edit, Bash, Grep, Glob | orange | Mide antes de optimizar, encuentra el cuello de botella y demuestra la mejora con benchmarks. Úsalo cuando algo es lento; no lo uses para optimizar consultas SQL (analista-sql) ni infraestructura (ingeniero-sre). |
| `documentador-codigo` | Documentador de Código | sonnet / medium | Read, Edit, Grep, Glob | orange | Escribe docstrings, READMEs y comentarios de API a partir del código real, con ejemplos que corren. Úsalo para documentar código existente; no lo uses para guías o tutoriales largos (redactor-tecnico). |
| `migrador` | Migrador | sonnet / high | Read, Edit, Bash, Grep, Glob, WebFetch | orange | Migra código entre versiones de lenguaje, framework o librería siguiendo la guía oficial, por lotes y con tests. Úsalo para upgrades de dependencias o de APIs; no lo uses para refactors sin cambio de versión (refactorizador). |

### Pack `diseno` · "Diseño" · "Interfaces, piezas visuales, accesibilidad y sistemas de diseño."

| id | Nombre visible | model / effort | tools | color | description |
|---|---|---|---|---|---|
| `disenador-ui` | Diseñador UI/UX | opus / high | Read, Write, WebFetch | pink | Diseña flujos y pantallas con jerarquía clara, estados vacíos y de error, y specs de interacción. Úsalo para definir cómo se ve y se usa una interfaz; no lo uses para implementarla (ingeniero-frontend). |
| `disenador-visual` | Diseñador Visual | sonnet / medium | Read, Write | pink | Diseña presentaciones y piezas gráficas con una idea por slide y tipografía y color consistentes. Úsalo para slides e infografías; no lo uses para gráficos de datos (visualizador-datos) ni para pantallas de producto (disenador-ui). |
| `ingeniero-frontend` | Ingeniero Frontend | sonnet / medium | Read, Edit, Write, Bash, Grep, Glob | pink | Implementa interfaces web accesibles y responsivas a partir de un diseño, con tests de componentes. Úsalo para construir la interfaz; no lo uses para decidir el diseño (disenador-ui). |
| `auditor-accesibilidad` | Auditor de Accesibilidad | sonnet / high | Read, Grep, Glob, Bash | pink | Audita interfaces contra WCAG 2.2 AA (contraste, teclado y lectores de pantalla) y prioriza los hallazgos. Úsalo antes de lanzar una interfaz; no lo uses para rediseñarla (disenador-ui). |
| `redactor-ux` | Redactor UX | sonnet / medium | Read, Edit | pink | Escribe microcopy de interfaz (botones, errores, estados vacíos y onboarding) claro y consistente. Úsalo para los textos dentro de un producto; no lo uses para documentos o emails (redactor). |
| `disenador-sistemas` | Diseñador de Sistemas de Diseño | opus / high | Read, Edit, Write, Grep, Glob | pink | Define y mantiene los tokens, componentes y reglas de un sistema de diseño coherente. Úsalo para crear u ordenar un design system; no lo uses para una pantalla puntual (disenador-ui). |

### Pack `infra` · "Infraestructura" · "CI/CD, nube, seguridad, bases de datos y confiabilidad."

| id | Nombre visible | model / effort | tools | color | description |
|---|---|---|---|---|---|
| `ingeniero-devops` | Ingeniero DevOps | sonnet / medium | Read, Edit, Write, Bash, Grep, Glob | red | Configura CI/CD, contenedores y la automatización de builds y despliegues reproducibles. Úsalo para pipelines de integración y entrega; no lo uses para recursos cloud (ingeniero-cloud) ni para operar producción (ingeniero-sre). |
| `ingeniero-cloud` | Ingeniero Cloud | sonnet / high | Read, Edit, Write, Bash, Grep, Glob | red | Diseña y escribe infraestructura como código en la nube con el costo y la seguridad a la vista. Úsalo para redes, cómputo y almacenamiento cloud; no lo uses para CI/CD (ingeniero-devops). |
| `auditor-seguridad` | Auditor de Seguridad | opus / high | Read, Grep, Glob, Bash | red | Audita código y configuración buscando vulnerabilidades explotables (OWASP, secretos y permisos) con prueba de impacto. Úsalo antes de exponer un sistema o tras un incidente; no lo uses para revisar un diff rutinario (revisor-codigo) ni dependencias (revisor-dependencias). |
| `revisor-dependencias` | Revisor de Dependencias | sonnet / medium | Read, Bash, WebFetch | red | Revisa dependencias en busca de vulnerabilidades conocidas, licencias incompatibles, abandono y actualizaciones pendientes. Úsalo al agregar o actualizar paquetes; no lo uses para migrar el código a la versión nueva (migrador). |
| `administrador-bd` | Administrador de Bases de Datos | sonnet / high | Read, Edit, Write, Bash | red | Diseña esquemas, migraciones, índices y respaldos de bases de datos con plan de reversa. Úsalo para cambios de esquema o de rendimiento de la base; no lo uses para consultas de análisis (analista-sql). |
| `ingeniero-sre` | Ingeniero SRE | sonnet / high | Read, Grep, Glob, Bash | red | Mejora la confiabilidad en producción con SLOs, alertas, runbooks y análisis post-incidente sin culpables. Úsalo para incidentes y observabilidad; no lo uses para configurar CI/CD (ingeniero-devops). |

### Pack `escritura` · "Escritura" · "Redactar, editar, traducir y adaptar textos."

| id | Nombre visible | model / effort | tools | color | description |
|---|---|---|---|---|---|
| `redactor` | Redactor | sonnet / medium | Read, Write | yellow | Redacta emails, informes y documentos claros en el tono pedido, empezando por la versión corta. Úsalo para textos de trabajo generales; no lo uses para documentación técnica (redactor-tecnico) ni para papers (redactor-academico). |
| `editor` | Editor | sonnet / medium | Read, Edit | yellow | Edita textos existentes para mejorar claridad, concisión y corrección sin cambiar su sentido, y explica los cambios mayores. Úsalo cuando ya hay un borrador; no lo uses para escribir desde cero (redactor). |
| `traductor` | Traductor | sonnet / medium | Read, Write | yellow | Traduce entre español, inglés y otros idiomas conservando el sentido, el registro y la terminología técnica. Úsalo para traducciones fieles; no lo uses para adaptar el mensaje a otra audiencia (comunicador). |
| `redactor-tecnico` | Redactor Técnico | sonnet / medium | Read, Write, Edit, Bash, Grep, Glob | yellow | Escribe guías, tutoriales y documentación técnica verificando cada paso contra el sistema real. Úsalo para documentación de usuario o de operación; no lo uses para docstrings ni comentarios de código (documentador-codigo). |
| `redactor-academico` | Redactor Académico | sonnet / high | Read, Write, Edit, WebSearch, WebFetch | yellow | Redacta secciones de papers y tesis con estructura académica, precisión y citas que existen. Úsalo para escribir un método, unos resultados o una introducción; no lo uses para revisar críticamente un paper (critico-papers). |
| `comunicador` | Comunicador | sonnet / medium | Read, Write | yellow | Adapta un mensaje a una audiencia y un canal (ejecutivos, público general o redes) con un objetivo claro. Úsalo para anuncios, resúmenes ejecutivos y comunicaciones delicadas; no lo uses para traducir (traductor) ni para propuestas comerciales (redactor-propuestas). |

### Pack `negocio` · "Negocio" · "Estrategia, finanzas, producto, usuarios y competencia."

| id | Nombre visible | model / effort | tools | color | description |
|---|---|---|---|---|---|
| `estratega` | Estratega | opus / high | Read, WebSearch, WebFetch | cyan | Analiza decisiones de estrategia y pricing con escenarios cuantificados y supuestos explícitos, y recomienda una opción. Úsalo para decisiones de negocio importantes; no lo uses para modelos financieros detallados (analista-financiero). |
| `analista-financiero` | Analista Financiero | sonnet / high | Read, Write, Bash | cyan | Construye modelos financieros (flujo de caja, unit economics y sensibilidad) con fórmulas trazables. Úsalo para cuantificar costos, ingresos o retorno; no lo uses para la estrategia general (estratega). |
| `product-manager` | Product Manager | sonnet / high | Read, Write | cyan | Convierte problemas en requisitos priorizados con usuarios, historias, criterios de aceptación y métricas de éxito. Úsalo para definir qué construir y por qué; no lo uses para investigar usuarios en terreno (investigador-usuarios) ni para diseñar pantallas (disenador-ui). |
| `investigador-usuarios` | Investigador de Usuarios | sonnet / high | Read, Write | cyan | Diseña entrevistas y encuestas, y sintetiza lo que dicen los usuarios en necesidades con evidencia. Úsalo para entender a los usuarios; no lo uses para priorizar el backlog (product-manager). |
| `analista-competencia` | Analista de Competencia | sonnet / high | Read, WebSearch, WebFetch | cyan | Compara competidores en producto, precio y posicionamiento con fuentes públicas fechadas. Úsalo para benchmarks competitivos; no lo uses para dimensionar el mercado (investigador-mercado). |
| `redactor-propuestas` | Redactor de Propuestas | sonnet / medium | Read, Write | cyan | Escribe propuestas comerciales, postulaciones y respuestas a licitaciones con estructura persuasiva y todos los requisitos cubiertos. Úsalo para propuestas a clientes o fondos; no lo uses para comunicaciones generales (comunicador). |

### Pack `operacion` · "Operación" · "Verificar entregables, extraer datos, planificar y ordenar."

| id | Nombre visible | model / effort | tools | color | description |
|---|---|---|---|---|---|
| `verificador` | Verificador | haiku / low | Read, Bash, Grep, Glob | green | Comprueba de forma literal que un entregable cumple sus criterios de aceptación y responde APROBADO o RECHAZADO con evidencia. Úsalo como barrera automática entre etapas de un plan; no lo uses para revisar la calidad del código (revisor-codigo). |
| `extractor` | Extractor | haiku / low | Read, Write, WebFetch | green | Extrae datos estructurados de textos, páginas o archivos a JSON o CSV según un esquema, sin rellenar nada. Úsalo para pasar información a un formato fijo; no lo uses para analizar esos datos (analista-datos). |
| `planificador` | Planificador | sonnet / high | Read, Grep, Glob | green | Descompone un objetivo en tareas ordenadas con dependencias, estimaciones y criterios de aceptación. Úsalo para organizar trabajo de varios pasos; no lo uses para diseñar la arquitectura técnica (arquitecto). |
| `organizador-archivos` | Organizador de Archivos | haiku / low | Read, Bash, Glob | green | Ordena, renombra y deduplica archivos según reglas acordadas, con un plan previo y sin borrar nada sin confirmación. Úsalo para limpiar carpetas desordenadas; no lo uses para refactorizar código (refactorizador). |

Total: 6 + 6 + 7 + 9 + 6 + 6 + 6 + 6 + 4 = **56**.

## Guía de contenido del catálogo (aplica a las Tareas 13, 14 y 15)

### Plantilla exacta de cada archivo

`plugins/orquestador/catalogo/<pack>/<id>.md`, con LF como fin de línea:

```markdown
---
name: <id>
description: <description de la tabla, literal>
model: <model de la tabla>
effort: <effort de la tabla>
tools: <tools de la tabla, literal>
color: <color de la tabla>
---

Persona: <una línea: actitud y estilo de trabajo, en segunda o tercera persona>

## Rol

<2 a 4 frases: qué problema resuelve, para quién y en qué se diferencia de sus vecinos del pack.>

## Método

1. <primer paso: aclarar el encargo o leer el contexto>
2. <paso verificable>
…
N. <último paso: verificar el resultado antes de entregar>

## Entregable

<Qué produce exactamente: formato, ubicación y nivel de detalle.>

## Restricciones

- <lo que no hace nunca>
- <el límite con su vecino más cercano, nombrándolo>
- <otras, de 3 a 5 viñetas en total>

## Formato de retorno

Máximo ~300 palabras, con esta estructura fija:

1. **<Bloque 1>:** <qué va>
2. **<Bloque 2>:** <qué va>
3. **<Bloque 3>:** <qué va>

## REGLAS CRÍTICAS

- Nunca agregues coautoría de IA (`Co-Authored-By`, "Generated with Claude") en nada que produzcas.
- No inventes fuentes, citas, URLs, datos ni resultados. Si algo no se puede verificar, dilo.
- No hagas commits ni push: eso es del Guardián Git (`orquestador:guardian-git`).
- Respeta los permisos: si una acción se deniega, no la rodees; informa el bloqueo y propón otra vía.
- Responde en español.
```

La sección `## REGLAS CRÍTICAS` se copia **literal** en los 56 archivos.

### Criterios de calidad (los revisa el revisor de cada tarea; los marcados con ✔ los verifica `tests/catalogo.test.mjs`)

- ✔ `name` igual al nombre del archivo; `model` en {haiku, sonnet, opus, fable, inherit}; `effort` en {low, medium, high, xhigh, max}; `tools` y `color` presentes.
- ✔ `description` de una o dos frases, de 60 a 330 caracteres, con "Úsalo " y "no lo uses", **sin** la secuencia `: ` ni ` #` (romperían el YAML real de Claude Code) y distinta de todas las demás.
- ✔ Secciones en este orden: `Persona: `, `## Rol`, `## Método` (con al menos `1. ` y `2. `), `## Entregable`, `## Restricciones`, `## Formato de retorno` (con "300 palabras"), `## REGLAS CRÍTICAS`.
- ✔ Cuerpo (todo lo que va después del frontmatter) de entre 120 y 600 palabras.
- ✔ Sin el marcador `orquestador:catalogo` (lo agrega la activación).
- El `Método` tiene de 4 a 7 pasos, cada uno una **acción concreta y comprobable** ("Corre la suite completa", no "asegúrate de la calidad").
- `Restricciones` nombra al vecino con el que podría confundirse y deja claro el límite (igual que la `description`).
- `Formato de retorno` tiene una estructura **fija** de 3 a 5 bloques que el orquestador puede leer sin ambigüedad.
- Sin relleno ("como experto de clase mundial…"), sin promesas vacías, sin emojis. Español neutro y profesional, frases cortas.
- Las herramientas que el cuerpo menciona existen en `tools` (un agente sin `Bash` no "corre la suite").

### Ejemplo completo bien hecho: `plugins/orquestador/catalogo/investigacion/investigador.md`

Este archivo se crea tal cual en la Tarea 13.

```markdown
---
name: investigador
description: Investiga una pregunta abierta en fuentes públicas y entrega hallazgos con cita y nivel de confianza. Úsalo para preguntas generales que cruzan dominios; no lo uses para papers académicos (analista-literatura), mercados (investigador-mercado) ni tecnologías (investigador-tecnico).
model: sonnet
effort: high
tools: Read, WebSearch, WebFetch
color: blue
---

Persona: Periodista de investigación meticuloso; separa lo verificado de lo inferido y nunca rellena un vacío con una suposición.

## Rol

Respondes preguntas abiertas que no caen en un dominio especializado: qué se sabe de un tema, quién hace algo y desde cuándo, o qué cambió en un área este año. Tu valor está en encontrar fuentes confiables rápido, contrastarlas y decir con honestidad cuánto se sabe. Si la pregunta es sobre literatura académica, un mercado o una tecnología concreta, lo dices en el retorno para que el orquestador use al especialista del pack.

## Método

1. Reformula la pregunta en una frase y define qué contaría como respuesta suficiente. Si el encargo es ambiguo, elige la interpretación más útil y anótala como supuesto.
2. Busca en al menos tres fuentes independientes. Prioriza las primarias (documentos oficiales, datos originales, declaraciones directas) sobre los resúmenes de terceros.
3. Abre y lee cada fuente que vayas a citar; nunca cites a partir del fragmento del buscador.
4. Contrasta: anota dónde coinciden las fuentes, dónde se contradicen y qué fecha tiene cada dato.
5. Asigna a cada hallazgo un nivel de confianza: alto (dos o más fuentes primarias coinciden), medio (una primaria o varias secundarias) o bajo (una sola secundaria o solo indicios).
6. Antes de entregar, revisa que cada afirmación tenga su fuente y que ninguna URL sea inventada.

## Entregable

Una respuesta corta a la pregunta y una lista de hallazgos ordenados por relevancia, cada uno con su fuente (título, medio y URL), su fecha y su nivel de confianza. Al final, los vacíos: lo que no se pudo verificar y dónde habría que buscar.

## Restricciones

- No escribes archivos ni modificas el repositorio: solo investigas y reportas.
- No conviertes una inferencia en un hecho; si deduces algo, lo marcas como inferencia.
- No haces revisiones de literatura académica, dimensionamientos de mercado ni evaluaciones de librerías: eso es de analista-literatura, investigador-mercado e investigador-tecnico.
- Si las fuentes se contradicen y no puedes resolverlo, lo reportas tal cual en vez de elegir una.

## Formato de retorno

Máximo ~300 palabras, con esta estructura fija:

1. **Respuesta corta:** dos o tres frases.
2. **Hallazgos:** viñetas con hallazgo, fuente, fecha y confianza.
3. **Contradicciones:** las que encontraste, o "ninguna".
4. **Vacíos y supuestos:** qué falta y qué asumiste.

## REGLAS CRÍTICAS

- Nunca agregues coautoría de IA (`Co-Authored-By`, "Generated with Claude") en nada que produzcas.
- No inventes fuentes, citas, URLs, datos ni resultados. Si algo no se puede verificar, dilo.
- No hagas commits ni push: eso es del Guardián Git (`orquestador:guardian-git`).
- Respeta los permisos: si una acción se deniega, no la rodees; informa el bloqueo y propón otra vía.
- Responde en español.
```

---

### Tarea 1: rutas de Claude, JSON del usuario y configuración v2

**Archivos:**
- Modificar: `plugins/orquestador/scripts/lib/rutas.mjs`
- Crear: `plugins/orquestador/scripts/lib/archivos.mjs`
- Reescribir: `plugins/orquestador/scripts/lib/config.mjs`
- Crear: `tests/config-v2.test.mjs`

**Interfaces:**
- Produce (`rutas.mjs`): `dirClaude(env) → string` (`CLAUDE_CONFIG_DIR` o `~/.claude`), `rutaSettingsUsuario(env) → string`, `rutaAgentesUsuario(env) → string` y `rutaAgentesProyecto(cwd) → string` (`<cwd>/.claude/agents`).
- Produce (`archivos.mjs`):
  - `sinBom(texto) → string` y `textoJson(datos) → string` (2 espacios y salto final).
  - `leerJsonUsuario(ruta) → { existe: boolean, datos: any, error: string|null }`. Un archivo ausente da `{ existe:false, datos:null, error:null }`; uno inválido da `error` con el texto "no es JSON válido".
  - `escribirAtomico(ruta, texto)`: crea la carpeta, escribe un temporal y renombra, con 3 intentos; si no puede, lanza.
  - `respaldar(ruta, sufijo) → string|null`: copia `ruta` a `ruta + sufijo` si existe.
- Produce (`config.mjs`):
  - Constantes `MODELOS_ORQUESTADOR`, `MODOS_PERMISO`, `AL_BLOQUEAR`, `CLASES_RUBRICA`, `RUBRICA_FABRICA` (6 filas `{clase, modelo, esfuerzo}`), `CLAVES_EDITABLES` y `CONFIG_DEFECTO` (con `modoPermisoDefecto`, `alBloquear`, `mostrarCosto`, `alertasModelo` y `rubrica`).
  - `normalizarRubrica(r) → fila[6]` (cada clase toma la fila del usuario si es válida; si no, la de fábrica) y `rubricaEsDeFabrica(r) → boolean`.
  - `cargarConfig(env)`: ahora tolera BOM y normaliza la rúbrica.
  - `validarConfig(parcial) → { errores: {campo: mensaje}, limpio: {…} }`. Ignora las claves que no están en `CLAVES_EDITABLES`.
  - `guardarConfig(parcial, env) → { ok: true, config } | { ok: false, errores }`. El error de archivo ilegible va en `errores._`.

- [ ] **Paso 1: escribir los tests que fallan**

`tests/config-v2.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { dirClaude, rutaSettingsUsuario, rutaAgentesUsuario, rutaAgentesProyecto, rutaConfig } from '../plugins/orquestador/scripts/lib/rutas.mjs';
import { leerJsonUsuario, escribirAtomico, textoJson, respaldar } from '../plugins/orquestador/scripts/lib/archivos.mjs';
import {
  cargarConfig, validarConfig, guardarConfig, normalizarRubrica, rubricaEsDeFabrica, RUBRICA_FABRICA, CLASES_RUBRICA, CLAVES_EDITABLES,
} from '../plugins/orquestador/scripts/lib/config.mjs';

const home = () => ({ ORQUESTADOR_HOME: mkdtempSync(join(tmpdir(), 'orq-cfg2-')) });
const leer = (env) => JSON.parse(readFileSync(rutaConfig(env), 'utf8'));

test('rutas de Claude: derivan de CLAUDE_CONFIG_DIR y, sin ella, de ~/.claude', () => {
  const env = { CLAUDE_CONFIG_DIR: join(tmpdir(), 'Mi Config ñ') };
  assert.equal(dirClaude(env), env.CLAUDE_CONFIG_DIR);
  assert.equal(rutaSettingsUsuario(env), join(env.CLAUDE_CONFIG_DIR, 'settings.json'));
  assert.equal(rutaAgentesUsuario(env), join(env.CLAUDE_CONFIG_DIR, 'agents'));
  assert.equal(dirClaude({}), join(homedir(), '.claude'));
  assert.equal(rutaAgentesProyecto(join(tmpdir(), 'repo x')), join(tmpdir(), 'repo x', '.claude', 'agents'));
});

test('archivos: BOM tolerado, ausente distinto de inválido, escritura atómica y respaldo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orq-arch-'));
  const r = join(dir, 'a.json');
  assert.deepEqual(leerJsonUsuario(r), { existe: false, datos: null, error: null });
  writeFileSync(r, '﻿{"x":1}');
  assert.deepEqual(leerJsonUsuario(r).datos, { x: 1 });
  assert.equal(respaldar(r, '.bak'), `${r}.bak`);
  assert.equal(readFileSync(`${r}.bak`, 'utf8'), '﻿{"x":1}');
  writeFileSync(r, '{roto');
  const malo = leerJsonUsuario(r);
  assert.equal(malo.existe, true);
  assert.match(malo.error, /no es JSON válido/);
  escribirAtomico(join(dir, 'sub', 'b.json'), textoJson({ y: [1] }));
  assert.equal(readFileSync(join(dir, 'sub', 'b.json'), 'utf8'), '{\n  "y": [\n    1\n  ]\n}\n');
  assert.equal(respaldar(join(dir, 'no-existe.json'), '.bak'), null);
});

test('config: valores por defecto nuevos', () => {
  const c = cargarConfig(home());
  assert.deepEqual([c.modoPermisoDefecto, c.alBloquear, c.mostrarCosto, c.alertasModelo], ['preguntar', 'preguntar', true, true]);
  assert.deepEqual(c.rubrica.map((f) => f.clase), [...CLASES_RUBRICA]);
  assert.deepEqual(c.rubrica.map((f) => `${f.modelo}/${f.esfuerzo}`), ['haiku/low', 'sonnet/medium', 'sonnet/high', 'opus/high', 'opus/xhigh', 'fable/high']);
});

test('config: una rúbrica editada a mano con valores inválidos cae a fábrica por fila (y con BOM se lee igual)', () => {
  const env = home();
  writeFileSync(rutaConfig(env), '﻿' + JSON.stringify({ paraleloMax: 3, rubrica: [
    { clase: 'Mecánica', modelo: 'gpt', esfuerzo: 'low' },
    { clase: 'Juicio experto', modelo: 'sonnet', esfuerzo: 'max' },
    { clase: 'Inventada', modelo: 'opus', esfuerzo: 'high' },
    null,
  ] }));
  const c = cargarConfig(env);
  assert.equal(c.paraleloMax, 3);
  assert.equal(c.rubrica.length, 6);
  assert.deepEqual(c.rubrica[0], { clase: 'Mecánica', modelo: 'haiku', esfuerzo: 'low' });
  assert.deepEqual(c.rubrica[3], { clase: 'Juicio experto', modelo: 'sonnet', esfuerzo: 'max' });
  assert.equal(rubricaEsDeFabrica(c.rubrica), false);
  assert.equal(rubricaEsDeFabrica(normalizarRubrica('basura')), true);
});

test('validarConfig: errores por campo, rangos y enums; ignora claves desconocidas y no editables', () => {
  const { errores, limpio } = validarConfig({
    paraleloMax: 9, fableMaxPorSesion: 0, conversacionesMax: 1.5, modelosOrquestador: [], modoPermisoDefecto: 'auto',
    alBloquear: 'quizas', mostrarCosto: 'no', alertasModelo: false, puertoDashboard: 80, ramasProtegidas: ['main', 'rama con espacio'],
    rubrica: RUBRICA_FABRICA.slice(0, 5), precios: { opus: { entrada: 4, salida: 20, cacheLectura: 0.2, cacheEscritura: -1 } },
    remoto: { activo: true, escuchar: '0.0.0.0', hostsPermitidos: [''] }, inventada: 1, rutaClaude: 'x',
  });
  assert.deepEqual(Object.keys(errores).sort(), ['alBloquear', 'conversacionesMax', 'modelosOrquestador', 'mostrarCosto', 'paraleloMax',
    'precios', 'puertoDashboard', 'ramasProtegidas', 'remoto', 'rubrica'].sort());
  assert.deepEqual(limpio, { fableMaxPorSesion: 0, modoPermisoDefecto: 'auto', alertasModelo: false });
  assert.ok(!CLAVES_EDITABLES.includes('rutaClaude'));
  assert.match(validarConfig({ rubrica: [...RUBRICA_FABRICA].reverse() }).errores.rubrica, /Mecánica/);
  assert.deepEqual(validarConfig({ rubrica: RUBRICA_FABRICA.map((f) => ({ ...f })) }).errores, {});
  assert.deepEqual(validarConfig([1]).errores, { _: 'La configuración debe ser un objeto' });
});

test('guardarConfig: escribe solo claves conocidas, conserva las desconocidas y fusiona precios', () => {
  const env = home();
  writeFileSync(rutaConfig(env), JSON.stringify({ miClave: { a: 1 }, precios: { haiku: { entrada: 1, salida: 2, cacheLectura: 3, cacheEscritura: 4 } } }));
  const r = guardarConfig({ paraleloMax: 6, inventada: true, precios: { opus: { entrada: 5, salida: 25, cacheLectura: 0.5, cacheEscritura: 6 } } }, env);
  assert.equal(r.ok, true);
  assert.equal(r.config.paraleloMax, 6);
  const disco = leer(env);
  assert.deepEqual(disco.miClave, { a: 1 });
  assert.equal(disco.inventada, undefined);
  assert.equal(disco.precios.haiku.entrada, 1);
  assert.equal(disco.precios.opus.salida, 25);
  assert.match(readFileSync(rutaConfig(env), 'utf8'), /^\{\n {2}"/);
});

test('guardarConfig: dos guardados seguidos con claves distintas conservan ambos cambios', () => {
  const env = home();
  guardarConfig({ mostrarCosto: false }, env);
  guardarConfig({ paraleloMax: 2 }, env);
  assert.deepEqual([leer(env).mostrarCosto, leer(env).paraleloMax], [false, 2]);
});

test('guardarConfig: con errores no escribe; un config.json inválido no se pisa', () => {
  const env = home();
  const r = guardarConfig({ paraleloMax: 0 }, env);
  assert.deepEqual([r.ok, Object.keys(r.errores)], [false, ['paraleloMax']]);
  assert.equal(existsSync(rutaConfig(env)), false);
  writeFileSync(rutaConfig(env), '{roto');
  const r2 = guardarConfig({ paraleloMax: 2 }, env);
  assert.equal(r2.ok, false);
  assert.match(r2.errores._, /no es JSON válido/);
  assert.equal(readFileSync(rutaConfig(env), 'utf8'), '{roto');
});
```

- [ ] **Paso 2: correr los tests y ver que fallan**

Ejecuta: `node --test tests/config-v2.test.mjs`
Esperado: FAIL con `does not provide an export named 'dirClaude'`.

- [ ] **Paso 3: implementar las rutas y los archivos**

En `scripts/lib/rutas.mjs`, agrega al final:

```js
// Directorio de Claude Code del usuario: respeta CLAUDE_CONFIG_DIR (los tests lo redirigen a un temporal).
export const dirClaude = (env = process.env) => env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
export const rutaSettingsUsuario = (env = process.env) => join(dirClaude(env), 'settings.json');
export const rutaAgentesUsuario = (env = process.env) => join(dirClaude(env), 'agents');
export const rutaAgentesProyecto = (cwd) => join(cwd, '.claude', 'agents');
```

Crea `scripts/lib/archivos.mjs`:

```js
// JSON del usuario en disco: lectura que tolera BOM, escritura atómica con reintentos y respaldo previo.
import { readFileSync, writeFileSync, renameSync, mkdirSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

const INTENTOS = 3;
const dormir = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export const sinBom = (t) => (String(t).charCodeAt(0) === 0xfeff ? String(t).slice(1) : String(t));
export const textoJson = (datos) => `${JSON.stringify(datos, null, 2)}\n`;

// Un archivo ausente no es un error; uno con JSON inválido sí, y quien llama decide no tocarlo.
export function leerJsonUsuario(ruta) {
  let texto;
  try {
    texto = readFileSync(ruta, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return { existe: false, datos: null, error: null };
    return { existe: true, datos: null, error: `No se pudo leer ${ruta}: ${e.message}` };
  }
  try {
    return { existe: true, datos: JSON.parse(sinBom(texto)), error: null };
  } catch (e) {
    return { existe: true, datos: null, error: `${ruta} no es JSON válido (${e.message})` };
  }
}

// Escribe en un temporal y lo renombra. Reintenta ante bloqueos breves (antivirus, OneDrive) y lanza si no puede.
export function escribirAtomico(ruta, texto) {
  const tmp = `${ruta}.${process.pid}.${Date.now()}.tmp`;
  for (let intento = 1; ; intento++) {
    try {
      mkdirSync(dirname(ruta), { recursive: true });
      writeFileSync(tmp, texto);
      renameSync(tmp, ruta);
      return;
    } catch (e) {
      if (intento < INTENTOS) { dormir(50); continue; }
      try { rmSync(tmp, { force: true }); } catch { /* nada que limpiar */ }
      throw e;
    }
  }
}

// Copia el archivo actual a `<ruta><sufijo>` si existe. Devuelve la ruta del respaldo o null.
export function respaldar(ruta, sufijo) {
  if (!existsSync(ruta)) return null;
  const destino = `${ruta}${sufijo}`;
  copyFileSync(ruta, destino);
  return destino;
}
```

- [ ] **Paso 4: reescribir `config.mjs`**

Reemplaza `scripts/lib/config.mjs` completo por:

```js
// Configuración del orquestador (~/.claude/orquestador/config.json): defectos, lectura tolerante, validación y guardado.
import { existsSync } from 'node:fs';
import { rutaConfig } from './rutas.mjs';
import { ESFUERZOS } from './modelos.mjs';
import { leerJsonUsuario, escribirAtomico, textoJson } from './archivos.mjs';

export const MODELOS_ORQUESTADOR = Object.freeze(['haiku', 'sonnet', 'opus', 'fable']);
export const MODOS_PERMISO = Object.freeze(['preguntar', 'ediciones', 'auto']);
export const AL_BLOQUEAR = Object.freeze(['preguntar', 'denegar']);
export const CLASES_RUBRICA = Object.freeze(['Mecánica', 'Producción acotada', 'Síntesis y análisis', 'Juicio experto', 'Problema abierto', 'Máxima consecuencia']);
const fila = (clase, modelo, esfuerzo) => Object.freeze({ clase, modelo, esfuerzo });
export const RUBRICA_FABRICA = Object.freeze([
  fila('Mecánica', 'haiku', 'low'),
  fila('Producción acotada', 'sonnet', 'medium'),
  fila('Síntesis y análisis', 'sonnet', 'high'),
  fila('Juicio experto', 'opus', 'high'),
  fila('Problema abierto', 'opus', 'xhigh'),
  fila('Máxima consecuencia', 'fable', 'high'),
]);
const CAMPOS_PRECIO = ['entrada', 'salida', 'cacheLectura', 'cacheEscritura'];
const TODAS_LAS_INTERFACES = ['0.0.0.0', '::', '[::]', '0:0:0:0:0:0:0:0'];

// Precios en USD por millón de tokens (lista oficial vigente al 2026-10-06; escritura de caché = 1,25× entrada).
export const CONFIG_DEFECTO = Object.freeze({
  fableMaxPorSesion: 2,
  paraleloMax: 4,
  puertoDashboard: 4321,
  modelosOrquestador: ['opus', 'fable'],
  ramasProtegidas: ['main', 'master'],
  conversacionesMax: 2,
  rutaClaude: null,
  remoto: { activo: false, escuchar: '127.0.0.1', hostsPermitidos: [] },
  modoPermisoDefecto: 'preguntar',
  alBloquear: 'preguntar',
  mostrarCosto: true,
  alertasModelo: true,
  rubrica: RUBRICA_FABRICA,
  precios: {
    haiku: { entrada: 0.1, salida: 0.5, cacheLectura: 0.01, cacheEscritura: 0.125 },
    sonnet: { entrada: 2, salida: 10, cacheLectura: 0.2, cacheEscritura: 2.5 },
    opus: { entrada: 4, salida: 20, cacheLectura: 0.2, cacheEscritura: 5 },
    fable: { entrada: 10, salida: 50, cacheLectura: 0.25, cacheEscritura: 12.5 },
  },
});

const esObjeto = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// Cada clase toma la fila del usuario solo si su modelo y su esfuerzo son válidos; si no, la de fábrica.
export function normalizarRubrica(r) {
  const lista = Array.isArray(r) ? r : [];
  return RUBRICA_FABRICA.map((f) => {
    const u = lista.find((x) => x?.clase === f.clase);
    return u && MODELOS_ORQUESTADOR.includes(u.modelo) && ESFUERZOS.includes(u.esfuerzo)
      ? { clase: f.clase, modelo: u.modelo, esfuerzo: u.esfuerzo }
      : { ...f };
  });
}

export const rubricaEsDeFabrica = (r) => normalizarRubrica(r)
  .every((x, i) => x.modelo === RUBRICA_FABRICA[i].modelo && x.esfuerzo === RUBRICA_FABRICA[i].esfuerzo);

export function cargarConfig(env = process.env) {
  const { datos } = leerJsonUsuario(rutaConfig(env));
  const usuario = esObjeto(datos) ? datos : {};
  return {
    ...CONFIG_DEFECTO, ...usuario,
    precios: { ...CONFIG_DEFECTO.precios, ...(esObjeto(usuario.precios) ? usuario.precios : {}) },
    remoto: { ...CONFIG_DEFECTO.remoto, ...(esObjeto(usuario.remoto) ? usuario.remoto : {}) },
    rubrica: normalizarRubrica(usuario.rubrica),
  };
}

const entero = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const booleano = (v) => (typeof v === 'boolean' ? null : 'Debe ser verdadero o falso');

function validarRubrica(v) {
  if (!Array.isArray(v) || v.length !== CLASES_RUBRICA.length) return `Deben ser ${CLASES_RUBRICA.length} filas, una por clase`;
  for (const [i, f] of v.entries()) {
    if (f?.clase !== CLASES_RUBRICA[i]) return `La fila ${i + 1} debe ser "${CLASES_RUBRICA[i]}"`;
    if (!MODELOS_ORQUESTADOR.includes(f.modelo)) return `${f.clase}: modelo inválido`;
    if (!ESFUERZOS.includes(f.esfuerzo)) return `${f.clase}: esfuerzo inválido`;
  }
  return null;
}

function validarPrecios(v) {
  if (!esObjeto(v)) return 'Debe ser una tabla por modelo';
  for (const [m, p] of Object.entries(v)) {
    if (!MODELOS_ORQUESTADOR.includes(m)) return `Modelo desconocido: ${m}`;
    if (!esObjeto(p) || !CAMPOS_PRECIO.every((k) => typeof p[k] === 'number' && Number.isFinite(p[k]) && p[k] >= 0 && p[k] <= 1000)) {
      return `${m}: cada precio debe ser un número entre 0 y 1000`;
    }
  }
  return null;
}

function validarRemotoConfig(v) {
  if (!esObjeto(v)) return 'Debe ser un objeto';
  if (typeof v.activo !== 'boolean') return 'activo debe ser verdadero o falso';
  if (typeof v.escuchar !== 'string' || !/^[\w.:[\]-]{1,100}$/.test(v.escuchar)) return 'escuchar debe ser una IP o un nombre de host';
  if (!Array.isArray(v.hostsPermitidos) || !v.hostsPermitidos.every((h) => typeof h === 'string' && h.length <= 253)) return 'hostsPermitidos debe ser una lista de nombres';
  if (v.activo && TODAS_LAS_INTERFACES.includes(v.escuchar) && !v.hostsPermitidos.some((h) => h.trim())) {
    return 'Escuchar en todas las interfaces exige al menos un host permitido';
  }
  return null;
}

const VALIDADORES = {
  paraleloMax: (v) => (entero(v, 1, 8) ? null : 'Debe ser un entero entre 1 y 8'),
  fableMaxPorSesion: (v) => (entero(v, 0, 5) ? null : 'Debe ser un entero entre 0 y 5'),
  conversacionesMax: (v) => (entero(v, 1, 4) ? null : 'Debe ser un entero entre 1 y 4'),
  modelosOrquestador: (v) => (Array.isArray(v) && v.length >= 1 && new Set(v).size === v.length && v.every((m) => MODELOS_ORQUESTADOR.includes(m))
    ? null : 'Elige al menos un modelo entre haiku, sonnet, opus y fable'),
  modoPermisoDefecto: (v) => (MODOS_PERMISO.includes(v) ? null : 'Debe ser preguntar, ediciones o auto'),
  alBloquear: (v) => (AL_BLOQUEAR.includes(v) ? null : 'Debe ser preguntar o denegar'),
  mostrarCosto: booleano,
  alertasModelo: booleano,
  rubrica: validarRubrica,
  precios: validarPrecios,
  ramasProtegidas: (v) => (Array.isArray(v) && v.length <= 20 && new Set(v).size === v.length && v.every((r) => typeof r === 'string' && /^[\w./-]{1,100}$/.test(r))
    ? null : 'Hasta 20 nombres de rama, sin espacios ni repetidos'),
  puertoDashboard: (v) => (entero(v, 1024, 65535) ? null : 'Debe ser un entero entre 1024 y 65535'),
  remoto: validarRemotoConfig,
};
export const CLAVES_EDITABLES = Object.freeze(Object.keys(VALIDADORES));

export function validarConfig(parcial) {
  if (!esObjeto(parcial)) return { errores: { _: 'La configuración debe ser un objeto' }, limpio: {} };
  const errores = {};
  const limpio = {};
  for (const [k, v] of Object.entries(parcial)) {
    if (!VALIDADORES[k]) continue; // desconocida o no editable desde el dashboard (p. ej. rutaClaude)
    const error = VALIDADORES[k](v);
    if (error) errores[k] = error;
    else limpio[k] = structuredClone(v);
  }
  return { errores, limpio };
}

// Fusiona `parcial` (validado) sobre el archivo actual: las claves desconocidas del usuario se conservan.
export function guardarConfig(parcial, env = process.env) {
  const { errores, limpio } = validarConfig(parcial);
  if (Object.keys(errores).length) return { ok: false, errores };
  const ruta = rutaConfig(env);
  const actual = leerJsonUsuario(ruta);
  if (actual.error) return { ok: false, errores: { _: `${actual.error}. Corrígelo o bórralo antes de guardar desde el dashboard.` } };
  const base = esObjeto(actual.datos) ? actual.datos : {};
  const nuevo = { ...base, ...limpio };
  if (limpio.precios) nuevo.precios = { ...(esObjeto(base.precios) ? base.precios : {}), ...limpio.precios };
  escribirAtomico(ruta, textoJson(nuevo));
  return { ok: true, config: cargarConfig(env) };
}

export function asegurarConfig(env = process.env) {
  const ruta = rutaConfig(env);
  if (existsSync(ruta)) return;
  escribirAtomico(ruta, textoJson(CONFIG_DEFECTO));
}
```

- [ ] **Paso 5: correr los tests nuevos y toda la suite**

Ejecuta: `node --test tests/config-v2.test.mjs` y después `node --test`.
Esperado: todo PASS. `tests/hooks-v2.test.mjs` y `tests/setup.test.mjs` siguen verdes porque `cargarConfig` y `asegurarConfig` conservan su contrato.

- [ ] **Paso 6: commit**

```bash
git add plugins/orquestador/scripts/lib/rutas.mjs plugins/orquestador/scripts/lib/archivos.mjs plugins/orquestador/scripts/lib/config.mjs tests/config-v2.test.mjs
git commit -m "feat: configuración v2 con rúbrica, validación y guardado atómico"
```

---

### Tarea 2: efectos de la configuración en hooks y status line

**Archivos:**
- Modificar: `plugins/orquestador/scripts/statusline.mjs` (función `renderLinea`)
- Modificar: `plugins/orquestador/scripts/subagent-stop.mjs` (función `manejar`)
- Modificar: `plugins/orquestador/scripts/session-start.mjs`
- Modificar: `plugins/orquestador/skills/orquestar/SKILL.md` (sección 2)
- Crear: `tests/efectos-config.test.mjs`

**Interfaces:**
- Consume: `cargarConfig`, `normalizarRubrica` y `rubricaEsDeFabrica` (Tarea 1).
- Produce (`session-start.mjs`): `RUBRICA_PERSONALIZADA = 'Rúbrica personalizada del usuario (manda sobre la de la skill)'` y `textoRubrica(rubrica) → string|null` (null si es la de fábrica).
- Comportamiento: con `mostrarCosto:false` la status line no muestra `$…`; con `alertasModelo:false` SubagentStop no devuelve `systemMessage`, pero el evento `alerta` se sigue emitiendo.

- [ ] **Paso 1: escribir los tests que fallan**

`tests/efectos-config.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderLinea } from '../plugins/orquestador/scripts/statusline.mjs';
import { manejar as manejarStop } from '../plugins/orquestador/scripts/subagent-stop.mjs';
import { manejar as manejarInicioAgente } from '../plugins/orquestador/scripts/subagent-start.mjs';
import { manejarInicio, textoRubrica, RUBRICA_PERSONALIZADA } from '../plugins/orquestador/scripts/session-start.mjs';
import { estadoVacio, guardarEstado } from '../plugins/orquestador/scripts/lib/estado.mjs';
import { CONFIG_DEFECTO, RUBRICA_FABRICA } from '../plugins/orquestador/scripts/lib/config.mjs';
import { rutaConfig } from '../plugins/orquestador/scripts/lib/rutas.mjs';
import { leerEventos } from '../plugins/orquestador/scripts/lib/eventos.mjs';

const home = (config) => {
  const env = { ORQUESTADOR_HOME: mkdtempSync(join(tmpdir(), 'orq-efe-')) };
  if (config !== undefined) writeFileSync(rutaConfig(env), typeof config === 'string' ? config : JSON.stringify(config));
  return env;
};
const conActiva = () => {
  const e = estadoVacio('s');
  e.activas.tu1 = { agente: 'orquestador:investigador-rl', meta: 'm', modelo: 'haiku', esfuerzo: 'low', inicio: 1000, agentId: 'a1' };
  return e;
};
const transcript = (modelo) => JSON.stringify({ type: 'assistant', message: { id: 'm1', model: modelo, usage: { input_tokens: 10, output_tokens: 5 } } });

test('status line: mostrarCosto false oculta el costo', () => {
  const entrada = { model: { id: 'claude-opus-5-5' }, cost: { total_cost_usd: 0.42 } };
  assert.match(renderLinea(entrada, estadoVacio('s'), CONFIG_DEFECTO), /\$0\.42/);
  assert.doesNotMatch(renderLinea(entrada, estadoVacio('s'), { ...CONFIG_DEFECTO, mostrarCosto: false }), /\$/);
});

test('SubagentStop: con alertasModelo false no hay systemMessage, pero la alerta queda registrada', async () => {
  const env = home({ alertasModelo: false });
  guardarEstado(conActiva(), env);
  const ruta = join(env.ORQUESTADOR_HOME, 't.jsonl');
  writeFileSync(ruta, transcript('claude-sonnet-5-5'));
  assert.equal(await manejarStop({ session_id: 's', agent_id: 'a1', agent_transcript_path: ruta }, env), null);
  assert.deepEqual(leerEventos({ session: 's' }, env).map((e) => e.tipo), ['fin', 'alerta']);
});

test('SubagentStop: el evento fin lleva la ruta del transcript', async () => {
  const env = home();
  guardarEstado(conActiva(), env);
  const ruta = join(env.ORQUESTADOR_HOME, 'agent-a1.jsonl');
  writeFileSync(ruta, transcript('claude-haiku-5-5'));
  await manejarStop({ session_id: 's', agent_id: 'a1', agent_transcript_path: ruta }, env);
  assert.equal(leerEventos({ session: 's' }, env).find((e) => e.tipo === 'fin').transcript, ruta);
});

test('SubagentStart: una delegación externa emite delegacion y agente-inicio con id agente-<agentId>', async () => {
  const env = home();
  await manejarInicioAgente({ session_id: 's9', agent_id: 'x7', agent_type: 'Explore', transcript_path: join(env.ORQUESTADOR_HOME, 's9.jsonl') }, env);
  const evs = leerEventos({ session: 's9' }, env);
  assert.deepEqual(evs.map((e) => e.tipo), ['delegacion', 'agente-inicio']);
  assert.equal(evs[0].origenModelo, 'externo');
  assert.deepEqual([evs[1].id, evs[1].agentId], ['agente-x7', 'x7']);
  assert.equal(evs[1].transcript, join(env.ORQUESTADOR_HOME, 's9', 'subagents', 'agent-x7.jsonl'));
});

test('SessionStart: la rúbrica de fábrica no agrega nada; una personalizada agrega la tabla que manda', () => {
  assert.equal(textoRubrica(RUBRICA_FABRICA), null);
  const sin = manejarInicio({ session_id: 's' }, home(), '/raiz').hookSpecificOutput.additionalContext;
  assert.doesNotMatch(sin, /Rúbrica personalizada/);
  const propia = RUBRICA_FABRICA.map((f, i) => (i === 0 ? { ...f, modelo: 'sonnet', esfuerzo: 'medium' } : { ...f }));
  const con = manejarInicio({ session_id: 's' }, home({ rubrica: propia }), '/raiz').hookSpecificOutput.additionalContext;
  assert.ok(con.includes(RUBRICA_PERSONALIZADA));
  assert.match(con, /\| Mecánica \| `sonnet` \/ `medium` \|/);
  assert.match(con, /\| Máxima consecuencia \| `fable` \/ `high` \|/);
});

test('SessionStart: una rúbrica inválida o un config.json roto no rompen el hook', () => {
  const invalida = manejarInicio({ session_id: 's' }, home({ rubrica: [{ clase: 'Mecánica', modelo: 'gpt', esfuerzo: 'low' }] }), '/raiz');
  assert.doesNotMatch(invalida.hookSpecificOutput.additionalContext, /Rúbrica personalizada/);
  const roto = manejarInicio({ session_id: 's' }, home('{roto'), '/raiz');
  assert.match(roto.hookSpecificOutput.additionalContext, /orquestador:orquestar/);
});

test('la skill orquestar dice que la rúbrica personalizada manda', () => {
  const skill = readFileSync(fileURLToPath(new URL('../plugins/orquestador/skills/orquestar/SKILL.md', import.meta.url)), 'utf8');
  assert.match(skill, /Rúbrica personalizada del usuario/);
  assert.match(skill, /manda sobre esta tabla/);
});
```

- [ ] **Paso 2: correr los tests y ver que fallan**

Ejecuta: `node --test tests/efectos-config.test.mjs`
Esperado: FAIL (`textoRubrica` no existe; la status line muestra el costo aunque `mostrarCosto` sea false).

- [ ] **Paso 3: implementar**

En `scripts/statusline.mjs`, dentro de `renderLinea`, reemplaza:

```js
  if (typeof costo === 'number') partes.push(`$${costo.toFixed(2)}`);
```

por:

```js
  if (typeof costo === 'number' && config.mostrarCosto !== false) partes.push(`$${costo.toFixed(2)}`);
```

En `scripts/subagent-stop.mjs`, dentro de `manejar`, reemplaza:

```js
  return r.alerta ? { systemMessage: `[orquestador] ${r.alerta}` } : null;
```

por:

```js
  // alertasModelo:false silencia el aviso en la terminal; el evento `alerta` ya quedó en events.jsonl.
  return r.alerta && config.alertasModelo !== false ? { systemMessage: `[orquestador] ${r.alerta}` } : null;
```

En `scripts/session-start.mjs`:

1. Agrega a los imports:

   ```js
   import { cargarConfig, normalizarRubrica, rubricaEsDeFabrica } from './lib/config.mjs';
   ```

2. Agrega después de `CANAL_DASHBOARD`:

   ```js
   export const RUBRICA_PERSONALIZADA = 'Rúbrica personalizada del usuario (manda sobre la de la skill)';

   // Tabla Markdown con la rúbrica del usuario, o null si coincide con la de fábrica.
   export function textoRubrica(rubrica) {
     if (rubricaEsDeFabrica(rubrica)) return null;
     const filas = normalizarRubrica(rubrica).map((f) => `| ${f.clase} | \`${f.modelo}\` / \`${f.esfuerzo}\` |`);
     return [`${RUBRICA_PERSONALIZADA}:`, '', '| Clase de tarea | model / effort |', '|---|---|', ...filas].join('\n');
   }
   ```

3. Reemplaza la línea `return contexto('SessionStart', env.ORQUESTADOR_CANAL === 'dashboard' ? … : RECORDATORIO);` de `manejarInicio` por:

   ```js
   let rubrica = null;
   try { rubrica = textoRubrica(cargarConfig(env).rubrica); } catch { /* sin config legible manda la rúbrica de la skill */ }
   const partes = [RECORDATORIO, rubrica, env.ORQUESTADOR_CANAL === 'dashboard' ? CANAL_DASHBOARD : null].filter(Boolean);
   return contexto('SessionStart', partes.join('\n\n'));
   ```

En `skills/orquestar/SKILL.md`, al final de la sección `## 2. Rúbrica de modelo y esfuerzo` (después del párrafo que empieza con "Pasa **siempre**"), agrega:

```markdown
Si el contexto de inicio trae una **Rúbrica personalizada del usuario**, úsala: manda sobre esta tabla. Las clases son las mismas; solo cambian el modelo y el esfuerzo de cada una.
```

- [ ] **Paso 4: correr los tests nuevos y toda la suite**

Ejecuta: `node --test tests/efectos-config.test.mjs` y después `node --test`.
Esperado: todo PASS.

- [ ] **Paso 5: commit**

```bash
git add plugins/orquestador/scripts/statusline.mjs plugins/orquestador/scripts/subagent-stop.mjs plugins/orquestador/scripts/session-start.mjs plugins/orquestador/skills/orquestar/SKILL.md tests/efectos-config.test.mjs
git commit -m "feat: la config controla costo, alertas de modelo y rúbrica inyectada"
```

---

### Tarea 3: procesos `claude` auxiliares y su binario falso

**Archivos:**
- Crear: `tests/fixtures/claude-falso-cli.mjs`
- Crear: `plugins/orquestador/dashboard/cli-claude.mjs`
- Modificar: `plugins/orquestador/dashboard/conversaciones.mjs` (clase `ErrorConversacion`)
- Modificar: `plugins/orquestador/scripts/session-start.mjs` (función `manejarInicio`)
- Crear: `tests/cli-claude.test.mjs`

**Interfaces:**
- Consume: `resolverBinario(config, env)` e `invocacion(binario, args) → { comando, args, shell }` de `proceso-claude.mjs`; `cargarConfig` (Tarea 1).
- Produce (`conversaciones.mjs`): `new ErrorConversacion(status, mensaje, extra = null)`; `extra` (por ejemplo `{ errores }`) se suma al cuerpo JSON del error en la Tarea 9.
- Produce (`cli-claude.mjs`):
  - `entornoAuxiliar(env) → env` (copia sin `CLAUDECODE` y con `ORQUESTADOR_CANAL: ''`).
  - `citarParaShell(arg) → string` (citado de argumentos para un `claude.cmd` en Windows).
  - `ejecutarClaude(args, { env, entrada, timeoutMs, spawnFn, binario, cwd }) → Promise<{ codigo, stdout, stderr }>`. Un código distinto de 0 **no** rechaza (lo decide quien llama). Rechaza con `ErrorConversacion` 503 si no hay binario, 504 si se pasa del tiempo y 502 si no se pudo lanzar.
- Produce (`claude-falso-cli.mjs`): responde a `auto-mode defaults` (3 allow, 4 soft_deny y 1 hard_deny), `auto-mode config`, `auto-mode critique` (texto con "Sugerencia"), `auto-mode reset -y` (borra `autoMode` de `$CLAUDE_CONFIG_DIR/settings.json`) y `-p … --json-schema` (lee el prompt por stdin). Variables: `FALSO_CLI_REGISTRO`, `FALSO_CLI_MODO` (`estructurado`, `solo-result`, `is-error`, `error`, `basura`), `FALSO_CLI_DEMORA_MS` y `FALSO_CLI_DEFAULTS`.
- Comportamiento nuevo de `session-start.mjs`: con `ORQUESTADOR_CANAL === ''` (proceso auxiliar del dashboard) no emite el evento `sesion` ni inyecta contexto, para no ensuciar la vista Actividad con sesiones de `auto-mode` o de "Redactar con Claude".

- [ ] **Paso 1: crear el binario falso**

`tests/fixtures/claude-falso-cli.mjs`:

```js
#!/usr/bin/env node
// Claude Code falso para los procesos auxiliares del dashboard (nunca gasta uso):
//   auto-mode defaults | config | critique | reset -y   y   -p … --json-schema <schema> (prompt por stdin).
// Variables: FALSO_CLI_REGISTRO (JSONL con argv, canal, CLAUDECODE y stdin de cada invocación),
//   FALSO_CLI_MODO (estructurado | solo-result | is-error | error | basura; solo para -p),
//   FALSO_CLI_DEMORA_MS (espera antes de responder) y FALSO_CLI_DEFAULTS (JSON que reemplaza las reglas de fábrica).
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const FABRICA = {
  environment: ['Source control: (sin configurar)', 'Trusted internal domains: (sin configurar)'],
  allow: ['Read-Only Operations: leer archivos y listar directorios', 'Local Operations: editar archivos dentro del repo', 'Declared Dependencies: instalar las dependencias declaradas'],
  soft_deny: ['Git Destructive: force-push o reescritura de historia', 'Production Deploy: desplegar a producción', 'Credential Leakage: leer o enviar credenciales', 'Out-of-Repo Deletion: borrar fuera del repo'],
  hard_deny: ['Data Exfiltration: enviar datos sensibles fuera del entorno de confianza'],
};
const args = process.argv.slice(2);
const sinBom = (t) => (t.charCodeAt(0) === 0xfeff ? t.slice(1) : t);
const rutaSettings = () => join(process.env.CLAUDE_CONFIG_DIR ?? '.', 'settings.json');
const leerSettings = () => (existsSync(rutaSettings()) ? JSON.parse(sinBom(readFileSync(rutaSettings(), 'utf8'))) : {});
const fabrica = () => (process.env.FALSO_CLI_DEFAULTS ? JSON.parse(readFileSync(process.env.FALSO_CLI_DEFAULTS, 'utf8')) : FABRICA);
const salida = (t) => process.stdout.write(`${t}\n`);

// Lo que imprimiría `claude auto-mode config`: las reglas propias con "$defaults" expandido.
function efectiva() {
  const am = leerSettings().autoMode ?? {};
  const f = fabrica();
  const expandir = (k) => (Array.isArray(am[k]) ? am[k].flatMap((x) => (x === '$defaults' ? f[k] : [x])) : f[k]);
  return { environment: expandir('environment'), allow: expandir('allow'), soft_deny: expandir('soft_deny'), hard_deny: expandir('hard_deny') };
}

function redactar(stdin) {
  const modo = process.env.FALSO_CLI_MODO || 'estructurado';
  if (modo === 'error') { process.stderr.write('Error: límite de uso alcanzado\n'); process.exitCode = 1; return; }
  if (modo === 'basura') { salida('esto no es json'); return; }
  if (modo === 'is-error') { salida(JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'No se pudo completar' })); return; }
  const nombre = /Nombre: (.+)/.exec(stdin)?.[1] ?? 'agente';
  const secciones = {
    rol: `Rol redactado para ${nombre}. Trabaja con método y sin relleno.`,
    metodo: '1. Lee el encargo.\n2. Hace el trabajo.\n3. Verifica el resultado.',
    entregable: 'Un informe breve con lo hecho.',
    restricciones: '- No inventa datos.',
    retorno: 'Máximo 300 palabras: resumen, hallazgos y pendientes.',
  };
  const r = { type: 'result', subtype: 'success', is_error: false, result: modo === 'solo-result' ? JSON.stringify(secciones) : 'listo' };
  if (modo === 'estructurado') r.structured_output = secciones;
  salida(JSON.stringify(r));
}

function responder(stdin) {
  if (process.env.FALSO_CLI_REGISTRO) {
    appendFileSync(process.env.FALSO_CLI_REGISTRO, `${JSON.stringify({ argv: args, canal: process.env.ORQUESTADOR_CANAL ?? null, claudecode: process.env.CLAUDECODE ?? null, stdin })}\n`);
  }
  const [a, b] = args;
  if (a === 'auto-mode' && b === 'defaults') return salida(JSON.stringify(fabrica(), null, 2));
  if (a === 'auto-mode' && b === 'config') return salida(JSON.stringify(efectiva(), null, 2));
  if (a === 'auto-mode' && b === 'critique') return salida('Revisión de tus reglas: están bien acotadas. Sugerencia: escribe la ruta completa en las reglas que nombran carpetas.');
  if (a === 'auto-mode' && b === 'reset' && (args.includes('-y') || args.includes('--yes'))) {
    const s = leerSettings();
    delete s.autoMode;
    if (existsSync(rutaSettings())) writeFileSync(rutaSettings(), `${JSON.stringify(s, null, 2)}\n`);
    return salida('Se restableció la configuración del modo automático.');
  }
  if (args.includes('-p') && args.includes('--json-schema')) return redactar(stdin);
  process.stderr.write(`claude-falso-cli: comando desconocido: ${args.join(' ')}\n`);
  process.exitCode = 2;
  return undefined;
}

let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { stdin += d; });
process.stdin.on('end', () => setTimeout(() => responder(stdin), Number(process.env.FALSO_CLI_DEMORA_MS) || 0));
```

- [ ] **Paso 2: escribir los tests que fallan**

`tests/cli-claude.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ejecutarClaude, entornoAuxiliar, citarParaShell } from '../plugins/orquestador/dashboard/cli-claude.mjs';
import { ErrorConversacion } from '../plugins/orquestador/dashboard/conversaciones.mjs';
import { manejarInicio } from '../plugins/orquestador/scripts/session-start.mjs';
import { leerEventos } from '../plugins/orquestador/scripts/lib/eventos.mjs';

const FALSO_CLI = fileURLToPath(new URL('./fixtures/claude-falso-cli.mjs', import.meta.url));

// Carpeta con espacio y acento: así se prueba también la ruta de Windows con espacios.
function entornoCli(extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'orq cli ñ-'));
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ rutaClaude: 'claude-falso' }));
  const registro = join(dir, 'registro.jsonl');
  const env = { ...process.env, ORQUESTADOR_HOME: dir, CLAUDE_CONFIG_DIR: dir, CLAUDECODE: '1', ORQUESTADOR_CANAL: 'dashboard', FALSO_CLI_REGISTRO: registro, ...extra };
  const spawnFn = (_bin, args, opciones) => spawn(process.execPath, [FALSO_CLI, ...args], opciones);
  const leer = () => (existsSync(registro) ? readFileSync(registro, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
  return { dir, env, spawnFn, leer };
}
const rechazaCon = (promesa, status, patron) => assert.rejects(promesa, (e) => e instanceof ErrorConversacion && e.status === status && patron.test(e.message));

test('ErrorConversacion lleva status y un extra opcional', () => {
  const e = new ErrorConversacion(400, 'mal', { errores: { a: 'b' } });
  assert.deepEqual([e.status, e.message, e.extra], [400, 'mal', { errores: { a: 'b' } }]);
  assert.equal(new ErrorConversacion(404, 'x').extra, null);
});

test('entornoAuxiliar: sin CLAUDECODE y con ORQUESTADOR_CANAL vacío', () => {
  const e = entornoAuxiliar({ CLAUDECODE: '1', ORQUESTADOR_CANAL: 'dashboard', PATH: '/x' });
  assert.deepEqual(e, { ORQUESTADOR_CANAL: '', PATH: '/x' });
});

test('citarParaShell: vacío, espacios, comillas y barra final', () => {
  assert.equal(citarParaShell('sonnet'), 'sonnet');
  assert.equal(citarParaShell(''), '""');
  assert.equal(citarParaShell('a b'), '"a b"');
  assert.equal(citarParaShell('{"x":"y z"}'), '"{\\"x\\":\\"y z\\"}"');
  assert.equal(citarParaShell('C:\\Mi Carpeta\\'), '"C:\\Mi Carpeta\\\\"');
});

test('auto-mode defaults con el binario falso: JSON, canal vacío y sin CLAUDECODE', async () => {
  const { env, spawnFn, leer } = entornoCli();
  const r = await ejecutarClaude(['auto-mode', 'defaults'], { env, spawnFn });
  assert.equal(r.codigo, 0);
  const reglas = JSON.parse(r.stdout);
  assert.deepEqual([reglas.allow.length, reglas.soft_deny.length, reglas.hard_deny.length], [3, 4, 1]);
  const [inv] = leer();
  assert.deepEqual([inv.argv, inv.canal, inv.claudecode], [['auto-mode', 'defaults'], '', null]);
});

test('auto-mode config expande "$defaults" de settings.json', async () => {
  const { env, spawnFn, dir } = entornoCli();
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ autoMode: { allow: ['$defaults', 'Mía: x'] } }));
  const r = await ejecutarClaude(['auto-mode', 'config'], { env, spawnFn });
  assert.equal(JSON.parse(r.stdout).allow.length, 4);
});

test('un argumento vacío, un JSON con comillas y la entrada por stdin llegan intactos', async () => {
  const { env, spawnFn, leer } = entornoCli();
  const args = ['-p', '--tools', '', '--json-schema', '{"a":"b c"}'];
  const entrada = 'Nombre: Ñandú "x"\nlínea 2 \\ fin';
  await ejecutarClaude(args, { env, spawnFn, entrada });
  const [inv] = leer();
  assert.deepEqual(inv.argv, args);
  assert.equal(inv.stdin, entrada);
});

test('un código distinto de 0 se devuelve con stderr, sin rechazar', async () => {
  const { env, spawnFn } = entornoCli();
  const r = await ejecutarClaude(['inventado'], { env, spawnFn });
  assert.equal(r.codigo, 2);
  assert.match(r.stderr, /comando desconocido/);
});

test('tiempo agotado: 504 y el proceso se termina', async () => {
  const { env, spawnFn } = entornoCli({ FALSO_CLI_DEMORA_MS: '3000' });
  await rechazaCon(ejecutarClaude(['auto-mode', 'critique'], { env, spawnFn, timeoutMs: 200 }), 504, /no respondió/);
});

test('sin binario: 503 con el mensaje de rutaClaude', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'orq-cli-sin-'));
  await rechazaCon(ejecutarClaude(['auto-mode', 'defaults'], { env: { ORQUESTADOR_HOME: dir, PATH: '', Path: '' } }), 503, /No encontré el binario de Claude Code/);
});

test('session-start en un proceso auxiliar (ORQUESTADOR_CANAL vacío) no emite sesion ni inyecta contexto', () => {
  const env = { ORQUESTADOR_HOME: mkdtempSync(join(tmpdir(), 'orq-aux-')), ORQUESTADOR_CANAL: '' };
  assert.equal(manejarInicio({ session_id: 'aux' }, env, '/raiz'), null);
  assert.deepEqual(leerEventos({ session: 'aux' }, env), []);
});
```

- [ ] **Paso 3: correr los tests y ver que fallan**

Ejecuta: `node --test tests/cli-claude.test.mjs`
Esperado: FAIL con `Cannot find module …/dashboard/cli-claude.mjs`.

- [ ] **Paso 4: implementar**

En `dashboard/conversaciones.mjs`, reemplaza la clase por:

```js
export class ErrorConversacion extends Error {
  // extra: datos que acompañan al error en la respuesta JSON (p. ej. { errores: { campo: mensaje } }).
  constructor(status, mensaje, extra = null) { super(mensaje); this.status = status; this.extra = extra; }
}
```

Crea `dashboard/cli-claude.mjs`:

```js
// Procesos `claude` auxiliares del dashboard (auto-mode y "Redactar con Claude"): cortos, sin canal y con tiempo máximo.
import { spawn as spawnNodo } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { tmpdir } from 'node:os';
import { cargarConfig } from '../scripts/lib/config.mjs';
import { resolverBinario, invocacion } from './proceso-claude.mjs';
import { ErrorConversacion } from './conversaciones.mjs';

// El hijo no debe creerse anidado (CLAUDECODE) ni recibir las instrucciones del canal dashboard.
export function entornoAuxiliar(env = process.env) {
  const e = { ...env, ORQUESTADOR_CANAL: '' };
  delete e.CLAUDECODE;
  return e;
}

// Un .cmd corre a través de cmd.exe, que no cita nada: sin esto, `--tools ""` desaparece y un JSON con comillas se rompe.
// Reglas de citado de MSVCRT: las comillas internas se escapan con \ y las barras que preceden a una comilla se duplican.
export function citarParaShell(arg) {
  const s = String(arg);
  if (s && !/[\s"^&|<>()%!]/.test(s)) return s;
  return `"${s.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`;
}

export function ejecutarClaude(args, { env = process.env, entrada = null, timeoutMs = 30_000, spawnFn = spawnNodo, binario, cwd = tmpdir() } = {}) {
  const bin = binario ?? resolverBinario(cargarConfig(env), env);
  if (!bin) return Promise.reject(new ErrorConversacion(503, 'No encontré el binario de Claude Code; define rutaClaude en config.json'));
  const { comando, args: argv, shell } = invocacion(bin, args);
  return new Promise((ok, mal) => {
    let hijo;
    try {
      hijo = spawnFn(comando, shell ? argv.map(citarParaShell) : argv, { cwd, env: entornoAuxiliar(env), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell });
    } catch (e) {
      mal(new ErrorConversacion(502, `No se pudo ejecutar Claude Code: ${e.message}`));
      return;
    }
    const dOut = new StringDecoder('utf8');
    const dErr = new StringDecoder('utf8');
    let stdout = '';
    let stderr = '';
    let listo = false;
    const terminar = (fn) => { if (listo) return; listo = true; clearTimeout(reloj); fn(); };
    const reloj = setTimeout(() => terminar(() => {
      try { hijo.kill(); } catch { /* ya terminó */ }
      mal(new ErrorConversacion(504, `Claude Code no respondió en ${Math.ceil(timeoutMs / 1000)} s`));
    }), timeoutMs);
    hijo.stdout?.on('data', (d) => { stdout += dOut.write(d); });
    hijo.stderr?.on('data', (d) => { stderr = (stderr + dErr.write(d)).slice(-4000); });
    hijo.stdin?.on('error', () => {});
    hijo.on('error', (e) => terminar(() => mal(new ErrorConversacion(502, `No se pudo ejecutar Claude Code: ${e.message}`))));
    hijo.on('close', (codigo) => terminar(() => ok({ codigo, stdout: stdout + dOut.end(), stderr: (stderr + dErr.end()).trim() })));
    hijo.stdin?.end(entrada ?? undefined);
  });
}
```

En `scripts/session-start.mjs`, agrega como **primera línea** del cuerpo de `manejarInicio`:

```js
  if (env.ORQUESTADOR_CANAL === '') return null; // proceso auxiliar del dashboard (auto-mode, redactar): ni evento ni contexto
```

- [ ] **Paso 5: correr los tests nuevos y toda la suite**

Ejecuta: `node --test tests/cli-claude.test.mjs` y después `node --test`.
Esperado: todo PASS. (`ORQUESTADOR_CANAL` sin definir, que es el caso de la terminal, sigue inyectando el recordatorio.)

- [ ] **Paso 6: commit**

```bash
git add tests/fixtures/claude-falso-cli.mjs plugins/orquestador/dashboard/cli-claude.mjs plugins/orquestador/dashboard/conversaciones.mjs plugins/orquestador/scripts/session-start.mjs tests/cli-claude.test.mjs
git commit -m "feat: procesos claude auxiliares con timeout y binario falso para tests"
```

---

### Tarea 4: modo automático (`automodo.mjs`)

**Archivos:**
- Crear: `plugins/orquestador/dashboard/automodo.mjs`
- Crear: `tests/automodo.test.mjs`

**Interfaces:**
- Consume: `rutaSettingsUsuario`, `leerJsonUsuario`, `escribirAtomico`, `textoJson`, `respaldar` (Tarea 1); `ejecutarClaude` y `ErrorConversacion(status, mensaje, extra)` (Tarea 3).
- Produce:
  - Constantes `DEFECTOS = '$defaults'`, `SUFIJO_RESPALDO = '.orquestador.bak'` y `PREFIJOS = { repos: 'Source control: ', dominios: 'Trusted internal domains: ', organizacion: 'Organization: ' }`.
  - `entornoAProsa({ repos, dominios, organizacion }) → string[]`: una entrada por prefijo, con los valores separados por `, `.
  - `prosaAEntorno(entradas) → { repos, dominios, organizacion, otras }`. Ignora `$defaults`; lo que no sigue un prefijo va a `otras`, sin cambios.
  - `leerAutoModo(env) → { personalizadas: { permitir, detener, entorno: { repos, dominios, organizacion }, otrasEntorno }, classifyAllShell, defaultModeTerminal, sinFabrica: string[], errorSettings: string|null }`.
  - `validarAutoModo(cuerpo) → { errores, limpio }` y `escribirAutoModo(cuerpo, env) → leerAutoModo(env)`. Lanza 400 con `extra.errores` o 409 si `settings.json` no es JSON válido.
  - `parsearReglas(texto) → { environment, allow, soft_deny, hard_deny }` (tolera el envoltorio `{ autoMode: … }`) y `etiquetaRegla(texto) → string` (lo que va antes de `:`).
  - `crearAutoModo({ env, spawnFn, ahora }) → { estado(), guardar(cuerpo), critica(), restablecer(cuerpo), fabrica() }`, todos async:
    - `estado()` devuelve lo de `leerAutoModo` más `conteosFabrica: { allow, soft_deny, hard_deny } | null`, `disponible` y `motivo`.
    - `critica()` devuelve `{ texto }`.
    - `fabrica()` devuelve `{ allow: string[], soft_deny: string[], hard_deny: string[] }` con las etiquetas.

- [ ] **Paso 1: escribir los tests que fallan**

`tests/automodo.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  entornoAProsa, prosaAEntorno, leerAutoModo, escribirAutoModo, parsearReglas, etiquetaRegla, crearAutoModo, SUFIJO_RESPALDO,
} from '../plugins/orquestador/dashboard/automodo.mjs';
import { rutaSettingsUsuario } from '../plugins/orquestador/scripts/lib/rutas.mjs';
import { ErrorConversacion } from '../plugins/orquestador/dashboard/conversaciones.mjs';

const FALSO_CLI = fileURLToPath(new URL('./fixtures/claude-falso-cli.mjs', import.meta.url));

// CLAUDE_CONFIG_DIR con espacios y acentos, como un perfil de Windows.
function entorno(settings) {
  const dir = mkdtempSync(join(tmpdir(), 'orq auto ñ-'));
  const claude = join(dir, 'Claude Config');
  mkdirSync(claude);
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ rutaClaude: 'claude-falso' }));
  const env = { ...process.env, ORQUESTADOR_HOME: dir, CLAUDE_CONFIG_DIR: claude, FALSO_CLI_REGISTRO: join(dir, 'registro.jsonl') };
  if (settings !== undefined) writeFileSync(rutaSettingsUsuario(env), settings);
  const spawnFn = (_bin, args, opciones) => spawn(process.execPath, [FALSO_CLI, ...args], opciones);
  const invocaciones = () => (existsSync(env.FALSO_CLI_REGISTRO) ? readFileSync(env.FALSO_CLI_REGISTRO, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
  const leer = () => JSON.parse(readFileSync(rutaSettingsUsuario(env), 'utf8'));
  return { env, spawnFn, invocaciones, leer };
}
const rechaza = (fn, status) => assert.rejects(async () => fn(), (e) => e instanceof ErrorConversacion && e.status === status);

test('entorno de confianza: ida y vuelta en prosa; "$defaults" fuera y las otras entradas se conservan', () => {
  const prosa = entornoAProsa({ repos: ['github.com/GonzaloFuentes1/*', 'gitlab.com/x'], dominios: ['cenia.cl'], organizacion: 'CENIA' });
  assert.deepEqual(prosa, ['Source control: github.com/GonzaloFuentes1/*, gitlab.com/x', 'Trusted internal domains: cenia.cl', 'Organization: CENIA']);
  assert.deepEqual(prosaAEntorno(['$defaults', ...prosa, 'Uso Kubernetes interno']), {
    repos: ['github.com/GonzaloFuentes1/*', 'gitlab.com/x'], dominios: ['cenia.cl'], organizacion: 'CENIA', otras: ['Uso Kubernetes interno'],
  });
  assert.deepEqual(entornoAProsa({}), []);
  assert.deepEqual(prosaAEntorno(undefined), { repos: [], dominios: [], organizacion: '', otras: [] });
});

test('escribir: BOM, claves ajenas y hard_deny propio se conservan; respaldo idéntico; indentación de 2', () => {
  const original = '\uFEFF' + JSON.stringify({
    model: 'opus', hooks: { Stop: [] }, permissions: { allow: ['Bash(npm test)'], deny: ['Read(.env)'] },
    autoMode: { hard_deny: ['$defaults', 'Nunca borres datasets/'], environment: ['$defaults', 'Uso Kubernetes interno'], allow: ['vieja'] },
  }, null, 4);
  const { env, leer } = entorno(original);
  const r = escribirAutoModo({
    permitir: ['Correr uv run en bench/'], detener: ['Cualquier gh pr merge'],
    entorno: { repos: ['github.com/GonzaloFuentes1/*'], dominios: [], organizacion: '' }, classifyAllShell: true, defaultModeTerminal: false,
  }, env);
  const s = leer();
  assert.equal(s.model, 'opus');
  assert.deepEqual(s.hooks, { Stop: [] });
  assert.deepEqual(s.permissions, { allow: ['Bash(npm test)'], deny: ['Read(.env)'] });
  assert.deepEqual(s.autoMode.hard_deny, ['$defaults', 'Nunca borres datasets/']);
  assert.deepEqual(s.autoMode.allow, ['$defaults', 'Correr uv run en bench/']);
  assert.deepEqual(s.autoMode.soft_deny, ['$defaults', 'Cualquier gh pr merge']);
  assert.deepEqual(s.autoMode.environment, ['$defaults', 'Source control: github.com/GonzaloFuentes1/*', 'Uso Kubernetes interno']);
  assert.equal(s.autoMode.classifyAllShell, true);
  assert.equal(readFileSync(rutaSettingsUsuario(env) + SUFIJO_RESPALDO, 'utf8'), original);
  assert.match(readFileSync(rutaSettingsUsuario(env), 'utf8'), /^\{\n {2}"model"/);
  assert.deepEqual(r.personalizadas.permitir, ['Correr uv run en bench/']);
  assert.deepEqual(r.personalizadas.otrasEntorno, ['Uso Kubernetes interno']);
});

test('defaultModeTerminal: escribe y quita permissions.defaultMode sin tocar permissions.allow', () => {
  const { env, leer } = entorno(JSON.stringify({ permissions: { allow: ['Read'] } }));
  escribirAutoModo({ defaultModeTerminal: true }, env);
  assert.deepEqual(leer().permissions, { allow: ['Read'], defaultMode: 'auto' });
  assert.equal(leerAutoModo(env).defaultModeTerminal, true);
  escribirAutoModo({ defaultModeTerminal: false }, env);
  assert.deepEqual(leer().permissions, { allow: ['Read'] });
});

test('settings.json inválido: 409, no se escribe ni se respalda; ausente: se crea sin respaldo', async () => {
  const { env } = entorno('{roto');
  await rechaza(() => escribirAutoModo({ permitir: [] }, env), 409);
  assert.equal(readFileSync(rutaSettingsUsuario(env), 'utf8'), '{roto');
  assert.equal(existsSync(rutaSettingsUsuario(env) + SUFIJO_RESPALDO), false);
  assert.match(leerAutoModo(env).errorSettings, /no es JSON válido/);
  const nuevo = entorno();
  escribirAutoModo({ permitir: ['x'] }, nuevo.env);
  assert.deepEqual(nuevo.leer(), { autoMode: { environment: ['$defaults'], allow: ['$defaults', 'x'], soft_deny: ['$defaults'] } });
  assert.equal(existsSync(rutaSettingsUsuario(nuevo.env) + SUFIJO_RESPALDO), false);
});

test('validación: "$defaults" propio, comas en repos y saltos de línea dan 400 con errores por campo', async () => {
  const { env } = entorno();
  const con = (cuerpo, campo) => assert.rejects(async () => escribirAutoModo(cuerpo, env), (e) => e.status === 400 && !!e.extra?.errores?.[campo]);
  await con({ permitir: ['$defaults'] }, 'permitir');
  await con({ entorno: { repos: ['a, b'] } }, 'repos');
  await con({ detener: ['dos\nlíneas'] }, 'detener');
  await con({ classifyAllShell: 'sí' }, 'classifyAllShell');
  assert.equal(existsSync(rutaSettingsUsuario(env)), false);
});

test('leerAutoModo marca los arreglos propios que reemplazan los de fábrica', () => {
  const { env } = entorno(JSON.stringify({ autoMode: { allow: ['solo esta'], soft_deny: ['$defaults', 'y esta'] } }));
  const a = leerAutoModo(env);
  assert.deepEqual(a.sinFabrica, ['allow']);
  assert.deepEqual([a.personalizadas.permitir, a.personalizadas.detener], [['solo esta'], ['y esta']]);
});

test('parsearReglas y etiquetaRegla', () => {
  assert.deepEqual(parsearReglas(JSON.stringify({ autoMode: { allow: ['a: b'], hard_deny: ['c'] } })), { environment: [], allow: ['a: b'], soft_deny: [], hard_deny: ['c'] });
  assert.throws(() => parsearReglas('no json'), (e) => e.status === 502);
  assert.equal(etiquetaRegla('Git Destructive: force-push'), 'Git Destructive');
  assert.equal(etiquetaRegla('Sin etiqueta'), 'Sin etiqueta');
});

test('estado: conteos del binario falso con caché de 10 minutos; fabrica usa la misma caché', async () => {
  let t = 0;
  const { env, spawnFn, invocaciones } = entorno();
  const am = crearAutoModo({ env, spawnFn, ahora: () => t });
  const e1 = await am.estado();
  assert.deepEqual([e1.disponible, e1.conteosFabrica], [true, { allow: 3, soft_deny: 4, hard_deny: 1 }]);
  await am.estado();
  assert.deepEqual((await am.fabrica()).hard_deny, ['Data Exfiltration']);
  assert.equal(invocaciones().length, 1);
  t = 10 * 60 * 1000 + 1;
  await am.estado();
  assert.equal(invocaciones().length, 2);
  assert.deepEqual(invocaciones()[0].argv, ['auto-mode', 'defaults']);
});

test('sin binario: disponible false con el motivo, y las reglas propias se leen igual', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'orq-auto-sin-'));
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ autoMode: { allow: ['$defaults', 'x'] } }));
  const e = await crearAutoModo({ env: { ORQUESTADOR_HOME: dir, CLAUDE_CONFIG_DIR: dir, PATH: '', Path: '' } }).estado();
  assert.equal(e.disponible, false);
  assert.match(e.motivo, /No encontré el binario/);
  assert.deepEqual(e.personalizadas.permitir, ['x']);
  assert.equal(e.conteosFabrica, null);
});

test('critica: devuelve el texto de `claude auto-mode critique`', async () => {
  const { env, spawnFn, invocaciones } = entorno();
  assert.match((await crearAutoModo({ env, spawnFn }).critica()).texto, /Sugerencia/);
  assert.deepEqual(invocaciones()[0].argv, ['auto-mode', 'critique']);
});

test('restablecer: sin {confirmar:true} da 400 y no hace nada; con confirmación respalda y corre reset -y', async () => {
  const original = JSON.stringify({ model: 'opus', autoMode: { allow: ['$defaults', 'x'] } });
  const { env, spawnFn, invocaciones, leer } = entorno(original);
  const am = crearAutoModo({ env, spawnFn });
  await rechaza(() => am.restablecer({}), 400);
  await rechaza(() => am.restablecer({ confirmar: 'true' }), 400);
  assert.equal(invocaciones().length, 0);
  assert.equal(readFileSync(rutaSettingsUsuario(env), 'utf8'), original);
  const e = await am.restablecer({ confirmar: true });
  assert.deepEqual(leer(), { model: 'opus' });
  assert.equal(readFileSync(rutaSettingsUsuario(env) + SUFIJO_RESPALDO, 'utf8'), original);
  assert.deepEqual(invocaciones().map((i) => i.argv), [['auto-mode', 'reset', '-y'], ['auto-mode', 'defaults']]);
  assert.deepEqual(e.personalizadas.permitir, []);
});
```

- [ ] **Paso 2: correr los tests y ver que fallan**

Ejecuta: `node --test tests/automodo.test.mjs`
Esperado: FAIL con `Cannot find module …/dashboard/automodo.mjs`.

- [ ] **Paso 3: implementar**

`dashboard/automodo.mjs`:

```js
// Modo automático de Claude Code: la sección autoMode de ~/.claude/settings.json (solo de usuario) y `claude auto-mode`.
// Nunca toca hard_deny ni permissions.allow/deny; respalda antes de escribir y conserva todas las demás claves.
import { rutaSettingsUsuario } from '../scripts/lib/rutas.mjs';
import { leerJsonUsuario, escribirAtomico, textoJson, respaldar } from '../scripts/lib/archivos.mjs';
import { ejecutarClaude } from './cli-claude.mjs';
import { ErrorConversacion } from './conversaciones.mjs';

export const DEFECTOS = '$defaults';
export const SUFIJO_RESPALDO = '.orquestador.bak';
export const PREFIJOS = Object.freeze({ repos: 'Source control: ', dominios: 'Trusted internal domains: ', organizacion: 'Organization: ' });
const CACHE_MS = 10 * 60 * 1000;
const MAX_REGLAS = 50;
const MAX_REGLA = 500;

const esObjeto = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const textos = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
const sinDefectos = (v) => textos(v).filter((x) => x !== DEFECTOS);
const separar = (t) => t.split(',').map((x) => x.trim()).filter(Boolean);
const ultimaLinea = (t) => String(t ?? '').trim().split('\n').filter(Boolean).pop() ?? '';

export function entornoAProsa({ repos = [], dominios = [], organizacion = '' } = {}) {
  const out = [];
  if (repos.length) out.push(`${PREFIJOS.repos}${repos.join(', ')}`);
  if (dominios.length) out.push(`${PREFIJOS.dominios}${dominios.join(', ')}`);
  if (String(organizacion ?? '').trim()) out.push(`${PREFIJOS.organizacion}${String(organizacion).trim()}`);
  return out;
}

export function prosaAEntorno(entradas) {
  const r = { repos: [], dominios: [], organizacion: '', otras: [] };
  for (const e of sinDefectos(entradas)) {
    if (e.startsWith(PREFIJOS.repos)) r.repos.push(...separar(e.slice(PREFIJOS.repos.length)));
    else if (e.startsWith(PREFIJOS.dominios)) r.dominios.push(...separar(e.slice(PREFIJOS.dominios.length)));
    else if (e.startsWith(PREFIJOS.organizacion) && !r.organizacion) r.organizacion = e.slice(PREFIJOS.organizacion.length).trim();
    else r.otras.push(e);
  }
  return r;
}

export function leerAutoModo(env = process.env) {
  const { datos, error } = leerJsonUsuario(rutaSettingsUsuario(env));
  const s = esObjeto(datos) ? datos : {};
  const am = esObjeto(s.autoMode) ? s.autoMode : {};
  const { otras, ...entorno } = prosaAEntorno(am.environment);
  return {
    personalizadas: { permitir: sinDefectos(am.allow), detener: sinDefectos(am.soft_deny), entorno, otrasEntorno: otras },
    classifyAllShell: am.classifyAllShell === true,
    defaultModeTerminal: s.permissions?.defaultMode === 'auto',
    // Arreglos propios sin "$defaults": hoy reemplazan las reglas de fábrica; guardar desde el dashboard las vuelve a incluir.
    sinFabrica: ['environment', 'allow', 'soft_deny'].filter((k) => Array.isArray(am[k]) && am[k].length > 0 && !am[k].includes(DEFECTOS)),
    errorSettings: error ?? (datos != null && !esObjeto(datos) ? 'settings.json no contiene un objeto JSON' : null),
  };
}

function reglas(v, campo, errores) {
  if (!Array.isArray(v)) { errores[campo] = 'Debe ser una lista'; return []; }
  const limpias = v.map((x) => (typeof x === 'string' ? x.trim() : ''));
  if (limpias.some((x) => !x || x.length > MAX_REGLA || x.includes('\n'))) errores[campo] = `Cada regla debe tener entre 1 y ${MAX_REGLA} caracteres, en una línea`;
  else if (limpias.includes(DEFECTOS)) errores[campo] = '"$defaults" lo agrega el dashboard; no lo escribas';
  else if (limpias.length > MAX_REGLAS) errores[campo] = `Máximo ${MAX_REGLAS} reglas`;
  return [...new Set(limpias)];
}

function valores(v, campo, errores) {
  if (!Array.isArray(v)) { errores[campo] = 'Debe ser una lista'; return []; }
  const limpios = v.map((x) => (typeof x === 'string' ? x.trim() : ''));
  if (limpios.some((x) => !x || x.length > 200 || /[,\n]/.test(x))) errores[campo] = 'Un valor por entrada, sin comas ni saltos de línea (máx. 200 caracteres)';
  return [...new Set(limpios)];
}

export function validarAutoModo(cuerpo) {
  const c = esObjeto(cuerpo) ? cuerpo : {};
  const errores = {};
  const entorno = esObjeto(c.entorno) ? c.entorno : {};
  let organizacion = '';
  if (entorno.organizacion != null) {
    if (typeof entorno.organizacion !== 'string' || entorno.organizacion.trim().length > 200 || entorno.organizacion.includes('\n')) errores.organizacion = 'Máximo 200 caracteres, en una línea';
    else organizacion = entorno.organizacion.trim();
  }
  for (const k of ['classifyAllShell', 'defaultModeTerminal']) if (c[k] !== undefined && typeof c[k] !== 'boolean') errores[k] = 'Debe ser verdadero o falso';
  const limpio = {
    permitir: reglas(c.permitir ?? [], 'permitir', errores),
    detener: reglas(c.detener ?? [], 'detener', errores),
    entorno: { repos: valores(entorno.repos ?? [], 'repos', errores), dominios: valores(entorno.dominios ?? [], 'dominios', errores), organizacion },
    classifyAllShell: c.classifyAllShell,
    defaultModeTerminal: c.defaultModeTerminal,
  };
  return { errores, limpio };
}

export function escribirAutoModo(cuerpo, env = process.env) {
  const { errores, limpio } = validarAutoModo(cuerpo);
  if (Object.keys(errores).length) throw new ErrorConversacion(400, 'Hay reglas inválidas', { errores });
  const ruta = rutaSettingsUsuario(env);
  const actual = leerJsonUsuario(ruta);
  if (actual.error) throw new ErrorConversacion(409, `${actual.error}. No lo modifiqué.`);
  if (actual.existe && !esObjeto(actual.datos)) throw new ErrorConversacion(409, `${ruta} no contiene un objeto JSON. No lo modifiqué.`);
  const s = actual.datos ?? {};
  const am = esObjeto(s.autoMode) ? s.autoMode : {};
  const nuevoAm = {
    ...am, // hard_deny y cualquier otra clave de autoMode quedan como estaban
    environment: [DEFECTOS, ...entornoAProsa(limpio.entorno), ...prosaAEntorno(am.environment).otras],
    allow: [DEFECTOS, ...limpio.permitir],
    soft_deny: [DEFECTOS, ...limpio.detener],
  };
  if (typeof limpio.classifyAllShell === 'boolean') nuevoAm.classifyAllShell = limpio.classifyAllShell;
  const nuevo = { ...s, autoMode: nuevoAm };
  if (typeof limpio.defaultModeTerminal === 'boolean') {
    const permisos = esObjeto(s.permissions) ? { ...s.permissions } : {};
    if (limpio.defaultModeTerminal) permisos.defaultMode = 'auto';
    else if (permisos.defaultMode === 'auto') delete permisos.defaultMode; // vuelve a la conducta de fábrica
    if (Object.keys(permisos).length || 'permissions' in s) nuevo.permissions = permisos;
  }
  respaldar(ruta, SUFIJO_RESPALDO);
  escribirAtomico(ruta, textoJson(nuevo));
  return leerAutoModo(env);
}

export function parsearReglas(texto) {
  let o;
  try { o = JSON.parse(String(texto)); } catch { throw new ErrorConversacion(502, 'claude auto-mode defaults no devolvió JSON'); }
  const r = esObjeto(o?.autoMode) ? o.autoMode : o;
  if (!esObjeto(r)) throw new ErrorConversacion(502, 'claude auto-mode defaults devolvió un formato inesperado');
  return { environment: textos(r.environment), allow: textos(r.allow), soft_deny: textos(r.soft_deny), hard_deny: textos(r.hard_deny) };
}

export function etiquetaRegla(texto) {
  const s = String(texto ?? '');
  const i = s.indexOf(':');
  const e = (i > 0 ? s.slice(0, i) : s).trim();
  return e.length > 80 ? `${e.slice(0, 79)}…` : e;
}

export function crearAutoModo({ env = process.env, spawnFn, ahora = Date.now } = {}) {
  let cache = null; // { ts, reglas }: `claude auto-mode defaults` es local y no gasta uso, pero tarda

  async function defaults() {
    if (cache && ahora() - cache.ts < CACHE_MS) return cache.reglas;
    const r = await ejecutarClaude(['auto-mode', 'defaults'], { env, spawnFn, timeoutMs: 30_000 });
    if (r.codigo !== 0) throw new ErrorConversacion(502, ultimaLinea(r.stderr) || `claude auto-mode defaults terminó con código ${r.codigo}`);
    const reglas = parsearReglas(r.stdout);
    cache = { ts: ahora(), reglas };
    return reglas;
  }

  const api = {
    async estado() {
      const base = leerAutoModo(env);
      try {
        const f = await defaults();
        return { ...base, conteosFabrica: { allow: f.allow.length, soft_deny: f.soft_deny.length, hard_deny: f.hard_deny.length }, disponible: true, motivo: null };
      } catch (e) {
        return { ...base, conteosFabrica: null, disponible: false, motivo: e.message };
      }
    },
    async guardar(cuerpo) {
      escribirAutoModo(cuerpo, env);
      return api.estado();
    },
    async critica() {
      const r = await ejecutarClaude(['auto-mode', 'critique'], { env, spawnFn, timeoutMs: 120_000 });
      if (r.codigo !== 0) throw new ErrorConversacion(502, ultimaLinea(r.stderr) || 'La revisión de Claude falló');
      return { texto: r.stdout.trim() };
    },
    async restablecer(cuerpo) {
      if (cuerpo?.confirmar !== true) throw new ErrorConversacion(400, 'Confirma el restablecimiento con {confirmar:true}');
      respaldar(rutaSettingsUsuario(env), SUFIJO_RESPALDO);
      const r = await ejecutarClaude(['auto-mode', 'reset', '-y'], { env, spawnFn, timeoutMs: 30_000 });
      if (r.codigo !== 0) throw new ErrorConversacion(502, ultimaLinea(r.stderr) || 'No se pudo restablecer el modo automático');
      return api.estado();
    },
    async fabrica() {
      const f = await defaults();
      return { allow: f.allow.map(etiquetaRegla), soft_deny: f.soft_deny.map(etiquetaRegla), hard_deny: f.hard_deny.map(etiquetaRegla) };
    },
  };
  return api;
}
```

- [ ] **Paso 4: correr los tests nuevos y toda la suite**

Ejecuta: `node --test tests/automodo.test.mjs` y después `node --test`.
Esperado: todo PASS.

- [ ] **Paso 5: commit**

```bash
git add plugins/orquestador/dashboard/automodo.mjs tests/automodo.test.mjs
git commit -m "feat: lectura y escritura segura del modo automático en settings.json"
```

---

### Tarea 5: catálogo de agentes: `packs.json`, activación con marcador y test del catálogo

**Archivos:**
- Crear: `plugins/orquestador/catalogo/packs.json`
- Crear: `plugins/orquestador/dashboard/agentes.mjs`
- Modificar: `plugins/orquestador/scripts/lib/agentes.mjs` (función `buscarDefinicion`)
- Crear: `tests/helpers/plugin-falso.mjs`
- Crear: `tests/agentes.test.mjs`
- Crear: `tests/catalogo.test.mjs`

**Interfaces:**
- Consume: `rutaAgentesUsuario`, `rutaAgentesProyecto`, `escribirAtomico`, `sinBom` (Tarea 1); `ErrorConversacion` (Tarea 3); `parsearFrontmatter`, `AGENTES_INTEGRADOS` y `extraerPersona` (existentes).
- Produce (`agentes.mjs`). Todas las funciones reciben `opciones = { env, raizPlugin = RAIZ_PLUGIN, cwdProyecto = null }`:
  - Constantes `RAIZ_PLUGIN`, `ID_AGENTE` (kebab), `SECCIONES` (`[[clave, título]]` de las 5 secciones), `INTEGRADOS` (`[{id, nombre, description, model, effort, tools}]` de general-purpose, Explore y Plan) y `AVISO_INTEGRADO`.
  - `marcador(id, version) → string`, `leerMarcador(texto) → { id, version } | null` y `nombreDesdeId(id) → string`.
  - `versionPlugin(raiz) → string`, `leerPacks(raiz) → pack[]`, `cargarCatalogo(raiz) → Map<id, { id, pack, ruta, nombre, texto, datos, cuerpo }>` (omite los ids sin archivo todavía), `agentesDelPlugin(raiz) → […]`, `idsReservados(raiz) → Set` (plugin + integrados, en minúsculas) y `validarId(id) → id` (o 400).
  - `seccionesDe(cuerpo) → { rol, metodo, entregable, restricciones, retorno }`.
  - `estadoCatalogo(id, opciones) → 'activo' | 'inactivo' | 'actualizable' | 'conflicto'`.
  - `activarCatalogo(id, opciones) → { id, estado: 'activo' }` (404 si no está en el catálogo; 409 `Ya tienes un agente propio llamado <id>`).
  - `desactivarCatalogo(id, opciones) → { id, estado: 'inactivo' }` (409 si el archivo no tiene marcador).
  - `aplicarPack(pack, activo, opciones) → { pack, resultados: [{ id, ok, estado, error? }] }` (404 pack desconocido; 400 si `activo` no es booleano).
  - `listarAgentes(opciones) → { version, packs: [{ id, nombre, descripcion, activos, total, agentes: [{ id, nombre, description, model, effort, tools, color, estado }] }], plugin, integrados, personalizados: [{ …, alcance, chocaConCatalogo }] }`.
  - `detalleAgente(origen, id, opciones) → { origen, id, nombre, description, model, effort, tools, color, archivo, prompt, persona, secciones, editable, alcance, pack?, estado?, aviso? }`, con `origen` ∈ {catalogo, plugin, integrado, usuario, proyecto}.
- Produce (`tests/helpers/plugin-falso.mjs`): `cuerpoAgente(id) → string` y `crearPluginFalso(version = '9.9.9') → raíz` con 2 packs (`uno`: alfa, beta; `dos`: gamma y `pendiente`, este último sin archivo) y `agents/guardian-git.md`.
- Comportamiento nuevo de `buscarDefinicion`: los agentes del usuario se buscan en `$CLAUDE_CONFIG_DIR/agents` si esa variable existe (así pre-agent ve los agentes activados desde el dashboard).

- [ ] **Paso 1: escribir el helper y los tests que fallan**

`tests/helpers/plugin-falso.mjs`:

```js
// Raíz de plugin temporal con un catálogo mínimo, para probar agentes.mjs y la API sin depender del catálogo real.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const cuerpoAgente = (id) => [
  '---', `name: ${id}`, `description: Hace ${id}. Úsalo para ${id}; no lo uses para otra cosa.`, 'model: sonnet', 'effort: medium', 'tools: Read, Bash', 'color: blue', '---', '',
  `Persona: Persona de ${id}.`, '', '## Rol', '', `Rol de ${id}.`, '', '## Método', '', '1. Lee.', '2. Hace.', '',
  '## Entregable', '', 'Un informe.', '', '## Restricciones', '', '- No inventa.', '', '## Formato de retorno', '', 'Máximo ~300 palabras.', '',
  '## REGLAS CRÍTICAS', '', '- Sin coautoría de IA.', '',
].join('\n');

export function crearPluginFalso(version = '9.9.9') {
  const raiz = mkdtempSync(join(tmpdir(), 'orq-plugin-'));
  mkdirSync(join(raiz, '.claude-plugin'));
  writeFileSync(join(raiz, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'orquestador', version }));
  mkdirSync(join(raiz, 'agents'));
  writeFileSync(join(raiz, 'agents', 'guardian-git.md'), cuerpoAgente('guardian-git'));
  mkdirSync(join(raiz, 'catalogo', 'uno'), { recursive: true });
  mkdirSync(join(raiz, 'catalogo', 'dos'), { recursive: true });
  writeFileSync(join(raiz, 'catalogo', 'packs.json'), JSON.stringify([
    { id: 'uno', nombre: 'Uno', descripcion: 'Pack uno.', agentes: ['alfa', 'beta'], nombres: { alfa: 'Alfa', beta: 'Beta' } },
    { id: 'dos', nombre: 'Dos', descripcion: 'Pack dos.', agentes: ['gamma', 'pendiente'], nombres: { gamma: 'Gamma', pendiente: 'Pendiente' } },
  ]));
  for (const [pack, id] of [['uno', 'alfa'], ['uno', 'beta'], ['dos', 'gamma']]) writeFileSync(join(raiz, 'catalogo', pack, `${id}.md`), cuerpoAgente(id));
  return raiz;
}
```

`tests/agentes.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  marcador, leerMarcador, listarAgentes, activarCatalogo, desactivarCatalogo, aplicarPack, estadoCatalogo, detalleAgente, seccionesDe,
} from '../plugins/orquestador/dashboard/agentes.mjs';
import { ErrorConversacion } from '../plugins/orquestador/dashboard/conversaciones.mjs';
import { rutaAgentesUsuario } from '../plugins/orquestador/scripts/lib/rutas.mjs';
import { buscarDefinicion } from '../plugins/orquestador/scripts/lib/agentes.mjs';
import { crearPluginFalso, cuerpoAgente } from './helpers/plugin-falso.mjs';

function preparar() {
  const raizPlugin = crearPluginFalso();
  const env = { CLAUDE_CONFIG_DIR: mkdtempSync(join(tmpdir(), 'orq agentes ñ-')) };
  const archivoUsuario = (id) => join(rutaAgentesUsuario(env), `${id}.md`);
  const escribirPropio = (id, texto) => { mkdirSync(rutaAgentesUsuario(env), { recursive: true }); writeFileSync(archivoUsuario(id), texto); };
  return { o: { env, raizPlugin }, env, archivoUsuario, escribirPropio };
}
const lanza = (fn, status, patron) => assert.throws(fn, (e) => e instanceof ErrorConversacion && e.status === status && (!patron || patron.test(e.message)));

test('marcador: formato exacto y lectura', () => {
  assert.equal(marcador('alfa', '0.3.0'), '<!-- orquestador:catalogo id=alfa version=0.3.0 -->');
  assert.deepEqual(leerMarcador(`x\n${marcador('alfa', '0.3.0')}\n`), { id: 'alfa', version: '0.3.0' });
  assert.equal(leerMarcador('sin marcador'), null);
});

test('listar: packs con los agentes que tienen archivo, plugin, integrados y estados inactivos', () => {
  const { o } = preparar();
  const l = listarAgentes(o);
  assert.equal(l.version, '9.9.9');
  assert.deepEqual(l.packs.map((p) => [p.id, p.total, p.activos]), [['uno', 2, 0], ['dos', 1, 0]]);
  assert.deepEqual(l.packs[0].agentes.map((a) => [a.id, a.nombre, a.model, a.estado]), [['alfa', 'Alfa', 'sonnet', 'inactivo'], ['beta', 'Beta', 'sonnet', 'inactivo']]);
  assert.deepEqual(l.plugin.map((a) => a.id), ['guardian-git']);
  assert.deepEqual(l.integrados.map((a) => a.id), ['general-purpose', 'Explore', 'Plan']);
  assert.deepEqual(l.personalizados, []);
});

test('activar copia el archivo con el marcador al final; desactivar lo borra solo si lo tiene', () => {
  const { o, archivoUsuario } = preparar();
  assert.deepEqual(activarCatalogo('alfa', o), { id: 'alfa', estado: 'activo' });
  const texto = readFileSync(archivoUsuario('alfa'), 'utf8');
  assert.ok(texto.endsWith(`${marcador('alfa', '9.9.9')}\n`));
  assert.match(texto, /^---\nname: alfa\n/);
  assert.equal(estadoCatalogo('alfa', o), 'activo');
  assert.equal(listarAgentes(o).packs[0].activos, 1);
  assert.deepEqual(desactivarCatalogo('alfa', o), { id: 'alfa', estado: 'inactivo' });
  assert.equal(existsSync(archivoUsuario('alfa')), false);
  assert.deepEqual(desactivarCatalogo('alfa', o), { id: 'alfa', estado: 'inactivo' });
  lanza(() => activarCatalogo('no-existe', o), 404);
  lanza(() => activarCatalogo('../x', o), 400);
});

test('colisión: un agente propio con el mismo id no se pisa ni se borra (409), y el pack sigue con los demás', () => {
  const { o, archivoUsuario, escribirPropio } = preparar();
  escribirPropio('beta', 'mío');
  lanza(() => activarCatalogo('beta', o), 409, /^Ya tienes un agente propio llamado beta$/);
  lanza(() => desactivarCatalogo('beta', o), 409);
  const r = aplicarPack('uno', true, o);
  assert.deepEqual(r.resultados.map((x) => [x.id, x.ok, x.estado]), [['alfa', true, 'activo'], ['beta', false, 'conflicto']]);
  assert.equal(r.resultados[1].error, 'Ya tienes un agente propio llamado beta');
  assert.equal(listarAgentes(o).packs[0].agentes[1].estado, 'conflicto');
  assert.deepEqual(aplicarPack('uno', false, o).resultados.map((x) => x.ok), [true, false]);
  assert.equal(existsSync(archivoUsuario('alfa')), false);
  assert.equal(readFileSync(archivoUsuario('beta'), 'utf8'), 'mío');
  lanza(() => aplicarPack('nada', true, o), 404);
  lanza(() => aplicarPack('uno', 'si', o), 400);
});

test('una versión anterior queda "actualizable" y activarla de nuevo la reemplaza', () => {
  const { o, archivoUsuario, escribirPropio } = preparar();
  escribirPropio('gamma', `viejo\n\n${marcador('gamma', '0.0.1')}\n`);
  assert.equal(estadoCatalogo('gamma', o), 'actualizable');
  assert.equal(listarAgentes(o).packs[1].activos, 1);
  activarCatalogo('gamma', o);
  assert.equal(estadoCatalogo('gamma', o), 'activo');
  assert.doesNotMatch(readFileSync(archivoUsuario('gamma'), 'utf8'), /viejo/);
});

test('detalle: catálogo con prompt y secciones; integrado sin prompt; personalizado del usuario editable', () => {
  const { o, escribirPropio } = preparar();
  const d = detalleAgente('catalogo', 'alfa', o);
  assert.deepEqual([d.origen, d.id, d.nombre, d.pack, d.estado, d.editable], ['catalogo', 'alfa', 'Alfa', 'uno', 'inactivo', false]);
  assert.match(d.prompt, /^Persona: Persona de alfa\./);
  assert.deepEqual([d.secciones.rol, d.secciones.metodo], ['Rol de alfa.', '1. Lee.\n2. Hace.']);
  const i = detalleAgente('integrado', 'Explore', o);
  assert.deepEqual([i.prompt, i.editable], [null, false]);
  assert.match(i.aviso, /Prompt de Anthropic, no visible/);
  escribirPropio('mi-agente', cuerpoAgente('mi-agente'));
  const p = detalleAgente('usuario', 'mi-agente', o);
  assert.deepEqual([p.editable, p.alcance, p.nombre], [true, 'usuario', 'Mi Agente']);
  assert.deepEqual(listarAgentes(o).personalizados.map((a) => [a.id, a.alcance, a.chocaConCatalogo]), [['mi-agente', 'usuario', false]]);
  lanza(() => detalleAgente('proyecto', 'mi-agente', o), 400);
  lanza(() => detalleAgente('raro', 'mi-agente', o), 400);
  lanza(() => detalleAgente('catalogo', 'pendiente', o), 404);
  lanza(() => detalleAgente('integrado', 'Inventado', o), 404);
});

test('seccionesDe tolera CRLF e ignora REGLAS CRÍTICAS y el marcador', () => {
  const s = seccionesDe('Persona: x\r\n\r\n## Rol\r\n\r\nUno.\r\n\r\n## Método\r\n\r\n1. a\r\n\r\n## REGLAS CRÍTICAS\r\n\r\n- y\r\n<!-- orquestador:catalogo id=a version=1 -->');
  assert.deepEqual(s, { rol: 'Uno.', metodo: '1. a', entregable: '', restricciones: '', retorno: '' });
});

test('buscarDefinicion respeta CLAUDE_CONFIG_DIR para los agentes del usuario', () => {
  const { env, escribirPropio } = preparar();
  escribirPropio('eco', cuerpoAgente('eco'));
  const d = buscarDefinicion('eco', { cwd: mkdtempSync(join(tmpdir(), 'orq-cwd-')), home: join(tmpdir(), 'no-existe'), env });
  assert.equal(d.model, 'sonnet');
});
```

`tests/catalogo.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsearFrontmatter } from '../plugins/orquestador/scripts/lib/frontmatter.mjs';
import { INTEGRADOS, ID_AGENTE } from '../plugins/orquestador/dashboard/agentes.mjs';

// Mientras las Tareas 13–15 escriben los agentes, un archivo que falta se informa como TODO (no rompe la suite).
// La Tarea 15 cambia esto a true: desde ahí, un archivo ausente es un fallo.
const CONTENIDO_COMPLETO = false;

const PLUGIN = fileURLToPath(new URL('../plugins/orquestador/', import.meta.url));
const packs = JSON.parse(readFileSync(join(PLUGIN, 'catalogo', 'packs.json'), 'utf8'));
const ids = packs.flatMap((p) => p.agentes);
const PACKS = ['investigacion', 'datos', 'ml', 'ingenieria', 'diseno', 'infra', 'escritura', 'negocio', 'operacion'];
const MODELOS = ['haiku', 'sonnet', 'opus', 'fable', 'inherit'];
const ESFUERZOS = ['low', 'medium', 'high', 'xhigh', 'max'];
const TOOLS = ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash', 'WebSearch', 'WebFetch', 'NotebookEdit'];
const COLORES = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan'];
const ORDEN = [/^Persona: \S/m, /^## Rol$/m, /^## Método$/m, /^## Entregable$/m, /^## Restricciones$/m, /^## Formato de retorno$/m, /^## REGLAS CRÍTICAS$/m];
const palabras = (t) => t.split(/\s+/).filter(Boolean).length;

test('packs.json: 9 packs en orden y 56 agentes con ids kebab únicos y nombre visible', () => {
  assert.deepEqual(packs.map((p) => p.id), PACKS);
  assert.deepEqual(packs.map((p) => p.agentes.length), [6, 6, 7, 9, 6, 6, 6, 6, 4]);
  assert.equal(ids.length, 56);
  assert.equal(new Set(ids).size, 56);
  for (const p of packs) {
    assert.ok(p.nombre && p.descripcion, `${p.id}: falta nombre o descripcion`);
    for (const id of p.agentes) {
      assert.match(id, ID_AGENTE, id);
      assert.ok(id.length >= 3 && id.length <= 40, id);
      assert.ok(p.nombres?.[id], `${id}: falta el nombre visible`);
    }
    assert.deepEqual(Object.keys(p.nombres).sort(), [...p.agentes].sort(), `${p.id}: nombres que sobran`);
  }
});

test('ningún id del catálogo choca con un agente del plugin ni con uno integrado', () => {
  const delPlugin = readdirSync(join(PLUGIN, 'agents')).filter((f) => f.endsWith('.md')).map((f) => basename(f, '.md').toLowerCase());
  const reservados = new Set([...delPlugin, ...INTEGRADOS.map((a) => a.id.toLowerCase())]);
  for (const id of ids) assert.ok(!reservados.has(id), `${id} choca con un agente reservado`);
});

test('no hay archivos de agentes que no estén en packs.json', () => {
  for (const p of packs) {
    const dir = join(PLUGIN, 'catalogo', p.id);
    const archivos = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => basename(f, '.md')) : [];
    for (const a of archivos) assert.ok(p.agentes.includes(a), `${p.id}/${a}.md no está en packs.json`);
  }
});

const descripciones = new Map();
for (const p of packs) {
  for (const id of p.agentes) {
    const ruta = join(PLUGIN, 'catalogo', p.id, `${id}.md`);
    const pendiente = !CONTENIDO_COMPLETO && !existsSync(ruta);
    test(`catálogo ${p.id}/${id}: frontmatter, secciones y longitud`, { todo: pendiente ? 'se escribe en las Tareas 13 a 15' : false }, () => {
      if (pendiente) return; // TODO limpio: sin trazas de ENOENT en la salida
      const texto = readFileSync(ruta, 'utf8');
      assert.doesNotMatch(texto, /\r/, 'usa LF como fin de línea');
      const { datos, cuerpo } = parsearFrontmatter(texto);
      assert.equal(datos.name, id);
      const d = datos.description ?? '';
      assert.ok(d.length >= 60 && d.length <= 330, `description de ${d.length} caracteres`);
      assert.match(d, /Úsalo /);
      assert.match(d, /no lo uses/i);
      assert.doesNotMatch(d, /: | #/, 'la description no puede tener ": " ni " #"');
      assert.ok(MODELOS.includes(datos.model), `model ${datos.model}`);
      assert.ok(ESFUERZOS.includes(datos.effort), `effort ${datos.effort}`);
      const tools = String(datos.tools ?? '').split(',').map((t) => t.trim());
      assert.ok(tools.length > 0 && tools.every((t) => TOOLS.includes(t)), `tools ${datos.tools}`);
      assert.ok(COLORES.includes(datos.color), `color ${datos.color}`);
      let ultimo = -1;
      for (const r of ORDEN) {
        const i = cuerpo.search(r);
        assert.ok(i > ultimo, `falta o está fuera de orden: ${r}`);
        ultimo = i;
      }
      assert.match(cuerpo, /^1\. /m);
      assert.match(cuerpo, /^2\. /m);
      assert.match(cuerpo.slice(cuerpo.search(/^## Formato de retorno$/m)), /300 palabras/);
      const reglas = cuerpo.slice(cuerpo.search(/^## REGLAS CRÍTICAS$/m));
      for (const r of [/coautoría/, /No inventes/, /commits ni push/, /permisos/, /español/]) assert.match(reglas, r);
      const n = palabras(cuerpo);
      assert.ok(n >= 120 && n <= 600, `cuerpo de ${n} palabras`);
      assert.doesNotMatch(texto, /orquestador:catalogo/, 'el marcador lo agrega la activación');
      assert.ok(!descripciones.has(d), `description repetida con ${descripciones.get(d)}`);
      descripciones.set(d, id);
    });
  }
}
```

- [ ] **Paso 2: correr los tests y ver que fallan**

Ejecuta: `node --test tests/agentes.test.mjs tests/catalogo.test.mjs`
Esperado: FAIL con `Cannot find module …/dashboard/agentes.mjs`.

- [ ] **Paso 3: crear `catalogo/packs.json`**

Sale de las tablas de "Catálogo de agentes" de este plan:

```json
[
  {
    "id": "investigacion",
    "nombre": "Investigación",
    "descripcion": "Buscar, verificar y sintetizar información con fuentes citadas.",
    "agentes": ["investigador", "analista-literatura", "verificador-hechos", "investigador-mercado", "investigador-tecnico", "sintetizador"],
    "nombres": {
      "investigador": "Investigador", "analista-literatura": "Analista de Literatura", "verificador-hechos": "Verificador de Hechos",
      "investigador-mercado": "Investigador de Mercado", "investigador-tecnico": "Investigador Técnico", "sintetizador": "Sintetizador"
    }
  },
  {
    "id": "datos",
    "nombre": "Datos",
    "descripcion": "Limpiar, analizar, consultar y visualizar datos con resultados reproducibles.",
    "agentes": ["analista-datos", "limpiador-datos", "estadistico", "visualizador-datos", "ingeniero-datos", "analista-sql"],
    "nombres": {
      "analista-datos": "Analista de Datos", "limpiador-datos": "Limpiador de Datos", "estadistico": "Estadístico",
      "visualizador-datos": "Visualizador de Datos", "ingeniero-datos": "Ingeniero de Datos", "analista-sql": "Analista SQL"
    }
  },
  {
    "id": "ml",
    "nombre": "Machine Learning",
    "descripcion": "Diseñar, implementar, evaluar y desplegar modelos de ML y RL.",
    "agentes": ["cientifico-ml", "ingeniero-ml", "evaluador-modelos", "investigador-rl", "optimizador-hiperparametros", "ingeniero-mlops", "critico-papers"],
    "nombres": {
      "cientifico-ml": "Científico de ML", "ingeniero-ml": "Ingeniero de ML", "evaluador-modelos": "Evaluador de Modelos",
      "investigador-rl": "Investigador de RL", "optimizador-hiperparametros": "Optimizador de Hiperparámetros",
      "ingeniero-mlops": "Ingeniero de MLOps", "critico-papers": "Crítico de Papers"
    }
  },
  {
    "id": "ingenieria",
    "nombre": "Ingeniería",
    "descripcion": "Diseñar, construir, probar y mantener software.",
    "agentes": ["arquitecto", "implementador", "depurador", "revisor-codigo", "tester", "refactorizador", "optimizador-rendimiento", "documentador-codigo", "migrador"],
    "nombres": {
      "arquitecto": "Arquitecto", "implementador": "Implementador", "depurador": "Depurador", "revisor-codigo": "Revisor de Código",
      "tester": "Tester", "refactorizador": "Refactorizador", "optimizador-rendimiento": "Optimizador de Rendimiento",
      "documentador-codigo": "Documentador de Código", "migrador": "Migrador"
    }
  },
  {
    "id": "diseno",
    "nombre": "Diseño",
    "descripcion": "Interfaces, piezas visuales, accesibilidad y sistemas de diseño.",
    "agentes": ["disenador-ui", "disenador-visual", "ingeniero-frontend", "auditor-accesibilidad", "redactor-ux", "disenador-sistemas"],
    "nombres": {
      "disenador-ui": "Diseñador UI/UX", "disenador-visual": "Diseñador Visual", "ingeniero-frontend": "Ingeniero Frontend",
      "auditor-accesibilidad": "Auditor de Accesibilidad", "redactor-ux": "Redactor UX", "disenador-sistemas": "Diseñador de Sistemas de Diseño"
    }
  },
  {
    "id": "infra",
    "nombre": "Infraestructura",
    "descripcion": "CI/CD, nube, seguridad, bases de datos y confiabilidad.",
    "agentes": ["ingeniero-devops", "ingeniero-cloud", "auditor-seguridad", "revisor-dependencias", "administrador-bd", "ingeniero-sre"],
    "nombres": {
      "ingeniero-devops": "Ingeniero DevOps", "ingeniero-cloud": "Ingeniero Cloud", "auditor-seguridad": "Auditor de Seguridad",
      "revisor-dependencias": "Revisor de Dependencias", "administrador-bd": "Administrador de Bases de Datos", "ingeniero-sre": "Ingeniero SRE"
    }
  },
  {
    "id": "escritura",
    "nombre": "Escritura",
    "descripcion": "Redactar, editar, traducir y adaptar textos.",
    "agentes": ["redactor", "editor", "traductor", "redactor-tecnico", "redactor-academico", "comunicador"],
    "nombres": {
      "redactor": "Redactor", "editor": "Editor", "traductor": "Traductor", "redactor-tecnico": "Redactor Técnico",
      "redactor-academico": "Redactor Académico", "comunicador": "Comunicador"
    }
  },
  {
    "id": "negocio",
    "nombre": "Negocio",
    "descripcion": "Estrategia, finanzas, producto, usuarios y competencia.",
    "agentes": ["estratega", "analista-financiero", "product-manager", "investigador-usuarios", "analista-competencia", "redactor-propuestas"],
    "nombres": {
      "estratega": "Estratega", "analista-financiero": "Analista Financiero", "product-manager": "Product Manager",
      "investigador-usuarios": "Investigador de Usuarios", "analista-competencia": "Analista de Competencia", "redactor-propuestas": "Redactor de Propuestas"
    }
  },
  {
    "id": "operacion",
    "nombre": "Operación",
    "descripcion": "Verificar entregables, extraer datos, planificar y ordenar.",
    "agentes": ["verificador", "extractor", "planificador", "organizador-archivos"],
    "nombres": {
      "verificador": "Verificador", "extractor": "Extractor", "planificador": "Planificador", "organizador-archivos": "Organizador de Archivos"
    }
  }
]
```

- [ ] **Paso 4: implementar `agentes.mjs` (catálogo, plugin, integrados y listado)**

`dashboard/agentes.mjs`:

```js
// Agentes del dashboard: catálogo del plugin (activar y desactivar con marcador), agentes del plugin, integrados y personalizados.
// Todas las rutas se arman aquí a partir de ids validados; nunca se toman de la petición.
import { readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsearFrontmatter } from '../scripts/lib/frontmatter.mjs';
import { AGENTES_INTEGRADOS, extraerPersona } from '../scripts/lib/agentes.mjs';
import { rutaAgentesUsuario, rutaAgentesProyecto } from '../scripts/lib/rutas.mjs';
import { escribirAtomico, sinBom } from '../scripts/lib/archivos.mjs';
import { ErrorConversacion } from './conversaciones.mjs';

export const RAIZ_PLUGIN = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
export const ID_AGENTE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SECCIONES = Object.freeze([['rol', 'Rol'], ['metodo', 'Método'], ['entregable', 'Entregable'], ['restricciones', 'Restricciones'], ['retorno', 'Formato de retorno']]);
export const AVISO_INTEGRADO = 'Prompt de Anthropic, no visible. Si necesitas una variante, duplícalo como agente personalizado.';
export const INTEGRADOS = Object.freeze([
  Object.freeze({ id: 'general-purpose', nombre: 'General-purpose', description: 'Tareas de varios pasos cuando ningún otro agente encaja.', model: AGENTES_INTEGRADOS['general-purpose'], effort: null, tools: 'Todas las herramientas' }),
  Object.freeze({ id: 'Explore', nombre: 'Explore', description: 'Búsqueda de solo lectura en muchos archivos; devuelve conclusiones.', model: AGENTES_INTEGRADOS.Explore, effort: null, tools: 'Solo lectura' }),
  Object.freeze({ id: 'Plan', nombre: 'Plan', description: 'Diseña planes de implementación paso a paso.', model: AGENTES_INTEGRADOS.Plan, effort: null, tools: 'Solo lectura' }),
]);

const MARCADOR = /<!-- orquestador:catalogo id=([a-z0-9-]+) version=([^\s>]+) -->/;
export const marcador = (id, version) => `<!-- orquestador:catalogo id=${id} version=${version} -->`;
export function leerMarcador(texto) {
  const m = MARCADOR.exec(String(texto ?? ''));
  return m ? { id: m[1], version: m[2] } : null;
}
export const nombreDesdeId = (id) => String(id).split('-').filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');

const opcionesDe = ({ env = process.env, raizPlugin = RAIZ_PLUGIN, cwdProyecto = null } = {}) => ({ env, raizPlugin, cwdProyecto });

export function versionPlugin(raizPlugin = RAIZ_PLUGIN) {
  return JSON.parse(readFileSync(join(raizPlugin, '.claude-plugin', 'plugin.json'), 'utf8')).version;
}

export function leerPacks(raizPlugin = RAIZ_PLUGIN) {
  return JSON.parse(sinBom(readFileSync(join(raizPlugin, 'catalogo', 'packs.json'), 'utf8')));
}

function leerArchivoAgente(ruta) {
  const texto = sinBom(readFileSync(ruta, 'utf8'));
  return { texto, ...parsearFrontmatter(texto) };
}

// Las 5 secciones del cuerpo por su título "## …"; lo demás (Persona, REGLAS CRÍTICAS, marcador) se ignora.
export function seccionesDe(cuerpo) {
  const out = Object.fromEntries(SECCIONES.map(([k]) => [k, '']));
  const porTitulo = new Map(SECCIONES.map(([k, t]) => [t.toLowerCase(), k]));
  let actual = null;
  let buffer = [];
  const cerrar = () => { if (actual) out[actual] = buffer.join('\n').trim(); };
  for (const linea of String(cuerpo ?? '').replace(/\r\n/g, '\n').split('\n')) {
    const m = /^##\s+(.+?)\s*$/.exec(linea);
    if (m) { cerrar(); actual = porTitulo.get(m[1].toLowerCase()) ?? null; buffer = []; continue; }
    if (actual) buffer.push(linea);
  }
  cerrar();
  return out;
}

export function cargarCatalogo(raizPlugin = RAIZ_PLUGIN) {
  const mapa = new Map();
  for (const p of leerPacks(raizPlugin)) {
    for (const id of p.agentes) {
      const ruta = join(raizPlugin, 'catalogo', p.id, `${id}.md`);
      if (!existsSync(ruta)) continue; // listado en packs.json pero todavía sin archivo
      mapa.set(id, { id, pack: p.id, ruta, nombre: p.nombres?.[id] ?? nombreDesdeId(id), ...leerArchivoAgente(ruta) });
    }
  }
  return mapa;
}

export function agentesDelPlugin(raizPlugin = RAIZ_PLUGIN) {
  const dir = join(raizPlugin, 'agents');
  let archivos = [];
  try { archivos = readdirSync(dir).filter((f) => f.endsWith('.md')); } catch { /* sin agentes propios */ }
  return archivos.map((f) => ({ id: basename(f, '.md'), nombre: nombreDesdeId(basename(f, '.md')), ruta: join(dir, f), ...leerArchivoAgente(join(dir, f)) }));
}

export const idsReservados = (raizPlugin = RAIZ_PLUGIN) => new Set([
  ...agentesDelPlugin(raizPlugin).map((a) => a.id.toLowerCase()),
  ...INTEGRADOS.map((a) => a.id.toLowerCase()),
]);

export function validarId(id) {
  if (typeof id !== 'string' || id.length < 3 || id.length > 40 || !ID_AGENTE.test(id)) throw new ErrorConversacion(400, 'Identificador de agente inválido');
  return id;
}

const rutaEnUsuario = (id, env) => join(rutaAgentesUsuario(env), `${id}.md`);

function estadoCon(id, env, version) {
  const ruta = rutaEnUsuario(id, env);
  if (!existsSync(ruta)) return 'inactivo';
  const m = leerMarcador(readFileSync(ruta, 'utf8'));
  if (!m || m.id !== id) return 'conflicto';
  return m.version === version ? 'activo' : 'actualizable';
}

export function estadoCatalogo(id, opciones = {}) {
  const { env, raizPlugin } = opcionesDe(opciones);
  return estadoCon(validarId(id), env, versionPlugin(raizPlugin));
}

const resumen = (a, extra = {}) => ({
  id: a.id, nombre: a.nombre ?? nombreDesdeId(a.id), description: a.datos?.description ?? '', model: a.datos?.model ?? null,
  effort: a.datos?.effort ?? null, tools: a.datos?.tools ?? null, color: a.datos?.color ?? null, ...extra,
});

export function activarCatalogo(id, opciones = {}) {
  const { env, raizPlugin } = opcionesDe(opciones);
  validarId(id);
  const a = cargarCatalogo(raizPlugin).get(id);
  if (!a) throw new ErrorConversacion(404, `No existe el agente ${id} en el catálogo`);
  const version = versionPlugin(raizPlugin);
  if (estadoCon(id, env, version) === 'conflicto') throw new ErrorConversacion(409, `Ya tienes un agente propio llamado ${id}`);
  escribirAtomico(rutaEnUsuario(id, env), `${a.texto.trimEnd()}\n\n${marcador(id, version)}\n`);
  return { id, estado: 'activo' };
}

export function desactivarCatalogo(id, opciones = {}) {
  const { env, raizPlugin } = opcionesDe(opciones);
  validarId(id);
  const estado = estadoCon(id, env, versionPlugin(raizPlugin));
  if (estado === 'conflicto') throw new ErrorConversacion(409, `Ya tienes un agente propio llamado ${id}; no lo borro`);
  if (estado !== 'inactivo') rmSync(rutaEnUsuario(id, env), { force: true });
  return { id, estado: 'inactivo' };
}

export function aplicarPack(packId, activo, opciones = {}) {
  const o = opcionesDe(opciones);
  if (typeof activo !== 'boolean') throw new ErrorConversacion(400, 'activo debe ser verdadero o falso');
  const pack = leerPacks(o.raizPlugin).find((p) => p.id === packId);
  if (!pack) throw new ErrorConversacion(404, `No existe el pack ${packId}`);
  const catalogo = cargarCatalogo(o.raizPlugin);
  const resultados = pack.agentes.filter((id) => catalogo.has(id)).map((id) => {
    try {
      return { ok: true, ...(activo ? activarCatalogo(id, o) : desactivarCatalogo(id, o)) };
    } catch (e) {
      return { ok: false, id, estado: estadoCatalogo(id, o), error: e.message };
    }
  });
  return { pack: pack.id, resultados };
}

function personalizadosEn(dir, alcance, catalogo) {
  let archivos = [];
  try { archivos = readdirSync(dir).filter((f) => f.endsWith('.md')); } catch { return []; }
  const out = [];
  for (const f of archivos) {
    const id = basename(f, '.md');
    let a;
    try { a = leerArchivoAgente(join(dir, f)); } catch { continue; }
    if (leerMarcador(a.texto)) continue; // activado desde el catálogo: aparece en su pack
    out.push(resumen({ id, ...a }, { alcance, chocaConCatalogo: catalogo.has(id) }));
  }
  return out;
}

export function listarAgentes(opciones = {}) {
  const { env, raizPlugin, cwdProyecto } = opcionesDe(opciones);
  const version = versionPlugin(raizPlugin);
  const catalogo = cargarCatalogo(raizPlugin);
  const packs = leerPacks(raizPlugin).map((p) => {
    const agentes = p.agentes.filter((id) => catalogo.has(id)).map((id) => resumen(catalogo.get(id), { estado: estadoCon(id, env, version) }));
    return {
      id: p.id, nombre: p.nombre, descripcion: p.descripcion, total: agentes.length,
      activos: agentes.filter((a) => a.estado === 'activo' || a.estado === 'actualizable').length, agentes,
    };
  });
  return {
    version,
    packs,
    plugin: agentesDelPlugin(raizPlugin).map((a) => resumen(a)),
    integrados: INTEGRADOS.map((a) => ({ ...a })),
    personalizados: [
      ...personalizadosEn(rutaAgentesUsuario(env), 'usuario', catalogo),
      ...(cwdProyecto ? personalizadosEn(rutaAgentesProyecto(cwdProyecto), 'proyecto', catalogo) : []),
    ],
  };
}

export function detalleAgente(origen, id, opciones = {}) {
  const { env, raizPlugin, cwdProyecto } = opcionesDe(opciones);
  if (origen === 'integrado') {
    const a = INTEGRADOS.find((x) => x.id === id);
    if (!a) throw new ErrorConversacion(404, 'No existe ese agente integrado');
    return { origen, ...a, color: null, archivo: 'Integrado en Claude Code', prompt: null, persona: null, secciones: null, aviso: AVISO_INTEGRADO, editable: false, alcance: null };
  }
  if (!['catalogo', 'plugin', 'usuario', 'proyecto'].includes(origen)) throw new ErrorConversacion(400, `Origen desconocido: ${origen}`);
  validarId(id);
  let a = null;
  let archivo = null;
  let extra = {};
  if (origen === 'catalogo') {
    a = cargarCatalogo(raizPlugin).get(id) ?? null;
    if (a) { archivo = `catalogo/${a.pack}/${id}.md`; extra = { pack: a.pack, estado: estadoCon(id, env, versionPlugin(raizPlugin)) }; }
  } else if (origen === 'plugin') {
    a = agentesDelPlugin(raizPlugin).find((x) => x.id === id) ?? null;
    if (a) archivo = `plugins/orquestador/agents/${id}.md`;
  } else {
    if (origen === 'proyecto' && !cwdProyecto) throw new ErrorConversacion(400, 'Para ver los agentes del proyecto abre una conversación en esa carpeta');
    const ruta = join(origen === 'usuario' ? rutaAgentesUsuario(env) : rutaAgentesProyecto(cwdProyecto), `${id}.md`);
    if (existsSync(ruta)) {
      a = { id, ...leerArchivoAgente(ruta) };
      archivo = ruta;
      if (leerMarcador(a.texto)) a = null; // activado desde el catálogo: se ve en su pack
    }
  }
  if (!a) throw new ErrorConversacion(404, 'No existe ese agente');
  const propio = origen === 'usuario' || origen === 'proyecto';
  return {
    origen, ...resumen(a), ...extra, archivo, prompt: a.cuerpo.trim(), persona: extraerPersona(a.cuerpo),
    secciones: seccionesDe(a.cuerpo), editable: propio, alcance: propio ? origen : null,
  };
}
```

- [ ] **Paso 5: agentes del usuario según `CLAUDE_CONFIG_DIR` en `buscarDefinicion`**

En `scripts/lib/agentes.mjs`:
1. Cambia la firma por `export function buscarDefinicion(agentType, { raizPlugin, cwd, home = homedir(), env = process.env } = {}) {`.
2. En la rama `else` (sin prefijo), reemplaza la línea de `candidatos` por:
   ```js
   const dirUsuario = env.CLAUDE_CONFIG_DIR ? join(env.CLAUDE_CONFIG_DIR, 'agents') : join(home, '.claude', 'agents');
   candidatos = [cwd && join(cwd, '.claude', 'agents', `${nombre}.md`), join(dirUsuario, `${nombre}.md`)];
   ```

- [ ] **Paso 6: correr los tests nuevos y toda la suite**

Ejecuta: `node --test tests/agentes.test.mjs tests/catalogo.test.mjs` y después `node --test`.
Esperado: PASS. `tests/catalogo.test.mjs` informa 56 pruebas como `todo` (los archivos se escriben en las Tareas 13–15); los 3 tests estructurales pasan.

- [ ] **Paso 7: commit**

```bash
git add plugins/orquestador/catalogo/packs.json plugins/orquestador/dashboard/agentes.mjs plugins/orquestador/scripts/lib/agentes.mjs tests/helpers/plugin-falso.mjs tests/agentes.test.mjs tests/catalogo.test.mjs
git commit -m "feat: catálogo de agentes con activación por marcador y colisiones"
```

---

### Tarea 6: agentes personalizados y "Redactar con Claude"

**Archivos:**
- Modificar: `plugins/orquestador/dashboard/agentes.mjs` (imports y funciones nuevas al final)
- Crear: `tests/agentes-personalizados.test.mjs`

**Interfaces:**
- Consume: lo de la Tarea 5 (`opcionesDe`, `validarId`, `cargarCatalogo`, `idsReservados`, `detalleAgente`, `leerMarcador`, `SECCIONES`, `ID_AGENTE`); `respaldar` (Tarea 1); `ejecutarClaude` (Tarea 3); `ESFUERZOS` de `scripts/lib/modelos.mjs`.
- Produce:
  - Constantes `TOOLS_VALIDAS`, `MODELOS_AGENTE` (`haiku`, `sonnet`, `opus`, `fable`, `inherit`) y `REGLAS_CRITICAS` (texto literal de la Guía de contenido).
  - `slugAgente(nombre) → string` (minúsculas, sin tildes, guiones, máximo 40).
  - `validarAgente(campos, { id? }) → { errores, limpio: { id, descripcion, modelo, esfuerzo, herramientas, secciones, alcance } }`. `campos` es `{ nombre, descripcion, modelo, esfuerzo, herramientas: string[], alcance: 'usuario'|'proyecto', secciones: { rol, metodo, entregable, restricciones, retorno } }`.
  - `construirArchivo(limpio) → string`: mismo formato del catálogo. La `description` va entre comillas dobles; `Persona:` es la primera frase del Rol; el color se toma del modelo.
  - `crearPersonalizado(campos, opciones) → detalle` (201 en la API). Da 400 con `extra.errores`, 409 si choca con el catálogo, el plugin o un integrado, y 409 si ya existe.
  - `editarPersonalizado(id, campos, opciones) → detalle`: respalda en `<id>.md.bak` y da 409 si el archivo tiene marcador.
  - `eliminarPersonalizado(id, { confirmar, alcance }, opciones) → { id, eliminado: true }`: sin `confirmar:true` da 400; respalda antes de borrar.
  - `ESQUEMA_SECCIONES`, `argumentosRedactar() → string[]`, `promptRedaccion({ nombre, descripcion, modelo, herramientas }) → string` y `extraerRedaccion(stdout) → secciones`.
  - `redactarPrompt(campos, { env, spawnFn, timeoutMs = 90000 }) → Promise<secciones>`: 400 si faltan datos, 502 o 504 según cómo falle Claude.

- [ ] **Paso 1: escribir los tests que fallan**

`tests/agentes-personalizados.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  slugAgente, validarAgente, construirArchivo, seccionesDe, crearPersonalizado, editarPersonalizado, eliminarPersonalizado,
  activarCatalogo, listarAgentes, redactarPrompt, REGLAS_CRITICAS,
} from '../plugins/orquestador/dashboard/agentes.mjs';
import { ErrorConversacion } from '../plugins/orquestador/dashboard/conversaciones.mjs';
import { parsearFrontmatter } from '../plugins/orquestador/scripts/lib/frontmatter.mjs';
import { rutaAgentesUsuario } from '../plugins/orquestador/scripts/lib/rutas.mjs';
import { crearPluginFalso } from './helpers/plugin-falso.mjs';

const FALSO_CLI = fileURLToPath(new URL('./fixtures/claude-falso-cli.mjs', import.meta.url));

function preparar() {
  const raizPlugin = crearPluginFalso();
  const base = mkdtempSync(join(tmpdir(), 'orq pers ñ-'));
  const env = { CLAUDE_CONFIG_DIR: join(base, 'Claude Config') };
  const cwd = join(base, 'Mi Repo ñ');
  mkdirSync(cwd);
  return { o: { env, raizPlugin }, env, cwd };
}
const campos = (extra = {}) => ({
  nombre: 'Investigador RL', descripcion: 'Diseña experimentos de RL. Úsalo para planificar, no para implementar.', modelo: 'opus', esfuerzo: 'high',
  herramientas: ['Read', 'WebSearch'], alcance: 'usuario',
  secciones: { rol: 'Investigador de RL escéptico. Hipótesis antes que código.', metodo: '1. Define la hipótesis.\n2. Diseña ablations.', entregable: 'Plan experimental.', restricciones: '- No implementa.', retorno: 'Máximo 300 palabras.' },
  ...extra,
});
const lanza = (fn, status, patron) => assert.throws(fn, (e) => e instanceof ErrorConversacion && e.status === status && (!patron || patron.test(e.message)));

function cli(modo, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'orq-redactar-'));
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ rutaClaude: 'claude-falso' }));
  const registro = join(dir, 'registro.jsonl');
  const env = { ...process.env, ORQUESTADOR_HOME: dir, CLAUDE_CONFIG_DIR: dir, FALSO_CLI_REGISTRO: registro, FALSO_CLI_MODO: modo, ...extra };
  const spawnFn = (_bin, args, opciones) => spawn(process.execPath, [FALSO_CLI, ...args], opciones);
  const invocaciones = () => (existsSync(registro) ? readFileSync(registro, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
  return { env, spawnFn, invocaciones };
}
const pedido = { nombre: 'Investigador RL', descripcion: 'Diseña experimentos de RL.', modelo: 'opus', herramientas: ['Read'] };

test('slugAgente: minúsculas, sin tildes y con guiones', () => {
  assert.equal(slugAgente('Investigador RL'), 'investigador-rl');
  assert.equal(slugAgente('  Diseñador Ñandú / UX  '), 'disenador-nandu-ux');
  assert.equal(slugAgente('!!'), '');
  assert.ok(slugAgente('x'.repeat(60)).length <= 40);
});

test('construirArchivo: mismo formato del catálogo y secciones recuperables', () => {
  const { errores, limpio } = validarAgente(campos());
  assert.deepEqual(errores, {});
  const texto = construirArchivo(limpio);
  const { datos, cuerpo } = parsearFrontmatter(texto);
  assert.deepEqual([datos.name, datos.model, datos.effort, datos.tools, datos.color], ['investigador-rl', 'opus', 'high', 'Read, WebSearch', 'purple']);
  assert.equal(datos.description, campos().descripcion);
  assert.match(texto, /^description: "/m);
  assert.match(cuerpo, /^Persona: Investigador de RL escéptico\.$/m);
  assert.deepEqual(seccionesDe(cuerpo), campos().secciones);
  assert.ok(cuerpo.includes(REGLAS_CRITICAS));
});

test('validarAgente: errores por campo', () => {
  const { errores } = validarAgente(campos({ nombre: 'x', descripcion: 'corta', modelo: 'gpt', esfuerzo: 'turbo', herramientas: [], alcance: 'todos', secciones: { rol: '## Rol falso', metodo: '' } }));
  assert.deepEqual(Object.keys(errores).sort(), ['alcance', 'descripcion', 'entregable', 'esfuerzo', 'herramientas', 'metodo', 'modelo', 'nombre', 'restricciones', 'retorno', 'rol'].sort());
  assert.match(validarAgente(campos({ descripcion: 'Con "comillas" que romperían el YAML del frontmatter' })).errores.descripcion, /comillas/);
  assert.match(validarAgente(campos({ herramientas: ['Read', 'Inventada'] })).errores.herramientas, /herramienta/);
});

test('crear (usuario): escribe sin marcador, no sobrescribe y aparece en personalizados', () => {
  const { o, env } = preparar();
  const d = crearPersonalizado(campos(), o);
  assert.deepEqual([d.id, d.origen, d.alcance, d.editable], ['investigador-rl', 'usuario', 'usuario', true]);
  assert.doesNotMatch(readFileSync(join(rutaAgentesUsuario(env), 'investigador-rl.md'), 'utf8'), /orquestador:catalogo/);
  lanza(() => crearPersonalizado(campos(), o), 409, /Ya existe un agente llamado investigador-rl/);
  assert.deepEqual(listarAgentes(o).personalizados.map((a) => a.id), ['investigador-rl']);
});

test('crear: un id del catálogo, del plugin o integrado da 409; uno inválido, 400 con errores', () => {
  const { o } = preparar();
  lanza(() => crearPersonalizado(campos({ nombre: 'Alfa' }), o), 409, /catálogo/);
  lanza(() => crearPersonalizado(campos({ nombre: 'Guardian Git' }), o), 409, /plugin o integrado/);
  lanza(() => crearPersonalizado(campos({ nombre: 'Explore' }), o), 409, /plugin o integrado/);
  assert.throws(() => crearPersonalizado(campos({ nombre: '¡!' }), o), (e) => e.status === 400 && !!e.extra?.errores?.nombre);
});

test('crear (proyecto): exige conversación y escribe en <cwd>/.claude/agents aunque la ruta tenga espacios y tildes', () => {
  const { o, cwd } = preparar();
  lanza(() => crearPersonalizado(campos({ alcance: 'proyecto' }), o), 400, /abre una conversación/);
  crearPersonalizado(campos({ alcance: 'proyecto' }), { ...o, cwdProyecto: cwd });
  assert.ok(existsSync(join(cwd, '.claude', 'agents', 'investigador-rl.md')));
  assert.deepEqual(listarAgentes({ ...o, cwdProyecto: cwd }).personalizados.map((a) => [a.id, a.alcance]), [['investigador-rl', 'proyecto']]);
});

test('editar: respalda en .bak, reescribe, ignora el nombre nuevo y no edita un agente activado del catálogo', () => {
  const { o, env } = preparar();
  crearPersonalizado(campos(), o);
  const ruta = join(rutaAgentesUsuario(env), 'investigador-rl.md');
  const antes = readFileSync(ruta, 'utf8');
  const d = editarPersonalizado('investigador-rl', campos({ esfuerzo: 'xhigh', nombre: 'Otro nombre' }), o);
  assert.deepEqual([d.id, d.effort], ['investigador-rl', 'xhigh']);
  assert.equal(readFileSync(`${ruta}.bak`, 'utf8'), antes);
  activarCatalogo('alfa', o);
  lanza(() => editarPersonalizado('alfa', campos(), o), 409);
  lanza(() => editarPersonalizado('no-existe', campos(), o), 404);
});

test('eliminar: sin {confirmar:true} da 400 y no toca nada; con confirmación borra y deja .bak', () => {
  const { o, env } = preparar();
  crearPersonalizado(campos(), o);
  const ruta = join(rutaAgentesUsuario(env), 'investigador-rl.md');
  lanza(() => eliminarPersonalizado('investigador-rl', {}, o), 400);
  lanza(() => eliminarPersonalizado('investigador-rl', { confirmar: 'true' }, o), 400);
  assert.ok(existsSync(ruta));
  assert.deepEqual(eliminarPersonalizado('investigador-rl', { confirmar: true }, o), { id: 'investigador-rl', eliminado: true });
  assert.equal(existsSync(ruta), false);
  assert.ok(existsSync(`${ruta}.bak`));
  activarCatalogo('alfa', o);
  lanza(() => eliminarPersonalizado('alfa', { confirmar: true }, o), 409);
});

test('redactar: argumentos exactos, prompt por stdin y secciones desde structured_output', async () => {
  const { env, spawnFn, invocaciones } = cli('estructurado');
  const s = await redactarPrompt(pedido, { env, spawnFn });
  assert.deepEqual(Object.keys(s), ['rol', 'metodo', 'entregable', 'restricciones', 'retorno']);
  assert.match(s.rol, /Investigador RL/);
  const [inv] = invocaciones();
  assert.deepEqual(inv.argv.slice(0, 9), ['-p', '--model', 'sonnet', '--tools', '', '--no-session-persistence', '--output-format', 'json', '--json-schema']);
  assert.deepEqual(JSON.parse(inv.argv[9]).required, ['rol', 'metodo', 'entregable', 'restricciones', 'retorno']);
  assert.match(inv.stdin, /Nombre: Investigador RL/);
  assert.match(inv.stdin, /escribe en español, profesional, sin relleno/i);
  assert.equal(inv.canal, '');
});

test('redactar: sin structured_output usa el result parseado como JSON', async () => {
  const { env, spawnFn } = cli('solo-result');
  assert.match((await redactarPrompt(pedido, { env, spawnFn })).metodo, /^1\. /);
});

test('redactar: los fallos de Claude dan 502 con su mensaje', async () => {
  for (const [modo, patron] of [['error', /límite de uso/], ['basura', /borrador válido/], ['is-error', /No se pudo completar/]]) {
    const { env, spawnFn } = cli(modo);
    await assert.rejects(redactarPrompt(pedido, { env, spawnFn }), (e) => e.status === 502 && patron.test(e.message), modo);
  }
});

test('redactar: tiempo agotado da 504; datos inválidos dan 400 sin lanzar procesos', async () => {
  const lento = cli('estructurado', { FALSO_CLI_DEMORA_MS: '3000' });
  await assert.rejects(redactarPrompt(pedido, { env: lento.env, spawnFn: lento.spawnFn, timeoutMs: 200 }), (e) => e.status === 504);
  const { env, spawnFn, invocaciones } = cli('estructurado');
  await assert.rejects(redactarPrompt({ ...pedido, nombre: '' }, { env, spawnFn }), (e) => e.status === 400);
  await assert.rejects(redactarPrompt({ ...pedido, modelo: 'gpt' }, { env, spawnFn }), (e) => e.status === 400);
  assert.equal(invocaciones().length, 0);
});
```

- [ ] **Paso 2: correr los tests y ver que fallan**

Ejecuta: `node --test tests/agentes-personalizados.test.mjs`
Esperado: FAIL con `does not provide an export named 'slugAgente'`.

- [ ] **Paso 3: implementar**

En `dashboard/agentes.mjs`:

1. Reemplaza el import de `archivos.mjs` por:
   ```js
   import { escribirAtomico, respaldar, sinBom } from '../scripts/lib/archivos.mjs';
   ```
2. Agrega a los imports:
   ```js
   import { ESFUERZOS } from '../scripts/lib/modelos.mjs';
   import { ejecutarClaude } from './cli-claude.mjs';
   ```
3. Agrega al final del archivo:

```js
// ---------- agentes personalizados ----------
export const TOOLS_VALIDAS = Object.freeze(['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash', 'WebSearch', 'WebFetch', 'NotebookEdit']);
export const MODELOS_AGENTE = Object.freeze(['haiku', 'sonnet', 'opus', 'fable', 'inherit']);
const COLOR_POR_MODELO = { haiku: 'cyan', sonnet: 'blue', opus: 'purple', fable: 'pink', inherit: 'green' };
export const REGLAS_CRITICAS = [
  '## REGLAS CRÍTICAS',
  '',
  '- Nunca agregues coautoría de IA (`Co-Authored-By`, "Generated with Claude") en nada que produzcas.',
  '- No inventes fuentes, citas, URLs, datos ni resultados. Si algo no se puede verificar, dilo.',
  '- No hagas commits ni push: eso es del Guardián Git (`orquestador:guardian-git`).',
  '- Respeta los permisos: si una acción se deniega, no la rodees; informa el bloqueo y propón otra vía.',
  '- Responde en español.',
].join('\n');

export function slugAgente(nombre) {
  return String(nombre ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
}

const esObjeto = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// Solo formato. Las colisiones con el catálogo, el plugin o los integrados se revisan al crear (409).
export function validarAgente(campos, { id: idFijo = null } = {}) {
  const c = esObjeto(campos) ? campos : {};
  const errores = {};
  const id = idFijo ?? slugAgente(c.nombre);
  if (id.length < 3 || id.length > 40 || !ID_AGENTE.test(id)) errores.nombre = 'El nombre debe dar un id de 3 a 40 caracteres (letras, números y guiones)';
  const descripcion = typeof c.descripcion === 'string' ? c.descripcion.trim() : '';
  if (descripcion.length < 20 || descripcion.length > 400 || /[\n"\\]/.test(descripcion)) {
    errores.descripcion = 'Entre 20 y 400 caracteres, en una línea, sin comillas dobles ni barras invertidas';
  }
  if (!MODELOS_AGENTE.includes(c.modelo)) errores.modelo = 'Elige haiku, sonnet, opus, fable o heredar';
  if (!ESFUERZOS.includes(c.esfuerzo)) errores.esfuerzo = 'Elige un esfuerzo válido';
  const pedidas = Array.isArray(c.herramientas) ? [...new Set(c.herramientas)] : [];
  if (!pedidas.length || !pedidas.every((h) => TOOLS_VALIDAS.includes(h))) errores.herramientas = 'Elige al menos una herramienta válida';
  const sec = esObjeto(c.secciones) ? c.secciones : {};
  const secciones = {};
  for (const [k, titulo] of SECCIONES) {
    const v = typeof sec[k] === 'string' ? sec[k].replace(/\r\n/g, '\n').trim() : '';
    if (!v || v.length > 4000) errores[k] = `${titulo}: entre 1 y 4000 caracteres`;
    else if (/^##\s/m.test(v) || v.includes('<!--')) errores[k] = `${titulo}: sin títulos "##" ni comentarios HTML`;
    secciones[k] = v;
  }
  const alcance = c.alcance ?? 'usuario';
  if (!['usuario', 'proyecto'].includes(alcance)) errores.alcance = 'Elige "Todos mis proyectos" o "Solo este repo"';
  return { errores, limpio: { id, descripcion, modelo: c.modelo, esfuerzo: c.esfuerzo, herramientas: TOOLS_VALIDAS.filter((t) => pedidas.includes(t)), secciones, alcance } };
}

const primeraFrase = (t) => {
  const s = String(t ?? '').split('\n')[0].trim();
  const m = /^(.+?[.!?])(\s|$)/.exec(s);
  return (m ? m[1] : s).slice(0, 200);
};

export function construirArchivo({ id, descripcion, modelo, esfuerzo, herramientas, secciones }) {
  return [
    '---', `name: ${id}`, `description: "${descripcion}"`, `model: ${modelo}`, `effort: ${esfuerzo}`,
    `tools: ${herramientas.join(', ')}`, `color: ${COLOR_POR_MODELO[modelo]}`, '---', '',
    `Persona: ${primeraFrase(secciones.rol)}`, '',
    ...SECCIONES.flatMap(([k, titulo]) => [`## ${titulo}`, '', secciones[k], '']),
    REGLAS_CRITICAS, '',
  ].join('\n');
}

function dirAlcance(alcance, env, cwdProyecto) {
  if (alcance !== 'proyecto') return rutaAgentesUsuario(env);
  if (!cwdProyecto) throw new ErrorConversacion(400, 'Para guardar en el proyecto abre una conversación en esa carpeta');
  return rutaAgentesProyecto(cwdProyecto);
}

function exigirValido(errores) {
  if (Object.keys(errores).length) throw new ErrorConversacion(400, 'Revisa los campos marcados', { errores });
}

export function crearPersonalizado(campos, opciones = {}) {
  const o = opcionesDe(opciones);
  const { errores, limpio } = validarAgente(campos);
  exigirValido(errores);
  const { id } = limpio;
  if (cargarCatalogo(o.raizPlugin).has(id)) throw new ErrorConversacion(409, `"${id}" es un agente del catálogo; actívalo desde su pack o elige otro nombre`);
  if (idsReservados(o.raizPlugin).has(id)) throw new ErrorConversacion(409, `"${id}" es un agente del plugin o integrado de Claude Code; elige otro nombre`);
  const ruta = join(dirAlcance(limpio.alcance, o.env, o.cwdProyecto), `${id}.md`);
  if (existsSync(ruta)) throw new ErrorConversacion(409, `Ya existe un agente llamado ${id} en ${limpio.alcance === 'proyecto' ? 'este proyecto' : 'tus agentes'}`);
  escribirAtomico(ruta, construirArchivo(limpio));
  return detalleAgente(limpio.alcance, id, o);
}

function rutaPropia(id, alcance, o) {
  const ruta = join(dirAlcance(alcance, o.env, o.cwdProyecto), `${id}.md`);
  if (!existsSync(ruta)) throw new ErrorConversacion(404, 'No existe ese agente personalizado');
  if (leerMarcador(readFileSync(ruta, 'utf8'))) throw new ErrorConversacion(409, `${id} viene del catálogo; duplícalo como personalizado para cambiarlo`);
  return ruta;
}

export function editarPersonalizado(id, campos, opciones = {}) {
  const o = opcionesDe(opciones);
  validarId(id);
  const { errores, limpio } = validarAgente(campos, { id });
  exigirValido(errores);
  const ruta = rutaPropia(id, limpio.alcance, o);
  respaldar(ruta, '.bak');
  escribirAtomico(ruta, construirArchivo(limpio));
  return detalleAgente(limpio.alcance, id, o);
}

export function eliminarPersonalizado(id, cuerpo, opciones = {}) {
  const o = opcionesDe(opciones);
  validarId(id);
  if (cuerpo?.confirmar !== true) throw new ErrorConversacion(400, 'Confirma la eliminación con {confirmar:true}');
  const alcance = cuerpo.alcance ?? 'usuario';
  if (!['usuario', 'proyecto'].includes(alcance)) throw new ErrorConversacion(400, 'Alcance inválido');
  const ruta = rutaPropia(id, alcance, o);
  respaldar(ruta, '.bak');
  rmSync(ruta);
  return { id, eliminado: true };
}

// ---------- "Redactar con Claude" ----------
export const ESQUEMA_SECCIONES = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: SECCIONES.map(([k]) => k),
  properties: Object.fromEntries(SECCIONES.map(([k, titulo]) => [k, { type: 'string', description: titulo }])),
});

export const argumentosRedactar = () => [
  '-p', '--model', 'sonnet', '--tools', '', '--no-session-persistence', '--output-format', 'json', '--json-schema', JSON.stringify(ESQUEMA_SECCIONES),
];

export function promptRedaccion({ nombre, descripcion, modelo, herramientas }) {
  return [
    'Redacta el prompt de sistema de un subagente de Claude Code. Devuelve solo las cinco secciones del esquema.',
    `Nombre: ${nombre}`,
    `Cuándo usarlo: ${descripcion}`,
    `Modelo: ${modelo}`,
    `Herramientas disponibles: ${herramientas.length ? herramientas.join(', ') : 'ninguna'}`,
    '',
    'Secciones:',
    '- rol: quién es, con qué actitud trabaja y en qué se diferencia de agentes vecinos (2 a 4 frases).',
    '- metodo: de 4 a 7 pasos numerados ("1. …"), cada uno una acción concreta y comprobable; el último verifica el resultado.',
    '- entregable: qué produce exactamente (formato, ubicación y nivel de detalle).',
    '- restricciones: de 3 a 5 viñetas ("- …") con lo que no debe hacer nunca.',
    '- retorno: estructura fija de 3 a 5 bloques numerados para responder al orquestador, en un máximo de ~300 palabras.',
    '',
    'No incluyas títulos "##" ni reglas sobre coautoría, commits o idioma: se agregan aparte.',
    'Escribe en español, profesional, sin relleno.',
  ].join('\n');
}

export function extraerRedaccion(stdout) {
  let o;
  try { o = JSON.parse(String(stdout ?? '').trim()); } catch { throw new ErrorConversacion(502, 'Claude no devolvió un borrador válido'); }
  if (o?.is_error) throw new ErrorConversacion(502, `Claude no pudo redactar: ${o.result ?? o.subtype ?? 'error'}`);
  let s = o?.structured_output;
  if (!esObjeto(s)) { try { s = JSON.parse(o?.result); } catch { s = null; } }
  if (!esObjeto(s) || !SECCIONES.every(([k]) => typeof s[k] === 'string' && s[k].trim())) throw new ErrorConversacion(502, 'El borrador de Claude no trae las cinco secciones');
  return Object.fromEntries(SECCIONES.map(([k]) => [k, s[k].trim()]));
}

export async function redactarPrompt(campos, { env = process.env, spawnFn, timeoutMs = 90_000 } = {}) {
  const c = esObjeto(campos) ? campos : {};
  const nombre = typeof c.nombre === 'string' ? c.nombre.trim() : '';
  const descripcion = typeof c.descripcion === 'string' ? c.descripcion.trim() : '';
  if (!nombre || nombre.length > 80) throw new ErrorConversacion(400, 'Escribe un nombre de hasta 80 caracteres', { errores: { nombre: 'Requerido, hasta 80 caracteres' } });
  if (!descripcion || descripcion.length > 400) throw new ErrorConversacion(400, 'Describe cuándo usarlo (hasta 400 caracteres)', { errores: { descripcion: 'Requerido, hasta 400 caracteres' } });
  if (!MODELOS_AGENTE.includes(c.modelo)) throw new ErrorConversacion(400, 'Elige un modelo', { errores: { modelo: 'Elige un modelo' } });
  const herramientas = Array.isArray(c.herramientas) ? c.herramientas.filter((h) => TOOLS_VALIDAS.includes(h)) : [];
  const r = await ejecutarClaude(argumentosRedactar(), { env, spawnFn, timeoutMs, entrada: promptRedaccion({ nombre, descripcion, modelo: c.modelo, herramientas }) });
  if (r.codigo !== 0) throw new ErrorConversacion(502, r.stderr.split('\n').filter(Boolean).pop() || `Claude Code terminó con código ${r.codigo}`);
  return extraerRedaccion(r.stdout);
}
```

- [ ] **Paso 4: correr los tests nuevos y toda la suite**

Ejecuta: `node --test tests/agentes-personalizados.test.mjs` y después `node --test`.
Esperado: todo PASS (los 56 del catálogo siguen como `todo`).

- [ ] **Paso 5: commit**

```bash
git add plugins/orquestador/dashboard/agentes.mjs tests/agentes-personalizados.test.mjs
git commit -m "feat: agentes personalizados y redacción del prompt con Claude"
```

---

### Tarea 7: proceso y gestor: denegaciones, costo acumulado, mensajes encolados y endurecimiento

**Archivos:**
- Modificar: `plugins/orquestador/dashboard/proceso-claude.mjs`
- Reescribir: `plugins/orquestador/dashboard/conversaciones.mjs`
- Modificar: `tests/fixtures/claude-falso.mjs` (paso `emitirSinSalto`)
- Modificar: `tests/fixtures/guiones.mjs` (pieza `denegado`)
- Modificar: `tests/proceso-claude.test.mjs` (test `turno simple`)
- Modificar: `tests/conversaciones.test.mjs` (test `inactividad: no cierra un proceso que está trabajando`)
- Crear: `tests/conversaciones-v2.test.mjs`

**Interfaces:**
- Consume: `leerJsonUsuario` y `respaldar` (Tarea 1); `cargarConfig(env).modoPermisoDefecto` (Tarea 1); `ErrorConversacion(status, mensaje, extra)` (Tarea 3).
- Produce (`proceso-claude.mjs`):
  - Evento normalizado nuevo `{ tipo: 'denegado', herramienta, entrada, motivo }`, desde `system` con `subtype: 'permission_denied'`. Toma `tool_name|tool`, `tool_input|input` y `reason|message|decision_reason`.
  - `fin-turno` suma `encolados: number` (de `queued_turn_count`; 0 si falta).
  - `responderPermiso(id, …) → boolean`: con un id desconocido no escribe nada y devuelve `false`.
  - La última línea sin salto final se procesa al cerrar.
- Produce (`conversaciones.mjs`):
  - `ramaDe(cwd) → Promise<string|null>`.
  - El gestor ahora expone `on(fn) → () => void` (función para quitar el oyente), `denegadosDe(id) → [{ id, herramienta, entrada, motivo, ts }]` y `refrescarRama(id) → Promise<conversación pública>`.
  - Cada conversación lleva `modelo` (del evento `sesion`), `costoUSD` (total de la conversación) y `costoPrevio` (procesos ya terminados).
  - Evento SSE nuevo `chat:denegado { conversacion, id, herramienta, entrada, motivo, ts }`. `chat:fin-turno` suma `encolados` y `costoTotalUSD`.
  - `crear({ cwd })` sin `modo` usa `modoPermisoDefecto`.

- [ ] **Paso 1: ajustar los fixtures**

En `tests/fixtures/claude-falso.mjs`, dentro de `correr()`, agrega después de la línea `if (paso.crudo) …`:

```js
    if (paso.emitirSinSalto) process.stdout.write(JSON.stringify(paso.emitirSinSalto)); // última línea sin "\n"
```

y actualiza el comentario del guion de la línea 3 para que diga `{ emitir: {...} }, { emitirSinSalto: {...} }, { crudo: '...' }`.

En `tests/fixtures/guiones.mjs`, agrega al final:

```js
export const denegado = (herramienta, command, motivo) => ({ emitir: { type: 'system', subtype: 'permission_denied', tool_name: herramienta, tool_input: { command }, reason: motivo } });
```

- [ ] **Paso 2: escribir los tests que fallan**

En `tests/proceso-claude.test.mjs`, test `turno simple: …`, reemplaza:

```js
  assert.deepEqual(eventos.find((e) => e.tipo === 'fin-turno'), { tipo: 'fin-turno', ok: true, costoUSD: 0.01, duracionMs: 900, error: null, sessionId: 'ses-1' });
```

por:

```js
  assert.deepEqual(eventos.find((e) => e.tipo === 'fin-turno'), { tipo: 'fin-turno', ok: true, costoUSD: 0.01, duracionMs: 900, error: null, sessionId: 'ses-1', encolados: 0 });
```

En `tests/conversaciones.test.mjs`, reemplaza el test `inactividad: no cierra un proceso que está trabajando` completo por esta versión, que sí arma el temporizador (el turno 1 termina) antes de volver a trabajar:

```js
test('inactividad: no cierra un proceso que volvió a trabajar después de armar el temporizador', async () => {
  const { env, spawnFn, home } = entorno([ESPERAR_USUARIO, INIT, ...texto('m1', 'a'), fin(), ESPERAR_USUARIO, INIT]);
  const g = crearGestor({ env, spawnFn, inactividadProcesoMs: 150 });
  const { hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  g.enviar(c.id, 'uno');
  await hasta((e) => e.tipo === 'chat:fin-turno'); // aquí se arma el temporizador de inactividad
  g.enviar(c.id, 'dos');
  await new Promise((r) => setTimeout(r, 400));
  assert.deepEqual([g.hayProcesos(), g.obtener(c.id).estado], [true, 'trabajando']);
  await g.apagar();
});
```

`tests/conversaciones-v2.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { crearGestor } from '../plugins/orquestador/dashboard/conversaciones.mjs';
import { abrirProceso, crearNormalizador } from '../plugins/orquestador/dashboard/proceso-claude.mjs';
import { rutaConversaciones } from '../plugins/orquestador/scripts/lib/rutas.mjs';
import { ESPERAR_USUARIO, ESPERAR_RESPUESTA, ESPERAR_PEDIDO, INIT, texto, permiso, fin, finInterrumpido, turnoSimple, denegado } from './fixtures/guiones.mjs';

const FALSO = fileURLToPath(new URL('./fixtures/claude-falso.mjs', import.meta.url));
const hayGit = (() => { try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

function entorno(guion, config = {}) {
  const home = mkdtempSync(join(tmpdir(), 'orq-conv2-'));
  writeFileSync(join(home, 'config.json'), JSON.stringify({ rutaClaude: 'claude-falso', ...config }));
  writeFileSync(join(home, 'guion.json'), JSON.stringify(guion));
  const registro = join(home, 'registro.jsonl');
  const env = { ORQUESTADOR_HOME: home, FALSO_GUION: join(home, 'guion.json'), FALSO_REGISTRO: registro, PATH: process.env.PATH, SystemRoot: process.env.SystemRoot };
  const spawnFn = (_bin, args, opciones) => spawn(process.execPath, [FALSO, ...args], opciones);
  const leerRegistro = () => readFileSync(registro, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  return { home, env, spawnFn, leerRegistro };
}

function esperador(eventos) {
  return (pred, ms = 5000) => new Promise((ok, mal) => {
    const t0 = Date.now();
    const mirar = () => {
      const e = typeof pred === 'function' && pred.length === 0 ? (pred() || null) : eventos.find(pred);
      if (e) return ok(e);
      if (Date.now() - t0 > ms) return mal(new Error(`timeout; eventos: ${eventos.map((x) => x.tipo).join(',')}`));
      setTimeout(mirar, 10);
    };
    mirar();
  });
}
function recolector(g) {
  const eventos = [];
  g.on((e) => eventos.push(e));
  return { eventos, hasta: esperador(eventos) };
}
function proceso(guion) {
  const { env, spawnFn, home, leerRegistro } = entorno(guion);
  const p = abrirProceso({ cwd: home, modo: 'preguntar', binario: 'claude-falso', env: { ...process.env, ...env }, spawnFn });
  const eventos = [];
  p.on('evento', (e) => eventos.push(e));
  return { p, eventos, hasta: esperador(eventos), leerRegistro };
}

test('normalizador: permission_denied con nombres alternativos y result con queued_turn_count', () => {
  const n = crearNormalizador();
  assert.deepEqual(n({ type: 'system', subtype: 'permission_denied', tool_name: 'Bash', tool_input: { command: 'rm -rf x' }, reason: 'Destructivo' }),
    [{ tipo: 'denegado', herramienta: 'Bash', entrada: { command: 'rm -rf x' }, motivo: 'Destructivo' }]);
  assert.deepEqual(n({ type: 'system', subtype: 'permission_denied', tool: 'Write', input: { file_path: 'a' }, message: 'No' }),
    [{ tipo: 'denegado', herramienta: 'Write', entrada: { file_path: 'a' }, motivo: 'No' }]);
  assert.equal(n({ type: 'system', subtype: 'permission_denied', decision_reason: 'Regla' })[0].motivo, 'Regla');
  assert.equal(n({ type: 'result', subtype: 'success', queued_turn_count: 2 })[0].encolados, 2);
  assert.equal(n({ type: 'result', subtype: 'success' })[0].encolados, 0);
});

test('proceso: responderPermiso con un id desconocido o ya respondido no envía nada', async () => {
  const { p, hasta, leerRegistro } = proceso([ESPERAR_USUARIO, INIT, permiso('r1', 'ls'), ESPERAR_RESPUESTA, fin()]);
  p.enviar('x');
  await hasta((e) => e.tipo === 'permiso');
  assert.equal(p.responderPermiso('inventado', { permitir: true }), false);
  assert.equal(p.responderPermiso('r1', { permitir: true }), true);
  assert.equal(p.responderPermiso('r1', { permitir: true }), false);
  await hasta((e) => e.tipo === 'fin-turno');
  assert.deepEqual(leerRegistro().filter((r) => r.stdin?.type === 'control_response').map((r) => r.stdin.response.request_id), ['r1']);
  p.cerrar();
  await hasta((e) => e.tipo === 'salida');
});

test('proceso: la última línea sin salto final se procesa al cerrar', async () => {
  const { p, hasta } = proceso([ESPERAR_USUARIO, INIT, { emitirSinSalto: fin().emitir }, { salir: 0 }]);
  p.enviar('x');
  await hasta((e) => e.tipo === 'salida');
  await hasta((e) => e.tipo === 'fin-turno', 200);
});

test('costo: total_cost_usd es acumulado por proceso y, al terminar el proceso, se suma al de la conversación', async () => {
  const { env, spawnFn, home } = entorno([ESPERAR_USUARIO, INIT, fin({ total_cost_usd: 0.00336 }), ESPERAR_USUARIO, INIT, fin({ total_cost_usd: 0.0037 })]);
  const g = crearGestor({ env, spawnFn });
  const { eventos, hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  const fines = () => eventos.filter((e) => e.tipo === 'chat:fin-turno');
  g.enviar(c.id, 'uno');
  await hasta(() => fines().length === 1);
  assert.equal(g.obtener(c.id).costoUSD, 0.00336);
  g.enviar(c.id, 'dos');
  await hasta(() => fines().length === 2);
  assert.equal(g.obtener(c.id).costoUSD, 0.0037); // no 0.00706: el segundo result ya incluye el primero
  assert.equal(fines()[1].costoTotalUSD, 0.0037);
  g.cerrar(c.id);
  await hasta((e) => e.tipo === 'chat:estado' && e.conv.estado === 'inactiva' && e.conv.costoUSD === 0.0037);
  g.enviar(c.id, 'tres'); // proceso nuevo: su primer result (0.00336) se suma a lo anterior
  await hasta(() => fines().length === 3);
  assert.ok(Math.abs(g.obtener(c.id).costoUSD - 0.00706) < 1e-12);
  await g.apagar();
  assert.ok(Math.abs(crearGestor({ env, spawnFn }).obtener(c.id).costoUSD - 0.00706) < 1e-12);
});

test('encolados: un result con queued_turn_count > 0 deja la conversación trabajando', async () => {
  const { env, spawnFn, home } = entorno([ESPERAR_USUARIO, INIT, fin({ queued_turn_count: 1 }), fin()]);
  const g = crearGestor({ env, spawnFn });
  const { eventos, hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  g.enviar(c.id, 'x');
  await hasta(() => eventos.filter((e) => e.tipo === 'chat:fin-turno').length === 2);
  const i = eventos.findIndex((e) => e.tipo === 'chat:fin-turno');
  assert.equal(eventos[i].encolados, 1);
  assert.equal(eventos.slice(i).find((e) => e.tipo === 'chat:estado').conv.estado, 'trabajando');
  assert.equal(g.obtener(c.id).estado, 'lista');
  await g.apagar();
});

test('denegado: emite chat:denegado y queda disponible en denegadosDe', async () => {
  const { env, spawnFn, home } = entorno([ESPERAR_USUARIO, INIT, denegado('Bash', 'git push --force', 'Git destructivo'), fin()]);
  const g = crearGestor({ env, spawnFn });
  const { hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  g.enviar(c.id, 'x');
  const d = await hasta((e) => e.tipo === 'chat:denegado');
  assert.deepEqual([d.herramienta, d.entrada, d.motivo], ['Bash', { command: 'git push --force' }, 'Git destructivo']);
  assert.equal(g.denegadosDe(c.id)[0].id, d.id);
  await g.apagar();
});

test('modelo del orquestador: se guarda desde el evento sesion', async () => {
  const { env, spawnFn, home } = entorno(turnoSimple());
  const g = crearGestor({ env, spawnFn });
  const { hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  g.enviar(c.id, 'x');
  await hasta((e) => e.tipo === 'chat:fin-turno');
  assert.equal(g.obtener(c.id).modelo, 'claude-opus-5-5');
  await g.apagar();
});

test('enviar mientras el proceso se cierra: espera la salida y abre uno nuevo con --resume', async () => {
  const { env, spawnFn, home, leerRegistro } = entorno(turnoSimple());
  const g = crearGestor({ env, spawnFn });
  const { eventos, hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  g.enviar(c.id, 'uno');
  await hasta((e) => e.tipo === 'chat:fin-turno');
  g.cerrar(c.id);
  g.enviar(c.id, 'dos');
  await hasta(() => eventos.filter((e) => e.tipo === 'chat:fin-turno').length === 2);
  const arranques = leerRegistro().filter((r) => r.argv);
  assert.equal(arranques.length, 2);
  assert.equal(arranques[1].argv[arranques[1].argv.indexOf('--resume') + 1], 'ses-1');
  assert.deepEqual(leerRegistro().filter((r) => r.stdin?.type === 'user').map((r) => r.stdin.message.content), ['uno', 'dos']);
  await g.apagar();
});

test('un fin-turno que llega mientras el proceso se cierra se ignora', async () => {
  const { env, spawnFn, home } = entorno([ESPERAR_USUARIO, INIT, ESPERAR_PEDIDO, finInterrumpido]);
  const g = crearGestor({ env, spawnFn });
  const { eventos, hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  g.enviar(c.id, 'x');
  await hasta((e) => e.tipo === 'chat:estado' && e.conv.sessionId === 'ses-1');
  await g.apagar(); // interrumpe y cierra: el result del interrupt llega con el cierre en curso
  assert.equal(eventos.filter((e) => e.tipo === 'chat:fin-turno').length, 0);
  assert.equal(g.obtener(c.id).estado, 'inactiva');
});

test('conversaciones.json dañado: se respalda en .corrupto y se empieza de cero', () => {
  const { env, spawnFn } = entorno(turnoSimple());
  writeFileSync(rutaConversaciones(env), '{no es json');
  const errores = [];
  const original = console.error;
  console.error = (...a) => errores.push(a.join(' '));
  try {
    assert.deepEqual(crearGestor({ env, spawnFn }).listar(), []);
  } finally { console.error = original; }
  assert.equal(readFileSync(`${rutaConversaciones(env)}.corrupto`, 'utf8'), '{no es json');
  assert.ok(errores.some((x) => /corrupto/.test(x)), errores.join('\n'));
});

test('crear sin modo usa modoPermisoDefecto de la config', () => {
  const { env, spawnFn, home } = entorno(turnoSimple(), { modoPermisoDefecto: 'auto' });
  assert.equal(crearGestor({ env, spawnFn }).crear({ cwd: home }).modo, 'auto');
});

test('rama: se calcula en segundo plano al crear y se refresca al pedirla', { skip: !hayGit && 'git no está instalado' }, async () => {
  const { env, spawnFn, home } = entorno(turnoSimple());
  execFileSync('git', ['init', '-q', home]);
  execFileSync('git', ['-C', home, 'checkout', '-q', '-b', 'feat/prueba']);
  const g = crearGestor({ env, spawnFn });
  const { hasta } = recolector(g);
  const c = g.crear({ cwd: home });
  assert.equal(c.rama, null);
  const e = await hasta((x) => x.tipo === 'chat:estado' && x.conv.rama === 'feat/prueba');
  assert.equal(e.conv.etiqueta, '[FEAT]');
  execFileSync('git', ['-C', home, 'checkout', '-q', '-b', 'fix/otra']);
  assert.equal((await g.refrescarRama(c.id)).rama, 'fix/otra');
});

test('on devuelve una función que quita el oyente', async () => {
  const { env, spawnFn, home } = entorno(turnoSimple());
  const g = crearGestor({ env, spawnFn });
  let n = 0;
  const quitar = g.on(() => { n += 1; });
  g.crear({ cwd: home });
  const antes = n;
  quitar();
  g.crear({ cwd: home });
  assert.ok(antes > 0);
  assert.equal(n, antes);
});
```

- [ ] **Paso 3: correr los tests y ver que fallan**

Ejecuta: `node --test tests/conversaciones-v2.test.mjs tests/proceso-claude.test.mjs tests/conversaciones.test.mjs`
Esperado: FAIL (no hay evento `denegado`, `fin-turno` no trae `encolados`, `denegadosDe` no existe y `on` no devuelve función).

- [ ] **Paso 4: implementar en `proceso-claude.mjs`**

En `crearNormalizador`, reemplaza el `case 'system':` por:

```js
      case 'system': {
        if (msg.subtype === 'init') return [{ tipo: 'sesion', sessionId: msg.session_id ?? null, modelo: msg.model ?? null }];
        // Modo automático: el clasificador detuvo una acción (en -p llega como system/permission_denied).
        if (msg.subtype === 'permission_denied') {
          return [{ tipo: 'denegado', herramienta: msg.tool_name ?? msg.tool ?? null, entrada: msg.tool_input ?? msg.input ?? {}, motivo: msg.reason ?? msg.message ?? msg.decision_reason ?? null }];
        }
        return [];
      }
```

y el `case 'result':` por:

```js
      case 'result': {
        const ok = msg.subtype === 'success' && !msg.is_error;
        const encolados = Number(msg.queued_turn_count) > 0 ? Number(msg.queued_turn_count) : 0;
        return [{ tipo: 'fin-turno', ok, costoUSD: msg.total_cost_usd ?? null, duracionMs: msg.duration_ms ?? null, error: ok ? null : String(msg.result ?? msg.subtype ?? 'error'), sessionId: msg.session_id ?? null, encolados }];
      }
```

En `abrirProceso`, reemplaza el manejador `hijo.stdout?.on('data', …)` completo por:

```js
  const procesarLinea = (l) => {
    if (!l.trim()) return;
    let msg;
    try { msg = JSON.parse(l); } catch { em.emit('basura', l); return; }
    for (const e of normalizar(msg)) {
      if (e.tipo === 'permiso') entradas.set(e.solicitudId, e.entrada);
      if (e.tipo === 'permiso-cancelado') entradas.delete(e.solicitudId);
      em.emit('evento', e);
    }
  };
  hijo.stdout?.on('data', (d) => {
    const partes = (resto + decodificador.write(d)).split('\n');
    resto = partes.pop();
    for (const l of partes) procesarLinea(l);
  });
```

reemplaza `hijo.on('close', …)` por:

```js
  hijo.on('close', (codigo) => {
    procesarLinea(resto + decodificador.end()); // la última línea puede llegar sin "\n"
    resto = '';
    salir(codigo, codigo ? (ultimaLinea(stderr) || `Claude Code terminó con código ${codigo}`) : null);
  });
```

y reemplaza `em.responderPermiso = …` por:

```js
  // Un id desconocido (o ya respondido) no se envía: Claude Code no espera esa respuesta.
  em.responderPermiso = (id, { permitir, mensaje } = {}) => {
    if (!entradas.has(id)) return false;
    const entrada = entradas.get(id);
    entradas.delete(id);
    escribir(respuestaPermiso(id, { permitir, mensaje, entrada }));
    return true;
  };
```

- [ ] **Paso 5: reescribir `conversaciones.mjs`**

Reemplaza `dashboard/conversaciones.mjs` completo por:

```js
// Registro y ciclo de vida de las conversaciones del dashboard. Persiste en ~/.claude/orquestador/conversaciones.json.
import { writeFileSync, renameSync, mkdirSync, statSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { EventEmitter } from 'node:events';
import { rutaConversaciones } from '../scripts/lib/rutas.mjs';
import { cargarConfig } from '../scripts/lib/config.mjs';
import { leerJsonUsuario, respaldar } from '../scripts/lib/archivos.mjs';
import { abrirProceso, resolverBinario, MODOS } from './proceso-claude.mjs';

export class ErrorConversacion extends Error {
  // extra: datos que acompañan al error en la respuesta JSON (p. ej. { errores: { campo: mensaje } }).
  constructor(status, mensaje, extra = null) { super(mensaje); this.status = status; this.extra = extra; }
}

const EN_CURSO = new Set(['trabajando', 'esperando-permiso']);
const TITULO_NUEVO = 'Nueva conversación';
const DE_ARCHIVO = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const MAX_DENEGADOS = 20;
const execFileP = promisify(execFile);

const TIPOS_CC = new Set(['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert']);
const comoEtiqueta = (m) => (m && TIPOS_CC.has(m[1].toLowerCase()) ? `[${m[1].toUpperCase()}]` : null);

// Solo tipos de Conventional Commits: "Ojo: x", "https://x" o "dependabot/x" no son etiquetas.
export function etiquetaDe({ rama, titulo } = {}) {
  return comoEtiqueta(/^([a-z]+)(\([^)]*\))?!?:/i.exec(titulo ?? '')) ?? comoEtiqueta(/^([a-z]+)\//i.exec(rama ?? ''));
}

export function clavePermiso(herramienta, entrada = {}) {
  if (herramienta === 'Bash' || herramienta === 'PowerShell') return `${herramienta}:${entrada.command ?? ''}`;
  if (DE_ARCHIVO.has(herramienta)) return `${herramienta}:${entrada.file_path ?? entrada.notebook_path ?? ''}`;
  return `${herramienta}:${JSON.stringify(entrada)}`;
}

// Rama actual de `cwd` sin bloquear el servidor (git puede tardar en un disco lento o sincronizado).
export async function ramaDe(cwd) {
  try {
    const { stdout } = await execFileP('git', ['-C', cwd, 'branch', '--show-current'], { encoding: 'utf8', timeout: 3000, windowsHide: true });
    return stdout.trim() || null;
  } catch { return null; }
}

// Un conversaciones.json dañado se respalda en .corrupto antes de empezar de cero: nunca se pierde en silencio.
function leerLista(env) {
  const ruta = rutaConversaciones(env);
  const { existe, datos, error } = leerJsonUsuario(ruta);
  if (!existe) return [];
  if (!error && Array.isArray(datos)) return datos;
  let respaldo = null;
  try { respaldo = respaldar(ruta, '.corrupto'); } catch { /* p. ej. la ruta es un directorio */ }
  console.error(`No se pudo leer ${ruta}${respaldo ? `; se respaldó en ${respaldo}` : ''} y se empieza de cero.`);
  return [];
}

const dormir = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const INTENTOS_GUARDAR = 3;

export function crearGestor({
  env = process.env, spawnFn, ahora = () => new Date().toISOString(),
  inactividadProcesoMs = 10 * 60 * 1000, // un proceso en "lista" sin mensajes se cierra; el siguiente lo retoma con --resume
  esperaInterrupcionMs = 10_000, // si tras interrumpir no llega el result, se cierra el proceso
} = {}) {
  // Un proceso de una vida anterior del servidor ya terminó: su costo pasa a ser costo previo de la conversación.
  const lista = leerLista(env).map((c) => {
    const base = { ...c, costoUSD: c.costoUSD ?? 0, costoPrevio: c.costoUSD ?? 0 };
    return EN_CURSO.has(c.estado) || c.pid ? { ...base, estado: 'inactiva', pid: null } : base;
  });
  const procesos = new Map();
  const pendientes = new Map();
  const reglas = new Map();
  const cerrando = new Set();
  const interrumpidas = new Set();
  const porEnviar = new Map(); // id → textos que llegaron mientras el proceso se cerraba
  const denegados = new Map(); // id → últimas denegaciones del modo automático (solo en memoria)
  const temporizadores = { inactividad: new Map(), interrupcion: new Map() };
  const emisor = new EventEmitter();
  emisor.setMaxListeners(0);

  // Un error de disco (antivirus, OneDrive, disco lleno) no debe tumbar el servidor: se reintenta y se informa.
  const guardar = () => {
    const ruta = rutaConversaciones(env);
    const tmp = `${ruta}.${process.pid}.tmp`;
    for (let intento = 1; ; intento++) {
      try {
        mkdirSync(dirname(ruta), { recursive: true });
        writeFileSync(tmp, JSON.stringify(lista, null, 2));
        renameSync(tmp, ruta);
        return;
      } catch (e) {
        if (intento < INTENTOS_GUARDAR) { dormir(50); continue; }
        try { rmSync(tmp, { force: true }); } catch { /* nada que limpiar */ }
        console.error(`No se pudo guardar ${ruta}: ${e.message}`);
        return;
      }
    }
  };
  const armar = (tipo, id, ms, fn) => {
    desarmar(tipo, id);
    if (ms > 0) temporizadores[tipo].set(id, setTimeout(() => { temporizadores[tipo].delete(id); fn(); }, ms).unref());
  };
  const desarmar = (tipo, id) => { clearTimeout(temporizadores[tipo].get(id)); temporizadores[tipo].delete(id); };
  const emitir = (e) => emisor.emit('chat', e);
  const publica = (c) => ({ ...c, etiqueta: etiquetaDe(c) });
  const emitirEstado = (c) => emitir({ tipo: 'chat:estado', conversacion: c.id, conv: publica(c) });
  const buscar = (id) => {
    const c = lista.find((x) => x.id === id);
    if (!c) throw new ErrorConversacion(404, 'No existe esa conversación');
    return c;
  };
  const enCurso = () => lista.filter((c) => EN_CURSO.has(c.estado)).length;
  // total_cost_usd es acumulado por proceso: el total es lo de los procesos anteriores más lo de este.
  const registrarCosto = (c, e) => { if (typeof e.costoUSD === 'number') c.costoUSD = (c.costoPrevio ?? 0) + e.costoUSD; };
  if (lista.length) guardar();

  function asegurarProceso(c) {
    if (procesos.has(c.id)) return procesos.get(c.id);
    const binario = resolverBinario(cargarConfig(env), env);
    if (!binario) throw new ErrorConversacion(500, 'No encontré el binario de Claude Code; define rutaClaude en config.json');
    const p = abrirProceso({ cwd: c.cwd, sessionId: c.sessionId, modo: c.modo, binario, env, spawnFn });
    procesos.set(c.id, p);
    pendientes.set(c.id, new Map());
    c.pid = p.pid;
    p.on('evento', (e) => manejarEvento(c, e));
    return p;
  }

  // Tras la salida de un proceso que se cerraba, los mensajes que esperaban abren uno nuevo con --resume.
  function enviarPendientes(c) {
    const textos = porEnviar.get(c.id);
    if (!textos?.length) return;
    porEnviar.delete(c.id);
    try {
      const p = asegurarProceso(c);
      c.estado = 'trabajando';
      c.error = null;
      for (const t of textos) p.enviar(t);
    } catch (e) {
      c.estado = 'error';
      c.error = e.message;
    }
    c.ultima = ahora();
    guardar();
    emitirEstado(c);
  }

  async function refrescar(c) {
    const rama = await ramaDe(c.cwd);
    if (rama !== c.rama && lista.includes(c)) { c.rama = rama; guardar(); emitirEstado(c); }
    return publica(c);
  }

  function manejarEvento(c, e) {
    switch (e.tipo) {
      case 'sesion': {
        let cambio = false;
        if (e.sessionId && e.sessionId !== c.sessionId) { c.sessionId = e.sessionId; cambio = true; }
        if (e.modelo && e.modelo !== c.modelo) { c.modelo = e.modelo; cambio = true; }
        if (cambio) { guardar(); emitirEstado(c); }
        return;
      }
      case 'permiso': {
        if ((reglas.get(c.id) ?? []).includes(clavePermiso(e.herramienta, e.entrada))) {
          procesos.get(c.id)?.responderPermiso(e.solicitudId, { permitir: true });
          return;
        }
        const p = { solicitudId: e.solicitudId, herramienta: e.herramienta, entrada: e.entrada ?? {}, motivo: e.motivo ?? null };
        pendientes.get(c.id)?.set(e.solicitudId, p);
        c.estado = 'esperando-permiso';
        emitir({ tipo: 'chat:permiso', conversacion: c.id, ...p });
        emitirEstado(c);
        return;
      }
      case 'permiso-cancelado': {
        // Claude Code retiró la solicitud (p. ej. tras un interrupt): ya no se puede responder.
        const mapa = pendientes.get(c.id);
        const p = mapa?.get(e.solicitudId);
        if (!p) return;
        mapa.delete(e.solicitudId);
        if (!mapa.size && c.estado === 'esperando-permiso') c.estado = 'trabajando';
        emitir({ tipo: 'chat:permiso-resuelto', conversacion: c.id, solicitudId: e.solicitudId, decision: 'cancelado', herramienta: p.herramienta, entrada: p.entrada });
        emitirEstado(c);
        return;
      }
      case 'denegado': {
        const d = { id: randomUUID(), herramienta: e.herramienta ?? null, entrada: e.entrada ?? {}, motivo: e.motivo ?? null, ts: ahora() };
        denegados.set(c.id, [...(denegados.get(c.id) ?? []), d].slice(-MAX_DENEGADOS));
        emitir({ tipo: 'chat:denegado', conversacion: c.id, ...d });
        return;
      }
      case 'texto-parcial':
      case 'mensaje':
        emitir({ ...e, tipo: `chat:${e.tipo}`, conversacion: c.id });
        return;
      case 'fin-turno': {
        registrarCosto(c, e);
        if (cerrando.has(c.id)) { guardar(); return; } // el proceso se está cerrando: su último result no cambia el estado
        desarmar('interrupcion', c.id);
        const interrumpido = interrumpidas.delete(c.id);
        pendientes.get(c.id)?.clear();
        if (e.sessionId) c.sessionId = e.sessionId;
        const ok = e.ok || interrumpido;
        const encolados = !interrumpido && e.encolados > 0 ? e.encolados : 0;
        c.estado = !ok ? 'error' : encolados ? 'trabajando' : 'lista'; // con mensajes encolados el proceso sigue trabajando
        c.error = ok ? null : e.error;
        c.ultima = ahora();
        guardar();
        emitir({ tipo: 'chat:fin-turno', conversacion: c.id, ok: e.ok, error: c.error, costoUSD: e.costoUSD ?? null, costoTotalUSD: c.costoUSD ?? 0, interrumpido, encolados });
        emitirEstado(c);
        if (c.estado === 'lista') armar('inactividad', c.id, inactividadProcesoMs, () => cerrarProceso(c, 'lista'));
        return;
      }
      case 'salida':
        desarmar('inactividad', c.id);
        desarmar('interrupcion', c.id);
        procesos.delete(c.id);
        pendientes.delete(c.id);
        interrumpidas.delete(c.id);
        c.pid = null;
        c.costoPrevio = c.costoUSD ?? 0;
        if (cerrando.delete(c.id)) { c.estado = 'inactiva'; c.error = null; }
        else if (EN_CURSO.has(c.estado) || e.codigo !== 0) { c.estado = 'error'; c.error = e.error ?? 'Claude Code terminó inesperadamente'; }
        else if (c.estado !== 'error') c.estado = 'inactiva';
        guardar();
        emitirEstado(c);
        enviarPendientes(c);
        return;
      default:
    }
  }

  // Cierra el proceso como cierre pedido (la conversación queda inactiva, no en error), solo si sigue en el estado esperado.
  function cerrarProceso(c, estadoEsperado) {
    const p = procesos.get(c.id);
    if (!p || (estadoEsperado && c.estado !== estadoEsperado)) return;
    cerrando.add(c.id);
    p.cerrar();
  }

  // El interrupt no trajo result a tiempo: se da el turno por interrumpido y se cierra el proceso.
  function interrupcionVencida(c) {
    if (!procesos.has(c.id) || !EN_CURSO.has(c.estado)) return;
    interrumpidas.delete(c.id);
    pendientes.get(c.id)?.clear();
    emitir({ tipo: 'chat:fin-turno', conversacion: c.id, ok: false, error: null, costoUSD: null, costoTotalUSD: c.costoUSD ?? 0, interrumpido: true, encolados: 0 });
    cerrarProceso(c);
  }

  return {
    on: (fn) => { emisor.on('chat', fn); return () => emisor.off('chat', fn); },
    listar: () => [...lista].sort((a, b) => String(b.ultima).localeCompare(String(a.ultima))).map(publica),
    obtener: (id) => publica(buscar(id)),
    pendientesDe: (id) => [...(pendientes.get(buscar(id).id)?.values() ?? [])],
    denegadosDe: (id) => [...(denegados.get(buscar(id).id) ?? [])],
    refrescarRama: (id) => refrescar(buscar(id)),
    hayProcesos: () => procesos.size > 0,

    crear({ cwd, modo } = {}) {
      const m = modo ?? cargarConfig(env).modoPermisoDefecto;
      if (!MODOS[m]) throw new ErrorConversacion(400, `Modo desconocido: ${m}`);
      let esDir = false;
      try { esDir = !!cwd && statSync(String(cwd)).isDirectory(); } catch { /* no existe */ }
      if (!esDir) throw new ErrorConversacion(400, 'La carpeta no existe o no es un directorio');
      const c = {
        id: randomUUID(), sessionId: null, titulo: TITULO_NUEVO, cwd: String(cwd), rama: null, modo: m, creada: ahora(), ultima: ahora(),
        estado: 'inactiva', pid: null, error: null, modelo: null, costoUSD: 0, costoPrevio: 0,
      };
      lista.push(c);
      guardar();
      emitirEstado(c);
      refrescar(c); // la rama llega después por chat:estado
      return publica(c);
    },

    enviar(id, texto) {
      const c = buscar(id);
      const t = String(texto ?? '').trim();
      if (!t) throw new ErrorConversacion(400, 'El mensaje está vacío');
      const max = cargarConfig(env).conversacionesMax;
      if (!EN_CURSO.has(c.estado) && enCurso() >= max) throw new ErrorConversacion(409, `Hay ${enCurso()} conversaciones trabajando; espera o detén una`);
      // Si el proceso se está cerrando (inactividad o "Cerrar proceso"), escribirle sería perder el mensaje.
      const esperaSalida = cerrando.has(c.id) && procesos.has(c.id);
      const p = esperaSalida ? null : asegurarProceso(c);
      desarmar('inactividad', c.id);
      interrumpidas.delete(c.id);
      if (c.titulo === TITULO_NUEVO) c.titulo = t.length > 60 ? `${t.slice(0, 59)}…` : t;
      c.estado = 'trabajando';
      c.error = null;
      c.ultima = ahora();
      emitir({ tipo: 'chat:usuario', conversacion: c.id, id: randomUUID(), texto: t });
      if (esperaSalida) porEnviar.set(c.id, [...(porEnviar.get(c.id) ?? []), t]);
      else p.enviar(t);
      guardar();
      emitirEstado(c);
    },

    responderPermiso(id, solicitudId, decision) {
      const c = buscar(id);
      if (!['permitir', 'siempre', 'denegar'].includes(decision)) throw new ErrorConversacion(400, 'Decisión inválida');
      const mapa = pendientes.get(c.id);
      const p = mapa?.get(solicitudId);
      if (!p) throw new ErrorConversacion(404, 'Ese permiso ya no está pendiente');
      if (decision === 'siempre') reglas.set(c.id, [...(reglas.get(c.id) ?? []), clavePermiso(p.herramienta, p.entrada)]);
      procesos.get(c.id)?.responderPermiso(solicitudId, { permitir: decision !== 'denegar' });
      mapa.delete(solicitudId);
      if (!mapa.size && c.estado === 'esperando-permiso') c.estado = 'trabajando';
      emitir({ tipo: 'chat:permiso-resuelto', conversacion: c.id, solicitudId, decision, herramienta: p.herramienta, entrada: p.entrada });
      emitirEstado(c);
    },

    cambiarModo(id, modo) {
      const c = buscar(id);
      if (!MODOS[modo]) throw new ErrorConversacion(400, `Modo desconocido: ${modo}`);
      c.modo = modo;
      procesos.get(c.id)?.cambiarModo(modo);
      guardar();
      emitirEstado(c);
      return publica(c);
    },

    renombrar(id, titulo) {
      const c = buscar(id);
      const t = String(titulo ?? '').trim();
      if (!t || t.length > 120) throw new ErrorConversacion(400, 'El título debe tener entre 1 y 120 caracteres');
      c.titulo = t;
      guardar();
      emitirEstado(c);
      return publica(c);
    },

    interrumpir(id) {
      const c = buscar(id);
      const p = procesos.get(c.id);
      if (!p) return;
      if (EN_CURSO.has(c.estado)) {
        interrumpidas.add(c.id);
        armar('interrupcion', c.id, esperaInterrupcionMs, () => interrupcionVencida(c));
      }
      p.interrumpir();
    },

    cerrar(id) {
      const c = buscar(id);
      const p = procesos.get(c.id);
      if (p) { cerrando.add(c.id); p.cerrar(); }
    },

    async apagar(ms = 3500) {
      const vivos = [...procesos.entries()];
      if (!vivos.length) return;
      await Promise.race([
        Promise.all(vivos.map(([id, p]) => new Promise((ok) => {
          p.on('evento', (e) => { if (e.tipo === 'salida') ok(); });
          cerrando.add(id);
          p.interrumpir();
          p.cerrar();
        }))),
        new Promise((ok) => setTimeout(ok, ms).unref()),
      ]);
    },
  };
}
```

- [ ] **Paso 6: correr los tests nuevos y toda la suite**

Ejecuta: `node --test tests/conversaciones-v2.test.mjs tests/proceso-claude.test.mjs tests/conversaciones.test.mjs` y después `node --test`.
Esperado: todo PASS (el test de rama se salta solo si no hay `git` instalado).

- [ ] **Paso 7: commit**

```bash
git add plugins/orquestador/dashboard/proceso-claude.mjs plugins/orquestador/dashboard/conversaciones.mjs tests/fixtures/claude-falso.mjs tests/fixtures/guiones.mjs tests/proceso-claude.test.mjs tests/conversaciones.test.mjs tests/conversaciones-v2.test.mjs
git commit -m "feat: denegaciones del modo automático, costo acumulado y mensajes encolados en el gestor"
```

---

### Tarea 8: endurecimiento de auth y del servidor, y pasos en `/api/pasos`

**Archivos:**
- Modificar: `plugins/orquestador/dashboard/auth.mjs`
- Modificar: `plugins/orquestador/dashboard/server.mjs`
- Modificar: `plugins/orquestador/dashboard/public/app.js` (función `consultarPasos`)
- Modificar: `tests/helpers/http.mjs` (helper `pedirCrudo`)
- Modificar: `tests/auth.test.mjs`
- Modificar: `tests/dashboard-api.test.mjs` (test `pasos de agente: …`)
- Crear: `tests/servidor-v2.test.mjs`

**Interfaces:**
- Consume: `gestor.on(fn) → () => void` (Tarea 7).
- Produce (`auth.mjs`):
  - `sinPuerto(host) → string`: IPv4, nombres e IPv6 con o sin corchetes.
  - `esTodas(host) → boolean`: reconoce `0.0.0.0`, `::`, `[::]` y `0:0:0:0:0:0:0:0`.
  - `validarRemoto(remoto)`: devuelve la dirección sin corchetes e ignora los hosts vacíos.
  - El objeto de `crearAuth` suma `intentosRegistrados() → number`. `canjear(req, token)` responde `{ status: 405 }` si `req.method` existe y no es GET.
- Produce (`server.mjs`):
  - `GET /api/pasos/:session/:agentId?desde=` reemplaza a `/api/agentes/:session/:agentId/pasos`.
  - 400 ante `%` mal formado y ante un cuerpo JSON que no sea un objeto plano.
  - `HEAD` en los estáticos.
  - `detener()` vacía los clientes y quita el oyente del gestor.
  - `servidor.clientesSse() → number`.
- Produce (`tests/helpers/http.mjs`): `pedirCrudo(base, ruta, { metodo = 'POST', cuerpo = '', headers }) → Promise<{ status, headers, texto }>`.

- [ ] **Paso 1: helper HTTP y tests que fallan**

En `tests/helpers/http.mjs`, agrega:

```js
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
```

Agrega al final de `tests/auth.test.mjs` (y suma `sinPuerto` al import de `auth.mjs`):

```js
test('sinPuerto: IPv4, nombres e IPv6 con y sin corchetes', () => {
  assert.equal(sinPuerto('127.0.0.1:4321'), '127.0.0.1');
  assert.equal(sinPuerto('Mi-PC.ts.net:80'), 'mi-pc.ts.net');
  assert.equal(sinPuerto('[::1]:4321'), '::1');
  assert.equal(sinPuerto('[::1]'), '::1');
  assert.equal(sinPuerto('::1'), '::1');
  assert.equal(sinPuerto('fe80::1'), 'fe80::1');
  assert.equal(sinPuerto(''), '');
});

test('hosts IPv6: [::1] y ::1 son locales; un Host vacío no se acepta', () => {
  const a = crearAuth({ env: env() });
  for (const h of ['[::1]:4321', '[::1]', '::1']) assert.equal(a.hostPermitido(h), true, h);
  assert.equal(a.hostPermitido(''), false);
  assert.equal(a.hostPermitido(undefined), false);
});

test('remoto: TODAS reconoce 0:0:0:0:0:0:0:0 y [::], y hostsPermitidos ignora las entradas vacías', () => {
  for (const escuchar of ['0.0.0.0', '::', '[::]', '0:0:0:0:0:0:0:0']) {
    assert.throws(() => validarRemoto({ activo: true, escuchar, hostsPermitidos: ['', '  '] }), /hostsPermitidos/, escuchar);
  }
  assert.equal(validarRemoto({ activo: true, escuchar: '[::]', hostsPermitidos: ['pc.ts.net'] }), '::');
  const a = crearAuth({ env: env(), remoto: { activo: true, escuchar: '0:0:0:0:0:0:0:0', hostsPermitidos: ['', 'pc.ts.net'] } });
  assert.equal(a.hostPermitido('pc.ts.net:4321'), true);
  assert.equal(a.hostPermitido(':4321'), false);
});

test('el mapa de intentos se poda cuando vence la ventana', () => {
  let t = 0;
  const a = crearAuth({ env: env(), ahora: () => t });
  for (let i = 0; i < 5; i++) a.canjear(req({}, `10.0.0.${i}`), 'malo');
  assert.equal(a.intentosRegistrados(), 5);
  t = 61_000;
  a.canjear(req({}, '10.0.0.9'), a.token);
  assert.equal(a.intentosRegistrados(), 0);
});

test('el canje del token solo se acepta con GET', () => {
  const a = crearAuth({ env: env() });
  assert.equal(a.canjear({ ...req(), method: 'POST' }, a.token).status, 405);
  assert.equal(a.canjear({ ...req(), method: 'GET' }, a.token).status, 302);
});
```

En `tests/dashboard-api.test.mjs`, test `pasos de agente: …`, cambia las tres rutas de pasos:
- `'/api/agentes/s1/a1/pasos'` por `'/api/pasos/s1/a1'`,
- `'/api/agentes/s1/..%2Fx/pasos'` por `'/api/pasos/s1/..%2Fx'`,
- `'/api/agentes/s1/a1/pasos?desde=0'` por `'/api/pasos/s1/a1?desde=0'`.

`tests/servidor-v2.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';
import { crearServidor } from '../plugins/orquestador/dashboard/server.mjs';
import { rutaEventos } from '../plugins/orquestador/scripts/lib/rutas.mjs';
import { pedir, pedirCrudo, login, post } from './helpers/http.mjs';
import { ESPERAR_USUARIO, INIT, texto, fin } from './fixtures/guiones.mjs';

const FALSO = fileURLToPath(new URL('./fixtures/claude-falso.mjs', import.meta.url));

async function levantar({ guion = [ESPERAR_USUARIO, INIT, ...texto('m1', 'Hola'), fin()], gestor } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'orq-srv2-'));
  writeFileSync(join(home, 'config.json'), JSON.stringify({ rutaClaude: 'claude-falso' }));
  writeFileSync(join(home, 'guion.json'), JSON.stringify(guion));
  writeFileSync(join(home, 'events.jsonl'), '');
  const env = { ORQUESTADOR_HOME: home, CLAUDE_CONFIG_DIR: mkdtempSync(join(tmpdir(), 'orq-cfg-')), FALSO_GUION: join(home, 'guion.json'), PATH: process.env.PATH, SystemRoot: process.env.SystemRoot };
  const srv = crearServidor({ env, intervaloMs: 20, gestor, spawnFn: (_b, args, o) => spawn(process.execPath, [FALSO, ...args], o) });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { env, home, srv, base, cookie: await login(base, srv.auth.token) };
}
async function esperarCondicion(fn, ms = 5000) {
  const t0 = Date.now();
  while (!(await fn())) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
}

test('cuerpos y rutas inválidas: JSON mal formado, cuerpo que no es objeto y % mal codificado dan 400', async () => {
  const { srv, base, cookie } = await levantar();
  try {
    const h = { cookie, origin: base, 'content-type': 'application/json' };
    assert.equal((await pedirCrudo(base, '/api/conversaciones', { cuerpo: '{roto', headers: h })).status, 400);
    for (const c of ['[1,2]', '"texto"', '3', 'null']) assert.equal((await pedirCrudo(base, '/api/conversaciones', { cuerpo: c, headers: h })).status, 400, c);
    assert.equal((await pedir(base, '/api/conversaciones/%E0%A4%A/historial', { headers: { cookie } })).status, 400);
    assert.equal((await post(base, '/api/conversaciones/%ZZ/titulo', { titulo: 'x' }, cookie)).status, 400);
  } finally { await srv.detener(); }
});

test('métodos: PUT y DELETE en la API dan 405; HEAD en un estático da cabeceras sin cuerpo', async () => {
  const { srv, base, cookie } = await levantar();
  try {
    assert.equal((await pedir(base, '/api/conversaciones', { metodo: 'PUT', headers: { cookie } })).status, 405);
    assert.equal((await pedir(base, '/api/conversaciones', { metodo: 'DELETE', headers: { cookie } })).status, 405);
    const head = await pedir(base, '/app.js', { metodo: 'HEAD' });
    assert.equal(head.status, 200);
    assert.match(head.headers['content-type'], /javascript/);
    assert.ok(Number(head.headers['content-length']) > 0);
    assert.equal(head.texto, '');
  } finally { await srv.detener(); }
});

test('el canje del token por HTTP solo se acepta con GET', async () => {
  const { srv, base } = await levantar();
  try {
    assert.equal((await pedir(base, `/?t=${srv.auth.token}`, { metodo: 'POST', headers: { origin: base } })).status, 405);
    assert.equal((await pedir(base, `/?t=${srv.auth.token}`)).status, 302);
  } finally { await srv.detener(); }
});

test('titulo, interrumpir, cerrar y carpetas por HTTP', async () => {
  const { srv, base, cookie, home } = await levantar({ guion: [ESPERAR_USUARIO, INIT] }); // el turno queda abierto
  try {
    const conv = (await post(base, '/api/conversaciones', { cwd: home }, cookie)).json();
    const t = await post(base, `/api/conversaciones/${conv.id}/titulo`, { titulo: '  ci: arreglar windows  ' }, cookie);
    assert.deepEqual([t.status, t.json().titulo, t.json().etiqueta], [200, 'ci: arreglar windows', '[CI]']);
    assert.equal((await post(base, `/api/conversaciones/${conv.id}/titulo`, { titulo: '' }, cookie)).status, 400);
    assert.equal((await post(base, `/api/conversaciones/${conv.id}/interrumpir`, {}, cookie)).status, 200); // sin proceso: no hace nada
    assert.equal((await post(base, `/api/conversaciones/${conv.id}/mensajes`, { texto: 'hola' }, cookie)).status, 202);
    assert.equal((await post(base, `/api/conversaciones/${conv.id}/interrumpir`, {}, cookie)).status, 200);
    assert.equal((await post(base, `/api/conversaciones/${conv.id}/cerrar`, {}, cookie)).status, 200);
    await esperarCondicion(async () => (await pedir(base, '/api/conversaciones', { headers: { cookie } })).json()[0].estado === 'inactiva');
    mkdirSync(join(home, 'Proyecto A'));
    const carpetas = (await pedir(base, `/api/carpetas?prefijo=${encodeURIComponent(join(home, 'Proy'))}`, { headers: { cookie } })).json();
    assert.deepEqual(carpetas, [join(home, 'Proyecto A')]);
    assert.equal((await post(base, '/api/conversaciones/nada/cerrar', {}, cookie)).status, 404);
  } finally { await srv.detener(); }
});

test('pasos: la ruta nueva /api/pasos/:session/:agentId; la vieja ya no responde', async () => {
  const { srv, base, cookie, env, home } = await levantar();
  try {
    assert.deepEqual((await pedir(base, '/api/pasos/s1/a1', { headers: { cookie } })).json(), { pasos: [], siguiente: 0, existe: false });
    assert.equal((await pedir(base, '/api/pasos/s1/..%2Fx', { headers: { cookie } })).status, 400);
    const ruta = join(home, 's1', 'subagents', 'agent-a1.jsonl');
    mkdirSync(join(home, 's1', 'subagents'), { recursive: true });
    writeFileSync(ruta, JSON.stringify({ type: 'user', message: { content: 'Haz X' } }) + '\n');
    appendFileSync(rutaEventos(env), JSON.stringify({ session: 's1', tipo: 'agente-inicio', id: 't1', agentId: 'a1', transcript: ruta }) + '\n');
    await new Promise((r) => setTimeout(r, 120));
    assert.deepEqual((await pedir(base, '/api/pasos/s1/a1?desde=0', { headers: { cookie } })).json().pasos.map((p) => p.tipo), ['encargo']);
    assert.notEqual((await pedir(base, '/api/agentes/s1/a1/pasos', { headers: { cookie } })).status, 200);
  } finally { await srv.detener(); }
});

test('detener: vacía los clientes SSE y quita el oyente del gestor', async () => {
  const oyentes = new Set();
  const gestor = { on: (fn) => { oyentes.add(fn); return () => oyentes.delete(fn); }, listar: () => [], hayProcesos: () => false, apagar: async () => {} };
  const { srv, base, cookie } = await levantar({ gestor });
  const sse = request(`${base}/eventos`, { headers: { cookie } });
  sse.on('error', () => {});
  sse.end();
  await esperarCondicion(() => srv.clientesSse() === 1);
  assert.equal(oyentes.size, 1);
  await srv.detener();
  assert.equal(oyentes.size, 0);
  assert.equal(srv.clientesSse(), 0);
});
```

- [ ] **Paso 2: correr los tests y ver que fallan**

Ejecuta: `node --test tests/auth.test.mjs tests/servidor-v2.test.mjs tests/dashboard-api.test.mjs`
Esperado: FAIL (`sinPuerto` no se exporta, `/api/pasos` da 404 y `%` mal formado da 500).

- [ ] **Paso 3: implementar `auth.mjs`**

Reemplaza `dashboard/auth.mjs` completo por:

```js
// Autenticación del dashboard: token por arranque, cookie de sesión, Origin y Host permitidos, modo remoto.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { rutaToken } from '../scripts/lib/rutas.mjs';

const COOKIE = 'orq_sesion';
const VENTANA_MS = 60_000;
const MAX_INTENTOS = 10;
const LOCALES = new Set(['localhost', '127.0.0.1', '::1']);
const TODAS = new Set(['0.0.0.0', '::', '0:0:0:0:0:0:0:0']);

// "[::1]:4321" → "::1"; "::1" (IPv6 sin corchetes no lleva puerto) → "::1"; "Host:80" → "host".
export function sinPuerto(host) {
  const h = String(host ?? '').trim().toLowerCase();
  if (h.startsWith('[')) { const fin = h.indexOf(']'); return fin > 0 ? h.slice(1, fin) : ''; }
  if ((h.match(/:/g) ?? []).length > 1) return h;
  return h.replace(/:\d*$/, '');
}

export const esTodas = (host) => TODAS.has(sinPuerto(host));

export function validarRemoto(remoto = {}) {
  if (!remoto.activo) return '127.0.0.1';
  const escuchar = sinPuerto(remoto.escuchar || '127.0.0.1') || '127.0.0.1';
  const hosts = (remoto.hostsPermitidos ?? []).map(sinPuerto).filter(Boolean);
  if (esTodas(escuchar) && !hosts.length) {
    throw new Error('Modo remoto: escuchar en todas las interfaces exige hostsPermitidos en ~/.claude/orquestador/config.json');
  }
  return escuchar;
}

export function crearAuth({ env = process.env, remoto = {}, ahora = Date.now } = {}) {
  const token = randomBytes(32).toString('hex');
  const ruta = rutaToken(env);
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, token, { mode: 0o600 });
  try { chmodSync(ruta, 0o600); } catch { /* en Windows manda el ACL del perfil */ }

  const sesiones = new Set();
  const intentos = new Map();
  const permitidos = new Set(remoto.activo ? (remoto.hostsPermitidos ?? []).map(sinPuerto).filter(Boolean) : []);
  if (remoto.activo && remoto.escuchar && !esTodas(remoto.escuchar)) permitidos.add(sinPuerto(remoto.escuchar));

  const cookieDe = (req) => {
    for (const parte of String(req.headers.cookie ?? '').split(';')) {
      const [k, ...v] = parte.trim().split('=');
      if (k === COOKIE) return v.join('=');
    }
    return null;
  };
  const igual = (a, b) => {
    const x = Buffer.from(String(a ?? ''));
    const y = Buffer.from(String(b));
    return x.length === y.length && timingSafeEqual(x, y);
  };
  // Las IP sin intentos recientes se borran: el mapa no crece sin límite con escaneos.
  const podar = (t) => {
    for (const [ip, lista] of intentos) {
      const recientes = lista.filter((x) => t - x < VENTANA_MS);
      if (recientes.length) intentos.set(ip, recientes); else intentos.delete(ip);
    }
  };

  return {
    token,
    hostPermitido: (host) => { const h = sinPuerto(host); return !!h && (LOCALES.has(h) || permitidos.has(h)); },
    autenticado: (req) => { const c = cookieDe(req); return !!c && sesiones.has(c); },
    origenValido: (req) => { try { return new URL(req.headers.origin).host === req.headers.host; } catch { return false; } },
    intentosRegistrados: () => intentos.size,
    canjear(req, candidato) {
      if (req.method && req.method !== 'GET') return { status: 405 };
      const ip = req.socket?.remoteAddress ?? '?';
      const t = ahora();
      podar(t);
      const recientes = intentos.get(ip) ?? [];
      if (recientes.length >= MAX_INTENTOS) return { status: 429 };
      if (!igual(candidato, token)) { intentos.set(ip, [...recientes, t]); return { status: 401 }; }
      const s = randomBytes(24).toString('hex');
      sesiones.add(s);
      const seguro = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      return { status: 302, cookie: `${COOKIE}=${s}; HttpOnly; SameSite=Strict; Path=/${seguro}` };
    },
  };
}
```

- [ ] **Paso 4: implementar los cambios de `server.mjs`**

1. Cambia el import de auth por:
   ```js
   import { crearAuth, validarRemoto, esTodas } from './auth.mjs';
   ```
2. Reemplaza `hostsEscucha` por:
   ```js
   export function hostsEscucha(remoto = {}) {
     const principal = validarRemoto(remoto);
     return remoto.activo && !['127.0.0.1', 'localhost'].includes(principal) && !esTodas(principal) ? [principal, '127.0.0.1'] : [principal];
   }
   ```
3. En `leerCuerpo`, reemplaza el manejador `req.on('end', …)` por:
   ```js
       req.on('end', () => {
         if (bytes > MAX_CUERPO) return;
         let v;
         try { v = texto ? JSON.parse(texto) : {}; } catch { mal(new ErrorConversacion(400, 'JSON inválido')); return; }
         if (!v || typeof v !== 'object' || Array.isArray(v)) { mal(new ErrorConversacion(400, 'El cuerpo debe ser un objeto JSON')); return; }
         ok(v);
       });
   ```
4. Reemplaza la línea `conversaciones.on((e) => { … });` por:
   ```js
   const quitarOyente = conversaciones.on((e) => { for (const c of clientes) enviar(c, 'chat', e); });
   ```
5. En `api`, reemplaza la primera línea (`const [, recurso, id, accion, extra] = …`) por:
   ```js
       let partes;
       try { partes = url.pathname.split('/').filter(Boolean).map(decodeURIComponent); } catch { throw new ErrorConversacion(400, 'Ruta mal codificada'); }
       const [, recurso, id, accion, extra] = partes;
   ```
   y reemplaza el bloque `if (recurso === 'agentes' && id && extra === 'pasos') { … }` por:
   ```js
         if (recurso === 'pasos' && id && accion && !extra) {
           if (!/^[A-Za-z0-9_-]+$/.test(accion)) throw new ErrorConversacion(400, 'Identificador de agente inválido');
           const ruta = transcripts.get(`${id}:${accion}`);
           const desde = Number.parseInt(url.searchParams.get('desde') ?? '0', 10) || 0;
           return json(res, ruta ? pasosAgente(ruta, desde) : { pasos: [], siguiente: 0, existe: false });
         }
   ```
6. En `atender`, reemplaza el bloque del canje (`if (url.pathname === '/' && url.searchParams.has('t')) { … }`) por:
   ```js
       if (url.pathname === '/' && url.searchParams.has('t')) {
         const r = auth.canjear(req, url.searchParams.get('t'));
         if (r.status === 302) { res.writeHead(302, { 'set-cookie': r.cookie, location: '/', 'cache-control': 'no-store' }).end(); return; }
         const textos = { 405: 'Método no permitido', 429: 'Demasiados intentos; espera un minuto.' };
         res.writeHead(r.status, { 'content-type': 'text/plain; charset=utf-8' }).end(textos[r.status] ?? 'Token inválido. Abre el dashboard con /orquestador:dashboard.');
         return;
       }
   ```
   y el bloque de estáticos por:
   ```js
       const estatico = req.method === 'GET' || req.method === 'HEAD' ? estaticos[url.pathname] : null;
       if (estatico) {
         let cuerpo;
         try { cuerpo = readFileSync(join(PUBLICO, estatico)); } catch { res.writeHead(500).end('Archivo del dashboard no disponible'); return; }
         res.writeHead(200, { 'content-type': TIPOS[extname(estatico)], 'cache-control': 'no-store', 'content-length': cuerpo.length });
         res.end(req.method === 'HEAD' ? undefined : cuerpo);
         return;
       }
   ```
7. Reemplaza `servidor.detener = async () => { … };` por:
   ```js
     servidor.clientesSse = () => clientes.size;
     servidor.detener = async () => {
       clearInterval(tick);
       clearInterval(latido);
       if (vigilancia) clearInterval(vigilancia);
       if (typeof quitarOyente === 'function') quitarOyente();
       for (const c of clientes) c.end();
       clientes.clear();
       await conversaciones.apagar();
       await Promise.all([servidor, ...extras].map((s) => {
         s.closeAllConnections?.();
         return new Promise((ok) => s.close(() => ok()));
       }));
     };
   ```

En `public/app.js`, dentro de `consultarPasos`, reemplaza la línea del `api('GET', …/pasos?desde=…)` por:

```js
    const r = await api('GET', `/api/pasos/${encodeURIComponent(c.sessionId)}/${encodeURIComponent(n.agentId)}?desde=${desde}`);
```

- [ ] **Paso 5: correr los tests y toda la suite**

Ejecuta: `node --test tests/auth.test.mjs tests/servidor-v2.test.mjs tests/dashboard-api.test.mjs` y después `node --test`.
Esperado: todo PASS. Además `node --check plugins/orquestador/dashboard/public/app.js` sin errores.

- [ ] **Paso 6: commit**

```bash
git add plugins/orquestador/dashboard/auth.mjs plugins/orquestador/dashboard/server.mjs plugins/orquestador/dashboard/public/app.js tests/helpers/http.mjs tests/auth.test.mjs tests/dashboard-api.test.mjs tests/servidor-v2.test.mjs
git commit -m "fix: endurecimiento de auth y del servidor; pasos en /api/pasos"
```

---

### Tarea 9: API nueva (configuración, modo automático y agentes)

**Archivos:**
- Modificar: `plugins/orquestador/dashboard/server.mjs` (imports, firma de `crearServidor`, función `api` completa y manejador de errores)
- Crear: `tests/api-v2.test.mjs`

**Interfaces:**
- Consume:
  - `guardarConfig` y `cargarConfig` (Tarea 1);
  - `crearAutoModo` (Tarea 4);
  - `RAIZ_PLUGIN`, `listarAgentes`, `detalleAgente`, `aplicarPack`, `activarCatalogo` y `desactivarCatalogo` (Tarea 5);
  - `crearPersonalizado`, `editarPersonalizado`, `eliminarPersonalizado` y `redactarPrompt` (Tarea 6);
  - `gestor.denegadosDe` y `gestor.refrescarRama` (Tarea 7);
  - `crearPluginFalso` (Tarea 5).
- Produce:
  - `crearServidor({ env, intervaloMs, inactividadMs, alInactivo, gestor, spawnFn, spawnCli, raizPlugin })`. `spawnCli` se inyecta a los procesos `claude` auxiliares; `raizPlugin` permite un catálogo de prueba.
  - Rutas (todas con cookie; los POST además con `Origin`):

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /api/config` | — | config completa (`cargarConfig`) |
| `POST /api/config` | `{ parcial }` | `{ config, reiniciar }`; 400 `{ error, errores }` |
| `GET /api/automodo` | — | `estado()` de la Tarea 4 |
| `POST /api/automodo` | `{ permitir, detener, entorno, classifyAllShell, defaultModeTerminal }` | `estado()`; 400 `{ error, errores }`; 409 si settings.json es inválido |
| `POST /api/automodo/critica` | `{}` | `{ texto }` |
| `POST /api/automodo/restablecer` | `{ confirmar: true }` | `estado()`; 400 sin confirmación |
| `GET /api/automodo/fabrica` | — | `{ allow, soft_deny, hard_deny }` (etiquetas) |
| `GET /api/agentes?conversacion=` | — | `listarAgentes` |
| `GET /api/agentes/:origen/:id?conversacion=` | — | `detalleAgente` |
| `POST /api/agentes/packs/:pack` | `{ activo }` | `{ pack, resultados }` |
| `POST /api/agentes/catalogo/:id` | `{ activo }` | `{ id, estado }`; 409 colisión |
| `POST /api/agentes/personalizados` | campos + `conversacion?` | detalle, 201 |
| `POST /api/agentes/personalizados/:id` | campos + `conversacion?` | detalle |
| `POST /api/agentes/personalizados/:id/eliminar` | `{ confirmar: true, alcance, conversacion? }` | `{ id, eliminado }` |
| `POST /api/agentes/redactar` | `{ nombre, descripcion, modelo, herramientas }` | `{ rol, metodo, entregable, restricciones, retorno }` |

  - `GET /api/conversaciones/:id/historial` suma `denegados` y refresca la rama en segundo plano.
  - Todo error con `extra` lo agrega al cuerpo JSON: `{ error, ...extra }`.

- [ ] **Paso 1: escribir los tests que fallan**

`tests/api-v2.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { crearServidor } from '../plugins/orquestador/dashboard/server.mjs';
import { pedir, login, post } from './helpers/http.mjs';
import { crearPluginFalso } from './helpers/plugin-falso.mjs';
import { ESPERAR_USUARIO, INIT, texto, fin, denegado } from './fixtures/guiones.mjs';

const FALSO = fileURLToPath(new URL('./fixtures/claude-falso.mjs', import.meta.url));
const FALSO_CLI = fileURLToPath(new URL('./fixtures/claude-falso-cli.mjs', import.meta.url));

async function levantar(guion = [ESPERAR_USUARIO, INIT, ...texto('m1', 'Hola'), fin()]) {
  const home = mkdtempSync(join(tmpdir(), 'orq api2 ñ-'));
  const claude = join(home, 'Claude Config');
  mkdirSync(claude);
  writeFileSync(join(home, 'config.json'), JSON.stringify({ rutaClaude: 'claude-falso' }));
  writeFileSync(join(home, 'events.jsonl'), '');
  writeFileSync(join(home, 'guion.json'), JSON.stringify(guion));
  const env = {
    ORQUESTADOR_HOME: home, CLAUDE_CONFIG_DIR: claude, FALSO_GUION: join(home, 'guion.json'), FALSO_CLI_REGISTRO: join(home, 'cli.jsonl'),
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
  };
  const srv = crearServidor({
    env, intervaloMs: 20, raizPlugin: crearPluginFalso(),
    spawnFn: (_b, args, o) => spawn(process.execPath, [FALSO, ...args], o),
    spawnCli: (_b, args, o) => spawn(process.execPath, [FALSO_CLI, ...args], o),
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { home, claude, srv, base, cookie: await login(base, srv.auth.token) };
}
async function esperarCondicion(fn, ms = 5000) {
  const t0 = Date.now();
  while (!(await fn())) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
}
const campos = (extra = {}) => ({
  nombre: 'Investigador RL', descripcion: 'Diseña experimentos de RL. Úsalo para planificar, no para implementar.', modelo: 'opus', esfuerzo: 'high',
  herramientas: ['Read'], alcance: 'usuario',
  secciones: { rol: 'Investigador escéptico.', metodo: '1. Hipótesis.\n2. Ablations.', entregable: 'Plan.', restricciones: '- No implementa.', retorno: 'Máximo 300 palabras.' },
  ...extra,
});

test('config: GET y POST {parcial}; 400 con errores por campo; reiniciar si cambia el puerto; 401 y 403', async () => {
  const { srv, base, cookie } = await levantar();
  try {
    assert.equal((await pedir(base, '/api/config')).status, 401);
    assert.equal((await pedir(base, '/api/config', { headers: { cookie } })).json().paraleloMax, 4);
    const ok = await post(base, '/api/config', { parcial: { paraleloMax: 5, mostrarCosto: false } }, cookie);
    assert.deepEqual([ok.status, ok.json().config.paraleloMax, ok.json().config.mostrarCosto, ok.json().reiniciar], [200, 5, false, false]);
    const malo = await post(base, '/api/config', { parcial: { rubrica: [{ clase: 'Mecánica', modelo: 'gpt', esfuerzo: 'low' }] } }, cookie);
    assert.equal(malo.status, 400);
    assert.match(malo.json().errores.rubrica, /6 filas/);
    assert.equal((await post(base, '/api/config', {}, cookie)).status, 400);
    assert.equal((await post(base, '/api/config', { parcial: { puertoDashboard: 4999 } }, cookie)).json().reiniciar, true);
    assert.equal((await post(base, '/api/config', { parcial: { paraleloMax: 2 } }, cookie, 'http://evil.example')).status, 403);
  } finally { await srv.detener(); }
});

test('config: dos pestañas guardan a la vez claves distintas y las dos quedan en el archivo', async () => {
  const { srv, base, cookie, home } = await levantar();
  try {
    const [r1, r2] = await Promise.all([
      post(base, '/api/config', { parcial: { mostrarCosto: false } }, cookie),
      post(base, '/api/config', { parcial: { alBloquear: 'denegar' } }, cookie),
    ]);
    assert.deepEqual([r1.status, r2.status], [200, 200]);
    const disco = JSON.parse(readFileSync(join(home, 'config.json'), 'utf8'));
    assert.deepEqual([disco.mostrarCosto, disco.alBloquear, disco.rutaClaude], [false, 'denegar', 'claude-falso']);
  } finally { await srv.detener(); }
});

test('automodo: estado con conteos, guardar con respaldo, fabrica, critica y restablecer con confirmación', async () => {
  const { srv, base, cookie, claude } = await levantar();
  try {
    writeFileSync(join(claude, 'settings.json'), JSON.stringify({ model: 'opus' }));
    const e = (await pedir(base, '/api/automodo', { headers: { cookie } })).json();
    assert.deepEqual([e.disponible, e.conteosFabrica], [true, { allow: 3, soft_deny: 4, hard_deny: 1 }]);
    const g = await post(base, '/api/automodo', {
      permitir: ['Correr uv run en bench/'], detener: [], entorno: { repos: ['github.com/GonzaloFuentes1/*'], dominios: [], organizacion: '' },
      classifyAllShell: false, defaultModeTerminal: true,
    }, cookie);
    assert.equal(g.status, 200);
    assert.deepEqual([g.json().personalizadas.permitir, g.json().defaultModeTerminal], [['Correr uv run en bench/'], true]);
    assert.ok(existsSync(join(claude, 'settings.json.orquestador.bak')));
    const malo = await post(base, '/api/automodo', { permitir: ['$defaults'] }, cookie);
    assert.deepEqual([malo.status, !!malo.json().errores?.permitir], [400, true]);
    assert.equal((await pedir(base, '/api/automodo/fabrica', { headers: { cookie } })).json().soft_deny.length, 4);
    assert.match((await post(base, '/api/automodo/critica', {}, cookie)).json().texto, /Sugerencia/);
    assert.equal((await post(base, '/api/automodo/restablecer', {}, cookie)).status, 400);
    assert.equal(JSON.parse(readFileSync(join(claude, 'settings.json'), 'utf8')).autoMode.allow[1], 'Correr uv run en bench/');
    assert.equal((await post(base, '/api/automodo/restablecer', { confirmar: true }, cookie)).status, 200);
    assert.equal(JSON.parse(readFileSync(join(claude, 'settings.json'), 'utf8')).autoMode, undefined);
  } finally { await srv.detener(); }
});

test('agentes: listar, activar uno y un pack, detalle y personalizados con confirmación al eliminar', async () => {
  const { srv, base, cookie, claude } = await levantar();
  try {
    assert.deepEqual((await pedir(base, '/api/agentes', { headers: { cookie } })).json().packs.map((p) => p.id), ['uno', 'dos']);
    assert.deepEqual((await post(base, '/api/agentes/catalogo/alfa', { activo: true }, cookie)).json(), { id: 'alfa', estado: 'activo' });
    assert.ok(existsSync(join(claude, 'agents', 'alfa.md')));
    assert.deepEqual((await post(base, '/api/agentes/packs/uno', { activo: true }, cookie)).json().resultados.map((x) => x.ok), [true, true]);
    assert.equal((await post(base, '/api/agentes/catalogo/alfa', { activo: 'si' }, cookie)).status, 400);
    assert.equal((await pedir(base, '/api/agentes/catalogo/alfa', { headers: { cookie } })).json().estado, 'activo');
    assert.equal((await pedir(base, '/api/agentes/integrado/Explore', { headers: { cookie } })).json().prompt, null);
    assert.equal((await pedir(base, '/api/agentes/catalogo/..%2F..%2Fx', { headers: { cookie } })).status, 400);
    const creado = await post(base, '/api/agentes/personalizados', campos(), cookie);
    assert.deepEqual([creado.status, creado.json().id], [201, 'investigador-rl']);
    assert.equal((await post(base, '/api/agentes/personalizados', campos(), cookie)).status, 409);
    assert.equal((await post(base, '/api/agentes/personalizados/investigador-rl', campos({ esfuerzo: 'xhigh' }), cookie)).json().effort, 'xhigh');
    assert.equal((await post(base, '/api/agentes/personalizados/investigador-rl/eliminar', {}, cookie)).status, 400);
    assert.ok(existsSync(join(claude, 'agents', 'investigador-rl.md')));
    assert.equal((await post(base, '/api/agentes/personalizados/investigador-rl/eliminar', { confirmar: true }, cookie)).status, 200);
    assert.equal(existsSync(join(claude, 'agents', 'investigador-rl.md')), false);
  } finally { await srv.detener(); }
});

test('agentes del proyecto: usan el cwd de la conversación indicada, nunca una ruta de la petición', async () => {
  const { srv, base, cookie, home } = await levantar();
  try {
    const repo = join(home, 'Mi Repo ñ');
    mkdirSync(repo);
    const conv = (await post(base, '/api/conversaciones', { cwd: repo }, cookie)).json();
    assert.equal((await post(base, '/api/agentes/personalizados', campos({ alcance: 'proyecto' }), cookie)).status, 400);
    assert.equal((await post(base, '/api/agentes/personalizados', campos({ alcance: 'proyecto', conversacion: conv.id, cwd: home }), cookie)).status, 201);
    assert.ok(existsSync(join(repo, '.claude', 'agents', 'investigador-rl.md')));
    assert.deepEqual((await pedir(base, `/api/agentes?conversacion=${conv.id}`, { headers: { cookie } })).json().personalizados.map((a) => a.alcance), ['proyecto']);
    assert.equal((await post(base, '/api/agentes/personalizados', campos({ alcance: 'proyecto', conversacion: 'no-existe' }), cookie)).status, 404);
  } finally { await srv.detener(); }
});

test('redactar: devuelve las cinco secciones del binario falso; datos inválidos dan 400', async () => {
  const { srv, base, cookie } = await levantar();
  try {
    const r = await post(base, '/api/agentes/redactar', { nombre: 'Investigador RL', descripcion: 'Diseña experimentos de RL.', modelo: 'opus', herramientas: ['Read'] }, cookie);
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.json()), ['rol', 'metodo', 'entregable', 'restricciones', 'retorno']);
    assert.equal((await post(base, '/api/agentes/redactar', { nombre: '' }, cookie)).status, 400);
  } finally { await srv.detener(); }
});

test('historial: trae las denegaciones del modo automático', async () => {
  const { srv, base, cookie, home } = await levantar([ESPERAR_USUARIO, INIT, denegado('Bash', 'git push --force', 'Git destructivo'), ...texto('m1', 'Listo'), fin()]);
  try {
    const conv = (await post(base, '/api/conversaciones', { cwd: home }, cookie)).json();
    await post(base, `/api/conversaciones/${conv.id}/mensajes`, { texto: 'empuja' }, cookie);
    await esperarCondicion(async () => (await pedir(base, '/api/conversaciones', { headers: { cookie } })).json()[0].estado === 'lista');
    const h = (await pedir(base, `/api/conversaciones/${conv.id}/historial`, { headers: { cookie } })).json();
    assert.deepEqual(h.denegados.map((d) => [d.herramienta, d.motivo]), [['Bash', 'Git destructivo']]);
  } finally { await srv.detener(); }
});
```

- [ ] **Paso 2: correr los tests y ver que fallan**

Ejecuta: `node --test tests/api-v2.test.mjs`
Esperado: FAIL (`/api/config` responde 404).

- [ ] **Paso 3: implementar en `server.mjs`**

1. Reemplaza el import de config por:
   ```js
   import { cargarConfig, guardarConfig } from '../scripts/lib/config.mjs';
   ```
   y agrega:
   ```js
   import { crearAutoModo } from './automodo.mjs';
   import {
     RAIZ_PLUGIN, listarAgentes, detalleAgente, aplicarPack, activarCatalogo, desactivarCatalogo,
     crearPersonalizado, editarPersonalizado, eliminarPersonalizado, redactarPrompt,
   } from './agentes.mjs';
   ```
2. Cambia la firma de `crearServidor` por:
   ```js
   export function crearServidor({ env = process.env, intervaloMs = 400, inactividadMs = null, alInactivo = () => {}, gestor = null, spawnFn, spawnCli, raizPlugin = RAIZ_PLUGIN } = {}) {
   ```
   y agrega, después de `const conversaciones = …`:
   ```js
   const automodo = crearAutoModo({ env, spawnFn: spawnCli });
   ```
3. Reemplaza la función `api` completa por:

```js
  async function api(req, res, url) {
    let partes;
    try { partes = url.pathname.split('/').filter(Boolean).map(decodeURIComponent); } catch { throw new ErrorConversacion(400, 'Ruta mal codificada'); }
    const [, recurso, a, b, c] = partes;
    const q = url.searchParams;
    // Los agentes del proyecto usan el cwd de una conversación existente: la ruta nunca viene de la petición.
    const opcionesAgentes = (idConv) => ({ env, raizPlugin, cwdProyecto: idConv ? conversaciones.obtener(String(idConv)).cwd : null });

    if (req.method === 'GET') {
      if (recurso === 'conversaciones' && !a) return json(res, conversaciones.listar());
      if (recurso === 'conversaciones' && b === 'historial' && !c) {
        const conv = conversaciones.obtener(a);
        conversaciones.refrescarRama?.(a); // la rama nueva llega por chat:estado
        const h = historialDe(conv.sessionId, env);
        return json(res, { conversacion: conv, mensajes: h.mensajes, aviso: h.aviso, permisos: conversaciones.pendientesDe(a), denegados: conversaciones.denegadosDe?.(a) ?? [] });
      }
      if (recurso === 'pasos' && a && b && !c) {
        if (!/^[A-Za-z0-9_-]+$/.test(b)) throw new ErrorConversacion(400, 'Identificador de agente inválido');
        const ruta = transcripts.get(`${a}:${b}`);
        const desde = Number.parseInt(q.get('desde') ?? '0', 10) || 0;
        return json(res, ruta ? pasosAgente(ruta, desde) : { pasos: [], siguiente: 0, existe: false });
      }
      if (recurso === 'carpetas' && !a) return json(res, carpetasCon(q.get('prefijo')));
      if (recurso === 'config' && !a) return json(res, cargarConfig(env));
      if (recurso === 'automodo' && !a) return json(res, await automodo.estado());
      if (recurso === 'automodo' && a === 'fabrica' && !b) return json(res, await automodo.fabrica());
      if (recurso === 'agentes' && !a) return json(res, listarAgentes(opcionesAgentes(q.get('conversacion'))));
      if (recurso === 'agentes' && a && b && !c) return json(res, detalleAgente(a, b, opcionesAgentes(q.get('conversacion'))));
      throw new ErrorConversacion(404, 'No encontrado');
    }
    if (req.method !== 'POST') throw new ErrorConversacion(405, 'Método no permitido');
    if (!auth.origenValido(req)) throw new ErrorConversacion(403, 'Origen no permitido');
    const cuerpo = await leerCuerpo(req);

    if (recurso === 'conversaciones' && !a) return json(res, conversaciones.crear(cuerpo), 201);
    if (recurso === 'conversaciones') {
      switch (b) {
        case 'mensajes': conversaciones.enviar(a, cuerpo.texto); return json(res, { ok: true }, 202);
        case 'permisos': conversaciones.responderPermiso(a, c, cuerpo.decision); return json(res, { ok: true });
        case 'modo': return json(res, conversaciones.cambiarModo(a, cuerpo.modo));
        case 'titulo': return json(res, conversaciones.renombrar(a, cuerpo.titulo));
        case 'interrumpir': conversaciones.interrumpir(a); return json(res, { ok: true });
        case 'cerrar': conversaciones.cerrar(a); return json(res, { ok: true });
        default:
      }
    }
    if (recurso === 'config' && !a) {
      const r = guardarConfig(cuerpo.parcial, env);
      if (!r.ok) throw new ErrorConversacion(400, 'Hay campos inválidos', { errores: r.errores });
      // El puerto y el modo remoto se leen al arrancar: cambiarlos exige reiniciar el dashboard.
      const reiniciar = r.config.puertoDashboard !== config.puertoDashboard || JSON.stringify(r.config.remoto) !== JSON.stringify(config.remoto);
      return json(res, { config: r.config, reiniciar });
    }
    if (recurso === 'automodo') {
      if (!a) return json(res, await automodo.guardar(cuerpo));
      if (a === 'critica' && !b) return json(res, await automodo.critica());
      if (a === 'restablecer' && !b) return json(res, await automodo.restablecer(cuerpo));
    }
    if (recurso === 'agentes') {
      const o = () => opcionesAgentes(cuerpo.conversacion);
      if (a === 'packs' && b && !c) return json(res, aplicarPack(b, cuerpo.activo, o()));
      if (a === 'catalogo' && b && !c) {
        if (typeof cuerpo.activo !== 'boolean') throw new ErrorConversacion(400, 'activo debe ser verdadero o falso');
        return json(res, cuerpo.activo ? activarCatalogo(b, o()) : desactivarCatalogo(b, o()));
      }
      if (a === 'personalizados' && !b) return json(res, crearPersonalizado(cuerpo, o()), 201);
      if (a === 'personalizados' && b && !c) return json(res, editarPersonalizado(b, cuerpo, o()));
      if (a === 'personalizados' && b && c === 'eliminar') return json(res, eliminarPersonalizado(b, cuerpo, o()));
      if (a === 'redactar' && !b) return json(res, await redactarPrompt(cuerpo, { env, spawnFn: spawnCli }));
    }
    throw new ErrorConversacion(404, 'No encontrado');
  }
```

4. En `manejador`, reemplaza:
   ```js
      if (e instanceof ErrorConversacion) json(res, { error: e.message }, e.status);
   ```
   por:
   ```js
      if (e instanceof ErrorConversacion) json(res, { error: e.message, ...(e.extra ?? {}) }, e.status);
   ```

- [ ] **Paso 4: correr los tests nuevos y toda la suite**

Ejecuta: `node --test tests/api-v2.test.mjs` y después `node --test`.
Esperado: todo PASS.

- [ ] **Paso 5: commit**

```bash
git add plugins/orquestador/dashboard/server.mjs tests/api-v2.test.mjs
git commit -m "feat: API de configuración, modo automático y agentes"
```

---

### Tarea 10: módulos puros del frontend

**Archivos:**
- Crear: `plugins/orquestador/dashboard/public/config-vista.js`
- Crear: `plugins/orquestador/dashboard/public/agentes-vista.js`
- Modificar: `plugins/orquestador/dashboard/public/chat-vista.js`
- Modificar: `plugins/orquestador/dashboard/public/chat.js` (`resumenEntrada` y `modeloDenegacion` nuevo)
- Modificar: `plugins/orquestador/dashboard/public/plan-vista.js` (`barreraHumana` nuevo)
- Modificar: `plugins/orquestador/dashboard/public/estado-vista.js` (helpers nuevos al final)
- Modificar: `plugins/orquestador/dashboard/public/agentes-panel.js` (`verificacion`)
- Crear: `tests/ui-v2-puro.test.mjs`

**Interfaces:**
- Produce (`config-vista.js`):
  - Constantes `CLASES_RUBRICA`, `EJEMPLOS_RUBRICA`, `MODELOS`, `ESFUERZOS`, `LIMITES`, `CLAVES_CONFIG` (igual a `CLAVES_EDITABLES` del backend).
  - `obtener(obj, ruta)` y `fijar(obj, ruta, valor) → copia`.
  - `formularioDesde(datos, claves?) → { original, actual, errores }`.
  - `reducirFormulario(f, accion) → f`, con estas acciones:
    - `{tipo:'fijar', ruta, valor}`
    - `{tipo:'sumar', ruta, delta}` (respeta `LIMITES`)
    - `{tipo:'alternar', ruta, valor, minimo?, orden?}`
    - `{tipo:'agregar', ruta, valor}` y `{tipo:'quitar', ruta, valor}`
    - `{tipo:'descartar'}`, `{tipo:'guardado', datos}` y `{tipo:'errores', errores}`
  - `hayCambios(f) → boolean` y `parcialAGuardar(f) → { solo las claves cambiadas }`.
  - `autoModoDesde(estadoGet) → { permitir, detener, entorno: { repos, dominios, organizacion }, classifyAllShell, defaultModeTerminal }`.
  - `costoVisible(mostrarCosto, atajoSesion: 'mostrar'|'ocultar'|null) → boolean`.
- Produce (`agentes-vista.js`):
  - Constantes `TEXTO_ESTADO`, `HERRAMIENTAS_FORM`, `MODELOS_AGENTE`, `ESFUERZOS_AGENTE` y `SECCIONES_FORM`.
  - `normalizar(t)`, `slugAgente(nombre)` (igual al del servidor) y `filtrarAgentes(datos, texto)`.
  - `estadoPack(pack) → 'true'|'mixed'|'false'`.
  - `formularioVacio()` y `desdeDetalle(det, { duplicar })`.
  - `herramientaMarcada(form, etiqueta)` y `alternarHerramienta(form, etiqueta)`.
  - `cuerpoFormulario(form, conversacionId)` y `rutaArchivo(form)`.
- Produce (`chat-vista.js`): `reducirChat` atiende `chat:denegado` (mensaje con `rol:'denegado'`); `desdeHistorial({ …, denegados })`.
- Produce (`chat.js`): `resumenEntrada(nombre, null)` ya no falla; `modeloDenegacion(bloque, alBloquear) → { titulo, motivo, resumen, accion: { texto, mensaje } | null }`.
- Produce (`plan-vista.js`): `barreraHumana(chat, nodos) → { etapa, titulo, criterio } | null`.
- Produce (`estado-vista.js`): `claseNodo(n)`, `TEXTO_NODO`, `etiquetaEvento(t) → { texto, clase }`, `numeracion(sesion) → { id: '#n'|'' }` y `pedidoVsReal(sesion) → [{ agente, cantidad, pedido, real, ok }]`.
- Comportamiento (`agentes-panel.js`): `verificacion` muestra el modelo real crudo si su familia es desconocida.

- [ ] **Paso 1: escribir los tests que fallan**

`tests/ui-v2-puro.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLASES_RUBRICA as CLASES_FRONT, CLAVES_CONFIG, formularioDesde, reducirFormulario, hayCambios, parcialAGuardar, autoModoDesde, costoVisible, fijar, obtener,
} from '../plugins/orquestador/dashboard/public/config-vista.js';
import { CLASES_RUBRICA, CLAVES_EDITABLES, CONFIG_DEFECTO, normalizarRubrica } from '../plugins/orquestador/scripts/lib/config.mjs';
import {
  filtrarAgentes, estadoPack, slugAgente as slugFront, formularioVacio, desdeDetalle, alternarHerramienta, herramientaMarcada, cuerpoFormulario, rutaArchivo,
} from '../plugins/orquestador/dashboard/public/agentes-vista.js';
import { slugAgente } from '../plugins/orquestador/dashboard/agentes.mjs';
import { chatVacio, desdeHistorial, reducirChat } from '../plugins/orquestador/dashboard/public/chat-vista.js';
import { modeloDenegacion, resumenEntrada } from '../plugins/orquestador/dashboard/public/chat.js';
import { barreraHumana } from '../plugins/orquestador/dashboard/public/plan-vista.js';
import { vistaVacia, reducir, etiquetaEvento, numeracion, pedidoVsReal, claseNodo } from '../plugins/orquestador/dashboard/public/estado-vista.js';
import { verificacion } from '../plugins/orquestador/dashboard/public/agentes-panel.js';

const configBase = () => ({ ...structuredClone({ ...CONFIG_DEFECTO, rubrica: normalizarRubrica(null) }), miClave: 1 });
const ORDEN = ['haiku', 'sonnet', 'opus', 'fable'];

test('config-vista: clases y claves iguales a las del backend', () => {
  assert.deepEqual(CLASES_FRONT, [...CLASES_RUBRICA]);
  assert.deepEqual([...CLAVES_CONFIG].sort(), [...CLAVES_EDITABLES].sort());
});

test('formulario: fijar, sumar con límites, alternar sin vaciar, agregar, quitar y descartar', () => {
  let f = formularioDesde(configBase(), CLAVES_CONFIG);
  assert.equal('miClave' in f.actual, false);
  assert.equal(hayCambios(f), false);
  f = reducirFormulario(f, { tipo: 'sumar', ruta: ['paraleloMax'], delta: 10 });
  assert.equal(f.actual.paraleloMax, 8);
  f = reducirFormulario(f, { tipo: 'sumar', ruta: ['fableMaxPorSesion'], delta: -5 });
  assert.equal(f.actual.fableMaxPorSesion, 0);
  f = reducirFormulario(f, { tipo: 'alternar', ruta: ['modelosOrquestador'], valor: 'opus', minimo: 1, orden: ORDEN });
  assert.deepEqual(f.actual.modelosOrquestador, ['fable']);
  assert.deepEqual(reducirFormulario(f, { tipo: 'alternar', ruta: ['modelosOrquestador'], valor: 'fable', minimo: 1 }).actual.modelosOrquestador, ['fable']);
  f = reducirFormulario(f, { tipo: 'alternar', ruta: ['modelosOrquestador'], valor: 'haiku', minimo: 1, orden: ORDEN });
  assert.deepEqual(f.actual.modelosOrquestador, ['haiku', 'fable']);
  f = reducirFormulario(f, { tipo: 'fijar', ruta: ['rubrica', 2, 'modelo'], valor: 'opus' });
  assert.deepEqual([f.actual.rubrica[2].modelo, f.original.rubrica[2].modelo], ['opus', 'sonnet']);
  f = reducirFormulario(f, { tipo: 'agregar', ruta: ['ramasProtegidas'], valor: '  develop ' });
  f = reducirFormulario(f, { tipo: 'agregar', ruta: ['ramasProtegidas'], valor: 'develop' });
  assert.deepEqual(f.actual.ramasProtegidas, ['main', 'master', 'develop']);
  f = reducirFormulario(f, { tipo: 'quitar', ruta: ['ramasProtegidas'], valor: 'master' });
  assert.deepEqual(f.actual.ramasProtegidas, ['main', 'develop']);
  assert.equal(hayCambios(f), true);
  assert.equal(hayCambios(reducirFormulario(f, { tipo: 'descartar' })), false);
});

test('parcialAGuardar: solo las claves modificadas, así dos pestañas no se pisan', () => {
  let a = formularioDesde(configBase(), CLAVES_CONFIG);
  let b = formularioDesde(configBase(), CLAVES_CONFIG);
  a = reducirFormulario(a, { tipo: 'fijar', ruta: ['mostrarCosto'], valor: false });
  b = reducirFormulario(b, { tipo: 'fijar', ruta: ['rubrica', 0, 'esfuerzo'], valor: 'medium' });
  assert.deepEqual(parcialAGuardar(a), { mostrarCosto: false });
  assert.deepEqual(Object.keys(parcialAGuardar(b)), ['rubrica']);
  assert.equal(parcialAGuardar(b).rubrica.length, 6);
});

test('formulario: los errores del servidor se limpian al editar el campo; "guardado" fija el nuevo original', () => {
  let f = formularioDesde(configBase(), CLAVES_CONFIG);
  f = reducirFormulario(f, { tipo: 'errores', errores: { paraleloMax: 'Debe ser…', rubrica: 'x' } });
  f = reducirFormulario(f, { tipo: 'fijar', ruta: ['paraleloMax'], valor: 3 });
  assert.deepEqual(Object.keys(f.errores), ['rubrica']);
  f = reducirFormulario(f, { tipo: 'guardado', datos: { ...configBase(), paraleloMax: 3, alBloquear: 'denegar' } });
  assert.equal(hayCambios(f), false);
  assert.equal(f.actual.alBloquear, 'denegar');
  assert.deepEqual(f.errores, {});
});

test('autoModoDesde, costoVisible, fijar y obtener', () => {
  assert.deepEqual(autoModoDesde({ personalizadas: { permitir: ['a'], detener: [], entorno: { repos: ['r'], dominios: [], organizacion: 'O' }, otrasEntorno: ['x'] }, classifyAllShell: true, defaultModeTerminal: false }),
    { permitir: ['a'], detener: [], entorno: { repos: ['r'], dominios: [], organizacion: 'O' }, classifyAllShell: true, defaultModeTerminal: false });
  assert.deepEqual(autoModoDesde(null).entorno, { repos: [], dominios: [], organizacion: '' });
  assert.deepEqual([costoVisible(true, null), costoVisible(false, null), costoVisible(false, 'mostrar'), costoVisible(true, 'ocultar'), costoVisible(undefined, null)],
    [true, false, true, false, true]);
  assert.deepEqual(fijar({ a: [{ b: 1 }] }, ['a', 0, 'b'], 2), { a: [{ b: 2 }] });
  assert.equal(obtener({ a: { b: 3 } }, ['a', 'b']), 3);
});

const datosAgentes = {
  packs: [{ id: 'datos', nombre: 'Datos', descripcion: '', activos: 1, total: 2, agentes: [
    { id: 'analista-sql', nombre: 'Analista SQL', description: 'Consultas de solo lectura' },
    { id: 'estadistico', nombre: 'Estadístico', description: 'Pruebas formales' },
  ] }],
  plugin: [{ id: 'guardian-git', nombre: 'Guardian Git', description: 'Git' }], integrados: [], personalizados: [],
};

test('agentes-vista: filtro sin tildes ni mayúsculas, packs vacíos fuera y contadores intactos', () => {
  const r = filtrarAgentes(datosAgentes, 'ESTADISTICO');
  assert.deepEqual(r.packs.map((p) => [p.id, p.agentes.map((a) => a.id), p.activos, p.total]), [['datos', ['estadistico'], 1, 2]]);
  assert.deepEqual(filtrarAgentes(datosAgentes, 'nada').packs, []);
  assert.equal(filtrarAgentes(datosAgentes, '').packs[0].agentes.length, 2);
  assert.deepEqual(filtrarAgentes(datosAgentes, 'git').plugin.map((a) => a.id), ['guardian-git']);
  assert.deepEqual([estadoPack({ activos: 0, total: 3 }), estadoPack({ activos: 2, total: 3 }), estadoPack({ activos: 3, total: 3 })], ['false', 'mixed', 'true']);
});

test('agentes-vista: slug igual al del servidor, herramientas agrupadas y cuerpo del formulario', () => {
  for (const n of ['Investigador RL', '  Diseñador Ñandú / UX ', 'x'.repeat(60)]) assert.equal(slugFront(n), slugAgente(n));
  let f = formularioVacio();
  assert.equal(herramientaMarcada(f, 'Grep y Glob'), true);
  f = alternarHerramienta(f, 'Grep y Glob');
  assert.deepEqual(f.herramientas, ['Read']);
  f = alternarHerramienta(f, 'Web');
  assert.deepEqual(f.herramientas, ['Read', 'WebSearch', 'WebFetch']);
  f = { ...f, nombre: ' Investigador RL ', alcance: 'proyecto' };
  assert.equal(rutaArchivo(f), '.claude/agents/investigador-rl.md');
  const c = cuerpoFormulario(f, 'conv-1');
  assert.deepEqual([c.nombre, c.alcance, c.conversacion], ['Investigador RL', 'proyecto', 'conv-1']);
  assert.equal('conversacion' in cuerpoFormulario({ ...f, alcance: 'usuario' }, 'conv-1'), false);
});

test('agentes-vista: duplicar y editar desde el detalle', () => {
  const det = { id: 'analista-sql', origen: 'catalogo', nombre: 'Analista SQL', description: 'Escribe consultas.', model: 'sonnet', effort: 'medium', tools: 'Read, Bash',
    secciones: { rol: 'R', metodo: '1. M', entregable: 'E', restricciones: '- X', retorno: 'F' } };
  const d = desdeDetalle(det, { duplicar: true });
  assert.deepEqual([d.nombre, d.editando, d.herramientas, d.secciones.rol], ['Analista SQL (copia)', null, ['Read', 'Bash'], 'R']);
  const e = desdeDetalle({ ...det, origen: 'usuario', alcance: 'usuario' });
  assert.deepEqual([e.nombre, e.editando, e.alcance], ['Analista SQL', 'analista-sql', 'usuario']);
  assert.deepEqual(desdeDetalle({ ...det, tools: 'Todas las herramientas', model: 'raro' }).herramientas, formularioVacio().herramientas);
  assert.equal(desdeDetalle({ ...det, model: 'raro' }).modelo, 'sonnet');
});

test('chat: chat:denegado agrega una tarjeta una sola vez y el historial trae las denegaciones', () => {
  const c = chatVacio();
  const e = { tipo: 'chat:denegado', id: 'd1', herramienta: 'Bash', entrada: { command: 'git push --force' }, motivo: 'Git destructivo' };
  reducirChat(c, e);
  reducirChat(c, e);
  assert.deepEqual(c.mensajes.map((m) => m.rol), ['denegado']);
  assert.equal(c.mensajes[0].bloques[0].motivo, 'Git destructivo');
  const h = desdeHistorial({ conversacion: { estado: 'lista' }, mensajes: [], denegados: [{ id: 'd1', herramienta: 'Bash', entrada: {}, motivo: null }] });
  assert.deepEqual(h.mensajes.map((m) => [m.rol, m.id]), [['denegado', 'd1']]);
});

test('modeloDenegacion: con "preguntar" ofrece reintentar con el mensaje exacto; con "denegar" solo informa', () => {
  const b = { herramienta: 'Bash', entrada: { command: 'git push --force' }, motivo: 'Git destructivo' };
  const m = modeloDenegacion(b, 'preguntar');
  assert.deepEqual([m.titulo, m.motivo, m.resumen], ['El modo automático detuvo Bash', 'Git destructivo', 'git push --force']);
  assert.deepEqual(m.accion, { texto: 'Autorizar y reintentar', mensaje: 'Autorizo explícitamente esta acción: Bash git push --force. Hazla.' });
  assert.equal(modeloDenegacion(b, 'denegar').accion, null);
  assert.equal(modeloDenegacion({ herramienta: 'Bash', entrada: null }, 'preguntar').motivo, 'El clasificador la consideró riesgosa.');
  assert.equal(resumenEntrada('Bash', null), '{}');
  assert.equal(resumenEntrada('Read', undefined), '{}');
});

const PLAN_B = { titulo: 'P', etapas: [
  { id: 'E1', titulo: 'Construir', meta: 'm', agentes: [{ tipo: 'implementador', modelo: 'sonnet' }], barrera: { tipo: 'humana', criterio: 'Revisa el diff antes de publicar' } },
  { id: 'E2', titulo: 'Publicar', meta: 'm', agentes: [{ tipo: 'guardian-git', modelo: 'haiku' }] },
] };
const msg = (rol, texto, id) => ({ rol, id, bloques: [{ tipo: 'texto', texto }] });
const chatCon = (...mensajes) => ({ ...chatVacio(), estado: 'lista', mensajes });
const conPlan = `Propongo:\n\`\`\`orquestador-plan\n${JSON.stringify(PLAN_B)}\n\`\`\``;

test('barreraHumana: tras aprobar el plan, con la etapa de barrera hecha o en curso, la siguiente en cola y el turno terminado en "?"', () => {
  const hecha = [{ meta: 'E1 · Construir', estado: 'terminado' }];
  const chat = chatCon(msg('asistente', conPlan, 'a1'), msg('usuario', 'Apruebo el plan.', 'u1'), msg('asistente', 'Terminé E1. ¿Sigo con la publicación?', 'a2'));
  assert.deepEqual(barreraHumana(chat, hecha), { etapa: 'E1', titulo: 'Construir', criterio: 'Revisa el diff antes de publicar' });
  assert.equal(barreraHumana(chat, [{ meta: 'E1 · Construir', estado: 'activo' }])?.etapa, 'E1');
  assert.equal(barreraHumana({ ...chat, estado: 'trabajando' }, hecha), null);
  assert.equal(barreraHumana(chatCon(msg('asistente', conPlan, 'a1'), msg('asistente', '¿Sigo?', 'a2')), hecha), null);
  assert.equal(barreraHumana(chatCon(...chat.mensajes.slice(0, 2), msg('asistente', 'Terminé E1.', 'a2')), hecha), null);
  assert.equal(barreraHumana(chat, [...hecha, { meta: 'E2 · Publicar', estado: 'activo' }]), null);
  assert.equal(barreraHumana(chat, []), null);
});

test('estado-vista: claseNodo, etiquetas de eventos, numeración de repetidos y pedido vs. real', () => {
  const v = vistaVacia();
  const ts = (s) => `2026-10-13T10:00:0${s}Z`;
  reducir(v, { session: 's', tipo: 'delegacion', id: 'a', agente: 'orquestador:implementador', modelo: 'sonnet', esfuerzo: 'medium', ts: ts(1) });
  reducir(v, { session: 's', tipo: 'delegacion', id: 'b', agente: 'orquestador:implementador', modelo: 'sonnet', esfuerzo: 'medium', ts: ts(2) });
  reducir(v, { session: 's', tipo: 'delegacion', id: 'c', agente: 'Explore', modelo: 'haiku', ts: ts(3) });
  reducir(v, { session: 's', tipo: 'fin', id: 'a', modeloReal: 'claude-sonnet-5-5', ts: ts(4) });
  reducir(v, { session: 's', tipo: 'fin', id: 'b', modeloReal: 'claude-opus-5-5', ts: ts(5) });
  reducir(v, { session: 's', tipo: 'fin', id: 'c', modeloReal: 'modelo-raro', ok: false, ts: ts(6) });
  const s = v.sesiones.s;
  assert.deepEqual(numeracion(s), { a: '#1', b: '#2', c: '' });
  assert.deepEqual(['a', 'c'].map((id) => claseNodo(s.nodos[id])), ['listo', 'error']);
  assert.deepEqual([claseNodo({ estado: 'activo' }), claseNodo({ estado: 'sin-cierre' })], ['trabajando', 'cola']);
  assert.deepEqual(pedidoVsReal(s), [
    { agente: 'implementador', cantidad: 1, pedido: 'sonnet', real: 'sonnet', ok: true },
    { agente: 'implementador', cantidad: 1, pedido: 'sonnet', real: 'opus', ok: false },
    { agente: 'Explore', cantidad: 1, pedido: 'haiku', real: 'modelo-raro', ok: false },
  ]);
  assert.deepEqual(s.timeline.map((t) => etiquetaEvento(t).texto), ['Falló', 'Fin', 'Fin', 'Delegación', 'Delegación', 'Delegación']);
  assert.deepEqual(etiquetaEvento({ tipo: 'bloqueo' }), { texto: 'Bloqueo', clase: 'e-error' });
});

test('verificacion: un modelo real de familia desconocida se muestra tal cual', () => {
  assert.deepEqual(verificacion({ modelo: 'opus', resultado: { modeloReal: 'modelo-raro-1' } }), { texto: '⚠ modelo-raro-1', clase: 'e-error' });
});
```

- [ ] **Paso 2: correr los tests y ver que fallan**

Ejecuta: `node --test tests/ui-v2-puro.test.mjs`
Esperado: FAIL con `Cannot find module …/public/config-vista.js`.

- [ ] **Paso 3: crear `config-vista.js`**

```js
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
```

- [ ] **Paso 4: crear `agentes-vista.js`**

```js
// Estado puro de la pestaña Agentes: filtro del catálogo, estados de pack y formulario de agentes personalizados.
export const TEXTO_ESTADO = { activo: 'Activo', inactivo: 'Inactivo', actualizable: 'Actualización disponible', conflicto: 'Ya tienes uno propio' };
export const HERRAMIENTAS_FORM = [['Read', ['Read']], ['Grep y Glob', ['Grep', 'Glob']], ['Edit y Write', ['Edit', 'Write']], ['Bash', ['Bash']], ['Web', ['WebSearch', 'WebFetch']]];
export const MODELOS_AGENTE = [['haiku', 'Haiku'], ['sonnet', 'Sonnet'], ['opus', 'Opus'], ['fable', 'Fable'], ['inherit', 'Heredar']];
export const ESFUERZOS_AGENTE = ['low', 'medium', 'high', 'xhigh', 'max'];
export const SECCIONES_FORM = [
  ['rol', 'Rol', 'Quién es y con qué actitud trabaja', 2],
  ['metodo', 'Método', 'Los pasos que sigue, numerados', 4],
  ['entregable', 'Entregable', 'Qué produce exactamente', 2],
  ['restricciones', 'Restricciones', 'Lo que no debe hacer nunca', 2],
  ['retorno', 'Formato de Retorno', 'Cómo responde al orquestador (corto y fijo)', 2],
];
const TODAS = HERRAMIENTAS_FORM.flatMap(([, h]) => h);

export const normalizar = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Debe dar exactamente lo mismo que slugAgente de dashboard/agentes.mjs (lo comprueba un test).
export function slugAgente(nombre) {
  return normalizar(nombre).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
}

const coincide = (a, q) => !q || [a.id, a.nombre, a.description].some((x) => normalizar(x).includes(q));

export function filtrarAgentes(datos, texto) {
  const q = normalizar(texto).trim();
  const filtrar = (lista) => (lista ?? []).filter((a) => coincide(a, q));
  return {
    ...datos,
    packs: (datos?.packs ?? []).map((p) => ({ ...p, agentes: filtrar(p.agentes) })).filter((p) => !q || p.agentes.length),
    plugin: filtrar(datos?.plugin),
    integrados: filtrar(datos?.integrados),
    personalizados: filtrar(datos?.personalizados),
  };
}

export const estadoPack = (p) => (!p.activos ? 'false' : p.activos >= p.total ? 'true' : 'mixed');

export function formularioVacio() {
  return {
    nombre: '', descripcion: '', modelo: 'sonnet', esfuerzo: 'medium', herramientas: ['Read', 'Grep', 'Glob'], alcance: 'usuario',
    secciones: { rol: '', metodo: '', entregable: '', restricciones: '', retorno: '' }, editando: null, errores: {},
  };
}

export function desdeDetalle(det, { duplicar = false } = {}) {
  const base = formularioVacio();
  const herramientas = String(det?.tools ?? '').split(',').map((t) => t.trim()).filter((t) => TODAS.includes(t));
  return {
    ...base,
    nombre: duplicar ? `${det.nombre} (copia)` : det.nombre,
    descripcion: det.description ?? '',
    modelo: MODELOS_AGENTE.some(([m]) => m === det.model) ? det.model : base.modelo,
    esfuerzo: ESFUERZOS_AGENTE.includes(det.effort) ? det.effort : base.esfuerzo,
    herramientas: herramientas.length ? herramientas : base.herramientas,
    alcance: det.alcance ?? 'usuario',
    secciones: { ...base.secciones, ...(det.secciones ?? {}) },
    editando: duplicar ? null : det.id,
  };
}

const grupo = (etiqueta) => HERRAMIENTAS_FORM.find(([e]) => e === etiqueta)?.[1] ?? [];
export const herramientaMarcada = (form, etiqueta) => grupo(etiqueta).every((h) => form.herramientas.includes(h));

export function alternarHerramienta(form, etiqueta) {
  const g = grupo(etiqueta);
  const resto = form.herramientas.filter((h) => !g.includes(h));
  return { ...form, herramientas: herramientaMarcada(form, etiqueta) ? resto : [...resto, ...g] };
}

export function cuerpoFormulario(form, conversacion = null) {
  return {
    nombre: form.nombre.trim(), descripcion: form.descripcion.trim(), modelo: form.modelo, esfuerzo: form.esfuerzo,
    herramientas: [...form.herramientas], alcance: form.alcance, secciones: { ...form.secciones },
    ...(form.alcance === 'proyecto' && conversacion ? { conversacion } : {}),
  };
}

export const rutaArchivo = (form) => `${form.alcance === 'proyecto' ? '.claude/agents/' : '~/.claude/agents/'}${(form.editando ?? slugAgente(form.nombre)) || '<nombre>'}.md`;
```

- [ ] **Paso 5: cambios en `chat-vista.js`, `chat.js`, `plan-vista.js`, `estado-vista.js` y `agentes-panel.js`**

En `chat-vista.js`:
1. Reemplaza `desdeHistorial` por:
   ```js
   export function desdeHistorial({ conversacion, mensajes = [], permisos = [], denegados = [] } = {}) {
     const chat = {
       mensajes: mensajes.map((m) => ({ ...m, bloques: m.bloques.map((b) => ({ ...b })) })),
       parcial: '', permisos: [...permisos], estado: conversacion?.estado ?? 'inactiva', error: conversacion?.error ?? null,
     };
     for (const d of denegados) reducirChat(chat, { tipo: 'chat:denegado', ...d });
     anotarError(chat);
     return chat;
   }
   ```
2. En `reducirChat`, agrega antes de `case 'chat:fin-turno':`:
   ```js
       case 'chat:denegado':
         if (!chat.mensajes.some((m) => m.id === e.id)) {
           chat.mensajes.push({ rol: 'denegado', id: e.id, bloques: [{ tipo: 'denegado', herramienta: e.herramienta ?? null, entrada: e.entrada ?? {}, motivo: e.motivo ?? null }] });
         }
         break;
   ```

En `chat.js`, reemplaza `resumenEntrada` por:

```js
export function resumenEntrada(nombre, entrada) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  const v = CAMPO[nombre] && e[CAMPO[nombre]] != null ? String(e[CAMPO[nombre]]) : JSON.stringify(e);
  return v.length > 200 ? v.slice(0, 200) : v;
}

// Tarjeta de una acción que el modo automático detuvo. "Autorizar y reintentar" envía la intención explícita del usuario,
// que según la documentación de Claude Code anula un soft_deny.
export function modeloDenegacion(b, alBloquear) {
  const herramienta = b?.herramienta || 'una acción';
  const resumen = resumenEntrada(b?.herramienta, b?.entrada);
  return {
    titulo: `El modo automático detuvo ${herramienta}`,
    motivo: b?.motivo || 'El clasificador la consideró riesgosa.',
    resumen,
    accion: alBloquear === 'denegar' ? null : { texto: 'Autorizar y reintentar', mensaje: `Autorizo explícitamente esta acción: ${herramienta} ${resumen}. Hazla.` },
  };
}
```

En `plan-vista.js`, agrega al final:

```js
const APROBACION = 'Apruebo el plan.';

// Barrera humana pendiente: el turno terminó con una pregunta, el plan ya se aprobó y su etapa con barrera humana
// está en curso, o terminó y la siguiente sigue en cola.
export function barreraHumana(chat, nodos = []) {
  if (chat?.estado !== 'lista') return null;
  const mensajes = chat.mensajes ?? [];
  const ultimo = mensajes.at(-1);
  if (ultimo?.rol !== 'asistente') return null;
  const texto = [...ultimo.bloques].reverse().find((b) => b.tipo === 'texto')?.texto ?? '';
  if (!texto.trim().endsWith('?')) return null;
  const iAprobacion = mensajes.findLastIndex((m) => m.rol === 'usuario' && m.bloques.some((b) => b.texto?.trim() === APROBACION));
  if (iAprobacion < 0) return null;
  let plan = null;
  for (let i = iAprobacion - 1; i >= 0 && !plan; i--) {
    if (mensajes[i].rol !== 'asistente') continue;
    for (const b of mensajes[i].bloques) {
      if (b.tipo !== 'texto') continue;
      const p = segmentar(b.texto).filter((s) => s.tipo === 'plan').at(-1);
      if (p) plan = p.plan;
    }
  }
  if (!plan) return null;
  const estados = estadoEtapas(plan, nodos);
  for (const [i, e] of plan.etapas.entries()) {
    if (e.barrera?.tipo !== 'humana') continue;
    const siguiente = plan.etapas[i + 1];
    if (estados[e.id] === 'trabajando' || (estados[e.id] === 'lista' && (!siguiente || estados[siguiente.id] === 'en-cola'))) {
      return { etapa: e.id, titulo: e.titulo, criterio: e.barrera.criterio };
    }
  }
  return null;
}
```

En `estado-vista.js`, agrega al final:

```js
// ---------- helpers del render de Actividad (entrega 2) ----------
export const claseNodo = (n) => (n.estado === 'activo' ? 'trabajando' : n.estado === 'fallido' ? 'error' : n.estado === 'sin-cierre' ? 'cola' : 'listo');
export const TEXTO_NODO = { trabajando: 'Trabajando', listo: 'Listo', error: 'Falló', cola: 'Sin cierre' };

export function etiquetaEvento(t) {
  switch (t?.tipo) {
    case 'delegacion': return { texto: 'Delegación', clase: 'e-trabajando' };
    case 'fin': return t.ok === false ? { texto: 'Falló', clase: 'e-error' } : { texto: 'Fin', clase: 'e-listo' };
    case 'alerta': return { texto: 'Alerta', clase: 'e-error' };
    case 'bloqueo': return { texto: 'Bloqueo', clase: 'e-error' };
    default: return { texto: String(t?.tipo ?? ''), clase: 'e-cola' };
  }
}

// "#1", "#2"… solo para agentes que se repiten en la sesión, en orden de delegación.
export function numeracion(sesion) {
  const total = {};
  const visto = {};
  const out = {};
  for (const id of sesion.ordenNodos) { const a = sesion.nodos[id].agente; total[a] = (total[a] ?? 0) + 1; }
  for (const id of sesion.ordenNodos) {
    const a = sesion.nodos[id].agente;
    visto[a] = (visto[a] ?? 0) + 1;
    out[id] = total[a] > 1 ? `#${visto[a]}` : '';
  }
  return out;
}

// Modelo pedido frente al real, agrupado por agente: solo los que ya terminaron con modelo informado.
export function pedidoVsReal(sesion) {
  const grupos = new Map();
  for (const id of sesion?.ordenNodos ?? []) {
    const n = sesion.nodos[id];
    if (!n.resultado?.modeloReal) continue;
    const pedido = familia(n.modelo);
    const real = familia(n.resultado.modeloReal);
    const ok = real === pedido || !['haiku', 'sonnet', 'opus', 'fable'].includes(pedido);
    const clave = `${n.agente}|${pedido}|${real}`;
    const g = grupos.get(clave) ?? { agente: n.agente, cantidad: 0, pedido, real, ok };
    g.cantidad += 1;
    grupos.set(clave, g);
  }
  return [...grupos.values()];
}
```

En `agentes-panel.js`, dentro de `verificacion`, reemplaza la línea del `return` final por:

```js
  const familiaReal = familiaModelo(real);
  return { texto: `${ok ? '✓' : '⚠'} ${familiaReal === 'desconocido' ? real : capitalizar(familiaReal)}`, clase: ok ? 'e-listo' : 'e-error' };
```

- [ ] **Paso 6: correr los tests nuevos y toda la suite**

Ejecuta: `node --test tests/ui-v2-puro.test.mjs` y después `node --test`.
Esperado: todo PASS (también `tests/dashboard-ui-puro.test.mjs`, que sigue usando `desdeHistorial` y `resumenEntrada`).

- [ ] **Paso 7: commit**

```bash
git add plugins/orquestador/dashboard/public/config-vista.js plugins/orquestador/dashboard/public/agentes-vista.js plugins/orquestador/dashboard/public/chat-vista.js plugins/orquestador/dashboard/public/chat.js plugins/orquestador/dashboard/public/plan-vista.js plugins/orquestador/dashboard/public/estado-vista.js plugins/orquestador/dashboard/public/agentes-panel.js tests/ui-v2-puro.test.mjs
git commit -m "feat: reductores puros de configuración, agentes, denegaciones y barreras"
```

---

### Tarea 11: Actividad rediseñada y mejoras del chat en la interfaz

**Archivos:**
- Reescribir: `plugins/orquestador/dashboard/public/index.html`
- Reescribir: `plugins/orquestador/dashboard/public/actividad.js`
- Reescribir: `plugins/orquestador/dashboard/public/actividad.css`
- Reescribir: `plugins/orquestador/dashboard/public/app.js`
- Modificar: `plugins/orquestador/dashboard/public/chat.js` (render)
- Modificar: `plugins/orquestador/dashboard/public/tema.css` (componentes nuevos)
- Modificar: `tests/dashboard-server.test.mjs` (test `frontend: …`) y `tests/dashboard-css.test.mjs`

**Interfaces:**
- Consume:
  - de la Tarea 10, `claseNodo`, `TEXTO_NODO`, `etiquetaEvento`, `numeracion`, `pedidoVsReal`, `barreraHumana`, `modeloDenegacion` y `costoVisible`;
  - de la Tarea 9, `GET /api/config` y el campo `denegados` del historial;
  - de la Tarea 7, los eventos SSE `chat:denegado` y `chat:fin-turno.costoTotalUSD`, y los campos `conversacion.modelo` y `conversacion.costoUSD`;
  - `POST /api/conversaciones/:id/titulo` (existente).
- Produce (`actividad.js`, además de lo que ya exportaba):
  - `iniciarActividad({ alternarCosto })`;
  - `fijarCostoVisible(bool)`;
  - `fijarModeloOrquestador(modelo|null)`.
- Produce (`app.js`):
  - `api()` adjunta el cuerpo del error en `error.datos`; la Tarea 12 lo usa para `errores`.
  - Estado `estado.config` (de `/api/config`).
  - Atajo de costo por sesión en `sessionStorage` (`orq-costo-atajo`).
- Produce (`index.html`):
  - ids nuevos `titulo-input`, `chip-orquestador` y `titulo-eventos`;
  - `#titulo` pasa a ser un botón que activa el renombrado;
  - `#stats` es el aside de resumen y `#timeline` la lista de Eventos.
- Comportamiento:
  - Las tarjetas de Actividad usan el color de su estado y un chip con su modelo, y las líneas el color del estado.
  - La tarjeta viajera dice "Modelo · esfuerzo → Agente #n".
  - El resumen muestra costo ocultable, límites, pedido frente a real y leyenda.
  - El chat muestra la tarjeta de denegación y la franja de barrera humana.
  - El título se renombra en el lugar (Enter guarda, Escape cancela).
  - El costo se separa en Orquestador, Agentes y Total.
  - La cabecera lleva el chip del modelo del orquestador.

- [ ] **Paso 1: actualizar los tests de estructura y CSS**

En `tests/dashboard-server.test.mjs`, test `frontend: estructura, módulos y sin innerHTML ni recursos externos`:
- agrega `'titulo-input', 'chip-orquestador', 'titulo-eventos'` a la lista de ids;
- agrega `'/config-vista.js', '/agentes-vista.js'` a la lista de archivos revisados.

En `tests/dashboard-css.test.mjs`, agrega:

```js
test('actividad.css: sin-animacion acotada a la vista Actividad y objetivos de 44 px en el demo y las casillas', () => {
  const css = leer('actividad.css');
  assert.match(css, /body\.sin-animacion \.vista-actividad \*/);
  assert.doesNotMatch(css, /body\.sin-animacion \*,/);
  assert.match(css, /\.vista-actividad \.vacio button\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.vista-actividad \.casilla\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.vista-actividad \.controles select\s*\{[^}]*min-height:\s*44px/);
});

test('actividad.css: las clases nuevas también van acotadas a .vista-actividad', () => {
  const css = leer('actividad.css');
  for (const g of ['resumen', 'eventos', 'columna-mapa', 'evento', 'casilla', 'bloque-resumen', 'etiqueta-evento', 'limite', 'centro-caja', 'costo-grande', 'item-leyenda']) {
    assert.doesNotMatch(css, sinPrefijo(g), `.${g} sin prefijo .vista-actividad`);
  }
});

test('tema.css: título editable de 44 px, tarjeta de denegación y franja de barrera en ámbar', () => {
  const css = leer('tema.css');
  assert.match(css, /\.titulo-editable\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.denegacion\s*\{[^}]*var\(--accion\)/);
  assert.match(css, /\.barrera-humana\s*\{[^}]*var\(--accion\)/);
});
```

- [ ] **Paso 2: correr los tests y ver que fallan**

Ejecuta: `node --test tests/dashboard-server.test.mjs tests/dashboard-css.test.mjs`
Esperado: FAIL (falta `#titulo-input`; `body.sin-animacion *` sin acotar).

- [ ] **Paso 3: reescribir `index.html`**

```html
<!doctype html>
<html lang="es" data-tema="oscuro">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Orquestador</title>
<link rel="stylesheet" href="./tema.css">
<link rel="stylesheet" href="./actividad.css">
</head>
<body>
<div class="app">
  <aside class="lateral" id="lateral" aria-label="Conversaciones">
    <div class="marca">
      <svg viewBox="0 0 26 26" fill="none" aria-hidden="true"><circle cx="13" cy="13" r="4.5" fill="#D97757"/><circle cx="4" cy="6" r="2.2" stroke="currentColor" stroke-width="1.4"/><circle cx="22" cy="6" r="2.2" stroke="currentColor" stroke-width="1.4"/><circle cx="13" cy="23" r="2.2" stroke="currentColor" stroke-width="1.4"/><path d="M6 7.2l3.6 3.2M20 7.2l-3.6 3.2M13 17.5v3.3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
      <span>Orquestador</span>
    </div>
    <button id="nueva" class="boton-primario" type="button">+ Nueva Conversación</button>
    <nav id="conversaciones" aria-label="Historial"></nav>
    <div id="uso" class="uso" hidden></div>
  </aside>

  <main class="principal">
    <header class="cabecera">
      <button id="menu" class="solo-movil" type="button" aria-label="Conversaciones">☰</button>
      <div class="titulo-conv">
        <div class="fila-titulo">
          <h1><button id="titulo" type="button" class="titulo-editable" disabled>Orquestador</button></h1>
          <input id="titulo-input" class="titulo-input" type="text" maxlength="120" aria-label="Título de la conversación" hidden>
          <span id="chip-orquestador" class="chip-modelo m-desconocido" hidden></span>
        </div>
        <div id="subtitulo"></div>
      </div>
      <div class="pestanas" role="tablist" aria-label="Vista">
        <button id="tab-chat" type="button" role="tab" aria-selected="true">Chat</button>
        <button id="tab-actividad" type="button" role="tab" aria-selected="false">Actividad</button>
      </div>
      <label class="modo">Permisos
        <select id="modo">
          <option value="preguntar">Preguntar</option>
          <option value="ediciones">Aceptar Ediciones</option>
          <option value="auto">Auto</option>
        </select>
      </label>
      <button id="cerrar-conv" class="boton-secundario" type="button" title="Libera el proceso de Claude Code; el próximo mensaje lo retoma" hidden>Cerrar proceso</button>
      <button id="ver-agentes" class="solo-movil" type="button" aria-label="Agentes">◎</button>
      <button id="tema" type="button" aria-label="Cambiar entre tema oscuro y claro">◐</button>
      <span id="conexion" class="conexion">Conectando…</span>
    </header>

    <section id="vista-chat" class="vista-chat" role="tabpanel" aria-labelledby="tab-chat">
      <div id="mensajes" class="mensajes" aria-live="polite"></div>
      <form id="composer" class="composer">
        <div class="caja">
          <label for="entrada" class="sr">Mensaje para el orquestador</label>
          <textarea id="entrada" rows="2" placeholder="Escríbele al orquestador…"></textarea>
          <div class="composer-pie">
            <span class="tenue">Enter envía · Shift+Enter nueva línea</span>
            <button id="detener" type="button" class="boton-secundario" hidden>■ Detener</button>
            <button id="enviar" type="submit" class="boton-enviar" aria-label="Enviar">↑</button>
          </div>
        </div>
      </form>
    </section>

    <section id="vista-actividad" class="vista-actividad" role="tabpanel" aria-labelledby="tab-actividad" hidden>
      <div class="barra">
        <div class="controles">
          <label>Sesión <select id="sesion" aria-label="Sesión"></select></label>
          <label class="casilla"><input type="checkbox" id="seguir" checked> Seguir la más reciente</label>
          <label class="casilla"><input type="checkbox" id="animaciones"> Animaciones</label>
        </div>
      </div>
      <div class="layout">
        <div class="columna-mapa">
          <section class="escenario" id="escenario" aria-label="Mapa de agentes">
            <svg id="lineas" class="lineas" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg>
            <div id="nodos"></div>
            <div id="centro" class="centro">
              <div class="centro-anillo"></div>
              <div class="centro-caja">
                <span class="fila"><span class="punto-orq"></span><span class="versalita">Orquestador</span></span>
                <span id="centro-modelo" class="chip-modelo m-desconocido">—</span>
              </div>
            </div>
            <div id="tarjetas" aria-live="polite"></div>
            <div id="vacio" class="vacio">
              <div>Esperando delegaciones…</div>
              <button id="demo" type="button">Ver demo</button>
            </div>
          </section>
          <section class="eventos" aria-labelledby="titulo-eventos">
            <h2 id="titulo-eventos">Eventos</h2>
            <ol id="timeline" class="timeline"></ol>
          </section>
        </div>
        <aside id="stats" class="resumen" aria-label="Resumen de la sesión"></aside>
      </div>
    </section>
  </main>

  <aside id="panel-agentes" class="agentes" aria-label="Agentes"></aside>
</div>
<div id="velo" class="velo" aria-hidden="true"></div>

<dialog id="dialogo-nueva" aria-labelledby="titulo-nueva">
  <form id="form-nueva" method="dialog">
    <h2 id="titulo-nueva" class="serif">Nueva Conversación</h2>
    <label for="carpeta">Carpeta donde trabaja el orquestador
      <input id="carpeta" list="carpetas" autocomplete="off" required placeholder="C:\Users\tu\proyecto">
    </label>
    <datalist id="carpetas"></datalist>
    <label for="modo-nueva">Permisos
      <select id="modo-nueva">
        <option value="preguntar">Preguntar</option>
        <option value="ediciones">Aceptar Ediciones</option>
        <option value="auto">Auto</option>
      </select>
    </label>
    <div id="error-nueva" role="alert"></div>
    <div class="acciones">
      <button type="submit" class="boton-primario">Crear</button>
      <button id="cancelar-nueva" type="button" class="boton-secundario">Cancelar</button>
    </div>
  </form>
</dialog>

<div id="toast" class="toast" role="status"></div>
<script type="module" src="./app.js"></script>
</body>
</html>
```

- [ ] **Paso 4: reescribir `actividad.js`**

```js
// Vista Actividad: el orquestador al centro con una tarjeta por agente, la lista de eventos y el resumen. La conexión SSE la maneja app.js.
// La lógica (posiciones, reductor y animación) vive en estado-vista.js y no cambia: este archivo solo dibuja.
import {
  vistaVacia, reducir, posicionOrbital, disposicion, conciliarConServidor, formatoCosto, formatoDuracion, formatoTokens,
  claseNodo, TEXTO_NODO, etiquetaEvento, numeracion, pedidoVsReal,
} from './estado-vista.js';
import { el, boton, chipModelo, nombreAgente, capitalizar, familiaModelo } from './dom.js';

const $ = (id) => document.getElementById(id);
const escenario = $('escenario');
const svg = $('lineas');
const NS = svg.namespaceURI;
// Animaciones: por defecto según prefers-reduced-motion; el usuario puede cambiarlo (se recuerda) o forzarlo con ?animar=1.
const preferencia = (() => { try { return localStorage.getItem('orq-animaciones'); } catch { return null; } })();
let animado = new URLSearchParams(location.search).has('animar') ? true
  : preferencia != null ? preferencia === '1' : !matchMedia('(prefers-reduced-motion: reduce)').matches;
const VIAJE_MS = 900, LECTURA_MS = 1400, SALIDA_MS = 400;
const VAR_ESTADO = { trabajando: '--activo', listo: '--listo', error: '--error', cola: '--cola' };
const FAMILIAS = ['haiku', 'sonnet', 'opus', 'fable'];
const TIPOS_EVENTO = new Set(['delegacion', 'fin', 'alerta', 'bloqueo']);
const LEYENDA_ESTADOS = [
  ['e-trabajando', 'Trabajando', 'Está ejecutando'], ['e-accion', 'Requiere permiso', 'Espera tu decisión'], ['e-listo', 'Listo', 'Terminó bien'],
  ['e-cola', 'En cola', 'Aún no empieza'], ['e-error', 'Error o alerta', 'Falló o no coincide'],
];
const LEYENDA_MODELOS = [['m-haiku', 'Haiku', 'Tareas mecánicas'], ['m-sonnet', 'Sonnet', 'Producción y análisis'], ['m-opus', 'Opus', 'Juicio experto'], ['m-fable', 'Fable', 'Máxima consecuencia']];

let vista = vistaVacia();
let actual = null;
let enReplay = true;
let servidor = null;            // { estado, config } de /estado
const ocultos = new Set();      // nodos cuya tarjeta todavía viaja
let costoVisible = true;        // lo fija app.js (config.mostrarCosto + atajo de sesión)
let modeloOrquestador = null;   // modelo de la conversación abierta (evento sesion del proceso)
let alternarCosto = null;       // callback de app.js para el botón Mostrar/Ocultar
let firmaResumen = null;

const hora = (ts) => (ts ? new Date(ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }) : '');
const base = (ruta) => String(ruta ?? '').split(/[\\/]/).filter(Boolean).pop() ?? '';
const sesion = () => (actual ? vista.sesiones[actual] : null);
const etiquetaModelo = (modelo, esfuerzo) => {
  const f = familiaModelo(modelo);
  const nombre = f === 'desconocido' ? '—' : f === 'heredado' ? 'Hereda' : capitalizar(f);
  return esfuerzo && !['—', 'desconocido', 'heredado'].includes(esfuerzo) ? `${nombre} · ${esfuerzo}` : nombre;
};
const textoResultado = (r) => (costoVisible ? `${formatoCosto(r.costoUSD)} · ${formatoDuracion(r.duracionMs)}` : formatoDuracion(r.duracionMs));

function toast(texto) {
  const t = $('toast');
  t.textContent = texto;
  t.classList.add('visible');
  clearTimeout(toast.temporizador);
  toast.temporizador = setTimeout(() => t.classList.remove('visible'), 4500);
}

// ---------- mapa de agentes ----------
function crearNodo(n) {
  const nodo = el('div', 'nodo');
  nodo.dataset.id = n.id;
  const cabeza = el('div', 'cabeza');
  cabeza.append(el('span', 'punto'), el('span', 'nombre'), el('span', 'num'), el('span', 'estado-nodo'));
  nodo.append(cabeza, el('div', 'meta'), el('div', 'pie'));
  return nodo;
}

function actualizarNodo(nodo, n, p, num) {
  const clase = claseNodo(n);
  nodo.style.left = `${p.x * 100}%`;
  nodo.style.top = `${p.y * 100}%`;
  for (const c of Object.keys(VAR_ESTADO)) nodo.classList.toggle(`e-${c}`, c === clase);
  nodo.classList.toggle('activo', n.estado === 'activo');
  nodo.classList.toggle('compacto', p.compacto);
  nodo.classList.toggle('alerta', !!n.alerta);
  nodo.classList.toggle('oculto', ocultos.has(n.id));
  nodo.querySelector('.nombre').textContent = nombreAgente(n.agente);
  nodo.querySelector('.num').textContent = num;
  nodo.querySelector('.estado-nodo').textContent = p.compacto ? ({ error: '✕', cola: '?' }[clase] ?? '✓') : TEXTO_NODO[clase];
  nodo.querySelector('.meta').textContent = n.meta || 'Sin meta';
  const pie = nodo.querySelector('.pie');
  pie.replaceChildren(chipModelo(n.modelo, n.esfuerzo));
  if (n.resultado) pie.append(el('span', 'tenue', textoResultado(n.resultado)));
  const tooltip = [
    n.meta, `Pedido: ${etiquetaModelo(n.modelo, n.esfuerzo)}${n.resultado?.modeloReal ? ` · real: ${n.resultado.modeloReal}` : ''}`,
    n.resultado && textoResultado(n.resultado), n.persona && `Persona: ${n.persona}`, n.origen && `Modelo: ${n.origen}`, n.alerta && `⚠ ${n.alerta}`,
  ].filter(Boolean).join('\n');
  if (tooltip) nodo.setAttribute('title', tooltip); else nodo.removeAttribute('title');
  const badge = nodo.querySelector('.badge');
  if (n.alerta && !badge) nodo.append(el('span', 'badge', '⚠'));
  if (!n.alerta && badge) badge.remove();
}

function renderNodos(s) {
  const posiciones = s ? disposicion(s) : [];
  const nums = s ? numeracion(s) : {};
  const vivos = new Set(posiciones.map((p) => p.id));
  for (const nodo of [...$('nodos').children]) if (!vivos.has(nodo.dataset.id)) nodo.remove();
  for (const linea of [...svg.querySelectorAll('line')]) if (!vivos.has(linea.dataset.id)) linea.remove();
  for (const p of posiciones) {
    const n = s.nodos[p.id];
    const clase = claseNodo(n);
    let nodo = $('nodos').querySelector(`[data-id="${CSS.escape(p.id)}"]`);
    if (!nodo) { nodo = crearNodo(n); $('nodos').append(nodo); }
    actualizarNodo(nodo, n, p, nums[p.id] ?? '');
    let linea = svg.querySelector(`line[data-id="${CSS.escape(p.id)}"]`);
    if (!linea) { linea = document.createElementNS(NS, 'line'); linea.dataset.id = p.id; svg.append(linea); }
    linea.setAttribute('x1', '50'); linea.setAttribute('y1', '50');
    linea.setAttribute('x2', String(p.x * 100)); linea.setAttribute('y2', String(p.y * 100));
    // Las variables CSS no valen en los atributos de presentación del SVG: el color va por style.
    linea.style.stroke = `var(${n.alerta ? '--error' : VAR_ESTADO[clase]})`;
    linea.setAttribute('class', `${n.estado === 'activo' && !ocultos.has(p.id) ? 'activa' : 'quieta'}${clase === 'cola' ? ' discontinua' : ''}`);
  }
  escenario.classList.toggle('trabajando', !!s && s.stats.activos > 0);
  $('vacio').hidden = !!(s && s.ordenNodos.length);
}

// ---------- resumen ----------
function barraLimite(nombre, usados, tope, clase) {
  const f = el('div', `limite ${clase}`);
  const fila = el('div', 'fila');
  fila.append(el('span', 'tenue', nombre), el('strong', null, `${usados} de ${tope}`));
  const pista = el('div', 'pista');
  const barra = el('div', 'barra-limite');
  barra.style.width = `${Math.min(100, Math.round((usados / Math.max(1, tope)) * 100))}%`;
  pista.append(barra);
  f.append(fila, pista);
  return f;
}

function itemLeyenda([clase, nombre, desc]) {
  const i = el('span', `item-leyenda ${clase}`);
  i.append(el('span', 'punto'), el('strong', null, nombre), el('span', 'tenue', desc));
  return i;
}

function bloque(titulo, ...hijos) {
  const b = el('section', 'bloque-resumen');
  b.append(el('h3', 'versalita tenue', titulo), ...hijos);
  return b;
}

function renderResumen(s) {
  const st = s?.stats ?? { activos: 0, completados: 0, costoUSD: 0, alertas: 0, bloqueos: 0, fable: 0 };
  // El estado del servidor suma toda la sesión; la vista local solo ve los últimos eventos del historial.
  const costo = Math.max(st.costoUSD, servidor?.estado?.costoUSD ?? 0);
  const fableUsados = servidor?.estado?.fableUsados ?? st.fable;
  const grupos = pedidoVsReal(s);
  const familiaOrq = familiaModelo(modeloOrquestador ?? servidor?.estado?.modeloPrincipal);
  // Solo se reconstruye si cambió algo: así el botón Mostrar/Ocultar no pierde el foco con cada consulta.
  const firma = JSON.stringify([actual, costo, costoVisible, st.activos, st.alertas, fableUsados, servidor?.config, grupos, familiaOrq]);
  if (firma === firmaResumen) return;
  firmaResumen = firma;
  const teniaFoco = $('stats').contains(document.activeElement);

  const cab = el('div', 'fila');
  cab.append(el('h3', 'versalita tenue', 'Costo Estimado'));
  if (alternarCosto) cab.append(boton(costoVisible ? 'Ocultar' : 'Mostrar', 'boton-texto', alternarCosto, costoVisible ? 'Ocultar costo' : 'Mostrar costo'));
  const bloqueCosto = el('section', 'bloque-resumen');
  bloqueCosto.append(cab, el('strong', 'costo-grande', costoVisible ? formatoCosto(costo) : '••••'),
    el('span', 'tenue nota', 'Referencial: se calcula con la tabla de precios. Lo cubre tu plan.'));

  const limites = bloque('Límites',
    barraLimite('Agentes en paralelo', st.activos, servidor?.config?.paraleloMax ?? 4, 'e-trabajando'),
    barraLimite('Fable usados', fableUsados, servidor?.config?.fableMaxPorSesion ?? 2, 'm-fable'));

  const filas = grupos.map((g) => {
    const f = el('div', 'fila fila-modelo');
    const real = FAMILIAS.includes(g.real) ? capitalizar(g.real) : g.real;
    f.append(el('span', null, g.cantidad > 1 ? `${nombreAgente(g.agente)} ×${g.cantidad}` : nombreAgente(g.agente)), el('span', g.ok ? 'e-listo' : 'e-error', `${g.ok ? '✓' : '⚠'} ${real}`));
    return f;
  });
  const alertas = el('div', `fila ${st.alertas ? 'e-error' : 'e-listo'}`);
  alertas.append(el('span', 'punto'), el('span', null, st.alertas ? `${st.alertas} ${st.alertas === 1 ? 'alerta' : 'alertas'} de modelo en esta sesión` : 'Sin alertas en esta sesión'));
  const modelos = bloque('Modelo Pedido vs. Real', ...(filas.length ? filas : [el('span', 'tenue', 'Aún no termina ningún agente.')]), alertas);

  const leyenda = bloque('Qué Significa Cada Color', ...LEYENDA_ESTADOS.map(itemLeyenda), el('hr'), ...LEYENDA_MODELOS.map(itemLeyenda));
  $('stats').replaceChildren(bloqueCosto, limites, modelos, leyenda);
  if (teniaFoco) $('stats').querySelector('button')?.focus();

  const cm = $('centro-modelo');
  cm.className = `chip-modelo m-${familiaOrq}`;
  cm.replaceChildren(el('span', 'punto'), document.createTextNode(familiaOrq === 'desconocido' ? '—' : capitalizar(familiaOrq)));
}

// ---------- eventos ----------
function renderTimeline(s) {
  const items = (s?.timeline ?? []).filter((t) => TIPOS_EVENTO.has(t.tipo));
  if (!items.length) { $('timeline').replaceChildren(el('li', 'tenue', 'Sin eventos todavía.')); return; }
  $('timeline').replaceChildren(...items.map((t) => {
    const et = etiquetaEvento(t);
    const partes = [t.agente && nombreAgente(t.agente), t.modelo, t.texto].filter(Boolean);
    if (t.tipo === 'fin' && t.costoUSD && costoVisible) partes.push(formatoCosto(t.costoUSD));
    if (t.regla) partes.push(`[${t.regla}]`);
    const li = el('li', 'evento');
    li.append(el('span', 'hora', hora(t.ts)), el('span', `etiqueta-evento ${et.clase}`, et.texto), el('span', 'texto', partes.join(' · ')));
    return li;
  }));
}

function renderSelector() {
  const sel = $('sesion');
  const ids = [...vista.orden].sort((a, b) => String(vista.sesiones[b].ultimo ?? '').localeCompare(String(vista.sesiones[a].ultimo ?? '')));
  sel.replaceChildren(...ids.map((id) => {
    const s = vista.sesiones[id];
    const o = el('option', null, `${base(s.cwd) || id.slice(0, 8)} · ${hora(s.ultimo)} · ${s.ordenNodos.length} deleg.`);
    o.value = id;
    o.selected = id === actual;
    return o;
  }));
}

function render() {
  const s = sesion();
  renderNodos(s);
  renderResumen(s);
  renderTimeline(s);
  renderSelector();
}

// ---------- animaciones ----------
function px(punto) {
  const r = escenario.getBoundingClientRect();
  return { x: punto.x * r.width, y: punto.y * r.height };
}

function viajar(tarjeta, desde, hasta, alLlegar) {
  tarjeta.style.left = `${desde.x}px`;
  tarjeta.style.top = `${desde.y}px`;
  $('tarjetas').append(tarjeta);
  tarjeta.getBoundingClientRect(); // fuerza el estado inicial antes de la transición
  tarjeta.classList.add('en-viaje');
  tarjeta.style.left = `${hasta.x}px`;
  tarjeta.style.top = `${hasta.y}px`;
  setTimeout(alLlegar, VIAJE_MS);
  setTimeout(() => { tarjeta.classList.add('se-va'); setTimeout(() => tarjeta.remove(), SALIDA_MS); }, VIAJE_MS + LECTURA_MS);
}

// Tarjeta viajera: "Modelo · esfuerzo → Agente #n".
function tarjetaEnvio(n, num) {
  const t = el('div', `tarjeta envio m-${familiaModelo(n.modelo)}`);
  t.append(el('div', 'rotulo', `${etiquetaModelo(n.modelo, n.esfuerzo)} → ${nombreAgente(n.agente)}${num ? ` ${num}` : ''}`));
  return t;
}

function tarjetaRecibo(n, num) {
  const r = n.resultado ?? {};
  const t = el('div', `tarjeta recibo ${n.estado === 'fallido' || n.alerta ? 'e-error' : 'e-listo'}`);
  t.append(el('div', 'rotulo', `${n.estado === 'fallido' ? '✕ Falló' : '✓ Listo'} ← ${nombreAgente(n.agente)}${num ? ` ${num}` : ''}`));
  t.append(el('div', 'titulo', r.modeloReal ?? 'modelo no informado'));
  const fila = el('div', 'fila');
  fila.append(el('span', 'chip', `${formatoTokens(r.tokensIn)} / ${formatoTokens(r.tokensOut)} tok`));
  if (costoVisible) fila.append(el('span', 'chip', formatoCosto(r.costoUSD)));
  fila.append(el('span', 'chip', formatoDuracion(r.duracionMs)));
  t.append(fila);
  return t;
}

function animar(efecto) {
  const s = sesion();
  if (!efecto || !s || efecto.sesion !== actual || !animado) { render(); return; }
  const centro = { x: 0.5, y: 0.5 };
  if (efecto.tipo === 'enviar') {
    const n = s.nodos[efecto.id];
    ocultos.add(n.id);
    render();
    viajar(tarjetaEnvio(n, numeracion(s)[n.id]), px(centro), px(posicionOrbital(n.slot)), () => {
      ocultos.delete(n.id);
      render();
      const nodo = $('nodos').querySelector(`[data-id="${CSS.escape(n.id)}"]`);
      nodo?.classList.add('nuevo');
      setTimeout(() => nodo?.classList.remove('nuevo'), 400);
    });
  } else if (efecto.tipo === 'volver') {
    const n = s.nodos[efecto.id];
    render();
    viajar(tarjetaRecibo(n, numeracion(s)[n.id]), px(posicionOrbital(n.slot)), px(centro), () => {});
  } else if (efecto.tipo === 'bloqueo') {
    render();
    const c = $('centro');
    c.classList.remove('bloqueo');
    void c.offsetWidth;
    c.classList.add('bloqueo');
    toast(`⛔ ${efecto.motivo}`);
  } else {
    render();
  }
}

// ---------- datos ----------
function elegirMasReciente() {
  let mejor = null;
  for (const id of vista.orden) if (!mejor || String(vista.sesiones[id].ultimo ?? '') > String(vista.sesiones[mejor].ultimo ?? '')) mejor = id;
  actual = mejor;
}

function procesar(e) {
  const nueva = !!e?.session && !vista.sesiones[e.session];
  const { efecto } = reducir(vista, e);
  if (enReplay) return;
  if (nueva && ($('seguir').checked || !actual)) { actual = e.session; servidor = null; pedirEstado(); render(); }
  if (e?.session === actual) animar(efecto); else renderSelector();
}

async function pedirEstado() {
  const id = actual;
  if (!id || id.startsWith('demo-')) return;
  try {
    const r = await fetch(`/estado?session=${encodeURIComponent(id)}`);
    if (!r.ok) return;
    const datos = await r.json();
    if (id !== actual) return; // el usuario cambió de sesión mientras se esperaba la respuesta
    servidor = datos;
    const s = sesion();
    // Activos que el servidor ya no tiene (sesión que murió sin cerrar sus delegaciones) dejan de latir.
    if (!enReplay && s && servidor.estado && conciliarConServidor(s, servidor.estado.activas ?? {}).length) render();
    else renderResumen(s);
  } catch { /* sin servidor: se usan los datos locales */ }
}

// ---------- demo ----------
function demo() {
  enReplay = false;
  const id = `demo-${Date.now()}`;
  const ahora = () => new Date().toISOString();
  const pasos = [
    [0, { tipo: 'sesion', cwd: 'demo/paper-rl' }],
    [400, { tipo: 'delegacion', id: 'd1', agente: 'orquestador:investigador-rl', meta: 'Diseñar ablation de reward shaping con 3 seeds', modelo: 'opus', esfuerzo: 'high', origenModelo: 'explicito', persona: 'Escéptico, obsesionado con seeds y baselines' }],
    [1300, { tipo: 'delegacion', id: 'd2', agente: 'orquestador:implementador', meta: 'Verificadores de CSV y paper', modelo: 'sonnet', esfuerzo: 'medium', origenModelo: 'explicito' }],
    [2200, { tipo: 'delegacion', id: 'd3', agente: 'orquestador:implementador', meta: 'Contactos, slides y git', modelo: 'sonnet', esfuerzo: 'medium', origenModelo: 'explicito' }],
    [4200, { tipo: 'fin', id: 'd2', modeloReal: 'claude-sonnet-5-5', tokensIn: 18400, tokensOut: 920, costoUSD: 0.0023, duracionMs: 3800, ok: true }],
    [5200, { tipo: 'bloqueo', agente: 'orquestador:revisor-codigo', regla: 'tope-fable', motivo: 'Tope de Fable alcanzado (2/2 en esta sesión). Usa opus con effort xhigh.' }],
    [6400, { tipo: 'delegacion', id: 'd4', agente: 'orquestador:revisor-codigo', meta: 'Revisar los verificadores', modelo: 'haiku', esfuerzo: 'low', origenModelo: 'explicito' }],
    [7600, { tipo: 'fin', id: 'd3', modeloReal: 'claude-sonnet-5-5', tokensIn: 9100, tokensOut: 400, costoUSD: 0.0011, duracionMs: 5100, ok: true }],
    [9000, { tipo: 'fin', id: 'd1', modeloReal: 'claude-sonnet-5-5', tokensIn: 41200, tokensOut: 2600, costoUSD: 0.108, duracionMs: 8400, ok: true }],
    [9050, { tipo: 'alerta', id: 'd1', agente: 'orquestador:investigador-rl', mensaje: 'se pidió opus pero corrió claude-sonnet-5-5' }],
    [11500, { tipo: 'fin', id: 'd4', modeloReal: 'claude-haiku-5-5', tokensIn: 52300, tokensOut: 3100, costoUSD: 0.021, duracionMs: 5000, ok: true }],
  ];
  actual = id;
  $('seguir').checked = false;
  servidor = { estado: { fableUsados: 2, modeloPrincipal: 'opus' }, config: { fableMaxPorSesion: 2, paraleloMax: 4 } };
  for (const [ms, e] of pasos) setTimeout(() => { procesar({ ...e, session: id, ts: ahora() }); if (e.tipo === 'sesion') render(); }, ms);
}

// ---------- integración con app.js ----------
const oyentes = new Set();
const notificar = () => { for (const f of oyentes) f(vista); };
export const alCambiar = (f) => { oyentes.add(f); };
export const vistaActual = () => vista;

// Cada conexión (también las reconexiones) reenvía el historial completo: se parte de cero.
export function inicioConexion() { vista = vistaVacia(); enReplay = true; }

export function procesarEvento(e) {
  procesar(e);
  if (!enReplay) notificar();
}

export function finReplay() {
  enReplay = false;
  if (!actual || !vista.sesiones[actual]) elegirMasReciente();
  pedirEstado();
  render();
  notificar();
}

// La conversación abierta en el chat fija la sesión que muestra la actividad.
export function mostrarSesion(id) {
  if (!id || id === actual) return;
  actual = id;
  servidor = null;
  ocultos.clear();
  $('tarjetas').replaceChildren();
  $('seguir').checked = false;
  pedirEstado();
  render();
}

export function fijarCostoVisible(visible) {
  costoVisible = !!visible;
  firmaResumen = null;
  render();
}

export function fijarModeloOrquestador(modelo) {
  if ((modelo ?? null) === modeloOrquestador) return;
  modeloOrquestador = modelo ?? null;
  firmaResumen = null;
  renderResumen(sesion());
}

function aplicarAnimacion() { document.body.classList.toggle('sin-animacion', !animado); $('animaciones').checked = animado; }

export function iniciarActividad({ alternarCosto: alternar = null } = {}) {
  alternarCosto = alternar;
  $('sesion').addEventListener('change', (ev) => { actual = ev.target.value; servidor = null; ocultos.clear(); $('tarjetas').replaceChildren(); pedirEstado(); render(); });
  $('demo').addEventListener('click', demo);
  $('animaciones').addEventListener('change', (ev) => {
    animado = ev.target.checked;
    try { localStorage.setItem('orq-animaciones', animado ? '1' : '0'); } catch { /* sin almacenamiento */ }
    aplicarAnimacion();
  });
  aplicarAnimacion();
  setInterval(pedirEstado, 3000);
  addEventListener('resize', () => render());
  render();
  if (new URLSearchParams(location.search).has('demo')) demo();
}
```

- [ ] **Paso 5: reescribir `actividad.css`**

```css
/* Vista Actividad (entrega 2): mapa de agentes con el orquestador al centro, eventos y resumen. Todo va bajo .vista-actividad. */
.vista-actividad {
  --fondo-2: var(--hundido); --panel: var(--tarjeta); --panel-2: var(--hundido);
  --suave: var(--texto-2); --tenue: var(--texto-3); --acento: var(--clay);
  flex: 1; min-height: 0; overflow-y: auto;
}

/* Barra superior */
.vista-actividad .barra {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  padding: 4px 16px; border-bottom: 1px solid var(--borde); background: var(--cabecera);
}
.vista-actividad .controles { display: flex; align-items: center; gap: 4px 18px; flex-wrap: wrap; color: var(--suave); font-size: 13px; }
.vista-actividad .controles select { min-height: 44px; background: var(--panel-2); border: 1px solid var(--borde); border-radius: 8px; padding: 0 8px; max-width: min(260px, 70vw); }
.vista-actividad .casilla { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; cursor: pointer; }
.vista-actividad .casilla input { width: 20px; height: 20px; margin: 0; }

/* Layout: mapa y eventos a la izquierda, resumen a la derecha */
.vista-actividad .layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; }
.vista-actividad .columna-mapa { display: flex; flex-direction: column; min-width: 0; }
.vista-actividad .escenario {
  position: relative; overflow: hidden; height: min(62vh, 640px); min-height: 440px; border-bottom: 1px solid var(--borde-fuerte);
  background:
    radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--acento) 10%, transparent) 0, transparent 45%),
    radial-gradient(circle at 50% 50%, var(--fondo-2) 0, var(--fondo) 75%);
}
.vista-actividad .resumen { display: flex; flex-direction: column; gap: 12px; padding: 16px; min-width: 0; background: var(--panel); border-left: 1px solid var(--borde-fuerte); }
@media (max-width: 1000px) {
  .vista-actividad .layout { grid-template-columns: minmax(0, 1fr); }
  .vista-actividad .resumen { border-left: 0; border-top: 1px solid var(--borde-fuerte); }
}

/* Líneas: color del estado del agente (lo fija actividad.js por style) */
.vista-actividad .lineas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.vista-actividad .lineas line { vector-effect: non-scaling-stroke; stroke-width: 2; }
.vista-actividad .lineas line.activa { stroke-dasharray: 6 8; animation: fluir 0.9s linear infinite; opacity: .95; }
.vista-actividad .lineas line.quieta { opacity: .45; }
.vista-actividad .lineas line.discontinua { stroke-dasharray: 4 4; }
@keyframes fluir { to { stroke-dashoffset: -14; } }

/* Orquestador al centro */
.vista-actividad .centro { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 3; display: grid; place-items: center; }
.vista-actividad .centro-caja {
  position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 14px 18px; border-radius: 14px;
  background: color-mix(in srgb, var(--acento) 16%, var(--panel)); border: 2px solid color-mix(in srgb, var(--acento) 70%, transparent); box-shadow: var(--sombra);
}
.vista-actividad .centro-anillo { position: absolute; inset: -10px; border-radius: 20px; border: 2px solid transparent; }
.vista-actividad .trabajando .centro-anillo { border-color: color-mix(in srgb, var(--acento) 55%, transparent); animation: latir 1.6s ease-out infinite; }
.vista-actividad .centro.bloqueo .centro-anillo { border-color: var(--error); animation: destello .5s ease-out 3; }
@keyframes latir { from { transform: scale(1); opacity: .9; } to { transform: scale(1.2); opacity: 0; } }
@keyframes destello { from { transform: scale(1); opacity: 1; } to { transform: scale(1.3); opacity: 0; } }

/* Chips de las tarjetas que viajan */
.vista-actividad .chip {
  display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12px; white-space: nowrap;
  background: color-mix(in srgb, var(--c, var(--acento)) 18%, transparent);
  border: 1px solid color-mix(in srgb, var(--c, var(--acento)) 45%, transparent);
}

/* Tarjetas de agente: el borde y el texto del estado usan --c, que fija la clase e-* */
.vista-actividad .nodo {
  position: absolute; transform: translate(-50%, -50%); width: 188px; z-index: 2;
  background: var(--panel); border: 1px solid color-mix(in srgb, var(--c) 60%, transparent);
  border-radius: 12px; padding: 8px 10px; box-shadow: var(--sombra);
  transition: left .5s ease, top .5s ease, opacity .4s ease;
}
.vista-actividad .nodo.e-cola { border-style: dashed; opacity: .75; }
.vista-actividad .nodo.oculto { opacity: 0; }
.vista-actividad .nodo.nuevo { animation: aparecer .35s cubic-bezier(.2, .9, .3, 1.3); }
@keyframes aparecer { from { transform: translate(-50%, -50%) scale(.6); opacity: 0; } }
.vista-actividad .nodo.activo { animation: pulso 1.8s ease-in-out infinite; }
.vista-actividad .nodo.activo.nuevo { animation: aparecer .35s cubic-bezier(.2, .9, .3, 1.3), pulso 1.8s ease-in-out .35s infinite; }
@keyframes pulso {
  0%, 100% { box-shadow: var(--sombra), 0 0 0 0 color-mix(in srgb, var(--c) 0%, transparent); }
  50% { box-shadow: var(--sombra), 0 0 0 6px color-mix(in srgb, var(--c) 28%, transparent); }
}
.vista-actividad .nodo.compacto { width: 148px; padding: 5px 8px; border-radius: 10px; opacity: .85; }
.vista-actividad .nodo.compacto .meta, .vista-actividad .nodo.compacto .pie { display: none; }
.vista-actividad .nodo.alerta { border-color: var(--error); }
.vista-actividad .nodo .cabeza { display: flex; align-items: center; gap: 6px; min-width: 0; }
.vista-actividad .nodo .nombre { font-weight: 650; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vista-actividad .nodo .num { font-size: 12px; color: var(--suave); }
.vista-actividad .nodo .estado-nodo { margin-left: auto; font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--c); white-space: nowrap; }
.vista-actividad .nodo .meta {
  margin-top: 6px; font-size: 12px; color: var(--suave);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.vista-actividad .nodo .pie { margin-top: 6px; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; font-size: 11px; }
.vista-actividad .badge { position: absolute; top: -9px; right: -9px; background: var(--error); color: #fff; border-radius: 999px; padding: 0 6px; font-size: 12px; }

/* Tarjetas que viajan: la de ida es una píldora "Modelo · esfuerzo → Agente #n" con el color del modelo */
.vista-actividad .tarjeta {
  position: absolute; z-index: 5; width: 250px; pointer-events: none;
  transform: translate(-50%, -50%) scale(.7); opacity: 0;
  background: var(--panel); border: 1px solid color-mix(in srgb, var(--c, var(--acento)) 60%, transparent);
  border-radius: 12px; padding: 8px 12px; box-shadow: var(--sombra);
  transition: left .9s cubic-bezier(.2, .8, .2, 1), top .9s cubic-bezier(.2, .8, .2, 1), transform .9s ease, opacity .3s ease;
}
.vista-actividad .tarjeta.envio { width: auto; max-width: 300px; border-radius: 999px; padding: 6px 14px; white-space: nowrap; }
.vista-actividad .tarjeta.en-viaje { opacity: 1; transform: translate(-50%, -50%) scale(1); }
.vista-actividad .tarjeta.se-va { opacity: 0; transform: translate(-50%, -50%) scale(.85); transition: opacity .4s ease, transform .4s ease; }
.vista-actividad .tarjeta .rotulo { font-size: 12px; font-weight: 650; color: var(--c, var(--suave)); }
.vista-actividad .tarjeta .titulo { font-weight: 650; margin: 2px 0 4px; }
.vista-actividad .tarjeta .fila { display: flex; gap: 6px; flex-wrap: wrap; }

.vista-actividad .vacio { position: absolute; left: 50%; top: calc(50% + 90px); transform: translateX(-50%); color: var(--suave); text-align: center; z-index: 1; }
.vista-actividad .vacio button { margin-top: 8px; min-height: 44px; min-width: 44px; padding: 0 16px; background: var(--acento); color: #fff; border: 0; border-radius: 10px; cursor: pointer; }

/* Eventos */
.vista-actividad .eventos { padding: 12px 16px 24px; }
.vista-actividad .eventos h2 { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--suave); }
.vista-actividad .timeline { list-style: none; margin: 0; padding: 0; }
.vista-actividad .evento {
  display: grid; grid-template-columns: auto auto minmax(0, 1fr); align-items: baseline; gap: 4px 10px;
  padding: 8px 0; border-bottom: 1px solid var(--borde); font-size: 13px;
}
.vista-actividad .evento .hora { color: var(--tenue); font-family: var(--mono); font-size: 12px; font-variant-numeric: tabular-nums; }
.vista-actividad .etiqueta-evento {
  padding: 1px 8px; border-radius: 6px; font-size: 11.5px; font-weight: 600; white-space: nowrap;
  color: var(--c); background: color-mix(in srgb, var(--c) 16%, transparent);
}
.vista-actividad .evento .texto { color: var(--suave); overflow-wrap: anywhere; }
@media (max-width: 520px) {
  .vista-actividad .evento { grid-template-columns: auto minmax(0, 1fr); }
  .vista-actividad .evento .texto { grid-column: 1 / -1; }
}

/* Resumen */
.vista-actividad .bloque-resumen { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: 12px; background: var(--fondo-2); border: 1px solid var(--borde); }
.vista-actividad .bloque-resumen h3 { margin: 0; }
.vista-actividad .bloque-resumen .fila { justify-content: space-between; }
.vista-actividad .bloque-resumen hr { width: 100%; margin: 2px 0; border: 0; border-top: 1px solid var(--borde); }
.vista-actividad .costo-grande { font-size: 24px; font-variant-numeric: tabular-nums; }
.vista-actividad .nota { font-size: 12px; }
.vista-actividad .limite .pista { height: 6px; margin-top: 4px; border-radius: 3px; background: var(--pista); }
.vista-actividad .limite .barra-limite { height: 6px; border-radius: 3px; background: var(--c); }
.vista-actividad .fila-modelo { font-size: 13px; }
.vista-actividad .item-leyenda { display: grid; grid-template-columns: auto auto minmax(0, 1fr); align-items: center; gap: 8px; font-size: 12.5px; }

/* Pantallas angostas: va al final para ganar a las reglas base de nodos, centro y tarjetas. */
@media (max-width: 860px) {
  .vista-actividad .nodo { width: 140px; padding: 6px 8px; }
  .vista-actividad .nodo.compacto { width: 116px; }
  .vista-actividad .nodo .meta { font-size: 11px; }
  .vista-actividad .tarjeta { width: 200px; }
  .vista-actividad .escenario { min-height: 420px; }
}
body.sin-animacion .vista-actividad *, body.sin-animacion .vista-actividad *::before, body.sin-animacion .vista-actividad *::after {
  animation: none !important; transition: none !important;
}
```

- [ ] **Paso 6: cambios de render en `chat.js`**

1. Cambia los imports por:
   ```js
   import { el, boton, chipModelo, nombreAgente, claseEstado, textoEstado } from './dom.js';
   import { segmentar, estadoEtapas, barreraHumana } from './plan-vista.js';
   import { renderPlan } from './plan.js';
   ```
2. Agrega debajo de `DECISION`:
   ```js
   const RESULTADO_MAX = 300;
   const recortar = (t, n) => { const s = String(t ?? ''); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
   // Nunca se generan div.texto vacíos.
   const divTexto = (t) => (String(t ?? '').trim() ? el('div', 'texto', String(t).trim()) : null);
   ```
3. En `bloqueTexto`, reemplaza el `else { … }` por:
   ```js
       else {
         const d = divTexto(s.texto);
         if (d) frag.append(d);
         if (s.aviso) frag.append(el('div', 'aviso', s.aviso));
       }
   ```
4. En `bloqueHerramienta`, reemplaza la línea del resultado por:
   ```js
     if (b.resultado) d.append(el('span', 'resultado', recortar(b.resultado.texto || (b.resultado.ok ? 'ok' : 'error'), RESULTADO_MAX)));
   ```
5. En `renderMensaje`:
   - agrega como primera línea `if (m.rol === 'denegado') return tarjetaDenegacion(m.bloques[0], ctx);`;
   - en el caso `error`, reemplaza `d.append(el('span', 'versalita', 'Error'), el('div', 'texto', m.bloques[0]?.texto ?? ''));` por:
     ```js
         d.append(el('span', 'versalita', 'Error'));
         const t = divTexto(m.bloques[0]?.texto);
         if (t) d.append(t);
     ```
   - en el caso `pensando`, reemplaza el bloque por:
     ```js
         else if (b.tipo === 'pensando') {
           const t = divTexto(b.texto);
           if (!t) continue;
           const det = el('details', 'pensando');
           det.append(el('summary', null, 'Razonamiento'), t);
           d.append(det);
         }
     ```
6. Agrega antes de `export function renderChat`:
   ```js
   function tarjetaDenegacion(b, ctx) {
     const m = modeloDenegacion(b, ctx.alBloquear);
     const s = el('section', 'denegacion');
     s.setAttribute('aria-label', m.titulo);
     const p = el('p', 'denegacion-titulo');
     p.append(document.createTextNode('El modo automático detuvo '), el('strong', null, b?.herramienta || 'una acción'), document.createTextNode(`: ${m.motivo}`));
     s.append(el('span', 'versalita', 'Modo automático'), p, el('code', 'bloque-codigo', m.resumen));
     if (m.accion) s.append(boton(m.accion.texto, 'boton-secundario', () => ctx.reintentar?.(m.accion.mensaje)));
     else s.append(el('span', 'tenue', 'Según tu configuración, el orquestador busca otra vía sin preguntarte.'));
     return s;
   }

   function franjaBarrera(b, { onAprobar, onCambios }) {
     const f = el('section', 'barrera-humana');
     f.setAttribute('aria-label', `Barrera humana de ${b.etapa}`);
     const t = el('div', 'texto-barrera');
     t.append(el('span', 'rombo-mini', ''), el('strong', null, 'Barrera:'), el('span', null, b.criterio));
     const acciones = el('div', 'acciones');
     acciones.append(boton('Aprobar', 'boton-primario', onAprobar), boton('Pedir Cambios', 'boton-secundario', onCambios));
     f.append(t, acciones);
     return f;
   }
   ```
7. En `renderChat`, después de la línea `const hijos = chat.mensajes.map(…);`, agrega:
   ```js
     const barrera = ctx.barreraAcciones ? barreraHumana(chat, ctx.nodos) : null;
     if (barrera) hijos.push(franjaBarrera(barrera, ctx.barreraAcciones));
   ```

- [ ] **Paso 7: estilos nuevos en `tema.css`**

Agrega antes del bloque `/* Diálogo y toast */`:

```css
/* Cabecera: título que se renombra en el lugar y chip del modelo del orquestador */
.fila-titulo { display: flex; align-items: center; gap: 10px; min-width: 0; }
.fila-titulo h1 { margin: 0; min-width: 0; }
.titulo-editable {
  max-width: 100%; min-height: 44px; padding: 0 6px; margin-left: -6px; border: 0; border-radius: 8px; background: transparent;
  font-family: var(--serif); font-size: 21px; font-weight: 500; line-height: 1.3; text-align: left; cursor: text;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.titulo-editable:hover:not(:disabled) { background: var(--seleccion); }
.titulo-editable:disabled { opacity: 1; cursor: default; }
.titulo-input { flex: 1; min-width: 0; min-height: 44px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--borde-fuerte); background: var(--fondo); font-family: var(--serif); font-size: 19px; }

/* Chat: acción que el modo automático detuvo y barrera humana pendiente (ámbar = requiere tu decisión) */
.denegacion { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 14px 16px; border-radius: 14px; border: 1px solid var(--accion); background: color-mix(in srgb, var(--accion) 8%, var(--tarjeta)); }
.denegacion > .versalita { color: var(--accion); }
.denegacion-titulo { margin: 0; overflow-wrap: anywhere; }
.denegacion .bloque-codigo { width: 100%; }
.barrera-humana { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; padding: 12px 16px; border-radius: 12px; border: 1px solid var(--accion); background: color-mix(in srgb, var(--accion) 12%, transparent); }
.barrera-humana .texto-barrera { flex: 1 1 260px; display: flex; align-items: baseline; gap: 8px; min-width: 0; overflow-wrap: anywhere; }
.barrera-humana strong { color: var(--accion); }
.rombo-mini { width: 12px; height: 12px; flex: none; transform: rotate(45deg); border: 2px solid var(--accion); border-radius: 3px; }

/* Costo de la conversación: orquestador, agentes y total */
.bloque-costo { display: flex; flex-direction: column; gap: 4px; }
.bloque-costo .fila { justify-content: space-between; }
.bloque-costo .total { padding-top: 4px; border-top: 1px solid var(--borde); }
```

- [ ] **Paso 8: reescribir `app.js`**

```js
// Arranque del dashboard: tema, pestañas, conversaciones, SSE y wiring entre chat, actividad y panel de agentes.
import { el, boton, preferencia, guardarPreferencia, familiaModelo, capitalizar } from './dom.js';
import { chatVacio, desdeHistorial, reducirChat } from './chat-vista.js';
import { renderChat } from './chat.js';
import { renderAgentes } from './agentes-panel.js';
import {
  iniciarActividad, procesarEvento, inicioConexion, finReplay, mostrarSesion, vistaActual, alCambiar, fijarCostoVisible, fijarModeloOrquestador,
} from './actividad.js';
import { formatoCosto } from './estado-vista.js';
import { costoVisible } from './config-vista.js';

const $ = (id) => document.getElementById(id);
const ESTADO_CLASE = { trabajando: 'e-trabajando', 'esperando-permiso': 'e-accion', error: 'e-error', lista: 'e-listo', inactiva: 'e-cola' };
const estado = { conversaciones: [], actual: null, chat: chatVacio(), agente: null, pasos: [], desde: 0, consultaFinal: null, config: null };
const leerSesion = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const guardarSesion = (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
// config.mostrarCosto manda; el botón Mostrar/Ocultar deja solo un atajo para esta sesión del navegador.
let atajoCosto = leerSesion('orq-costo-atajo');
let sinSesionVisible = false;
let editandoTitulo = false;
let firmaUso = null;
const verCosto = () => costoVisible(estado.config?.mostrarCosto, atajoCosto);

// ---------- tema ----------
function aplicarTema(t) { document.documentElement.dataset.tema = t; guardarPreferencia('orq-tema', t); }
aplicarTema(preferencia('orq-tema', 'oscuro') === 'claro' ? 'claro' : 'oscuro');
$('tema').addEventListener('click', () => aplicarTema(document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro'));

// ---------- utilidades ----------
function toast(texto) {
  const t = $('toast');
  t.textContent = texto;
  t.classList.add('visible');
  clearTimeout(toast.temporizador);
  toast.temporizador = setTimeout(() => t.classList.remove('visible'), 4500);
}

function sinSesion() {
  sinSesionVisible = true; // el render que esté en curso no debe pisar este aviso
  $('mensajes').replaceChildren(el('div', 'vacio-chat', 'Falta iniciar sesión en el dashboard. Ábrelo con /orquestador:dashboard desde Claude Code.'));
}

async function api(metodo, ruta, cuerpo) {
  const r = await fetch(ruta, { method: metodo, headers: cuerpo ? { 'content-type': 'application/json' } : {}, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const datos = await r.json().catch(() => ({}));
  if (r.status === 401) { sinSesion(); throw new Error(datos.error ?? 'Falta iniciar sesión'); }
  if (!r.ok) {
    const e = new Error(datos.error ?? `Error ${r.status}`);
    e.datos = datos; // p. ej. { errores: { campo: mensaje } }
    throw e;
  }
  return datos;
}

const convActual = () => estado.conversaciones.find((c) => c.id === estado.actual) ?? null;
const sesionActual = () => { const c = convActual(); return c?.sessionId ? vistaActual().sesiones[c.sessionId] ?? null : null; };
const ruta = (c, sufijo) => `/api/conversaciones/${encodeURIComponent(c.id)}/${sufijo}`;
const llenarComposer = (t) => { $('entrada').value = t; $('entrada').focus(); };

// ---------- costo ----------
function aplicarCosto() { fijarCostoVisible(verCosto()); firmaUso = null; actualizarUso(); }
function alternarCosto() { atajoCosto = verCosto() ? 'ocultar' : 'mostrar'; guardarSesion('orq-costo-atajo', atajoCosto); aplicarCosto(); }
async function cargarConfigUI() {
  try { estado.config = await api('GET', '/api/config'); } catch { /* sin config: valores por defecto */ }
  aplicarCosto();
}

// ---------- pestañas y cajones ----------
function mostrarPestana(p) {
  guardarPreferencia('orq-pestana', p);
  for (const [tab, vista] of [['tab-chat', 'vista-chat'], ['tab-actividad', 'vista-actividad']]) {
    const activa = tab === `tab-${p}`;
    $(tab).setAttribute('aria-selected', String(activa));
    $(vista).hidden = !activa;
  }
  if (p === 'actividad') dispatchEvent(new Event('resize'));
}
$('tab-chat').addEventListener('click', () => mostrarPestana('chat'));
$('tab-actividad').addEventListener('click', () => mostrarPestana('actividad'));
$('menu').addEventListener('click', () => document.body.classList.toggle('lateral-abierto'));
$('ver-agentes').addEventListener('click', () => document.body.classList.toggle('panel-abierto'));
// Cajones (≤1180 px): se cierran con el velo, con Escape o con el botón "Cerrar panel".
const cerrarCajones = () => document.body.classList.remove('lateral-abierto', 'panel-abierto');
$('velo').addEventListener('click', cerrarCajones);
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && !document.querySelector('dialog[open]')) cerrarCajones();
});

// ---------- render ----------
function renderLista() {
  const nav = $('conversaciones');
  if (!estado.conversaciones.length) { nav.replaceChildren(el('p', 'tenue', 'Aún no hay conversaciones.')); return; }
  nav.replaceChildren(...estado.conversaciones.map((c) => {
    const b = boton(null, `conv ${ESTADO_CLASE[c.estado] ?? 'e-cola'}${c.id === estado.actual ? ' actual' : ''}`, () => { document.body.classList.remove('lateral-abierto'); abrir(c.id); });
    if (c.id === estado.actual) b.setAttribute('aria-current', 'page');
    const l1 = el('span', 'fila');
    l1.append(el('span', 'punto'));
    if (c.etiqueta) l1.append(el('span', 'etiqueta mono', c.etiqueta));
    l1.append(el('span', 'titulo', c.titulo));
    b.append(l1, el('span', 'ruta', c.cwd));
    return b;
  }));
}

function renderCabecera() {
  const c = convActual();
  if (!editandoTitulo) $('titulo').textContent = c?.titulo ?? 'Orquestador';
  $('titulo').disabled = !c;
  $('titulo').title = c ? 'Renombrar conversación' : '';
  const chip = $('chip-orquestador');
  const fam = familiaModelo(c?.modelo);
  chip.hidden = !c || fam === 'desconocido';
  chip.className = `chip-modelo m-${fam}`;
  chip.title = c?.modelo ? `Modelo del orquestador: ${c.modelo}` : '';
  chip.replaceChildren(el('span', 'punto'), document.createTextNode(capitalizar(fam)));
  fijarModeloOrquestador(c?.modelo ?? null);
  const sub = $('subtitulo');
  sub.replaceChildren();
  if (c) {
    sub.append(document.createTextNode(c.cwd));
    if (c.rama) {
      sub.append(document.createTextNode(' · '));
      if (c.etiqueta) sub.append(el('strong', null, c.etiqueta), document.createTextNode(' '));
      sub.append(document.createTextNode(c.etiqueta ? c.rama.replace(/^[a-z]+\//i, '') : c.rama));
    }
  }
  $('modo').value = c?.modo ?? 'preguntar';
  $('modo').disabled = !c;
  $('entrada').disabled = !c;
  $('enviar').disabled = !c;
  const enCurso = !!c && ['trabajando', 'esperando-permiso'].includes(c.estado);
  $('detener').hidden = !enCurso;
  // Libera el proceso de Claude Code de la conversación; el siguiente mensaje lo retoma con --resume.
  $('cerrar-conv').hidden = !c;
  $('cerrar-conv').disabled = !c?.pid || enCurso;
}

// Renombrar en el lugar: Enter guarda, Escape (o salir del campo) cancela.
function empezarRenombrar() {
  const c = convActual();
  if (!c) return;
  editandoTitulo = true;
  const input = $('titulo-input');
  input.value = c.titulo;
  $('titulo').hidden = true;
  input.hidden = false;
  input.focus();
  input.select();
}
function terminarRenombrar(guardar) {
  if (!editandoTitulo) return;
  editandoTitulo = false;
  const c = convActual();
  const nuevo = $('titulo-input').value.trim();
  $('titulo-input').hidden = true;
  $('titulo').hidden = false;
  $('titulo').focus();
  if (guardar && c && nuevo && nuevo !== c.titulo) api('POST', ruta(c, 'titulo'), { titulo: nuevo }).catch((e) => toast(e.message));
  renderCabecera();
}
$('titulo').addEventListener('click', empezarRenombrar);
$('titulo-input').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') { ev.preventDefault(); terminarRenombrar(true); }
  else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); terminarRenombrar(false); }
});
$('titulo-input').addEventListener('blur', () => terminarRenombrar(false));

function renderPanel() {
  renderAgentes($('panel-agentes'), {
    sesion: sesionActual(), seleccionado: estado.agente, pasos: estado.pasos,
    onSeleccionar: seleccionarAgente, onVolver: () => { estado.agente = null; renderPanel(); },
    onCerrar: () => document.body.classList.remove('panel-abierto'),
  });
}

function contextoChat() {
  const c = convActual();
  const s = sesionActual();
  return {
    nombreUsuario: 'Tú',
    nodos: s ? s.ordenNodos.map((k) => s.nodos[k]) : [],
    nodosPorId: s?.nodos ?? {},
    vacio: c ? 'Escríbele al orquestador para empezar.' : 'Crea una conversación para empezar.',
    alBloquear: estado.config?.alBloquear ?? 'preguntar',
    verAgente: (id) => { seleccionarAgente(id); document.body.classList.add('panel-abierto'); },
    responderPermiso: (sid, decision) => api('POST', ruta(c, `permisos/${encodeURIComponent(sid)}`), { decision }).catch((e) => toast(e.message)),
    retomar: () => enviar('Continúa donde quedaste.'), // enviar relanza el proceso con --resume
    reintentar: (mensaje) => enviar(mensaje),
    planAcciones: { onAprobar: () => enviar('Apruebo el plan.'), onCambios: () => llenarComposer('Cambios al plan: ') },
    barreraAcciones: { onAprobar: () => enviar('Apruebo, continúa.'), onCambios: () => llenarComposer('Cambios antes de continuar: ') },
  };
}

let renderPendiente = false;
function renderTodo() {
  if (renderPendiente) return;
  renderPendiente = true;
  requestAnimationFrame(() => {
    renderPendiente = false;
    renderCabecera();
    if (!sinSesionVisible) renderChat($('mensajes'), estado.chat, contextoChat());
    renderPanel();
  });
}

// ---------- uso de la conversación (Fable, paralelo y costo ocultable) ----------
function filaUso(nombre, valor, clase, fraccion) {
  const f = el('div', `uso-fila ${clase}`);
  const l = el('div', 'fila');
  l.append(el('span', 'tenue', nombre), el('strong', null, valor));
  const pista = el('div', 'pista');
  const barra = el('div', 'barra');
  barra.style.width = `${Math.min(100, Math.round(fraccion * 100))}%`;
  pista.append(barra);
  f.append(l, pista);
  return f;
}

async function actualizarUso() {
  const c = convActual();
  if (!c?.sessionId) { $('uso').hidden = true; firmaUso = null; return; }
  try {
    const d = await api('GET', `/estado?session=${encodeURIComponent(c.sessionId)}`);
    const fable = d.estado?.fableUsados ?? 0;
    const activos = sesionActual()?.stats.activos ?? 0;
    const visible = verCosto();
    const orquestador = convActual()?.costoUSD ?? 0;
    const agentes = d.estado?.costoUSD ?? 0;
    // Se reconstruye solo si cambió algo: así el botón Mostrar/Ocultar no pierde el foco cada 3 s.
    const firma = JSON.stringify([c.sessionId, fable, activos, d.config.fableMaxPorSesion, d.config.paraleloMax, orquestador, agentes, visible]);
    if (firma === firmaUso && !$('uso').hidden) return;
    firmaUso = firma;
    const teniaFoco = $('uso').contains(document.activeElement);
    const costo = el('div', 'bloque-costo');
    const cab = el('div', 'fila');
    cab.append(el('span', 'tenue', 'Costo estimado'), boton(visible ? 'Ocultar' : 'Mostrar', 'boton-texto', alternarCosto, visible ? 'Ocultar costo' : 'Mostrar costo'));
    const linea = (nombre, usd, clase = '') => {
      const f = el('div', `fila ${clase}`);
      f.append(el('span', 'tenue', nombre), el('strong', null, visible ? formatoCosto(usd) : '••••'));
      return f;
    };
    costo.append(cab, linea('Orquestador', orquestador), linea('Agentes', agentes), linea('Total', orquestador + agentes, 'total'));
    $('uso').replaceChildren(
      el('div', 'versalita tenue', 'Esta conversación'),
      filaUso('Fable usados', `${fable} de ${d.config.fableMaxPorSesion}`, 'm-fable', fable / Math.max(1, d.config.fableMaxPorSesion)),
      filaUso('Agentes en paralelo', `${activos} de ${d.config.paraleloMax}`, 'e-trabajando', activos / Math.max(1, d.config.paraleloMax)),
      costo,
    );
    $('uso').hidden = false;
    if (teniaFoco) $('uso').querySelector('button')?.focus();
  } catch { /* sin datos de uso todavía */ }
}

// ---------- agentes ----------
function seleccionarAgente(id) {
  estado.agente = id;
  estado.pasos = [];
  estado.desde = 0;
  estado.consultaFinal = null;
  renderPanel();
  consultarPasos();
}

// Una consulta a la vez; si mientras tanto cambió el agente o el punto de lectura, la respuesta se descarta.
let pasosEnVuelo = false;
async function consultarPasos() {
  if (pasosEnVuelo) return;
  const c = convActual();
  const agente = estado.agente;
  const desde = estado.desde;
  const n = sesionActual()?.nodos[agente];
  if (!c || !n?.agentId) return;
  const terminado = n.estado !== 'activo';
  pasosEnVuelo = true;
  try {
    const r = await api('GET', `/api/pasos/${encodeURIComponent(c.sessionId)}/${encodeURIComponent(n.agentId)}?desde=${desde}`);
    if (estado.agente !== agente || estado.desde !== desde) return;
    if (r.siguiente < desde) estado.pasos = [];
    estado.pasos.push(...r.pasos);
    estado.desde = r.siguiente;
    if (terminado) estado.consultaFinal = agente; // la lectura posterior al cierre ya está hecha
    renderPanel();
  } catch { /* se reintenta en el próximo ciclo */ } finally { pasosEnVuelo = false; }
}

setInterval(() => {
  const n = sesionActual()?.nodos[estado.agente];
  if (!n) return;
  if (n.estado === 'activo' || estado.consultaFinal !== estado.agente) consultarPasos();
}, 1000);

// ---------- conversaciones ----------
async function cargarConversaciones() {
  estado.conversaciones = await api('GET', '/api/conversaciones');
  renderLista();
}

// recarga: misma conversación tras reconectar el SSE; se conserva el detalle del agente abierto.
async function abrir(id, { recarga = false } = {}) {
  if (!(recarga && id === estado.actual)) {
    estado.agente = null;
    estado.pasos = [];
    estado.desde = 0;
    terminarRenombrar(false);
  }
  estado.actual = id;
  guardarPreferencia('orq-conversacion', id);
  renderLista();
  try {
    const h = await api('GET', `/api/conversaciones/${encodeURIComponent(id)}/historial`);
    if (estado.actual !== id) return;
    estado.chat = desdeHistorial(h);
    const i = estado.conversaciones.findIndex((c) => c.id === id);
    if (i >= 0) estado.conversaciones[i] = h.conversacion;
    if (h.aviso) toast(h.aviso);
    if (h.conversacion.sessionId) mostrarSesion(h.conversacion.sessionId);
  } catch (e) { toast(e.message); }
  firmaUso = null;
  renderTodo();
  actualizarUso();
}

async function enviar(texto) {
  const c = convActual();
  const t = String(texto ?? '').trim();
  if (!c || !t) return;
  try {
    await api('POST', ruta(c, 'mensajes'), { texto: t });
    $('entrada').value = '';
  } catch (e) { toast(e.message); }
}

$('composer').addEventListener('submit', (ev) => { ev.preventDefault(); enviar($('entrada').value); });
$('entrada').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); enviar($('entrada').value); }
});
$('detener').addEventListener('click', () => { const c = convActual(); if (c) api('POST', ruta(c, 'interrumpir'), {}).catch((e) => toast(e.message)); });
$('cerrar-conv').addEventListener('click', () => { const c = convActual(); if (c?.pid) api('POST', ruta(c, 'cerrar'), {}).catch((e) => toast(e.message)); });
$('modo').addEventListener('change', (ev) => { const c = convActual(); if (c) api('POST', ruta(c, 'modo'), { modo: ev.target.value }).catch((e) => toast(e.message)); });

// ---------- nueva conversación ----------
const dialogo = $('dialogo-nueva');
let temporizadorCarpetas = null;
$('nueva').addEventListener('click', () => {
  $('carpeta').value = preferencia('orq-ultima-carpeta', '');
  $('modo-nueva').value = estado.config?.modoPermisoDefecto ?? 'preguntar';
  $('error-nueva').textContent = '';
  dialogo.showModal();
  $('carpeta').focus();
});
$('cancelar-nueva').addEventListener('click', () => dialogo.close());
$('carpeta').addEventListener('input', () => {
  clearTimeout(temporizadorCarpetas);
  temporizadorCarpetas = setTimeout(async () => {
    try {
      const lista = await api('GET', `/api/carpetas?prefijo=${encodeURIComponent($('carpeta').value)}`);
      $('carpetas').replaceChildren(...lista.map((p) => { const o = el('option'); o.value = p; return o; }));
    } catch { /* sin sugerencias */ }
  }, 200);
});
$('form-nueva').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  try {
    const c = await api('POST', '/api/conversaciones', { cwd: $('carpeta').value.trim(), modo: $('modo-nueva').value });
    guardarPreferencia('orq-ultima-carpeta', c.cwd);
    dialogo.close();
    await cargarConversaciones();
    mostrarPestana('chat');
    await abrir(c.id);
    $('entrada').focus();
  } catch (e) { $('error-nueva').textContent = e.message; }
});

// ---------- SSE ----------
function conectar() {
  const fuente = new EventSource('/eventos');
  const conexion = (texto, clase) => { $('conexion').textContent = texto; $('conexion').className = `conexion ${clase}`; };
  fuente.addEventListener('open', () => { inicioConexion(); conexion('En vivo', 'ok'); });
  fuente.addEventListener('error', () => { conexion('Reconectando…', 'error'); api('GET', '/api/conversaciones').catch(() => {}); });
  fuente.addEventListener('evento', (m) => { try { procesarEvento(JSON.parse(m.data)); } catch { /* evento inválido */ } });
  fuente.addEventListener('replay-fin', () => { finReplay(); if (estado.actual) abrir(estado.actual, { recarga: true }); });
  fuente.addEventListener('chat', (m) => {
    let e;
    try { e = JSON.parse(m.data); } catch { return; }
    if (e.tipo === 'chat:estado') {
      const i = estado.conversaciones.findIndex((c) => c.id === e.conversacion);
      if (i >= 0) estado.conversaciones[i] = e.conv; else estado.conversaciones.unshift(e.conv);
      renderLista();
      if (e.conversacion === estado.actual && e.conv.sessionId) mostrarSesion(e.conv.sessionId);
    }
    if (e.conversacion !== estado.actual) return;
    reducirChat(estado.chat, e);
    renderTodo();
    if (e.tipo === 'chat:fin-turno' || e.tipo === 'chat:estado') actualizarUso();
  });
}

alCambiar(() => renderTodo());

async function arrancar() {
  iniciarActividad({ alternarCosto });
  mostrarPestana(preferencia('orq-pestana', 'chat') === 'actividad' ? 'actividad' : 'chat');
  renderTodo();
  try {
    await cargarConversaciones();
    await cargarConfigUI();
    const previa = preferencia('orq-conversacion', null);
    const inicial = estado.conversaciones.find((c) => c.id === previa) ?? estado.conversaciones[0];
    if (inicial) await abrir(inicial.id);
  } catch {
    return; // sin sesión: sinSesion() ya avisó
  }
  conectar();
  setInterval(actualizarUso, 3000);
}

arrancar();
```

- [ ] **Paso 9: correr los tests, la sintaxis y una prueba visual rápida**

Ejecuta:

```bash
node --test
for f in plugins/orquestador/dashboard/public/*.js; do node --check "$f" || exit 1; done
```

Esperado: todo PASS y ningún error de sintaxis. Después levanta el dashboard (`node plugins/orquestador/dashboard/lanzar.mjs`), abre `?demo` en la pestaña Actividad y comprueba a ojo, en 1440 px y en 390 px (herramientas de desarrollo):
- tarjetas con el color de su estado y su chip de modelo;
- tarjeta viajera "Sonnet · medium → Implementador #2";
- eventos con etiquetas de color;
- resumen con costo ocultable, límites, pedido frente a real y leyenda;
- sin scroll horizontal.

- [ ] **Paso 10: commit**

```bash
git add plugins/orquestador/dashboard/public tests/dashboard-server.test.mjs tests/dashboard-css.test.mjs
git commit -m "feat: actividad rediseñada, denegaciones, barreras, renombrar y costo del orquestador"
```

---

### Tarea 12: pestañas Configuración y Agentes

**Archivos:**
- Modificar: `plugins/orquestador/dashboard/public/dom.js` (`interruptor`, `segmentado`, `confirmar`)
- Crear: `plugins/orquestador/dashboard/public/configuracion.js`
- Crear: `plugins/orquestador/dashboard/public/agentes-catalogo.js`
- Modificar: `plugins/orquestador/dashboard/public/index.html` (2 pestañas, 2 vistas y el diálogo de confirmación)
- Modificar: `plugins/orquestador/dashboard/public/app.js` (pestañas, wiring y aviso al salir)
- Modificar: `plugins/orquestador/dashboard/public/tema.css` (componentes de Configuración y Agentes)
- Modificar: `tests/dashboard-server.test.mjs` y `tests/dashboard-css.test.mjs`

**Interfaces:**
- Consume:
  - de la Tarea 9, `GET/POST /api/config`, `/api/automodo`, `/api/automodo/critica`, `/api/automodo/restablecer`, `/api/automodo/fabrica` y todas las rutas `/api/agentes…`;
  - `config-vista.js` y `agentes-vista.js` (Tarea 10);
  - `api()` con `error.datos` (Tarea 11).
- Produce (`dom.js`):
  - `interruptor(etiqueta, marcado, alCambiar(nuevo), { deshabilitado }) → button[role=switch]`;
  - `segmentado(etiqueta, opciones: [valor, texto, clase?][], valor | valor[], alElegir(valor), { multiple, deshabilitado }) → div`;
  - `confirmar({ titulo, texto, aceptar, peligro }) → Promise<boolean>`.

  Los botones llevan `data-foco` para recuperar el foco tras cada render.
- Produce (`configuracion.js`): `iniciarConfiguracion({ api, toast, alGuardar(config) })`, `abrirConfiguracion() → Promise` y `hayCambiosConfig() → boolean`.
- Produce (`agentes-catalogo.js`): `iniciarAgentes({ api, toast, conversacionActual: () => id|null })` y `abrirAgentes() → Promise`.
- Produce (`index.html`): ids `tab-agentes`, `tab-config`, `vista-agentes`, `vista-config`, `dialogo-confirmar`, `confirmar-titulo`, `confirmar-texto` y `confirmar-aceptar`.

- [ ] **Paso 1: actualizar los tests de estructura y CSS**

En `tests/dashboard-server.test.mjs`, test `frontend: …`:
- agrega a la lista de ids `'tab-agentes', 'tab-config', 'vista-agentes', 'vista-config', 'dialogo-confirmar', 'confirmar-titulo', 'confirmar-texto', 'confirmar-aceptar'`;
- agrega a la lista de archivos `'/configuracion.js', '/agentes-catalogo.js'`.

En `tests/dashboard-css.test.mjs`, agrega:

```js
test('tema.css: interruptores, opciones, contadores y botones de quitar con objetivos de 44 px; la tabla de precios se desplaza en su caja', () => {
  const css = leer('tema.css');
  assert.match(css, /\.interruptor\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.segmentado \.opcion\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.boton-contador\s*\{[^}]*height:\s*44px/);
  assert.match(css, /\.quitar\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.config-nav a\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.tabla-desplazable\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(css, /\.pestanas\s*\{[^}]*overflow-x:\s*auto/); // 4 pestañas en 390 px: se desplaza la barra, no la página
});
```

- [ ] **Paso 2: correr los tests y ver que fallan**

Ejecuta: `node --test tests/dashboard-server.test.mjs tests/dashboard-css.test.mjs`
Esperado: FAIL (falta `#tab-agentes`; no existe `.interruptor`).

- [ ] **Paso 3: helpers de DOM**

Agrega al final de `public/dom.js`:

```js
// Interruptor accesible (role="switch"): botón de 44 px; la pista y el pomo se dibujan en CSS.
export function interruptor(etiqueta, marcado, alCambiar, { deshabilitado = false } = {}) {
  const b = boton(null, 'interruptor', () => alCambiar(!marcado), etiqueta);
  b.setAttribute('role', 'switch');
  b.setAttribute('aria-checked', String(!!marcado));
  b.dataset.foco = `sw:${etiqueta}`;
  b.disabled = deshabilitado;
  b.append(el('span', 'pomo'));
  return b;
}

// Botones segmentados: radiogroup (una opción) o grupo de botones con aria-pressed (varias). opciones = [[valor, texto, clase?]].
export function segmentado(etiqueta, opciones, valor, alElegir, { multiple = false, deshabilitado = false } = {}) {
  const g = el('div', 'segmentado');
  g.setAttribute('role', multiple ? 'group' : 'radiogroup');
  g.setAttribute('aria-label', etiqueta);
  for (const [v, texto, clase] of opciones) {
    const marcado = multiple ? valor.includes(v) : v === valor;
    const b = boton(texto, `opcion${clase ? ` ${clase}` : ''}`, () => alElegir(v));
    if (multiple) b.setAttribute('aria-pressed', String(marcado));
    else { b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(marcado)); }
    b.dataset.foco = `${etiqueta}:${v}`;
    b.disabled = deshabilitado;
    g.append(b);
  }
  return g;
}

// Diálogo de confirmación (#dialogo-confirmar). Resuelve true solo si el usuario acepta.
export function confirmar({ titulo, texto, aceptar = 'Confirmar', peligro = false }) {
  const d = document.getElementById('dialogo-confirmar');
  document.getElementById('confirmar-titulo').textContent = titulo;
  document.getElementById('confirmar-texto').textContent = texto;
  const ok = document.getElementById('confirmar-aceptar');
  ok.textContent = aceptar;
  ok.className = peligro ? 'boton-peligro' : 'boton-primario';
  d.returnValue = '';
  return new Promise((resolver) => {
    d.addEventListener('close', () => resolver(d.returnValue === 'si'), { once: true });
    d.showModal();
  });
}
```

- [ ] **Paso 4: estructura en `index.html`**

1. Dentro de `.pestanas`, después de `tab-actividad`, agrega:
   ```html
        <button id="tab-agentes" type="button" role="tab" aria-selected="false">Agentes</button>
        <button id="tab-config" type="button" role="tab" aria-selected="false">Configuración</button>
   ```
2. Después de `</section>` de `vista-actividad` (antes de `</main>`), agrega:
   ```html
    <section id="vista-agentes" class="vista-agentes" role="tabpanel" aria-labelledby="tab-agentes" hidden></section>
    <section id="vista-config" class="vista-config" role="tabpanel" aria-labelledby="tab-config" hidden></section>
   ```
3. Después del `</dialog>` de `dialogo-nueva`, agrega:
   ```html
<dialog id="dialogo-confirmar" aria-labelledby="confirmar-titulo">
  <form method="dialog">
    <h2 id="confirmar-titulo" class="serif"></h2>
    <p id="confirmar-texto"></p>
    <div class="acciones">
      <button id="confirmar-aceptar" value="si" class="boton-primario">Confirmar</button>
      <button value="no" class="boton-secundario">Cancelar</button>
    </div>
  </form>
</dialog>
   ```

- [ ] **Paso 5: crear `configuracion.js`**

```js
// Pestaña Configuración: modo automático, límites, orquestador, rúbrica, visibilidad, precios, Git y dashboard.
// El estado vive en dos formularios puros (config-vista.js): config.json y la sección autoMode de settings.json.
import { el, boton, interruptor, segmentado, confirmar, capitalizar } from './dom.js';
import {
  CLAVES_CONFIG, EJEMPLOS_RUBRICA, MODELOS, ESFUERZOS, LIMITES,
  formularioDesde, reducirFormulario, hayCambios, parcialAGuardar, autoModoDesde,
} from './config-vista.js';

const SECCIONES = [['auto', 'Modo Automático'], ['limites', 'Límites'], ['orquestador', 'Orquestador'], ['rubrica', 'Rúbrica'], ['visibilidad', 'Visibilidad'], ['precios', 'Precios'], ['git', 'Git y Dashboard']];
const CAMPOS_PRECIO = [['entrada', 'Entrada'], ['salida', 'Salida'], ['cacheLectura', 'Lectura de Caché'], ['cacheEscritura', 'Escritura de Caché']];
const TEXTO_LIMITES = [
  ['paraleloMax', 'Agentes en Paralelo', 'Máximo de delegaciones corriendo al mismo tiempo. Las demás esperan en cola.'],
  ['fableMaxPorSesion', 'Fable por Sesión', 'Cuántas delegaciones a Fable se permiten en una misma sesión.'],
  ['conversacionesMax', 'Conversaciones a la Vez', 'Conversaciones del dashboard trabajando al mismo tiempo.'],
];
const MODELOS_OPCIONES = MODELOS.map((m) => [m, capitalizar(m), `m-${m}`]);

let ctx = null;        // { api, toast, alGuardar }
let cfg = null;        // formulario de config.json
let auto = null;       // formulario de autoMode
let datosAuto = null;  // última respuesta de /api/automodo
let fabrica = null;    // etiquetas de las reglas de fábrica (lista plegable)
let critica = null;    // { texto, error } de "Revisar con Claude"
let mensaje = null;    // { clase, texto } tras guardar o fallar
let ocupado = false;

export function iniciarConfiguracion(contexto) { ctx = contexto; }
export const hayCambiosConfig = () => hayCambios(cfg) || hayCambios(auto);

export async function abrirConfiguracion() {
  const raiz = document.getElementById('vista-config');
  if (hayCambiosConfig()) { render(); return; } // al volver a la pestaña no se pisan los cambios sin guardar
  raiz.replaceChildren(el('p', 'tenue', 'Cargando configuración…'));
  try {
    const [config, am] = await Promise.all([ctx.api('GET', '/api/config'), ctx.api('GET', '/api/automodo')]);
    cfg = formularioDesde(config, CLAVES_CONFIG);
    datosAuto = am;
    auto = formularioDesde(autoModoDesde(am));
  } catch (e) {
    raiz.replaceChildren(el('p', 'aviso', `No se pudo cargar la configuración: ${e.message}`));
    return;
  }
  render();
}

function cambiar(cual, accion) {
  if (cual === 'cfg') cfg = reducirFormulario(cfg, accion);
  else auto = reducirFormulario(auto, accion);
  mensaje = null;
  render();
}

const conFoco = (nodo, clave) => { nodo.dataset.foco = clave; return nodo; };
const errorCampo = (f, k) => (f?.errores?.[k] ? el('p', 'error-campo', f.errores[k]) : null);

function render() {
  const raiz = document.getElementById('vista-config');
  if (!cfg || !auto) return;
  const foco = document.activeElement?.dataset?.foco ?? null;
  const nav = el('nav', 'config-nav');
  nav.setAttribute('aria-label', 'Secciones de la configuración');
  for (const [id, titulo] of SECCIONES) { const a = el('a', null, titulo); a.href = `#cfg-${id}`; nav.append(a); }
  const cuerpo = el('div', 'config-cuerpo');
  cuerpo.append(barraCambios(), seccionAuto(), seccionLimites(), seccionOrquestador(), seccionRubrica(), seccionVisibilidad(), seccionPrecios(), seccionGit());
  raiz.replaceChildren(nav, cuerpo);
  if (foco) raiz.querySelector(`[data-foco="${CSS.escape(foco)}"]`)?.focus();
}

// ---------- piezas ----------
function seccion(id, titulo, subtitulo, ...hijos) {
  const s = el('section', 'config-seccion');
  s.id = `cfg-${id}`;
  s.setAttribute('aria-labelledby', `cfg-${id}-titulo`);
  const cab = el('div', 'config-cab');
  const h = el('h2', 'serif', titulo);
  h.id = `cfg-${id}-titulo`;
  cab.append(h);
  if (subtitulo) cab.append(el('span', 'tenue', subtitulo));
  s.append(cab, ...hijos.filter(Boolean));
  return s;
}

function fila(titulo, desc, control, { clave = null, error = null } = {}) {
  const f = el('div', 'config-fila');
  const t = el('div', 'config-texto');
  t.append(el('strong', null, titulo));
  if (desc) t.append(el('span', 'tenue', desc));
  if (clave) t.append(el('code', 'tenue', clave));
  f.append(t, control);
  if (error) f.append(error);
  return f;
}

function campoAgregar(titulo, ayuda, alAgregar, deshabilitado, clave) {
  const f = el('form', 'agregar');
  const input = conFoco(el('input'), `agregar:${clave}`);
  input.type = 'text';
  input.placeholder = ayuda;
  input.setAttribute('aria-label', `Agregar a ${titulo}`);
  input.disabled = deshabilitado;
  const b = el('button', 'boton-secundario', '+ Agregar');
  b.type = 'submit';
  b.disabled = deshabilitado;
  f.append(input, b);
  f.addEventListener('submit', (ev) => { ev.preventDefault(); if (input.value.trim()) alAgregar(input.value); });
  return f;
}

function listaEditable(cual, titulo, valores, ruta, ayuda, { deshabilitado = false, error = null } = {}) {
  const caja = el('div', 'lista-editable');
  caja.append(el('span', 'versalita tenue', titulo));
  const chips = el('div', 'chips');
  for (const v of valores) {
    const chip = el('span', 'chip-valor');
    const quitar = conFoco(boton('×', 'quitar', () => cambiar(cual, { tipo: 'quitar', ruta, valor: v }), `Quitar ${v}`), `quitar:${ruta.join('.')}:${v}`);
    quitar.disabled = deshabilitado;
    chip.append(el('span', 'mono', v), quitar);
    chips.append(chip);
  }
  if (!valores.length) chips.append(el('span', 'tenue', 'Sin configurar'));
  caja.append(chips, campoAgregar(titulo, ayuda, (v) => cambiar(cual, { tipo: 'agregar', ruta, valor: v }), deshabilitado, ruta.join('.')));
  if (error) caja.append(error);
  return caja;
}

function grupoReglas(titulo, desc, clase, reglas, ruta, deshabilitado, error) {
  const g = el('div', `grupo-reglas ${clase}`);
  const cab = el('span', 'fila');
  cab.append(el('span', 'punto'), el('strong', null, titulo));
  const ul = el('ul', 'lista-reglas');
  for (const r of reglas) {
    const li = el('li');
    const q = conFoco(boton('×', 'quitar', () => cambiar('auto', { tipo: 'quitar', ruta, valor: r }), 'Quitar regla'), `quitar:${ruta.join('.')}:${r}`);
    q.disabled = deshabilitado;
    li.append(el('span', null, r), q);
    ul.append(li);
  }
  if (!reglas.length) ul.append(el('li', 'tenue', 'Sin reglas propias.'));
  g.append(cab, el('span', 'tenue', desc), ul,
    campoAgregar(titulo, 'Escribe la regla en lenguaje natural', (v) => cambiar('auto', { tipo: 'agregar', ruta, valor: v }), deshabilitado, ruta.join('.')));
  if (error) g.append(error);
  return g;
}

function campoTexto(titulo, valor, ayuda, alCambiar, { deshabilitado = false, clave, tipo = 'text' } = {}) {
  const l = el('label', 'campo');
  l.append(el('span', 'versalita tenue', titulo));
  const i = conFoco(el('input'), clave);
  i.type = tipo;
  i.value = valor ?? '';
  i.placeholder = ayuda;
  i.disabled = deshabilitado;
  i.addEventListener('change', () => alCambiar(i.value)); // al salir del campo o con Enter: no se pierde el foco al escribir
  l.append(i);
  return l;
}

// ---------- barra de cambios sin guardar ----------
function barraCambios() {
  const b = el('div', 'barra-cambios');
  b.setAttribute('role', 'status');
  if (!hayCambiosConfig()) {
    if (mensaje) { b.classList.add('visible', mensaje.clase); b.append(el('span', 'texto-cambios', mensaje.texto)); }
    return b;
  }
  b.classList.add('visible', 'e-accion');
  const descartar = conFoco(boton('Descartar', 'boton-secundario', () => {
    cfg = reducirFormulario(cfg, { tipo: 'descartar' });
    auto = reducirFormulario(auto, { tipo: 'descartar' });
    mensaje = null;
    render();
  }), 'descartar');
  const guardarB = conFoco(boton(ocupado ? 'Guardando…' : 'Guardar', 'boton-primario', guardar), 'guardar');
  guardarB.disabled = ocupado;
  b.append(el('span', 'punto'), el('span', 'texto-cambios', 'Tienes cambios sin guardar'), descartar, guardarB);
  return b;
}

async function guardar() {
  if (ocupado) return;
  ocupado = true;
  render();
  try {
    let reiniciar = false;
    if (hayCambios(cfg)) {
      try {
        const r = await ctx.api('POST', '/api/config', { parcial: parcialAGuardar(cfg) }); // solo lo cambiado: otra pestaña no se pisa
        cfg = reducirFormulario(cfg, { tipo: 'guardado', datos: r.config });
        reiniciar = r.reiniciar;
        ctx.alGuardar?.(r.config);
      } catch (e) {
        if (e.datos?.errores) cfg = reducirFormulario(cfg, { tipo: 'errores', errores: e.datos.errores });
        throw e;
      }
    }
    if (hayCambios(auto)) {
      try {
        datosAuto = await ctx.api('POST', '/api/automodo', auto.actual);
        auto = reducirFormulario(auto, { tipo: 'guardado', datos: autoModoDesde(datosAuto) });
      } catch (e) {
        if (e.datos?.errores) auto = reducirFormulario(auto, { tipo: 'errores', errores: e.datos.errores });
        throw e;
      }
    }
    mensaje = { clase: 'e-listo', texto: reiniciar ? 'Guardado. El puerto y el modo remoto se aplican al reiniciar el dashboard.' : 'Guardado. Se aplica en la próxima delegación.' };
  } catch (e) {
    mensaje = { clase: 'e-error', texto: e.message };
  } finally {
    ocupado = false;
    render();
  }
}

// ---------- secciones ----------
function seccionAuto() {
  const a = auto.actual;
  const c = cfg.actual;
  const disponible = !!datosAuto?.disponible;
  const bloqueado = !!datosAuto?.errorSettings;
  const n = datosAuto?.conteosFabrica;
  const intro = el('div', 'config-texto');
  intro.append(
    el('span', null, 'El orquestador trabaja solo; un clasificador revisa cada acción antes de ejecutarla.'),
    el('span', 'tenue', 'Lo seguro pasa sin preguntarte. Lo riesgoso se detiene. Las reglas se guardan en la sección autoMode de ~/.claude/settings.json.'),
  );
  const avisos = [];
  if (!disponible) avisos.push(el('p', 'aviso', `Claude Code no respondió a "auto-mode": ${datosAuto?.motivo ?? 'sin respuesta'}. Puedes editar tus reglas, pero no ver las de fábrica ni revisarlas con Claude.`));
  if (bloqueado) avisos.push(el('p', 'aviso', `${datosAuto.errorSettings}. Corrígelo antes de editar el modo automático.`));
  if (datosAuto?.sinFabrica?.length) avisos.push(el('p', 'aviso', `Tus reglas de ${datosAuto.sinFabrica.join(', ')} hoy reemplazan las de fábrica; al guardar desde aquí se vuelven a incluir con "$defaults".`));

  const defectos = el('div', 'config-interruptores');
  defectos.append(
    fila('Por defecto en conversaciones nuevas del dashboard', 'Las conversaciones nuevas empiezan en modo Auto.',
      interruptor('Modo automático por defecto en el dashboard', c.modoPermisoDefecto === 'auto', (v) => cambiar('cfg', { tipo: 'fijar', ruta: ['modoPermisoDefecto'], valor: v ? 'auto' : 'preguntar' }))),
    fila('También en la terminal', 'Escribe permissions.defaultMode: "auto" en ~/.claude/settings.json (con respaldo).',
      interruptor('Modo automático por defecto en la terminal', a.defaultModeTerminal, (v) => cambiar('auto', { tipo: 'fijar', ruta: ['defaultModeTerminal'], valor: v }), { deshabilitado: bloqueado })),
    fila('Clasificar todos los comandos de shell', 'El clasificador revisa también los comandos que parecen de solo lectura.',
      interruptor('Clasificar todos los comandos de shell', a.classifyAllShell, (v) => cambiar('auto', { tipo: 'fijar', ruta: ['classifyAllShell'], valor: v }), { deshabilitado: bloqueado })),
  );

  const niveles = el('div', 'niveles');
  for (const [k, titulo, desc, clase, propias] of [
    ['allow', 'Pasa Solo', 'Leer, editar dentro del repo e instalar las dependencias declaradas.', 'e-listo', a.permitir.length],
    ['soft_deny', 'Se Detiene', 'Acciones riesgosas: borrar fuera del repo, force-push, deploy o tocar credenciales.', 'e-accion', a.detener.length],
    ['hard_deny', 'Nunca', 'Sacar datos sensibles fuera de tu entorno de confianza.', 'e-error', 0],
  ]) {
    const t = el('div', `nivel ${clase}`);
    const cab = el('span', 'fila');
    cab.append(el('strong', 'cantidad', n ? String(n[k]) : '—'), el('span', 'versalita', titulo));
    t.append(cab, el('span', 'tenue', desc));
    if (propias) t.append(el('span', 'tenue', `+ ${propias} ${propias === 1 ? 'tuya' : 'tuyas'}`));
    niveles.append(t);
  }

  const alBloquear = fila('Cuando el clasificador detiene una acción', 'Las acciones de bloqueo absoluto se deniegan siempre, elijas lo que elijas.',
    segmentado('Cuando se detiene una acción', [['preguntar', 'Preguntarme en el Chat'], ['denegar', 'Denegar y Buscar Otra Vía']], c.alBloquear,
      (v) => cambiar('cfg', { tipo: 'fijar', ruta: ['alBloquear'], valor: v })));

  const entorno = el('div', 'entorno');
  entorno.append(...[
    listaEditable('auto', 'Repos', a.entorno.repos, ['entorno', 'repos'], 'github.com/tu-usuario/*', { deshabilitado: bloqueado, error: errorCampo(auto, 'repos') }),
    listaEditable('auto', 'Dominios', a.entorno.dominios, ['entorno', 'dominios'], 'tu-dominio.com', { deshabilitado: bloqueado, error: errorCampo(auto, 'dominios') }),
    campoTexto('Organización', a.entorno.organizacion, 'Sin configurar', (v) => cambiar('auto', { tipo: 'fijar', ruta: ['entorno', 'organizacion'], valor: v }), { deshabilitado: bloqueado, clave: 'organizacion' }),
    errorCampo(auto, 'organizacion'),
  ].filter(Boolean)); // append(null) insertaría el texto "null"
  const otras = datosAuto?.personalizadas?.otrasEntorno ?? [];
  if (otras.length) {
    const p = el('p', 'tenue');
    p.append(el('strong', null, 'Otras entradas (se conservan tal cual): '), document.createTextNode(otras.join(' · ')));
    entorno.append(p);
  }

  const reglas = el('div', 'reglas');
  reglas.append(
    grupoReglas('Permitir Siempre', 'Excepciones tuyas que el clasificador debe dejar pasar.', 'e-listo', a.permitir, ['permitir'], bloqueado, errorCampo(auto, 'permitir')),
    grupoReglas('Detener Siempre', 'Cosas que quieres revisar tú aunque parezcan seguras.', 'e-accion', a.detener, ['detener'], bloqueado, errorCampo(auto, 'detener')),
  );

  const acciones = el('div', 'acciones');
  const revisar = conFoco(boton('Revisar mis Reglas con Claude', 'boton-secundario', revisarConClaude), 'revisar');
  revisar.disabled = !disponible || bloqueado || ocupado;
  const total = n ? n.allow + n.soft_deny + n.hard_deny : null;
  const verFabrica = conFoco(boton(fabrica ? 'Ocultar Reglas de Fábrica' : total ? `Ver las ${total} Reglas de Fábrica` : 'Ver Reglas de Fábrica', 'boton-secundario', alternarFabrica), 'fabrica');
  verFabrica.disabled = !disponible;
  const restablecer = conFoco(boton('Restablecer de Fábrica', 'boton-peligro', restablecerAuto), 'restablecer');
  restablecer.disabled = !disponible || bloqueado || ocupado;
  acciones.append(revisar, verFabrica, restablecer);

  return seccion('auto', 'Modo Automático', null, intro, ...avisos, defectos, niveles, alBloquear,
    fila('Tu entorno de confianza', 'Le dice al clasificador qué repos y dominios son tuyos, para que no los trate como destinos externos.', entorno),
    reglas, acciones, el('p', 'tenue aviso-uso', '"Revisar con Claude" gasta uso de tu plan y revisa las reglas guardadas.'),
    critica ? panelCritica() : null, fabrica ? panelFabrica() : null);
}

async function revisarConClaude() {
  const ok = await confirmar({
    titulo: 'Revisar tus reglas con Claude',
    texto: 'Esto ejecuta "claude auto-mode critique" sobre las reglas guardadas y gasta uso de tu plan. Puede tardar hasta 2 minutos.',
    aceptar: 'Revisar',
  });
  if (!ok) return;
  ocupado = true;
  critica = { texto: 'Claude está revisando tus reglas…', error: false };
  render();
  try { critica = { texto: (await ctx.api('POST', '/api/automodo/critica', {})).texto, error: false }; } catch (e) { critica = { texto: e.message, error: true }; }
  finally { ocupado = false; render(); }
}

async function restablecerAuto() {
  const ok = await confirmar({
    titulo: 'Restablecer el modo automático',
    texto: 'Se borra la sección autoMode de ~/.claude/settings.json; queda un respaldo en settings.json.orquestador.bak. Tus reglas propias se pierden.',
    aceptar: 'Restablecer', peligro: true,
  });
  if (!ok) return;
  ocupado = true;
  render();
  try {
    datosAuto = await ctx.api('POST', '/api/automodo/restablecer', { confirmar: true });
    auto = formularioDesde(autoModoDesde(datosAuto));
    mensaje = { clase: 'e-listo', texto: 'Modo automático restablecido de fábrica.' };
  } catch (e) { mensaje = { clase: 'e-error', texto: e.message }; }
  finally { ocupado = false; render(); }
}

async function alternarFabrica() {
  if (fabrica) { fabrica = null; render(); return; }
  try { fabrica = await ctx.api('GET', '/api/automodo/fabrica'); } catch (e) { mensaje = { clase: 'e-error', texto: e.message }; }
  render();
}

function panelFabrica() {
  const d = el('div', 'panel-fabrica');
  for (const [k, titulo, clase] of [['allow', 'Pasa Solo', 'e-listo'], ['soft_deny', 'Se Detiene', 'e-accion'], ['hard_deny', 'Nunca', 'e-error']]) {
    const det = el('details', clase);
    det.append(el('summary', null, `${titulo} (${fabrica[k].length})`));
    const ul = el('ul');
    for (const r of fabrica[k]) ul.append(el('li', null, r));
    det.append(ul);
    d.append(det);
  }
  return d;
}

function panelCritica() {
  const d = el('div', `panel-critica${critica.error ? ' e-error' : ''}`);
  d.setAttribute('aria-live', 'polite');
  d.append(el('strong', null, 'Opinión de Claude sobre tus reglas'), el('div', 'texto', critica.texto));
  return d;
}

function seccionLimites() {
  const filas = TEXTO_LIMITES.map(([k, titulo, desc]) => {
    const [min, max] = LIMITES[k];
    const v = cfg.actual[k];
    const ctl = el('div', 'contador');
    const menos = conFoco(boton('−', 'boton-contador', () => cambiar('cfg', { tipo: 'sumar', ruta: [k], delta: -1 }), `Bajar ${titulo.toLowerCase()}`), `${k}:-`);
    const mas = conFoco(boton('+', 'boton-contador', () => cambiar('cfg', { tipo: 'sumar', ruta: [k], delta: 1 }), `Subir ${titulo.toLowerCase()}`), `${k}:+`);
    menos.disabled = v <= min;
    mas.disabled = v >= max;
    ctl.append(menos, el('output', 'valor', String(v)), mas);
    return fila(titulo, desc, ctl, { clave: k, error: errorCampo(cfg, k) });
  });
  return seccion('limites', 'Límites', null, ...filas);
}

function seccionOrquestador() {
  const c = cfg.actual;
  return seccion('orquestador', 'Orquestador', null,
    fila('Modelos permitidos para el orquestador', 'Si la sesión principal corre con otro modelo, la status line te avisa.',
      segmentado('Modelos permitidos', MODELOS_OPCIONES, c.modelosOrquestador,
        (m) => cambiar('cfg', { tipo: 'alternar', ruta: ['modelosOrquestador'], valor: m, minimo: 1, orden: MODELOS }), { multiple: true }),
      { error: errorCampo(cfg, 'modelosOrquestador') }),
    fila('Permisos por defecto en conversaciones nuevas', 'Se puede cambiar en cada conversación desde el chat.',
      segmentado('Permisos por defecto', [['preguntar', 'Preguntar'], ['ediciones', 'Aceptar Ediciones'], ['auto', 'Auto']], c.modoPermisoDefecto,
        (v) => cambiar('cfg', { tipo: 'fijar', ruta: ['modoPermisoDefecto'], valor: v }))),
  );
}

function seccionRubrica() {
  const filas = cfg.actual.rubrica.map((r, i) => {
    const f = el('div', 'fila-rubrica');
    const t = el('div', 'config-texto');
    t.append(el('strong', null, r.clase), el('span', 'tenue', EJEMPLOS_RUBRICA[r.clase] ?? ''));
    f.append(t,
      segmentado(`Modelo para ${r.clase}`, MODELOS_OPCIONES, r.modelo, (m) => cambiar('cfg', { tipo: 'fijar', ruta: ['rubrica', i, 'modelo'], valor: m })),
      segmentado(`Esfuerzo para ${r.clase}`, ESFUERZOS.map((e) => [e, e]), r.esfuerzo, (e) => cambiar('cfg', { tipo: 'fijar', ruta: ['rubrica', i, 'esfuerzo'], valor: e })));
    return f;
  });
  const nota = el('p', 'tenue nota');
  nota.append(el('span', 'punto m-fable'), document.createTextNode('Fable solo se usa si se cumplen dos condiciones de máxima consecuencia, y nunca más allá del tope por sesión.'));
  return seccion('rubrica', 'Rúbrica de Ruteo', 'Qué modelo y esfuerzo usa el orquestador según la clase de tarea. Si difiere de la de fábrica, se le entrega al iniciar cada sesión.',
    ...filas, errorCampo(cfg, 'rubrica'), nota);
}

function seccionVisibilidad() {
  const c = cfg.actual;
  return seccion('visibilidad', 'Visibilidad', null,
    fila('Mostrar costo', 'Muestra el costo estimado en el dashboard y en la status line de la terminal.',
      interruptor('Mostrar costo', c.mostrarCosto, (v) => cambiar('cfg', { tipo: 'fijar', ruta: ['mostrarCosto'], valor: v }))),
    fila('Alertas de modelo', 'Avisa en la terminal cuando un agente corre con un modelo distinto al pedido. La alerta se registra igual.',
      interruptor('Alertas de modelo', c.alertasModelo, (v) => cambiar('cfg', { tipo: 'fijar', ruta: ['alertasModelo'], valor: v }))),
  );
}

function seccionPrecios() {
  const cab = el('tr');
  for (const t of ['Modelo', ...CAMPOS_PRECIO.map(([, x]) => x)]) { const th = el('th', null, t); th.setAttribute('scope', 'col'); cab.append(th); }
  const thead = el('thead');
  thead.append(cab);
  const tbody = el('tbody');
  for (const m of MODELOS) {
    const tr = el('tr');
    const th = el('th', `m-${m}`);
    th.setAttribute('scope', 'row');
    th.append(el('span', 'punto'), document.createTextNode(` ${capitalizar(m)}`));
    tr.append(th);
    for (const [k, t] of CAMPOS_PRECIO) {
      const td = el('td');
      const i = conFoco(el('input'), `precio:${m}:${k}`);
      i.type = 'number';
      i.min = '0';
      i.step = 'any';
      i.value = String(cfg.actual.precios?.[m]?.[k] ?? '');
      i.setAttribute('aria-label', `${t} de ${capitalizar(m)}`);
      i.addEventListener('change', () => cambiar('cfg', { tipo: 'fijar', ruta: ['precios', m, k], valor: Number(i.value) }));
      td.append(i);
      tr.append(td);
    }
    tbody.append(tr);
  }
  const tabla = el('table', 'tabla-precios');
  tabla.append(thead, tbody);
  const caja = el('div', 'tabla-desplazable');
  caja.append(tabla);
  return seccion('precios', 'Precios', 'USD por millón de tokens · solo para estimar el costo', caja, errorCampo(cfg, 'precios'));
}

function seccionGit() {
  const c = cfg.actual;
  const remoto = c.remoto ?? { activo: false, escuchar: '127.0.0.1', hostsPermitidos: [] };
  return seccion('git', 'Git y Dashboard', null,
    fila('Ramas protegidas', 'Nadie hace push directo ni force-push a estas ramas.',
      listaEditable('cfg', 'Ramas', c.ramasProtegidas, ['ramasProtegidas'], 'develop'), { error: errorCampo(cfg, 'ramasProtegidas') }),
    fila('Puerto del dashboard', 'Requiere reiniciar el dashboard.',
      campoTexto('Puerto', String(c.puertoDashboard ?? ''), '4321', (v) => cambiar('cfg', { tipo: 'fijar', ruta: ['puertoDashboard'], valor: Number.parseInt(v, 10) }), { clave: 'puerto', tipo: 'number' }),
      { error: errorCampo(cfg, 'puertoDashboard') }),
    fila('Modo remoto', 'Abre el dashboard desde otro equipo por una red privada como Tailscale. El enlace con token equivale a una contraseña. Requiere reiniciar el dashboard.',
      interruptor('Modo remoto', remoto.activo, (v) => cambiar('cfg', { tipo: 'fijar', ruta: ['remoto', 'activo'], valor: v }))),
    remoto.activo ? campoTexto('Escuchar en (IP de la red privada)', remoto.escuchar, '100.x.y.z', (v) => cambiar('cfg', { tipo: 'fijar', ruta: ['remoto', 'escuchar'], valor: v.trim() }), { clave: 'escuchar' }) : null,
    remoto.activo ? listaEditable('cfg', 'Hosts permitidos', remoto.hostsPermitidos, ['remoto', 'hostsPermitidos'], 'mi-pc.tailnet.ts.net') : null,
    errorCampo(cfg, 'remoto'),
  );
}
```

- [ ] **Paso 6: crear `agentes-catalogo.js`**

```js
// Pestaña Agentes: catálogo por packs con interruptores, detalle con el prompt completo y formulario de agentes personalizados.
import { el, boton, interruptor, segmentado, confirmar, chipModelo } from './dom.js';
import {
  TEXTO_ESTADO, HERRAMIENTAS_FORM, MODELOS_AGENTE, ESFUERZOS_AGENTE, SECCIONES_FORM,
  filtrarAgentes, estadoPack, formularioVacio, desdeDetalle, alternarHerramienta, herramientaMarcada, cuerpoFormulario, rutaArchivo,
} from './agentes-vista.js';

let ctx = null;              // { api, toast, conversacionActual }
let datos = null;            // GET /api/agentes
let filtro = '';
let detalle = null;          // GET /api/agentes/:origen/:id
let form = formularioVacio();
let errorForm = null;
let redactando = false;
let guardando = false;

export function iniciarAgentes(contexto) { ctx = contexto; }

const consulta = () => { const c = ctx.conversacionActual(); return c ? `?conversacion=${encodeURIComponent(c)}` : ''; };
const conFoco = (nodo, clave) => { nodo.dataset.foco = clave; return nodo; };

export async function abrirAgentes() {
  try { datos = await ctx.api('GET', `/api/agentes${consulta()}`); } catch (e) { ctx.toast(e.message); }
  render();
}

function render() {
  const raiz = document.getElementById('vista-agentes');
  const foco = document.activeElement?.dataset?.foco ?? null;
  const catalogo = el('section', 'catalogo');
  catalogo.setAttribute('aria-label', 'Catálogo de agentes');
  const buscador = el('label', 'buscador');
  const input = conFoco(el('input'), 'filtro');
  input.type = 'search';
  input.placeholder = 'Filtrar por nombre, id o uso…';
  input.value = filtro;
  buscador.append(el('span', 'sr', 'Filtrar agentes'), input);
  const lista = el('div', 'catalogo-lista');
  input.addEventListener('input', () => { filtro = input.value; renderLista(lista); }); // solo la lista: el campo no pierde el foco
  catalogo.append(el('h2', 'serif', 'Agentes Disponibles'), el('p', 'tenue', 'Los agentes activados quedan en ~/.claude/agents/. Disponible en sesiones nuevas.'), buscador, lista);
  renderLista(lista);
  const panel = el('section', 'panel-agente');
  panel.setAttribute('aria-label', detalle ? 'Detalle del agente' : 'Nuevo agente');
  panel.append(detalle ? vistaDetalle() : vistaFormulario());
  raiz.replaceChildren(catalogo, panel);
  if (foco) raiz.querySelector(`[data-foco="${CSS.escape(foco)}"]`)?.focus();
}

// ---------- catálogo ----------
function renderLista(contenedor) {
  if (!datos) { contenedor.replaceChildren(el('p', 'tenue', 'Cargando agentes…')); return; }
  const d = filtrarAgentes(datos, filtro);
  const hijos = [];
  if (filtro && !d.packs.length) hijos.push(el('p', 'tenue', 'Ningún agente del catálogo coincide con el filtro.'));
  for (const p of d.packs) hijos.push(grupoPack(p));
  hijos.push(
    grupoSimple('Personalizados', '~/.claude/agents/ y .claude/agents/ del proyecto abierto', d.personalizados.map((a) => tarjetaAgente(a, a.alcance)), 'Aún no tienes agentes personalizados. Crea uno con el formulario.'),
    grupoSimple('Del Plugin', 'plugins/orquestador/agents/', d.plugin.map((a) => tarjetaAgente(a, 'plugin'))),
    grupoSimple('Integrados de Claude Code', 'Prompt de Anthropic, no visible', d.integrados.map((a) => tarjetaAgente(a, 'integrado'))),
  );
  contenedor.replaceChildren(...hijos);
}

function grupoPack(p) {
  const g = el('section', 'grupo-agentes');
  g.setAttribute('aria-label', `Pack ${p.nombre}`);
  const cab = el('div', 'grupo-cab');
  const t = el('div', 'config-texto');
  t.append(el('h3', 'serif', p.nombre), el('span', 'tenue', p.descripcion));
  const estado = estadoPack(p);
  const sw = interruptor(`Activar pack ${p.nombre}`, estado === 'true', (v) => cambiarPack(p, v));
  sw.setAttribute('aria-checked', estado); // "mixed" si solo algunos están activos
  const ctl = el('div', 'fila');
  ctl.append(el('span', 'tenue contador-pack', `${p.activos}/${p.total}`), el('span', 'tenue', 'Activar pack'), sw);
  cab.append(t, ctl);
  const rejilla = el('div', 'rejilla-agentes');
  for (const a of p.agentes) rejilla.append(tarjetaAgente(a, 'catalogo'));
  g.append(cab, rejilla);
  return g;
}

function grupoSimple(titulo, ruta, tarjetas, vacio = null) {
  const g = el('section', 'grupo-agentes');
  g.setAttribute('aria-label', titulo);
  const cab = el('div', 'grupo-cab');
  const t = el('div', 'config-texto');
  t.append(el('h3', 'serif', titulo), el('span', 'tenue mono', ruta));
  cab.append(t);
  const rejilla = el('div', 'rejilla-agentes');
  rejilla.append(...tarjetas);
  g.append(cab, tarjetas.length || !vacio ? rejilla : el('p', 'tenue', vacio));
  return g;
}

// La tarjeta no anida botones: "abrir" es un botón y el interruptor es otro, hermanos dentro de un <article>.
function tarjetaAgente(a, origen) {
  const art = el('article', `tarjeta-catalogo${detalle?.id === a.id && detalle?.origen === origen ? ' seleccionada' : ''}`);
  const abrir = conFoco(boton(null, 'abrir-agente', () => verDetalle(origen, a.id)), `ver:${origen}:${a.id}`);
  const cab = el('span', 'fila');
  const nombres = el('span', 'nombres');
  nombres.append(el('strong', null, a.nombre ?? a.id), el('span', 'mono tenue', a.id));
  cab.append(el('span', 'inicial', (a.nombre ?? a.id).charAt(0).toUpperCase()), nombres, chipModelo(a.model, a.effort));
  const pie = el('span', 'fila tenue');
  pie.append(el('span', 'mono', a.tools ?? ''), el('span', null, 'Ver prompt →'));
  abrir.append(cab, el('span', 'desc', a.description ?? ''), pie);
  art.append(abrir);
  if (origen === 'catalogo') {
    const fila = el('div', 'fila estado-agente');
    fila.append(el('span', `estado-${a.estado}`, TEXTO_ESTADO[a.estado] ?? a.estado));
    if (a.estado === 'actualizable') fila.append(boton('Actualizar', 'boton-texto', () => cambiarAgente(a, true)));
    fila.append(interruptor(`Activar ${a.nombre}`, a.estado === 'activo' || a.estado === 'actualizable', (v) => cambiarAgente(a, v), { deshabilitado: a.estado === 'conflicto' }));
    art.append(fila);
  } else if (a.alcance) {
    art.append(el('span', 'tenue', a.alcance === 'proyecto' ? 'Solo este repo' : 'Todos mis proyectos'));
  }
  return art;
}

async function cambiarAgente(a, activo) {
  try {
    await ctx.api('POST', `/api/agentes/catalogo/${encodeURIComponent(a.id)}`, { activo });
    ctx.toast(activo ? `${a.nombre} activado. Disponible en sesiones nuevas.` : `${a.nombre} desactivado.`);
  } catch (e) { ctx.toast(e.message); }
  await abrirAgentes();
}

async function cambiarPack(p, activo) {
  try {
    const r = await ctx.api('POST', `/api/agentes/packs/${encodeURIComponent(p.id)}`, { activo });
    const fallidos = r.resultados.filter((x) => !x.ok);
    ctx.toast(fallidos.length ? `${p.nombre}: ${fallidos.map((x) => x.error).join(' · ')}` : `${p.nombre} ${activo ? 'activado' : 'desactivado'}. Disponible en sesiones nuevas.`);
  } catch (e) { ctx.toast(e.message); }
  await abrirAgentes();
}

async function verDetalle(origen, id) {
  try { detalle = await ctx.api('GET', `/api/agentes/${encodeURIComponent(origen)}/${encodeURIComponent(id)}${consulta()}`); } catch (e) { ctx.toast(e.message); return; }
  render();
  document.querySelector('.panel-agente')?.scrollIntoView({ block: 'nearest' });
}

// ---------- detalle ----------
function vistaDetalle() {
  const d = detalle;
  const c = el('div', 'detalle-catalogo');
  const nuevo = conFoco(boton('Nuevo Agente', 'boton-secundario', () => { detalle = null; form = formularioVacio(); errorForm = null; render(); }), 'nuevo');
  const cab = el('div', 'fila');
  const nombres = el('span', 'nombres');
  nombres.append(el('h2', 'serif', d.nombre ?? d.id), el('span', 'mono tenue ruta-archivo', d.archivo ?? ''));
  cab.append(el('span', 'inicial grande', (d.nombre ?? d.id).charAt(0).toUpperCase()), nombres);
  const datosG = el('div', 'datos');
  const dato = (k, v) => { const x = el('div', 'dato'); x.append(el('span', 'versalita tenue', k), v); return x; };
  datosG.append(dato('Modelo', chipModelo(d.model, d.effort)), dato('Herramientas', el('span', 'mono', d.tools ?? '—')));
  if (d.estado) datosG.append(dato('Estado', el('span', `estado-${d.estado}`, TEXTO_ESTADO[d.estado] ?? d.estado)));
  const cuando = el('div', 'bloque');
  cuando.append(el('span', 'versalita tenue', 'Cuándo lo usa el orquestador'), el('p', null, d.description ?? ''));
  const prompt = el('div', 'bloque');
  prompt.append(el('span', 'versalita tenue', 'Prompt del agente'), d.prompt ? el('pre', 'prompt', d.prompt) : el('p', 'tenue', d.aviso ?? 'Sin prompt visible.'));
  const acciones = el('div', 'acciones');
  acciones.append(boton('Duplicar como Personalizado', 'boton-secundario', () => { form = desdeDetalle(d, { duplicar: true }); detalle = null; errorForm = null; render(); }));
  if (d.editable) {
    acciones.append(
      boton('Editar', 'boton-secundario', () => { form = desdeDetalle(d); detalle = null; errorForm = null; render(); }),
      boton('Eliminar', 'boton-peligro', () => eliminar(d)),
    );
  }
  c.append(nuevo, cab, datosG, cuando, prompt, acciones);
  return c;
}

async function eliminar(d) {
  const ok = await confirmar({ titulo: `Eliminar ${d.nombre}`, texto: `Se borra ${d.archivo} (queda un respaldo .bak). Esta acción no se deshace desde el dashboard.`, aceptar: 'Eliminar', peligro: true });
  if (!ok) return;
  try {
    await ctx.api('POST', `/api/agentes/personalizados/${encodeURIComponent(d.id)}/eliminar`, { confirmar: true, alcance: d.alcance, conversacion: ctx.conversacionActual() });
    ctx.toast(`${d.nombre} eliminado.`);
    detalle = null;
    form = formularioVacio();
  } catch (e) { ctx.toast(e.message); }
  await abrirAgentes();
}

// ---------- formulario ----------
function campoForm(id, titulo, valor, ayuda, alEscribir, { multilinea = false, filas = 2, deshabilitado = false } = {}) {
  const w = el('div', 'campo');
  const l = el('label', 'versalita tenue', titulo);
  l.htmlFor = `agente-${id}`;
  const i = conFoco(el(multilinea ? 'textarea' : 'input'), `form:${id}`);
  i.id = `agente-${id}`;
  if (multilinea) i.rows = filas; else i.type = 'text';
  i.value = valor ?? '';
  i.placeholder = ayuda;
  i.disabled = deshabilitado;
  i.addEventListener('input', () => alEscribir(i.value)); // sin re-render: el foco y el cursor no se pierden
  w.append(l, i);
  if (form.errores?.[id]) w.append(el('p', 'error-campo', form.errores[id]));
  return w;
}

function grupoForm(titulo, control, clave) {
  const w = el('div', 'campo');
  w.append(el('span', 'versalita tenue', titulo), control);
  if (form.errores?.[clave]) w.append(el('p', 'error-campo', form.errores[clave]));
  return w;
}

function vistaFormulario() {
  const f = el('form', 'form-agente');
  f.noValidate = true;
  f.append(el('h2', 'serif', form.editando ? `Editar ${form.nombre}` : 'Nuevo Agente'));
  if (errorForm) f.append(el('p', 'aviso e-error', errorForm));
  const ruta = el('span', 'tenue mono ruta-archivo', `Archivo: ${rutaArchivo(form)}`);
  const nombre = campoForm('nombre', 'Nombre', form.nombre, 'Investigador RL', (v) => { form = { ...form, nombre: v }; ruta.textContent = `Archivo: ${rutaArchivo(form)}`; }, { deshabilitado: !!form.editando });
  nombre.append(ruta);
  const cuando = campoForm('descripcion', 'Cuándo Usarlo', form.descripcion, 'Diseña experimentos de RL y ablations. Úsalo para planificar, no para implementar.',
    (v) => { form = { ...form, descripcion: v }; }, { multilinea: true });
  cuando.append(el('span', 'tenue', 'El orquestador lee esta descripción para decidir cuándo delegarle.'));
  const modelo = grupoForm('Modelo', segmentado('Modelo', MODELOS_AGENTE.map(([m, t]) => [m, t, `m-${m === 'inherit' ? 'heredado' : m}`]), form.modelo, (m) => { form = { ...form, modelo: m }; render(); }), 'modelo');
  const esfuerzo = grupoForm('Esfuerzo', segmentado('Esfuerzo', ESFUERZOS_AGENTE.map((e) => [e, e]), form.esfuerzo, (e) => { form = { ...form, esfuerzo: e }; render(); }), 'esfuerzo');
  const marcadas = HERRAMIENTAS_FORM.filter(([e]) => herramientaMarcada(form, e)).map(([e]) => e);
  const herramientas = grupoForm('Herramientas', segmentado('Herramientas', HERRAMIENTAS_FORM.map(([e]) => [e, e]), marcadas, (e) => { form = alternarHerramienta(form, e); render(); }, { multiple: true }), 'herramientas');
  const hayConversacion = !!ctx.conversacionActual();
  const alcance = grupoForm('Disponible En', segmentado('Alcance', [['usuario', 'Todos mis proyectos'], ['proyecto', 'Solo este repo']], form.alcance,
    (a) => { form = { ...form, alcance: a }; render(); }, { deshabilitado: !!form.editando }), 'alcance');
  if (!hayConversacion) alcance.append(el('span', 'tenue', '"Solo este repo" usa la carpeta de la conversación abierta.'));

  const cabPrompt = el('div', 'fila cab-prompt');
  const tp = el('div', 'config-texto');
  tp.append(el('strong', null, 'Prompt del Agente'), el('span', 'tenue', 'Es lo que define cómo trabaja. Sigue la plantilla del protocolo de delegación.'));
  const red = conFoco(boton(redactando ? 'Redactando…' : 'Redactar con Claude', 'boton-secundario', redactar), 'redactar');
  red.disabled = redactando;
  const redCaja = el('div', 'redactar');
  redCaja.append(red, el('span', 'tenue', 'Gasta uso de tu plan (Sonnet, hasta 90 s).'));
  cabPrompt.append(tp, redCaja);
  const secciones = SECCIONES_FORM.map(([k, titulo, ayuda, filas]) => campoForm(k, titulo, form.secciones[k], ayuda,
    (v) => { form = { ...form, secciones: { ...form.secciones, [k]: v } }; }, { multilinea: true, filas }));

  const acciones = el('div', 'acciones');
  const cancelar = boton('Cancelar', 'boton-secundario', () => { form = formularioVacio(); errorForm = null; render(); });
  const crear = el('button', 'boton-primario', guardando ? 'Guardando…' : form.editando ? 'Guardar Cambios' : 'Crear Agente');
  crear.type = 'submit';
  crear.disabled = guardando || redactando;
  acciones.append(cancelar, crear);
  f.append(nombre, cuando, modelo, esfuerzo, herramientas, alcance, cabPrompt, ...secciones, acciones);
  f.addEventListener('submit', (ev) => { ev.preventDefault(); guardarAgente(); });
  return f;
}

async function redactar() {
  if (!form.nombre.trim() || !form.descripcion.trim()) { errorForm = 'Escribe el nombre y cuándo usarlo antes de redactar.'; render(); return; }
  redactando = true;
  errorForm = null;
  render();
  try {
    const s = await ctx.api('POST', '/api/agentes/redactar', { nombre: form.nombre, descripcion: form.descripcion, modelo: form.modelo, herramientas: form.herramientas });
    form = { ...form, secciones: { ...s } };
  } catch (e) {
    errorForm = `No se pudo redactar: ${e.message}. Los campos quedaron como estaban.`;
  } finally { redactando = false; render(); }
}

async function guardarAgente() {
  if (guardando) return;
  guardando = true;
  errorForm = null;
  form = { ...form, errores: {} };
  render();
  try {
    const cuerpo = cuerpoFormulario(form, ctx.conversacionActual());
    const d = form.editando
      ? await ctx.api('POST', `/api/agentes/personalizados/${encodeURIComponent(form.editando)}`, cuerpo)
      : await ctx.api('POST', '/api/agentes/personalizados', cuerpo);
    ctx.toast(`${d.nombre} guardado. Disponible en sesiones nuevas.`);
    detalle = d;
    form = formularioVacio();
  } catch (e) {
    errorForm = e.message;
    if (e.datos?.errores) form = { ...form, errores: e.datos.errores };
  } finally { guardando = false; }
  await abrirAgentes();
}
```

- [ ] **Paso 7: estilos en `tema.css`**

Agrega antes del bloque `/* Diálogo y toast */`:

```css
/* ---------- Entrega 2: controles compartidos ---------- */
.interruptor { position: relative; flex: none; width: 56px; min-height: 44px; padding: 0; border: 0; background: transparent; cursor: pointer; }
.interruptor::before { content: ""; position: absolute; left: 4px; right: 4px; top: 50%; height: 26px; transform: translateY(-50%); border-radius: 13px; background: var(--pista); transition: background .2s; }
.interruptor .pomo { position: absolute; top: 50%; left: 8px; width: 18px; height: 18px; transform: translateY(-50%); border-radius: 50%; background: var(--tarjeta); box-shadow: 0 1px 3px rgba(0, 0, 0, .4); transition: left .2s; }
.interruptor[aria-checked="true"]::before { background: var(--listo); }
.interruptor[aria-checked="true"] .pomo { left: 30px; }
.interruptor[aria-checked="mixed"]::before { background: color-mix(in srgb, var(--listo) 45%, var(--pista)); }
.interruptor[aria-checked="mixed"] .pomo { left: 19px; }
.segmentado { display: flex; flex-wrap: wrap; gap: 6px; }
.segmentado .opcion { --c: var(--activo); min-height: 44px; min-width: 44px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--borde-fuerte); background: transparent; color: var(--texto-2); cursor: pointer; font-size: 13px; }
.segmentado .opcion.m-haiku { --c: var(--haiku); } .segmentado .opcion.m-sonnet { --c: var(--sonnet); }
.segmentado .opcion.m-opus { --c: var(--opus); } .segmentado .opcion.m-fable { --c: var(--fable); } .segmentado .opcion.m-heredado { --c: var(--heredado); }
.segmentado .opcion[aria-checked="true"], .segmentado .opcion[aria-pressed="true"] { border: 1.5px solid var(--c); background: color-mix(in srgb, var(--c) 18%, transparent); color: var(--c); font-weight: 600; }
.barra-cambios { position: sticky; top: 0; z-index: 4; display: none; align-items: center; flex-wrap: wrap; gap: 8px 12px; padding: 8px 14px; border-radius: 12px; border: 1px solid var(--c, var(--borde-fuerte)); background: color-mix(in srgb, var(--c, var(--tarjeta)) 14%, var(--fondo)); }
.barra-cambios.visible { display: flex; }
.barra-cambios .texto-cambios { flex: 1 1 200px; font-weight: 600; color: var(--c, var(--texto)); }
.error-campo { margin: 0; color: var(--error); font-size: 12.5px; }

/* ---------- Configuración ---------- */
.vista-config, .vista-agentes { flex: 1; min-height: 0; overflow-y: auto; }
.vista-config { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 24px; padding: 20px 24px 48px; align-items: start; }
.config-nav { position: sticky; top: 0; display: flex; flex-direction: column; gap: 2px; }
.config-nav a { display: flex; align-items: center; min-height: 44px; padding: 0 12px; border-radius: 8px; color: var(--texto-2); text-decoration: none; }
.config-nav a:hover { background: var(--seleccion); color: var(--texto); }
.config-cuerpo { display: flex; flex-direction: column; gap: 20px; min-width: 0; max-width: 980px; }
.config-seccion { scroll-margin-top: 72px; display: flex; flex-direction: column; gap: 12px; padding: 18px 20px; border: 1px solid var(--borde-fuerte); border-radius: 16px; background: var(--tarjeta); }
.config-cab { display: flex; flex-direction: column; gap: 2px; }
.config-cab h2 { margin: 0; font-size: 21px; }
.config-fila { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 20px; padding-top: 12px; border-top: 1px solid var(--borde); }
.config-texto { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 260px; }
.config-texto .tenue { font-size: 13px; }
.niveles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.nivel { display: flex; flex-direction: column; gap: 4px; padding: 12px; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--c) 45%, transparent); background: color-mix(in srgb, var(--c) 10%, transparent); }
.nivel .cantidad { font-size: 24px; color: var(--c); }
.nivel .versalita { color: var(--c); }
.entorno { display: flex; flex-direction: column; gap: 12px; flex: 1 1 320px; min-width: 0; }
.lista-editable, .campo { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip-valor { display: inline-flex; align-items: center; gap: 2px; max-width: 100%; padding-left: 10px; border-radius: 8px; background: var(--hundido); border: 1px solid var(--borde); overflow-wrap: anywhere; }
.quitar { min-width: 44px; min-height: 44px; border: 0; background: transparent; color: var(--texto-3); cursor: pointer; font-size: 18px; }
.quitar:hover:not(:disabled) { color: var(--error); }
.agregar { display: flex; flex-wrap: wrap; gap: 8px; }
.agregar input, .campo input { flex: 1 1 200px; min-width: 0; min-height: 44px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--borde-fuerte); background: var(--fondo); }
.reglas { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.grupo-reglas { display: flex; flex-direction: column; gap: 8px; padding: 12px; min-width: 0; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--c) 40%, transparent); }
.lista-reglas { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.lista-reglas li { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-left: 10px; border-radius: 8px; background: var(--hundido); overflow-wrap: anywhere; }
.panel-fabrica, .panel-critica { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: 12px; background: var(--hundido); border: 1px solid var(--borde); }
.panel-fabrica summary { display: flex; align-items: center; min-height: 44px; color: var(--c); font-weight: 600; cursor: pointer; }
.panel-critica.e-error { border-color: var(--error); }
.aviso-uso { margin: 0; font-size: 12px; }
.contador { display: inline-flex; align-items: center; gap: 4px; }
.boton-contador { width: 44px; height: 44px; border-radius: 10px; border: 1px solid var(--borde-fuerte); background: transparent; cursor: pointer; font-size: 18px; }
.contador .valor { min-width: 32px; text-align: center; font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; }
.fila-rubrica { display: grid; grid-template-columns: minmax(180px, 1fr) auto auto; align-items: center; gap: 10px 16px; padding-top: 12px; border-top: 1px solid var(--borde); }
.nota { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 13px; }
.tabla-desplazable { overflow-x: auto; max-width: 100%; }
.tabla-precios { width: 100%; min-width: 560px; border-collapse: collapse; font-size: 13px; }
.tabla-precios th, .tabla-precios td { padding: 6px 8px; border-bottom: 1px solid var(--borde); text-align: left; }
.tabla-precios th[scope="row"] { color: var(--c); white-space: nowrap; }
.tabla-precios input { width: 100%; min-width: 80px; min-height: 44px; padding: 0 8px; border-radius: 8px; border: 1px solid var(--borde-fuerte); background: var(--fondo); font-family: var(--mono); }

/* ---------- Agentes ---------- */
.vista-agentes { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 420px); gap: 20px; padding: 20px 24px 48px; align-items: start; }
.catalogo { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.catalogo > h2 { margin: 0; font-size: 24px; }
.buscador input { width: 100%; min-height: 44px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--borde-fuerte); background: var(--tarjeta); }
.catalogo-lista { display: flex; flex-direction: column; gap: 22px; }
.grupo-agentes { display: flex; flex-direction: column; gap: 10px; }
.grupo-cab { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; }
.grupo-cab h3 { margin: 0; font-size: 19px; }
.rejilla-agentes { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr)); gap: 10px; }
.tarjeta-catalogo { display: flex; flex-direction: column; gap: 6px; min-width: 0; padding: 8px; border: 1px solid var(--borde-fuerte); border-radius: 12px; background: var(--tarjeta); }
.tarjeta-catalogo.seleccionada { border-color: var(--clay); box-shadow: 0 0 0 1px var(--clay); }
.abrir-agente { display: flex; flex-direction: column; gap: 6px; width: 100%; min-height: 44px; padding: 6px; border: 0; border-radius: 8px; background: transparent; text-align: left; cursor: pointer; }
.abrir-agente:hover { background: var(--seleccion); }
.abrir-agente .desc { font-size: 13px; color: var(--texto-2); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.abrir-agente > .fila.tenue { justify-content: space-between; font-size: 12px; }
.nombres { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.nombres strong, .nombres .mono { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.inicial { display: grid; place-items: center; flex: none; width: 32px; height: 32px; border-radius: 8px; background: color-mix(in srgb, var(--clay) 22%, transparent); color: var(--clay); font-weight: 700; }
.inicial.grande { width: 44px; height: 44px; font-size: 20px; }
.estado-agente { justify-content: space-between; padding: 0 6px; font-size: 12.5px; }
.estado-activo { color: var(--listo); } .estado-actualizable { color: var(--accion); } .estado-conflicto { color: var(--error); } .estado-inactivo { color: var(--texto-3); }
.panel-agente { position: sticky; top: 0; display: flex; flex-direction: column; gap: 14px; min-width: 0; padding: 18px; border: 1px solid var(--borde-fuerte); border-radius: 16px; background: var(--panel); }
.panel-agente h2 { margin: 0; font-size: 21px; }
.detalle-catalogo, .form-agente { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.detalle-catalogo .bloque { display: flex; flex-direction: column; gap: 6px; }
.detalle-catalogo .bloque p { margin: 0; }
.prompt { margin: 0; max-height: 440px; overflow: auto; padding: 12px 14px; border-radius: 10px; background: var(--codigo); border: 1px solid var(--borde); font-family: var(--mono); font-size: 12.5px; white-space: pre-wrap; overflow-wrap: anywhere; }
.form-agente textarea, .form-agente input[type="text"] { width: 100%; min-height: 44px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--borde-fuerte); background: var(--fondo); resize: vertical; }
.cab-prompt { flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 10px; }
.redactar { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.redactar .tenue { font-size: 12px; }
.ruta-archivo { font-size: 12px; overflow-wrap: anywhere; }

@media (max-width: 1180px) {
  .vista-agentes { grid-template-columns: minmax(0, 1fr); }
  .panel-agente { position: static; }
}
@media (max-width: 760px) {
  .vista-config { grid-template-columns: minmax(0, 1fr); padding: 16px; }
  .config-nav { position: static; flex-direction: row; flex-wrap: wrap; }
  .vista-agentes { padding: 16px; }
  .niveles, .reglas, .fila-rubrica { grid-template-columns: minmax(0, 1fr); }
}

/* Cuatro pestañas: en el celular ocupan una fila completa y, si no caben, se desplazan dentro de su barra (nunca la página). */
.pestanas { max-width: 100%; overflow-x: auto; }
@media (max-width: 760px) {
  .pestanas { flex: 1 1 100%; }
  .pestanas button { flex: 1 0 auto; padding: 0 8px; font-size: 13px; }
}
```

(El `[hidden] { display: none !important; }` que ya existe al principio de `tema.css` gana a los `display: grid` de las vistas.)

- [ ] **Paso 8: wiring en `app.js`**

1. Agrega a los imports:
   ```js
   import { iniciarConfiguracion, abrirConfiguracion, hayCambiosConfig } from './configuracion.js';
   import { iniciarAgentes, abrirAgentes } from './agentes-catalogo.js';
   ```
2. Reemplaza la función `mostrarPestana` y las dos líneas `$('tab-chat').addEventListener…` y `$('tab-actividad').addEventListener…` por:
   ```js
   const PESTANAS = ['chat', 'actividad', 'agentes', 'config'];
   function mostrarPestana(p) {
     const destino = PESTANAS.includes(p) ? p : 'chat';
     guardarPreferencia('orq-pestana', destino);
     for (const x of PESTANAS) {
       const activa = x === destino;
       $(`tab-${x}`).setAttribute('aria-selected', String(activa));
       $(`vista-${x}`).hidden = !activa;
     }
     document.body.dataset.pestana = destino;
     if (destino === 'actividad') dispatchEvent(new Event('resize'));
     if (destino === 'agentes') abrirAgentes();
     if (destino === 'config') abrirConfiguracion();
   }
   for (const x of PESTANAS) $(`tab-${x}`).addEventListener('click', () => mostrarPestana(x));
   // Cambios sin guardar en Configuración: el navegador pregunta antes de cerrar o recargar.
   addEventListener('beforeunload', (ev) => { if (hayCambiosConfig()) { ev.preventDefault(); ev.returnValue = ''; } });
   ```
3. En `abrir`, agrega al final (después de `actualizarUso();`):
   ```js
     if (document.body.dataset.pestana === 'agentes') abrirAgentes(); // los agentes del proyecto dependen de la conversación abierta
   ```
4. En `arrancar`, reemplaza las dos primeras líneas (`iniciarActividad(…)` y `mostrarPestana(…)`) por:
   ```js
     iniciarActividad({ alternarCosto });
     iniciarConfiguracion({ api, toast, alGuardar: (config) => { estado.config = config; aplicarCosto(); renderTodo(); } });
     iniciarAgentes({ api, toast, conversacionActual: () => estado.actual });
     mostrarPestana(preferencia('orq-pestana', 'chat'));
   ```

- [ ] **Paso 9: correr los tests, la sintaxis y una prueba visual**

Ejecuta:

```bash
node --test
for f in plugins/orquestador/dashboard/public/*.js; do node --check "$f" || exit 1; done
```

Esperado: todo PASS (los 56 del catálogo siguen como `todo`). Después levanta el dashboard y revisa a ojo, en 1440 px y en 390 px:
- **Configuración.** Las 7 secciones con navegación lateral. Al cambiar un límite aparece la barra ámbar "Tienes cambios sin guardar"; Descartar la quita y Guardar muestra "Guardado. Se aplica en la próxima delegación.". La tabla de precios se desplaza dentro de su caja.
- **Agentes.** Los packs (vacíos hasta las Tareas 13–15, salvo que copies uno de prueba), Del Plugin con Guardián Git, Integrados con "Prompt de Anthropic, no visible", y el formulario Nuevo Agente con "Redactar con Claude".
- En ninguna de las dos hay scroll horizontal de página.

- [ ] **Paso 10: commit**

```bash
git add plugins/orquestador/dashboard/public tests/dashboard-server.test.mjs tests/dashboard-css.test.mjs
git commit -m "feat: pestañas Configuración y Agentes en el dashboard"
```

---

### Tarea 13: contenido del catálogo (1 de 3): Investigación, Datos y Machine Learning (19 agentes)

**Archivos:**
- Crear: `plugins/orquestador/catalogo/investigacion/{investigador,analista-literatura,verificador-hechos,investigador-mercado,investigador-tecnico,sintetizador}.md`
- Crear: `plugins/orquestador/catalogo/datos/{analista-datos,limpiador-datos,estadistico,visualizador-datos,ingeniero-datos,analista-sql}.md`
- Crear: `plugins/orquestador/catalogo/ml/{cientifico-ml,ingeniero-ml,evaluador-modelos,investigador-rl,optimizador-hiperparametros,ingeniero-mlops,critico-papers}.md`

**Interfaces:**
- Consume: las tablas de los packs `investigacion`, `datos` y `ml` y la "Guía de contenido del catálogo" (al inicio de este plan); `tests/catalogo.test.mjs` y `packs.json` (Tarea 5).
- Produce: 19 archivos que pasan `tests/catalogo.test.mjs`. Las Tareas 14 y 15 no dependen de ellos.

- [ ] **Paso 1: ver los pendientes**

Ejecuta: `node --test tests/catalogo.test.mjs`
Esperado: PASS con `todo 56`.

- [ ] **Paso 2: crear el ejemplo**

Crea `catalogo/investigacion/investigador.md` copiando **literal** el ejemplo completo de la Guía de contenido.

- [ ] **Paso 3: escribir los otros 18**

Cada archivo sigue la plantilla exacta de la Guía:
- el frontmatter se copia literal de la tabla de su pack;
- el cuerpo cumple los criterios de calidad;
- la sección `## REGLAS CRÍTICAS` va idéntica a la del ejemplo.

Usa estas notas como punto de partida de cada cuerpo:
- Persona: la actitud.
- Método: los pasos que no pueden faltar.
- Entregable: lo que produce.
- Vecino: el agente que debe nombrar en sus Restricciones.

| id | Persona | Método: no puede faltar | Entregable | Vecino |
|---|---|---|---|---|
| `analista-literatura` | Bibliotecario académico riguroso | Pregunta y criterios de inclusión; búsqueda con sinónimos en arXiv, Semantic Scholar o Google Scholar; leer abstract y método; agrupar por enfoque; comprobar que cada cita existe (DOI o URL abierta) | Estado del arte por enfoque, tabla comparativa y referencias verificadas | critico-papers, investigador |
| `verificador-hechos` | Chequeador de datos implacable | Extraer cada afirmación verificable; buscar su fuente primaria; comparar cifra, fecha o cita exacta; dar un veredicto con la corrección | Tabla afirmación · veredicto (confirmada/refutada/no verificable) · fuente · corrección | investigador |
| `investigador-mercado` | Analista que hace explícito cada supuesto | Definir mercado y segmento; estimar top-down y bottom-up; triangular fuentes oficiales e informes públicos; rangos y sensibilidad | TAM/SAM/SOM con supuestos, rangos y fuentes fechadas | analista-competencia, estratega |
| `investigador-tecnico` | Ingeniero que lee la documentación y el código antes de opinar | Requisitos; lista corta de candidatos; leer docs, changelog, issues y licencia; revisar con Grep o Glob cómo encajaría en el repo; matriz de trade-offs | Matriz de comparación y recomendación con riesgos | arquitecto, revisor-dependencias |
| `sintetizador` | Editor de inteligencia que integra sin perder matices | Inventario de fuentes; extraer afirmaciones clave; agrupar por tema; resolver o marcar contradicciones; señalar vacíos | Síntesis estructurada con cada afirmación trazable a su fuente | investigador, redactor |
| `analista-datos` | Analista cuantitativo escéptico de sus propios resultados | Perfilar filas, columnas, tipos y nulos; análisis mínimo que responde la pregunta; verificar cada número clave por una segunda vía; no tocar los datos originales | Hallazgos con los números que los sostienen y los comandos que los reproducen | limpiador-datos, estadistico |
| `limpiador-datos` | Meticuloso; nunca toca el original | Copia de trabajo; perfil; reglas de limpieza explícitas; aplicarlas con un script; contar filas antes y después de cada regla | Dataset limpio en una ruta nueva y registro de cambios por regla | analista-datos |
| `estadistico` | Estadístico que revisa supuestos antes de cualquier p-valor | Hipótesis y nivel de significancia; prueba según el tipo de dato; verificar supuestos; tamaño de efecto con intervalo de confianza; potencia; corrección por comparaciones múltiples | Informe con prueba, supuestos verificados, efecto, IC y conclusión acotada | analista-datos |
| `visualizador-datos` | Diseñador de información honesto con las escalas | Mensaje del gráfico; forma adecuada; ejes con unidades; escala sin distorsión; paleta accesible; generar con un script y revisar la imagen | Imagen o imágenes y el script que las genera | disenador-visual |
| `ingeniero-datos` | Ingeniero que diseña para re-ejecutar sin miedo | Fuentes y contrato de esquema; etapas; validaciones por etapa; prueba con una muestra; idempotencia (re-ejecutar no duplica) | Código del pipeline, validaciones y comandos de ejecución | analista-sql, ingeniero-cloud |
| `analista-sql` | Analista que lee el esquema antes de escribir | Leer el esquema; consulta de solo lectura; validar con conteos; `EXPLAIN` si es lenta; explicar el resultado | Consultas comentadas, resultado e interpretación | administrador-bd |
| `cientifico-ml` | Investigador metódico: hipótesis antes que código | Hipótesis y métrica principal; baselines; ablations de una variable; splits sin fuga; costo de cómputo estimado; criterio de éxito | Plan experimental con tabla de corridas | ingeniero-ml, investigador-rl |
| `ingeniero-ml` | Obsesionado con la reproducibilidad | Fijar semillas, versiones y datos; implementar; corrida de humo corta; registrar métricas en un archivo; tests de las piezas críticas | Código, comandos para reproducir y métricas de la corrida de humo | cientifico-ml |
| `evaluador-modelos` | Auditor que desconfía de un solo número | Verificar el split y posibles fugas; métricas con IC (bootstrap); cortes por subgrupo; análisis de errores con ejemplos; comparar con el baseline | Informe de evaluación con tablas y ejemplos de errores | optimizador-hiperparametros |
| `investigador-rl` | Escéptico, obsesionado con seeds y baselines | Formalizar estado, acción y reward; baselines; de 3 a 5 seeds; ablations de reward shaping; curvas con IC; riesgo de reward hacking | Plan experimental de RL con tabla de corridas | cientifico-ml, ingeniero-ml |
| `optimizador-hiperparametros` | Experimentador frugal con el presupuesto | Espacio de búsqueda y presupuesto; método (aleatorio, bayesiano o por etapas); correr dentro del presupuesto; repetir las 3 mejores con otras seeds | Tabla de corridas, mejor configuración con media ± desviación y comando | cientifico-ml |
| `ingeniero-mlops` | Ingeniero de plataforma que piensa en el día 2 | Empaquetar y versionar el modelo; servir (API o batch); monitoreo de deriva y latencia; plan de rollback; prueba de carga básica | Artefactos de despliegue y runbook | ingeniero-ml, ingeniero-devops |
| `critico-papers` | Revisor de conferencia exigente pero justo | Contribución en 3 líneas; supuestos; validez experimental (baselines, seeds, estadística); amenazas a la validez; clasificar cada problema como fatal, mayor o menor | Revisión con veredicto y 3 preguntas para los autores | analista-literatura, redactor-academico |

- [ ] **Paso 4: correr el test del catálogo**

Ejecuta: `node --test tests/catalogo.test.mjs`
Esperado: PASS con `todo 37`; los 19 de estos packs ya no son TODO. Si alguno falla, corrige el archivo (no el test).

- [ ] **Paso 5: revisión manual**

Para cada archivo, revisa la lista de criterios de calidad de la Guía:
- de 4 a 7 pasos comprobables;
- el vecino nombrado en Restricciones;
- un formato de retorno fijo;
- sin relleno;
- herramientas coherentes con `tools`.

Lee juntas las 19 `description` y confirma que ninguna pisa a otra.

- [ ] **Paso 6: commit**

```bash
git add plugins/orquestador/catalogo/investigacion plugins/orquestador/catalogo/datos plugins/orquestador/catalogo/ml
git commit -m "feat: agentes del catálogo de investigación, datos y machine learning"
```

---

### Tarea 14: contenido del catálogo (2 de 3): Ingeniería, Diseño e Infraestructura (21 agentes)

**Archivos:**
- Crear: `plugins/orquestador/catalogo/ingenieria/{arquitecto,implementador,depurador,revisor-codigo,tester,refactorizador,optimizador-rendimiento,documentador-codigo,migrador}.md`
- Crear: `plugins/orquestador/catalogo/diseno/{disenador-ui,disenador-visual,ingeniero-frontend,auditor-accesibilidad,redactor-ux,disenador-sistemas}.md`
- Crear: `plugins/orquestador/catalogo/infra/{ingeniero-devops,ingeniero-cloud,auditor-seguridad,revisor-dependencias,administrador-bd,ingeniero-sre}.md`

**Interfaces:**
- Consume: las tablas de los packs `ingenieria`, `diseno` e `infra`, la "Guía de contenido del catálogo" (con su ejemplo completo `investigador.md`) y `tests/catalogo.test.mjs`.
- Produce: 21 archivos que pasan `tests/catalogo.test.mjs`.

- [ ] **Paso 1: ver los pendientes**

Ejecuta: `node --test tests/catalogo.test.mjs`
Esperado: PASS; estos 21 aparecen como `todo`.

- [ ] **Paso 2: escribir los 21 archivos**

Usa la plantilla exacta de la Guía: el frontmatter literal de la tabla de su pack y la sección `## REGLAS CRÍTICAS` idéntica a la del ejemplo. Notas por agente:

| id | Persona | Método: no puede faltar | Entregable | Vecino |
|---|---|---|---|---|
| `arquitecto` | Arquitecto pragmático | Leer el código existente; requisitos y restricciones; 2 o 3 enfoques con trade-offs; recomendar uno; dividirlo en tareas con criterio de aceptación | Diseño (componentes, interfaces y flujo de datos) y tareas numeradas | implementador, planificador |
| `implementador` | Ingeniero que escribe el test primero | Leer el código vecino y sus convenciones; test que falla; lo mínimo para que pase; refactor local; suite completa | Cambios en archivos y suite en verde | arquitecto, depurador |
| `depurador` | Sistemático: evidencia antes que hipótesis | Reproducir; acotar con bisección o logs; experimento que confirma la causa; arreglo mínimo con test de regresión; suite completa | Causa raíz demostrada, arreglo y test de regresión | implementador |
| `revisor-codigo` | Revisor senior que solo reporta problemas reales | Leer el diff y su contexto; buscar bugs, seguridad, concurrencia y casos borde; verificar cada hallazgo (tests o reproducción); asignar severidad | Hallazgos con archivo:línea, problema y escenario de falla | auditor-seguridad, refactorizador |
| `tester` | Piensa en cómo romper el código | Leer el código y los tests existentes; mapa de casos (felices, bordes y errores); escribir los tests; correrlos; informar los bugs encontrados sin arreglarlos | Tests nuevos, cobertura y bugs encontrados | implementador |
| `refactorizador` | Paciente; pasos pequeños | Suite verde de base; identificar el olor; pasos pequeños con la suite tras cada uno; no cambiar la API pública; resumen del antes y después | Código refactorizado con la suite en verde | implementador, migrador |
| `optimizador-rendimiento` | Mide antes de optimizar | Benchmark reproducible; perfilar; hipótesis del cuello de botella; cambio mínimo; medir de nuevo con repeticiones; correr los tests | Números de antes y después y el cambio aplicado | analista-sql, ingeniero-sre |
| `documentador-codigo` | Solo describe lo que el código hace | Leer el código; identificar la API pública; docstrings o README con ejemplos; contrastar cada ejemplo con las firmas reales; estilo consistente | Documentación escrita en los archivos | redactor-tecnico |
| `migrador` | Cauteloso; migra por lotes | Leer la guía oficial y el changelog; inventario de usos con Grep; migrar por lotes; suite tras cada lote; anotar lo que queda manual | Código migrado y notas de migración | refactorizador, revisor-dependencias |
| `disenador-ui` | Diseñador de producto: claridad y jerarquía antes que adorno | Tarea del usuario y contexto; flujo; pantallas con estados vacío, carga y error; 2 variantes razonadas; accesibilidad y móvil | Spec de pantallas (Markdown o HTML estático) con notas de interacción | ingeniero-frontend, disenador-sistemas |
| `disenador-visual` | Diseñador editorial: una idea por slide | Mensaje de cada pieza; forma (gráfico, diagrama o texto); jerarquía tipográfica; consistencia de color; revisión de legibilidad | Slides o piezas gráficas en archivos | visualizador-datos, disenador-ui |
| `ingeniero-frontend` | Accesible por defecto | Leer el diseño y los componentes existentes; HTML semántico y ARIA; responsivo; tests de componentes; correr la suite | Código de la interfaz y sus tests | disenador-ui |
| `auditor-accesibilidad` | Audita con el teclado y el lector de pantalla en mente | Alcance; contraste, foco, orden de tabulación, roles y textos alternativos; herramientas automáticas si están instaladas; priorizar por impacto | Hallazgos con criterio WCAG, severidad y arreglo sugerido | disenador-ui |
| `redactor-ux` | Breve y humano | Contexto y voz de la marca; inventario de textos; verbos claros; errores que dicen qué hacer; términos consistentes | Tabla de antes y después o textos editados en los archivos | redactor |
| `disenador-sistemas` | Prefiere pocas reglas que se cumplen | Auditar tokens y componentes existentes; definir tokens (color, tipografía y espaciado); componentes base con estados; reglas de uso; plan de migración | Tokens y documentación del sistema | disenador-ui |
| `ingeniero-devops` | Automatiza todo lo que se hace dos veces | Pipeline actual; etapas (build, test, lint y release); caché y reproducibilidad; secretos por variables; probar en una rama | Archivos de CI/CD y documentación de uso | ingeniero-cloud, ingeniero-sre |
| `ingeniero-cloud` | Con el costo y el mínimo privilegio a la vista | Requisitos; red, cómputo y almacenamiento; infraestructura como código; permisos mínimos; estimación de costo; `plan` sin aplicar | IaC, estimación de costo y plan de cambios | ingeniero-devops |
| `auditor-seguridad` | Atacante ético metódico | Superficie de ataque; autenticación y autorización, inyección, secretos, deserialización; prueba de concepto no destructiva; severidad; remediación | Informe de hallazgos con evidencia y prioridad | revisor-codigo, revisor-dependencias |
| `revisor-dependencias` | Guardián de la cadena de suministro | Inventario desde los lockfiles; auditoría de vulnerabilidades (npm audit, pip-audit o equivalente); licencias; mantenimiento; recomendaciones | Tabla de dependencias con riesgo y acción sugerida | migrador, auditor-seguridad |
| `administrador-bd` | DBA conservador: todo con reversa | Esquema actual; diseño del cambio; migración con su reversa; índices según consultas reales; probar en una copia; respaldo | Migraciones, índices y plan de reversa | analista-sql |
| `ingeniero-sre` | Piensa en presupuesto de errores | SLIs y SLOs; logs, métricas y trazas; alertas accionables; runbooks; post-incidente sin culpables con acciones | SLOs, alertas y runbook o postmortem | ingeniero-devops |

- [ ] **Paso 3: correr el test del catálogo**

Ejecuta: `node --test tests/catalogo.test.mjs`
Esperado: PASS con `todo 16` si la Tarea 13 ya se hizo, o `todo 35` si no.

- [ ] **Paso 4: revisión manual**

Aplica la misma lista de criterios de la Guía. Pon atención a los pares que se pueden confundir y deja el límite explícito en sus Restricciones:
- revisor-codigo y auditor-seguridad;
- implementador y depurador;
- disenador-ui e ingeniero-frontend;
- ingeniero-devops e ingeniero-sre.

- [ ] **Paso 5: commit**

```bash
git add plugins/orquestador/catalogo/ingenieria plugins/orquestador/catalogo/diseno plugins/orquestador/catalogo/infra
git commit -m "feat: agentes del catálogo de ingeniería, diseño e infraestructura"
```

---

### Tarea 15: contenido del catálogo (3 de 3): Escritura, Negocio y Operación (16 agentes) y catálogo completo

**Archivos:**
- Crear: `plugins/orquestador/catalogo/escritura/{redactor,editor,traductor,redactor-tecnico,redactor-academico,comunicador}.md`
- Crear: `plugins/orquestador/catalogo/negocio/{estratega,analista-financiero,product-manager,investigador-usuarios,analista-competencia,redactor-propuestas}.md`
- Crear: `plugins/orquestador/catalogo/operacion/{verificador,extractor,planificador,organizador-archivos}.md`
- Modificar: `tests/catalogo.test.mjs` (`CONTENIDO_COMPLETO = true`)

**Interfaces:**
- Consume: las tablas de los packs `escritura`, `negocio` y `operacion`, la "Guía de contenido del catálogo" (con el ejemplo `investigador.md`), `tests/catalogo.test.mjs` y los 40 archivos de las Tareas 13 y 14.
- Produce: los 16 archivos restantes. Desde aquí, un agente del catálogo que falte **rompe** la suite.

- [ ] **Paso 1: escribir los 16 archivos**

Usa la plantilla exacta de la Guía: el frontmatter literal de la tabla de su pack y la sección `## REGLAS CRÍTICAS` idéntica a la del ejemplo. Notas por agente:

| id | Persona | Método: no puede faltar | Entregable | Vecino |
|---|---|---|---|---|
| `redactor` | Claro y directo | Lector y objetivo; versión corta primero (3 líneas); desarrollar; tono pedido; revisar cada dato | Texto final listo para enviar; no envía nada | redactor-tecnico, redactor-academico |
| `editor` | Corta sin cambiar la voz del autor | Leer completo; estructura; claridad y concisión por párrafo; corrección; explicar los cambios mayores | Texto editado y lista de cambios mayores | redactor |
| `traductor` | Respeta el registro y la terminología | Glosario de términos; traducir por bloques; conservar formato y marcas; revisar la terminología técnica; relectura como nativo | Traducción y glosario | comunicador |
| `redactor-tecnico` | Prueba cada paso que documenta | Audiencia y objetivo; estructura (requisitos, pasos, verificación y problemas comunes); ejecutar cada comando; usar salidas reales | Guía en Markdown verificada | documentador-codigo |
| `redactor-academico` | Preciso; cada afirmación con respaldo | Estructura según la sección (IMRaD); argumentos con citas verificadas; terminología precisa; coherencia con los resultados; formato de citas | Sección redactada con citas que existen | critico-papers, analista-literatura |
| `comunicador` | Estratega de mensajes | Audiencia, canal y objetivo; mensaje clave en una frase; extensión y tono por canal; anticipar preguntas; riesgos de interpretación | Mensajes por canal listos para revisar | traductor, redactor-propuestas |
| `estratega` | Cuantifica antes de recomendar | Decisión y opciones; supuestos explícitos; escenarios pesimista, base y optimista; riesgos; recomendación con las condiciones que la harían cambiar | Memo de recomendación con tabla de escenarios | analista-financiero |
| `analista-financiero` | Fórmulas trazables, sin números mágicos | Preguntas y horizonte; supuestos con fuente; modelo en CSV o planilla con fórmulas; sensibilidad; comprobar que cuadra | Modelo financiero y resumen de resultados | estratega |
| `product-manager` | Empieza por el problema, no por la solución | Problema y usuarios; evidencia disponible; historias con criterios de aceptación; priorización explícita (p. ej. RICE); métricas de éxito; fuera de alcance | PRD breve | investigador-usuarios, disenador-ui |
| `investigador-usuarios` | Neutral; no induce respuestas | Objetivos de la investigación; guion o encuesta sin preguntas sesgadas; análisis por afinidad; necesidades con citas reales; límites de la muestra | Guion de investigación o síntesis de hallazgos | product-manager |
| `analista-competencia` | Fecha cada dato | Definir competidores; matriz de producto, precio, posicionamiento y canal; fuentes con fecha; diferenciadores; amenazas | Matriz competitiva y conclusiones | investigador-mercado |
| `redactor-propuestas` | Cumple cada requisito de las bases | Extraer requisitos y criterios de evaluación; estructura alineada a ellos; propuesta de valor; evidencia; checklist de cumplimiento | Propuesta y checklist de cumplimiento | comunicador |
| `verificador` | Inspector literal: compara contra la lista, nada más | Recibir los criterios de aceptación; ejecutar cada comprobación; marcar cumple o no cumple con evidencia; veredicto final | Checklist por criterio y veredicto APROBADO o RECHAZADO; no arregla nada | revisor-codigo |
| `extractor` | Literal y preciso | Recibir el esquema; extraer solo lo que está en la fuente; null en los campos faltantes; validar tipos; contar registros | Archivo JSON o CSV con el esquema pedido | analista-datos |
| `planificador` | Hace explícitas las dependencias | Objetivo y criterio de terminado; tareas verificables; dependencias y camino crítico; estimaciones con supuestos; riesgos | Plan con tareas numeradas, dependencias y riesgos | arquitecto, product-manager |
| `organizador-archivos` | Ordenado y prudente | Inventario; reglas propuestas; plan de movimientos en simulacro; ejecutar solo lo que el encargo aprobó; verificar conteos; nunca borrar sin confirmación | Plan de movimientos y registro de lo hecho | refactorizador |

- [ ] **Paso 2: correr el test del catálogo**

Ejecuta: `node --test tests/catalogo.test.mjs`
Esperado: PASS con `todo 0` (si las Tareas 13 y 14 ya están hechas).

- [ ] **Paso 3: activar el modo estricto del test**

En `tests/catalogo.test.mjs`, cambia `const CONTENIDO_COMPLETO = false;` por `const CONTENIDO_COMPLETO = true;` y ajusta el comentario de arriba:

```js
// Catálogo completo: un archivo de agente que falte es un fallo, no un TODO.
const CONTENIDO_COMPLETO = true;
```

Ejecuta: `node --test tests/catalogo.test.mjs`
Esperado: PASS, `todo 0` y 59 tests (56 agentes y 3 estructurales).

- [ ] **Paso 4: revisión manual y prueba de uso**

1. Aplica la lista de criterios de la Guía a los 16 archivos.
2. Lee las 56 `description` seguidas, por ejemplo con `grep -h '^description:' plugins/orquestador/catalogo/*/*.md`, y confirma que no hay dos que compitan por el mismo encargo.
3. Activa un pack desde la pestaña Agentes y comprueba que los archivos aparecen en `~/.claude/agents/` con el marcador al final.

- [ ] **Paso 5: commit**

```bash
git add plugins/orquestador/catalogo/escritura plugins/orquestador/catalogo/negocio plugins/orquestador/catalogo/operacion tests/catalogo.test.mjs
git commit -m "feat: agentes del catálogo de escritura, negocio y operación; catálogo completo"
```

---

### Tarea 16: documentación, versión 0.3.0, verificación final y prueba manual

**Archivos:**
- Modificar: `plugins/orquestador/skills/orquestar/SKILL.md`
- Modificar: `plugins/orquestador/commands/dashboard.md`
- Modificar: `README.md`
- Modificar: `plugins/orquestador/.claude-plugin/plugin.json` y `.claude-plugin/marketplace.json` (versión `0.3.0`)
- Modificar: `tests/plugin-valido.test.mjs`

**Interfaces:**
- Consume: todo lo anterior.
- Produce: la versión `0.3.0`. Al subir de versión, `lanzar.mjs` reinicia un dashboard viejo que siga corriendo (`necesitaReinicio`).

- [ ] **Paso 1: escribir el test que falla**

En `tests/plugin-valido.test.mjs`, reemplaza el test `la skill orquestar documenta los planes en pipeline y la versión es la misma en plugin y marketplace` completo por:

```js
test('la skill orquestar documenta planes, catálogo y verificador; la versión es 0.3.0 en plugin y marketplace', () => {
  const skill = readFileSync(join(PLUGIN, 'skills', 'orquestar', 'SKILL.md'), 'utf8');
  assert.match(skill, /## 5\. Planes en pipeline/);
  assert.match(skill, /orquestador-plan/);
  assert.match(skill, /E2 · /);
  assert.match(skill, /catálogo/);
  assert.match(skill, /`verificador`/);
  const comando = readFileSync(join(PLUGIN, 'commands', 'dashboard.md'), 'utf8');
  assert.match(comando, /Configuración/);
  assert.match(comando, /Agentes/);
  const plugin = leerJson(join(PLUGIN, '.claude-plugin', 'plugin.json'));
  const entrada = leerJson(join(RAIZ, '.claude-plugin', 'marketplace.json')).plugins.find((x) => x.name === 'orquestador');
  assert.equal(entrada.version, plugin.version);
  assert.equal(plugin.version, '0.3.0');
});
```

- [ ] **Paso 2: correr y ver que falla**

Ejecuta: `node --test tests/plugin-valido.test.mjs`
Esperado: FAIL (la versión es 0.2.0 y la skill no menciona el catálogo).

- [ ] **Paso 3: actualizar la skill, el comando, el README y la versión**

En `skills/orquestar/SKILL.md`:
1. Al final de la sección `## 1. ¿Delegar o hacerlo tú?`, agrega:
   ```markdown
   - **Agentes del catálogo:** los que el usuario activó desde el dashboard aparecen como tipos de agente sin prefijo (`investigador`, `implementador`, `verificador`…). Elige por su `description`, que dice cuándo usarlo y cuándo no. Si un tipo no existe en esta sesión, usa `general-purpose` con el mismo encargo.
   ```
2. En la sección `## 5. Planes en pipeline`, reemplaza la viñeta de `auto` por:
   ```markdown
     - `auto` es una verificación que corres tú o el agente `verificador` del catálogo (si está activo): tests verdes, checklist cumplida. El verificador responde APROBADO o RECHAZADO con evidencia.
   ```

En `commands/dashboard.md`, agrega al final:

```markdown
- Si el usuario pregunta cómo cambiar límites, la rúbrica, el modo automático o qué agentes tiene, recuérdale las pestañas **Configuración** y **Agentes** del dashboard. Los agentes que active ahí aparecen en las sesiones nuevas de Claude Code.
```

En `README.md`:
1. Reemplaza la línea de estado (`> Estado: …`) por:
   ```markdown
   > Estado: fases 1 (núcleo) y 2 (dashboard v2: chat, actividad, configuración y catálogo de agentes) listas. Sigue el benchmark de eficiencia. Diseño: [docs/specs/2026-10-12-orquestador-design.md](docs/specs/2026-10-12-orquestador-design.md).
   ```
2. En "Qué hace", reemplaza la viñeta del dashboard por estas dos:
   ```markdown
   - **Dashboard local**: chat con un orquestador propio (permisos con botones, varias conversaciones con historial, planes en pipeline con barreras, avisos del modo automático), detalle en vivo de cada agente, la vista de actividad y las pestañas **Agentes** y **Configuración**. Tema oscuro, con colores que indican el estado y el modelo.
   - **Catálogo de 56 agentes** en 9 packs (investigación, datos, machine learning, ingeniería, diseño, infraestructura, escritura, negocio y operación), cada uno con un prompt profesional y reglas comunes. Se activan por agente o por pack desde el dashboard. También puedes crear los tuyos, con ayuda de "Redactar con Claude".
   ```
3. Reemplaza el párrafo "La configuración está en …" por:
   ```markdown
   La configuración vive en `~/.claude/orquestador/config.json` y se edita desde la pestaña **Configuración**. Incluye:
   - los límites (`paraleloMax`, `fableMaxPorSesion` y `conversacionesMax`);
   - los modelos permitidos para el orquestador;
   - los permisos por defecto de las conversaciones nuevas (`modoPermisoDefecto`) y qué hacer cuando el modo automático detiene una acción (`alBloquear`);
   - la rúbrica de ruteo (si difiere de la de fábrica, se le entrega al orquestador al iniciar cada sesión);
   - `mostrarCosto` (también en la status line) y `alertasModelo`;
   - los precios, las ramas protegidas, el puerto y el modo remoto.

   Además, en el archivo puedes definir `rutaClaude`, la ruta al binario de Claude Code si no está en el PATH. Las claves que el dashboard no conoce se conservan al guardar.
   ```
4. Antes de `## Contribuir`, agrega:
   ```markdown
   ## Modo automático desde el dashboard

   La sección **Modo automático** de Configuración edita `autoMode` en `~/.claude/settings.json`, el único lugar donde Claude Code lo lee:
   - **Reglas propias.** Tus reglas de "Permitir siempre" y "Detener siempre" y tu entorno de confianza (repos, dominios y organización) se guardan siempre junto a las de fábrica, con `"$defaults"`.
   - **Lo que no toca.** El dashboard nunca toca `hard_deny` ni `permissions.allow`/`deny`, y conserva el resto del archivo.
   - **Respaldo.** Antes de cada escritura copia el archivo a `settings.json.orquestador.bak`. Si el JSON está dañado, no escribe.
   - **"Revisar mis reglas con Claude".** Ejecuta `claude auto-mode critique` y gasta uso de tu plan; el dashboard pide confirmación.
   - **"Restablecer de fábrica".** Ejecuta `claude auto-mode reset -y`, también con confirmación.
   - **"También en la terminal".** Escribe `permissions.defaultMode: "auto"` para que tus sesiones de la terminal empiecen en modo automático.
   ```

En `plugins/orquestador/.claude-plugin/plugin.json` y en la entrada `orquestador` de `.claude-plugin/marketplace.json`, cambia `"version": "0.2.0"` por `"version": "0.3.0"`.

- [ ] **Paso 4: suite completa, sintaxis y búsquedas**

Ejecuta:

```bash
node --test
for f in plugins/orquestador/dashboard/public/*.js; do node --check "$f" || exit 1; done
grep -rn "innerHTML" plugins/orquestador/dashboard/public && echo "MAL: innerHTML" || echo "ok: sin innerHTML"
grep -rniE "co-authored-by|generated with" $(git diff --name-only main...HEAD) && echo "MAL: atribución" || echo "ok: sin atribución"
grep -n '"version"' plugins/orquestador/.claude-plugin/plugin.json .claude-plugin/marketplace.json
```

Esperado:
- `fail 0` y `todo 0` en el resumen de `node --test`;
- ningún error de sintaxis;
- "ok: sin innerHTML" y "ok: sin atribución";
- `0.3.0` en los dos archivos.

Pega el resumen (tests, pass, fail y todo).

- [ ] **Paso 5: commit**

```bash
git add plugins/orquestador/skills/orquestar/SKILL.md plugins/orquestador/commands/dashboard.md README.md plugins/orquestador/.claude-plugin/plugin.json .claude-plugin/marketplace.json tests/plugin-valido.test.mjs
git commit -m "docs: catálogo, configuración y modo automático en la skill y el README; versión 0.3.0"
```

- [ ] **Paso 6: PUNTO DE CONTROL. Prueba manual del usuario**

Detente y entrega al usuario esta lista. Él la corre con su cuenta. Los pasos marcados **(gasta uso)** consumen su plan.

1. `/orquestador:dashboard`: se reinicia el servidor viejo (versión nueva) y se abre con 4 pestañas: Chat, Actividad, Agentes y Configuración.
2. **Configuración.**
   - Sube "Agentes en paralelo" a 5 y aparece la barra ámbar; **Descartar** la quita. Repite y presiona **Guardar**: aparece "Guardado. Se aplica en la próxima delegación." y `~/.claude/orquestador/config.json` tiene `paraleloMax: 5` y conserva las claves que ya tenía.
   - Cambia una fila de la rúbrica (por ejemplo Mecánica a Sonnet · medium) y guarda. En una sesión nueva de terminal, el contexto de inicio trae la "Rúbrica personalizada del usuario"; lo puedes ver preguntándole al orquestador qué rúbrica usa.
   - Apaga "Mostrar costo": desaparece del dashboard y de la status line de la terminal.
3. **Modo automático.**
   - Los conteos Pasa solo / Se detiene / Nunca coinciden con `claude auto-mode defaults`.
   - Agrega una regla en "Detener siempre" y un repo en el entorno, y guarda. Revisa `~/.claude/settings.json`: `autoMode` con `"$defaults"` al inicio de cada arreglo, el resto del archivo intacto y `settings.json.orquestador.bak` creado.
   - "Ver reglas de fábrica" despliega las etiquetas.
   - Opcional **(gasta uso)**: "Revisar mis reglas con Claude" muestra la opinión.
   - "Restablecer de fábrica" pide confirmación; con Cancelar no pasa nada.
4. **Agentes.**
   - Activa el pack "Ingeniería": su contador queda en 9/9 y los archivos aparecen en `~/.claude/agents/` con el marcador al final.
   - Abre una sesión nueva de Claude Code: `/agents` lista a `implementador`, `revisor-codigo`, etc.
   - Crea en `~/.claude/agents/` un archivo `tester.md` propio (sin marcador) y vuelve a activar el pack: `tester` aparece como "Ya tienes uno propio" y el toast lo explica.
   - **(gasta uso)** Nuevo Agente → nombre "Investigador RL", cuándo usarlo y "Redactar con Claude": se llenan las 5 secciones. Créalo, edítalo (queda el `.bak`) y elimínalo (pide confirmación).
5. **Chat.**
   - Haz clic en el título de la conversación, cámbialo, presiona Enter y recarga: el título nuevo persiste. Escape cancela.
   - En modo **Auto**, en un repo de prueba, pide algo que el clasificador detenga (por ejemplo "haz git push --force a main"). Aparece la tarjeta ámbar "El modo automático detuvo **Bash**: …"; con `alBloquear: preguntar` trae "Autorizar y reintentar".
   - Pide un plan con una barrera humana y apruébalo. Cuando el orquestador se detenga con la pregunta, aparece la franja ámbar "Barrera: …" con **Aprobar** y **Pedir Cambios**.
   - El panel lateral muestra el costo separado en Orquestador, Agentes y Total. Compáralo con `/cost` en `claude --resume <id>`: si el total del orquestador ya incluye a los agentes, anótalo como hallazgo.
6. **Actividad.** Con agentes trabajando, o con **Ver demo**:
   - tarjetas con el color de su estado y chip de modelo, y líneas del mismo color;
   - la tarjeta viajera "Modelo · esfuerzo → Agente #n";
   - Eventos con etiquetas de color;
   - el resumen con el costo ocultable, los límites, el pedido frente al real y la leyenda;
   - el chip del modelo del orquestador en la cabecera y al centro.
7. Con las herramientas de desarrollo en 390 px y en 1440 px, ninguna pestaña tiene scroll horizontal y los botones se pueden tocar.

- [ ] **Paso 7: con el visto bueno del usuario, cerrar la rama**

Usa la skill `superpowers:finishing-a-development-branch`. El PR se titula `feat: configuración, catálogo de agentes y actividad rediseñada (v2, entrega 2)`, sin atribución de IA, y se mergea con squash cuando CI esté verde en Ubuntu y Windows.
