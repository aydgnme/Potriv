#!/usr/bin/env bash
#
# One-time (idempotent) bring-up of the Potriv mail server.
#
# Starts the stack, waits for the management listener, and reports exactly what
# still has to be done by hand. It never scrapes the web UI and never touches
# Stalwart's internal database.
#
# Usage:  ./infra/mail/scripts/bootstrap-mailserver.sh

set -euo pipefail

ENV_PROD=${ENV_PROD:-.env.prod}
ENV_MAIL=${ENV_MAIL:-.env.mail}
COMPOSE=(docker compose --env-file "$ENV_PROD" --env-file "$ENV_MAIL"
         -f docker-compose.prod.yml -f docker-compose.mail.yml)
ADMIN_URL=${ADMIN_URL:-http://127.0.0.1:8081}

for f in "$ENV_PROD" "$ENV_MAIL"; do
  if [ ! -f "$f" ]; then
    echo "Missing $f. Copy it from ${f}.example and fill in real values." >&2
    exit 1
  fi
done

echo "==> Starting the mail service"
"${COMPOSE[@]}" up -d potriv-mail

echo "==> Waiting for the management listener at $ADMIN_URL"
for _ in $(seq 1 60); do
  if curl -fsS "$ADMIN_URL/healthz/live" >/dev/null 2>&1; then
    echo "    live"
    break
  fi
  sleep 2
done
curl -fsS "$ADMIN_URL/healthz/live" >/dev/null 2>&1 || {
  echo "Mail server did not become live. Inspect: ${COMPOSE[*]} logs potriv-mail" >&2
  exit 1
}

# Bootstrap mode means no configuration has been applied yet. Detect it rather
# than assuming, so re-running this script on a provisioned server is a no-op.
if "${COMPOSE[@]}" logs potriv-mail 2>&1 | grep -q "bootstrap mode"; then
  cat <<'TXT'

==> The server is in BOOTSTRAP MODE — initial provisioning is not done.

    Sign in at http://127.0.0.1:8081/admin with the credential pinned in
    STALWART_RECOVERY_ADMIN (never the password printed in the log), then
    provision, in this order:

      1. Domain            $MAIL_DOMAIN
      2. Hostname          $MAIL_HOSTNAME
      3. Sender account    $MAIL_FROM          (this is the backend credential;
                                                use SMTP_PASSWORD from .env.mail)
      4. Aliases           postmaster@, abuse@, dmarc@  on the domain
      5. DKIM              generate a signing key for the domain, then copy the
                           public key into DNS exactly as shown
      6. Relay policy      require SMTP AUTH on submission; deny relaying for
                           unauthenticated senders; disable self-registration
      7. Rotate            change the administrator password away from the
                           bootstrap value

    Then re-run this script: it will report PROVISIONED and stop warning.

    Validate afterwards with:
      ./infra/mail/scripts/mail-smoke.sh --relay
      ./infra/mail/scripts/mail-smoke.sh --prod <your-own-address>

TXT
  exit 0
fi

echo "==> PROVISIONED — the server is not in bootstrap mode."
echo "    Verify with: ./infra/mail/scripts/mail-smoke.sh --relay"
