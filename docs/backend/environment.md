# Backend Environment Reference

The backend (`apps/backend`) is a Spring Boot 3.5 application configured through
profiles. The active profile defaults to `dev` (set in `application.yml`) and is
overridden in deployments with `SPRING_PROFILES_ACTIVE`.

## Profiles

| Profile | File | Purpose |
| --- | --- | --- |
| (shared) | `src/main/resources/application.yml` | Safe shared defaults: app name, port `8080`, context path `/api`, token TTL defaults, actuator exposure. |
| `dev` | `src/main/resources/application-dev.yml` | Local development: PostgreSQL on `localhost:5432` (docker compose), Hibernate `ddl-auto: update` (code-first), Flyway disabled, Mailpit SMTP on `localhost:1025`. |
| `test` | `src/test/resources/application-test.yml` | Integration tests: Testcontainers PostgreSQL, `ddl-auto: create-drop`, Flyway disabled, fixed system-admin seed. |
| `prod` | `src/main/resources/application-prod.yml` | Production: every sensitive value comes from the environment, Hibernate `ddl-auto: validate`, Flyway enabled, Swagger disabled, actuator restricted to `health`. |

The `prod` profile is additionally protected by
`me.aydgn.potriv.common.config.ProductionConfigGuard`, which refuses to boot
with a placeholder JWT secret, wildcard CORS origins, a non-PostgreSQL
datasource, or a destructive Hibernate DDL mode.

## Required environment variables (`prod`)

| Variable | Required | Description |
| --- | --- | --- |
| `SPRING_PROFILES_ACTIVE` | yes | Must be `prod`. |
| `DATABASE_URL` | yes | JDBC URL, e.g. `jdbc:postgresql://db-host:5432/potriv`. Non-PostgreSQL URLs are refused at boot. |
| `DATABASE_USERNAME` | yes | Database user. |
| `DATABASE_PASSWORD` | yes | Database password. |
| `JWT_SECRET` | yes | HS256 signing secret, at least 32 bytes of real entropy. The shared-default placeholder is refused at boot. |
| `SMTP_HOST` | yes | Outbound mail host. |
| `SMTP_PORT` | yes | Outbound mail port. |
| `SMTP_USERNAME` | yes | Outbound mail user. |
| `SMTP_PASSWORD` | yes | Outbound mail password. |
| `MAIL_FROM` | yes | From address for transactional mail (invites, password reset). |
| `CORS_ALLOWED_ORIGINS` | no (default `https://potriv.aydgn.me`) | Comma-separated exact origins. Wildcards are refused at boot because responses carry credentials. |
| `FRONTEND_URL` | no (default `https://potriv.aydgn.me`) | Used for links in outbound mail (e.g. invite URLs). |
| `APP_BASE_URL` | no (default `https://api.potriv.aydgn.me/api`) | Public API base URL. |
| `JWT_ISSUER` | no (default `https://api.potriv.aydgn.me/api`) | `iss` claim on issued tokens. |
| `ACCESS_TOKEN_TTL_MINUTES` | no (default `15`) | Access token lifetime. |
| `REFRESH_TOKEN_TTL_DAYS` | no (default `7`) | Refresh token lifetime. |
| `SWAGGER_ENABLED` | no (default `false`) | Set `true` to expose OpenAPI/Swagger UI in production (not recommended). |
| `BACKEND_CONSOLE_ENABLED` | no (default `false`) | Enables the embedded administration console under `/api/admin/**` (login, monitor, users, projects). |
| `SYSTEM_ADMIN_EMAIL` | recommended (required when console enabled) | Bootstrap platform system-admin login — also the browser login for the admin console. Override before first boot. |
| `SYSTEM_ADMIN_PASSWORD` | recommended (required when console enabled) | Bootstrap system-admin / admin-console password. **Changing it rotates the password on the next start** (see below). When the console is enabled in prod, the guard refuses placeholder or <12-character values. |
| `SYSTEM_ADMIN_NAME` | no | Display name of the bootstrap system admin. Applied on every start. |

## System administrator bootstrap

`potriv.system-admin.*` describes the platform `SYSTEM_ADMIN` account, and the
application **reconciles it on every start** rather than only creating it once:

| Situation | What happens at startup |
| --- | --- |
| No account with that email | Created: BCrypt password hash, display name, `ACTIVE`, `SYSTEM_ADMIN` role. |
| `SYSTEM_ADMIN_PASSWORD` changed | Password is rotated — **no manual database edit needed**. |
| `SYSTEM_ADMIN_NAME` changed | Display name updated. |
| Account locked out / failed logins | Lockout cleared and the counter reset. |
| Account suspended or disabled | Set back to `ACTIVE`. |
| `SYSTEM_ADMIN` role missing | Re-granted (never duplicated). |
| Nothing differs | Nothing is written — the normal restart case. |

The configured email is normalized (trimmed, lower-cased) exactly like the rest
of the identity code, so the bootstrap account is always reachable by the login
flow.

> **The bootstrap account is configuration-owned break-glass access.** Because
> reconciliation re-activates it, suspending it through the admin console does
> **not** survive a restart. To retire it, change or remove `SYSTEM_ADMIN_EMAIL`
> — do not rely on suspending the account.

Every reconciliation that actually changes something is audited
(`SYSTEM_ADMIN_BOOTSTRAP_CREATED` / `SYSTEM_ADMIN_BOOTSTRAP_RECONCILED`) with the
**names** of the changed fields only. No password or password hash is ever
logged, audited, rendered, or written to documentation.

## Development database drift

Development runs Hibernate `ddl-auto: update`, which creates an enum `CHECK`
constraint once and then never refreshes it. A local database created by older
code therefore silently rejects newly added enum values — the application used
to start fine and then fail on the first audited write, which was confusing
enough to cost manual database surgery.

