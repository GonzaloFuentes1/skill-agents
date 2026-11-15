# Flujo por fases y arquitectura

Lo que sigue es lo que se hizo en el caso de origen y si rindió. No es teoría general.

## Fase 0: el marco

- **Pilares.** Seis frases que resuelven discusiones: qué es el juego, qué no es, y qué gana ante la duda. Ejemplos del tipo de pilar que sirvió: "el juego calcula y el jugador decide", "sin tiempo límite", "original: sin copiar nombres, arte ni fórmulas de un referente", "terminable: ante la duda, menos contenido y mejor pulido".
- **Restricciones técnicas.** Escritas antes de la primera línea de código (ver más abajo).
- **Registro de decisiones.** Un archivo con dos series numeradas: las del autor y las del agente. Cada entrada dice la decisión, lo descartado y de dónde salió. Cuando el autor autoriza avanzar sin aprobar cada paso, este archivo es lo que le permite auditar después.
- **Guía del proyecto para agentes.** Fase actual, forma de trabajo, comandos exactos de tests y simulación, mapa del repo y lo que está fuera de alcance. Se actualiza cuando cambia una regla de trabajo.
- **Fuera de alcance, por escrito.** Tienda, progresión entre partidas, móvil, multijugador, arte final. Cada cosa que el autor pide y se recorta queda anotada con dónde vuelve.

## Fase 1: investigación

- Un agente por pregunta, en paralelo: referentes del género, el dominio del juego, la arquitectura del motor, el balance con bots.
- Regla que evitó retrabajo: toda afirmación sobre juegos, herramientas o versiones lleva URL, y lo no confirmado se marca como sin verificar. Se separa hecho, inferencia y propuesta.
- Cada informe pasa por un revisor adversarial antes de usarse. Las revisiones encontraron errores reales (una representación numérica con un bug de igualdad, una curva de dificultad imposible de ganar).

## Fase 2: diseño

- `disenador-mecanicas` escribe la especificación; `revisor-diseno` y `auditor-dominio` la atacan; el diseñador la corrige y sube la versión con una tabla de cambios.
- La especificación incluye una tabla para implementadores con firmas y datos. Sin ella, cada implementador inventa nombres.
- Un modelo en un script pequeño ayuda a detectar estrategias dominantes antes de programar. Su salida se etiqueta como modelo, no como medición.

## Fase 3: el contrato

Antes de lanzar núcleo e interfaz en paralelo, el orquestador escribe y entrega a ambos la lista de campos y métodos que cruzan la frontera: nombre, tipo y significado. La interfaz implementa contra esa lista con respaldos; el núcleo la cumple o avisa. Al integrar, la interfaz reportó tres errores del núcleo que los tests del núcleo no veían.

## Fases 4 a 8

Están en las otras referencias: paralelización, calidad y diseño, arte y audio, publicación.

## Arquitectura que rindió

| Decisión | Por qué rindió |
|---|---|
| Núcleo de reglas puro (sin nodos de escena, reloj ni azar del motor) | Permite tests rápidos, bots, simulación de miles de partidas y críticos que juegan por consola |
| Prueba de frontera | Un test que lee el código del núcleo y falla si aparece una API prohibida; evita que la pureza se erosione |
| Contenido en datos | Calibrar es cambiar un número; los bots y la tienda leen lo mismo que el juego |
| Azar con semilla y flujos separados | Una partida se reproduce desde su semilla; los errores se reportan con semilla y jugada |
| El desglose del resultado como dato | La interfaz explica el puntaje sin recalcularlo y los tests lo comparan paso a paso |
| Números grandes con representación propia | Los juegos de puntaje creciente desbordan los tipos nativos; se prueba la precisión desde el inicio |
| Reglas variables detrás de una interfaz | Permitió comparar dos variantes del tablero con los mismos bots |
| Previsualización exacta | Mostrar el resultado antes de confirmar es lo que vuelve el juego amable; exige que la previsualización no consuma azar |
| Runner de tests propio | Cuando no se pudo traer uno de terceros, uno pequeño con códigos de salida claros bastó |
| CI desde el primer commit | Cada rama se valida igual; con muchas ramas en paralelo es la única garantía |
| Humos headless por pantallas reales | Un script que juega una partida completa por la interfaz detecta lo que los tests unitarios no |

## Lo que no rindió o costó de más

- Diseñar mucho contenido antes de comprobar que el sistema central se entendía. El primer diseño tenía decenas de piezas y los críticos mostraron que casi ninguna se entendía; hubo que rehacer el sistema central.
- Dejar código anterior "como reserva" durante un rediseño es necesario para no romper bots y tests, pero hay que agendar su limpieza o queda para siempre.
- Reescribir el documento de estado a mano: se desactualiza. Mejor que el estado salga del registro de decisiones y de git.
