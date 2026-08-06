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

An embedded **administration console** (monitor plus a Django-style backoffice
for users, organizations, departments, projects, allocations, invitations, skills
and audit logs) is served under `http://localhost:8080/api/admin` when enabled
with `BACKEND_CONSOLE_ENABLED=true`. It is read-first with a small, audited set of
safe actions — and deliberately cannot grant `SYSTEM_ADMIN`, change credentials,
hard-delete users, or alter allocations, proposals or audit events.

```bash
cd apps/backend
BACKEND_CONSOLE_ENABLED=true \
SYSTEM_ADMIN_EMAIL=admin@aydgn.me \
SYSTEM_ADMIN_PASSWORD='strong-local-password' \
SYSTEM_ADMIN_NAME='Mert Aydogan' \
./mvnw spring-boot:run
```

Sign in at `http://localhost:8080/api/admin/login` with that `SYSTEM_ADMIN`
account; the browser session is fully isolated from the JWT API. See
[docs/admin/ADMIN_UI.md](docs/admin/ADMIN_UI.md) for what the console can and
cannot do, and `docs/backend/environment.md` for the variables.

Outbound mail (the password-reset link is the only message Potriv sends) is
captured locally by Mailpit and, in production, delivered by a self-hosted
Stalwart stack — see
[docs/backend/mail-infrastructure.md](docs/backend/mail-infrastructure.md) for
the architecture and [infra/mail/README.md](infra/mail/README.md) for the
runbook. Real public deliverability additionally requires DNS, PTR and outbound
port 25, none of which live in this repository.

See `docs/backend/environment.md`, `docs/backend/production-readiness.md`, and
`docs/backend/deployment-checklist.md` for the full production documentation, and
[docs/backend/final-audit.md](docs/backend/final-audit.md) for the end-to-end
readiness audit — including what was verified, what was fixed, and what remains
an accepted limitation.

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
