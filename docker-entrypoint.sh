#!/bin/sh
set -e

DATA_DIR="/app/backend/data/games"

if [ -z "${ADMIN_PASSWORD:-}" ]; then
  echo "ERROR: ADMIN_PASSWORD is not set inside the container."
  echo ""
  echo "On the host, check your .env file next to docker-compose.yml:"
  echo "  grep ADMIN_PASSWORD .env"
  echo "  docker compose config | grep ADMIN_PASSWORD"
  echo ""
  echo "Then recreate the container (restart alone is not enough):"
  echo "  docker compose down && docker compose up -d --build"
  exit 1
fi

mkdir -p "$DATA_DIR"
chown -R node:node "$DATA_DIR"

exec su-exec node "$@"
