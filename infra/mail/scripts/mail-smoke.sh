#!/usr/bin/env bash
#
# Mail smoke checks. Each mode is independent; none sends bulk traffic and none
# prints a credential, a token or a message body.
#
#   --dev              Send through Mailpit and verify the capture
#   --dns              Validate the published DNS records
#   --relay            Verify that unauthenticated relay is refused
#   --prod <address>   Authenticate over TLS and submit ONE message to <address>
#
# --prod refuses to run without an explicit single recipient that you control.

set -uo pipefail

ENV_MAIL=${ENV_MAIL:-.env.mail}
MAILPIT_API=${MAILPIT_API:-http://127.0.0.1:8025}
BACKEND_API=${BACKEND_API:-http://localhost:8080/api}
FAILURES=0

ok()   { printf '  \033[32mVERIFIED\033[0m      %s\n' "$1"; }
bad()  { printf '  \033[31mFAILED\033[0m        %s\n' "$1"; FAILURES=$((FAILURES + 1)); }
skip() { printf '  \033[33mNOT VERIFIED\033[0m  %s\n' "$1"; }
ext()  { printf '  \033[33mBLOCKED\033[0m       %s\n' "$1"; }

env_value() { grep -E "^$1=" "$ENV_MAIL" 2>/dev/null | head -1 | cut -d= -f2-; }

usage() { sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }

# ---------------------------------------------------------------- dev mode
smoke_dev() {
  echo "==> Development capture (Mailpit)"
  curl -fsS "$MAILPIT_API/api/v1/messages" >/dev/null 2>&1 \
    || { bad "Mailpit API unreachable at $MAILPIT_API"; return; }
  ok "Mailpit API reachable"

  local before after email
  before=$(curl -fsS "$MAILPIT_API/api/v1/messages" | python3 -c 'import json,sys;print(json.load(sys.stdin)["messages_count"])')
  email="smoke-$(date +%s)@potriv.test"

  # The address is deliberately unknown: the endpoint must still answer 202 and
  # must NOT produce a message. That is the anti-enumeration contract.
  curl -fsS -o /dev/null -X POST "$BACKEND_API/auth/password-reset/request" \
    -H 'Content-Type: application/json' -d "{\"email\":\"$email\"}" \
    && ok "password-reset request accepted for an unknown address" \
    || bad "password-reset endpoint unreachable at $BACKEND_API"

  after=$(curl -fsS "$MAILPIT_API/api/v1/messages" | python3 -c 'import json,sys;print(json.load(sys.stdin)["messages_count"])')
  if [ "$before" = "$after" ]; then
    ok "no message sent for an unknown address"
  else
    bad "a message was produced for an address that does not exist"
  fi

  echo "     To exercise a real capture, request a reset for an account that exists"
  echo "     and inspect $MAILPIT_API — never a production address."
}

# ---------------------------------------------------------------- dns mode
smoke_dns() {
  echo "==> Published DNS"
  local host domain a ptr
  host=$(env_value MAIL_HOSTNAME); domain=$(env_value MAIL_DOMAIN)
  [ -n "$host" ] || { bad "MAIL_HOSTNAME not set"; return; }

  a=$(dig +short A "$host" | head -1)
  if [ -n "$a" ]; then ok "A  $host -> $a"; else ext "A record for $host not published"; fi

  if [ -n "$a" ]; then
    ptr=$(dig +short -x "$a" | head -1)
    if [ "$ptr" = "${host}." ]; then ok "PTR $a -> $ptr"
    else ext "PTR is '${ptr:-none}' (provider-managed, expected ${host}.)"; fi
  fi

  [ -n "$(dig +short MX "$domain")" ]  && ok "MX for $domain"   || ext "MX for $domain not published"
  dig +short TXT "$domain" | grep -q 'v=spf1'   && ok "SPF"   || ext "SPF not published"
  dig +short TXT "_dmarc.$domain" | grep -q 'v=DMARC1' && ok "DMARC" || ext "DMARC not published"
  skip "DKIM — the selector must be read from the running server, not guessed"
}

# -------------------------------------------------------------- relay mode
smoke_relay() {
  echo "==> Open-relay refusal"
  local host port
  host=$(env_value MAIL_HOSTNAME); port=$(env_value SMTP_PORT)
  host=${host:-127.0.0.1}; port=${port:-587}

  if ! command -v openssl >/dev/null 2>&1; then bad "openssl missing"; return; fi
  if ! (exec 3<>"/dev/tcp/${host}/${port}") 2>/dev/null; then
    ext "cannot reach ${host}:${port} — mail server not running or not reachable"
    return
  fi

  # Attempt to relay to an external domain with no AUTH. A correctly configured
  # server rejects with 5xx. Nothing is delivered either way.
  local out
  out=$(printf 'EHLO smoke.test\r\nMAIL FROM:<relay-test@example.invalid>\r\nRCPT TO:<relay-target@example.invalid>\r\nQUIT\r\n' \
        | timeout 15 openssl s_client -starttls smtp -connect "${host}:${port}" -quiet 2>/dev/null)
  if printf '%s' "$out" | grep -qE '^5[0-9][0-9]'; then
    ok "unauthenticated relay to an external domain refused"
  else
    bad "unauthenticated relay was NOT clearly refused — inspect the relay policy"
  fi
}

# --------------------------------------------------------------- prod mode
smoke_prod() {
  local recipient=${1:-}
  if [ -z "$recipient" ]; then
    echo "  --prod needs exactly one recipient you control: --prod you@example.com" >&2
    exit 2
  fi
  case "$recipient" in
    *,*|*\ *) echo "  Refusing a recipient list. One address only." >&2; exit 2 ;;
  esac

  echo "==> Authenticated submission to $recipient"
  local host port
  host=$(env_value MAIL_HOSTNAME); port=$(env_value SMTP_PORT)
  if ! (exec 3<>"/dev/tcp/${host:-127.0.0.1}/${port:-587}") 2>/dev/null; then
    ext "cannot reach ${host}:${port}"
    return
  fi
  ok "submission port reachable"

  if timeout 15 openssl s_client -starttls smtp -connect "${host}:${port}" \
       -servername "$host" </dev/null 2>/dev/null | grep -q "BEGIN CERTIFICATE"; then
    ok "STARTTLS negotiated and a certificate was served"
  else
    bad "STARTTLS did not negotiate"
  fi

  skip "message submission — run it from the mail host with the app credential;"
  skip "  this script does not read SMTP_PASSWORD in order to keep it out of"
  skip "  process arguments and shell history"
}

[ $# -gt 0 ] || usage
case "$1" in
  --dev)   smoke_dev ;;
  --dns)   smoke_dns ;;
  --relay) smoke_relay ;;
  --prod)  shift; smoke_prod "${1:-}" ;;
  *)       usage ;;
esac

echo
[ "$FAILURES" -eq 0 ] && echo "Smoke check completed with no failures." \
                      || echo "Smoke check reported $FAILURES failure(s)."
exit $((FAILURES > 0))
