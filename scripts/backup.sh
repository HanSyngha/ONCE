#!/bin/bash

# ONCE - Database Backup Script
# Usage: ./backup.sh [backup_dir]
#
# This script creates a backup of the PostgreSQL database
# and stores it in the specified directory (or /backups by default)
#
# Recommended: Run via cron job
# Example crontab entry (daily at 2 AM):
# 0 2 * * * /path/to/once/scripts/backup.sh /backups >> /var/log/once-backup.log 2>&1

set -e

# Configuration
BACKUP_DIR="${1:-/backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DB_NAME="${POSTGRES_DB:-once_web}"
DB_USER="${POSTGRES_USER:-once}"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-16003}"
RETENTION_DAYS=30

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

log_info "Starting ONCE database backup..."

# Backup filename
BACKUP_FILE="$BACKUP_DIR/once_web_${TIMESTAMP}.sql.gz"

# Create backup using pg_dump
log_info "Creating backup: $BACKUP_FILE"

if PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --format=plain \
    --no-owner \
    --no-acl \
    | gzip > "$BACKUP_FILE"; then

    # Get backup file size
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    log_info "Backup completed successfully: $BACKUP_FILE ($BACKUP_SIZE)"
else
    log_error "Backup failed!"
    rm -f "$BACKUP_FILE"
    exit 1
fi

# Verify backup file
if [ ! -s "$BACKUP_FILE" ]; then
    log_error "Backup file is empty or does not exist!"
    exit 1
fi

# Clean up old backups
log_info "Cleaning up backups older than $RETENTION_DAYS days..."
OLD_BACKUPS=$(find "$BACKUP_DIR" -name "once_web_*.sql.gz" -type f -mtime +$RETENTION_DAYS)

if [ -n "$OLD_BACKUPS" ]; then
    echo "$OLD_BACKUPS" | while read -r file; do
        log_info "Removing old backup: $file"
        rm -f "$file"
    done
else
    log_info "No old backups to remove."
fi

# List current backups
log_info "Current backups in $BACKUP_DIR:"
ls -lh "$BACKUP_DIR"/once_web_*.sql.gz 2>/dev/null || log_warn "No backups found."

# Calculate total backup size
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
log_info "Total backup directory size: $TOTAL_SIZE"

log_info "Backup process completed."

# Optional: Send notification (uncomment if mail API is configured)
# curl -X POST "$MAIL_API_URL" \
#     -H "Content-Type: application/json" \
#     -d "{
#         \"to\": \"$ADMIN_EMAIL\",
#         \"subject\": \"[ONCE] Daily Backup Completed\",
#         \"body\": \"Backup completed at $(date). Size: $BACKUP_SIZE\"
#     }"

exit 0
