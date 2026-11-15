---
name: juegos
description: Úsala al empezar o retomar el desarrollo de un juego con subagentes (diseño de reglas, motor, interfaz, balance, arte, audio, playtest). Define el flujo por fases, qué agente del pack de juegos usar en cada una, qué se puede paralelizar y las listas de comprobación antes de lanzar agentes y antes de publicar.
---

# Juegos

Guía para llevar un juego de la idea a una versión de prueba pública orquestando subagentes. Sale de un caso real: un roguelike de cartas hecho en Godot 4 por una sola persona con un orquestador y hasta ocho agentes a la vez. Recoge lo que funcionó y lo que falló. Para decidir modelo y esfuerzo sigue la skill `orquestar`; para git, `flujo-git`.

> Estado de esta guía: llega hasta tener el juego jugable con arte, sonido y críticos simulados. El primer playtest público del caso de origen aún no había ocurrido al escribirla; las partes que dependen de él están marcadas como pendientes.

## Cuándo usarla

- Vas a empezar un juego o a retomar uno a medio hacer.
- Vas a lanzar varios agentes sobre el mismo juego y no quieres que se pisen.
- El juego funciona pero no se entiende, no divierte o se ve como una caja gris.
- Vas a publicar una versión de prueba.

## El flujo que funcionó

| Fase | Qué se hace | Agentes | Barrera para pasar |
|---|---|---|---|
| 0. Marco | Pilares, restricciones y registro de decisiones | (el orquestador) | El autor los aprueba |
| 1. Investigación | Referentes, dominio y arquitectura del motor | `investigador`, `arquitecto-motor` | Cada afirmación con fuente |
| 2. Diseño | Especificación del sistema central | `disenador-mecanicas` | `revisor-diseno` y `auditor-dominio` sin críticos |
| 3. Contrato | Firmas entre núcleo e interfaz | (el orquestador) | Ambos implementadores lo tienen |
| 4. Implementación | Núcleo e interfaz en paralelo, en worktrees | `implementador-reglas`, `implementador-interfaz-juego` | Suite verde y `revisor-codigo` sin mayores |
| 5. Medición | Bots, simulación y calibración | `analista-balance` | Objetivos respaldados por datos |
| 6. Crítica | Panel de críticos simulados sobre el juego jugado | `critico-jugador-nuevo`, `critico-veterano`, `critico-carga-cognitiva` | Imprescindibles arreglados |
| 7. Alma | Dirección visual, ilustraciones y sonido | `director-visual`, `ilustrador-vectorial`, `disenador-audio` | El autor los ve y los oye |
| 8. Playtest | Versión de prueba y feedback real | (el orquestador y el autor) | El autor publica |

Las fases 5 a 7 se repiten en ciclos cortos. La 7 puede empezar en paralelo con la 4, porque casi todo su trabajo son archivos nuevos.

## Reglas que más pesaron

1. **Escribe las decisiones con su alternativa descartada**, separando las del autor de las del agente. Es lo que permite retomar tras una pausa o una compactación de contexto.
2. **El núcleo de reglas es código puro** y se prueba sin ventana. Sin eso no hay bots, ni críticos que jueguen, ni CI.
3. **Fija el contrato antes de paralelizar** y deja que la interfaz avance con respaldos provisionales.
4. **Los tests del implementador no bastan.** Una revisión independiente contra la especificación encontró errores mayores con cerca de novecientos tests en verde.
5. **Audita el dominio antes de implementar nombres.** Corregir un nombre en un documento es barato; en contenido, textos, arte y tests, no.
6. **Mide cada cosa con su instrumento:** los bots miden dificultad, los críticos simulados dan una señal temprana de comprensión, y solo las personas dicen si divierte.
7. **Nada se da por hecho sin verlo:** la suite corrida por ti, la captura abierta, el sonido escuchado por alguien.
8. **Reporta lo que no está verificado** con esas palabras.

## Referencias

Lee solo la que necesites:

- [`referencias/flujo-y-arquitectura.md`](referencias/flujo-y-arquitectura.md): fases en detalle y arquitectura que rindió.
- [`referencias/paralelizacion.md`](referencias/paralelizacion.md): qué lanzar en paralelo, ramas apiladas, conflictos y agentes que se caen.
- [`referencias/calidad-y-diseno.md`](referencias/calidad-y-diseno.md): revisiones, auditorías, críticos simulados y lecciones de diseño.
- [`referencias/arte-y-audio.md`](referencias/arte-y-audio.md): dirección visual, ilustraciones por agente, audio por código, fuentes y licencias.
- [`referencias/godot-4.md`](referencias/godot-4.md): lo aprendido del motor.
- [`referencias/publicacion-y-feedback.md`](referencias/publicacion-y-feedback.md): versión de prueba, comunidades, feedback y trato con el autor.
- [`referencias/listas-de-comprobacion.md`](referencias/listas-de-comprobacion.md): antes de lanzar agentes en paralelo y antes de publicar.
