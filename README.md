# Potriv

Potriv is a web-based team allocation and skill matching platform for organizations.

It helps project managers find suitable employees based on skills, departments, roles, availability, and previous project experience.

## Tech Stack

- Java 21
- Spring Boot 3
- PostgreSQL
- React
- TypeScript
- Docker

## Architecture

Potriv starts as a modular monolith and is designed to be split into microservices later.

Core modules:

- Identity
- Organization
- People
- Department
- Skill
- Project
- Allocation
- Notification

## Running the Backend

Local development (PostgreSQL + Mailpit via the dev compose file):

```bash
docker compose up -d
cd apps/backend
./mvnw spring-boot:run
```

Production-like Docker stack (prod profile, internal-only PostgreSQL):

```bash
cp .env.prod.example .env.prod   # edit the placeholder values
./scripts/backend-prod-smoke.sh
```

An embedded read-only **administration console** (monitor plus a Django-style
backoffice for users, organizations, departments, projects, allocations,
invitations, and audit logs) is served under `http://localhost:8080/api/admin`
when enabled with `BACKEND_CONSOLE_ENABLED=true`. It is protected by a
server-side session form login: sign in at `/api/admin/login` with a
`SYSTEM_ADMIN` account (`SYSTEM_ADMIN_EMAIL` / `SYSTEM_ADMIN_PASSWORD`) — the
session is isolated from the JWT API. See
[docs/admin/ADMIN_UI.md](docs/admin/ADMIN_UI.md) and
`docs/backend/environment.md`.

See `docs/backend/environment.md`, `docs/backend/production-readiness.md`, and
`docs/backend/deployment-checklist.md` for the full production documentation.

## Continuous Integration

**Backend CI** (`.github/workflows/backend-ci.yml`) runs on pull requests to
`main`, pushes to `main`, and manual dispatch:

- `backend-verify` — Java 21, then `./mvnw -B clean verify` from `apps/backend`
  (full suite, Testcontainers PostgreSQL included, nothing skipped).
- `production-compose-config` — validates `docker-compose.prod.yml` against
  `.env.prod.example`.

No repository secrets are required for Backend CI.

Security gates run as separate workflows:

- **CodeQL** (`codeql.yml`) — SAST on PRs, pushes to `main`, and weekly.
- **Dependency Check** (`dependency-check.yml`) — weekly/manual CVE scan.
  Requires an `NVD_API_KEY` secret; without it the job warns and skips instead
  of starting a multi-hour anonymous NVD sync.
- **GitGuardian** — connected app, scans pull requests for secrets.

See [`docs/backend/security-baseline.md`](docs/backend/security-baseline.md) for
the full security posture, accepted limitations, and the repository settings
(branch protection, `NVD_API_KEY`, push protection) that still have to be
applied by hand.
