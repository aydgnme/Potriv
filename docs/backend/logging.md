# Backend logging

Everything goes to **stdout**. No application log files are written — Docker
already collects and rotates, and the production Compose file caps it.

Configuration lives in one place: `apps/backend/src/main/resources/logback-spring.xml`.

---

## Levels

| Level | Means | Examples in this codebase |
| --- | --- | --- |
| `ERROR` | Something is broken and needs a human | dev schema drift detected |
| `WARN` | Abnormal but handled; the request still succeeded | password-reset mail could not be delivered; continuing despite schema drift |
| `INFO` | A meaningful lifecycle or state-changing event | application started; system-admin bootstrap reconciled |
| `DEBUG` | Diagnostics you opt into | why a schema-drift check was skipped |
| `TRACE` | Rarely useful; present for completeness | — |

Deliberately **not** WARN: an ordinary 404, a rejected validation, a wrong
password. Those are normal traffic and would drown the signal. Note that a failed
login is still recorded as a `SecurityAuditEvent` — persistence and console logs
are separate concerns.

`INFO` is the default level. The backend logs six times in total across three
classes; there is no per-request or per-query logging by design.

---

## Formats

### Development

```text
10:07:30.391 WARN  [nio-8080-exec-7] [req=probe-warn-1] m.a.p.i.service.PasswordResetService - Failed to send password reset email.
│            │     │                 │                  │                                      │
│            │     │                 │                  └ logger, abbreviated to 36 chars      └ message
│            │     │                 └ request id (magenta)
│            │     └ thread (faint)
│            └ level, coloured by severity
└ time (faint)
```

Colours: `ERROR` red · `WARN` yellow · `INFO` green · `DEBUG` cyan · `TRACE` faint.
The timestamp and thread are faint, the request id magenta, the logger cyan. The
message body is never coloured — colour marks structure, not content.

Colour is an **enhancement, never meaning**. The textual level is always printed,
so a terminal without colour support loses nothing.

### Test

```text
10:07:30.391 WARN  m.a.p.i.service.PasswordResetService - Failed to send password reset email.
```

No colour, no thread, no request id: none of it helps when reading a failed
assertion, and ANSI in captured output makes string assertions brittle.
`spring.output.ansi.enabled=never` is set for the test profile.

### Production

```text
2026-08-07T08:08:55.157Z INFO  [main] [req=] me.aydgn.potriv.identity.service.SystemAdminSeeder - Bootstrapped the system administrator account.
```

ISO-8601 in UTC, full logger name, **no ANSI whatsoever**. Verified against
`docker compose logs potriv-backend`: zero escape sequences.

The `[req=]` slot is empty rather than padded in production — machine parsers
read `key=value` and an absent value is unambiguous. Development pads it
(`[req=-------]`) so columns stay aligned for human scanning.

---

## Request correlation

Every request carries an id that appears on each of its log lines and comes back
to the caller.

- Header in and out: `X-Request-ID`
- MDC key: `requestId`, used in the patterns as `%X{requestId}`
- Generated as 8 hex characters when the caller supplies nothing

A caller-supplied id is honoured only if it matches `[A-Za-z0-9._-]{1,64}`.
Anything longer, empty, or containing other characters — a CRLF injection
attempt, for instance — is **replaced** with a generated id rather than rejected:
the header lands in log files, and a malformed correlation header must never fail
a request.

The filter runs at the highest servlet precedence, so it wraps both security
chains: a request rejected by authentication still gets an id, which is exactly
when you want one. The MDC is cleared in a `finally` block so a pooled container
thread never carries one request's id into the next.

This is not distributed tracing. There is no OpenTelemetry, no span propagation —
one id, in the MDC, echoed back.

---

## Changing levels

Per package, without touching code:

```bash
# Maven
cd apps/backend
./mvnw spring-boot:run -Dspring-boot.run.jvmArguments="-Dlogging.level.me.aydgn.potriv=DEBUG"

# Environment variable (Docker, CI, shell)
LOGGING_LEVEL_ME_AYDGN_POTRIV=DEBUG
```

Useful targets:

| Property | What it shows |
| --- | --- |
| `logging.level.me.aydgn.potriv` | Potriv's own diagnostics |
| `logging.level.org.hibernate.SQL` | SQL statements, **through logback** — timestamped, levelled, correlated |
| `logging.level.org.hibernate.orm.jdbc.bind` | Bind parameters. Prints real data; never enable outside a scratch database |
| `logging.level.org.springframework.security` | Authentication detail. Verbose and sensitive; leave at `INFO` unless debugging a specific failure |

The last two are pinned to `INFO` in `logback-spring.xml` so they cannot be
switched on accidentally by a broad root-level change.

### Why `show-sql` is off

`spring.jpa.show-sql` writes SQL straight to `System.out`: no timestamp, no
level, no request id, and logback cannot format or colour it. In a measured dev
run it produced **183 raw SQL lines against 180 real log lines** — more than half
the output bypassing the logging system entirely.

It is now `false` in every profile. Use `logging.level.org.hibernate.SQL=DEBUG`
instead: the same statements, but as proper log events that carry the request id
and honour the level colours.

---

## What never appears in logs

Verified by scanning a captured development run — all zero:

raw JWT · refresh token · password-reset token · invite token · password ·
password hash · SMTP password · mail-server recovery credential · `Authorization`
header · `Cookie` header · database password.

There is no request-body dump, no blanket header logging, and no `Authentication`
object dump. The password-reset failure log deliberately omits the raw token and
records only that delivery failed.

Full email addresses are not printed in operational logs. Where an actor identity
is genuinely required, it is persisted as a `SecurityAuditEvent` — which is a
domain record, not console output.

---

## Production notes

- Logs go to stdout/stderr; Docker collects and rotates them
  (`max-size: 10m`, `max-file: 5` on the mail service; the backend inherits the
  daemon default unless configured).
- `spring.output.ansi.enabled=never` is set for the prod profile, so even a
  pattern change cannot introduce escape sequences.
- Exception stack traces are preserved in logs via `%wEx`. This is separate from
  the HTTP response: clients still receive sanitized errors and never a stack
  trace.
- Readiness (`/api/actuator/health/readiness`) remains `db, ping`. Mail failures
  produce a `WARN` and appear in the aggregate health; they never affect
  readiness. Logging changes did not touch health behaviour.
