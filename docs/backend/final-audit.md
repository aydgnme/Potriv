# Backend Final End-to-End Audit (FINAL-BACKEND-AUDIT-01)

A full-lifecycle audit of the Potriv backend: request → authentication →
authorization → validation → domain → persistence → audit → error handling →
rendering → tests → production configuration → Docker → Flyway → monitoring →
documentation.

Every statement here was produced by inspecting the repository or running the
command shown. Where something was **not** verified, it says so.

---

## 1. Executive verdict

```text
READY WITH ACCEPTED RISKS
```

The backend is functionally complete for the agreed scope, security-reviewed,
production-startable, admin-operable, CI-verified and documented. Two real
defects were found by this audit and fixed with regression coverage; the
remaining limitations are explicit, non-blocking, and listed in §15.

The verdict is not `READY TO MERGE — BACKEND COMPLETE` only because two honest
qualifiers stand: invite tokens are still stored raw (accepted, documented), and
eight pre-existing CodeQL alerts remain open and triaged rather than resolved.

---

## 2. Verified baseline

Run on the audit branch before any change:

```text
./mvnw clean verify        → Tests run: 755, Failures: 0, Errors: 0, Skipped: 0, BUILD SUCCESS
docker compose … config --quiet → exit 0
git diff --check           → clean
git status --short         → only untracked .claude/ (never staged)
```

Matches the expected historical baseline of 755 exactly — no unexplained drift.

**Inventory (counted from the repository, not from memory)**

| Item | Count |
| --- | --- |
| Controllers (12 admin) | 37 |
| Services | 50 |
| `@Entity` classes | 24 |
| Repositories | 33 |
| DTO / view-model types | 96 |
| Security filter chains | 2 |
| `@ControllerAdvice` handlers | 3 |
| `SecurityAuditEventType` values | 42 |
| Flyway migrations | 5 (`V1`–`V5`) |
| Test classes | 93 |
| Admin templates | 43 |
| Admin stylesheets | 3 |
| GitHub workflows | 3 |
| Backend/admin docs | 6 |

---

## 3. Requirement coverage matrix

Classification is backed by the named test classes, which are the evidence.

| Requirement group | Status | Evidence |
| --- | --- | --- |
| Organization-admin registration, organization creation | **PASS** | `identity/AdminRegistrationIntegrationTest`, `organization/OrganizationUniquenessConstraintIntegrationTest` |
| Employee registration via invite link, unassigned start | **PASS** | `identity/EmployeeRegistrationIntegrationTest`, `identity/InviteLifecycleIntegrationTest` |
| Normalized email, duplicate protection, revoked-invite rejection | **PASS** | `identity/EmployeeRegistrationIntegrationTest`, `admin/AdminInvitationActionsIntegrationTest` |
| Login, failed-login tracking, lockout, suspended rejection | **PASS** | `security/LoginLockoutRegressionIntegrationTest`, `security/AccountStatusRegressionIntegrationTest` |
| Refresh-token rotation and reuse detection | **PASS** | `identity/RefreshTokenRotationIntegrationTest` |
| Logout / logout-all / session revoke | **PASS** | `identity/SessionLifecycleIntegrationTest` |
| Password reset request/confirm, one-time + expiry | **PASS** | `identity/PasswordResetIntegrationTest` |
| Authentication audit events | **PASS** | `security/SecurityAuditRegressionIntegrationTest` |
| Five-role model, multi-role, JWT RBAC | **PASS** | `security/JwtRbacSecurityIntegrationTest`, `identity/RoleManagementIntegrationTest` |
| Admin session ⇄ REST JWT boundary | **PASS** | `admin/AdminApiIsolationIntegrationTest`, `admin/AdminSessionSecurityIntegrationTest` |
| Organization isolation / cross-tenant refusal | **PASS** | `organization/OrganizationIsolationRegressionIntegrationTest`, `skill/SkillOrganizationIsolationRegressionIntegrationTest`, `project/ProjectLifecycleSecurityIntegrationTest` |
| Department CRUD, manager assignment, membership | **PASS** | `organization/DepartmentCrudIntegrationTest`, `DepartmentManagerAssignmentIntegrationTest`, `DepartmentMembershipIntegrationTest` |
| Dependency-safe department delete | **PASS** | `admin/AdminDepartmentFormIntegrationTest`, `organization/DepartmentCrudIntegrationTest` |
| Skill categories, skills, deactivate/reactivate, department links | **PASS** | `skill/SkillCatalogIntegrationTest`, `SkillCategoryCatalogIntegrationTest`, `SkillDepartmentLinkIntegrationTest` |
| Employee self-assigned expertise, level/experience validation | **PASS** | `skill/EmployeeSkillProfileIntegrationTest` |
| Project creation, period/deadline rules, technologies, team roles | **PASS** | `project/ProjectLifecycleIntegrationTest`, `ProjectLifecycleValidationIntegrationTest` |
| Status transitions, history, guards | **PASS** | `project/ProjectLifecycleIntegrationTest`, `admin/AdminProjectActionsIntegrationTest` |
| Delete eligibility from full status history, contributors | **PASS** | `project/ProjectLifecycleDeletionIntegrationTest`, `admin/AdminProjectActionsIntegrationTest` |
| Team Finder availability, criteria, similarity, scoring order | **PASS** | `project/teamfinder/*` (8 classes incl. `TeamFinderScoringOrderingIntegrationTest`) |
| Assignment proposal, capacity validation, review queue, approval | **PASS** | `project/allocation/ProjectAssignmentProposalIntegrationTest`, `ProjectAssignmentReviewIntegrationTest`, `ProjectAllocationCapacityIntegrationTest` |
| Deallocation proposal and review, active→past transition | **PASS** | `project/allocation/ProjectDeallocationWorkflowIntegrationTest` |
| Project team / employee projects / department portfolio views | **PASS** | `project/regression/ProjectTeamViewIntegrationTest`, `EmployeeProjectHistoryViewIntegrationTest`, `DepartmentProjectPortfolioViewIntegrationTest` |
| Safe response shape (no secret leakage in views) | **PASS** | `project/regression/ProjectViewSafeResponseIntegrationTest` |
| Admin console pages, actions, review filters | **PASS** | `admin/*` (25 classes) |
| Production schema via Flyway + `ddl-auto=validate` | **PASS** | `common/config/ProductionSchemaMigrationIntegrationTest` |
| Production fail-fast configuration guard | **PASS** | `common/config/ProductionConfigGuardTest` |
| Notifications, statistics, endorsement, AI expert finder | **OUT OF SCOPE** | §17 of the audit brief |
| Audit export / retention / deletion | **OUT OF SCOPE** | deliberate non-goal |
| Invite token hashing | **ACCEPTED LIMITATION** | §15 |

