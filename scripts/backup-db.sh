#!/bin/bash
# Backup otomatis database onezentra_warehouse.
# Dijadwalkan via LaunchAgent: ~/Library/LaunchAgents/com.onezentra.dbbackup.plist
# Kredensial dibaca dari .env project (sumber tunggal), tidak di-hardcode di sini.

set -u

PROJECT_DIR="/Users/langkaukami/onezentra-warehouse-system"
ENV_FILE="$PROJECT_DIR/.env"
BACKUP_DIR="$HOME/db-backups/onezentra"
ICLOUD_DIR="$HOME/Library/Mobile Documents/com~apple~CloudDocs/db-backups/onezentra"
MYSQLDUMP="/Applications/XAMPP/xamppfiles/bin/mysqldump"
RETAIN_COUNT=30
LOG_FILE="$HOME/db-backups/backup.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"; }

mkdir -p "$BACKUP_DIR" "$ICLOUD_DIR"

if [ ! -f "$ENV_FILE" ]; then
  log "ERROR: .env tidak ditemukan di $ENV_FILE"
  exit 1
fi

DB_DATABASE=$(grep '^DB_DATABASE=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' | tr -d "'")
DB_USERNAME=$(grep '^DB_USERNAME=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' | tr -d "'")
DB_PASSWORD=$(grep '^DB_PASSWORD=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' | tr -d "'")
DB_HOST=$(grep '^DB_HOST=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' | tr -d "'")
DB_PORT=$(grep '^DB_PORT=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' | tr -d "'")

STAMP=$(date '+%Y-%m-%d_%H%M')
TARGET="$BACKUP_DIR/${DB_DATABASE}_${STAMP}.sql.gz"

# MYSQL_PWD dipakai agar password tidak muncul di daftar proses.
if MYSQL_PWD="$DB_PASSWORD" "$MYSQLDUMP" \
    -h "${DB_HOST:-127.0.0.1}" -P "${DB_PORT:-3306}" \
    -u "$DB_USERNAME" \
    --single-transaction --quick --routines --triggers --events \
    "$DB_DATABASE" | gzip > "$TARGET"; then
  SIZE=$(du -h "$TARGET" | cut -f1 | tr -d ' ')
  log "OK: $TARGET ($SIZE)"

  # Cerminan ke iCloud Drive agar aman jika Mac hilang/rusak.
  LATEST="$ICLOUD_DIR/${DB_DATABASE}_latest.sql.gz"
  cp "$TARGET" "$LATEST" && log "OK: dicerminkan ke iCloud ($LATEST)"

  # Simpan hanya RETAIN_COUNT dump terbaru di folder lokal.
  ls -t "$BACKUP_DIR"/${DB_DATABASE}_*.sql.gz 2>/dev/null | tail -n +$((RETAIN_COUNT + 1)) | while read -r old; do
    rm -f "$old" && log "Pruned: $old"
  done
else
  log "ERROR: mysqldump gagal untuk $DB_DATABASE"
  rm -f "$TARGET"
  exit 1
fi
