# Skills

User-invokable workflows. Each skill is a `<name>/SKILL.md` file with YAML frontmatter. When the user types `/name` in Claude Code, Claude reads the SKILL.md and follows its instructions.

## Anatomy of a skill

```markdown
---
name: skill-name
description: One-line hook describing when to use this skill
---

# Skill Name

## When to use

Plain English: "Use this when the user asks to X."

## Steps

1. Numbered, explicit steps.
2. Reference files, commands, expected outputs.
3. Each step should be executable.

## Common pitfalls

- Gotchas Claude should watch for.
```

## Skills in this repo

| Skill | Purpose |
|---|---|
| [`new-route/`](new-route/SKILL.md) | Scaffold a new API route with test and registration |
| [`deploy-check/`](deploy-check/SKILL.md) | Pre-flight validation before a production deploy |
| [`schema-diff/`](schema-diff/SKILL.md) | Preview a DB schema change and migration impact |
| [`elevator-sim/`](elevator-sim/SKILL.md) | Run the elevator button emulator simulator |
