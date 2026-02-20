# 1. Load defaults first
set -a
source dev/default.env
set +a

# 2. Override with worktree-specific settings
[ -f .env ] && source .env

if [ -f ".env" ]; then
  set -a
  source .env
  set +a
  echo "✅ Loaded worktree specific env"
fi

export COMPOSE_PROJECT_NAME="data-fair-${WORKTREE}"