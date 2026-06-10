#!/usr/bin/env bash
# dev/check-types-ratchet.sh — api tsc errors must never increase.
# check-types is not yet gating (1800+ legacy errors): this ratchet is the
# enforceable substitute until the count reaches 0, then check-types replaces it.
set -e
cd "$(dirname "$0")/.."
count=$(npx tsc 2>&1 | grep -c 'error TS' || true)
baseline=$(cat dev/type-errors-baseline.txt)
echo "api tsc errors: $count (baseline: $baseline)"
if [ "$count" -gt "$baseline" ]; then
  echo "FAIL: type errors increased ($baseline -> $count)"
  npx tsc 2>&1 | grep 'error TS' | head -30
  exit 1
fi
if [ "$count" -lt "$baseline" ]; then
  echo "$count" > dev/type-errors-baseline.txt
  echo "Baseline improved ($baseline -> $count): dev/type-errors-baseline.txt updated, commit it."
fi
