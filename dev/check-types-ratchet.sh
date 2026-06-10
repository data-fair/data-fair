#!/usr/bin/env bash
# dev/check-types-ratchet.sh — api tsc errors must never increase.
# check-types is not yet gating (1800+ legacy errors): this ratchet is the
# enforceable substitute until the count reaches 0, then check-types replaces it.
set -e
cd "$(dirname "$0")/.."
output=$(npx tsc 2>&1) && tsc_status=0 || tsc_status=$?
count=$(grep -c 'error TS' <<<"$output" || true)
if [ "$tsc_status" -ne 0 ] && [ "$count" -eq 0 ]; then
  echo "FAIL: tsc exited $tsc_status without TS diagnostics (crash?)"
  echo "$output" | head -20
  exit 1
fi
baseline=$(cat dev/type-errors-baseline.txt)
if ! [[ "$baseline" =~ ^[0-9]+$ ]]; then
  echo "FAIL: invalid baseline in dev/type-errors-baseline.txt: '$baseline'"
  exit 1
fi
echo "api tsc errors: $count (baseline: $baseline)"
if [ "$count" -gt "$baseline" ]; then
  echo "FAIL: type errors increased ($baseline -> $count)"
  grep 'error TS' <<<"$output" | head -30
  exit 1
fi
if [ "$count" -lt "$baseline" ]; then
  echo "$count" > dev/type-errors-baseline.txt
  echo "Baseline improved ($baseline -> $count): dev/type-errors-baseline.txt updated, commit it."
fi
