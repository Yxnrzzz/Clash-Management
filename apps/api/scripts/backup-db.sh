#!/usr/bin/env bash
# Dumps the ClashHub PostgreSQL database and prunes backups older than
# RETENTION_DAYS. Runs pg_dump *inside* the postgres container (via `docker
# exec`) rather than requiring a local Postgres client install — works the
# same whether you're backing up the dev stack (apps/api/docker-compose.yml)
# or the production one (docker-compose.prod.yml at the repo root).
#
# Usage:
#   ./scripts/backup-db.sh                                  # dev container, ./backups
#   CONTAINER=clashhub-postgres-prod ./scripts/backup-db.sh  # prod container
#
# Schedule it with host cron for a daily backup, e.g.:
#   0 2 * * *  cd /path/to/WebApp/apps/api && ./scripts/backup-db.sh >> /var/log/clashhub-backup.log 2>&1
#
# (docker-compose.prod.yml also has a commented-out in-stack alternative
# that runs this same pg_dump command on a loop — see "backup" service.)
set -euo pipefail

CONTAINER="${CONTAINER:-clashhub-postgres}"
POSTGRES_USER="${POSTGRES_USER:-clashuser}"
POSTGRES_DB="${POSTGRES_DB:-clashhub_db}"
BACKUP_DIR="${BACKUP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
FILE="$BACKUP_DIR/clashhub_${TIMESTAMP}.dump"

echo "Backing up ${POSTGRES_DB} from container ${CONTAINER} -> ${FILE}"

# Custom format (-F c): compressed, restorable selectively/in parallel via
# `pg_restore` — unlike a plain SQL dump, restore order/dependencies are
# handled by pg_restore itself.
docker exec "$CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -F c > "$FILE"

echo "Backup written: $(du -h "$FILE" | cut -f1)"

echo "Pruning backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name 'clashhub_*.dump' -mtime "+${RETENTION_DAYS}" -print -delete

echo "Done. Restore with: docker exec -i ${CONTAINER} pg_restore -U ${POSTGRES_USER} -d ${POSTGRES_DB} --clean --if-exists < ${FILE}"
