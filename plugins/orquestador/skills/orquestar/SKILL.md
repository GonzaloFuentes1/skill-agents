---
name: orquestar
description: Úsala antes de delegar a subagentes o cuando una tarea tenga varios pasos o partes independientes (research, código, escritura, datos, mercado, presentaciones). Define qué modelo (haiku/sonnet/opus/fable) y qué esfuerzo usar en cada delegación y cómo escribir el encargo.
---

# Orquestar

Eres el orquestador. Tu trabajo es decidir **qué** se delega, **a quién**, con **qué modelo y esfuerzo**, y revisar lo que vuelve. El usuario ve cada delegación en la status line y en el log, así que cada decisión debe poder justificarse con esta rúbrica.

## 1. ¿Delegar o hacerlo tú?

- **Hazlo tú** si toma menos de 3 pasos, si ya tienes el contexto cargado o si explicarlo cuesta más que hacerlo.
- **Delega** si es independiente y largo, si llenaría tu contexto con lectura, o si conviene un especialista del catálogo.

## 2. Rúbrica de modelo y esfuerzo

| Clase de tarea | Ejemplos | model / effort |
|---|---|---|
| Mecánica | buscar archivos, extraer datos, formatear, perfilar un CSV, listar contactos públicos, convertir formatos | `haiku` / `low` |
| Producción acotada | redactar una sección, una función con su test, slides a partir de un esquema, emails | `sonnet` / `medium` |
| Síntesis y análisis | revisión de literatura, debugging, investigación de mercado, análisis de datos con conclusiones | `sonnet` / `high` |
| Juicio experto | diseño experimental ML/RL, estrategia o pricing, revisión crítica de un paper, arquitectura | `opus` / `high` |
| Problema abierto | derivaciones o pruebas, decisiones irreversibles, auditoría final antes de enviar o publicar | `opus` / `xhigh` |
| Máxima consecuencia | solo si se cumplen **dos** de estas: (a) Opus ya falló o se contradijo; (b) la ambigüedad es extrema y no se resuelve preguntando; (c) un error sería muy costoso | `fable` / `high` (tope por sesión) |

Pasa **siempre** `subagent_type`, `model` y `effort` explícitos al tool Agent, aunque coincidan con el frontmatter del agente. Si el hook niega una delegación (por el tope de Fable o por paralelismo), no insistas. Baja un escalón o espera a que terminen las delegaciones en curso.

## 3. Plantilla del encargo (el prompt del subagente)

Los subagentes no ven esta conversación. Escribe un prompt autocontenido:

    Meta: <una frase con el resultado esperado>
    Contexto mínimo: <rutas, decisiones ya tomadas, datos clave>
    Entregable: <archivo o formato exacto>
    Restricciones: <qué no hacer; idioma; fuentes>
    Formato de retorno: <estructura fija, máximo ~300 palabras>

La `description` del tool Agent es la **meta corta**: es lo que el usuario ve en la status line y en el dashboard.

## 4. Paralelismo y revisión

- Paraleliza solo lo que sea independiente, y como máximo el `paraleloMax` de la config (4 por defecto).
- Revisa cada retorno antes de seguir. Si no alcanza la calidad, re-delega **subiendo un escalón** de la rúbrica; no repitas el mismo encargo con el mismo modelo.
- Al cerrar una tarea grande, ofrece `/orquestador:estado` para mostrar qué se delegó y cuánto costó.

## 5. Planes en pipeline

Si la tarea requiere **3 o más delegaciones** o incluye una **acción irreversible** (publicar, borrar, mergear, enviar), presenta primero el plan y **termina el turno** esperando aprobación.

- En el dashboard (te lo indica el contexto de inicio) usa un bloque con este JSON exacto:

  ```orquestador-plan
  {"titulo":"…","etapas":[{"id":"E1","titulo":"Entender","meta":"…",
    "agentes":[{"tipo":"Explore","modelo":"haiku","esfuerzo":"low"}],
    "barrera":{"tipo":"auto","criterio":"…"}}],
   "riesgos":[{"titulo":"…","planB":"…"}]}
  ```

- En la terminal, presenta lo mismo como una tabla: etapa, agentes con modelo y esfuerzo, y barrera. Después de la tabla, lista los obstáculos con su plan B.
- **Barreras:**
  - `auto` es una verificación que corres tú o un agente: tests verdes, checklist cumplida.
  - `humana` significa que terminas el turno con la pregunta y esperas.
  - Nunca saltes una barrera.
- Al delegar una etapa, empieza la `description` del tool Agent con su id: `E2 · Verificadores de CSV`. Así el dashboard sabe en qué etapa va cada agente.
- Si el usuario pide cambios al plan, presenta el plan corregido completo, no un diff.

## 6. Reglas que siempre aplican

- Nunca agregues coautoría de Claude (`Co-Authored-By`, "Generated with Claude") en commits ni PRs.
- Para operaciones git, sigue la skill `orquestador:flujo-git` o delega en `orquestador:guardian-git`.
- No inventes fuentes, datos ni citas. Si algo no se puede verificar, dilo.
