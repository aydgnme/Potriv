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
| `GET /admin/monitor` (PR #47, unchanged) | `/api/admin/monitor` |

## Security model

This PR does **not** redesign Potriv authentication. It reuses the existing
`/admin/**` security boundary introduced for the monitor console
(`BackendMonitorSecurityConfig`, `@Order(0)`, HTTP Basic on a self-contained
`AuthenticationManager`, independent from the JWT/Bearer API chain):

- `/admin/**` (pages, `/admin/monitor`, and `/admin/css|js/**` assets) require the
  backend-console HTTP Basic credentials. The API (`/api/**` REST) keeps its JWT
  behavior unchanged, and the console credentials grant nothing on the API.
- Credentials are environment-driven (`potriv.backend-console.*` /
  `BACKEND_CONSOLE_USERNAME` / `BACKEND_CONSOLE_PASSWORD`). The prod boot guard
  (`ProductionConfigGuard`) still rejects missing/placeholder/short credentials.
- **Disabled by default.** When the console is disabled, `AdminAccessGuard` makes
  every admin route answer an anti-leak `404` (the route does not reveal itself),
  exactly like the monitor.
- No new admin-user table, no session login, no CSRF-sensitive mutations (the UI
  is read-only, so CSRF is disabled on this chain).

### Why ADMIN-UI-01 is read-only

A DB-backed browser admin login and any write path materially change the risk
surface. The safe first step is a read-only foundation that reuses the existing
ops gate and preserves all REST/JWT behavior. Browser-session auth and safe
writes come next (see Follow-up PRs).

### Relationship to `/api/admin/monitor`

The monitor console from PR #47 is untouched: same controller, Basic auth,
secret masking, and prod-disabled-by-default behavior. The admin sidebar links
to it under **System → Backend Monitor**; because both live under the same
`/admin/**` Basic realm, the browser reuses credentials.

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
(`AdminNotFoundException`) and `500` pages; a `403` template exists for future
session auth. No stack traces are leaked.

## Testing strategy

Integration tests (MockMvc, real security chain, Testcontainers PostgreSQL):

- `AdminSecurityIntegrationTest` — auth required, monitor still protected, valid
  creds reach pages, `/api` JWT behavior unchanged.
- `AdminDisabledIntegrationTest` — console disabled ⇒ admin routes `404`.
- `AdminDashboardIntegrationTest` — dashboard renders count labels, no secrets.
- `AdminListPagesIntegrationTest` — all list pages `200 text/html`, no sensitive
  values, search retained, invalid status ignored with a message.
- `AdminDetailPagesIntegrationTest` — user/organization/project detail render
  (project via the real create flow); unknown UUID ⇒ admin-styled `404`.

Run: `cd apps/backend && ./mvnw test && ./mvnw verify`.

## Known limitations

- Read-only: no create/update/delete, no domain actions, no bulk operations.
- No browser session login yet — access is the shared backend-console Basic
  credential (a single operator gate, not per-user).
- Audit-log page paginates by newest-first without a search filter yet.
- Organization detail lists departments by name/link only (member counts live on
  the Departments page) to avoid fabricating per-row counts.

## Follow-up PRs

- **ADMIN-AUTH-02** — Browser Session Admin Authentication using existing Potriv
  users and roles.
- **ADMIN-UI-03** — Safe Admin Forms for low-risk entities.
- **ADMIN-UI-04** — Domain Actions through existing services.
- **ADMIN-UI-05** — Audit Log improvements and admin action auditing.
- **ADMIN-UI-06** — Production polish, accessibility, and query performance pass.
