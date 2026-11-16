#!/usr/bin/env bash
# Minimal dev environment: dependencies, mock server, api and ui, in one terminal. Ctrl+C stops them.
# Usage: npm run dev [-- <docker compose args>]
set -euo pipefail
cd "$(dirname "$0")/.."

bash dev/deps.sh "$@"

set -a
. ./.env
set +a

mkdir -p dev/logs
pids=()
cleanup () {
  trap - EXIT INT TERM
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# optional containers that do not run are unplugged from the config (dev/dev.json "optional")
NODE_CONFIG=$(./node_modules/.bin/df-dev absent-config)
export NODE_CONFIG

FORCE_COLOR=1 node --experimental-strip-types --disable-warning=ExperimentalWarning dev/mock-server.ts > dev/logs/mock.log 2>&1 &
pids+=($!)
(cd api && FORCE_COLOR=1 MODE=server_worker NODE_ENV=development EVENTS_LOG_LEVEL=error exec ../node_modules/.bin/nodemon -e js,mjs,ts,json index.ts > ../dev/logs/api.log 2>&1) &
pids+=($!)
(cd ui && FORCE_COLOR=1 NODE_CONFIG_DIR=../api/config/ exec ../node_modules/.bin/vite --port "$DEV_UI_PORT" > ../dev/logs/ui.log 2>&1) &
pids+=($!)

echo "logs in dev/logs (mock.log, api.log, ui.log)"
echo "dev server available at http://$DEV_HOST:$NGINX_PORT/data-fair/"
wait
