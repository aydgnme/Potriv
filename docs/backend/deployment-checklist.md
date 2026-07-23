# Backend Deployment Checklist

Run through this list for every production deployment of `apps/backend`.

## Pre-deploy

- [ ] `main` is green: `cd apps/backend && ./mvnw clean verify` (full suite,
      currently 300+ tests, `BUILD SUCCESS`).
- [ ] Flyway migrations under `src/main/resources/db/migration` cover every
      schema change since the last release (production runs
      `ddl-auto: validate` — Hibernate will not create or alter tables).
- [ ] `SPRING_PROFILES_ACTIVE=prod` is set in the target environment.
- [ ] All required environment variables are present
      (see `docs/backend/environment.md`): `DATABASE_URL`,
      `DATABASE_USERNAME`, `DATABASE_PASSWORD`, `JWT_SECRET`, `SMTP_HOST`,
      `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `MAIL_FROM`.
- [ ] `JWT_SECRET` is a strong random value (≥ 32 bytes) unique to production —
      the guard refuses the repository placeholder.
- [ ] `CORS_ALLOWED_ORIGINS` lists the exact frontend origins
      (e.g. `https://potriv.aydgn.me`) — no wildcards.
- [ ] `SYSTEM_ADMIN_EMAIL` / `SYSTEM_ADMIN_PASSWORD` are overridden from their
      repository defaults before the first boot against a fresh database.
- [ ] `SWAGGER_ENABLED` is unset or `false`.
- [ ] `BACKEND_CONSOLE_ENABLED` is unset or `false` — or, if the embedded
      monitor console is deliberately enabled, `BACKEND_CONSOLE_USERNAME` and
      a strong `BACKEND_CONSOLE_PASSWORD` (≥ 12 chars, no placeholder) are set.
- [ ] Database backup / snapshot taken before applying new migrations.

## Deploy

- [ ] Build the artifact: `./mvnw -DskipTests package` (tests already ran in
      the verify step) — or build the container image:
      `docker build -t potriv-backend apps/backend` (multi-stage, non-root
      runtime; see `docker-compose.prod.yml` for the expected environment).
- [ ] Start the new version; Flyway applies pending migrations on boot.
- [ ] Boot succeeded — a guard failure (`ProductionConfigGuard`,
      `JwtProperties`) or a Flyway/Hibernate validation error aborts startup
      by design; fix configuration or migrations rather than working around
      the guard.

## Post-deploy verification

- [ ] `GET https://api.potriv.aydgn.me/api/actuator/health` returns `UP`.
- [ ] `POST /api/auth/login` works for a known account and returns an
      access/refresh token pair.
- [ ] An authenticated request (e.g. `GET /api/auth/me`) succeeds with the new
      access token.
- [ ] Browser requests from `https://potriv.aydgn.me` pass CORS (no wildcard
      warnings, credentials allowed).
- [ ] `GET /api/v3/api-docs` returns 404 (Swagger disabled) unless
      `SWAGGER_ENABLED=true` was set deliberately.
- [ ] Transactional mail (invite or password reset) is delivered from
      `MAIL_FROM`.

## Rollback (basic)

- Redeploy the previous application version. Because production never runs
  destructive Hibernate DDL, the schema is only changed by Flyway migrations.
- If a new migration is incompatible with the previous version, restore the
  pre-deploy database backup, then redeploy the previous version.
- Write down-safe migrations where practical (additive first, destructive
  cleanup in a later release) so a plain version rollback usually needs no
  database restore.
