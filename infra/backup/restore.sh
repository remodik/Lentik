#!/usr/bin/env bash
#
# Lentik — восстановление из шифрованного бэкапа. ДЕСТРУКТИВНО для БД.
#
# Использование:
#   docker compose run --rm backup restore.sh <archive-name>
#   docker compose run --rm -e RESTORE_YES=1 backup restore.sh <archive-name>
#
# <archive-name> — имя файла в /backups (например lentik-backup-...-daily.tar.gpg)
# или абсолютный путь.
#
set -euo pipefail

BACKUP_DIR="/backups"
UPLOADS_DIR="/data/uploads"
TMP_DIR="${BACKUP_DIR}/.restore-tmp"

log() { echo "[restore $(date -u +%FT%TZ)] $*"; }

if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  log "FATAL: BACKUP_ENCRYPTION_KEY не задан — расшифровать архив нечем."
  exit 1
fi

ARCHIVE_ARG="${1:-}"
if [ -z "${ARCHIVE_ARG}" ]; then
  log "FATAL: укажите архив. Доступные:"
  ls -1t "${BACKUP_DIR}"/lentik-backup-*.tar.gpg 2>/dev/null || echo "  (нет архивов)"
  exit 1
fi

# Принять имя или полный путь.
if [ -f "${ARCHIVE_ARG}" ]; then
  ARCHIVE="${ARCHIVE_ARG}"
else
  ARCHIVE="${BACKUP_DIR}/${ARCHIVE_ARG}"
fi
if [ ! -f "${ARCHIVE}" ]; then
  log "FATAL: архив не найден: ${ARCHIVE}"
  exit 1
fi

# Подтверждение (деструктивно). RESTORE_YES=1 пропускает запрос.
if [ "${RESTORE_YES:-}" != "1" ]; then
  if [ -t 0 ]; then
    printf "Восстановление ПЕРЕЗАПИШЕТ текущую БД из %s. Продолжить? [y/N] " "$(basename "${ARCHIVE}")"
    read -r answer
    case "${answer}" in
      y | Y | yes | YES) : ;;
      *) log "Отменено."; exit 1 ;;
    esac
  else
    log "FATAL: нужен интерактивный ввод или RESTORE_YES=1 для подтверждения."
    exit 1
  fi
fi

rm -rf -- "${TMP_DIR}"
mkdir -p "${TMP_DIR}"
trap 'rm -rf -- "${TMP_DIR}"' EXIT

log "расшифровка + распаковка…"
gpg --batch --yes --pinentry-mode loopback --passphrase-fd 3 -d "${ARCHIVE}" 3<<<"${BACKUP_ENCRYPTION_KEY}" \
  | tar xf - -C "${TMP_DIR}"

if [ ! -f "${TMP_DIR}/db.dump" ]; then
  log "FATAL: в архиве нет db.dump (повреждён или неверный ключ?)."
  exit 1
fi

log "восстановление БД (pg_restore --clean --if-exists)…"
# PG* из окружения. --clean удаляет существующие объекты перед загрузкой.
pg_restore --clean --if-exists --no-owner -d "${PGDATABASE}" "${TMP_DIR}/db.dump"

# Загрузки. В сайдкаре каталог смонтирован read-only — пытаемся на месте,
# при неудаче складываем в staging и просим оператора синхронизировать вручную.
if [ -s "${TMP_DIR}/uploads.tar.gz" ]; then
  if tar xzf "${TMP_DIR}/uploads.tar.gz" -C "$(dirname "${UPLOADS_DIR}")" 2>/dev/null; then
    log "загрузки восстановлены в ${UPLOADS_DIR}"
  else
    STAGE="${BACKUP_DIR}/restored-uploads"
    rm -rf -- "${STAGE}"; mkdir -p "${STAGE}"
    tar xzf "${TMP_DIR}/uploads.tar.gz" -C "${STAGE}"
    log "ВНИМАНИЕ: ${UPLOADS_DIR} только для чтения в этом контейнере."
    log "Загрузки распакованы в том бэкапов: ${STAGE}"
    log "Скопируйте их в каталог загрузок приложения вручную."
  fi
else
  log "загрузок в архиве нет — пропуск."
fi

log "Готово. Перезапустите API: docker compose restart api"
