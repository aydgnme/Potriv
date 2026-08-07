# 00 — Repository reality

The factual baseline. Everything in the rest of this pack cites this document,
so it contains **no proposals** — only what the repository does today, read from
the code on branch `docs/frontend-discovery` (base `2b828d7`).

Labels used throughout the pack:

- **SUPPORTED BY BACKEND** — an endpoint and behaviour exist today
- **PRODUCT/UX PROPOSAL** — a design decision made in this pack
- **FUTURE IDEA / NOT IMPLEMENTED** — no backend support; must not become MVP scope

---

## 1. Current frontend stack

| Item | Value |
| --- | --- |
| Framework | Next.js `15.5.6`, App Router |
| React | `19.2.0` |
| Language | TypeScript `^5` |
| Styling | One hand-written stylesheet, `app/globals.css` (315 lines) |
| UI library | **None** |
| Tailwind | **Not installed** |
| State/data library | **None** — `fetch` in `src/lib/apiClient.ts` |
| Test tooling | **None** in the frontend package |
| Runtime dependencies | `next`, `react`, `react-dom` — that is the whole list |

## 2. Existing frontend implementation status

`apps/frontend` is **not the product UI**. It says so itself, in
`app/layout.tsx`:

- page title: `Potriv Backend Control Console`
- header note: `dev/demo console — not the product UI`
- `docs/backend/backend-control-console.md`: "This is not the product UI."

It is a developer console for exercising the API by hand: a token panel, a login
panel, a list of endpoint presets, a JSON request editor and a response viewer.

Total size: **1,623 lines** across 15 files, of which `src/lib/endpointPresets.ts`
(454 lines) is a hand-maintained list of example requests.

**There is no product frontend. Nothing in this pack has to preserve or migrate
existing product UI, because none exists.** The console is a developer tool and
should continue to exist alongside the product frontend, not be grown into it.

## 3. Existing routes/pages

| Route | Purpose |
| --- | --- |
| `/` | Health card, token panel, link to the console |
| `/console` | The API console |

Two routes. No authentication guard, no role awareness, no product routes.

## 4. Existing design system or CSS conventions

There is no design system. `globals.css` defines a small set of plain class
names (`.panel`, `.topbar`, `.row`, `.column`, `.layout`, `.hint`) used directly
by the console components. No tokens, no theme, no dark mode, no component
primitives.

**Consequence:** the design direction in this pack is unconstrained by existing
CSS. Nothing has to be undone.

## 5. Backend-supported user roles

`AccessRole` (`identity/entity/AccessRole.java`):

```
EMPLOYEE
ORGANIZATION_ADMIN
DEPARTMENT_MANAGER
PROJECT_MANAGER
SYSTEM_ADMIN
```

A user holds a **set** of roles (`UpdateUserRolesRequest` takes `Set<AccessRole>`,
minimum size 1). Multi-role is normal, not exceptional.

How the guard annotations actually resolve:

| Annotation | Expression |
| --- | --- |
| `@SystemAdminOnly` | `hasRole('SYSTEM_ADMIN')` |
| `@OrganizationAdminOnly` | `hasAnyRole('SYSTEM_ADMIN', 'ORGANIZATION_ADMIN')` |
| `@DepartmentManagerOnly` | `hasAnyRole('SYSTEM_ADMIN', 'DEPARTMENT_MANAGER')` |
| `@ProjectManagerOnly` | `hasAnyRole('SYSTEM_ADMIN', 'PROJECT_MANAGER')` |
| `@EmployeeOnly` | authenticated (any role) |

`SYSTEM_ADMIN` is a superset of every product role at the annotation level. It
also has its own server-rendered console at `/api/admin/**` on a separate
session-based security chain. **It is out of scope for the product frontend** —
see §10.

## 6. Backend-supported workflows

Confirmed present, with endpoints:

- authentication: admin registration, employee registration by invite token,
  login, refresh, `/auth/me`
- sessions: list, revoke one, logout, logout-all
- password reset: request, confirm
- organization invite: read current invite, rotate it
- users: list, detail, replace roles (organization admin)
- departments: CRUD, assign/remove manager (organization admin)
- department membership: list members, list unassigned employees, add, remove
  (department manager)
