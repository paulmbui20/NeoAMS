#!/usr/bin/env bash
# scripts/dev-server.sh — start a throwaway API for the curl sweep.
#
#   scripts/dev-server.sh [port]
#
# The database is thrown away and recreated on every run, so the sweep always
# starts from a fresh installation.
set -euo pipefail
PORT="${1:-3100}"
DIR=/tmp/opencode
mkdir -p "$DIR"

# Refuse to run if something is already listening: a stale server would keep
# serving its own (now deleted) database, and the results would be nonsense.
if ss -ltn 2>/dev/null | grep -q ":${PORT} "; then
  echo "port ${PORT} is already in use; stop that server first" >&2
  exit 1
fi

rm -f "$DIR/curl-test.sqlite" "$DIR/curl-test.sqlite-wal" "$DIR/curl-test.sqlite-shm"

cd "$(dirname "$0")/.."
DB_FILE_NAME="$DIR/curl-test.sqlite" \
PORT="$PORT" \
BETTER_AUTH_SECRET=curl-sweep-secret-0123456789abcdef0123456789abcdef \
BETTER_AUTH_URL="http://localhost:$PORT" \
FRONTEND_URL=http://localhost:5173 \
UPLOAD_DIR="$DIR/curl-uploads" \
  setsid bun src/server.ts > "$DIR/curl-server.log" 2>&1 &
SERVER_PID=$!

# Wait for the server to answer.
for _ in $(seq 1 40); do
  if curl -fs -o /dev/null "http://localhost:$PORT/api/v1/setup/status" 2>/dev/null; then
    echo "ready on http://localhost:$PORT (pid ${SERVER_PID})"
    exit 0
  fi
  sleep 0.25
done
echo "the server did not come up:" >&2
cat "$DIR/curl-server.log" >&2
exit 1
