# Backend Production Readiness

State of the backend's production posture after the PROD-READY-01 hardening
pass. Product behavior is unchanged; this page records what production enforces
and what still needs work before the first real deployment.

## Continuous integration

`.github/workflows/backend-ci.yml` ("Backend CI") is the automated gate. It runs
on pull requests to `main`, pushes to `main`, and manual dispatch:

| Job | What it does |
| --- | --- |
| `backend-verify` | Java 21 (Temurin, Maven cache), then `./mvnw -B clean verify` from `apps/backend` — the full suite, including the Testcontainers PostgreSQL integration tests. No tests are skipped. |
| `production-compose-config` | `docker compose --env-file .env.prod.example -f docker-compose.prod.yml config --quiet`, so broken compose syntax or environment wiring fails before a deploy. |

CI pins Java 21 because that is the project's target; it also keeps logs clean,
since newer JDKs make JaCoCo emit "Unsupported class file major version" noise
that hides real failures. The workflow needs no repository secrets.

Two security workflows run alongside it:

| Workflow | Trigger | Notes |
| --- | --- | --- |
| `codeql.yml` ("CodeQL") | PR → `main`, push → `main`, weekly, dispatch | SAST over the backend, `java-kotlin`, manual Maven build. |
| `dependency-check.yml` ("Dependency Check") | weekly, dispatch — **not** on PRs | Known-CVE scan. **Requires the `NVD_API_KEY` secret**; without it the job warns and exits without scanning, so a green run alone does not prove the dependencies were checked. |

Secret scanning is handled by the connected **GitGuardian** app on pull
requests. SonarCloud is **not** active. Full detail, including accepted
limitations and what is still only a repository setting, lives in
[`security-baseline.md`](security-baseline.md).

**Repository settings still to apply manually** (none are configured by code):
require the `Backend CI / backend-verify` status check on `main` through branch
protection — and the CodeQL check once it is stably green; add the `NVD_API_KEY`
secret; enable GitHub secret scanning push protection. Backend CI has no
`paths:` filter for exactly this reason — a path-filtered workflow never reports
a status on PRs that miss the filter, which would block those PRs forever once
the check is required.

## Fail-fast guardrails (`prod` profile only)

`me.aydgn.potriv.common.config.ProductionConfigGuard` runs at boot and refuses
to start the application when:

- `app.jwt.secret` still contains the shared-default placeholder
  (`change-this-secret…`) or is missing. `JwtProperties` additionally enforces a
  minimum of 32 bytes for HS256 in every profile.
- `cors.allowed-origins` is empty or contains any wildcard (`*`). The CORS
  configuration sends `Access-Control-Allow-Credentials: true`, so wildcard
  origins are never acceptable.
- `spring.datasource.url` is not a `jdbc:postgresql:` URL (blocks accidental
  H2/in-memory datasources).
- `spring.jpa.hibernate.ddl-auto` is anything other than `validate` or `none`
  (blocks `create`, `create-drop`, and `update` in production).

- The embedded administration console (`potriv.backend-console.*`) is enabled
  while `SYSTEM_ADMIN_EMAIL` is missing, or `SYSTEM_ADMIN_PASSWORD` is missing,
  a placeholder (`replace-me…`, `change-me…`), or shorter than 12 characters.
  Disabled (the default) always boots.

These rules are covered by unit tests in `ProductionConfigGuardTest`.

## Embedded administration console

