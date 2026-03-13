#!/bin/bash

# SQLite 데이터베이스 백업 스크립트
# Usage: ./scripts/backup_db.sh [DB_PATH] [BACKUP_DIR]

DB_PATH=${1:-"./data/apm.db"}
BACKUP_DIR=${2:-"./data/backups"}
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DB_NAME=$(basename "$DB_PATH")
BACKUP_PATH="$BACKUP_DIR/${DB_NAME}_backup_$TIMESTAMP"

mkdir -p "$BACKUP_DIR"

if [ -f "$DB_PATH" ]; then
    echo "Backing up $DB_PATH to $BACKUP_PATH..."
    cp "$DB_PATH" "$BACKUP_PATH"
    # WAL, SHM 파일이 있으면 함께 백업
    [ -f "${DB_PATH}-wal" ] && cp "${DB_PATH}-wal" "${BACKUP_PATH}-wal"
    [ -f "${DB_PATH}-shm" ] && cp "${DB_PATH}-shm" "${BACKUP_PATH}-shm"
    echo "Backup completed successfully."
else
    echo "Error: Database file $DB_PATH not found."
    exit 1
fi
