#!/usr/bin/env bash
# List the docker compose stacks running on this machine, with their memory
# footprint (RAM + swap) and whether a dev API is listening for them.
# A stack whose API is down is idle: its containers still hold memory for
# nothing. Read-only — it prints each stack's stop command, it never runs it.
# See docs/architecture/dev-resources.md.

set -euo pipefail

listening=$(ss -ltnH 2>/dev/null | awk '{print $4}' | sed 's/.*://' | sort -u)
# working dirs of nodemon processes: a dev API is not listening yet while it
# boots, or between two restarts, but its nodemon supervisor is already there
nodemon_dirs=$(for pid in $(pgrep -f 'node_modules/.bin/nodemon' || true); do readlink "/proc/$pid/cwd" 2>/dev/null || true; done)

printf "%-40s %9s  %-36s %s\n" "PROJECT" "MEMORY" "STATE" "STOP COMMAND"
docker compose ls --format json | python3 -c 'import json,sys; [print(p["Name"]) for p in json.load(sys.stdin)]' | while read -r project; do
  total=0
  dir=""
  for id in $(docker ps -q --no-trunc --filter "label=com.docker.compose.project=$project"); do
    [ -z "$dir" ] && dir=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$id")
    cg="/sys/fs/cgroup/system.slice/docker-$id.scope"
    [ -r "$cg/memory.current" ] || continue
    total=$((total + $(cat "$cg/memory.current") + $(cat "$cg/memory.swap.current" 2>/dev/null || echo 0)))
  done
  state="unknown (no DEV_API_PORT)"
  port=$(grep -s '^DEV_API_PORT=' "$dir/.env" | cut -d= -f2 || true)
  if [ -n "$port" ]; then
    if grep -qx "$port" <<< "$listening"; then
      state="active (api on :$port)"
    elif grep -q "^$dir\(/\|$\)" <<< "$nodemon_dirs"; then
      # the dev-api supervisor runs, the API is booting or restarting
      state="active (api starting)"
    else
      state="IDLE"
    fi
  fi
  printf "%-40s %7dMB  %-36s %s\n" "$project" $((total / 1048576)) "$state" "docker compose -p $project stop"
done
