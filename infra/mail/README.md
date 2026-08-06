# Potriv mail infrastructure — operations

Architecture and rationale live in
[`docs/backend/mail-infrastructure.md`](../../docs/backend/mail-infrastructure.md).
This file is the runbook.

```text
infra/mail/
├── README.md                     this file
├── stalwart/config/              config template (live config is git-ignored)
├── scripts/
│   ├── bootstrap-mailserver.sh   one-time bring-up, idempotent
│   ├── mail-preflight.sh         read-only checks, never prints a secret
│   ├── mail-smoke.sh             --dev | --dns | --relay | --prod <address>
│   ├── backup-mailserver.sh      config + data volumes
│   └── restore-mailserver.sh     restore, scratch-first by default
└── dns/records.example.md        DNS templates — nothing published
```

---

## Local development

No mail server is involved. Mailpit captures everything and transmits nothing.

```bash
# 1. Start the database and the SMTP sink
docker compose -f docker-compose.yml up -d postgres mailpit

# 2. Start the backend (dev profile already points at localhost:1025)
cd apps/backend && ./mvnw spring-boot:run

# 3. Request a reset for an account that exists
curl -X POST http://localhost:8080/api/auth/password-reset/request \
  -H 'Content-Type: application/json' -d '{"email":"someone@potriv.test"}'

# 4. Read the captured message
open http://127.0.0.1:8025
#    or: curl -s http://127.0.0.1:8025/api/v1/messages | jq

# 5. Complete the reset with the token from the link
curl -X POST http://localhost:8080/api/auth/password-reset/confirm \
  -H 'Content-Type: application/json' -d '{"token":"<token>","newPassword":"NewPassword1!"}'

# 6. Tear down
docker compose -f docker-compose.yml down -v
```

Extracting a token from a captured message is a **local-development-only** step.
Never do it against production; production tokens belong to the user, not to an
operator.

---

## Production deployment

```bash
# 1. Prepare env files (never commit them)
cp .env.prod.example .env.prod
cp .env.mail.example .env.mail
$EDITOR .env.prod .env.mail

# 2. Validate before starting anything
./infra/mail/scripts/mail-preflight.sh

# 3. Bring up the mail service and complete provisioning
./infra/mail/scripts/bootstrap-mailserver.sh
#    Follow the printed steps: domain, hostname, sender account, aliases, DKIM,
#    relay policy, then rotate the administrator password.

# 4. Publish DNS (see infra/mail/dns/records.example.md) and ask the provider
#    for the PTR record. Then:
./infra/mail/scripts/mail-smoke.sh --dns

# 5. Verify TLS and that relaying is refused
./infra/mail/scripts/mail-smoke.sh --relay
./infra/mail/scripts/mail-smoke.sh --prod <an address you control>

# 6. Start the backend against the internal mail service
docker compose --env-file .env.prod --env-file .env.mail \
  -f docker-compose.prod.yml -f docker-compose.mail.yml up -d

# 7. Confirm the backend is serving
curl -fsS http://localhost:8080/api/actuator/health/readiness
```

`SMTP_HOST` should be the **service name** (`potriv-mail`), so submission stays
on the internal Docker network and never traverses the public interface.

---

## What "working" actually means

Passing every check in this repository proves the **software** is correct. It
does not prove **deliverability**. Mail is delivered at the discretion of the
receiving provider, and a new IP with no sending history is treated with
suspicion no matter how correct its DNS is.

External delivery is only VERIFIED when a controlled message is accepted by a
real provider **and** its headers show `spf=pass`, `dkim=pass` and
`dmarc=pass` with the From domain aligned. Until then it is NOT VERIFIED.

An MX record does not complete the setup. Neither does a running container.

---

## Incident runbooks

### SMTP credentials compromised
1. Change the `noreply@` account password on the mail server.
2. Update `SMTP_PASSWORD` in `.env.mail` and restart **only** the backend.
3. Review the queue and the server's authentication log for sends you did not
   make.
4. If mail was sent as your domain, expect reputation damage — monitor DMARC
   reports.
