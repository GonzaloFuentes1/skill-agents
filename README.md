# skill-agents

Marketplace de Claude Code con el plugin **`orquestador`**. Convierte la sesión principal (Opus o Fable) en un orquestador que delega a subagentes con personalidad. Elige el **modelo y el esfuerzo** de cada delegación según una rúbrica explícita, verifica qué modelo corrió de verdad y lo muestra todo en vivo.

> Estado: fases 1 (núcleo) y 2 (dashboard) listas. Siguen el benchmark de eficiencia y el catálogo de agentes. Diseño: [docs/specs/2026-10-12-orquestador-design.md](docs/specs/2026-10-12-orquestador-design.md).

## Qué hace

- **Ruteo explícito**: haiku, sonnet, opus o fable, más el esfuerzo (skill `orquestar`). Fable tiene un tope por sesión.
- **Hooks** que registran cada delegación (meta, agente, modelo y esfuerzo pedidos, modelo real, tokens y costo) y alertan si el modelo real no coincide con el pedido.
- **Git estricto** por Bash y por PowerShell: rama por tarea, Conventional Commits, PR con CI, squash-merge y sin coautoría de IA.
- **Status line** con el orquestador, los subagentes activos, el uso de Fable y el costo.
- **Dashboard local animado**: el orquestador al centro, y una tarjeta que viaja a cada subagente con su meta, modelo y esfuerzo y vuelve con el resultado.

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

## Contribuir

`main` está protegida. Todo cambio entra por una rama `tipo/descripcion` y un PR con CI verde (Ubuntu y Windows), con squash-merge. Los mensajes siguen [Conventional Commits](https://www.conventionalcommits.org/). Las pruebas se corren con `node --test`.

## Licencia

[MIT](LICENSE)