- skills: categories CRUD, skills CRUD, skill↔department links
- employee skills: list, add, edit, remove (self only)
- projects: create, list managed, read, update, delete
- team roles: CRUD
- Team Finder: candidate search for a project
- assignment proposals: create, review queue, accept, reject
- deallocation proposals: create, accept, reject
- project views: details, team, department portfolio, employee's own projects

## 7. Backend-supported entities

Organization · User (AccessAccount + roles) · Department · DepartmentManagerAssignment ·
DepartmentMembership · SkillCategory · Skill · SkillDepartmentLink · EmployeeSkill ·
Project · ProjectTechnology · TeamRole · ProjectTeamRoleRequirement ·
AssignmentProposal · ProjectAllocation · DeallocationProposal · Session ·
SecurityAuditEvent · EmployeeInvite

Domain enums that the UI must render:

| Enum | Values |
| --- | --- |
| `ProjectStatus` | `NOT_STARTED`, `STARTING`, `IN_PROGRESS`, `CLOSING`, `CLOSED` |
| `ProjectPeriod` | `FIXED`, `ONGOING` |
| `AssignmentProposalStatus` / `DeallocationProposalStatus` | `PENDING`, `APPROVED`, `REJECTED` |
| `AccessAccountStatus` | `ACTIVE`, `SUSPENDED`, `DISABLED` |
| `SkillLevel` | `LEARNS`(1) `KNOWS`(2) `DOES`(3) `HELPS`(4) `TEACHES`(5) — each carries a display label |
| `SkillExperience` | `ZERO_TO_SIX_MONTHS` … `MORE_THAN_SEVEN_YEARS` — each carries a display label |

`SkillLevel` and `SkillExperience` **already supply human labels** from the
backend (`"Learns"`, `"0-6 months"`). The frontend must not invent its own
wording for these.

## 8. Relevant authorization boundaries

Read from the class- and method-level annotations on every product controller.

| Capability | Guard | Effective roles |
| --- | --- | --- |
| `POST/GET/PATCH/DELETE /departments…` | `@OrganizationAdminOnly` | ORG_ADMIN, SYS_ADMIN |
| `PUT/DELETE /departments/{id}/manager` | `@OrganizationAdminOnly` | ORG_ADMIN, SYS_ADMIN |
| `GET/POST/DELETE /departments/{id}/members`, `/departments/unassigned-employees` | `@DepartmentManagerOnly` | DEPT_MGR, SYS_ADMIN |
| `GET /users`, `GET /users/{id}`, `PATCH /users/{id}/roles` | `@OrganizationAdminOnly` | ORG_ADMIN, SYS_ADMIN |
| `GET/POST /organizations/current/invite…` | `@OrganizationAdminOnly` | ORG_ADMIN, SYS_ADMIN |
| `/team-roles` CRUD | `@OrganizationAdminOnly` | ORG_ADMIN, SYS_ADMIN |
| `/skills`, `/skill-categories` **reads** | none (authenticated) | everyone |
| `/skills`, `/skill-categories` **writes**, skill↔department links | `@DepartmentManagerOnly` | DEPT_MGR, SYS_ADMIN |
| `/me/skills` all verbs | none (authenticated, self-scoped) | everyone |
| `/projects` CRUD, `/projects/managed` | `@ProjectManagerOnly` | PROJ_MGR, SYS_ADMIN |
| `/projects/{id}/team-finder` | `@ProjectManagerOnly` | PROJ_MGR, SYS_ADMIN |
| `/projects/{id}/assignment-proposals`, deallocation proposals | `@ProjectManagerOnly` | PROJ_MGR, SYS_ADMIN |
| `/department/project-proposals…` review + accept/reject | `@DepartmentManagerOnly` | DEPT_MGR, SYS_ADMIN |
| `/department/projects` | `@DepartmentManagerOnly` | DEPT_MGR, SYS_ADMIN |
| `/projects/{id}/details`, `/projects/{id}/team`, `/me/projects` | `@EmployeeOnly` | any authenticated |
| `/auth/sessions…`, `/auth/logout…`, `/auth/me` | authenticated | everyone |
| `/admin/**` REST (`/admin/security/**`, `PATCH /admin/users/{id}/status`) | `@SystemAdminOnly` | SYS_ADMIN |

