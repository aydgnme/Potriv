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
| 5 | No breadcrumb anywhere, on any deep route | fixed on all 16 |
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
labels stay in the accessibility tree. The collapse control is hidden here — UI
and accessibility tree — because the media query outranks the React state it
toggles: leaving it would announce "Collapse navigation" beside an
already-collapsed rail and then change nothing when pressed. The preference is
interactive only at ≥1100px, where `aria-expanded` always matches what is
rendered.

**Mobile.** The top strip is replaced by a fixed bottom bar of at most five
controls. The **last slot always belongs to the account sheet**: the sidebar that
normally carries sign-out is not rendered at this width, so giving that slot to a
fourth or fifth domain strands the account entirely. Up to four domains are
direct tabs; anything beyond moves into the sheet, which is named "More" when it
carries domains and "Account" when it carries only the account block. Both are
the same native modal `<dialog>`. `aria-current` stays on the real link inside
it, and the trigger is named `More, current section Organization` when the
current domain is inside. Content inset is `--p-mobile-nav-height` plus
`env(safe-area-inset-bottom)`.

| Domains | Bottom controls |
| --- | --- |
| 3 | 3 tabs + Account = 4 |
| 4 | 4 tabs + Account = 5 |
| 5 | 4 tabs + More = 5 |
| 6 | 4 tabs + More = 5 |

## Orientation

Breadcrumbs (`<nav aria-label="Breadcrumb"><ol>`) cover **all 16 deep routes**.
Wired from the route file where the label was already there: `/skills/{id}`,
`/skills/{id}/edit`, `/skills/my`, `/skills/new`, `/skills/categories`,
`/organization/departments`, `/organization/departments/{id}`,
`/organization/invite`, `/organization/team-roles`,
`/organization/team-roles/new`, `/organization/team-roles/{id}`. Each ancestor is
a real route, so the trail works from a bookmark; the current page is text with
`aria-current="page"`; no UUID is ever a label. The duplicate ad-hoc "Back to X"
links those pages carried were removed. At ≤767px the trail collapses to a
"Back to {parent}" link to the same real route.

Also wired, inside the module components that already hold the loaded object:
`/projects/{id}` (`ProjectOverview`), `/projects/{id}/team` (`ProjectTeamView`),
`/projects/{id}/edit` (`ProjectSettingsPage`), `/projects/{id}/team-finder`
(`TeamFinderScreen`) and `/people/{id}` (`PersonDetail`). Each takes the name
from the payload the route already fetched, so no request was added for
metadata; `TeamFinderScreen` uses `project.projectId` from that same payload.
All 16 deep routes now carry a trail.

**Titles.** All 23 protected routes now set one. Dynamic object routes use an
honest route-level fallback (`Skill · Potriv`, `Project team · Potriv`) because
naming the object would require a second no-store read purely for metadata.

## Responsive matrix

Each route was loaded in an iframe sized to the target width — a real viewport
with real media queries — and measured for `scrollWidth > clientWidth`.

| | |
| --- | --- |
| Widths | 320 · 375 · 390 · 768 · 1024 · 1280 · 1440 |
| Top-level and static routes | 13 routes × 7 widths = **91 checks, 0 failures** |
| Object routes (real ids) | `/projects/{id}`, `/projects/{id}/team`, `/projects/{id}/team-finder`, `/projects/{id}/edit`, `/organization/departments/{id}`, `/organization/team-roles/{id}` at 320 · 768 · 1280 · 1440 = **24 checks, 0 failures** |

No page-level horizontal scrolling anywhere in those 115 checks, and no local
scroll region was needed to achieve it. Main's bottom padding measures 80px
against a 57px bar, so the last control clears the fixed navigation.

**Reflow (1.4.10).** 400% zoom at a 1280px window is equivalent to a 320px
viewport, which the matrix covers directly. Zoom was not additionally exercised
through the browser's own zoom control.

## Text spacing (1.4.12)

The WCAG stress values — `line-height: 1.5`, `letter-spacing: 0.12em`,
`word-spacing: 0.16em`, `p { margin-bottom: 2em }` — were injected into each
route's own document at 320px across `/home`, `/projects`, `/staffing`,
`/people`, `/skills`, `/skills/my`, `/organization`, `/organization/invite`,
`/organization/team-roles` and `/login`: **10 routes, 0 overflow failures.**

## Reduced motion

The product has exactly one transition in its entire loaded CSS —
`background-color 120ms, border-color 120ms` on `Button` — plus one global
`prefers-reduced-motion` block. The mobile sheet and every dialog are native
`<dialog>` elements with `transition-duration: 0s` and `animation-name: none`,
so nothing waits on a transition that reduced motion would disable. There is no
drawer, no animated sheet and no spinner keyframe to audit.

## Contrast (1.4.3, 1.4.11)

Eighteen rendered token pairs were measured. Fifteen passed. Three did not, and
two of those were real defects that are now fixed:

