#!/usr/bin/env bash
#
# Restore the Potriv mail server volumes from archives produced by
# backup-mailserver.sh.
#
# Restore into a DISPOSABLE environment first and verify there. Restoring
# straight over a live server is how a bad backup becomes an outage.
#
# Usage:
#   ./infra/mail/scripts/restore-mailserver.sh <config.tar.gz> <data.tar.gz>
#   CONFIG_VOLUME=scratch_config DATA_VOLUME=scratch_data ./restore-mailserver.sh ...

set -euo pipefail

CONFIG_ARCHIVE=${1:?config archive is required}
DATA_ARCHIVE=${2:?data archive is required}
CONFIG_VOLUME=${CONFIG_VOLUME:-potriv_mail_config}
DATA_VOLUME=${DATA_VOLUME:-potriv_mail_data}

for f in "$CONFIG_ARCHIVE" "$DATA_ARCHIVE"; do
  [ -f "$f" ] || { echo "Missing archive: $f" >&2; exit 1; }
done

if [ "$CONFIG_VOLUME" = "potriv_mail_config" ] && [ "${I_MEAN_IT:-}" != "yes" ]; then
  cat >&2 <<'TXT'
This would overwrite the LIVE mail volumes.

Restore into a scratch pair first:
  CONFIG_VOLUME=scratch_mail_config DATA_VOLUME=scratch_mail_data \
    ./infra/mail/scripts/restore-mailserver.sh <config.tar.gz> <data.tar.gz>

If you really mean the live volumes, re-run with I_MEAN_IT=yes.
TXT
  exit 1
fi

echo "==> Stopping the mail service"
docker stop potriv-mail >/dev/null 2>&1 || true

restore() {
  local archive=$1 volume=$2
  echo "==> Restoring $archive into $volume"
  docker volume create "$volume" >/dev/null
  docker run --rm -v "${volume}:/dst" -v "$(cd "$(dirname "$archive")" && pwd):/in:ro" \
    docker.io/debian:trixie-slim \
    sh -c "rm -rf /dst/* /dst/..?* 2>/dev/null; tar xzf /in/$(basename "$archive") -C /dst"
}

restore "$CONFIG_ARCHIVE" "$CONFIG_VOLUME"
restore "$DATA_ARCHIVE" "$DATA_VOLUME"

cat <<'TXT'

Restored. Verify before trusting it:
  1. Start the stack against these volumes.
  2. curl -fsS http://127.0.0.1:8080/healthz/live
  3. Confirm the server is NOT in bootstrap mode (docker logs potriv-mail).
  4. ./infra/mail/scripts/mail-smoke.sh --relay
  5. Confirm the DKIM selector still matches what DNS publishes.
TXT