5. The backend never logs this credential; no log scrubbing is required.

### DKIM private key compromised
1. Generate a **new** key with a **new selector** on the server.
2. Publish the new selector's TXT record and wait for the TTL to expire.
3. Switch signing to the new selector.
4. Keep the old selector's record published for a few days so mail already in
   flight still validates, then remove it.
5. Never reuse a compromised selector name.

### Mail server unavailable
- The backend stays **ready** and keeps serving; only password-reset mail fails.
- Users see the normal "if that address exists, a mail is on its way" response —
  the endpoint's anti-enumeration behaviour is unchanged by an outage.
- `/api/actuator/health` shows mail `DOWN`; `/api/actuator/health/readiness`
  stays `UP`. That difference is deliberate.
- Fix the server, then ask affected users to request a new reset. There is no
  retry queue by design.

### Queue growing
1. Inspect the queue in the management interface.
2. Distinguish *deferred* (receiver throttling — usually transient) from
   *bounced* (permanent).
3. Repeated 4xx from one large provider is usually reputation or a missing PTR.
4. Do not "flush" a queue at a provider that is already throttling you; that
   makes it worse.

### Messages rejected by Gmail/Outlook
Check in this order — the first is by far the most common cause:
1. PTR missing or not matching (`dig -x <ip>`).
2. SPF not published, or not covering the sending IP.
3. DKIM signature failing (selector mismatch after a rotation).
4. DMARC policy stricter than your actual alignment.
5. IP on a blocklist (see below).
6. Provider-specific bulk-sender requirements.

### VPS provider blocks outbound port 25
Common, and often permanent on cheap hosts. Two options:
- Ask the provider to unblock, usually after account verification; or
- Keep this architecture and point `SMTP_HOST`/`SMTP_PORT`/credentials at an
  authenticated relay. **No application change is required** — the backend only
  knows "an authenticated SMTP server".

### PTR missing or wrong
Only the infrastructure provider can set it. Until it matches the mail hostname
and resolves forward to the same IP, expect rejections. This is not fixable from
the DNS zone.

### Certificate renewal failure
1. Check whether the ACME challenge port is still reachable.
2. If HTTP/TLS-ALPN cannot be exposed, switch to DNS-01 with a provider token
   kept in the host secret store.
3. An expired certificate breaks STARTTLS; because `starttls.required` is set,
   the backend will **fail the send rather than downgrade** — which is correct,
   and visible in the aggregate health.

### Domain on a blocklist
1. Identify the list from the bounce message.
2. Fix the cause before requesting delisting; a repeat listing is harder to
   clear.
3. Request delisting through that list's own process.
4. Reduce volume afterwards; Potriv's traffic is a handful of reset mails, so a
   listing almost always means the server was abused.

### Restore from backup
```bash
# Always restore into scratch volumes first
CONFIG_VOLUME=scratch_mail_config DATA_VOLUME=scratch_mail_data \
  ./infra/mail/scripts/restore-mailserver.sh <config.tar.gz> <data.tar.gz>
```
Verify there, confirm the DKIM selector still matches DNS, and only then restore
over the live volumes with `I_MEAN_IT=yes`.

---

## Update and rollback

1. Read the release notes for the target version, especially `UPGRADING/`.
2. **Back up first** (`backup-mailserver.sh`) — a mail-server upgrade touches the
   datastore.
3. Change the pinned tag in `docker-compose.mail.yml` in a commit, never in place
   on the host.
4. `docker compose … up -d potriv-mail`, then `mail-smoke.sh --relay`.
5. Rollback: restore the previous tag **and** the pre-upgrade volumes. Rolling
   the image back alone can leave a datastore the old binary cannot read.

## Routine hygiene

- Rotate the backend SMTP credential on a schedule and after any staff change.
- Keep the administrator credential separate from the application credential.
- Never publish the management port beyond loopback.
- Keep DKIM keys and backups off-host and encrypted.
- Re-run `mail-preflight.sh` after any infrastructure change.
