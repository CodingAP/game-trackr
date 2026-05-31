#!/bin/sh
set -e

DATA_DIR="/app/backend/data/games"

if [ -d /app/.env ]; then
  echo "ERROR: /app/.env is a directory."
  echo "Remove it on the host (rm -rf .env) and create a .env file next to docker-compose.yml."
  exit 1
fi

if [ ! -f /app/.env ]; then
  echo "ERROR: .env file not found."
  echo "Create one on the host: cp .env.example .env"
  exit 1
fi

mkdir -p "$DATA_DIR"
chown -R node:node "$DATA_DIR"

exec su-exec node "$@"
