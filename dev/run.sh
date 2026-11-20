#!/usr/bin/env bash
# Minimal dev environment: dependencies, mock server, api and ui, in one terminal. Ctrl+C stops them.
# Usage: npm run dev [-- <docker compose args>]
set -euo pipefail
cd "$(dirname "$0")/.."

bash dev/deps.sh "$@"

# the global compose options (e.g. --profile events) given to dev/deps.sh also select the services seen here
compose_args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --scale) shift 2 ;;
    --scale=*) shift ;;
    *) compose_args+=("$1"); shift ;;
  esac
done

set -a
. ./.env
set +a

mkdir -p dev/logs
set -m
pids=()
cleanup () {
  trap - EXIT INT TERM
  # each process runs in its own process group (set -m): stop npm and what it started
  for pid in "${pids[@]}"; do kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# an optional service is absent when its port variable is empty: blank the ones whose container does not run
running=$(docker compose ${compose_args[@]+"${compose_args[@]}"} ps --services --status running)
for entry in events:EVENTS_PORT agents:AGENTS_PORT registry:REGISTRY_PORT capture:CAPTURE_PORT openapi-viewer:OAV_PORT; do
  if ! grep -qx "${entry%%:*}" <<< "$running"; then export "${entry##*:}="; fi
done

npm run dev:mock < /dev/null > dev/logs/mock.log 2>&1 &
pids+=($!)
npm run dev:api < /dev/null > dev/logs/api.log 2>&1 &
pids+=($!)
npm run dev:ui < /dev/null > dev/logs/ui.log 2>&1 &
pids+=($!)

echo "logs in dev/logs (mock.log, api.log, ui.log)"
echo "dev server available at http://$DEV_HOST:$NGINX_PORT/data-fair/"
# stop everything as soon as one process exits
wait -n || true
