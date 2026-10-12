# skill-agents

Marketplace de Claude Code con el plugin **`orquestador`**: convierte la sesión principal (Opus/Fable) en un orquestador que delega a subagentes con personalidad, eligiendo **modelo y esfuerzo** según una rúbrica explícita, verificando qué modelo corrió de verdad y mostrándolo todo en vivo.

> Estado: en diseño. Ver [docs/specs/2026-10-12-orquestador-design.md](docs/specs/2026-10-12-orquestador-design.md).

## Qué hará

- **Ruteo explícito** haiku / sonnet / opus / fable + esfuerzo, con tope de Fable por sesión.
- **Hooks** que registran cada delegación (meta, agente, modelo, esfuerzo) y alertan si el modelo real no coincide.
- **Status line** y **dashboard local animado**: el orquestador al centro entregando tareas a cada subagente.
- **Git estricto**: rama por tarea, Conventional Commits, PR + CI, squash-merge, sin coautoría de IA.
- **Catálogo de agentes** para MLE/RL, papers, mercado, ventas, contactos, empresa y presentaciones.
- **Benchmark de eficiencia**: problemas reales, vanilla vs orquestador, corrido con tu propia cuenta.

## Instalación (cuando esté publicado)

```
/plugin marketplace add GonzaloFuentes1/skill-agents
/plugin install orquestador@skill-agents
/orquestador:setup
```

Requiere Claude Code ≥ 2.1.170 y Node ≥ 20.

## Contribuir

`main` está protegida: todo cambio entra por rama `tipo/descripcion` + PR con CI verde + squash-merge. Mensajes en [Conventional Commits](https://www.conventionalcommits.org/).

## Licencia

[MIT](LICENSE)
