#!/usr/bin/env bash
# Idempotent builds needed before the dev processes and the tests: generated types, native module, ui build. No containers.
# Usage: npm run dev-setup
set -euo pipefail
cd "$(dirname "$0")/.."

[ -d api/config/type/.type ] || npm run build-types
ls parquet-writer/*.node > /dev/null 2>&1 || npm -w parquet-writer run build
[ -f ui/dist/index.html ] || npm -w ui run build
