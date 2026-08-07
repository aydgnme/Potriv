# Potriv API E2E

Black-box HTTP automation for the Potriv backend, with an endpoint-coverage gate.

It boots an isolated backend, discovers the HTTP surface from OpenAPI, exercises
every operation with an actor allowed to use it, runs the security matrices, and
writes a report you can hand to someone as an acceptance artifact.

The point is not "send requests". The point is that **every operation is
accounted for**, and that the accounting fails loudly when the backend drifts.

---

## Why it fails when you add an endpoint

Add a controller method, forget a scenario, and the run ends:

```text
Operations: 68/69 executed, accounting 98.6%
Coverage drift
- Operations with no registered execution: 1
  - `POST /projects/{projectId}/archive`
Result: NOT READY — ENDPOINT OR SECURITY FAILURES REMAIN
```

There is no runtime skip. An operation is either exercised, or it carries an
explicit entry in `INTENTIONAL_EXCLUSIONS` (`src/openapi/registry.ts`) with a
reason a reviewer can disagree with.

---

## Running it

```bash
cd tools/api-e2e
npm ci
npm run e2e
```

That single command does everything:

1. preflight (Node, Docker, Java, ports, safety guard)
2. starts an isolated PostgreSQL + Mailpit (`docker compose -p potriv-api-e2e`)
3. starts the backend against them
4. polls `/actuator/health/readiness`
5. fetches OpenAPI and builds the operation inventory
6. builds fixtures, runs scenarios and matrices
7. writes reports
8. tears the environment down again

Other commands:

```bash
npm run typecheck   # tsc --noEmit
npm test            # unit tests for the suite's own logic
npm run e2e:existing   # run against an already-running backend
```

`e2e:existing` never starts or stops anything: it assumes it does not own the
target. The safety guard still applies.

### Ports

Chosen away from the normal dev stack so a running Potriv never gets disturbed:

| Service | Port | Override |
| --- | --- | --- |
| backend | 18080 | `E2E_BACKEND_PORT` |
| PostgreSQL | 55432 | `E2E_DB_PORT` |
| Mailpit SMTP | 11025 | `E2E_SMTP_PORT` |
| Mailpit HTTP | 18025 | `E2E_MAIL_HTTP_PORT` |

---

## Safety model

This suite creates, mutates and deletes data. Pointing it somewhere real must
take more than one environment variable:

```text
localhost / 127.0.0.1 / ::1     allowed
anything else                   refused
+ E2E_ALLOW_REMOTE=true         reachable, but mutations still refused
+ E2E_ALLOW_DESTRUCTIVE_REMOTE=true   mutations permitted
```

The chosen target is printed before anything starts. The database is a `tmpfs`
volume — nothing survives the run even if teardown is skipped.

### Credentials

There are none in this repository. Every password the suite uses — the actors',
the bootstrap system administrator's, the two password-reset replacements and
PostgreSQL's — is generated from `crypto.randomBytes` at process start
(`src/config/credentials.ts`).

They were literals until secret scanning flagged them, correctly: a committed
credential is a committed credential whatever it opens, and "it is only a test
password" is the reasoning that normalises real leaks. Generating them is also
just better — two runs never share one, and nothing a scanner can find here
authenticates anywhere.

The exceptions are the deliberately invalid values fed to validation checks
(`'short'`, `'p'`); they exist to be rejected.

---

## How endpoint discovery works

**Source A — OpenAPI.** `/api/v3/api-docs` at runtime; every `paths[path][method]`
becomes one operation keyed `METHOD /path`.

**Source B — the source tree.** The controller annotations were counted during
this suite's construction (68 REST operations across 25 `@RestController`
classes) and reconciled against OpenAPI. They match exactly.

**Source C — operational routes.** `/actuator/health`, `/health/readiness`,
`/info`, `/metrics`, `/v3/api-docs` and the Swagger entry route are probed under
operational checks. They are infrastructure, not product operations, so they are
reported separately rather than folded into REST accounting.

**Source D — the admin console.** `/admin/**` serves HTML behind a session login
and is absent from OpenAPI by design. It has its own manifest in
`src/scenarios/admin-console.ts` and its own count in the report. An HTML page is
never counted as a REST operation.

