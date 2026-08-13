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
measurement across all modules; 2.1.1 Keyboard; 2.1.2 No Keyboard Trap;
2.4.3 Focus Order.

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

## Zoom

**CSS-zoom approximation — passed.** A 1280px window at 200% lays out as a 640px
viewport; that viewport plus `document.documentElement.style.zoom = 2` was
applied to each route. **10 routes including `/login`, 0 overflow failures.**

**Actual browser 200% zoom — UNPROVEN.** Browser zoom is a browser-chrome
setting with no page-reachable API (`visualViewport.scale` reads 1 and nothing
in the page can change it); the Browser pane exposes width, height and colour
scheme but no zoom control, and the desktop-level input tool is policy-blocked
from operating browser chrome. The CSS-zoom result above is an approximation and
is not offered as equivalent evidence.

**1.4.10 Reflow remains satisfied separately** by the 320 CSS px matrix, which is
the condition the criterion actually states.

## Focus Not Obscured (2.4.11)

Every focusable control on the long mobile pages was focused in turn at 375px
and its box compared against the fixed bar's box: `/projects/new` (11),
`/staffing` (5), `/skills/my` (5), `/skills/categories` (7),
`/organization/invite` (5), `/organization/departments/{id}` (8),
`/organization/team-roles/{id}` (6), `/projects/{id}/team-finder` (4). **52
controls walked, 0 obscured.** Focus was moved programmatically; the geometry
being measured is real.

## Role matrix

Six actors, each signed in separately — none inferred from the multi-role user.

| Actor | Navigation union | Notable |
| --- | --- | --- |
| Employee | Home · Projects · Skills | every privileged route refused |
| Project Manager | + Staffing | `/projects/new` and `/projects/{id}/edit` granted; Skills admin, People, Organization refused |
| Department Manager, appointed | + Staffing · People | `/people` **granted**; Skills authoring granted; Organization refused |
| Department Manager, no appointment | same five | `/people` shows **no-appointment**, not a refusal and not an outage; Skills authoring still granted |
| Organization Admin | Home · Projects · People · Skills · Organization | all Organization routes granted; Skills catalogue admin refused |
| EMPLOYEE + PM + DM + OA | all six | `/projects/{id}/edit` still **refused** — that project belongs to another manager, so relationship authority outranks the role union |

The appointed/unappointed pair is the load-bearing one: the same navigation, a
different answer at `/people`, and the difference stated as an appointment rather
than as a failure.

## Long content

Seeded through the real API and measured in real viewports. Three defects, all of
one kind: **free text that the backend accepts without spaces in it**, which the
default `overflow-wrap` will not break, so the value sets the document's width
instead of wrapping inside its own box.

| Stressor | Where | Before | After |
| --- | --- | --- | --- |
| 5000-character removal reason, one token | `/staffing` @1280 | 41283px | viewport width |
| 2000-character project description, one token | `/projects/{id}` @320–1440 | ~20076–20324px | viewport width |
| 80-character technology value | `/projects/{id}/team-finder` @320 | chip 377px in a 320px viewport | wraps in the pill |

Also seeded and clean at 320 / 768 / 1440: a 70-character department name, an
81-character team-role name, an 80-character project name, and eight technology
chips — `/projects`, `/skills`, `/organization/departments`,
`/organization/team-roles`, **12 checks, 0 failures**.

Team Finder was exercised with a candidate carrying **12 declared skills** plus
the long project and role names: no page overflow at 320px, the long project
name renders in full, and there are **zero `title` attributes** on that screen,
so no evidence is hover-only.

## Forms (3.3.x) and status messages (4.1.3)

Every field across `/forgot-password`, `/projects/new`, `/skills/categories`,
`/organization/team-roles/new` and `/organization/invite` has a programmatic
label: **0 unlabelled fields**. Error wiring (`aria-invalid` + `aria-describedby`)
is present in every form component that carries field errors.

4.1.3 was already correct and needed no change: the shared `Alert` primitive
computes `role="alert"` for `danger` and `role="status"` for every other tone, so
each mutation confirmation is announced politely and each failure assertively —
without a live region being remembered at fourteen call sites.

## Error suggestion (3.3.3) — disposition

Reviewed against the product's real validation messages rather than in the
abstract. Two classes, and they get different answers:

**Correctable by the user — the message names the correction.** `Enter a project
name.`, `Enter a category name.`, `Choose a category.`, `Choose a status.`,
`Choose a team role.`, `Enter a start date.`, `Enter a valid date.`,
`Enter how many people are needed — at least 1.`, `Password must be 8–72
characters.`, `The deadline cannot be before the start date.` Each states the
required field, the required format or the bound, which is what 3.3.3 asks for.

**Business conflicts where no deterministic correction exists — documented as
not applicable.** A duplicate name (409), `Choose an active category.` when the
target was retired underneath the author, and the sign-in failure, which is
deliberately identical for unknown email, wrong password, inactive and locked so
the form cannot be used to discover which addresses exist. Inventing advice here
would either be wrong or would leak the thing the ambiguity protects. 3.3.3 is
advisory-where-known, and these are recorded as not applicable rather than
silently skipped.

## Label in Name (2.5.3)

Every control carrying both visible text and an `aria-label` was compared:
**5 controls, 0 divergences.**

## The staffing defect in detail

A 5000-character removal reason with no spaces in it — inside the backend's
contract, and what a pasted identifier or URL looks like — did not wrap. The
reason renders in a bare `<p>` at `overflow-wrap: normal`, so at 1280px the
document stretched to **41283px**. 320 and 768 were unaffected, which is why
narrower testing had missed it.

The three free-text fields in `ReviewDetail` (proposal comments, removal reason,
review rejection reason) now carry `overflow-wrap: anywhere` with
`white-space: pre-wrap`. Re-measured at 320 / 768 / 1280 / 1440: document width
equals viewport width at every one, the full 5000 characters remain present, and
Accept/Reject stay reachable. A regression pins it and was confirmed failing
against the unclassed paragraph first.

## Frontend CI — added after FE-13

FE-13's gates were local only, and this document said so throughout. That is no
longer the operational state, and the note is placed here rather than woven into
the sections above so the record stays accurate about *when* it became true:
during PR #92 there was no frontend CI.

Added afterwards in PR #93: `.github/workflows/frontend-ci.yml`, job
`frontend-verify`, blocking on typecheck → lint → the full Vitest suite →
production build, from a clean Node 22 runner on every pull request and push to
`main`. Its first run reported the same totals this document records locally:
**1119 tests / 68 files**.

`npm audit` is not one of those gates. At that time the tree carried 4 high and
1 critical, so a blocking audit step would have made the workflow permanently
red. SEC-01 has since cleared the critical and both dev-tree highs; three high
findings remain behind a Next 16 major migration, so the gate is still not
added. See the architecture README for the current state.

## Remaining gaps

- **Real keyboard operation and real Escape.** The environment cannot deliver
  activating key events to a browser: the in-app browser's synthetic keys reach
  JavaScript but carry no default actions — a synthetic Enter on a focused
  `<button>` produced **zero** clicks — and the desktop-level input tool is
  policy-blocked from typing into browsers. Needs a human at a real keyboard.
  **2.1.1, 2.1.2 and 2.4.3 remain unaudited** as a result.
- **Actual browser 200% zoom** — unproven for the reason given above. The
  CSS-zoom approximation passed; 1.4.10 is satisfied separately by the 320px
  matrix.
- Organization display-name backend gap; the name is omitted rather than invented.
