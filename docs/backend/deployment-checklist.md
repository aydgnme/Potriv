# Backend Deployment Checklist

Run through this list for every production deployment of `apps/backend`.

## Pre-deploy

- [ ] `main` is green: **Backend CI** passed on the merge commit
      (`.github/workflows/backend-ci.yml` runs `./mvnw -B clean verify` from
      `apps/backend` on every PR to `main`, every push to `main`, and on manual
      dispatch). Locally the same gate is
      `cd apps/backend && ./mvnw clean verify` (full suite, `BUILD SUCCESS`).
- [ ] **CodeQL** reported no new alerts on the release commit
      (Security → Code scanning).
- [ ] The most recent **Dependency Check** run actually scanned — it is weekly
      and skips with a warning unless the `NVD_API_KEY` secret is set. Review the
      uploaded report artifact for critical CVEs. See
      [`security-baseline.md`](security-baseline.md).
- [ ] Flyway migrations under `src/main/resources/db/migration` cover every
      schema change since the last release (production runs
      `ddl-auto: validate` — Hibernate will not create or alter tables).
      Entity or enum changes since the last release need a **new** migration
      (`V3`, `V4`, …); never edit an already-applied file. A fresh database is
      built by `V1` + `V2__create_application_schema.sql`.
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
      repository defaults before the first boot against a fresh database. These
      double as the admin-console browser login. The account is **reconciled on
      every start**, so changing `SYSTEM_ADMIN_PASSWORD` here rotates the
      credential at the next deploy — and suspending the account will not stick.
      See [`environment.md`](environment.md#system-administrator-bootstrap).
- [ ] `SWAGGER_ENABLED` is unset or `false`.
- [ ] Orchestrator liveness/readiness probes point at
      `/api/actuator/health/readiness` (db + ping), **not** the aggregate
      `/api/actuator/health`, which also reports outbound mail and would take a
      serving instance out of rotation during an SMTP outage.
- [ ] If the console **is** enabled, confirm what it grants: a `SYSTEM_ADMIN`
      can rename organizations, manage departments and the skill catalog, edit
      user names, activate/suspend/unlock accounts, grant manageable roles,
      revoke/regenerate invitations, and change or delete a project that is still
      in planning. It cannot grant `SYSTEM_ADMIN`, change passwords or emails,
      hard-delete users, delete organizations, or touch allocations, proposals or
      audit events. See [`../admin/ADMIN_UI.md`](../admin/ADMIN_UI.md).
- [ ] `BACKEND_CONSOLE_ENABLED` is unset or `false` — or, if the embedded
      administration console is deliberately enabled, a strong
      `SYSTEM_ADMIN_PASSWORD` (≥ 12 chars, no placeholder) is set (the console
      login is a `SYSTEM_ADMIN` browser session; there are no separate console
      credentials).
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
