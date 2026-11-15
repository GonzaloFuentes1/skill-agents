# Arte y audio sin presupuesto

Todo lo de esta página se hizo sin gastar y sin assets de terceros, salvo dos fuentes con licencia libre.

## Orden que funcionó

1. **Dirección visual primero** (`director-visual`): un documento con concepto, tokens y estados. Sin él, cada agente elige sus colores.
2. **En paralelo, archivos nuevos:** ilustraciones (`ilustrador-vectorial`), audio (`disenador-audio`) y la búsqueda de fuentes y assets libres (`investigador`).
3. **Al final, la conexión a las pantallas** por el agente que ya conoce la interfaz, en este orden: sonido, tema global, piezas, ilustraciones, coreografía.

## Dirección visual

- El concepto sale de la ficción del juego, no de un referente del género. Se anotan las alternativas descartadas.
- Tokens planos en tablas: paleta con nombre y uso, tipografía, espaciados, radios, sombras y duraciones.
- Contrastes calculados para cada par de texto y fondo. El color nunca es el único canal.
- Todo se dibuja con lo que el motor trae: cajas de estilo, shaders simples, partículas e interpolaciones. Cada efecto con su costo, pensando en la exportación web.
- La coreografía del momento clave lleva tiempos y ganchos de audio con nombre, para que el audio y la interfaz hablen de los mismos eventos.
- Una maqueta estática rápida le sirve al autor para opinar antes de implementar. Hay que decir que es una maqueta y no una captura.

## Ilustraciones hechas por un agente

El bucle que dio resultado:

1. Escribir el SVG a mano, con la paleta de la dirección visual.
2. Rasterizar todas las piezas con un script headless del motor en hojas de contacto: a tamaño grande y al tamaño real de uso, sobre los fondos reales.
3. Abrir las hojas como imagen y criticar cada pieza: si se lee chica, si se distingue de las demás, si es fiel, si tiene carácter.
4. Rehacer las flojas. Tres rondas como mínimo.

Lo que hizo la diferencia:

- **El agente tiene que poder ver.** Un agente sin forma de rasterizar y abrir la imagen entrega diagramas de libro.
- **Rigor verificado por programa.** Cuando la ilustración afirma algo (una cantidad, una vecindad, una proporción), la geometría se genera con un script con aserciones.
- **Cada pieza dibuja su concepto real.** Si no se puede dibujar fiel, se elige otro motivo fiel.
- **Guía de estilo antes de dibujar:** formato por tipo de pieza, trazo, pocos colores por pieza.
- **Test de contenido:** cada pieza del juego tiene su archivo, carga y no usa elementos prohibidos.
- **Autocrítica en el informe:** qué piezas quedaron flojas y qué tamaños no se probaron.

Límites encontrados en el importador de SVG del motor están en la referencia de Godot.

## Audio sintetizado por código

- Un sintetizador pequeño, puro y determinista (osciladores, envolvente, parciales, fundidos) que produce los buffers.
- **Una sola tonalidad y una escala sin semitonos para efectos y música.** Cualquier combinación suena bien y los efectos siempre calzan con la música.
- **El sonido dice algo del juego:** la altura de una nota ligada al valor de la pieza, acordes más ricos para lo más raro, perder suena suave.
- **Todo pregenerado en buffers cortos** al iniciar, con un presupuesto de memoria medido. En el caso de origen se evitó generar audio en tiempo real por la exportación web sin hilos; fue una decisión preventiva y no se midió el problema.
- Una fachada única con eventos con nombre, volúmenes por canal con persistencia, límite de voces y variación leve por reproducción.
- Tests de determinismo, duración, pico y tabla completa de eventos, y un chequeo headless que exporta un archivo por evento.
- **Nadie ha oído nada hasta que una persona lo oye.** Los niveles y timbres salen de números. Hay que mandarle muestras al autor y preguntar.
- El agente no cablea los eventos en las pantallas si otro agente trabaja en ellas: entrega un documento con los puntos de enganche. Ojo con los identificadores: el banco se escribió con nombres provisionales y hubo que agregar alias para los reales.

## Fuentes

- Solo licencias que permiten venta comercial. Para fuentes, la licencia abierta de fuentes; para audio o imágenes, dominio público.
- La cobertura de glifos no se supone: se comprueba con el motor una vez descargado el archivo. En el caso de origen, la fuente de títulos no traía letras griegas ni símbolos matemáticos ni cifras tabulares, y eso decidió el reparto de papeles entre las dos fuentes.
- Las cifras que cambian en pantalla necesitan cifras tabulares, o bailan.
- Los símbolos que ninguna fuente trae se dibujan como polígonos.
- Un test recorre todos los textos visibles y falla si un carácter no existe en la fuente.

## Licencias y descargas

- Cada descarga se pide al autor con nombre de archivo, origen y tamaño, y se hace solo con su aprobación.
- Se descarga a una carpeta vacía y aparte, se comprueba el tamaño contra el publicado y se calcula el hash.
- Registro de terceros por asset: nombre y versión, autor, URL de la página y del texto de licencia, identificador de licencia, fecha, hash, ruta en el repo, si exige atribución y nota de cambios.
- El texto de la licencia se guarda junto al archivo.
- Fuentes de assets que declaran dominio público pero no verifican autoría son un riesgo: guarda evidencia de la página.
- Documentación o skills de terceros se pueden usar como referencia de lectura; no se copian al repo ni se ejecutan sus scripts sin revisarlos, y los agentes las reciben como referencia, no como instrucciones.