---

## How coverage is calculated

Three numbers, deliberately not collapsed into one:

| Measure | Meaning |
| --- | --- |
| **Operation accounting** | every operation reached a decided outcome (PASS / FAIL / excluded) |
| **Success-path execution** | the operation actually did its job at least once, as an allowed actor |
| **Security coverage** | anonymous / role / isolation checks that ran |

An operation covered only by "anonymous gets 401" counts for accounting and for
security — but **not** for success path. A 401 proves authentication exists, not
that the endpoint works.

---

## Adding coverage for a new endpoint

1. Add a success probe in `src/scenarios/success.ts` using `prober.run({...})`.
   The `template` must be the **OpenAPI path template**, not the resolved URL —
   that is what ties the probe to the registry.
2. If it is role-sensitive, add a case to `ROLE_CASES` in `src/security/matrices.ts`.
3. If it is organization-scoped, add a case to the isolation matrix.
4. If it is public, add it to `PUBLIC_OPERATIONS` — otherwise the anonymous
   matrix will (correctly) demand a 401.

Expected statuses come from the contract, not from habit: `200`, `201`, `202` and
`204` all appear in this API, and the suite asserts the declared one.

---

## Actors and fixtures

Everything is built through real application flows — no direct database writes.
If a resource cannot be created through the API, that is a finding.

Two organizations exist so isolation can be tested with **real** identifiers from
the other tenant:

```text
orgAAdmin  orgAEmployee  orgADepartmentManager  orgAProjectManager
orgBAdmin  orgBEmployee  orgBDepartmentManager  orgBProjectManager
systemAdmin
```

Every generated identity is stamped with the run id
(`qaapi-<utc>-<random>-a-employee@potriv.test`) and uses the `.test` domain, so
a resource can always be traced back to the run that made it.

Time-dependent fixtures are computed from a captured **UTC** reference, never
from the wall clock — the backend reasons in UTC and disagreeing with it produces
failures that only appear near midnight.

---

## Reports

Written to `reports/<run-id>/` and copied to `reports/latest/`:

```text
report.md        human-readable summary and endpoint table
report.json      canonical machine-readable result (schemaVersion: 1)
report.html      self-contained, no CDN, light/dark
junit.xml        one testcase per scenario, for CI
endpoints.json   normalized operation inventory with per-operation status
failures.json    failures with actor, expected/actual, request id
backend.log      the isolated backend's output
```

Every writer consumes data that has already passed through `src/http/redaction.ts`.
A secret is never scrubbed in Markdown while surviving in JSON. Generated runs are
git-ignored.

---

## Exit codes

```text
0  every required check passed
1  a test, assertion or coverage gate failed
2  the environment or preflight blocked the run
```

CI treats `1` and `2` as failures.

---

## CI

`.github/workflows/api-e2e.yml` runs on pull requests and manual dispatch. It
needs no secrets: the isolated environment generates its own local-only
credentials and Mailpit captures all mail, so nothing is ever delivered.

Reports upload with `if: always()` under the artifact name
`potriv-api-e2e-report`. Raw `.env` files and unredacted logs are not uploaded.

---

## Troubleshooting

**"port 18080 available — in use"** — a previous run left a backend behind. The
runner cleans up in `finally`, but a `SIGKILL` can outrun it:

```bash
pkill -f "spring-boot:run"
E2E_DB_PASSWORD=unused docker compose -p potriv-api-e2e -f docker-compose.e2e.yml down -v
```

The variable is required by the Compose file and generated per run, so tearing
down by hand needs *a* value — any value. Nothing is being authenticated here;
the containers and their volumes are simply removed.

**"backend did not become ready"** — read `reports/<run-id>/backend.log`. The
usual causes are a port collision or a Docker daemon that is not running.

**A failure you want to trace into the backend** — every failure carries an
`X-Request-ID`; grep `backend.log` for it. That is what the correlation id is for.

**Keeping the environment after a failure**:

```bash
E2E_KEEP_ENV=true npm run e2e
```

Nothing is torn down, so you can poke at the database and Mailpit
(`http://127.0.0.1:18025`) directly.
