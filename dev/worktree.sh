#!/bin/bash

BRANCH_NAME=$1

if [ -z "$BRANCH_NAME" ]; then
    echo "Error: Please provide a branch name."
    echo "Usage: ./dev/worktree.sh feat-xyz"
    exit 1
fi

SOURCE_BRANCH=$(git branch --show-current)
REPO_NAME=$(basename "$PWD")
TARGET_DIR="../${REPO_NAME}_${BRANCH_NAME}"

echo "Creating worktree at $TARGET_DIR from branch $SOURCE_BRANCH"
git worktree add -b "$BRANCH_NAME" "$TARGET_DIR" $SOURCE_BRANCH

RANDOM_NB=$((3000 + RANDOM % 6001))
echo "Use random port $RANDOM_NB as base"

echo "Create worktree specific .env file"
cat <<EOF > "$TARGET_DIR/.env"
WORKTREE=$BRANCH_NAME

NGINX_PORT1=$((RANDOM_NB))
NGINX_PORT2=$((RANDOM_NB + 1))

DEV_API_PORT=$((RANDOM_NB + 10))
DEV_UI_PORT=$((RANDOM_NB + 11))

ES_PORT=$((RANDOM_NB + 20))
MONGO_PORT=$((RANDOM_NB + 21))
S3_PORT=$((RANDOM_NB + 22))
CLAMAV_PORT=$((RANDOM_NB + 23))

SD_PORT=$((RANDOM_NB + 30))
EVENTS_PORT=$((RANDOM_NB + 31))
OAV_PORT=$((RANDOM_NB + 32))
CAPTURE_PORT=$((RANDOM_NB + 33))
CATALOGS_PORT=$((RANDOM_NB + 34))
EOF

echo "Run npm ci in worktree directory"
cd $TARGET_DIR
npm ci

echo "-----------------------------------------------"
echo "✅ Setup Complete!"
echo "Location: $TARGET_DIR"
echo "Branch:   $BRANCH_NAME"
echo "-----------------------------------------------"
echo "Next step:"
echo "   cd $TARGET_DIR"
echo "   source dev/env.sh"
echo ""