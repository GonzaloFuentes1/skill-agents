# Listas de comprobación

## Antes de lanzar agentes en paralelo

- [ ] Cada agente tiene una tarea que no depende del resultado de otro agente que aún corre.
- [ ] Ningún par de agentes escribe en los mismos archivos. Si comparten carpeta, el encargo dice quién puede tocar qué.
- [ ] Cada agente que escribe código tiene su worktree y su rama, y el encargo empieza con el comando para crearla.
- [ ] Si una rama se basa en otra que se va a mergear con squash, anotaste la punta de la rama base.
- [ ] El contrato entre núcleo e interfaz está escrito y ambos lo recibieron.
- [ ] El encargo dice qué leer, qué decisiones ya están tomadas y qué no reabrir.
- [ ] "Hecho" está definido con comandos (suite, humos, capturas) y el informe tiene estructura fija, con desviaciones y pendientes.
- [ ] Si hay varios agentes corriendo la suite, el encargo sube el tiempo máximo por test.
- [ ] Modelo y esfuerzo elegidos con la rúbrica de `orquestar`, y pasados de forma explícita.
- [ ] Sabes qué harás si un límite de uso corta a los agentes: el trabajo queda en disco y se reanuda con un mensaje.
- [ ] El material de terceros que entregas como referencia está revisado y marcado como referencia.

## Al recibir el trabajo de un agente

- [ ] Leíste el informe completo, incluidas desviaciones y pendientes.
- [ ] Miraste el estado real del árbol: commits, archivos sin commitear, rama.
- [ ] Commiteaste lo que el agente no commitea, con Conventional Commits y sin coautoría de IA.
- [ ] Rebaseaste o trasplantaste sobre la principal y resolviste los conflictos por registro donde hay valores de varias líneas.
- [ ] Corriste tú la suite y los humos después de integrar.
- [ ] Abriste las capturas o escuchaste las muestras, o dijiste que no lo hiciste.
- [ ] Pasaste a quien corresponde los errores que el agente encontró en código ajeno.
- [ ] Registraste las decisiones que tomaste al integrar.

## Antes de construir sobre un núcleo de reglas nuevo

- [ ] Revisión de diseño de la especificación sin críticos abiertos.
- [ ] Auditoría del dominio hecha si hay nombres del mundo real.
- [ ] Revisión de código independiente contra la especificación, con los mayores arreglados y cada arreglo con su test.
- [ ] Determinismo comprobado: misma semilla, mismo resultado; la previsualización no consume azar.
- [ ] Todos los valores calibrables están en datos.

## Antes de publicar una versión de prueba

- [ ] Los objetivos y precios vienen de la calibración con bots, no de la especificación.
- [ ] El panel de críticos jugó esta versión y lo imprescindible está arreglado.
- [ ] El primer encuentro es alcanzable para alguien que aún no entiende el juego.
- [ ] Una partida completa se juega de principio a fin en la versión exportada, no solo en el editor.
- [ ] Probada en un navegador real: carga, textos sin cajas, sonido tras el primer gesto, teclado y ratón.
- [ ] Hay ayuda inicial y los avisos aparecen de a uno.
- [ ] Opciones de volumen, silencio y reducir movimiento.
- [ ] Créditos y licencias de terceros incluidos; registro de terceros al día.
- [ ] Ningún dato personal del autor en el juego, la página ni el repositorio.
- [ ] La página dice que es un prototipo y qué feedback se busca; el enlace o formulario de feedback funciona.
- [ ] Leídas las reglas de cada comunidad donde se va a compartir, incluido lo que digan sobre IA.
- [ ] La página está en borrador y el autor la probó.
- [ ] El autor publica, o aprobó de forma explícita esa publicación.
- [ ] Hay un archivo listo para registrar el feedback de esta versión sin datos personales.

## Después de publicar

> Pendiente: completar con lo aprendido en el primer playtest real.

- [ ] Leer el feedback y registrarlo por versión.
- [ ] Contrastarlo con las notas de los críticos simulados y anotar dónde se equivocaron.
- [ ] Decidir cambios con la regla de dos testers, o un tester y un crítico.