The `dev` profile now checks this at startup and **fails fast** with the fix
included:

```text
Development database schema drift detected: security_audit_events.event_type
CHECK constraint is missing values [SYSTEM_ADMIN_BOOTSTRAP_CREATED]. Recreate the
local dev database or apply a manual dev-only constraint refresh. Recommended
local reset: docker compose down --volumes && docker compose up -d
(or ./scripts/reset-dev-db.sh --yes).
```

Fix it with the helper (destructive, and it does nothing without `--yes`):

```bash
./scripts/reset-dev-db.sh          # prints what it would do
./scripts/reset-dev-db.sh --yes    # actually recreates the dev database
```

To keep local data instead, refresh the constraint by hand in `psql`.

The detector only ever **reads** the catalog — it never runs `ALTER TABLE` for
you, because changing a schema stays an explicit developer action. Settings:

```yaml
potriv:
  dev:
    schema-drift:
      enabled: true      # dev only; false in the shared default and in prod
      fail-fast: true    # set false to log the warning and start anyway
```

**This is a development aid, not a production control.** In production the
schema is owned by Flyway and validated by Hibernate `ddl-auto=validate`, and
`ProductionSchemaMigrationIntegrationTest` guards the migrations themselves.

## Run commands

Local development (requires `docker compose up -d` for PostgreSQL + Mailpit at
the repository root):

```bash
cd apps/backend
./mvnw spring-boot:run
```

Test suite (Testcontainers starts its own PostgreSQL):

```bash
cd apps/backend
./mvnw test      # full suite
./mvnw verify    # suite + JaCoCo
```

Production (example):

```bash
cd apps/backend
./mvnw -DskipTests package
SPRING_PROFILES_ACTIVE=prod \
DATABASE_URL=jdbc:postgresql://db-host:5432/potriv \
DATABASE_USERNAME=potriv \
DATABASE_PASSWORD=... \
JWT_SECRET=... \
SMTP_HOST=... SMTP_PORT=587 SMTP_USERNAME=... SMTP_PASSWORD=... \
MAIL_FROM=no-reply@potriv.aydgn.me \
java -jar target/potriv-backend-*.jar
```

The API serves under the `/api` context path; the health probe is
`GET /api/actuator/health`.

## Embedded administration console

A read-only, server-rendered administration console ships inside the backend
under `/api/admin/**` (the whole app lives under the `/api` context path): a
login page, the monitor, and read-only users/projects browsers. It shows
health, runtime, database, Flyway, security configuration, a
production-readiness checklist, and platform data — never secrets, and it has
no mutation actions.

Enable it locally:

```bash
cd apps/backend
BACKEND_CONSOLE_ENABLED=true \
SYSTEM_ADMIN_EMAIL=admin@example.com \
SYSTEM_ADMIN_PASSWORD='local-strong-password' \
./mvnw spring-boot:run
# then open http://localhost:8080/api/admin/login and sign in
```

The console is protected by a **server-side session form login** on a
dedicated, high-precedence security chain (`securityMatcher("/admin/**")`),
deliberately separate from the JWT/Bearer API chain:

- Sign in at `GET /api/admin/login`; the form POSTs to `/api/admin/login`.
  Credentials are the platform `User` identity — verified against the stored
  BCrypt hash with the same account-status, lockout, and audit rules as the
  product login. Only a user holding `SYSTEM_ADMIN` may sign in; anyone else
  is rejected at authentication time with a generic "Invalid email or
  password." Sign out with `POST /api/admin/logout`.
- The session cookie (`JSESSIONID`, HttpOnly) authorizes only `/api/admin/**`;
  it grants nothing on the JWT API. Conversely a Bearer token grants nothing
  on the console. CSRF protection is enabled on the admin chain (the JWT chain
  stays stateless and CSRF-exempt).
- When disabled (the default, including production) every `/api/admin/**`
  route answers 404. In production, enabling it requires a real
  `SYSTEM_ADMIN_PASSWORD` — the boot guard refuses missing, placeholder, or
  short passwords.

Do not use it as a product admin panel, an API client, or a data-mutation
surface; it is a read-only monitoring and browsing console only.

## Production-like Docker run

The backend ships a multi-stage production image (`apps/backend/Dockerfile`,
non-root runtime, JRE 21) and a production-like compose stack
(`docker-compose.prod.yml` at the repository root) with PostgreSQL on an
internal-only network (the DB port is deliberately not published — only the
backend reaches it) and healthchecks on `pg_isready` and
`/api/actuator/health`.

```bash
# One-time setup: create the local env file (git-ignored) and edit the values.
cp .env.prod.example .env.prod

# Build and start (or use scripts/backend-prod-smoke.sh which also waits for health):
docker compose --env-file .env.prod -f docker-compose.prod.yml up --build

# Status and health:
docker compose --env-file .env.prod -f docker-compose.prod.yml ps
curl http://localhost:8080/api/actuator/health

# Logs:
docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f potriv-backend

# Stop WITHOUT deleting the database volume:
docker compose --env-file .env.prod -f docker-compose.prod.yml down

# Stop AND deliberately delete the database volume:
docker compose --env-file .env.prod -f docker-compose.prod.yml down --volumes
```

Build the image on its own with:

```bash
docker build -t potriv-backend apps/backend
```

On a fresh database the prod profile applies the Flyway migrations
(`V1__init.sql` + `V2__create_application_schema.sql`) and Hibernate then
validates the result, so the stack reaches a healthy state without any manual
schema step. Schema changes always ship as new migrations — Hibernate never
creates or alters tables in production. See
`docs/backend/production-readiness.md`.
