# Potriv Admin UI (ADMIN-UI-01)

## Overview

A server-rendered, **read-only** internal administration/backoffice layer embedded
in the Spring Boot backend, inspired by Django Admin. It is **not** the product
frontend and **not** the Next.js backend-control console (PR #46). It exists so
operators can inspect Potriv domain data (users, organizations, departments,
projects, allocations, invitations, audit logs) and system health from the
backend runtime itself.

This first PR delivers the secure read-only foundation only. Writes, browser
session login, and domain actions are explicit follow-ups.

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

### Why the console stays read-only

A write path materially changes the risk surface. ADMIN-AUTH-02 adds a real
browser-session identity but keeps the console read-only: the only state-
changing endpoints are login and logout. Safe writes, if ever needed, come
later.

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

Run: `cd apps/backend && ./mvnw test && ./mvnw verify`.

## Known limitations

- Read-only: no create/update/delete, no domain actions, no bulk operations.
- Access is a per-user SYSTEM_ADMIN browser session; there is no role UI to
  grant SYSTEM_ADMIN from inside the console (roles are managed out of band).
- Audit-log page paginates by newest-first without a search filter yet.
- Organization detail lists departments by name/link only (member counts live on
  the Departments page) to avoid fabricating per-row counts.

## Follow-up PRs

- **ADMIN-AUTH-02** — Browser Session Admin Authentication using existing Potriv
  users and roles. ✅ Done (this PR).
- **ADMIN-UI-03** — Safe Admin Forms for low-risk entities.
- **ADMIN-UI-04** — Domain Actions through existing services.
- **ADMIN-UI-05** — Audit Log improvements and admin action auditing.
- **ADMIN-UI-06** — Production polish, accessibility, and query performance pass.
