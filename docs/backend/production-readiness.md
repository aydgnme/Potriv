# Backend Production Readiness

State of the backend's production posture after the PROD-READY-01 hardening
pass. Product behavior is unchanged; this page records what production enforces
and what still needs work before the first real deployment.

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

These rules are covered by unit tests in `ProductionConfigGuardTest`.

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
  (`classpath:db/migration`).
- **Honest current state:** the only migration, `V1__init.sql`, is an empty
  baseline. Because production validates the schema against the entity model,
  the first production deployment requires authoring real Flyway migrations
  (or a reviewed baseline generated from the entity model) beforehand. Until
  those exist, a `prod`-profile boot against an empty database will
  intentionally fail during schema validation rather than auto-create tables.

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

- Real Flyway migrations must be written before the first production deploy.
  On an empty database the prod profile applies the (empty) Flyway baseline and
  then intentionally fails Hibernate schema validation — the compose stack
  therefore does not reach a healthy state until migrations exist.
- The development compose file (`docker-compose.yml`) provisions local
  PostgreSQL and Mailpit only and is unchanged.
- Rate limiting beyond the existing login lockout is not implemented.
- No reverse proxy / TLS termination is included; the production compose file
  publishes plain HTTP on 8080 for local smoke testing.
