# skill-agents

Marketplace de Claude Code con el plugin **`orquestador`**. Convierte la sesión principal (Opus o Fable) en un orquestador que delega a subagentes con personalidad. Elige el **modelo y el esfuerzo** de cada delegación según una rúbrica explícita, verifica qué modelo corrió de verdad y lo muestra todo en vivo.

> Estado: fases 1 (núcleo) y 2 (dashboard) listas. Siguen el benchmark de eficiencia y el catálogo de agentes. Diseño: [docs/specs/2026-10-12-orquestador-design.md](docs/specs/2026-10-12-orquestador-design.md).

## Qué hace

- **Ruteo explícito**: haiku, sonnet, opus o fable, más el esfuerzo (skill `orquestar`). Fable tiene un tope por sesión.
- **Hooks** que registran cada delegación (meta, agente, modelo y esfuerzo pedidos, modelo real, tokens y costo) y alertan si el modelo real no coincide con el pedido.
- **Git estricto** por Bash y por PowerShell: rama por tarea, Conventional Commits, PR con CI, squash-merge y sin coautoría de IA.
- **Status line** con el orquestador, los subagentes activos, el uso de Fable y el costo.
- **Dashboard local**: chat con un orquestador propio (permisos con botones, varias conversaciones con historial, planes en pipeline con barreras), detalle en vivo de cada agente y la vista animada de actividad. Tema oscuro, con colores que indican el estado y el modelo.

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

La configuración está en `~/.claude/orquestador/config.json`: `fableMaxPorSesion`, `paraleloMax`, `puertoDashboard`, `ramasProtegidas` y `precios`.

## Dashboard remoto (opcional)

Por defecto, el dashboard solo escucha en `127.0.0.1` y pide una sesión, que se inicia sola al abrirlo con `/orquestador:dashboard`. Para abrirlo desde otro equipo o desde el celular, usa una red privada como Tailscale. Nunca lo expongas a internet abierto.

1. En `~/.claude/orquestador/config.json`, agrega: `"remoto": { "activo": true, "escuchar": "<IP de Tailscale>", "hostsPermitidos": ["<nombre>.ts.net"] }`.
2. Cierra el dashboard y vuelve a abrirlo con `/orquestador:dashboard --remoto`. Imprime un enlace con token.
3. Ese enlace equivale a una contraseña: quien lo tenga puede ejecutar código en tu equipo.

## Contribuir

`main` está protegida. Todo cambio entra por una rama `tipo/descripcion` y un PR con CI verde (Ubuntu y Windows), con squash-merge. Los mensajes siguen [Conventional Commits](https://www.conventionalcommits.org/). Las pruebas se corren con `node --test`.

## Licencia

[MIT](LICENSE)
