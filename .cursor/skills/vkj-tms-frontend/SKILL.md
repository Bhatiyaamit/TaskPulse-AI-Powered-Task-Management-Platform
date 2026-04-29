---
name: vkj-tms-frontend
description: >-
  VKJ TMS React 19 + Vite + TanStack Query frontend. Use when editing pages,
  components, API clients, routing, forms (react-hook-form + zod), tables,
  dashboards, or UX for this repository.
---

# VKJ TMS — Frontend

## Stack

- React 19, Vite 6, TypeScript, React Router 7, TanStack Query + Table, Axios, Tailwind CSS 4, react-hook-form + Zod, Socket.io client, Recharts.

## Layout

| Area | Typical path |
|------|----------------|
| App shell / routes | `src/` (router, layouts) |
| Pages | `src/pages/*.tsx` |
| UI primitives / design system | `src/components/` |
| API and types | `src/lib/`, hooks under `src/` or `src/hooks/` |

## Conventions

1. **Data fetching**: prefer TanStack Query (`useQuery`, `useMutation`) with stable query keys; handle loading and error states in UI.
2. **Forms**: `react-hook-form` + Zod resolvers; reuse existing field and label patterns from nearby pages.
3. **API**: use the project’s axios/instance helpers and cookie-based auth as already configured — do not bypass auth or hardcode tokens.
4. **Styling**: Tailwind utility classes; keep spacing/typography aligned with surrounding components and existing tokens.
5. **Super Admin + company**: UI must send the same tenant context as the rest of the app (company selector / cookies) when calling tenant APIs.
6. **Changes**: minimal diffs; avoid drive-by refactors; match file-local style (imports, naming).

## Checks

```bash
npm run lint
npm run build
```

## Related docs

- Cursor rules: see repository `rules.md` and `.cursor/rules/*.mdc`.