Beyond the annotations, services enforce **ownership** — for example
`DepartmentMembershipService.requireManagedDepartment(currentUser)` rejects a
department manager operating on a department they do not manage. Holding a role
is not the same as having authority over a particular record, and the UI must
not imply otherwise.

## 9. Existing API constraints that affect UX

These are the constraints that most shape the design. Each one is a fact, not an
opinion.

### C-1 — No pagination on any product endpoint

Every product list returns a bare `List<…>`. The only `Page<…>` in the codebase is
`GET /admin/security/audit-events`, which belongs to the system-admin console.

**Consequence:** filtering, sorting and paging on product screens are
**client-side**. The design must stay honest about this: no fake page controls
that silently re-slice an array the client already holds, and no promise of
scale the API cannot deliver. Where a list can grow without bound (users,
skills, projects), the design notes the risk rather than hiding it.

### C-2 — Almost no server-side search

The complete set of query parameters on product endpoints:

| Endpoint | Parameters |
| --- | --- |
| `GET /skills` | `q`, `categoryId`, `includeInactive` |
| `GET /skill-categories` | `includeInactive` |
| `GET /team-roles` | `includeInactive` |
| `GET /projects/managed` | `status` |
| `GET /department/projects` | `status` |
| `GET /department/project-proposals` | `status` (`PENDING`/`APPROVED`/`REJECTED`) |
| `DELETE /projects/{id}` | `confirmed` (must be `true`) |

`GET /skills?q=` is the **only** text search in the entire API. Global search is
therefore **FUTURE IDEA / NOT IMPLEMENTED** and must be marked as such wherever
it is tempting.

### C-3 — No organization-wide project list

`ProjectController` is `@ProjectManagerOnly`, and its list operation is
`GET /projects/managed` — *projects I manage*. There is **no** endpoint that
returns every project in the organization for an ORGANIZATION_ADMIN.

**Consequence:** an "organization project overview" dashboard card cannot be
built. The org admin sees projects only through the system-admin console, which
they do not have. This is recorded as an open question, not designed around.

### C-4 — A department manager manages exactly one department

`DepartmentManagerAssignmentService` rejects assigning a manager who already
manages a different department ("User already manages another department."), and
the schema has a unique constraint on `department_id`.

**Consequence:** "my department" is unambiguous in the UI. But `GET /departments`
is organization-admin-only, so a department manager **cannot list departments to
find their own id**. The id arrives through `GET /department/projects`, whose
response carries `department.departmentId`. That is a non-obvious data
dependency and the design must account for it.

### C-5 — Three different reasons, and they are not interchangeable — RESOLVED

| Field | Written by | Means | Required? |
| --- | --- | --- | --- |
| `CreateDeallocationProposalRequest.reason` | project manager | why removal is being asked for | **yes**, `@NotBlank`, max 5000 |
| `CreateAssignmentProposalRequest.comments` | project manager | context for the request | no, max 5000 |
| `RejectProposalRequest.reason` → `rejectionReason` | department manager | **why the reviewer declined** | no, max 5000 |

