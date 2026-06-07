#!/usr/bin/env bash
#
# Lentik — шифрованные бэкапы (фикс #1).
# Снимает дамп Postgres + архив загрузок, упаковывает в один tar, шифрует
# симметрично GPG AES-256 (с MDC-целостностью) и кладёт в /backups с ротацией.
# Опционально заливает копию в S3-совместимое хранилище.
#
# Режимы:
#   backup.sh          — демон: бэкап сразу, затем каждые BACKUP_INTERVAL_HOURS
#   backup.sh once     — один прогон и выход
#
set -euo pipefail

BACKUP_DIR="/backups"
UPLOADS_DIR="/data/uploads"
TMP_DIR="${BACKUP_DIR}/.tmp"
STATUS_FILE="${BACKUP_DIR}/last_status"

INTERVAL_HOURS="${BACKUP_INTERVAL_HOURS:-24}"
RETENTION_DAILY="${BACKUP_RETENTION_DAILY:-7}"
RETENTION_WEEKLY="${BACKUP_RETENTION_WEEKLY:-4}"

log() { echo "[backup $(date -u +%FT%TZ)] $*"; }

# Fail-fast: без ключа НИКОГДА не пишем открытые бэкапы.
if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  log "FATAL: BACKUP_ENCRYPTION_KEY не задан — отказ (открытые бэкапы запрещены)."
  exit 1
fi

mkdir -p "${BACKUP_DIR}"

write_status() { echo "$1 $(date -u +%FT%TZ)${2:+ $2}" > "${STATUS_FILE}"; }

prune() {
  # prune <glob> <keep> — оставить новейшие <keep>, остальные удалить.
  local pattern="$1" keep="$2"
  # shellcheck disable=SC2012
  ls -1t ${BACKUP_DIR}/${pattern} 2>/dev/null | tail -n "+$((keep + 1))" | while IFS= read -r old; do
    log "rotate: удаляю $(basename "${old}")"
    rm -f -- "${old}"
  done
}

do_backup() {
  local ts kind out
  ts="$(date -u +%Y%m%d-%H%M%S)"
  # Воскресный бэкап помечаем weekly (своя дорожка ротации).
  if [ "$(date -u +%u)" = "7" ]; then kind="weekly"; else kind="daily"; fi
  out="${BACKUP_DIR}/lentik-backup-${ts}-${kind}.tar.gpg"

  rm -rf -- "${TMP_DIR}"
  mkdir -p "${TMP_DIR}"

  log "pg_dump (custom format)…"
  # PGHOST/PGUSER/PGDATABASE/PGPASSWORD берутся из окружения (libpq).
  pg_dump -Fc -f "${TMP_DIR}/db.dump"

  log "архив загрузок…"
  if [ -d "${UPLOADS_DIR}" ]; then
    tar czf "${TMP_DIR}/uploads.tar.gz" -C "$(dirname "${UPLOADS_DIR}")" "$(basename "${UPLOADS_DIR}")"
  else
    log "WARN: ${UPLOADS_DIR} не найден — пропускаю загрузки."
    : > "${TMP_DIR}/uploads.tar.gz"
  fi

  {
    echo "lentik-backup"
    echo "created_utc=${ts}"
    echo "kind=${kind}"
    echo "pg_dump_version=$(pg_dump --version 2>/dev/null || echo unknown)"
  } > "${TMP_DIR}/manifest.txt"

  log "упаковка + шифрование (AES-256)…"
  # Сначала единый tar, затем симметричное шифрование на лету.
  tar cf - -C "${TMP_DIR}" db.dump uploads.tar.gz manifest.txt \
    | gpg --batch --yes --pinentry-mode loopback \
          --symmetric --cipher-algo AES256 \
          --passphrase-fd 3 -o "${out}" 3<<<"${BACKUP_ENCRYPTION_KEY}"

  rm -rf -- "${TMP_DIR}"
  log "готово: $(basename "${out}") ($(du -h "${out}" | cut -f1))"

  # Ротация по дорожкам.
  prune "lentik-backup-*-daily.tar.gpg" "${RETENTION_DAILY}"
  prune "lentik-backup-*-weekly.tar.gpg" "${RETENTION_WEEKLY}"

  # Опциональный offsite в S3/совместимое.
  if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
    log "S3: заливаю в s3://${BACKUP_S3_BUCKET}/"
    if [ -n "${BACKUP_S3_ENDPOINT:-}" ]; then
      aws s3 cp "${out}" "s3://${BACKUP_S3_BUCKET}/$(basename "${out}")" --endpoint-url "${BACKUP_S3_ENDPOINT}"
    else
      aws s3 cp "${out}" "s3://${BACKUP_S3_BUCKET}/$(basename "${out}")"
    fi
  fi

  write_status "ok"
}

run_safe() {
  if do_backup; then
    return 0
  else
    local rc=$?
    log "ERROR: бэкап упал (rc=${rc})"
    write_status "error" "rc=${rc}"
    rm -rf -- "${TMP_DIR}" || true
    return "${rc}"
  fi
}

MODE="${1:-loop}"
if [ "${MODE}" = "once" ]; then
  run_safe
  exit $?
fi

log "демон бэкапов: интервал ${INTERVAL_HOURS}ч, ретеншн ${RETENTION_DAILY}d/${RETENTION_WEEKLY}w"
while true; do
  run_safe || true
  sleep "$((INTERVAL_HOURS * 3600))"
done
