#!/usr/bin/env bash
# The light pre-push gate, run by .husky/pre-push. The full gate (static checks + the
# whole unit/api/e2e suite) runs on pull requests and nightly on master; `npm run quality`
# still runs it locally on demand. See docs/architecture/testing.md.
#
# api/e2e tests need the dev env up (npx --no df-dev status).
set -euo pipefail
cd "$(dirname "$0")/.."

npm run check-types-ratchet

npx playwright test --project unit --max-failures=1

# the smoke set: a few dozen api/e2e tests over the core flows, tagged @smoke
npx playwright test --project api --project e2e --grep @smoke --max-failures=1

# plus every api/e2e spec file this push adds or modifies. Only the spec files themselves:
# these tests reach the code over HTTP, so an import graph (--only-changed) would not tie
# them to the api/src or ui/src files they exercise.
base=$(git merge-base HEAD origin/master 2>/dev/null || true)
if [ -n "$base" ]; then
  mapfile -t changed < <(git diff --name-only --diff-filter=d "$base" HEAD -- 'tests/**/*.api.spec.ts' 'tests/**/*.e2e.spec.ts')
  if [ ${#changed[@]} -gt 0 ]; then
    echo "changed api/e2e spec files: ${changed[*]}"
    npx playwright test --project api --project e2e --max-failures=1 "${changed[@]}"
  fi
fi
