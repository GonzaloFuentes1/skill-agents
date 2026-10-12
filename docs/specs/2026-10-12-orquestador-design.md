# Diseño: plugin `orquestador` para Claude Code

Fecha: 2026-10-12 · Estado: aprobado

## 1. Problema

Claude Code sirve para mucho más que programar (research de MLE/RL, papers, investigación de mercado, ventas, prospección, armar una empresa, presentaciones), pero al orquestar subagentes tiene tres problemas:

1. **Elige mal el modelo y el esfuerzo.** Usa Opus para trabajo mecánico o Haiku para razonamiento difícil, y además hay bugs documentados: el `model:` del frontmatter se ignoró en v2.1.117, y algunos `subagent_type` custom caían a agentes built-in.
2. **La orquestación es floja.** Delega trabajo trivial (o no delega nada), los prompts no son autocontenidos y los subagentes pierden el contexto. Desde v2.1.84 los subagentes no reciben CLAUDE.md.
3. **No hay visibilidad.** No se ve qué agentes están activos, con qué personalidad, modelo y esfuerzo, ni qué meta tiene cada uno.

## 2. Objetivo y criterios de éxito

Un plugin personal, instalable en cualquier proyecto, que cumpla esto:

- La sesión principal (el **orquestador**) corre en Opus, o en Fable, y decide **explícitamente** el modelo y el esfuerzo de cada delegación según una rúbrica escrita.
- Cada delegación queda registrada con meta, tipo de agente, modelo y esfuerzo pedidos, y además el **modelo que realmente corrió**. Si no coinciden, aparece una alerta.
- Fable se usa de forma automática, pero con un tope por sesión impuesto por un hook.
- Se ven los agentes activos en la status line y en un dashboard local animado.
- El flujo git estricto se impone con hooks y con branch protection. **Nunca** hay coautoría de Claude.
- Trae un catálogo de agentes con personalidad y manuales (skills) para los dominios del usuario.
- Un **benchmark de eficiencia** demuestra con números que el orquestador resuelve problemas reales igual o mejor que Claude Code "vanilla" y gastando menos. Corre **con la cuenta del usuario** (su suscripción, sin API key aparte), desde Claude Code o desde la terminal.
- Todo está en español. Los entregables se escriben en el idioma que pida la tarea; por ejemplo, un paper en inglés.

**Fuera de alcance (por ahora):**
- Agent Teams experimentales.
- Orquestación con proveedores no Anthropic.
- Facturación exacta, porque el costo mostrado es una estimación por tokens.

**Requisito de versión:** Claude Code ≥ 2.1.170 para el alias `fable` (actualizado a 2.1.296 el 2026-10-12).

## 3. Contexto investigado

| Existe | Qué tomamos | Por qué no basta |
|---|---|---|
| wshobson/agents, VoltAgent, BMAD, SuperClaude | La idea de un catálogo por plugin con agentes granulares | Sesgo a software, sin política de modelo/esfuerzo |
| disler/claude-code-hooks-multi-agent-observability | Hooks que emiten eventos y un servidor con dashboard | Es un timeline; no es la vista "orquestador al centro" |
| `attribution` setting (reemplaza al deprecado `includeCoAuthoredBy`) | `{"commit": "", "pr": ""}` | Es solo un setting; no impide que el modelo escriba la línea a mano |
| Hooks PreToolUse para git | Bloquear con `permissionDecision: deny` | El matcher `Bash(git commit:*)` falla, así que hay que parsear el comando |
| ccusage y status lines comunitarias | Una línea compacta con agente y costo | No muestran el modelo y esfuerzo por subagente |

## 4. Arquitectura

```
skill-agents/                       (marketplace)
├─ .claude-plugin/marketplace.json
├─ plugins/orquestador/
│  ├─ .claude-plugin/plugin.json
│  ├─ agents/*.md                   persona + model + effort + color + reglas críticas
│  ├─ skills/<nombre>/SKILL.md      orquestar, flujo-git, manuales (+ scripts/)
│  ├─ commands/                     setup.md, dashboard.md, estado.md
│  ├─ hooks/hooks.json              referencia ${CLAUDE_PLUGIN_ROOT}/scripts/*.mjs
│  ├─ scripts/                      hooks, statusline, lib/eventos.mjs
│  └─ dashboard/                    server.mjs + public/index.html
├─ bench/                           correr.mjs, sondas.mjs, problemas/<id>/, resultados/ (ignorado)
├─ tests/                           node:test, sin dependencias
├─ .github/workflows/ci.yml
└─ docs/specs/
```

