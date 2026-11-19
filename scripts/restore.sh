#!/usr/bin/env bash
# scripts/restore.sh — put a backup back.
#
#   scripts/restore.sh <backup-directory> [database-file]
#
# Stop the server first: the database is replaced while nothing is using it.
set -euo pipefail

BACKUP="${1:?usage: restore.sh <backup-directory> [database-file]}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB_FILE="${2:-$ROOT/apps/api/neoams.sqlite}"
UPLOAD_DIR="${3:-$(dirname "$DB_FILE")/uploads}"

if [ ! -f "$BACKUP/neoams.sqlite" ]; then
  echo "there is no neoams.sqlite in $BACKUP" >&2
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1 && [ -f "$BACKUP/neoams.sqlite.sha256" ]; then
  (cd "$BACKUP" && sha256sum -c neoams.sqlite.sha256)
else
  echo "warning: no checksum to verify against" >&2
fi

# The old file is kept, so a bad restore can be undone.
if [ -f "$DB_FILE" ]; then
  mv "$DB_FILE" "$DB_FILE.before-restore"
  echo "the previous database was moved to $DB_FILE.before-restore"
fi
mkdir -p "$(dirname "$DB_FILE")"
cp "$BACKUP/neoams.sqlite" "$DB_FILE"

if [ -d "$BACKUP/uploads" ]; then
  rm -rf "$UPLOAD_DIR"
  mkdir -p "$UPLOAD_DIR"
  cp -a "$BACKUP/uploads/." "$UPLOAD_DIR/"
  echo "the uploaded images were restored into $UPLOAD_DIR"
fi

echo "restored into $DB_FILE — start the server again"
