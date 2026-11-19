#!/usr/bin/env bash
# scripts/backup.sh — a safe, consistent copy of the NeoAMS database.
#
#   scripts/backup.sh [database-file] [destination-directory]
#
# The copy is made with SQLite's own `.backup` command, which takes a lock
# and writes a consistent snapshot even while the server is running. Copying
# the file with `cp` would not: it can catch a half-written WAL.
#
# The uploads are copied next to the database, because an image without its
# booking is half a backup.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB_FILE="${1:-$ROOT/apps/api/neoams.sqlite}"
UPLOAD_DIR="${2:-$(dirname "$DB_FILE")/uploads}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
DEST="${BACKUP_DIR:-$ROOT/backups}/neoams-$STAMP"

if [ ! -f "$DB_FILE" ]; then
  echo "there is no database at $DB_FILE" >&2
  exit 1
fi
if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 is needed: it makes the snapshot while the server is running" >&2
  exit 1
fi

mkdir -p "$DEST"

# The database, as a single consistent file.
sqlite3 "$DB_FILE" ".backup '$DEST/neoams.sqlite'"

# The uploaded images, if there are any.
if [ -d "$UPLOAD_DIR" ]; then
  mkdir -p "$DEST/uploads"
  cp -a "$UPLOAD_DIR/." "$DEST/uploads/"
fi

# A checksum, so a restore can be checked.
if command -v sha256sum >/dev/null 2>&1; then
  (cd "$DEST" && sha256sum neoams.sqlite > neoams.sqlite.sha256)
else
  (cd "$DEST" && shasum -a 256 neoams.sqlite > neoams.sqlite.sha256)
fi

echo "backup written to $DEST"
ls -lh "$DEST"
