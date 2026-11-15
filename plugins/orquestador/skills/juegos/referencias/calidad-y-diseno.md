# Calidad y diseño

## Por qué los tests del implementador no bastan

En el caso de origen, el núcleo de reglas llegó con cerca de novecientos tests en verde. Una revisión independiente contra la especificación encontró dos errores mayores y siete menores, y la integración con la interfaz encontró tres más. Los tests comprobaban lo que el implementador entendió, no lo que la especificación decía.

Lo que sí funcionó:

- **Revisión de código independiente** (`revisor-codigo`), con la especificación y las decisiones como vara, que ejecuta cada caso antes de reportarlo y separa "ejecutado" de "leído". Prioridades: reglas mal implementadas, determinismo, errores de ejecución, deuda.
- **Integración temprana.** La interfaz usa el núcleo de otra forma que sus tests y ve cosas distintas.
- **Humos que juegan partidas completas** por las pantallas reales.
- **El orquestador corre la suite él mismo** después de cada integración. El informe de un agente es un informe, no una prueba.
- **Arreglos en una rama aparte**, cada uno con su test, y la limpieza de código viejo en otro cambio posterior.

## Revisión adversarial de documentos

Todo documento que decide algo (arquitectura, especificación) pasa por `revisor-diseno` antes de implementarse. Lo más valioso que encontró: una definición que no coincidía con el código existente, reglas con dos lecturas, un nombre que afirmaba algo falso y un modelo que no modelaba lo que el texto decía.

## Auditoría del dominio

Si el juego toma nombres de un dominio real, `auditor-dominio` revisa cada uno antes de implementar. En el caso de origen no encontró nada crítico, pero sí dos elementos que enseñaban el concepto al revés y una ambigüedad de definición con consecuencias en el puntaje. Dos lecciones:

- Lo comprobable se comprueba con un script (enumerar, contar), no con intuición.
- Entre un nombre exacto que nadie reconoce y uno conocido con la metáfora declarada, suele convenir el segundo. Es una decisión de diseño y se registra.

## El panel de críticos simulados

Tres agentes con personajes distintos, las mismas preguntas en cada ronda y notas que se llevan en una tabla:

| Crítico | Mide | Cómo |
|---|---|---|
| `critico-jugador-nuevo` | Si se entiende, dificultad percibida, diversión | Juega partidas reales por consola sin leer el diseño |
| `critico-veterano` | Claridad, profundidad, diversión, rejugabilidad | Lee el diseño, busca la estrategia dominante, compara con referentes |
| `critico-carga-cognitiva` | Reglas, palabras y elementos nuevos por momento | Cuenta sobre los textos, los datos y las capturas |

### Lo que cambiaron en el diseño

- **Combinaciones que cualquiera entiende.** El primer diseño pedía entender el efecto de cada pieza; el jugador nuevo no entendía casi ninguna. Se rehízo el sistema central sobre atributos visibles y combinaciones simples, con la profundidad en cómo se combinan.
- **Menos reglas en el primer nivel.** Al contar por momento apareció que el primer nivel presentaba mucho más de lo razonable. Se movieron sistemas enteros al segundo nivel.
- **Un botón de ayuda que decidía demasiado.** Un botón que ordenaba la jugada por el jugador le quitaba la decisión central. Se limitó a lo que el jugador no fija.
- **Economía copiada de un referente.** Se reemplazó por una propia que premia lo que el juego quiere que se haga.
- **Estrategia dominante.** Una forma de modificar el mazo ganaba siempre; se cerró con una regla general, no con una excepción.
- **Encuentros que se cerraban en el primer turno.** Señal de objetivos mal puestos, que luego calibran los bots.
- **Nombres honestos.** Un vocablo que nombraba a la vez una pieza y la moneda; una regla descrita con una palabra que no era cierta.

### Sus límites

- No son personas: calculan mejor que un jugador real, no se cansan, no se frustran y recuerdan todo entre partidas.
- Una nota sobre un documento no vale lo que una nota sobre el juego jugado. Anota siempre sobre qué se opinó.
- Tienden a pedir más contenido. La regla del proyecto fue recortar para terminar.
- El conteo de reglas del propio documento de diseño no cuenta como medición hasta que un crítico lo repite sobre la implementación.

### Cómo combinarlos con testers reales

Regla usada: un problema entra a la lista de cambios si lo reportan dos testers reales, o un tester real y un crítico simulado. Si se contradicen, mandan los testers. Los bots miden dificultad y balance; críticos y testers, comprensión y diversión.

> Pendiente: esta regla aún no se había probado con feedback real al escribir la guía.

## Lecciones de diseño

- Cuenta las reglas por momento, no en total. Una regla nueva por momento.
- Lo que el jugador no ve no existe: muestra el resultado antes de confirmar y explica de dónde sale.
- Cierra cada caso ambiguo con un ejemplo concreto en la especificación. Los implementadores y los revisores trabajan sobre esos ejemplos.
- Prefiere una regla sin excepciones aunque sea algo menos fina: se recuerda mejor.
- Marca cada número como semilla hasta que los bots lo calibren.
- Recorta para terminar, y deja por escrito dónde vuelve lo recortado. Si el autor lo había pedido, díselo de forma explícita.
- Un diseño no está validado porque sus autores lo crean: en el caso de origen el autor votó por una opción, los críticos por otra, y el autor eligió seguir a los críticos.
