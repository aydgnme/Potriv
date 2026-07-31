# Backend Security Baseline

A point-in-time review of the backend's security posture, taken before the
repository gained automated security scanning. It records what is enforced
today, what was actually checked (and how), and what still has to be wired into
CI.

Reviewed at commit: `main` @ PR #56 (Flyway baseline merged).
Backend baseline: `./mvnw clean verify` → 441 tests, 0 failures, 0 errors.

Nothing in this document is aspirational. Where a control is missing, it says so.

---

## 1. Security model

### Two isolated authentication chains

The application deliberately runs **two** Spring Security filter chains that
share no session, no credentials, and no authorities.

| | REST API | Embedded admin console |
| --- | --- | --- |
| Config | `common/security/SecurityConfig` | `admin/security/AdminSecurityConfig` |
| Matcher | everything not claimed by the admin chain | `@Order(0)`, `securityMatcher("/admin/**")` |
| Authentication | JWT `Authorization: Bearer` | server-side session form login |
| Session policy | `STATELESS` | `IF_REQUIRED`, session fixation → new session |
| CSRF | disabled (correct: no cookie-borne auth) | **enabled** on every admin POST |
| Authority | per-endpoint roles via `@EnableMethodSecurity` | `hasRole("SYSTEM_ADMIN")` for all but login/static |

**Isolation is enforced and tested**, not assumed: an admin browser session
authenticates nothing on `/api/**`, and a Bearer token authenticates nothing on
`/api/admin/**` (`AdminApiIsolationIntegrationTest`,
`AdminSessionSecurityIntegrationTest`).

### `SYSTEM_ADMIN` boundary

- Only a platform user holding `AccessRole.SYSTEM_ADMIN` can sign in to the
  console. The check happens **at authentication time**, and every failure mode
  (unknown email, wrong password, missing role, inactive/locked account) returns
  the same generic `Invalid email or password.` — no account enumeration.
- Admin credentials are the ordinary `User` record verified against its BCrypt
  hash, reusing the product login's account-status, lockout, and audit rules.
  There is no second admin credential store.
- The console is **disabled by default in every profile**. While disabled, every
  `/api/admin/**` route — login included — answers `404`, so the surface does not
  reveal that it exists.
- `SYSTEM_ADMIN` itself cannot be granted or revoked from the console, and an
  admin cannot suspend their own account or the last active `SYSTEM_ADMIN`.

### CSRF policy

CSRF protection is enabled exactly where it is meaningful: the cookie/session
admin chain. The REST chain is stateless and Bearer-authenticated, where CSRF
tokens add no protection. Verified by `AdminCsrfIntegrationTest` (POST without a
token → `403`).

### CORS policy

- Explicit origin list from `cors.allowed-origins`; `allowCredentials(true)`.
- Methods `GET, POST, PUT, PATCH, DELETE, OPTIONS`; request headers
  `Authorization`, `Content-Type`.
- **Wildcards are refused at boot in production** by `ProductionConfigGuard` —
  necessary, because credentialed CORS plus `*` would be a serious flaw.

### Credential and token handling

| Secret | Storage | Notes |
| --- | --- | --- |
| User password | BCrypt hash | never rendered anywhere |
| Refresh token | **SHA-256 hash** (`refresh_tokens.token_hash`) | rotates on use; reuse revokes the session family |
| Password reset token | **SHA-256 hash** (`password_reset_tokens.token_hash`) | 30-minute TTL |
| Organization invite token | **raw value** (`invite_tokens.token`) | see §5, accepted risk |
| JWT signing secret | environment only | HS256, min 32 bytes enforced by `JwtProperties` in *every* profile |

Login lockout: 5 failed attempts → 15-minute lock (`app.auth.*`), applied by both
the JWT and admin login paths.

### Actuator exposure

- Shared default: `health,info,metrics`.
- **Production: `health` only.** `/actuator/health` and `/actuator/info` are
  permitted unauthenticated by the security chain.

### Production fail-fast guard

`ProductionConfigGuard` (`@Profile("prod")`) refuses to start when:

1. `app.jwt.secret` is missing or still the repository placeholder;
2. `cors.allowed-origins` is empty or contains a wildcard;
3. `spring.datasource.url` is not PostgreSQL;
4. `spring.jpa.hibernate.ddl-auto` is anything but `validate`/`none`;
5. the admin console is enabled without a real `SYSTEM_ADMIN_PASSWORD`
   (placeholder or shorter than 12 characters is rejected).

Covered by `ProductionConfigGuardTest`.

### Schema posture

Production is Flyway-managed (`V1__init.sql` + `V2__create_application_schema.sql`)
with Hibernate `ddl-auto=validate`; Hibernate never mutates the production
schema. `ProductionSchemaMigrationIntegrationTest` boots the real `prod` profile
against an empty database and additionally fails if
`security_audit_events.event_type` falls behind `SecurityAuditEventType`.

---

## 2. What was actually scanned