| Pair | Was | Now | Minimum |
| --- | --- | --- | --- |
| `--p-text-subtle` on surface | 3.42 | **4.83** | 4.5 |
| `--p-border-strong` on surface | 1.86 | **3.41** | 3.0 |
| `--p-border` on surface | 1.34 | 1.34 | n/a |

`--p-text-subtle` was not decorative: it carries the "(required)" and
"(optional)" markers on every form label, which is informational text under
1.4.3. `--p-border-strong` is the outline of every input, select, textarea and
secondary button — the visual boundary that identifies the component under
1.4.11 — so a field's own edge sat below the minimum.

`--p-border` is left alone deliberately. It draws separators between content
(panel edges, table row rules, the sidebar's divider); 1.4.11 governs what
identifies a *component*, and a divider does not.

A second instance of the same defect was found at module level: `Organization`,
`Skills` and `TeamRoles` styled their `.control` with `--p-border` while
`Field`, `People`, `Projects`, `Staffing` and `TeamFinder` used
`--p-border-strong`. All three now use the strong token. Verified on the
rendered `/skills` search input: 1.34 → **3.41**.

Everything else passed as measured, including body text (17.76), muted text
(6.11), links (6.11), the focus ring against both surfaces (6.11 / 5.75), the
primary button (17.76), all five status badges (5.33–6.95) and the current
navigation item (14.60).

## WCAG 2.2 AA criteria actually audited

- **1.3.1 Info and Relationships** — headings, landmarks, breadcrumb list semantics, table headers
- **1.4.3 Contrast (Minimum)** — 18 pairs measured; two token defects found and fixed
- **1.4.10 Reflow** — 115 route×width checks, 0 page-level overflow
- **1.4.11 Non-text Contrast** — focus ring and control boundaries measured; one defect fixed
- **1.4.12 Text Spacing** — stress values injected across 10 routes at 320px
- **2.4.1 Bypass Blocks** — skip link is the first tab stop and targets `#main`
- **2.4.7 Focus Visible** — no `outline: none` in any stylesheet
- **2.5.8 Target Size (Minimum)** — bottom tabs 64×56, rail items and collapse control 34px, IconButton 28/34
- **3.2.3 Consistent Navigation** — one resolver, one definition list, both surfaces from the same composed items
- **4.1.2 Name, Role, Value** — collapse toggle, sheet trigger, every navigation link, dialog titles

**Not audited in this pass**, and therefore not claimed: 2.1.1 Keyboard and
2.1.2 No Keyboard Trap across the domain modules; 2.4.3 Focus Order beyond the
first tab stop; 2.4.11 Focus Not Obscured beyond the bottom-bar inset
measurement; 2.5.3 Label in Name; 3.3.1 / 3.3.2 / 3.3.3 error identification
across all forms; 4.1.3 Status Messages.

## Known limitation in verification — Escape

Escape-to-close still could not be exercised, and a control experiment now shows
why it is the harness rather than the dialog.

The automation's synthetic key events reach JavaScript — `keydown` fires with
`key: "Escape"`, and `navigator.userActivation.hasBeenActive` becomes true — but
they do not carry the browser's default actions. The control: with a `<button>`
focused and a click listener attached, a synthetic **Enter produced zero click
events**. Enter activating a focused button is bedrock browser behaviour that no
application code can suppress, so an input layer that cannot do that cannot
deliver Escape to a dialog either. The dialog is not implicated.

What was verified: the sheet is a native `<dialog>` opened with `showModal()`
(modal backdrop renders, focus enters), and the Close path works — the dialog closes, focus
returns to the trigger, and `aria-expanded` syncs back to `false`. Escape
remains the platform's documented behaviour for `showModal()`, but this run does
not prove it.

## Gates

See the PR body for exact totals.

## Remaining gaps

Removed only what was actually proven above. Everything still here is unproven,
and is listed so this document cannot be read as claiming more than was run.

- **Full keyboard workflow pass** across the domain modules (Team Finder candidate
  selection, Staffing accept/reject, People role editor, project forms, dialogs).
  The harness cannot deliver activating key events — see the Escape section — so
  keyboard operation cannot be exercised through it at all. This needs a human at
  a real keyboard.
- **Real Escape proof**, for the same reason.
- **2.4.11 Focus Not Obscured** beyond the measured bottom-bar inset: first /
  middle / last control focus was not walked on long pages.
- **Per-role route crawl** as six separate actor passes. Only the plain Employee
  and the four-role actor were driven live this round; the PM, appointed DM,
  unappointed DM and OA passes were not re-run.
- **Per-domain long-content stress** — 5000-character rejection reasons, 10+
  Team Finder evidence items, many technology chips. Only the invite URL (the
  longest single string in the product) was stressed.
- **Form accessibility and status-message passes** (3.3.x, 4.1.3) across the
  fourteen forms.
- **FRONTEND CI STILL NEEDED** — no workflow runs these tests.
- Organization display-name backend gap; the name is omitted rather than invented.