**Runtime:** todo en Node ≥ 20 en módulos `.mjs`, **sin dependencias npm**. El usuario no tiene Python en el PATH, y Claude Code ya trae Node disponible. Python solo se usa dentro de los problemas MLE/RL del benchmark, a través de `uv`.

**Estado en disco** (fuera del repo):
- `~/.claude/orquestador/events.jsonl` es el log append-only de eventos.
- `~/.claude/orquestador/sessions/<session_id>.json` guarda el estado agregado de cada sesión: delegaciones activas, contador de Fable y costo.
- `~/.claude/orquestador/config.json` se crea con valores por defecto si no existe:
  ```json
  { "fableMaxPorSesion": 2, "paraleloMax": 4, "puertoDashboard": 4321,
    "modelosOrquestador": ["opus", "fable"], "ramasProtegidas": ["main", "master"] }
  ```

### 4.1 Formato de eventos (una línea JSON por evento)

```json
{ "v": 1, "ts": "2026-10-12T22:40:01.123Z", "session": "abc", "tipo": "delegacion",
  "id": "toolu_…", "agente": "investigador-rl", "meta": "Diseñar ablation de reward shaping",
  "modelo": "opus", "esfuerzo": "high", "origenModelo": "explicito|frontmatter|heredado",
  "persona": "Escéptica y metódica", "color": "purple" }
```

| `tipo` | Lo emite | Campos adicionales |
|---|---|---|
| `sesion` | SessionStart | `modelo`, `cwd` |
| `delegacion` | PreToolUse(Agent) | los del ejemplo |
| `bloqueo` | cualquier hook que niega | `motivo`, `regla` |
| `fin` | SubagentStop / PostToolUse(Agent) | `id`, `modeloReal`, `tokensIn`, `tokensOut`, `costoUSD`, `duracionMs`, `ok` |
| `alerta` | SubagentStop | `id`, `esperado`, `real`, `mensaje` |

La escritura es tolerante a fallos: si el log falla, el hook **nunca** bloquea la herramienta, salvo que se trate de las reglas de git o del tope de Fable.

## 5. Fase 1: núcleo

### 5.1 Skill `orquestar`: rúbrica de ruteo

| Clase de tarea | Ejemplos | Modelo / esfuerzo |
|---|---|---|
| Mecánica | Buscar archivos, extraer datos, formatear, perfilar un CSV, listar contactos públicos, convertir formatos | haiku / low |
| Producción acotada | Redactar una sección, implementar una función con su test, armar slides a partir de un esquema, emails | sonnet / medium |
| Síntesis y análisis | Revisión de literatura, debugging, investigación de mercado, análisis de datos con conclusiones | sonnet / high |
| Juicio experto | Diseño experimental ML/RL, estrategia de negocio o pricing, revisión crítica de un paper, arquitectura | opus / high |
| Problema abierto | Pruebas o derivaciones, decisiones irreversibles, auditoría final antes de enviar o publicar | opus / xhigh |
| Máxima consecuencia | Solo si se cumplen **dos** de estas: (a) Opus ya falló o se contradijo; (b) la ambigüedad es extrema y no se resuelve preguntando; (c) un error sería muy costoso (submission, inversión, decisión de empresa) | fable / high (tope por sesión) |

**Protocolo de delegación**, escrito en la skill:
1. **No delegar** si la tarea toma menos de 3 pasos o el orquestador ya tiene el contexto. En ese caso la hace él.
2. Pasar siempre `subagent_type`, `model` y `effort` de forma **explícita**, aunque coincidan con el frontmatter.
3. El prompt debe ser autocontenido y seguir esta plantilla: **Meta**, **Contexto mínimo** (rutas, decisiones tomadas), **Entregable**, **Restricciones** y **Formato de retorno** (máximo ~300 palabras, con estructura fija).
4. Como máximo `paraleloMax` delegaciones en paralelo. Solo se paraleliza lo que es independiente.
5. Revisar lo que devuelve cada agente antes de seguir. Si la calidad no alcanza, re-delegar **subiendo un escalón** de la rúbrica, no repetir lo mismo.
6. Al cerrar una tarea grande, mostrar un resumen de las delegaciones con `/orquestador:estado`.

### 5.2 Hooks

