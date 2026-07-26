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
| `GET /admin/organizations` , `/{id}` | `/api/admin/organizations…` |
| `GET /admin/departments` , `/{id}` | `/api/admin/departments…` |
| `GET /admin/projects` , `/{id}` | `/api/admin/projects…` |
| `GET /admin/allocations` , `/{id}` | `/api/admin/allocations…` |
| `GET /admin/invitations` , `/{id}` | `/api/admin/invitations…` |
| `GET /admin/audit-logs` , `/{id}` | `/api/admin/audit-logs…` |
| `GET /admin/monitor` | `/api/admin/monitor` |
| `GET /admin/login` , `POST /admin/login` | `/api/admin/login` |
| `POST /admin/logout` | `/api/admin/logout` |
| `GET/POST /admin/organizations/{id}/edit` | `/api/admin/organizations/{id}/edit` |
| `GET /admin/departments/new` , `POST /admin/departments` | `/api/admin/departments…` |
| `GET/POST /admin/departments/{id}/edit` | `/api/admin/departments/{id}/edit` |
| `GET/POST /admin/departments/{id}/delete` | `/api/admin/departments/{id}/delete` |

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

**Out of scope (still):** organization delete, organization address/other fields,
skills CRUD, project CRUD, allocation/deallocation actions, user role management,
invitation actions, and bulk actions.

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
  (search box), `badges.html` (status badge), `empty-state.html`.
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
- Postgres note: search uses a precomputed lower-cased LIKE pattern
  (`AdminPaging.likePattern`) rather than a nullable bind inside `concat(...)`,
  which avoids the `lower(bytea)` type-inference error.

## Sensitive-data policy

View models exclude, and templates never render: password hashes, failed-login
counters / lock timestamps, refresh/reset/session tokens, raw invite token
values (shown as a fixed masked hint), audit `details` metadata, and normalized
names. Detail pages may show full UUIDs under a Metadata section; tables show
short/abbreviated identifiers or link text.

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

Run: `cd apps/backend && ./mvnw test && ./mvnw verify`.

## Known limitations

- Writes are limited to organization rename and department create/edit/delete
  (ADMIN-UI-03). Everything else is read-only: no other domain actions, no bulk
  operations, no organization delete.
- Access is a per-user SYSTEM_ADMIN browser session; there is no role UI to
  grant SYSTEM_ADMIN from inside the console (roles are managed out of band).
- Audit-log page paginates by newest-first without a search filter yet.
- Organization detail lists departments by name/link only (member counts live on
  the Departments page) to avoid fabricating per-row counts.

## Follow-up PRs

- **ADMIN-AUTH-02** — Browser Session Admin Authentication using existing Potriv
  users and roles. ✅ Done.
- **ADMIN-UI-03** — Safe Admin Forms for Organization + Department. ✅ Done (this PR).
- **ADMIN-UI-04** — Domain Actions through existing services.
- **ADMIN-UI-05** — Audit Log improvements and admin action auditing.
- **ADMIN-UI-06** — Production polish, accessibility, and query performance pass.