---

## 4. Authentication and authorization

- Two independent chains, verified by reading both configs: REST
  (`SecurityConfig`, stateless, Bearer JWT, CSRF disabled **by design**) and the
  admin console (`AdminSecurityConfig`, `@Order(0)`,
  `securityMatcher("/admin/**")`, session form login, CSRF **enabled**).
- `csrf.disable` appears exactly twice and both are correct: the stateless REST
  chain, and the *disabled-console* branch where every request falls through to
  an anti-leak 404 and no write exists.
- `permitAll` appears 11 times: public auth endpoints, `/actuator/health(/**)`,
  `/actuator/info`, Swagger paths (endpoints themselves disabled in prod), the
  admin login page and admin static assets. No business endpoint is anonymous.
- Every REST write controller carries a role guard **except** three, each
  verified individually:
  - `AuthController` — public by design, explicitly `permitAll`.
  - `SessionController` — authenticated-only; every operation is scoped by
    `findByIdAndUserId(sessionId, currentUser.userId())`.
  - `EmployeeSkillController` — authenticated-only; scoped by
    `findByIdAndUser_Id(employeeSkillId, currentUser.userId())`.
  Both id-taking controllers resolve another user's row to **404**, so there is
  no IDOR. **No change was required.**

---

## 5. Domain and tenant isolation

Same-organization enforcement was traced to a concrete mechanism per module:
`requireOwnedProject` (organization **and** project-manager identity),
`currentOrganizationResolver.requireOrganizationId`, and
`findByIdAndOrganization_Id` lookups that resolve cross-tenant access to 404
rather than 403 (anti-enumeration). 11 test classes assert cross-organization
refusal explicitly. **No gap found; no change was required.**

---

## 6. Project and allocation workflows

- Project lifecycle guards (`ProjectStatusChangeGuard`) and deletion
  contributors (`ProjectDeletionContributor`) are extension points consumed by
  both the product path and the admin console, with
  `ProjectStatus.deletionBlockingStatuses()` as the single source of truth.
- Deletion eligibility is **historical** (`IN_PROGRESS`/`CLOSING`/`CLOSED` ever
  reached), not current-status based — asserted in both suites.
- Allocations exist only through an approved assignment proposal; the console
  exposes no override. **No change was required.**

---

## 7. Admin console

