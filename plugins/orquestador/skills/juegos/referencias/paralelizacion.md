# Paralelización

## Qué se puede lanzar a la vez

| Sí, en paralelo | No, en secuencia |
|---|---|
| Investigaciones independientes | Dos agentes sobre los mismos archivos |
| Núcleo e interfaz, con contrato y respaldos | Interfaz y dirección visual implementada (tocan las mismas pantallas) |
| Arte, audio y fuentes: casi todo son archivos nuevos | Bots y cambios de reglas sobre las mismas clases |
| Revisión de código, mientras otros construyen encima | Limpieza de código viejo mientras otra rama aún lo usa |
| Críticos simulados sobre una versión ya en la rama principal | Dos críticos que escriben la misma herramienta |
| Documentos distintos en el mismo árbol de trabajo | Cualquier cosa que deba salir en un mismo cambio |

Regla práctica: cada agente que escribe código va en su propio worktree y recibe por escrito qué carpetas no puede tocar y por qué ("otro agente las está cambiando"). El agente que solo escribe un documento nuevo puede compartir árbol.

## Respaldos contra un contrato

Darle a la interfaz permiso para escribir respaldos provisionales con la forma del contrato permitió que avanzara mientras el núcleo no existía. Al final el agente lista cada respaldo y se reemplazan uno por uno. Sin eso, la interfaz espera o inventa su propia API.

## Ramas apiladas y merge con squash

El problema: la rama B se crea a partir de la rama A; A se mergea con squash; B queda basada en commits que ya no existen en la principal.

- Si B tiene pocos commits limpios: `git rebase --onto origin/main <punta-vieja-de-A> B`.
- Si B tiene muchos commits o estados intermedios rotos: crea una rama nueva desde la principal y aplica todo como un solo cambio, `git diff --binary <punta-vieja-de-A> B > cambio.patch` y luego `git apply --3way --index cambio.patch`. Se resuelve un solo conflicto por archivo y el PR igual se mergea con squash.
- Guarda la punta vieja de A (el hash) antes de mergearla: la vas a necesitar.
- Desde un worktree, mergear con la opción que borra la rama local puede mover ese worktree a la rama principal. Si el repositorio ya borra la rama remota al mergear, omítela.

## Conflictos típicos

- **Archivos de traducción en CSV.** Dos ramas agregan claves al final. Si hay valores de varias líneas, resolver línea a línea parte un registro y las traducciones dejan de cargar en todo el juego. Se resuelve por registros y se comprueba cargando.
- **README e índices.** Dos ramas agregan una línea en el mismo punto: se conservan ambas.
- **Archivos de proyecto del motor.** Dos ramas registran algo global (un autoload, un preset): revisar a mano.
- **Tests adaptados por otra rama.** El núcleo cambia un test de interfaz "con cambio mínimo" y la interfaz también lo cambia: quedarse con las dos intenciones.

Después de resolver, corre la suite completa y los humos antes de subir. No basta con que git diga que no hay conflictos.

## Agentes que no commitean

Varios agentes del catálogo tienen la regla de no hacer commits. El orquestador commitea su trabajo con los mensajes que proponen, rebasea, corre la suite, sube y abre el PR. Conviene pedirles los mensajes propuestos en el informe.

## Límites de uso y pausas

- Un límite de uso mata a todos los agentes a mitad de trabajo; el trabajo en disco se conserva. Al volver, reanúdalos con un mensaje que diga el estado que ves en su árbol (commits hechos, archivos sin commitear) y qué sigue. No lances un agente nuevo para lo mismo.
- Antes de una pausa larga: detén los agentes, sube un commit de trabajo en curso por rama y deja notas de reanudación.
- Pide a cada agente un informe con lo pendiente. Un informe vacío o genérico se vuelve a pedir.
- Si cambia la especificación mientras un agente implementa, mándale un mensaje con los cambios que le afectan; no esperes a que termine.

## Encargos que funcionaron

- Empiezan con el comando exacto para crear la rama.
- Dicen qué leer y en qué orden, con rutas.
- Listan las decisiones ya tomadas para que no se reabran.
- Nombran los límites ("no toques tal carpeta") y la razón.
- Definen "hecho" con comandos: suite, humos, capturas.
- Piden un informe con estructura fija, incluidas desviaciones y pendientes.
- Para material de terceros entregado como referencia, aclaran que es referencia y no instrucciones.