| Script | Evento / matcher | Comportamiento |
|---|---|---|
| `session-start.mjs` | SessionStart | Emite `sesion` e inyecta (en `hookSpecificOutput.additionalContext`) el recordatorio de cargar la skill `orquestar` cuando haya trabajo multi-paso. SessionStart **no** trae el modelo; la advertencia "el orquestador no está en opus/fable" la muestra la status line, que sí lo recibe. |
| `pre-agent.mjs` | PreToolUse `Agent\|Task` | Resuelve agente, modelo y esfuerzo: primero lo explícito, luego el frontmatter del agente, y si no hay, lo marca como heredado. Emite `delegacion`. Si el modelo es fable y el contador de la sesión ya llegó a `fableMaxPorSesion`, responde `deny` con el motivo y emite `bloqueo`. Si las delegaciones activas llegan a `paraleloMax`, responde `deny` con "espera a que terminen". |
| `subagent-stop.mjs` | SubagentStop | Lee el transcript del subagente y toma el `message.model` de los turnos del asistente y su `usage`. Emite `fin`. Si el modelo real no coincide con el esperado (comparando por familia: haiku/sonnet/opus/fable), emite `alerta` y devuelve un `systemMessage`. |
| `post-agent.mjs` | PostToolUse `Agent\|Task` | Cierra la delegación si `subagent-stop` no la cerró, por ejemplo cuando no hay transcript. |
| `git-guard.mjs` | PreToolUse `Bash` | Tokeniza el comando y separa `&&`, `;`, `\|` y saltos de línea. Ver §5.3. |

**Confirmado en la documentación** (2026-10-12):
- El tool se llama `Agent`; antes se llamaba `Task`, y el matcher cubre ambos.
- Para negar: `hookSpecificOutput.permissionDecision: "deny"` más `permissionDecisionReason`.
- `additionalContext` va dentro de `hookSpecificOutput`; `systemMessage` va en el nivel superior.
- SubagentStart y SubagentStop traen `agent_id` y `agent_type`. Para agentes de plugin, `agent_type` es `<plugin>:<nombre>`.
- El frontmatter de un agente admite `model`, `effort`, `tools`, `color`, `maxTurns` y `skills`.

**A verificar con las sondas (§9, capa 2) antes de implementar:**
- Si `model` viaja en el `tool_input` del Agent tool. `effort` probablemente sí.
- Si SubagentStop trae la ruta al transcript del subagente.
- Cómo correlacionar el `tool_use_id` del PreToolUse con el `agent_id`.

El diseño se ajusta a lo que exista de verdad. Si algo no se puede correlacionar, se usa como respaldo el orden FIFO por `agente`.

### 5.3 Reglas git (`git-guard.mjs` + skill `flujo-git`)

Las bloquea el hook, que responde `deny` con un motivo en español:
1. `git commit` cuando la rama actual (`git branch --show-current`) es protegida.
2. `git push` hacia una rama protegida, incluido `HEAD:main`.
3. `--no-verify` o `-n` en un commit o push, y `git push --force`, `-f` o `--force-with-lease` hacia una rama protegida.
4. Mensajes de commit (`-m`, `-F <archivo>`, heredoc) o cuerpos de `gh pr create` / `gh pr edit` (`--body`, `--body-file`) que contengan `Co-Authored-By:` con `Claude` o `anthropic`, `noreply@anthropic.com`, o "Generated with Claude".
5. Mensajes que no cumplan Conventional Commits: `^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?: .+`.
6. `gh pr merge` sin `--squash`.

Respaldo fuera de Claude: `/orquestador:setup` instala un `commit-msg` git hook en el repo actual (rechaza los casos 4 y 5) y un `pre-push` (rechaza el caso 2).

Del lado del servidor, en cada repo, `setup` ofrece configurar branch protection en `main` vía `gh api`: PR obligatorio, check de CI requerido, historial lineal, sin force-push y sin borrar la rama. Solo se activa squash-merge. Esto se pide con confirmación porque afecta a GitHub.

### 5.4 Comandos

- `/orquestador:setup`:
  - Agrega a `~/.claude/settings.json` las claves `attribution: {"commit": "", "pr": ""}` y `statusLine`, haciendo merge y mostrando el diff antes de escribir.
  - Crea `config.json`.
  - Verifica que Claude Code sea ≥ 2.1.170, necesario para el alias `fable`.
  - Instala los git hooks en el repo actual.
  - Ofrece configurar branch protection.
- `/orquestador:estado`: tabla de delegaciones de la sesión con agente, meta, modelo pedido y real, esfuerzo, tokens, costo y alertas.
- `/orquestador:dashboard`: ver Fase 2.

