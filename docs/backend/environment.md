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
| `BACKEND_CONSOLE_ENABLED` | no (default `false`) | Enables the embedded read-only monitor console at `/api/admin/monitor`. |
| `BACKEND_CONSOLE_USERNAME` | when console enabled | HTTP Basic username for the monitor console. |
| `BACKEND_CONSOLE_PASSWORD` | when console enabled | HTTP Basic password; the prod guard refuses placeholder or <12-character values. |
| `SYSTEM_ADMIN_EMAIL` | recommended | Seeded platform system-admin login. Defaults exist but should be overridden. |
| `SYSTEM_ADMIN_PASSWORD` | recommended | Seeded platform system-admin password. Override the default before first boot. |
| `SYSTEM_ADMIN_NAME` | no | Display name of the seeded system admin. |

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

## Embedded monitor console

A read-only, server-rendered monitoring page ships inside the backend at
`/api/admin/monitor` (the whole app lives under the `/api` context path). It
shows health, runtime, database, Flyway, security configuration, and a
production-readiness checklist — never secrets or business data, and it has
no mutation actions.

Enable it locally:

```bash
cd apps/backend
BACKEND_CONSOLE_ENABLED=true \
BACKEND_CONSOLE_USERNAME=admin \
BACKEND_CONSOLE_PASSWORD='local-strong-password' \
./mvnw spring-boot:run
# then open http://localhost:8080/api/admin/monitor (HTTP Basic prompt)
```

The console uses HTTP Basic on a dedicated security chain, deliberately
separate from the JWT/Bearer API auth: it must work without any organization
user or product login, and its credentials grant nothing on the API. When
disabled (the default, including production) the route answers 404. In
production, enabling it requires explicit strong credentials — the boot guard
refuses missing, placeholder, or short passwords. Do not use it as a product
admin panel, an API client, or a data browser; it is a monitoring surface
only.

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

Current limitation: because the prod profile validates the schema against
Flyway-managed migrations and only an empty baseline exists, the backend will
fail schema validation on a fresh database until real migrations are authored
(see `docs/backend/production-readiness.md`). This is the intended fail-fast
posture.
