# FE-13 — final integration audit

Baseline: `main` at `d387b2c2ec72dd8884373303118452230bcb5488` (PR #91 merged).
Branch: `feat/frontend-responsive-accessibility-final-integration`.

This records what was audited and what was changed. It is not an accessibility
certification, and it does not claim criteria that were not exercised.

## Route matrix (from source, not from a plan)

Auth: `/login`, `/forgot-password`, `/reset-password`, `/` (redirector).

Protected: `/home`; `/projects`, `/projects/new`, `/projects/{id}`,
`/projects/{id}/team`, `/projects/{id}/team-finder`, `/projects/{id}/edit`;
`/staffing`; `/people`, `/people/{id}`; `/skills`, `/skills/my`, `/skills/new`,
`/skills/categories`, `/skills/{id}`, `/skills/{id}/edit`; `/organization`,
`/organization/departments`, `/organization/departments/{id}`,
`/organization/invite`, `/organization/team-roles`,
`/organization/team-roles/new`, `/organization/team-roles/{id}`.

Dev console (`/console`) is a separate product and was not touched.

## What the audit found

| # | Finding | Status |
| --- | --- | --- |
| 1 | The protected layout never passed `currentItemId`, so `aria-current` was supported but dead on every route | fixed |
| 2 | Mobile turned the sidebar into a horizontally scrolling top strip carrying six domains plus the account block | fixed |
| 3 | No desktop collapse | fixed |
| 4 | No distinct behaviour between 768px and a comfortable desktop | fixed |
| 5 | No breadcrumb anywhere, on any deep route | fixed for the routes listed below |
| 6 | No `metadata` on any protected route — all 23 fell back to the root `Potriv` | fixed |
| 7 | `/login` had no heading element at all | fixed |
| 8 | `PageHeader` headline had no `min-width: 0`; a long name could set page width | fixed |

Audited and found already correct, so unchanged: no `outline: none` anywhere;
no click handlers on `div`/`span`/`tr`/`li`; `IconButton` at 28px and 34px, both
past the 24×24 minimum; all twelve dialogs use native `<dialog>` + `showModal()`
with `aria-labelledby`, so focus entry, background inertness and focus return
are the platform's; every static internal `href` resolves to a real route, and
`/console` is linked only from the dev console's own layout; every protected
route reaches a `PageHeader` `h1`; the split layouts already collapse
(Team Finder/Staffing/People at ≤899px, Skills/Organization at ≤767px).

## Shell decisions

**Active navigation.** `resolveCurrentNavigationId(pathname, items)` is pure and
matches whole segments — `path === href || path.startsWith(href + "/")` — so
`/projects-archive` is not Projects. Query strings and fragments do not change
the answer. An unrecognised route marks nothing rather than guessing.

**Pathname ownership.** `AppShell` stays server-renderable; one client component
(`ProductNavigation`) calls `usePathname`. It receives a display name, role
labels already on screen, and navigation **ids** — not items, because an icon
component cannot cross the server/client boundary. The server still decides
which ids exist, so the client cannot render a domain the roles did not grant.

**Desktop.** Persistent sidebar retained. A real `<button>` with `aria-expanded`
collapses it to a 56px icon rail; labels are clipped, never removed, so link
names are unchanged. Verified live: 232px → 56px with identical accessible
names, current state and sign-out. Not persisted.

**768–1099px.** Icon rail by default, using the same clip technique, so the
labels stay in the accessibility tree.

**Mobile.** The top strip is replaced by a fixed bottom bar of at most five
controls. Six domains become four tabs plus More; the overflow sheet is a native
modal `<dialog>` carrying the remaining domains, the account identity, the role
list and sign-out. `aria-current` stays on the real link inside the sheet, and
More is named `More, current section Organization` when the current domain is
inside it. Content inset is `--p-mobile-nav-height` plus `env(safe-area-inset-bottom)`.

## Orientation

Breadcrumbs (`<nav aria-label="Breadcrumb"><ol>`) wired into: `/skills/{id}`,
`/skills/{id}/edit`, `/skills/my`, `/skills/new`, `/skills/categories`,
`/organization/departments`, `/organization/departments/{id}`,
`/organization/invite`, `/organization/team-roles`,
`/organization/team-roles/new`, `/organization/team-roles/{id}`. Each ancestor is
a real route, so the trail works from a bookmark; the current page is text with
`aria-current="page"`; no UUID is ever a label. The duplicate ad-hoc "Back to X"
links those pages carried were removed. At ≤767px the trail collapses to a
"Back to {parent}" link to the same real route.

**Not wired:** the four `/projects/{id}/**` routes and `/people/{id}`. Their
headers are rendered inside module components rather than the route file, so the
object name is not in scope where the trail would go. Left for a follow-up
rather than restructured under time pressure.

**Titles.** All 23 protected routes now set one. Dynamic object routes use an
honest route-level fallback (`Skill · Potriv`, `Project team · Potriv`) because
naming the object would require a second no-store read purely for metadata.

## Viewports exercised

320, 375 and desktop, live. `document.documentElement.scrollWidth <= clientWidth`
confirmed at 320px on `/skills`, `/organization/team-roles`,
`/organization/invite` (the longest single string in the product), `/staffing`
and `/people`. Main's bottom padding measured 80px against a 57px bar, so the
last control clears it.

**Not exercised:** 390, 768, 1024, 1440 as a systematic matrix; 200% and 400%
zoom; the WCAG text-spacing stress values; reduced motion.

## WCAG 2.2 AA criteria actually audited

1.3.1 Info and Relationships (headings, landmarks, breadcrumb list semantics,
table headers) · 2.4.1 Bypass Blocks (skip link present and targeted) ·
2.4.7 Focus Visible (no `outline: none` in any stylesheet) · 2.5.8 Target Size
(bottom tabs 64×56, rail items and collapse control 34px, IconButton 28/34) ·
4.1.2 Name, Role, Value (collapse toggle, More trigger, every nav link, dialog
titles) · 3.2.3 Consistent Navigation (one resolver, one definition list).

Not audited in this pass: 1.4.3 and 1.4.11 contrast measurement, 1.4.10 Reflow
beyond 320/375, 1.4.12 Text Spacing, 2.4.11 Focus Not Obscured beyond the bottom
bar inset, 2.1.2 keyboard traps across all modules, 3.3.x error identification
across all forms.

## Known limitation in verification

Escape-to-close on the native dialog could not be exercised through the browser
automation: the synthetic key reaches the page (`keydown` fires with
`key: "Escape"`) but Chrome's close-request path does not run, so `cancel` never
fires. The Close button path was verified instead — the dialog closes, focus
returns to the trigger, and `aria-expanded` syncs back to `false`. Escape
remains the platform's documented behaviour for `showModal()`, but this run does
not prove it.

## Gates

See the PR body for exact totals.

## Remaining gaps

- **FRONTEND CI STILL NEEDED** — no workflow runs these tests.
- Organization display-name backend gap remains; the name is omitted rather than invented.