The third was added by **B2** (PR #74). Both reject endpoints now accept an
**optional** body:

```
POST /department/project-proposals/assignments/{proposalId}/reject
POST /department/project-proposals/deallocations/{proposalId}/reject
{ "reason": "Requested hours exceed current team capacity." }
```

**Consequence for the UI:** the reject flow has a reason input, labelled as
optional — it must not fake mandatory validation. A blank entry is normalised to
none server-side, so the client need not special-case whitespace. Because the
field is optional and every pre-migration rejection has none, **the UI must
render "No reason given"** for a rejected proposal without one.

`rejectionReason` is readable on all three surfaces a rejected proposal reaches:
`DepartmentProjectProposalResponse`, `AssignmentProposalResponse` and
`DeallocationProposalResponse`. It is null while pending and null when approved,
and the transition is immutable — there is no endpoint to edit it afterwards.

### C-6 — Team Finder ranking is deterministic, and the exact arithmetic is this

The service's own comment states the intent: *"exact-normalized skill matches
against the project's technologies, and past project similarity. No AI, no fuzzy
matching."* The three components are computed as:

```java
skillScore        = round(60.0 * matchedTechnologyCount / technologyCount)
pastProjectScore  = pastMatches.isEmpty() ? 0 : 20        // binary
availabilityScore = round(20.0 * availableHours / 8)      // floored at 10 if closeToFinish
                    clamped to 0..20
```

Three consequences the UI must respect, each non-obvious:

1. **`pastProjectScore` is binary.** It is exactly `0` or `20` — never `18`,
   never graduated by how many past projects matched. A UI that renders it on a
   continuous bar invents precision that does not exist.
2. **Skill level and experience do not affect the score at all.** `skillScore` is
   purely *what proportion of the project's technologies this person claims*. A
   `LEARNS` / `ZERO_TO_SIX_MONTHS` match contributes exactly as much as
   `TEACHES` / `MORE_THAN_SEVEN_YEARS`. Level and experience are returned as
   **evidence for the human**, not as inputs to the ranking — and the UI must not
   imply otherwise.
3. **Team-role requirements are not part of the skill score.** They feed
   past-project similarity only. So the empty state for "this project has nothing
   to match on" must name **technologies**, not team roles: the service returns
   early when `targetTechnologies.isEmpty()`.

Tie-breaking is fully specified and stable: total, then skill, then past project,
then availability, then `availableHours`, then name, then id.

The response returns the **evidence** for each component:

- `skillMatches[]` — matched technology, skill, category, level, experience
- `pastProjectMatches[]` — project, `matchedTechnologies[]`, `matchedTeamRoles[]`
- `availability` — `allocatedHours`, `availableHours`, `activeAllocationCount`,
  flags `fullyAvailable` / `partiallyAvailable` / `unavailable` / `closeToFinish`,
  and `closeToFinishProjects[]` with deadlines

**Consequence:** the UI can explain *why* a candidate ranks where they do using
only returned data. No AI explanation endpoint is needed, and none must be
invented.

### C-19 — The reviewer now sees capacity — RESOLVED

**B1 (PR #73).** Each **pending assignment** row of
`GET /department/project-proposals` carries a `capacity` object:

```json
{ "maxHoursPerDay": 8, "allocatedHoursPerDay": 6, "availableHoursPerDay": 2,
  "requestedHoursPerDay": 6, "projectedAllocatedHoursPerDay": 12,
  "projectedAvailableHoursPerDay": 0, "currentlyAcceptableByCapacity": false }
```

`maxHoursPerDay` is published so the client never hard-codes eight.

It is **current state at response time, not a reservation**: nothing is held
back, and acceptance revalidates transactionally. `currentlyAcceptableByCapacity`
exists so a reviewer can see the pending-but-unacceptable state (§C-7) *before*
pressing Accept rather than by receiving a `409`.

`capacity` is `null` on **deallocation rows** (accepting a removal frees capacity
and can never fail on it) and on **decided rows** (nothing left to check). Null
means "not applicable", never "unknown" — so the UI must not render a placeholder
figure there.

Computed with the same rule acceptance uses, in one batched query per page.

### C-7 — Capacity is 8 hours per day, and it is enforced at three separate moments

`EmployeeCapacityService.MAX_HOURS_PER_DAY = 8`. `availableHours = 8 − allocatedHours`.
Allocation is expressed as `workHoursPerDay` per assignment, so capacity
visualisation has a real, fixed denominator.

The enforcement points matter more than the number:

| Moment | Service | Failure |
| --- | --- | --- |
| Creating an assignment proposal | `AssignmentProposalService` | `409` — over 8h, no capacity at all, or more hours than remain |
| **Accepting** the proposal | `AssignmentProposalReviewService` | `409` — capacity is **recalculated**, because other proposals may have been accepted while this one waited |
| Activating a project | `AllocationProjectStatusChangeGuard` | `409` — moving into a capacity-consuming status would push an already allocated employee over 8h |

The second is the consequential one. The backend comment states the intent
plainly: when the recalculation fails, **the proposal remains `PENDING`** so the
manager can still reject it. That produces a state the UI must model explicitly —
*a pending proposal that cannot currently be accepted* — rather than treating the
`409` as a transient error.

**Consequence:** an accept button can legitimately fail through no fault of the
person pressing it. The review screen is designed around that from the start.

### C-8 — Project deletion is guarded by status *history* and requires explicit confirmation

`DELETE /projects/{id}` requires `?confirmed=true` — without it the request is
`400`, so the UI's confirmation step maps to a real API contract rather than
being decoration.

The status guard is stricter than it first appears. `ProjectService.delete`
checks the project's **status history**, not its current status:

```java
if (statusHistoryRepository.existsByProject_IdAndToStatusIn(
        project.getId(), ProjectStatus.deletionBlockingStatuses())) {
    throw new ConflictException(
        "This project has progressed beyond planning and can no longer be deleted.");
}
```

A project that ever reached `IN_PROGRESS`, `CLOSING` or `CLOSED` can never be
deleted, **even after being moved back to `NOT_STARTED`**.

**Consequence:** deletability cannot be derived from `ProjectResponse.status`,
which is the only status the API returns. The UI cannot reliably pre-disable the
action; it must offer delete based on current status and handle the `409` as a
first-class, explainable outcome rather than an unexpected error.

### C-13 — Validation errors are not field-addressable

`ApiErrorResponse` is `{timestamp, status, error, message, path}` — one message
string. `MethodArgumentNotValidException` is collapsed by joining field errors:

```java
.map(error -> error.getField() + ": " + error.getDefaultMessage())
.collect(Collectors.joining(", "))
```

So a two-field failure arrives as `"name: must not be blank, startDate: must not be null"`.

**Consequence:** the frontend cannot dependably attach server validation errors
to individual inputs — the format is a display string, and messages may
themselves contain commas. Field-level validation must therefore be **mirrored
client-side** from the documented constraints, with the server message shown at
form level as the authority. Splitting the string to guess field names is
explicitly rejected as fragile.

Status mapping is otherwise clean and consistent across the API:

| Exception | Status |
| --- | --- |
| `BadRequestException`, bean validation, malformed body, bad parameter type | `400` |
| `UnauthorizedException` | `401` |
| `ForbiddenException` | `403` |
| `NotFoundException` | `404` |
| `ConflictException` | `409` |

### C-9 — Registration returns an identity, not a session

`POST /auth/register-employee/{inviteToken}` returns a `RegisterEmployeeResponse`
(an id), **not** a token pair. A newly registered user must log in. Any
"registration → straight into the app" flow would be inventing behaviour.

### C-10 — Sessions are first-class

`GET /auth/sessions` returns `sessionId`, `createdAt`, `lastSeenAt`, `revokedAt`,
`userAgent`, `ipAddress`, `currentSession`. Individual revoke and `logout-all`
both exist. A real account-security screen is buildable today.

### C-11 — `/auth/me` is thin

`CurrentUserResponse` = `userId`, `organizationId`, `email`, `roles[]`. It does
**not** return the user's display name, nor their department, nor their managed
department. Name comes from `GET /users/{id}` (organization-admin only) or from
domain views like `GET /me/projects` (`userName`, `userEmail`).

**Consequence:** the app shell cannot greet an employee by name from `/auth/me`
alone. `GET /me/projects` is the cheapest authenticated source of the current
user's own name. This is recorded as an open question.

### C-14 — The invite link never expires

`InviteTokenService` creates every invite as
`new InviteToken(organization, generateToken(), null)` — the third argument is
`expiresAt`, and it is **always `null`**. `EmployeeInviteResponse.expiresAt` is
therefore always null in practice.

`rotateInvite` is `@Transactional`, takes a pessimistic lock on the organization,
and deactivates **every** active invite before issuing the new one, so at most
one invite is active once the transaction commits.

**Consequence:** an invite link is valid indefinitely until someone rotates it.
The invite screen must not render an expiry date or an "expires soon" warning —
there is nothing to render. Rotation is the only revocation mechanism, which
makes it the more important control, not the lesser one.

### C-15 — Token lifetimes, and refresh tokens rotate

`application.yml`: `access-token-minutes: 15`, `refresh-token-days: 7`. A refresh
issues a new refresh token and marks the previous one used, so **reuse is
detectable** — `REFRESH_TOKEN_REUSE_DETECTED` is a real audit event type.

**Consequence:** the API client needs a silent-refresh interceptor with a
single-flight guard. Two concurrent 401s must not both refresh, because the
second would present an already-used token and trip reuse detection.

### C-16 — `technologyStack` is free text

`CreateProjectRequest.technologyStack` is `List<String>` (each entry `@NotBlank`,
max 160), and `ProjectResponse.technologyStack` is `List<String>`. There is **no
technology catalogue and no foreign key** — the skill catalogue is a separate
concept.

**Consequence:** project creation uses a tag/chip input, not a picker. And since
Team Finder matches these strings **exact-normalized** against employees' skill
names (C-6), a typo silently produces zero matches. The input should suggest
existing skill names from `GET /skills` as a convenience, while still accepting
free text — the backend does.

### C-17 — An organization admin cannot change their own roles

`UserRoleManagementService.updateUserRoles`:

```java
if (targetUser.getId().equals(currentUser.userId())) {
    throw new BadRequestException("You cannot update your own roles.");
}
```

A **`400`**, not a `403`. Two further rules live in the same service:

- `"Cannot remove the last organization admin."` — `400`
- `SYSTEM_ADMIN` may only be assigned by a system admin, and only to platform
  users — irrelevant to the product frontend but present

**RESOLVED by B3 (PR #72).** The general rule is unchanged — a user cannot
rewrite their own authorization — but a founder whose organization still contains
nobody else may **extend** their own roles. Every condition must hold:

| Condition |
| --- |
| the caller is the target |
| the target already holds `ORGANIZATION_ADMIN` |
| the organization contains **exactly one user** |
| the change removes nothing — strictly additive |
| the only roles added are `DEPARTMENT_MANAGER` and/or `PROJECT_MANAGER` |
| `SYSTEM_ADMIN` is not requested |
| `EMPLOYEE` survives (always re-added) |
| the last `ORGANIZATION_ADMIN` is not removed |

Anything else still returns `400 You cannot update your own roles.`, and the
exception closes the instant a second person joins.

**Consequence for the UI:** a one-person organization can complete setup on its
own. The setup path no longer has to say "someone else finishes this" — see
[03-user-journeys.md](03-user-journeys.md) B1. Multi-person organizations follow
ordinary role management with no change whatsoever.

### C-18 — `GET /users` exposes no account status

`UserSummaryResponse` is `userId`, `organizationId`, `name`, `email`, `roles[]`.
There is no `status` field, and the endpoint takes no filter — so suspended and
disabled accounts are returned indistinguishably from active ones.

`AccessAccountStatus` exists and `PATCH /admin/users/{userId}/status` can change
it, but that endpoint is `@SystemAdminOnly`.

**Consequence:** the product frontend **cannot tell a disabled account from an
active one**. An organization admin may grant roles to a suspended user, and a
project manager may propose someone who cannot sign in. Recorded as
`FUTURE / BACKEND GAP` rather than designed around, because there is no data to
design with.

### C-12 — Context path

`server.servlet.context-path=/api`. All REST paths in this pack are written
without the prefix; the real URL is `/api` + path.

## 10. Areas that are deliberately out of scope

| Area | Why |
| --- | --- |
| `SYSTEM_ADMIN` console (`/api/admin/**`) | Server-rendered Thymeleaf on a separate session-based security chain with CSRF, documented in `docs/admin/ADMIN_UI.md`. It exists and works. Rebuilding it in the product frontend would duplicate a finished surface and put a break-glass operations tool in front of ordinary users. |
| `GET /admin/security/audit-events` | System-admin REST, same reason. |
| `PATCH /admin/users/{userId}/status` | System-admin REST. Account suspension is an operations action, not a product one. |
| Notifications | `README.md` lists a "Notification" module, but **there are no notification REST endpoints**. In-app notification is FUTURE / BACKEND NOT AVAILABLE. |
| Multi-organization switching | Every user has exactly one `organizationId`. No endpoint changes it. Do not design an org switcher. |
| Analytics / reporting | No aggregate endpoints exist beyond the per-view counts already listed. |

## 11. Verified baseline carried into this task

Stated in the task brief and consistent with the repository:

- 68/68 REST operations verified by the black-box suite in `tools/api-e2e`
- 237/237 E2E scenarios passing
- 785 backend tests, 0 failures
- 0 npm vulnerabilities in the E2E tooling

These are inputs to the discovery, not claims re-verified here. No backend test
or E2E run was performed as part of this documentation task.
