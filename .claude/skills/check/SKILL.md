---
description: Run lint, type-check, and tests
user_invocable: true
---

Run all quality checks for this project in sequence. Stop and fix any issues before moving to the next step.

1. `npm run lint-fix`
2. `npm run build-types`
3. `npm run check-types`
4. `npm run test-unit`
4. `npm run test-api`
4. `npm run test-e2e`
