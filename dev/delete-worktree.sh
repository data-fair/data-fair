#!/bin/bash

BRANCH_NAME=$1

if [ -z "$BRANCH_NAME" ]; then
    echo "Error: Please provide a branch name."
    echo "Usage: ./dev/delete-worktree.sh feat-xyz"
    exit 1
fi

REPO_NAME=$(basename "$PWD")
TARGET_DIR="../${REPO_NAME}_${BRANCH_NAME}"

if [ ! -d "$TARGET_DIR" ]; then
    echo "Error: Worktree directory $TARGET_DIR does not exist."
    exit 1
fi

echo "Stopping docker compose services in $TARGET_DIR"
cd "$TARGET_DIR"
docker compose --profile dev down

echo "Removing git worktree at $TARGET_DIR"
cd "$PWD"
git worktree remove "$TARGET_DIR"

echo "-----------------------------------------------"
echo "✅ Worktree $BRANCH_NAME deleted!"
echo "-----------------------------------------------"
