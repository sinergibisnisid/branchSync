#!/bin/sh
# Cadangan database BranchSync (format custom pg_dump). Jalankan dari folder deploy/.
# Contoh cron harian 02.00:  0 2 * * * cd /opt/branchsync/deploy && ./backup.sh >> backups/backup.log 2>&1
# Pulihkan:  docker compose exec -T db pg_restore -U branchsync -d branchsync --clean --if-exists < backups/<file>.dump
set -eu
cd "$(dirname "$0")"
KEEP_DAYS="${KEEP_DAYS:-14}"
mkdir -p backups
f="backups/branchsync-$(date +%Y%m%d-%H%M%S).dump"
docker compose exec -T db pg_dump -U branchsync -d branchsync -Fc > "$f.tmp"
mv "$f.tmp" "$f"
find backups -name 'branchsync-*.dump' -mtime +"$KEEP_DAYS" -delete
echo "$(date '+%F %T') cadangan dibuat: $f ($(du -h "$f" | cut -f1))"
