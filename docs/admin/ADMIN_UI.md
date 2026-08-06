# Potriv Admin UI (ADMIN-UI-01)

## Overview

A server-rendered internal administration/backoffice layer embedded in the
Spring Boot backend, inspired by Django Admin. It is **not** the product
frontend and **not** the Next.js backend-control console (PR #46). It exists so
operators can inspect Potriv domain data (users, organizations, departments,
projects, allocations, invitations, audit logs) and system health from the
backend runtime itself.

The console started read-only (PR #49) and gained SYSTEM_ADMIN session login
(PR #50) and a unified design language (PR #51). It is now **mostly read-only**:
the only write surfaces are the safe organization/department forms added in
ADMIN-UI-03 (see below). Everything else remains inspection-only.

## Architecture

- Spring MVC `@Controller`s + Thymeleaf templates (no SPA, no JS framework, no
  CDN). Package: `me.aydgn.potriv.admin` (`controller`, `service`, `viewmodel`,
  `repository`, `support`).
- Controllers are thin: resolve paging/filters, call a service, return a view.
- Services build admin-specific **view models** (records) from repositories and
  sanitize sensitive data by design. JPA entities are never bound to templates.
- Admin-specific `Repository` interfaces run **database-level** paged search
  (`Page<T> search(...)`) — never `findAll()` then filter/paginate in Java.
  Satellite counts (per-org users/departments/projects, per-project tech/active
  allocations, per-department members) use grouped batch queries to avoid N+1.

## Routing and the `/api` context path

`server.servlet.context-path=/api`, so Spring MVC mappings such as `/admin/**`
are reached externally at `/api/admin/**`:

| Mapping | Browser URL |
| --- | --- |
| `GET /admin` | `/api/admin` |
| `GET /admin/users` , `/admin/users/{id}` | `/api/admin/users…` |
| `GET/POST /admin/users/{id}/edit` | `/api/admin/users/{id}/edit` |
| `POST /admin/users/{id}/activate` , `/suspend` , `/unlock` | `/api/admin/users/{id}/…` |
| `GET /admin/users/{id}/roles` | `/api/admin/users/{id}/roles` |
| `POST /admin/users/{id}/roles/grant` , `/roles/revoke` | `/api/admin/users/{id}/roles/…` |
| `GET /admin/organizations` , `/{id}` | `/api/admin/organizations…` |
| `GET /admin/departments` , `/{id}` | `/api/admin/departments…` |
| `GET /admin/projects` , `/{id}` | `/api/admin/projects…` |
| `GET /admin/allocations` , `/{id}` | `/api/admin/allocations…` |
| `GET /admin/invitations` , `/{id}` | `/api/admin/invitations…` |
| `POST /admin/invitations/{id}/revoke` , `/regenerate` | `/api/admin/invitations/{id}/…` |
| `GET /admin/audit-logs` , `/{id}` | `/api/admin/audit-logs…` |
| `GET /admin/monitor` | `/api/admin/monitor` |
| `GET /admin/login` , `POST /admin/login` | `/api/admin/login` |
| `POST /admin/logout` | `/api/admin/logout` |
| `GET/POST /admin/organizations/{id}/edit` | `/api/admin/organizations/{id}/edit` |
| `GET /admin/departments/new` , `POST /admin/departments` | `/api/admin/departments…` |
| `GET/POST /admin/departments/{id}/edit` | `/api/admin/departments/{id}/edit` |
| `GET/POST /admin/departments/{id}/delete` | `/api/admin/departments/{id}/delete` |
| `GET /admin/skill-categories` , `/{id}` , `/new` | `/api/admin/skill-categories…` |
| `POST /admin/skill-categories` , `GET/POST /{id}/edit` | `/api/admin/skill-categories…` |
| `GET /admin/skills` , `/{id}` , `/new` | `/api/admin/skills…` |
| `POST /admin/skills` , `GET/POST /{id}/edit` | `/api/admin/skills…` |
| `POST /admin/skills/{id}/deactivate` , `/reactivate` | `/api/admin/skills/{id}/…` |
| `GET/POST /admin/skills/{id}/department-links` | `/api/admin/skills/{id}/department-links` |
| `POST /admin/skills/{id}/department-links/{deptId}/remove` | `/api/admin/skills/{id}/…` |

## Security model

The console is protected by a **server-side session form login** on a
self-contained `/admin/**` security chain (`AdminSecurityConfig`, `@Order(0)`,
`securityMatcher("/admin/**")`), fully independent from the JWT/Bearer REST
chain. This replaced the earlier HTTP Basic ops gate (ADMIN-AUTH-02).

- **Identity is the platform `User`.** Sign in at `GET /api/admin/login`; the
  form POSTs to `/api/admin/login`. `AdminAuthenticationService` verifies the
  email/password against the stored BCrypt hash with the *same* account-status,
  lockout (`app.auth.*`), and `SecurityAuditService` semantics as the product
  JWT login. No new admin-user table.
- **Only `SYSTEM_ADMIN` may sign in.** After the password check, the service
  requires `AccessRole.SYSTEM_ADMIN`; a non-admin (or inactive/locked) account
  is rejected at authentication time with a generic `Invalid email or
  password.` — the console never discloses whether the email exists, the
  password matched, or the role was missing.
- **Session ⇄ API isolation.** The `JSESSIONID` (HttpOnly) session authorizes
  only `/admin/**` and grants nothing on `/api/**` REST; a Bearer JWT grants
  nothing on the console. The REST chain stays stateless and unchanged.
- **CSRF enabled** on the admin chain. The login form, logout
  (`POST /api/admin/logout`), and any future POST carry a `_csrf` token; the
  REST chain remains CSRF-exempt because it is stateless/Bearer.
- **Login and static assets are anonymous.** `/admin/login` and
  `/admin/css|js/**` permit all; every other `/admin/**` route requires
  `ROLE_SYSTEM_ADMIN` (an `AdminAccessDeniedHandler` renders a styled 403).
- **Disabled by default.** When the console is disabled, `AdminAccessGuard`
  makes every admin route (login included) answer an anti-leak `404`, and the
  admin chain permits-all so controllers produce that 404.

## Safe admin write forms (ADMIN-UI-03)

The first write surface. Organization and department administration, added with
a deliberately conservative, domain-respecting design.

**Routes** (all under `/api/admin`):

- `GET/POST /admin/organizations/{id}/edit` — rename an organization (name only).
- `GET /admin/departments/new` + `POST /admin/departments` — create a department.
- `GET/POST /admin/departments/{id}/edit` — rename a department (name only).
- `GET /admin/departments/{id}/delete` — deletion confirmation (never mutates).
- `POST /admin/departments/{id}/delete` — dependency-safe delete.

**Rules:**

- **Service layer only.** Controllers are thin: `@Valid` form bean →
  `AdminOrganizationWriteService` / `AdminDepartmentWriteService` (`@Transactional`)
  → repositories. No raw repository CRUD from controllers, no direct JPA-entity
  form binding (dedicated form beans avoid mass assignment).
- **Same invariants as the domain.** Department names are trimmed, lower-cased to
  a normalized name, and unique per organization — mirroring `DepartmentService`.
  The console is a cross-organization (platform) surface, so it uses its own
  admin write services rather than the org-scoped domain service, but enforces
  the identical field rules.
- **CSRF required.** Every write is a `POST` with the session CSRF token;
  redirect-after-POST with success/error flash messages; validation errors
  re-render the form with field errors. Unknown ids render the admin `404`.
- **Deletes are dependency-safe — never cascade.** A department is deleted only
  when nothing references it. Deletion is blocked (with a clear flash error and
  a confirmation page that lists the categories) when it still has members,
  a manager assignment, linked skills, or assignment/deallocation proposal
  snapshots. Cross-module dependents follow the same `DepartmentDeletionGuard`
  philosophy; the admin service checks memberships, manager assignments, skill
  links, and the two proposal tables directly via read-only queries.
- **Audited.** Each write records a `SecurityAuditEvent` with the actor's user
  id: `ADMIN_ORGANIZATION_UPDATED`, `ADMIN_DEPARTMENT_CREATED`,
  `ADMIN_DEPARTMENT_UPDATED`, `ADMIN_DEPARTMENT_DELETED`, and
  `ADMIN_DEPARTMENT_DELETE_BLOCKED`. Details never include secrets or raw
  object snapshots.

**Adding another safe form later:** add a form bean under
`admin/viewmodel`, a `@Transactional` `Admin<Entity>WriteService` that enforces
invariants through repositories, thin controller GET/POST handlers with
`@Valid`/`BindingResult`/`RedirectAttributes`, a `form.html` (and `delete.html`
for guarded deletes), and audit events. Reuse the `.admin-form-*` styles and the
`layout/messages` flash fragment.

**Out of scope (for ADMIN-UI-03):** organization delete, organization
address/other fields, skills CRUD (ADMIN-UI-04), project CRUD,
allocation/deallocation actions, user role management, and
bulk actions.

## Safe skill-catalog forms (ADMIN-UI-04)

Skill-category and skill administration for the organization-scoped catalog, on
the same service-layer + form-bean + CSRF pattern.

**Routes** (all under `/api/admin`): `skill-categories` list/detail/new/create/
edit; `skills` list/detail/new/create/edit, `deactivate`/`reactivate`, and
`department-links` (manage page + add + `/{deptId}/remove`).

**Skill categories** — create and edit (name) only. Unique per
(organization, normalized name). No delete and no deactivate in this PR
(future skills reference the row).

**Skills** — create/edit through `AdminSkillWriteService`, preserving every
domain invariant of the org-scoped `SkillService`:

- **Scoping enforced server-side.** The chosen category, author, and departments
  must all belong to the chosen organization; the category must be active. The
  create form presents cross-organization options grouped by `<optgroup>` and
  the service validates consistency (no client-side cascade needed).
- **Author is a Department Manager, immutable.** Create requires an author that
  belongs to the organization and holds `DEPARTMENT_MANAGER` (a clear validation
  error otherwise — never a silent SYSTEM_ADMIN fallback). Edit cannot change the
  author or the organization.
- **Uniqueness** per (organization, category, normalized name); the same name is
  allowed in a different category.
- **No hard delete.** Skills are soft-toggled through the domain
  `activate()`/`deactivate()` methods; deactivation keeps the category, links,
  and employee-skill assignments intact. Toggles are idempotent.
- **Department links** are catalog usage links only — they never assign the
  skill to employees. `linkedBy` is the acting SYSTEM_ADMIN. Links are managed
  from the skill edit form (multi-select) and a dedicated manage page; adding a
  cross-organization department is rejected, duplicates are ignored, and removing
  a link deletes neither the skill nor the department.

Audited via `ADMIN_SKILL_CATEGORY_CREATED/UPDATED`, `ADMIN_SKILL_CREATED/
UPDATED/DEACTIVATED/REACTIVATED`, and `ADMIN_SKILL_DEPARTMENT_LINK_ADDED/
REMOVED`.

**Out of scope (ADMIN-UI-04):** category delete/deactivate, employee skill
assignment/level editing, endorsement/validation, project skill requirements,
Team Finder changes, user role management, and bulk actions.

## Safe user account forms (ADMIN-UI-05)

A narrow, production-safe **account-operations** slice — not full user CRUD — on
the same service-layer + form-bean + CSRF pattern (`AdminUserWriteService`).

**Routes** (all under `/api/admin`): `GET/POST /admin/users/{id}/edit` (display
name only); `POST /admin/users/{id}/activate`, `/suspend`, `/unlock`.

- **Name edit only.** Only the display name is bindable. Email, password,
  organization, roles, and status are never editable through these forms.
- **Status actions.** `activate` → `ACTIVE`, `suspend` → `SUSPENDED`, via the
  domain `changeStatus(...)`. Idempotent (re-activating an active user is a
  no-op with an informational flash).
- **Two safety rules, enforced server-side and audited:** an admin cannot
  suspend their **own** account, and the **last active `SYSTEM_ADMIN`** cannot be
  suspended (counted with `UserRoleRepository.countByRoleAndUser_StatusAndUser_IdNot`).
  A blocked action mutates nothing, flashes an error, and records
  `ADMIN_USER_ACTION_BLOCKED`.
- **Unlock.** `unlock` clears the lockout and resets the failed-login counter via
  the domain `resetLoginFailures()` (the two are coupled in the model). It never
  changes the password and never creates or revokes sessions.
- The user detail view exposes safe account metadata (status, failed-login count,
  lock state) so an admin can run these actions; it never renders the password
  hash, tokens, or normalized secrets.

Audited via `ADMIN_USER_PROFILE_UPDATED`, `ADMIN_USER_STATUS_CHANGED`,
`ADMIN_USER_UNLOCKED`, and `ADMIN_USER_ACTION_BLOCKED` (actor = signed-in admin,
target user id included; no secrets in details).

**Out of scope (ADMIN-UI-05):** password reset / admin-set password, email
change, organization reassignment, role management, `SYSTEM_ADMIN` grant/revoke,
user hard delete, bulk actions, and impersonation.

## Safe user role management (ADMIN-UI-06)

A high-risk authorization surface, kept narrow. A dedicated role page
(`GET /admin/users/{id}/roles`) grants/revokes roles via
`AdminUserRoleWriteService`.

- **Manageable roles only:** `EMPLOYEE`, `ORGANIZATION_ADMIN`, `DEPARTMENT_MANAGER`,
  `PROJECT_MANAGER`. `SYSTEM_ADMIN` is never grantable or revocable here — a
  tampered form value is rejected server-side (parsed against the manageable set)
  and audited as blocked.
- **Grant rules:** the target must exist and be `ACTIVE`, and must belong to an
  organization. A duplicate grant is idempotent (no duplicate `UserRole` row,
  info flash). Granting a role only adds the authorization row — it never creates
  a department-manager assignment, project ownership, employee profile,
  department membership, or skills.
- **Revoke rules:** the target must exist and be `ACTIVE`; the signed-in admin
  cannot change their own roles; a missing-role revoke is idempotent.
- **Dependency-based revoke guards** (`AdminUserRoleGuards`, shared by the page
  and the write path so the UI shows why a revoke is disabled):
  - `DEPARTMENT_MANAGER` — blocked while the user manages a department.
  - `PROJECT_MANAGER` — blocked while the user owns any project not in `CLOSED`.
  - `EMPLOYEE` — blocked while the user has any employee-domain dependency
    (department membership, employee skills, allocations, or assignment/
    deallocation proposals).
  - `ORGANIZATION_ADMIN` — no dependency guard (still active-only, non-self,
    non-SYSTEM_ADMIN).
- Suspended users cannot have roles mutated. Every grant/revoke is a CSRF-guarded
  `POST` with redirect-after-POST and a flash message; unknown users render the
  admin 404. No sensitive values are rendered.

Audited via `ADMIN_USER_ROLE_GRANTED`, `ADMIN_USER_ROLE_REVOKED`, and
`ADMIN_USER_ROLE_ACTION_BLOCKED` (actor + target user id + role in details, no
secrets).

**Out of scope (ADMIN-UI-06):** `SYSTEM_ADMIN` grant/revoke, department-manager
assignment UI, project ownership UI, employee skill assignment UI, bulk role
editing, and impersonation.

## Safe invitation actions (ADMIN-UI-07)

**Read the model first: a Potriv invitation is an organization-wide join link,
not a per-recipient invite.** `InviteToken` holds an organization, a token, an
optional `expiresAt` and an `active` flag — there is no recipient address and no
"used"/"accepted" state, and any number of employees can register with the same
link while `isUsable()` (`active && !expired`) holds. Status shown in the console
is derived: `ACTIVE`, `EXPIRED`, `DISABLED`.

Two actions, both `POST` + CSRF + redirect-after-POST, on the invitation detail
page:

| Action | Effect |
| --- | --- |
| **Revoke** | `deactivate()`s this link. It can no longer be used to register (`AuthRegistrationService` rejects a non-usable token). Idempotent — revoking an already disabled invitation reports that and changes nothing. |
| **Regenerate** | Disables **every** active link for the organization and issues one fresh invitation, under the same pessimistic organization lock the org-admin rotation uses, so the "at most one active invite per organization" invariant holds. |

**Token secrecy.** The raw token is never rendered (only the fixed `•••• (hidden)`
mark), never logged, and never written into audit details — including the
regenerated one. Regenerate deliberately does **not** return the new link: the
console's job is to invalidate a leaked one, and the organization retrieves the
replacement through its own invite endpoint.

**Revoking never reaches backwards.** Employees who already registered with a
link keep their accounts and can still sign in; only future registrations are
blocked.

Audited via `ADMIN_INVITATION_REVOKED` and `ADMIN_INVITATION_REGENERATED`
(organization id and the replacement's *id* only).

### Deliberately not implemented

- **Resend** — there is no invitation email anywhere in the product. Invite links
  are shared by the organization admin out of band; the only mail service is for
  password reset. A "resend" button would have required inventing a delivery
  channel, which is out of scope. **Regenerate** is the honest equivalent: it
  invalidates the old link and produces a new one.
- **Expire** — `isUsable()` already returns false once a link is revoked, and the
  product never sets `expiresAt`, so a separate "expire" action would be a second
  way to reach exactly the state Revoke produces. Redundant surface was not worth
  adding.
- Used/accepted-invitation rules do not apply: that state does not exist in this
  model.

## Audit event review filters (OPS-02)

`GET /admin/audit-logs` is a **read-only, GET-only** review page over
`security_audit_events`. There is no POST endpoint, no delete, no retention
action and no export — the console can narrow the log, never change it.

### Supported filters

All filters combine with **AND**, all are query parameters, and all are built
through the JPA Criteria API (`AdminAuditQuery`), so no user input is ever
concatenated into a query.

| Parameter | Column | Matching |
| --- | --- | --- |
| `eventType` | `event_type` | exact, from a dropdown of `SecurityAuditEventType` values |
| `outcome` | `success` | `success` / `failure` |
| `actor` | `normalized_email`, `actor_user_id`, `user_id` | case-insensitive *contains* on the email; when the term parses as a UUID it also matches either id |
| `organizationId` | `organization_id` | exact UUID |
| `ip` | `ip_address` | case-insensitive *contains*, so `10.0.` matches a range |
| `from` / `to` | `created_at` | `>= from`, `<= to`; a `datetime-local` or bare date read as **UTC** — the zone every admin timestamp is rendered in. A bare date as `to` covers the whole day |
| `page` / `size` | — | default **25**, max **100** |

The detail page links back into the filtered list for the event's type, actor,
subject user and organization, and the list's organization column does the same,
so a single event pivots to everything related to it.

### Behaviour

- Ordering is `created_at DESC, id DESC`. Rows written by one request share a
  timestamp, so paging is only deterministic with the id tiebreaker.
- **Nothing throws.** Filters bind as raw strings and parse leniently: an unknown
  event type, a malformed UUID, an unreadable date, a non-numeric `page`/`size`
  are dropped, and the remaining filters still apply. This matters because
  `AdminErrorAdvice` turns any escaping exception into a **500**, so a
  hand-edited query string would otherwise render an error page.
- Operator-typed LIKE wildcards (`%`, `_`, `\`) are escaped, so `%` matches a
  literal percent sign rather than every row.
- Pagination links carry every filter (`AdminListView.baseQuery`).

### Deliberately not implemented

- **`details` is neither rendered nor searchable.** The free-form metadata column
  is excluded from both audit read models by design, so no secret written there
  can reach the console — that safety is worth more than full-text search over
  it. Searching `details` would also have meant `LIKE` over an unindexed `TEXT`
  column across the whole audit history.
- **Event category/prefix filter** (`ADMIN_*`, `AUTH_*`) — the enum has no
  consistent taxonomy (`SYSTEM_ADMIN_BOOTSTRAP_*` vs `ADMIN_*` vs bare
  `LOGIN_*`), so a derived prefix would be inventing a category system. Adding a
  new audit taxonomy is an explicit non-goal.
- **User-agent filter** — stored and shown on the detail page, but filtering an
  audit log by browser string is not a triage workflow worth a form field.
- No export, no deletion, no retention policy, no severity classification.

### Relationship to `/api/admin/monitor`

The monitor from PR #47 is preserved: same controller and secret masking, now
served under the SYSTEM_ADMIN session boundary instead of Basic auth. The admin
sidebar links to it under **System → Backend Monitor**; the topbar shows the
signed-in admin's name, a `SYSTEM_ADMIN` badge, and a logout button.

## Template structure (`src/main/resources/templates/admin/`)

- `layout/base.html` — page shell fragment `page(content)`; each page calls
  `~{admin/layout/base :: page(~{::content})}` and defines a `content` fragment
  (no layout-dialect dependency).
- `layout/topbar.html`, `layout/sidebar.html`, `layout/breadcrumbs.html`,
  `layout/messages.html` — shell parts. The sidebar shows only entries
  implemented in this PR and highlights the active section via `activeNav`.
- `fragments/` — `table.html` (card wrapper), `pagination.html`, `filters.html`
  (search box), `badges.html` (status badge), `empty-state.html`. Pages needing
  more than one filter build a labelled `.admin-filters--grid` form inline (see
  `audit-logs/list.html`).
- `dashboard/index.html`, `<entity>/list.html`, `<entity>/detail.html`,
  `error/{403,404,500}.html`.

## CSS structure (`src/main/resources/static/admin/css/`)

`admin.css` (shell, topbar, sidebar, base type), `components.css` (cards,
metrics, buttons, badges, tags, filters, focus states), `tables.css` (dense
tables + pagination). `js/admin.js` is optional progressive enhancement only
(auto-submit filter selects); the UI works without JavaScript.

## Adding a new admin page

1. Add a view-model record under `viewmodel/` (safe fields only).
2. Add an admin `Repository` query returning `Page<Entity>` (DB-level search),
   plus batch count queries if the list needs satellite counts.
3. Add a service mapping entities → view models; call `AdminPaging.likePattern`
   for search and `AdminListView.of(page, query, baseQuery)`.
4. Add a thin `@Controller` (call `guard.requireEnabled()`, build the `Pageable`
   with `AdminRequests.sort(...)` and `baseQuery`, add shell model attributes:
   `pageTitle`, `activeNav`, `sectionLabel`, `sectionHref`, `detailLabel`).
5. Add `list.html` / `detail.html` using the shared fragments; add the sidebar
   entry.

## Search / filter / pagination conventions

- URL query params: `q` (search), `page`, `size`, `sort=field,dir`, plus
  entity filters (`status` on projects, `status=ACTIVE` on allocations).
- Default page size **25**, max **100** (`AdminPaging`, clamped).
- Sort fields are **whitelisted** per controller (`AdminRequests.sort`) so an
  arbitrary/unmapped property can never be requested.
- Search/filter/sort are retained across pagination via `AdminListView.baseQuery`.
- Invalid enum filters (e.g. `?status=BANANA`) are ignored with a visible
  message — never a stack trace.
- **`page`/`size` bind as raw strings on every admin list page** and normalize
  through `AdminPaging` (ADMIN-HARDEN-01). Binding them as `Integer` let a
  hand-edited `?page=abc` raise a type mismatch, which `AdminErrorAdvice` renders
  as a 500. Contract: missing/malformed/negative `page` → `0`; a large valid page
  is honoured and simply renders empty; missing/malformed/non-positive `size` →
  **25**; oversized `size` → clamped to **100**; repeated parameters bind as a
  comma-joined string and therefore fall back to the default, deterministically.
- Pagination links retain the **effective** size (`AdminPaging.retainedSize`), and
  only when one was requested — so a hostile `?size=<script>` is never echoed into
  a rendered link.
- Postgres note: search uses a precomputed lower-cased LIKE pattern
  (`AdminPaging.likePattern`) rather than a nullable bind inside `concat(...)`,
  which avoids the `lower(bytea)` type-inference error.

## Sensitive-data policy

View models exclude, and templates never render: password hashes, failed-login
counters / lock timestamps, refresh/reset/session tokens, raw invite token
values (shown as a fixed masked hint), audit `details` metadata, and normalized
names. Detail pages may show full UUIDs under a Metadata section; tables show
short/abbreviated identifiers or link text.

## Unreadable request values

The console answers a mistyped URL with its own pages, never a stack trace:

- **Malformed path id** (`/admin/users/not-a-uuid`) → admin **404**.
  `AdminErrorAdvice` maps Spring's `MethodArgumentTypeMismatchException` to the
  same page an unknown id produces, which is also the answer that discloses least.
  The mapping is deliberately narrow — a conversion failure raised deeper in the
  stack is a real defect and still surfaces as a 500.
- **Malformed `page`/`size`** → normalized by `AdminPaging` (see the conventions
  above); the list still renders.
- **Malformed filter values** → dropped by the page's own parser; remaining
  filters still apply.
- **Encoded spaces, semicolons and path traversal** (`/admin/users/%20`,
  `..%2F..%2Fetc`) never reach MVC at all: Spring Security's `StrictHttpFirewall`
  refuses them with a **400** before routing. That control is deliberately left
  as-is.

Security is evaluated before any of this: an anonymous request to a malformed URL
is redirected to the login page and learns nothing, and a POST without a CSRF
token is `403` regardless of whether its id would have parsed.

## Error pages

`AdminErrorAdvice` (scoped to `me.aydgn.potriv.admin.controller`, so it never
touches the REST JSON error handler) renders admin-styled `404`
(`AdminNotFoundException`) and `500` pages; a styled `403` is rendered by
`AdminAccessDeniedHandler`. No stack traces are leaked.

## Testing strategy

Integration tests (MockMvc, real security chain, Testcontainers PostgreSQL):

- `AdminSessionLoginIntegrationTest` — login page renders, anonymous routes
  redirect to login, a SYSTEM_ADMIN session reaches pages and the monitor, the
  topbar shows identity (no secrets), logout invalidates the session.
- `AdminSessionSecurityIntegrationTest` — wrong password / unknown email /
  non-SYSTEM_ADMIN / inactive admin cannot authenticate; the seeded admin can;
  login and static assets load anonymously.
- `AdminCsrfIntegrationTest` — POST login/logout without a CSRF token ⇒ `403`;
  with a token they succeed.
- `AdminApiIsolationIntegrationTest` — an admin session never authenticates the
  JWT API, and a Bearer JWT grants nothing on the console; health is unguarded.
- `AdminAuthenticationServiceTest` — credential verification mirrors the JWT
  login's failed-attempt increment, lockout, inactive rejection, reset-on-
  success, and `LOGIN_SUCCEEDED` audit.
- `AdminDisabledIntegrationTest` — console disabled ⇒ admin routes `404`.
- `AdminDashboardIntegrationTest` — dashboard renders count labels, no secrets.
- `AdminListPagesIntegrationTest` — all list pages `200 text/html`, no sensitive
  values, search retained, invalid status ignored with a message.
- `AdminDetailPagesIntegrationTest` — user/organization/project detail render
  (project via the real create flow); unknown UUID ⇒ admin-styled `404`.
- `AdminOrganizationFormIntegrationTest` — organization edit: form renders, valid
  rename redirects and persists, blank name re-renders with error, unknown id
  `404`, POST without CSRF `403`, admin session does not authenticate the API.
- `AdminDepartmentFormIntegrationTest` — department create/edit/delete: persist +
  redirect, field/duplicate/invalid-organization errors, delete confirmation does
  not mutate, CSRF-less delete `403`, safe delete removes, dependency-blocked
  delete keeps the department, and the corresponding audit events.
- `AdminSkillCategoryFormIntegrationTest` — category list/detail/create/edit,
  blank/duplicate/unknown-organization errors, unknown id `404`, CSRF-less `403`,
  no sensitive values.
- `AdminSkillFormIntegrationTest` — skill create/edit with cross-organization
  category/author/department blocking, non-manager author blocked, duplicate name
  blocked, same name in another category allowed, author/organization immutable
  on edit, safe deactivate/reactivate preserving links, CSRF-less `403`, and API
  isolation.
- `AdminSkillDepartmentLinkIntegrationTest` — add/remove links, idempotent
  duplicates, cross-organization department blocked, and remove preserving skill
  and department.
- `AdminUserFormIntegrationTest` — name edit persists/audits, blank-name error,
  unknown id `404`, CSRF-less `403`, suspend/activate, self-suspend blocked,
  last active SYSTEM_ADMIN suspend blocked, unlock clears lock + failed attempts,
  API isolation, and no sensitive values.
- `AdminPagingTest` + `AdminPaginationHardeningIntegrationTest` — the
  normalization contract asserted directly on the helper, then replayed against
  all nine paginated admin routes: malformed, negative, oversized, far-past-the-end,
  repeated and hostile `page`/`size` all render a list; the hostile text is neither
  executed nor echoed; the effective size is what the operator sees; audit filters
  still apply under malformed pagination; anonymous is still turned away.
- `AdminAuditFiltersIntegrationTest` — anonymous/non-SYSTEM_ADMIN blocked,
  newest-first stable ordering under equal timestamps, per-filter isolation
  (event type, organization, outcome, actor by email and by user id, IP, date
  from/to), AND semantics for combined filters, pagination preserving every
  filter, unreadable enum/UUID/date/page/size narrowing instead of erroring,
  escaped LIKE wildcards, `details` never reaching the HTML, and repeated GETs
  leaving audit rows untouched.
- `AdminUserRoleManagementIntegrationTest` — grant/revoke persist + audit, grant
  does not create assignment/ownership, idempotent duplicate/missing, CSRF-less
  `403`, tampered `SYSTEM_ADMIN` grant/revoke blocked, self-revoke blocked,
  suspended-user mutation blocked, dependency-based revoke guards
  (dept-manager/project-manager/employee), unknown id `404`, API isolation.

Run: `cd apps/backend && ./mvnw test && ./mvnw verify`.

## Known limitations

- Writes cover organization rename, department create/edit/delete (ADMIN-UI-03),
  skill-category + skill catalog management (ADMIN-UI-04), a safe user
  account-operations slice — name edit, activate/suspend, unlock (ADMIN-UI-05) —
  and manageable-role grant/revoke (ADMIN-UI-06). Everything else is read-only:
  no other domain actions, no bulk operations, no organization delete, no
  category delete/deactivate, no `SYSTEM_ADMIN` role management, no
  password/email changes, no user hard delete.
- Access is a per-user SYSTEM_ADMIN browser session; `SYSTEM_ADMIN` itself is not
  grantable/revocable from the console (managed out of band).
- Audit review filters only what `SecurityAuditEvent` actually stores; the
  free-form `details` column is neither rendered nor searchable (OPS-02), and
  there is no export or retention policy.
- Organization detail lists departments by name/link only (member counts live on
  the Departments page) to avoid fabricating per-row counts.

## Follow-up PRs

- **ADMIN-AUTH-02** — Browser Session Admin Authentication using existing Potriv
  users and roles. ✅ Done.
- **ADMIN-UI-03** — Safe Admin Forms for Organization + Department. ✅ Done.
- **ADMIN-UI-04** — Safe Skill Catalog Administration Forms. ✅ Done.
- **ADMIN-UI-05** — Safe User Administration Forms (account operations). ✅ Done.
- **ADMIN-UI-06** — Safe User Role Management. ✅ Done (this PR).
- **ADMIN-UI-07** — Safe Invitation Administration Actions. ✅ Done (this PR).
- **OPS-02** — Advanced Audit/Admin Event Review Filters. ✅ Done.
- **ADMIN-HARDEN-01** — Admin List Pagination Hardening. ✅ Done (this PR).
- **ADMIN-UI-08** — Production polish, accessibility, and query performance pass.