| Check | Tool | Status |
| --- | --- | --- |
| Secret / sensitive data | `git ls-files` + targeted `grep` over tracked files | **Run.** See §4. |
| Secret scanning (dedicated) | `gitleaks` | **Not run — not installed locally.** Must be a CI job. |
| Dependency vulnerabilities (SCA) | `org.owasp:dependency-check-maven` | See §3. |
| SAST | SonarQube / SonarCloud | **Not active.** No workflow, no connected project. §6. |
| SAST | CodeQL | **Not active.** No `.github/workflows/codeql.yml`. §7. |
| Container / Dockerfile review | manual | **Run.** See §5. |
| Production config review | manual | **Run.** See §5. |
| Schema/enum drift | `ProductionSchemaMigrationIntegrationTest` | **Automated, green.** |

> No security badge is claimed anywhere in this repository, because no scanner is
> connected yet.

---

## 3. Dependency inventory and vulnerability scan

Resolved with `./mvnw dependency:tree` — **102 compile/runtime artifacts**.
Direct dependencies and the transitive components that historically carry CVEs:

| Component | Resolved version |
| --- | --- |
| Spring Boot (parent) | 3.5.16 |
| Spring Security | 6.5.11 |
| Tomcat embed (core/el/websocket) | 10.1.55 |
| Jackson Databind | 2.21.4 |
| Logback (classic/core) | 1.5.34 |
| SnakeYAML | 2.4 |
| Flyway (core + postgresql) | 11.7.2 |
| PostgreSQL JDBC | 42.7.11 |
| springdoc-openapi | 2.8.16 |
| jjwt (api/impl/jackson) | 0.12.6 |
| commons-lang3 | 3.17.0 |
| Lombok | 1.18.46 (optional, compile-time) |

Every one of these is a current release line, and the components behind the
best-known recent JVM advisories (Logback, SnakeYAML, Jackson, Tomcat) are all
on patched versions. No outdated or obviously vulnerable dependency was found by
inspection.

**OWASP Dependency-Check status: attempted, then deliberately abandoned — not
skipped silently.** Run locally as
`./mvnw -B org.owasp:dependency-check-maven:check`. Without an `NVD_API_KEY` the
plugin must first download the whole National Vulnerability Database and warns
that the update *"can take a VERY long time"*. Measured rate on this machine:

```
[WARNING] An NVD API Key was not provided - it is highly recommended ...
[INFO] NVD API has 372,166 records in this update
[INFO] Downloaded 20,000/372,166 (5%)      # after several minutes
```

Extrapolating, a first full sync would take roughly **2.5 hours**, so the scan
was stopped and the documented `dependency:tree` fallback used instead. **This
means no CVE database has actually been consulted for this baseline** — the
assessment above is version-inspection only, and that gap is exactly what the CI
job below must close.

**Required in CI:** run Dependency-Check as its own **scheduled** job (not on
every PR) with an `NVD_API_KEY` repository secret and a cached NVD data
directory, so the first sync is paid once. Do **not** add blanket suppressions; a
suppression needs a written, per-CVE justification.

---

## 4. Secret and sensitive-data audit

**Scope:** every tracked file (`git ls-files`), excluding build output.

**Result: no live secret is committed at `HEAD`.** The matches that exist are all
benign and were each inspected:

- `application.yml` ships the shared development placeholder
  `app.jwt.secret: change-this-secret-in-production-change-this-secret`. This is
  deliberate and safe: production refuses to boot with it
  (`ProductionConfigGuard`), and `BackendMonitorService` flags it as a readiness
  **FAIL**.
- `.env.prod.example` contains placeholder names only
  (`change-me-in-production`, `replace-with-at-least-32-random-bytes…`). Real
  `.env*` files are git-ignored, and `.dockerignore` excludes them from images.
- Remaining hits are entity/table/index names (`invite_tokens`,
  `refresh_tokens.token_hash`), method names (`passwordResetService`), and test
  constants.

### Rendering rules (verified in the admin UI)

- No password hash, raw refresh token, raw invite token, or JWT secret is
  rendered in any template. Invitations expose only a masked `tokenHint`; audit
  detail blobs are excluded from the read models on purpose.
- The monitor shows `jwtSecretConfigured` as a **boolean** and token TTLs as
  durations — never the secret itself.

### Historical finding (fixed, worth recording)

`.env.prod.example` briefly carried a weak real-looking console password
(`BACKEND_CONSOLE_PASSWORD=test12.!`), added in `22ef156` and removed in
`c7080e4` when session login replaced the Basic-auth console. It remains in git
history.

*Assessment:* not a production credential — it lived only in a committed
`.example` template, the variable it belonged to is now obsolete, and no
deployed system used it. **No rotation required.** It is recorded here because
"a placeholder file" is exactly how real secrets usually enter history, and CI
secret scanning (§7) is the control that prevents a repeat.

---

## 5. Container and production configuration audit