### 5.5 Status line (`statusline.mjs`) y `subagentStatusLine`

Ejemplo: `🎛 opus·high │ ▶ investigador-rl (opus·high) ▶ auditor-datos (haiku·low) │ fable 1/2 │ $0.42`

- Usa el JSON de entrada de la status line (modelo, costo, `session_id`) y `sessions/<id>.json`.
- Si el modelo principal no está en `modelosOrquestador`, muestra `⚠ orquestador en sonnet`.
- Debe responder en menos de 100 ms y nunca lanzar errores: ante cualquier fallo, imprime solo el modelo.

Un plugin **no** puede fijar `statusLine` ni `attribution`: su `settings.json` solo acepta `agent` y `subagentStatusLine`. Por eso esas dos claves las escribe `/orquestador:setup` en la configuración del usuario. El plugin **sí** declara `subagentStatusLine`, que muestra una línea por subagente activo: `▶ investigador-rl · opus·high · "Diseñar ablation…"`.

## 6. Fase 2: dashboard animado

- **`server.mjs`:**
  - Usa `node:http` y escucha solo en `127.0.0.1`.
  - Rutas: `GET /` sirve el HTML; `GET /eventos?session=` es un SSE que primero reenvía los eventos de la sesión y luego hace tail de `events.jsonl` con `fs.watch` y polling de respaldo; `GET /sesiones` lista las sesiones recientes.
- **`index.html`:** un solo archivo con SVG, CSS y JS vanilla, sin build ni CDN, con tema claro y oscuro.
  - **Centro:** el nodo "Orquestador", con el modelo y esfuerzo de la sesión.
  - **`delegacion`:** aparece un nodo orbital del color del agente, y una **tarjeta viaja animada del centro al nodo**. La tarjeta muestra la meta, el tipo de agente, la persona, el modelo y el esfuerzo. El nodo pulsa mientras el agente trabaja.
  - **`fin`:** la tarjeta vuelve al centro mostrando tokens, costo y duración, y el nodo queda atenuado en el historial.
  - **`alerta`** pinta el borde del nodo en rojo con un tooltip de pedido vs. real. **`bloqueo`** muestra un destello en el centro con el motivo.
  - **Panel lateral:** timeline, contador de Fable, costo acumulado y selector de sesión.
  - Respeta `prefers-reduced-motion`.
- **`/orquestador:dashboard`** levanta el servidor en background si no está corriendo y abre el navegador.

## 7. Fase 3: benchmark de eficiencia

**Pregunta que responde:** ¿resolver un problema real con el orquestador da un resultado igual o mejor que Claude Code tal cual, gastando menos tokens y tiempo?

### 7.1 Cómo se corre (con la cuenta del usuario)

- Desde Claude Code: `/orquestador:bench [problema|todos] [--config vanilla,orquestador,sonnet] [--runs N]`. Se lanza en background, emite eventos (así el dashboard lo muestra en vivo) y al terminar avisa con un resumen.
- Desde la terminal: `node bench/correr.mjs` con los mismos argumentos.
- Por dentro llama a `claude -p` con el login normal del usuario, así que **consume su suscripción y no necesita API key**. No se usa `claude plugin eval` como motor: aísla `HOME` y la configuración, y probablemente exige una API key. Se puede agregar más adelante como opción.
- Para cada combinación de problema × configuración × corrida:
  1. Copia `semilla/` a una carpeta temporal nueva.
  2. Corre `claude -p "<enunciado>" --output-format json --model <modelo> [--plugin-dir plugins/orquestador]` con una lista cerrada de herramientas: Read, Write, Edit, Glob, Grep, Agent, y `Bash` limitado a `uv`, `node` y `git`. **No se usa web**, para que sea reproducible.
  3. Usa un timeout y un tope de turnos por problema.
  4. Ejecuta el verificador.
- Las corridas son **secuenciales**. Si aparece un error de límite de uso, guarda lo hecho hasta ese momento, y `--continuar` retoma desde ahí.
- Cada corrida usa `ORQUESTADOR_HOME` propio, así sus eventos no se mezclan con las sesiones normales.

### 7.2 Configuraciones comparadas

| Config | Qué es |
|---|---|
| `vanilla` | Claude Code tal como lo usa el usuario, en Opus y sin el plugin. Si el plugin está instalado, se desactiva para la corrida vía `--settings`; esto se verifica con las sondas. |
| `orquestador` | Opus con el plugin: rúbrica, agentes y hooks. |
| `sonnet` (opcional) | Sonnet sin plugin, como referencia barata. |

