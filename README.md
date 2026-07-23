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

An embedded read-only monitoring page is available at
`http://localhost:8080/api/admin/monitor` when enabled with
`BACKEND_CONSOLE_ENABLED=true` plus explicit HTTP Basic credentials
(see `docs/backend/environment.md`).

See `docs/backend/environment.md`, `docs/backend/production-readiness.md`, and
`docs/backend/deployment-checklist.md` for the full production documentation.
