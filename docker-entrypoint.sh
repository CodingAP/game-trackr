#!/bin/sh
set -e

DATA_DIR="/app/backend/data/games"
ACCOUNTS_FILE="/app/backend/data/accounts.json"

if [ ! -f "$ACCOUNTS_FILE" ]; then
  echo "ERROR: No accounts configured inside the container."
  echo ""
  echo "Create backend/data/accounts.json (see backend/data/accounts.example.json):"
  echo "  cp backend/data/accounts.example.json backend/data/accounts.json"
  echo "  # edit backend/data/accounts.json with your username and password"
  exit 1
fi

mkdir -p "$DATA_DIR" /app/backend/data/users
chown -R node:node "$DATA_DIR" /app/backend/data/users

exec su-exec node "$@"