### 7.3 Problemas (8, autocontenidos, con verificador objetivo)

Cada problema vive en `bench/problemas/<id>/`:
- `enunciado.md`: el prompt, tal como lo escribiría el usuario.
- `semilla/`: los archivos iniciales.
- `oculto/`: las respuestas, que nunca se copian al workspace.
- `verificar.mjs`: devuelve `{ puntaje: 0..1, detalles }`.
- `rubrica.md`: opcional, para el juez.
- `meta.json`: dominio, timeout, maxTurns y pesos.

| # | Dominio | Tarea | Verificación |
|---|---|---|---|
| 1 | MLE | Entrenar un modelo con un dataset tabular (Python vía `uv`) y escribir `predicciones.csv` | Métrica contra etiquetas ocultas, normalizada contra un umbral y un techo |
| 2 | RL | Implementar Q-learning para un gridworld, 3 seeds, y entregar `politica.json` más un reporte de varianza | Node simula la política (retorno medio ≥ umbral); se exigen las 3 seeds y que el reporte sea consistente |
| 3 | Datos | Auditar un CSV con 8 errores sembrados y escribir `reporte.md` | Recall de errores, con penalización por falsos positivos |
| 4 | Paper | Escribir *related work* a partir de 10 abstracts, uno de ellos con una cita trampa | No inventa citas, cubre ≥ 8 trabajos, no usa la cita trampa, y juez con rúbrica |
| 5 | Mercado | Calcular TAM/SAM/SOM y dar una recomendación a partir de archivos de datos | Cálculos dentro de una tolerancia, cifras trazables a los archivos, y juez |
| 6 | Contactos/ventas | Elegir los 5 perfiles que encajan con el ICP entre 40 ficticios y redactar outreach | Coincidencia con los 5 correctos, y juez sobre personalización |
| 7 | Presentación | Pasar un informe a un deck de 8 slides (pptx o markdown estructurado) | Archivo y estructura (8 slides, títulos, una idea por slide), y juez |
| 8 | Repo/git | Arreglar un bug en un repo pequeño | Tests pasan, hay rama distinta de `main`, Conventional Commit y **sin coautoría** |

**Juez:** otro `claude -p` en Opus, también con la cuenta del usuario. Evalúa a ciegas, sin saber qué configuración produjo el entregable, con la rúbrica, y devuelve JSON. Su costo se reporta aparte y no entra en el cálculo de eficiencia. El puntaje final de cada problema es una mezcla del verificador objetivo y del juez, con los pesos definidos en `meta.json`.

### 7.4 Métricas y reporte

Por problema y configuración, con media ± desviación estándar sobre `--runs` (por defecto 2):
- Puntaje.
- Tokens por modelo.
- **Costo equivalente en US$**, según la tabla de precios de `config.json`. Con suscripción el costo es nocional, pero permite comparar.
- Tiempo.
- Número de turnos y de delegaciones.
- Mezcla de modelos.
- Sobre-provisión: delegaciones a opus o fable de agentes marcados como mecánicos.
- **Eficiencia = puntaje / costo equivalente** y puntaje por minuto.

La salida va a `bench/resultados/<timestamp>/`: `resultados.json` y `reporte.html`. El reporte trae una tabla vanilla vs. orquestador, un gráfico puntaje vs. costo y la mezcla de modelos. `bench/resultados/` va en `.gitignore`, salvo los resúmenes que se decida versionar.

**Hipótesis a validar** (meta de la Fase 4): el puntaje promedio del orquestador es ≥ al de vanilla − 0.05 y su costo equivalente es ≤ 70 % del de vanilla, es decir, eficiencia ≥ 1.4×. Si no se cumple, se ajustan la rúbrica y los agentes, y se vuelve a medir.

## 8. Fase 4: catálogo y manuales

Cada agente define en su frontmatter `name`, `description` (cuándo usarlo y cuándo **no**), `model`, `effort`, `color` y `tools` mínimas. En el cuerpo lleva:
- La persona, en 2-3 líneas y distinta de las demás.
- Su método de trabajo.
- El formato de retorno.
- Las reglas críticas repetidas: idioma, sin coautoría, no inventar fuentes o datos, y citar URLs.