- Console flag, bootstrap reconciliation, login/logout, non-SYSTEM_ADMIN
  rejection and anonymous redirect all covered
  (`AdminDisabledIntegrationTest`, `AdminSessionLoginIntegrationTest`,
  `AdminSessionSecurityIntegrationTest`, `SystemAdminBootstrapIntegrationTest`).
- Supported actions match the documented list exactly; unsupported ones
  (user hard delete, credential change, `SYSTEM_ADMIN` grant, project metadata
  override, allocation force-review, audit export/deletion) are absent from the
  route table — verified by enumerating `@PostMapping` across admin controllers.
- Read-only review pages expose no mutation: a POST to an allocation detail
  answers `405`, and repeated GETs leave row counts and `updated_at` untouched.
- Accessibility/layout asserted across every list route by
  `AdminConsoleConsistencyIntegrationTest` (64 cases).
  **A browser smoke test was not performed** — see §16.

**No change was required.**

---

## 8. Security review

- **Secret exposure.** `getToken()` under `admin/` → no matches. The
  secret-shaped grep over admin code, admin templates and docs returns only
  comments and documentation *stating* that secrets are not rendered, plus one
  template match — `refreshTokenTtl`, a duration ("7 days"), not a token.
- **Token storage.** Refresh and password-reset tokens are stored as
  `tokenHash` (`TokenDigest.sha256Base64Url`) and looked up by hash. Invite
  tokens are stored **raw** — accepted, §15.
- **Input hardening.** Malformed path ids → admin 404; malformed `page`/`size`
  → normalized; hostile filters → dropped; LIKE wildcards escaped; no
  string-concatenated JPQL or native SQL with request values; firewall-rejected
  shapes (`%20`, `;`, `..`) stay `400` before routing.
- **Error contracts.** One `catch (Exception)` exists in the whole main source
  tree — the monitor's database probe, which must report `FAILED` rather than
  crash and sanitizes the JDBC URL. `printStackTrace` → 0. `TODO`/`FIXME`/`HACK`
  → 0.
- **CodeQL:** 8 open alerts (3 high, 5 note), all pre-existing and triaged in
  `security-baseline.md` §2/§7. This branch introduces none and suppresses none.
- **Repository settings** (branch protection, required checks, secret scanning,
  push protection) are GitHub configuration, not code — **not verified here** and
  not claimed.

---

## 9. Database and Flyway

- Chain `V1` → `V5`, applied in order on an **empty** PostgreSQL 16 container:
  `Successfully applied 5 migrations … now at version v5`.
- Second boot: `Successfully validated 5 migrations` → `Current version: 5` →
  `Schema "public" is up to date. No migration necessary.` — **idempotent**.
- Production runs `ddl-auto=validate`; Hibernate never mutates the schema, and
  `ProductionConfigGuard` refuses `create`/`create-drop`/`update`.
- All 42 `SecurityAuditEventType` values are permitted by the DB CHECK
  constraint; `ProductionSchemaMigrationIntegrationTest` iterates the enum and
  fails on drift.
- Dev drift detector is opt-in, dev-only, read-only (`pg_get_constraintdef`),
  and never mutates a schema; `scripts/reset-dev-db.sh` does nothing without
  `--yes`.

**No migration change was required by this audit.**

---

## 10. Production runtime

A **fresh stack was actually built and run** (`down -v` → `up --build -d`):

| Check | Result |
| --- | --- |
| PostgreSQL healthy | ✅ |
| Flyway `V1`–`V5` on empty DB | ✅ |
| Backend container healthy | ✅ *(after the fix in §14)* |
| `/api/actuator/health/readiness` | `{"status":"UP"}` |
| Second boot idempotent | ✅ |
| Swagger (`/api/v3/api-docs`, `/api/swagger-ui/index.html`) | not accessible (401) |
| Actuator `metrics` / `env` | not exposed (401) |
| Admin console with flag unset | anti-leak `404` |
| Weak/placeholder prod config | rejected by `ProductionConfigGuard` |

Stack torn down afterwards (`down -v`, 0 containers left).

---

## 11. CI and security gates

| Workflow | Trigger | Notes |
| --- | --- | --- |
| `backend-ci.yml` | PR to `main`, push to `main`, dispatch | `backend-verify` (Java 21, Maven cache, `clean verify`) + `production-compose-config` |
| `codeql.yml` | PR, push, weekly cron, dispatch | `java-kotlin`, `build-mode: manual`, `security-extended,security-and-quality` |
| `dependency-check.yml` | weekly cron + dispatch **only** | Skips with a warning when `NVD_API_KEY` is absent — never starts an unauthenticated multi-hour NVD sync; never runs on PRs |

Permissions are least-privilege (`contents: read`; CodeQL adds
`security-events: write`). No generated reports are committed; no secret values
reach logs. One real defect found and fixed — see §14.

