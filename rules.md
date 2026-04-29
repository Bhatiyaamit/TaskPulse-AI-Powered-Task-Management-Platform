# VKJ TMS — Frontend rules index

This document lists **Cursor project rules** and **agent skills** for this repository (`vkj-tms-frontend`).

## Cursor rules (`/.cursor/rules/`)

| File | When it applies |
|------|-----------------|
| `00-frontend-core.mdc` | Every session (`alwaysApply: true`) — data fetching, tenant context, QA |
| `frontend-react-tsx.mdc` | When editing `src/**/*.tsx` — React, Tailwind, forms, tables |

Rules use `.mdc` with YAML frontmatter (see Cursor: **Rules** / project rules).

## Agent skill (`/.cursor/skills/vkj-tms-frontend/SKILL.md`)

- **Purpose**: Repo-specific frontend context — React 19, Vite, TanStack Query, axios, UX patterns.
- **Usage**: Cursor loads project skills when relevant; discovery uses the YAML `description` field.

## Standards summary

| Topic | Guidance |
|-------|----------|
| Data | TanStack Query; predictable query keys |
| Forms | react-hook-form + Zod |
| Styling | Tailwind; reuse existing primitives |
| Verification | `npm run lint`, `npm run build` |

For team-wide prose standards (commit messages, review tone), mirror your org’s process docs.
