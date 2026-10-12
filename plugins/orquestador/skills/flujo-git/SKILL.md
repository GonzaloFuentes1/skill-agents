---
name: flujo-git
description: Úsala para cualquier commit, push, pull request o merge. Define el flujo estricto (rama por tarea, Conventional Commits, PR con CI, squash-merge, sin coautoría de IA).
---

# Flujo git estricto

Los hooks del orquestador **bloquean** lo que viole estas reglas. Seguirlas evita reintentos.

1. **Nunca** se commitea ni se hace push a `main` o `master`. Crea una rama: `git switch -c <tipo>/<descripcion-corta>`.
2. Los mensajes siguen Conventional Commits: `tipo(ámbito opcional): descripción en minúscula`. Tipos: feat, fix, docs, style, refactor, perf, test, build, ci, chore y revert.
3. **Sin** `Co-Authored-By` de Claude, sin `noreply@anthropic.com` y sin "Generated with Claude" en commits ni PRs.
4. Prohibido: `--no-verify`, `-n` en commit, force-push a ramas protegidas y `gh pr merge --admin`.
5. Sube la rama (`git push -u origin <rama>`) y abre el PR: `gh pr create --title "<tipo>: <descripción>" --body "<resumen y cómo se probó>"`. El título del PR será el mensaje del commit final, así que debe ser Conventional.
6. Mergea solo con CI verde y con squash: `gh pr merge <n> --squash --delete-branch`.

Plantilla del cuerpo del PR:

    ## Resumen
    <qué cambia y por qué, 1-3 viñetas>

    ## Cómo se probó
    <comandos ejecutados y resultado>
