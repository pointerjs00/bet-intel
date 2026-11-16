#!/usr/bin/env bash
# Backup diário de todas as apps no Raspberry Pi. Guarda 7 dias em /srv/backups e,
# se o rclone estiver configurado com o remoto "offsite", envia uma cópia para fora de casa.
# Instalar: sudo cp scripts/pi/backup.sh /srv/backups/backup.sh && sudo chmod +x /srv/backups/backup.sh
# Cron (crontab -e):  0 4 * * * /srv/backups/backup.sh >> /srv/backups/backup.log 2>&1
set -euo pipefail

DEST=/srv/backups/$(date +%F)
mkdir -p "$DEST"
echo "== backup $(date -Is) → $DEST"

# BetIntel: Postgres + avatares
if docker ps --format '{{.Names}}' | grep -q '^betintel-betintel-db-1$'; then
  docker exec betintel-betintel-db-1 pg_dump -U betintel_user -Fc betintel > "$DEST/betintel.dump"
  tar czf "$DEST/betintel-uploads.tgz" -C "${BETINTEL_DATA_DIR:-/srv/betintel/data}" uploads
fi

# Parlay League: Postgres em contentor
if docker ps --format '{{.Names}}' | grep -q '^parlay-league-postgres-1$'; then
  docker exec parlay-league-postgres-1 pg_dump -U parlay -Fc parlay_league > "$DEST/parlay.dump"
fi

# Stream-Intel: SQLite (cópia consistente com .backup)
if [ -f /srv/stream-intel/data/stream_intel.db ]; then
  sqlite3 /srv/stream-intel/data/stream_intel.db ".backup '$DEST/stream_intel.db'"
fi

# Pricetracker: pasta de dados
if [ -d /srv/pricetracker/data ]; then
  tar czf "$DEST/pricetracker-data.tgz" -C /srv/pricetracker data
fi

# Home Assistant: as cópias de segurança são feitas pelo próprio HA; aqui só se copiam, se existirem.
for d in /srv/homeassistant/backups "$HOME/homeassistant/backups"; do
  [ -d "$d" ] && cp -n "$d"/*.tar "$DEST"/ 2>/dev/null || true
done

# Rotação: manter 7 dias
find /srv/backups -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +

# Cópia para fora de casa (opcional)
if command -v rclone >/dev/null && rclone listremotes | grep -q '^offsite:'; then
  rclone sync /srv/backups offsite:pi-backups --exclude 'backup.log'
fi
ls -lh "$DEST"
