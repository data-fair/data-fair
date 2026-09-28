#!/usr/bin/env bash
# Run a dev process under a hard total-memory cap, so a runaway one is killed by
# its own cgroup instead of driving the whole host out of memory.
#
# Why not NODE_OPTIONS=--max-old-space-size: the vite dev server's memory is not
# mostly V8. Measured on this app, ~85% of a 2 GiB vite process is rolldown's
# native (Rust/mimalloc) memory; the V8 heap saturates around 270 MiB and stays
# there. A V8 heap limit would never fire before the host died. See
# docs/architecture/dev-resources.md.
#
# No-ops where systemd-run is unavailable (macOS, non-systemd, containers), so
# it is safe to leave in the dev scripts for every contributor.
set -euo pipefail

: "${DEV_MEMORY_MAX:=4G}"

if command -v systemd-run >/dev/null 2>&1 && [ -n "${XDG_RUNTIME_DIR:-}" ] && [ -S "${XDG_RUNTIME_DIR}/systemd/private" ]; then
  # systemd-run resolves the executable itself and does not see the PATH additions
  # npm makes (node_modules/.bin), so resolve it here and pass an absolute path.
  cmd=$(command -v "$1") || { echo "with-memory-cap: command not found: $1" >&2; exit 127; }
  shift
  # --collect: without it every OOM-killed run leaves a lingering failed scope
  # unit that has to be cleared by hand with `systemctl --user reset-failed`.
  exec systemd-run --user --scope --quiet --collect \
    --unit="dev-$(basename "$cmd")-$$" \
    -p MemoryMax="$DEV_MEMORY_MAX" \
    -p MemorySwapMax=0 \
    -- "$cmd" "$@"
fi

exec "$@"