---

## 12. Test quality

757 tests across 93 classes, classified by inspection:

| Kind | Classes |
| --- | --- |
| HTTP-level (MockMvc, real filter chain) | 77 |
| Testcontainers PostgreSQL foundations | 9 |
| Pure unit (no Spring context) | 14 |
| Admin console | 25 |
| Security-focused | 5 |
| Production-profile / migration | 2 |

Negative and boundary coverage: 35 classes assert `403`, 25 assert `401`, 37
assert `404`, 13 exercise CSRF, 11 assert cross-organization refusal.

**Nondeterminism audit:** `@Order`/`TestMethodOrder` → 0. `Thread.sleep` → 0.
H2 → the single match is a *string literal* in `ProductionConfigGuardTest`
asserting that a non-PostgreSQL JDBC URL is **rejected** in production, i.e. the
opposite of H2 usage; every integration test runs on real PostgreSQL.
`Clock` is injected in `TeamFinderService`, `DepartmentProjectsService` and
`EmployeeProjectService`, so time-dependent behaviour is deterministic;
`LoginLockoutRegressionIntegrationTest` documents that the lockout implementation
has no injectable clock and ages the persisted row instead of sleeping.

**No test change was required beyond the two regressions added for the fixes.**

---

## 13. Documentation and demo readiness

`README.md`, `docs/admin/ADMIN_UI.md`, `docs/backend/security-baseline.md`,
`production-readiness.md`, `deployment-checklist.md` and `environment.md`
describe the console's real capabilities, the production variables, the Docker
startup, Flyway behaviour, health URLs, CI gates, the demo walkthrough and the
known limitations. This audit updated them only where the health-probe fix
changed documented behaviour.

### Demo scenario status

| Scenario | Status |
| --- | --- |
| 1 — Organization onboarding | **AUTOMATED** (`AdminRegistrationIntegrationTest`, `EmployeeRegistrationIntegrationTest`, `InviteLifecycleIntegrationTest`) |
| 2 — Department and skills | **AUTOMATED** (`OrganizationStructureJourneyIntegrationTest`, `SkillDomainJourneyIntegrationTest`, `EmployeeSkillProfileIntegrationTest`) |
| 3 — Project and team allocation | **AUTOMATED** (`ProjectDomainEndToEndRegressionTest`, `ProjectAssignmentReviewIntegrationTest`, teamfinder suite) |
| 4 — Deallocation | **AUTOMATED** (`ProjectDeallocationWorkflowIntegrationTest`, `EmployeeProjectHistoryViewIntegrationTest`) |
| 5 — Admin operations | **AUTOMATED** (`AdminProjectActionsIntegrationTest`, `AdminConsoleConsistencyIntegrationTest`, `AdminAuditFiltersIntegrationTest`) |
| 6 — Production startup | **MANUALLY VERIFIED** — fresh stack built and run in this audit; results in §10 |

No scenario is claimed as manually verified except Scenario 6, which was.

---

## 14. Findings fixed in this branch

### F-1 — Container health probe gated on an external SMTP server

- **Severity:** High (operational).
- **Affected flow:** Docker startup → health probe → orchestration.
- **Evidence:** On a fresh stack with the shipped `.env.prod.example`, Flyway
  applied `V1`–`V5` and `POST /api/auth/login` answered `400` for bad
  credentials — the application was serving correctly — yet
  `/api/actuator/health` returned `{"status":"DOWN"}` and the container was
  `unhealthy`. Logs:
  `MailHealthIndicator … jakarta.mail.AuthenticationFailedException: failed to
  connect, no password specified?`
- **Root cause:** `docker-compose.prod.yml` probed the **aggregate** health
  endpoint, which includes Spring Boot's auto-configured mail contributor
  (`spring.mail.host` is set in the prod profile). Outbound mail is not required
  to serve a request, but any SMTP outage marked the instance unhealthy — an
  orchestrator would restart or de-route a healthy container. The documented
  smoke script waited on the same URL, so it could never succeed with the
  shipped template.
- **Fix:** a `readiness` health group (`db, ping`) in `application-prod.yml`; the
  compose healthcheck and `scripts/backend-prod-smoke.sh` now probe
  `/api/actuator/health/readiness`. Mail stays in the full aggregate, so its
  state remains visible without gating traffic.
- **Second defect uncovered while verifying the fix:** the REST chain permitted
  only the exact path `/actuator/health`, so the group sub-path returned `401`
  and the probe still failed. Widened to `/actuator/health/**`, which is safe
  because `show-details` is left at Spring's default `never` — every response is
  a bare status with no component data.
