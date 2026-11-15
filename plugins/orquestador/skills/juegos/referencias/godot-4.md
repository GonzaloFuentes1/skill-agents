# Godot 4: lo aprendido

Observado con Godot 4.7 en Windows, con renderer de compatibilidad y exportación a web y a escritorio. Confirma cada punto en tu versión: son notas de un proyecto, no documentación oficial.

## Ejecución sin ventana

- Los tests, los humos, la simulación, las hojas de contacto y los chequeos de audio corren con el ejecutable de consola en modo headless y un script con `-s`.
- En un clon limpio hay que importar antes de correr. En el caso de origen la primera importación imprimía errores de archivos de traducción y la segunda salía limpia, así que el script de tests importa dos veces.
- Los tests no usan el depurador ni salidas por cantidad de fotogramas: cada script termina por su cuenta con un código de salida.
- Códigos de salida distintos para: todo pasa, hay fallos, cortó el vigilante de tiempo, argumentos inválidos. Un script propio comprueba cada código.
- Rasterizar SVG, cargar fuentes y sintetizar audio funcionan en headless. Las capturas de pantalla de la interfaz necesitan ventana.

## Windows

- Los comandos de tests y simulación van en Git Bash. En PowerShell, `timeout` es otro programa (una pausa) y no corta procesos.
- Guarda la ruta del ejecutable en una variable de entorno fuera del repo y deja la ruta literal como alternativa en la guía del proyecto.

## Cierre con error intermitente

Al cerrar el motor después de corridas largas apareció, de forma intermitente, un fallo de segmentación (código 139) con todo el trabajo ya terminado. La causa no se confirmó. Mitigación usada: el script de simulación acepta ese código si el archivo de manifiesto de la corrida está completo y reintenta si no. Se dejó un script de estrés para reproducirlo.

## Núcleo y tests

- El núcleo usa solo clases sin nodo; los recursos de datos viven en una carpeta de contenido.
- Una prueba de frontera recorre el código del núcleo y falla si encuentra nodos, el generador de azar del motor, el reloj, el sistema operativo, el motor o la función de traducción.
- GDScript con tipado estático en todo. Identificadores y comentarios en inglés; textos visibles externalizados.
- Los archivos `.uid` y `.import` que genera el motor se versionan.
- Leer la propiedad de datos de un stream de audio copia el buffer en cada acceso: léela una vez antes de recorrerla.

## Textos y fuentes

- La fuente por defecto no trae varios símbolos matemáticos ni las figuras geométricas. En la exportación web salen como cajas. Un test que recorre todos los textos contra la fuente lo detecta.
- La cobertura de una fuente se comprueba cargándola en un script y preguntando carácter por carácter; las características OpenType (por ejemplo cifras tabulares) también se pueden listar.
- Los archivos de traducción en CSV admiten valores de varias líneas; cualquier herramienta que los toque debe respetarlos.

## SVG

- El importador rasteriza cada SVG a su tamaño nativo y luego el motor lo escala, lo que se ve borroso. Para dibujar nítido a cada tamaño, rasteriza desde el texto del SVG al tamaño exacto en tiempo de ejecución.
- Eso exige incluir los `.svg` en la exportación como archivos que no son recursos.
- En el caso de origen se evitó el recorte con máscaras y se resolvió dibujando el borde encima. Funcionaron bien formas básicas, trazados con curvas, la regla par-impar, opacidades, trazos discontinuos y transformaciones. No se probaron degradados.
- Nada de texto como elemento de texto: los números y letras dentro de una ilustración se dibujan con trazos.

## Exportación

- Las plantillas de exportación se descargan aparte y pesan mucho: es una descarga que aprueba el autor.
- La exportación web sin hilos es la compatible con los portales de juegos. Condiciona el audio (nada generado en tiempo real, por precaución) y el rendimiento (nada caro por fotograma).
- En web el audio solo arranca después del primer gesto del usuario.
- Un script de exportación deja un zip por plataforma. Prueba la versión web en un navegador real antes de publicarla.
- Avisa a quien juega desde el editor: el acceso directo abre lo que esté en el árbol de trabajo principal, así que ese árbol debe estar en la rama principal actualizada.

## Interfaz

- Resolución de referencia fija y modo de estirado que conserva la proporción.
- Humos que manejan los nodos reales (casillas, botones) en vez de llamar a los métodos internos.
- Tema global en un solo lugar; los colores sueltos en el código se reemplazan por tokens.

## Sin verificar

- El comportamiento del audio con cambio de tono y fundidos en la exportación web.
- El costo real de sombras y de un shader de fondo a pantalla completa en web.
