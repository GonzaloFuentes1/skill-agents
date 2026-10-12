---
description: Configura el orquestador (sin coautoría, status lines, git hooks) y ofrece proteger la rama main
---

Configura el plugin orquestador en este equipo y en el repo actual. La raíz del plugin es `${CLAUDE_PLUGIN_ROOT}`. Si esa variable no se expandió, léela del archivo `~/.claude/orquestador/plugin-root.txt`.

1. Ejecuta `node "<raíz>/scripts/setup.mjs" --repo "<directorio actual>"` (simulación) y muestra al usuario, en una lista breve, los `cambios`, los `conflictos`, la `versionClaude` y si hay git hooks por instalar.
2. Pregunta si aplica. Solo con un sí explícito, ejecuta el mismo comando con `--aplicar`. Si hay un conflicto de status line, pregunta si se reemplaza antes de agregar `--reemplazar-statusline`.
3. Si `versionClaude` indica que hay que actualizar, dile que ejecute `claude update`.
4. Si el repo tiene remoto en GitHub, ofrece proteger `main`. Esto cambia la configuración de GitHub, así que **pide confirmación** y muestra los comandos antes de correrlos:
   - `gh api -X PATCH repos/<owner>/<repo> -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false -F delete_branch_on_merge=true`
   - `gh api -X PUT repos/<owner>/<repo>/branches/main/protection --input <archivo>`, con `{"required_status_checks":null,"enforce_admins":true,"required_pull_request_reviews":{"required_approving_review_count":0},"restrictions":null,"required_linear_history":true,"allow_force_pushes":false,"allow_deletions":false}`
5. Recuerda al usuario reiniciar Claude Code para que la status line tome efecto.
