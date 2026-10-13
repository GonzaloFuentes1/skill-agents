# skill-agents

Marketplace de Claude Code con el plugin **`orquestador`**. Convierte la sesión principal (Opus o Fable) en un orquestador que delega a subagentes con personalidad. Elige el **modelo y el esfuerzo** de cada delegación según una rúbrica explícita, verifica qué modelo corrió de verdad y lo muestra todo en vivo.

> Estado: fases 1 (núcleo) y 2 (dashboard v2: chat, actividad, configuración y catálogo de agentes) listas. Sigue el benchmark de eficiencia. Diseño: [docs/specs/2026-10-12-orquestador-design.md](docs/specs/2026-10-12-orquestador-design.md).

## Qué hace

- **Ruteo explícito**: haiku, sonnet, opus o fable, más el esfuerzo (skill `orquestar`). Fable tiene un tope por sesión.
- **Hooks** que registran cada delegación (meta, agente, modelo y esfuerzo pedidos, modelo real, tokens y costo) y alertan si el modelo real no coincide con el pedido.
- **Git estricto** por Bash y por PowerShell: rama por tarea, Conventional Commits, PR con CI, squash-merge y sin coautoría de IA.
- **Status line** con el orquestador, los subagentes activos, el uso de Fable y el costo.
- **Dashboard local**: chat con un orquestador propio (permisos con botones, varias conversaciones con historial, planes en pipeline con barreras, avisos del modo automático), detalle en vivo de cada agente, la vista de actividad y las pestañas **Agentes** y **Configuración**. Tema oscuro, con colores que indican el estado y el modelo.
- **Catálogo de 56 agentes** en 9 packs (investigación, datos, machine learning, ingeniería, diseño, infraestructura, escritura, negocio y operación), cada uno con un prompt profesional y reglas comunes. Se activan por agente o por pack desde el dashboard. También puedes crear los tuyos, con ayuda de "Redactar con Claude".

## Instalación

```
/plugin marketplace add GonzaloFuentes1/skill-agents
/plugin install orquestador@skill-agents
/orquestador:setup
```

Requiere Claude Code ≥ 2.1.170 y Node ≥ 20. `setup` muestra los cambios antes de aplicarlos. Después reinicia Claude Code.

## Uso diario

| Comando | Para qué |
|---|---|
| `/orquestador:dashboard` | Abre el dashboard en vivo (`http://127.0.0.1:4321/`) |
| `/orquestador:estado` | Tabla de las delegaciones de la sesión, con modelo real y costo |
| `/orquestador:setup` | Atribución, status line, git hooks y protección de `main` |

En el dashboard:
- **Ver demo** (o `?demo=1`) reproduce una sesión de ejemplo.
- **Animaciones** activa o desactiva los viajes de las tarjetas. Si Windows tiene "Mostrar animaciones" apagado, viene desactivado; actívalo ahí o abre `?animar=1`.
- **Seguir la más reciente** cambia la vista sola cuando empieza otra sesión.

La configuración vive en `~/.claude/orquestador/config.json` y se edita desde la pestaña **Configuración**. Incluye:
- los límites (`paraleloMax`, `fableMaxPorSesion` y `conversacionesMax`);
- los modelos permitidos para el orquestador;
- los permisos por defecto de las conversaciones nuevas (`modoPermisoDefecto`) y qué hacer cuando el modo automático detiene una acción (`alBloquear`);
- la rúbrica de ruteo (si difiere de la de fábrica, se le entrega al orquestador al iniciar cada sesión);
- `mostrarCosto` (también en la status line) y `alertasModelo`;
- los precios, las ramas protegidas, el puerto y el modo remoto.

Además, en el archivo puedes definir `rutaClaude`, la ruta al binario de Claude Code si no está en el PATH. Las claves que el dashboard no conoce se conservan al guardar.

## Dashboard remoto (opcional)

Por defecto, el dashboard solo escucha en `127.0.0.1` y pide una sesión, que se inicia sola al abrirlo con `/orquestador:dashboard`. Para abrirlo desde otro equipo o desde el celular, usa una red privada como Tailscale. Nunca lo expongas a internet abierto.

1. En `~/.claude/orquestador/config.json`, agrega: `"remoto": { "activo": true, "escuchar": "<IP de Tailscale>", "hostsPermitidos": ["<nombre>.ts.net"] }`. El servidor sigue escuchando también en `127.0.0.1` para el navegador de este equipo.
2. Cierra el dashboard y vuelve a abrirlo con `/orquestador:dashboard --remoto`. Imprime un enlace con token.
3. Ese enlace equivale a una contraseña: quien lo tenga puede ejecutar código en tu equipo.

## Modo automático desde el dashboard

La sección **Modo automático** de Configuración edita `autoMode` en `~/.claude/settings.json`, el único lugar donde Claude Code lo lee:
- **Reglas propias.** Tus reglas de "Permitir siempre" y "Detener siempre" y tu entorno de confianza (repos, dominios y organización) se guardan siempre junto a las de fábrica, con `"$defaults"`.
- **Lo que no toca.** El dashboard nunca toca `hard_deny` ni `permissions.allow`/`deny`, y conserva el resto del archivo.
- **Respaldo.** Antes de cada escritura copia el archivo a `settings.json.orquestador.bak`. La primera vez guarda además `settings.json.orquestador.orig.bak`, tu archivo original, que nunca se sobrescribe. Si el JSON está dañado, no escribe.
- **"Revisar mis reglas con Claude".** Ejecuta `claude auto-mode critique` y gasta uso de tu plan; el dashboard pide confirmación.
- **"Restablecer de fábrica".** Ejecuta `claude auto-mode reset -y`, también con confirmación.
- **"También en la terminal".** Escribe `permissions.defaultMode: "auto"` para que tus sesiones de la terminal empiecen en modo automático.

## Contribuir

`main` está protegida. Todo cambio entra por una rama `tipo/descripcion` y un PR con CI verde (Ubuntu y Windows), con squash-merge. Los mensajes siguen [Conventional Commits](https://www.conventionalcommits.org/). Las pruebas se corren con `node --test`.

## Licencia

[MIT](LICENSE)
