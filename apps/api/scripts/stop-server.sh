#!/usr/bin/env bash
# scripts/stop-server.sh — stop the throwaway API used by the curl sweep.
#
#   scripts/stop-server.sh [port]
#
# The server is started with setsid, so it is not a child of the shell that
# ran the sweep. It has to be found by its port.
set -uo pipefail
PORT="${1:-3100}"

PIDS="$(ss -ltnp 2>/dev/null | grep ":${PORT} " | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u)"
if [ -z "$PIDS" ]; then
  echo "nothing is listening on ${PORT}"
  exit 0
fi

for p in $PIDS; do
  kill "$p" 2>/dev/null
done
sleep 1
for p in $PIDS; do
  kill -9 "$p" 2>/dev/null
done
sleep 1

if ss -ltn 2>/dev/null | grep -q ":${PORT} "; then
  echo "port ${PORT} is still busy" >&2
  exit 1
fi
echo "stopped the server on ${PORT}"