- **Regression coverage:** two tests in the real-`prod`-profile
  `ProductionSchemaMigrationIntegrationTest`
  (`readinessProbeStaysUpWhenOutboundMailIsUnreachable` and
  `theAggregateStillReportsOutboundMailSoItsStateRemainsVisible`), run against an
  unreachable SMTP host — the exact condition that produced the failure.
- **Verified:** fresh stack rebuilt → container `healthy`, readiness `UP`,
  aggregate still `DOWN` (visibility retained), restart idempotent.

### F-2 — Deprecated GitHub Actions

- **Severity:** Low (maintenance).
- **Evidence:** PR #64 annotations — `The following actions target Node.js 20 but
  are being forced to run on Node.js 24: actions/checkout@v4,
  actions/setup-java@v4` and `setup-java v4 is deprecated and will no longer
  receive updates. Please migrate to actions/setup-java@v5.`
- **Fix:** `actions/checkout@v4` → `@v5` (5 uses) and `actions/setup-java@v4` →
  `@v5` (3 uses) across all three workflows. `actions/cache@v4` and
  `actions/upload-artifact@v4` were **not** flagged and were left alone.
- **Regression coverage:** the workflows themselves — remote CI re-run on this PR.

---

## 15. Accepted risks and known limitations

- **Invite tokens are stored raw** (`invite_tokens.token`), unlike refresh and
  password-reset tokens which are SHA-256 hashed. An organization invite is a
  deliberately shareable join link, is never rendered in the console, never
  logged and never written to audit details, and a leaked link can be revoked or
  regenerated from the console. Hashing it needs a designed migration covering
  link lookup, existing rows and backward compatibility — **explicitly out of
  scope for this audit**, per its own §7.4.
  → `ACCEPTED SECURITY LIMITATION`.
- **8 open CodeQL alerts** (3 high, 5 note), pre-existing and triaged. Not
  suppressed, not resolved here.
- **Dependency-Check** runs weekly/dispatch only and skips itself without
  `NVD_API_KEY`; PRs are therefore not SCA-gated.
- **Repository settings** (branch protection, required checks, secret scanning,
  push protection, Dependabot) are not code and were not verified.
- **Mail health** is reported but no longer gates the probe; an SMTP outage is
  now visible in `/actuator/health` and in logs rather than in orchestration.
- Console write surface, audit `details` exclusion, and the users/projects
  organization-filter gap are documented in `docs/admin/ADMIN_UI.md`.

---

## 16. Unverified items

Stated plainly rather than assumed:

- **No browser smoke test.** No admin page was opened in a real browser. Rendering
  is asserted by integration tests against real HTML, and every CSS class used by
  the admin templates was checked mechanically against the stylesheets.
- **Repository settings** on GitHub (§15).
- **Real SMTP delivery.** Password-reset mail was never sent to a real provider;
  the flow is covered at service/HTTP level only.
- **Load, soak and concurrency-at-scale behaviour.** Pessimistic locking is
  exercised functionally, not under contention.

---

## 17. Final commands and results

```text
git diff --check                                   → clean (exit 0)
cd apps/backend && ./mvnw clean verify             → 757 tests, 0 failures, 0 errors, 0 skipped, BUILD SUCCESS
docker compose --env-file .env.prod.example \
  -f docker-compose.prod.yml config --quiet        → exit 0
docker compose … up --build -d (fresh stack)       → db healthy, backend healthy, Flyway V1–V5, restart idempotent
git status --short                                 → only untracked .claude/
```

Structural searches (main source tree): `TODO` 0 · `FIXME` 0 · `HACK` 0 ·
`printStackTrace` 0 · `catch (Exception` 1 (justified, §8) · `csrf.disable` 2
(both by design) · `permitAll` 11 (all reviewed) · `getToken()` under `admin/` 0.

Baseline 755 → **757**: exactly the two regression tests added for F-1.

---

## 18. Commit list

```text
fix(prod): stop outbound mail from failing the container health probe
ci: move to actions/checkout@v5 and actions/setup-java@v5
docs: finalize backend end-to-end audit report
```

No commit was created for a category with no finding: authentication,
authorization, domain/tenant isolation, admin console and database/migration
audits produced **no defects and required no changes**.

---

## 19. Merge recommendation

**Merge.** The audit found two real defects, both fixed with evidence and
regression coverage; everything else was verified as already correct. The
remaining limitations are explicit, documented and non-blocking for the agreed
scope.

The smallest sensible follow-ups, in order: (1) hash invite tokens with a
designed migration, (2) work the 8 CodeQL alerts, (3) a real browser
accessibility pass on the admin console.
