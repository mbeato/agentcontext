---
trigger: glob
globs: src/api/**/*.ts
---

# API handlers

- Validate inputs with zod at the route boundary.
- Return discriminated unions, not throws.
