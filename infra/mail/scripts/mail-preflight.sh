#!/usr/bin/env bash
#
# Read-only pre-flight for the Potriv mail stack. Changes nothing, starts
# nothing, and never prints a secret value — only whether one is present.
#
# Usage:  ./infra/mail/scripts/mail-preflight.sh

set -uo pipefail

ENV_PROD=${ENV_PROD:-.env.prod}
ENV_MAIL=${ENV_MAIL:-.env.mail}
FAILURES=0

ok()   { printf '  \033[32mOK\033[0m    %s\n' "$1"; }
warn() { printf '  \033[33mWARN\033[0m  %s\n' "$1"; }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; FAILURES=$((FAILURES + 1)); }

echo "==> Required commands"
for cmd in docker curl dig openssl; do
  command -v "$cmd" >/dev/null 2>&1 && ok "$cmd" || bad "$cmd is not installed"
done

echo "==> Environment files"
for f in "$ENV_PROD" "$ENV_MAIL"; do
  [ -f "$f" ] && ok "$f present" || bad "$f missing (copy from ${f}.example)"
done

# Presence only. Values are never echoed.
if [ -f "$ENV_MAIL" ]; then
  echo "==> Required variables (presence only, values never printed)"
  for key in MAIL_HOSTNAME MAIL_DOMAIN MAIL_FROM STALWART_RECOVERY_ADMIN \
             SMTP_HOST SMTP_PORT SMTP_USERNAME SMTP_PASSWORD; do
    value=$(grep -E "^${key}=" "$ENV_MAIL" 2>/dev/null | head -1 | cut -d= -f2-)
    if [ -z "$value" ]; then
      bad "$key is empty or missing"
    elif printf '%s' "$value" | grep -q "replace-me"; then
      bad "$key still holds a placeholder"
    else
      ok "$key is set"
    fi
  done
fi

echo "==> Compose configuration"
if docker compose --env-file "$ENV_PROD" --env-file "$ENV_MAIL" \
     -f docker-compose.prod.yml -f docker-compose.mail.yml config --quiet 2>/dev/null; then
  ok "compose config parses"
else
  bad "compose config is invalid"
fi

echo "==> Image pinning"
if grep -qE 'image:.*(:latest|:edge)\s*$' docker-compose.mail.yml; then
  bad "an unpinned image tag is committed"
else
  ok "mail images are pinned"
fi

echo "==> Management interface exposure"
admin_bind=$(grep -E '^MAIL_ADMIN_BIND=' "$ENV_MAIL" 2>/dev/null | cut -d= -f2-)
case "${admin_bind:-127.0.0.1}" in
  127.0.0.1|localhost) ok "management bound to loopback" ;;
  *) bad "management bound to ${admin_bind} — must not be public" ;;
esac

echo "==> Mailbox protocols"
if grep -qE '^\s+- .*:(110|143|993|995|4190):' docker-compose.mail.yml; then
  bad "a mailbox protocol port is published"
else
  ok "IMAP/POP3/ManageSieve are not published"
fi

echo "==> Public DNS (informational — blank means not published yet)"
host=$(grep -E '^MAIL_HOSTNAME=' "$ENV_MAIL" 2>/dev/null | cut -d= -f2-)
if [ -n "${host:-}" ]; then
  a=$(dig +short A "$host" 2>/dev/null | head -1)
  if [ -n "$a" ]; then
    ok "$host resolves to $a"
    ptr=$(dig +short -x "$a" 2>/dev/null | head -1)
    if [ "$ptr" = "${host}." ]; then ok "PTR matches ($ptr)"
    else warn "PTR is '${ptr:-none}', expected ${host}. — provider-managed"; fi
  else
    warn "$host does not resolve — DNS not published yet"
  fi
fi

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "Pre-flight passed."
else
  echo "Pre-flight found $FAILURES problem(s)."
fi
exit $((FAILURES > 0))
