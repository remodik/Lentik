# Сайдкар бэкапов Lentik.
# База — тот же major Postgres, что и БД, чтобы pg_dump/pg_restore были совместимы.
FROM postgres:16-alpine

# gnupg — симметричное AES-256 шифрование архивов (с MDC-целостностью);
# tar/coreutils — упаковка; aws-cli — опциональная заливка в S3/совместимое.
RUN apk add --no-cache gnupg tar coreutils aws-cli bash

COPY backup.sh restore.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh

# Non-root запуск. Бэкап пишет только в /backups (named volume) и /data/uploads
# смонтирован ro, поэтому отдельный uid без повышения прав безопасен.
RUN addgroup -S backup && adduser -S -G backup -h /backups backup \
    && chown -R backup:backup /backups
USER backup

# По умолчанию — демон периодических бэкапов (CMD, а не ENTRYPOINT, чтобы можно
# было переопределить командой). Ручные запуски:
#   docker compose run --rm backup backup.sh once      # один прогон
#   docker compose run --rm backup restore.sh <archive>
CMD ["backup.sh"]
