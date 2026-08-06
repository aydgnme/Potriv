#!/usr/bin/env bash
#
# Back up the Potriv mail server's configuration and data volumes.
#
# The data volume holds the DKIM *private key*: treat every archive this
# produces as a secret. Encrypt it and store it off-host. Archives are written
# outside the repository and are never tracked by Git.
#
# Usage:  ./infra/mail/scripts/backup-mailserver.sh [destination-dir]

set -euo pipefail

DEST=${1:-${MAIL_BACKUP_DIR:-$HOME/potriv-mail-backups}}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
CONFIG_VOLUME=${CONFIG_VOLUME:-potriv_mail_config}
DATA_VOLUME=${DATA_VOLUME:-potriv_mail_data}

mkdir -p "$DEST"
case "$(cd "$DEST" && pwd)" in
  "$(pwd)"*) echo "Refusing to write backups inside the repository." >&2; exit 1 ;;
esac

echo "==> Quiescing the mail service"
docker stop potriv-mail >/dev/null 2>&1 || true

for pair in "config:$CONFIG_VOLUME" "data:$DATA_VOLUME"; do
  name=${pair%%:*}; volume=${pair##*:}
  out="$DEST/potriv-mail-${name}-${STAMP}.tar.gz"
  echo "==> Archiving $volume"
  docker run --rm -v "${volume}:/src:ro" -v "${DEST}:/out" \
    docker.io/debian:trixie-slim \
    tar czf "/out/$(basename "$out")" -C /src .
  chmod 600 "$out"
  echo "    $out"
done

echo "==> Restarting the mail service"
docker start potriv-mail >/dev/null 2>&1 || true

cat <<'TXT'

Next steps — the archive is NOT yet safe:
  1. Encrypt it:      age -r <recipient> -o backup.age backup.tar.gz
                      (or gpg --symmetric --cipher-algo AES256)
  2. Copy it OFF this host.
  3. Delete the plaintext archive.
  4. Verify a restore into a disposable environment — see
     infra/mail/scripts/restore-mailserver.sh. A backup you have never restored
     is a hypothesis, not a backup.

Retention: keep 7 daily and 4 weekly copies; rotate anything older.
TXT