| Question | Answer |
| --- | --- |
| Backend runtime is non-root? | **Yes** — multi-stage build; the JRE 21 runtime layer runs as `USER potriv`. |
| Secrets baked into the image? | **No** — all configuration is environment-driven; `.dockerignore` excludes `.env`, `.env.*`, `target`, `.git`. |
| Actuator restricted in production? | **Yes** — `health` only. |
| Swagger disabled in production? | **Yes** — `springdoc.*.enabled=false` unless `SWAGGER_ENABLED=true` is set deliberately. |
| Production CORS requires explicit origins? | **Yes** — wildcards rejected at boot. |
| JWT secret required and length-guarded? | **Yes** — no default in the prod profile; ≥32 bytes enforced in every profile. |
| System-admin bootstrap variables present? | **Yes** — `SYSTEM_ADMIN_EMAIL` / `_PASSWORD` / `_NAME`, with strength rules when the console is enabled. |
| Database reachable from outside? | **No** — `docker-compose.prod.yml` deliberately publishes no port for `potriv-db`; only the backend reaches it over the internal network. |
| Required configuration fails fast? | **Yes** — compose uses `${VAR:?...}` for every required value. |
| Mail health requirements clear? | **Partly** — see the note below. |
| Flyway active in production? | **Yes** — `flyway.enabled=true`, `ddl-auto=validate`. |

**Mail note (operational, not a vulnerability):** the aggregate
`/actuator/health` includes a `mail` indicator, so an unreachable or
misconfigured SMTP server makes the container's healthcheck report `DOWN` even
though the application and database are fine. Deployments must supply working
SMTP credentials, or the stack will look unhealthy for a non-security reason.

**No critical configuration bug was found**, so this task changes no
configuration.

---

## 6. SonarQube / SonarCloud readiness

**Status: not active.** There is no scanner workflow and no evidence of a
connected SonarCloud project in this repository.

`sonar-project.properties` is added at the repository root with the module
layout already filled in (sources, tests, binaries, JaCoCo XML path). It is
**inert**: nothing in `mvn verify` reads it, so local builds keep working
without any Sonar credentials.

⚠️ **Two values must be confirmed before the first scan** — they are the
conventional SonarCloud defaults for a GitHub-imported project, not verified
facts:

```properties
sonar.projectKey=aydgnme_Potriv
sonar.organization=aydgnme
```

Setup still required (outside this repository):

1. Create/confirm the SonarCloud organization and import the project.
2. Correct the two keys above if SonarCloud assigned different ones.
3. Store `SONAR_TOKEN` as a GitHub Actions secret — **never** in a file.
4. Add the analysis step to CI, after `verify`, so the JaCoCo report exists.

---

## 7. What CI must enforce next

The backend verification workflow (`.github/workflows/backend-ci.yml`) is added
by **PR #57** — `backend-verify` (`./mvnw -B clean verify` on Java 21) and
`production-compose-config`. That gives correctness and compose validation, but
**no security scanning**. The remaining gaps:

| Gap | Suggested job |
| --- | --- |
| SAST | `.github/workflows/codeql.yml` |
| SCA | OWASP Dependency-Check, scheduled, with `NVD_API_KEY` |
| Secret scanning | Gitleaks job and/or GitHub secret scanning + push protection |

### Recommended CodeQL configuration

- **Language:** `java-kotlin` (Java is currently enough).
- **Build mode:** manual — `cd apps/backend && ./mvnw -B -DskipTests compile`.
  Autobuild is unreliable for a nested Maven module in a monorepo, and CodeQL
  only needs compiled classes, so skipping tests keeps it fast.
- **Triggers:** pull requests to `main`, pushes to `main`, plus a weekly
  schedule (so newly published rules reach existing code).

### Branch protection (a GitHub setting, not code)

Once the first runs are green, require on `main`: `Backend CI / backend-verify`,
and later the CodeQL check.

---

## 8. Known limitations — accepted

- **Dev profile uses `ddl-auto: update`** and **test uses `create-drop`**, both
  with Flyway disabled. This is intentional for iteration speed; production is
  the only Flyway-managed environment.
- **Dev database enum `CHECK` drift.** `update` never refreshes an existing
  `CHECK` constraint, so a dev database can reject new enum values (this really
  happened with new `ADMIN_*` audit events). Fix by recreating the dev database
  (`docker compose down --volumes && docker compose up -d`). Production is
  unaffected, and the migration test guards against shipping the drift.
- **Invite tokens are stored raw**, unlike refresh and password-reset tokens.
  An organization invite is a deliberately shareable join link rather than a
  personal credential, it can be rotated (`EMPLOYEE_INVITE_ROTATED`), and it is
  never rendered in the admin UI (only a masked hint). *Accepted for now;*
  hashing it — with lookup by hash — is a cheap hardening step whenever invite
  handling is next touched.
- **No rate limiting** beyond the login lockout. A reverse proxy or gateway
  should provide it before public exposure.
- **No TLS in the compose stack**; it publishes plain HTTP on 8080 for local
  smoke testing and expects TLS termination in front of it.

## 9. Known non-acceptable findings

**None.** No committed live secret, no sensitive value rendered in HTML, no
missing authentication or authorization boundary, and no critical production
misconfiguration was found in this review.