| Agente | Modelo / esfuerzo por defecto | Persona |
|---|---|---|
| investigador-web | haiku / medium | Rastreador rápido, cita todo |
| revisor-critico | opus / high | Abogado del diablo, busca fallas |
| auditor-datos | haiku / low | Contador meticuloso de CSV y tablas |
| escritor-tecnico | sonnet / medium | Claro y sobrio |
| guardian-git | haiku / low | Estricto con el proceso |
| ingeniero-ml | sonnet / high | Pragmático, reproducible |
| investigador-rl | opus / high | Escéptico, obsesionado con seeds y baselines |
| disenador-experimentos | opus / high | Piensa en hipótesis y ablations |
| redactor-paper | sonnet / high | Ordena cada claim con su evidencia |
| revisor-par | opus / high | "Reviewer 2" exigente pero justo |
| bibliografo | haiku / low | Ordenado; BibTeX correcto y verificado |
| analista-mercado | sonnet / high | Cuantitativo, TAM/SAM/SOM con fuentes |
| estratega-negocio | opus / high | Fundador experimentado y directo |
| copywriter-ventas | sonnet / medium | Persuasivo sin humo |
| prospector-contactos | sonnet / medium | Networker ético; solo información pública, sin violar ToS |
| disenador-presentaciones | sonnet / medium | Narrador visual; usa las skills pptx/artifact disponibles |

**Skills-manual:**
- `manual-escritura`
- `escritura-paper`: estructura, cada claim con su evidencia y un checklist por venue.
- `revision-csv`: incluye `scripts/perfilar-csv.mjs`, que revisa esquema, tipos, nulos, duplicados, encoding y outliers.
- `presentaciones`
- `investigacion-mercado`
- `prospeccion`
- `investigacion-rl`: protocolo de seeds, baselines y reporte de varianza.

## 9. Manejo de errores

- Un hook que falla por un error propio sale con código 0 y deja la herramienta pasar. La excepción son `git-guard` y el tope de Fable/paralelismo, que fallan cerrado solo cuando la regla aplica con certeza.
- Si el log o el estado están corruptos, la línea mala se ignora; nunca se aborta.
- El dashboard se reconecta solo si se cae el SSE.

## 10. Pruebas

Son cuatro capas. Las capas 3 y 4 corresponden al benchmark de §7 y corren solo de forma local, con la cuenta del usuario.

**Capa 2: sondas** (`node bench/sondas.mjs`). Lanzan de 3 a 4 `claude -p` mínimos con un hook "grabador" que guarda el input crudo de cada evento. Verifican:
- El nombre del tool y los campos de `tool_input`, incluyendo si trae `model` y `effort`.
- Los campos de SubagentStop.
- La correlación entre el `tool_use_id` del PreToolUse y el `agent_id`.
- Que el modelo real corresponda a lo pedido.
- Que `--settings` desactive el plugin.

Se corren al empezar la Fase 1 y cada vez que se actualiza Claude Code. Cuestan centavos de uso.

**Capa 1: unit** (`node --test tests/`, gratis, corre en CI). Cada hook es una función pura (`decidir(input, estado, config)`) envuelta por una capa de I/O delgada, y se prueba con fixtures JSON de entrada:
  - `git-guard`: unos 30 casos permitidos y bloqueados, incluyendo heredocs, `&&` y `gh pr create --body-file`.
  - `pre-agent`: la resolución de modelo, el tope de Fable y el de paralelismo.
  - `subagent-stop`: un transcript con modelo distinto debe generar una alerta.
  - La status line: el render y el fallback.
  - El servidor: el replay SSE.
- CI con GitHub Actions: los tests más la validación del frontmatter de agentes y skills y del JSON del plugin y el marketplace.
- E2E manual:
  1. Instalar desde el marketplace y correr `setup`.
  2. Pedir una tarea que genere 2-3 delegaciones con modelos distintos.
  3. Verificar la status line, `events.jsonl` y la animación del dashboard.
  4. Forzar un mismatch y verificar que aparece la alerta.
  5. Verificar que el tercer Fable se bloquea.
  6. Verificar que se bloquean un commit en `main` y un mensaje con Co-Authored-By.

## 11. Proceso del propio repo

- Commit inicial en `main` con README, .gitignore y este spec. Es la única excepción, porque hace falta para crear la rama.
- Después: branch protection en `main` y todo el trabajo por rama `tipo/descripcion` más PR con squash-merge y CI verde.
- Nunca hay coautoría de Claude en commits ni PRs.

## 12. Preguntas abiertas

- ~~Licencia~~ → MIT (decidido 2026-10-12).
- Los precios por modelo para estimar el costo quedan en una tabla dentro de `config.json`, editable.
