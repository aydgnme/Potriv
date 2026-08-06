# Potriv Mail Infrastructure

How Potriv sends mail, in development and in production, and what the outside
world must provide before self-hosted delivery can work.

Everything here is derived from the repository or from the pinned tool's own
documentation. Where something is **not** verified, it says so.

---

## 1. Current flow (before this work)

Potriv sends exactly one kind of message: the **password-reset link**. There is
no other outbound mail anywhere in the backend.

```text
POST /api/auth/password-reset/request
  → PasswordResetService.requestReset(...)
      → userRepository.findByEmail(normalizedEmail).ifPresent(...)      ← anti-enumeration
          → invalidate previous unused tokens
          → generate 32 random bytes, store SHA-256 hash only
          → audit PASSWORD_RESET_REQUESTED
          → PasswordResetMailService.sendPasswordResetMail(...)          ← synchronous
              → JavaMailSender.send(SimpleMailMessage)
          catch (MailException) → log.warn, response unchanged
```

Observed properties, each read from the code:

| Property | Current behaviour |
| --- | --- |
| Delivery | **Synchronous**, inside the request thread. No `@Async`, no queue, no outbox. |
| Failure handling | `MailException` caught in `PasswordResetService`; the endpoint answers identically whether or not the address exists or delivery succeeded. |
| Token in logs | Never. The raw token is deliberately absent from the failure log; only the SHA-256 hash is persisted. |
| Sender address | Single value, `app.mail.from` (`MAIL_FROM` in production). Callers cannot choose it. |
| Recipient | Always the stored, normalized account email. Never user-supplied at send time. |
| Link host | `app.frontend-url` + `/reset-password?token=…` (`FRONTEND_URL` in production). |
| Body | Plain text, `SimpleMailMessage`. No HTML, no attachments. |
| Health | Spring Boot auto-configures `MailHealthIndicator` because `spring.mail.host` is set. It is in the aggregate but **not** in the `readiness` group, so SMTP cannot make the container unready (PR #65). |
| Test double | `support/RecordingMailSender` — integration tests never need a real SMTP server. |
| Disabled/no-op mode | **None.** There is no "mail off" switch; `JavaMailSender` is always auto-configured. |

Environment variable names already in use — this work reuses them rather than
inventing new ones:

```text
SMTP_HOST  SMTP_PORT  SMTP_USERNAME  SMTP_PASSWORD  MAIL_FROM  FRONTEND_URL
```

### Compose and network reality

Neither `docker-compose.yml` (development) nor `docker-compose.prod.yml`
declares an explicit network, so each Compose project gets its default bridge
network and services address each other by **service name** — which is why the
backend reaches the database at `jdbc:postgresql://potriv-db:5432/...`.

A mail container must therefore either join that same project network or be
addressed over an explicitly declared shared network. This work declares one.

Development Compose already contains a Mailpit service, but unpinned
(`axllent/mailpit` with no tag), with both ports published on all interfaces, no
persistence and no message cap. Phase B hardens it rather than adding it twice.

---

## 2. Chosen architecture

Two environments, deliberately different, sharing one backend configuration
shape.

### Development — Mailpit

**`axllent/mailpit:v1.30.6`** (release verified 2026-07-28; image pull verified).

Mailpit is an SMTP *sink*: it accepts everything and transmits nothing. That is
exactly what local development needs — the real endpoint, the real
`JavaMailSender`, the real message, and zero risk of mailing a real person.

- SMTP on `1025`, web UI and REST API on `8025`.
- Bound to `127.0.0.1` only.
- No auth, no TLS: the traffic never leaves the machine.
- Bounded message store so a long-running dev box cannot fill the disk.
- Local-only sender identity (`no-reply@potriv.local`) so a captured message can
  never be confused with production output.

### Production — Stalwart Mail Server

**`stalwartlabs/stalwart:v0.16.16`** (release verified 2026-08-02; image pull
verified).

Chosen over the alternatives for reasons that matter to this repository:

- **One binary, one container, one config file.** `docker-mailserver` composes
  Postfix + Dovecot + Rspamd + supervisord and expects a much larger operational
  surface; Potriv needs *authenticated submission plus outbound delivery*, not a
  full groupware host.
- **Native DKIM signing and ACME** — no separate opendkim/certbot sidecars.
- **A pinnable bootstrap credential**: `STALWART_RECOVERY_ADMIN=admin:<password>`
  supplies the initial administrator instead of leaving it as a random password
  printed once to the container log. (Verified by running the image.)
- **Actively maintained** with frequent, tagged releases.
- **Relay policy is explicit** in configuration rather than implied by a stack of
  Postfix restriction classes, which makes "no open relay" reviewable.

Potriv's own trust model is unchanged: the backend authenticates as one
dedicated account and may send only from its configured `MAIL_FROM`.

---

## 3. Trust boundaries

```text
┌─ host / operator ───────────────────────────────────────────────┐
│  management UI  ← loopback only (127.0.0.1:8080), never public  │
│                                                                 │
│  ┌─ potriv-mail network (internal) ──────────────────────────┐  │
│  │  potriv-backend ──authenticated SMTP 587 STARTTLS──▶ mail │  │
│  │      (one dedicated credential, fixed From)               │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  mail ──▶ internet :25   (outbound delivery, requires PTR etc.) │
│  internet ──▶ mail :25   (inbound, only if enabled)             │
└─────────────────────────────────────────────────────────────────┘
```

- The backend never talks to the internet's SMTP directly; it submits to the
  local mail service over the internal Docker network.
- The mail service is the only component that needs public port 25.
- The management interface is never published beyond loopback by default.
- The backend's SMTP credential is **not** the mail-server administrator
  credential.

---

## 4. Ports

Every published port, and why:

| Port | Environment | Bound to | Purpose |
| --- | --- | --- | --- |
| `1025` | dev | `127.0.0.1` | Mailpit SMTP sink |
| `8025` | dev | `127.0.0.1` | Mailpit UI + REST API (used by the smoke test) |
| `587` | prod | internal network only by default | Authenticated submission with STARTTLS — what the backend uses |
| `25` | prod | public **only when public mail is enabled** | Server-to-server delivery/receipt |
| `443` | prod | public only if Stalwart terminates ACME/HTTPS itself | TLS certificate issuance |
| `8081` → container `8080` | prod | `127.0.0.1` | Management/bootstrap. Not host 8080 — the backend owns that. |

Not exposed, deliberately: IMAP (143/993), POP3 (110/995), ManageSieve (4190),
JMAP. Potriv is a sender, not a mailbox host; opening a mailbox protocol would
add attack surface with no product requirement behind it.

---

## 5. Secrets model

| Secret | Where it lives | Never |
| --- | --- | --- |
| Backend SMTP password | `SMTP_PASSWORD` in the deployment's env file / secret store | committed; printed; in actuator, admin UI or logs |
| Mail admin password | `MAIL_ADMIN_PASSWORD`, separate account | shared with the backend |
| DKIM private key | Stalwart's data volume, readable only by the service | committed; in backups that are not encrypted |
| TLS private key | Stalwart's data volume or the proxy | committed |

`.env.mail.example` carries placeholders only. Committed Compose files reference
variables; they never contain values.

---

## 6. Health model

Settled in PR #65 and preserved here:

- **`/api/actuator/health/readiness` = `db, ping`.** The container healthcheck,
  the production smoke script and any orchestrator probe use this. Mail is not in
  it, so an SMTP outage never makes a serving backend unready.
- **`/api/actuator/health` (aggregate)** still includes Spring's mail
  contributor, so an operator can see mail state. It reports `DOWN` whenever SMTP
  is unreachable — that is intended diagnostics, not a fault.
- The mail container has its own healthcheck; the backend's health does not
  depend on it.
- Health responses carry no component detail (`show-details` stays at Spring's
  default `never`), which is why `/actuator/health/**` can remain anonymous.

---

## 7. Backup model

What actually needs to survive a host loss:

1. **`/etc/stalwart`** (volume `potriv_mail_config`) — the on-disk
   `config.json`, which as of v0.16 describes only the datastore.
2. **`/var/lib/stalwart`** (volume `potriv_mail_data`) — the datastore itself:
   domains, accounts, relay policy, queue, and the **DKIM private key**. Losing
   the DKIM key means every published DKIM DNS record must be replaced.
3. Nothing else. Potriv stores no mailboxes.

Backups are taken from the named volumes with the service stopped or quiesced,
stored **encrypted and off-host**, and restore is verified into a disposable
environment — never straight over production. Backup archives are never tracked
by Git.

---

## 8. External prerequisites for real delivery

A container and an MX record do not make deliverable mail. All of the following
are outside this repository:

| Prerequisite | Owner | Status here |
| --- | --- | --- |
| Stable public IPv4 | VPS/cloud provider | **not available in this environment** |
| DNS control for `aydgn.me` / `potriv.aydgn.me` | domain registrar | not available |
| Inbound TCP 25 reachable | provider firewall | not available |
| **Outbound TCP 25 allowed** | provider — commonly blocked by default | not available |
| TCP 587/465 reachable where submission crosses the internet | provider | not available |
| **PTR / reverse DNS** `<public IP> → mail.aydgn.me` | provider only; cannot be set from DNS | not available |
| Forward DNS resolving back to the same IP (FCrDNS) | registrar | not available |
| TLS certificate issuance path | ACME or proxy | not available |
| SPF / DKIM / DMARC published | registrar | not available |
| IP reputation | earned over time | n/a |

Consequently, direct public delivery from this work is
**BLOCKED BY INFRASTRUCTURE**. The architecture is deliberately shaped so that
pointing `SMTP_HOST`/`SMTP_PORT`/credentials at an authenticated relay (SES,
Postmark, Mailgun, a provider's smarthost) requires **no application change** —
only environment values.

---

## 9. Provisioning: what is automated and what is not

Verified by running `stalwartlabs/stalwart:v0.16.16` locally:

- With no `config.json`, the server starts in **bootstrap mode**, opens only the
  management listener on `8080`, and keeps mail ports closed.
- `STALWART_RECOVERY_ADMIN=admin:<password>` pins the bootstrap credential.
- `/healthz/live` and `/healthz/ready` respond and are what the container
  healthcheck uses.
- The image ships **one binary** (`/usr/local/bin/stalwart`) whose only options
  are `--config`, `--export`, `--import`, `--console`. There is no CLI in the
  image, and `v0.16.16`'s release assets contain no `stalwart-cli`.
- The management API is not reachable in bootstrap mode; provisioning happens
  after initial setup.

Stalwart's own upgrade documentation describes `stalwart-cli apply` with a
declarative plan file as the infrastructure-as-code path. **That path could not
be implemented or verified here**, because the CLI is not distributed with this
version's release assets or image. Rather than inventing configuration keys, this
repository does what the tool supports today:

- a **pinned bootstrap credential** from the env file,
- `bootstrap-mailserver.sh`, which starts the stack, waits for the management
  listener, **detects bootstrap mode** and prints the exact provisioning steps,
  and reports `PROVISIONED` on re-run — so it is idempotent in effect,
- validation through `mail-smoke.sh --relay` / `--dns` / `--prod` afterwards.

Domain, accounts, aliases, DKIM key generation and relay policy are therefore a
**documented one-time setup**, not an automated one. This is called out here
rather than hidden behind a script that pretends otherwise.

## 10. Accepted limitations

- **Delivery stays synchronous.** Introducing Kafka/RabbitMQ/an outbox is
  explicitly out of scope, and the product sends one low-volume message type. The
  risk is bounded instead: strict connect/read/write timeouts so a hung SMTP
  server cannot hold an HTTP thread, and a caught `MailException` that leaves the
  anti-enumeration response intact. Documented trade-off, not an oversight.
- **No retry.** A failed reset mail is lost; the user requests another. Matching
  the current product behaviour rather than inventing a delivery guarantee.
- **No bounce processing.** Inbound mail is optional and off by default.
- **External deliverability is unproven** until a controlled message is accepted
  by a real provider and its headers show SPF/DKIM/DMARC alignment. Passing local
  tests proves the software, not the reputation.


---

# Delivery report (POTRIV-MAIL-01)

## 1. Executive verdict

```text
READY FOR LOCAL SMTP DEVELOPMENT
```

Local mail is complete and proven end to end. The production stack is built,
pinned, hardened and starts cleanly, but **self-hosted public delivery is blocked
by external prerequisites** that do not exist in this environment (no public IP,
no DNS control, no PTR, outbound port 25 unverified) and by a one-time
provisioning step that this Stalwart version does not expose non-interactively.

`READY FOR SELF-HOSTED PRODUCTION SMTP` is deliberately **not** claimed: DNS,
PTR, TLS, port 25, authenticated submission, open-relay rejection and one
controlled external delivery have not all been verified.

## 2. Test baselines

```text
start   757 tests, 0 failures        (main, after PR #65)
final   766 tests, 0 failures, 0 errors, 0 skipped, BUILD SUCCESS
```

+9, all new and all explained:
- `PasswordResetMailDeliveryIntegrationTest` — 6
- `ProductionMailTransportTest` — 3

## 3. Chosen architecture

Development uses **Mailpit `v1.30.6`** as an SMTP sink; production uses
**Stalwart `v0.16.16`**. Rationale in §2 above; both image tags were pulled and
verified, neither is `latest`.

## 4. Development flow — VERIFIED

Actually executed, not described:

| Step | Result |
| --- | --- |
| Postgres + Mailpit + backend started | healthy |
| Registered an account through the real API | `201` |
| Reset requested for the real address | `202` |
| Reset requested for an unknown address | `202` (identical) |
| Messages captured by Mailpit | **exactly 1** — the unknown address produced none |
| Sender | `no-reply@potriv.local` (local identity, not the production domain) |
| Reset link host | `http://localhost:5173` — the configured `app.frontend-url` |
| Password hash / refresh token / credential in body | none |
| Raw token in the backend log | **0 occurrences** |
| Reset completed through the real endpoint | `204` |
| Old password / new password | `400` / `200` |
| Token reuse | `400` (single-use) |
| Stack torn down | yes |

Read through Mailpit's REST API (`/api/v1/messages`), never by parsing HTML.

## 5. Production flow — PARTIALLY VERIFIED

Executed locally against the real image:

| Check | Result |
| --- | --- |
| Stack starts with persistent named volumes | **VERIFIED** |
| Runs as non-root | **VERIFIED** — `uid=2000(stalwart)` |
| Bootstrap credential pinned via `STALWART_RECOVERY_ADMIN` | **VERIFIED** — the random password is no longer printed |
| `/healthz/live` | **VERIFIED** — 200 |
| Restart idempotent, volumes survive | **VERIFIED** |
| Mailbox ports (110/143/993/995/4190/465) closed | **VERIFIED** |
| Management reachable on loopback only | **VERIFIED** |
| Backend readiness while mail is stopped | **VERIFIED** — `UP`, container `healthy` |
| Aggregate health while mail is stopped | **VERIFIED** — `DOWN` (intended diagnostics) |
| Password reset with mail down | **VERIFIED** — still `202`, still anti-enumerating |
| Credentials in backend/mail logs | **VERIFIED** — 0 occurrences |
| SMTP AUTH accept/reject matrix | **NOT VERIFIED** — requires provisioning |
| STARTTLS negotiation | **NOT VERIFIED** — same |
| Open-relay rejection | **NOT VERIFIED** — mail listeners stay closed in bootstrap mode |

## 6. Files changed

`docker-compose.yml`, `docker-compose.prod.yml`, `docker-compose.mail.yml`,
`.env.prod.example`, `.env.mail.example`, `.gitignore`,
`apps/backend/src/main/resources/application-prod.yml`,
`RecordingMailSender`, `PasswordResetMailDeliveryIntegrationTest`,
`ProductionMailTransportTest`, `infra/mail/**`, `README.md`, and the four backend
docs.

## 7. Ports and 8. Environment variables

See §4 and §5 above, plus `docs/backend/environment.md`. Added:
`MAIL_CONNECTION_TIMEOUT_MS`, `MAIL_READ_TIMEOUT_MS`, `MAIL_WRITE_TIMEOUT_MS`,
and the `.env.mail` set. Existing `SMTP_*` / `MAIL_FROM` names were reused rather
than renamed.

## 9. Secret storage

Placeholders only in `.env.mail.example`. `.gitignore` was verified by
attempting `git add`: `.env.mail` and a live `config.json` are **refused**, while
the `.example` files are addable. No DKIM or TLS private key exists in this
repository.

## 10. Health behaviour

Unchanged from PR #65 and re-proven here: readiness `db, ping`; mail visible in
the aggregate only.

## 11–17. Relay, TLS, DNS, PTR, port 25, external delivery

| Item | Status |
| --- | --- |
| Relay test matrix | **NOT VERIFIED** — needs provisioning |
| TLS | **NOT VERIFIED** |
| DNS records required | documented in `infra/mail/dns/records.example.md` |
| DNS records verified | **NOT RUN** — none published |
| PTR | **BLOCKED BY PTR** — provider-managed, no host |
| Outbound port 25 | **BLOCKED BY PORT 25** — unverified from any host |
| External delivery | **NOT RUN** — no message was sent to any external address |

## 18. Backup/restore

Scripts written, syntax-checked, and guarded (restore refuses live volumes
without `I_MEAN_IT=yes`). A full backup→restore cycle was **NOT executed**,
because there is no provisioned datastore worth restoring yet.

## 20. Known limitations

- Provisioning (domain, accounts, DKIM, relay policy) is a **documented one-time
  setup**, not automated: `stalwart-cli apply` is the vendor's declarative path
  but the CLI ships in neither the `v0.16.16` image nor its release assets.
- Delivery stays synchronous; bounded by 5s timeouts rather than a queue.
- No retry, no bounce processing.
- Public deliverability unproven — see §8.

## 22. Rollback

The mail stack is additive. To remove it: stop the overlay
(`docker compose … -f docker-compose.mail.yml down`), drop
`-f docker-compose.mail.yml` from the deployment command, and point `SMTP_HOST`
back at the previous relay. The backend needs no change — it only ever knows
"an authenticated SMTP server". Reverting the branch also restores the previous
(unbounded-timeout) mail configuration, which is **not** recommended.
