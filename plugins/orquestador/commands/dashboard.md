---
description: Abre el dashboard en vivo del orquestador (agentes, modelos, esfuerzo, metas, costo)
---

Ejecuta `node "${CLAUDE_PLUGIN_ROOT}/dashboard/lanzar.mjs"` y agrega `--remoto` si el usuario pidió verlo desde otro equipo o desde el celular. Si la variable no se expandió, usa la raíz que está en `~/.claude/orquestador/plugin-root.txt`.

- Sin `--remoto`: responde con la URL que imprime, en una sola línea.
- Con `--remoto`: muestra las URLs remotas tal cual y repite la advertencia de que el enlace equivale a una contraseña. Si el modo remoto está apagado, explica las tres claves de `remoto` en `~/.claude/orquestador/config.json` (`activo`, `escuchar` con la IP de Tailscale y `hostsPermitidos`) y que hay que reabrir el dashboard.
- Si falla porque el puerto está ocupado, muestra el mensaje tal cual.
