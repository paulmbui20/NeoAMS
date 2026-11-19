#!/usr/bin/env bash
# scripts/curl-sweep-docker.sh — run the endpoint sweep against the whole
# Docker stack, through Caddy, exactly as a browser would reach it.
#
#   apps/api/scripts/curl-sweep-docker.sh
#
# It uses its own compose project, so its own volumes: the data of a real
# installation is never touched.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PROJECT=neoams-sweep
cd "$ROOT"

export COMPOSE_PROJECT_NAME="$PROJECT"

echo "--- starting the stack ---"
docker compose up -d --build

# Wait for Caddy to answer.
for _ in $(seq 1 60); do
  if curl -fs -o /dev/null -k https://localhost/api/v1/setup/status 2>/dev/null; then
    break
  fi
  sleep 1
done

BASE=https://localhost \
CURL_INSECURE=1 \
ORIGIN="${ORIGIN:-http://localhost:3000}" \
  "$ROOT/apps/api/scripts/curl-sweep.sh"
STATUS=$?

echo
echo "--- stopping the stack (the volumes are kept) ---"
docker compose stop >/dev/null

exit $STATUS
