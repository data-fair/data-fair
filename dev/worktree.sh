#!/bin/bash

# Usage: ./setup_agent.sh <branch-name>
BRANCH_NAME=$1

if [ -z "$BRANCH_NAME" ]; then
    echo "Error: Please provide a branch name."
    echo "Usage: source dev/worktree.sh feat-xyz"
    exit 1
fi

# 1. Define the path (placing it one level up from the current repo)
REPO_NAME=$(basename "$PWD")
TARGET_DIR="../${REPO_NAME}_${BRANCH_NAME}"

# 2. Create the Git Worktree
echo "Creating worktree at $TARGET_DIR..."
git worktree add -b "$BRANCH_NAME" "$TARGET_DIR" master

# 3. Generate a random port (3000-9000)
RANDOM_NB=$((3000 + RANDOM % 6001))
NGINX_PORT1=
NGINX_PORT2=$((RANDOM_NB + 2))
DEV_PORT=$((RANDOM_NB + 3))
DEV_UI_PORT=$((RANDOM_NB + 4))

# 4. Create the config directory inside the new worktree
CONFIG_DIR="$TARGET_DIR/api/config"
mkdir -p "$CONFIG_DIR"

# 5. Write the local config files
cat <<EOF > "$CONFIG_DIR/local-development.cjs"
module.exports = {
  port: $DEV_PORT,
  mongo: {
    url: 'mongodb://localhost:27017/data-fair-dev-'$BRANCH_NAME
  }
};
EOF
cat <<EOF > "$CONFIG_DIR/local-test.cjs"
module.exports = {
  port: $DEV_PORT,
  mongo: {
    url: 'mongodb://localhost:27017/data-fair-test-'$BRANCH_NAME
  }
};
EOF
# 2. Write the specific variables for this agent
cat <<EOF > "$TARGET_DIR/.env"
WORKTREE=default

NGINX_PORT1=$((RANDOM_NB))
NGINX_PORT2=$((RANDOM_NB + 1))

DEV_API_PORT=$((RANDOM_NB + 10))
DEV_UI_PORT=$((RANDOM_NB + 11))

ES_PORT=$((RANDOM_NB + 20))
MONGO_PORT=$((RANDOM_NB + 21))
S3_PORT=$((RANDOM_NB + 22))
CLAMAV_PORT=$((RANDOM_NB + 23))

SD_PORT=5730$((RANDOM_NB + 30))
EVENTS_PORT=$((RANDOM_NB + 31))
OAV_PORT=$((RANDOM_NB + 32))
CAPTURE_PORT=$((RANDOM_NB + 33))
CATALOGS_PORT=$((RANDOM_NB + 34))
EOF

cd $TARGET_DIR
npm install
source dev/env.sh

echo "-----------------------------------------------"
echo "✅ Setup Complete!"
echo "Location: $TARGET_DIR"
echo "Branch:   $BRANCH_NAME"
echo "-----------------------------------------------"
echo "Next step: opencode $TARGET_DIR"