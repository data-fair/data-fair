#!/usr/bin/env bash
# Start the dev dependencies (mongo, elasticsearch, s3, simple-directory, nginx...) with docker compose.
# Usage: npm run dev-deps [-- <docker compose args, e.g. --profile events>]
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  cp dev/default.env .env
  echo "created .env from dev/default.env (edit .env to override, it is never overwritten)"
fi

# generated code, native module and ui build needed by the api, the ui and the tests, built once
[ -d api/config/type/.type ] || npm run build-types
ls parquet-writer/*.node > /dev/null 2>&1 || npm -w parquet-writer run build
[ -f ui/dist/index.html ] || npm -w ui run build

# simple-directory mounts dev/resources/users.json, rendered from .env
node dev/render-users.mjs

# --scale only applies to "up", the other arguments (e.g. --profile) are global compose options
global_args=()
scale_args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --scale) scale_args+=(--scale "$2"); shift 2 ;;
    --scale=*) scale_args+=("$1"); shift ;;
    *) global_args+=("$1"); shift ;;
  esac
done

# s3-init is a one-shot container: it is kept out of the --wait and run to completion afterwards
docker compose --progress quiet ${global_args[@]+"${global_args[@]}"} up -d --wait --scale s3-init=0 ${scale_args[@]+"${scale_args[@]}"}
docker compose --progress quiet ${global_args[@]+"${global_args[@]}"} run --rm s3-init