`/api/admin/**` is a read-only, server-rendered Thymeleaf console (packages
`me.aydgn.potriv.admin` and `me.aydgn.potriv.ops.monitor`) with a login page,
the monitor (health, runtime, database, Flyway, safe security configuration,
and a PASS/WARN/FAIL readiness checklist), and read-only users/projects
browsers. It is protected by a server-side **session form login** on its own
high-precedence security chain (`securityMatcher("/admin/**")`) — fully
independent from JWT API auth, with CSRF enabled. Only a platform user holding
`SYSTEM_ADMIN` may sign in (verified against the stored BCrypt hash with the
product login's account-status, lockout, and audit rules); everyone else is
rejected with a generic error. The session grants nothing on the JWT API and a
Bearer token grants nothing on the console. It is disabled by default in every
profile, answers 404 when disabled, and renders no secrets and no mutation
actions. See `docs/backend/environment.md` for usage.

## CORS policy

- Development allows the local frontend origin `http://localhost:5173`.
- Production allows only explicit origins from `CORS_ALLOWED_ORIGINS`
  (default `https://potriv.aydgn.me`); the expected public API origin is
  `https://api.potriv.aydgn.me/api`.
- Allowed methods are `GET, POST, PUT, PATCH, DELETE, OPTIONS`; allowed request
  headers are `Authorization` and `Content-Type`; credentials are enabled.

## Token handling

- Access and refresh tokens are JWTs returned in the JSON body of
  `POST /auth/login` and `POST /auth/refresh`; the API is stateless
  (`SessionCreationPolicy.STATELESS`, CSRF disabled) and authenticates requests
  via the `Authorization: Bearer` header. Refresh cookies are **not** currently
  used — if the frontend later moves refresh tokens into cookies, they must be
  `HttpOnly`, `Secure`, and carry an explicit `SameSite` policy.
- Refresh tokens rotate on every use, and reuse of a rotated token revokes the
  session family (existing behavior, unchanged by this pass).
- TTLs: access tokens 15 minutes, refresh tokens 7 days by default —
  overridable in production via `ACCESS_TOKEN_TTL_MINUTES` and
  `REFRESH_TOKEN_TTL_DAYS`.
- The JWT issuer is environment-driven (`JWT_ISSUER`); tokens are signed with
  HS256 using `JWT_SECRET`.

## OpenAPI / Swagger exposure

- Dev and test keep Springdoc fully available (`/swagger-ui`, `/v3/api-docs`)
  for local development.
- Production disables both the API docs and the Swagger UI by default
  (`springdoc.api-docs.enabled=false`, `springdoc.swagger-ui.enabled=false`).
  Setting `SWAGGER_ENABLED=true` re-enables them deliberately; the security
  chain otherwise leaves those paths permitted but Springdoc simply is not
  served.

## Database and migration strategy

- Development is code-first: `ddl-auto: update`, Flyway disabled.
- Tests run `ddl-auto: create-drop` against Testcontainers PostgreSQL.
- Production runs `ddl-auto: validate` with Flyway enabled
  (`classpath:db/migration`). **Flyway owns the production schema; Hibernate
  only validates it.**

### Migrations

| File | Purpose |
| --- | --- |
| `V1__init.sql` | Original empty placeholder. Kept as-is so any database that already applied it keeps a valid checksum. |
| `V2__create_application_schema.sql` | The real baseline: every application table, UUID primary key, foreign key, unique constraint, index, and enum `CHECK` constraint for the current entity model. |
| `V3__refresh_audit_event_type_check.sql` | Refreshes the `security_audit_events.event_type` `CHECK` constraint for the two `SYSTEM_ADMIN_BOOTSTRAP_*` events — a worked example of the enum rule below. |
| `V4__refresh_audit_event_type_check_invitations.sql` | Same refresh for the two `ADMIN_INVITATION_*` events (ADMIN-UI-07). |
| `V5__refresh_audit_event_type_check_projects.sql` | Same refresh for the three `ADMIN_PROJECT_*` events added with safe project administration actions. |

A fresh production database boots cleanly: Flyway applies `V1` then `V2`, and
Hibernate `validate` then accepts the result. This is covered automatically by
`ProductionSchemaMigrationIntegrationTest`, which starts an empty Testcontainers
PostgreSQL, runs the migrations under the real `prod` profile, and asserts the
context starts.

**Changing the entity model requires a new migration.** Never edit a migration
that has already been applied anywhere — add `V3`, `V4`, `V5`, … instead. This applies
equally to enum changes: an `@Enumerated(EnumType.STRING)` column carries a
`CHECK` constraint listing every constant, so adding a constant needs a
migration that refreshes that constraint. `ProductionSchemaMigrationIntegrationTest`
fails if `security_audit_events.event_type` falls behind `SecurityAuditEventType`.

**Never initialize a production database by running the dev profile.**
`ddl-auto: update` would create tables outside Flyway's history, leaving the
database permanently out of sync with the migrations.

## Actuator

- Shared default exposes `health,info,metrics`; production restricts exposure
  to `health` only. `/actuator/health` and `/actuator/info` are permitted
  without authentication by the security chain (under the `/api` context path).

## Container runtime

- `apps/backend/Dockerfile` builds a multi-stage image: Maven + JDK 21 compile
  the jar, a JRE 21 runtime layer runs it as the non-root `potriv` user with
  container-aware JVM flags through `JAVA_OPTS`. No secrets are baked in.
- `docker-compose.prod.yml` (repository root) runs the production-like stack:
  `potriv-db` (PostgreSQL 16, named volume, internal-only — no published port)
  and `potriv-backend` (prod profile, port `8080`, starts only after the DB
  healthcheck passes, own healthcheck on `/api/actuator/health`).
- Configuration comes from `.env.prod` (copy of `.env.prod.example`;
  git-ignored). `scripts/backend-prod-smoke.sh` validates the compose config,
  starts the stack, and waits for the health endpoint.
- See `docs/backend/environment.md` for the exact commands.

## Known gaps (tracked, not hidden)

- Existing **development** databases were built by `ddl-auto: update` and have no
  Flyway history. They can also carry stale enum `CHECK` constraints, because
  `update` never refreshes an existing constraint — this is why new `ADMIN_*`
  audit events were rejected locally while tests stayed green. **The dev profile
  now detects this at startup** and fails with an actionable message instead of
  breaking later on the first audited write (see
  [`environment.md`](environment.md#development-database-drift)). Fix it with
  `./scripts/reset-dev-db.sh --yes`, or refresh the affected constraint by hand
  to keep local data. Production is unaffected: it is Flyway-managed from the
  first boot.
- The development compose file (`docker-compose.yml`) provisions local
  PostgreSQL and Mailpit only and is unchanged.
- Rate limiting beyond the existing login lockout is not implemented.
- No reverse proxy / TLS termination is included; the production compose file
  publishes plain HTTP on 8080 for local smoke testing.
