# V2-03 — Product shell and Home

The first authenticated V2 slice: the product frame and Home given the same
language as the public pages, and the founder setup guidance that V2-02
deliberately postponed to here.

Base: `3298c1cf079683033157500829a929caba08bd57` on `main` (PR #97 merge).
Branch: `feat/potriv-v2-product-shell-home`.
Frontend baseline: 1228 tests / 73 files. Backend untouched.

---

## 1. Shell architecture — unchanged where it mattered

Refined, not replaced. Every guarantee the existing shell had is intact:

```
ProtectedLayout → resolveProductSession() → getNavigationItems(roles)
  → AppShell → ProductNavigation → Sidebar + MobileNavigation
```

- `AppShell` still fetches nothing and takes everything as props
- `ProductNavigation` is still the only client boundary, and only because
  `usePathname` is the supported way to know the current route
- role composition still happens on the server; the client receives ids
- collapse remains local UI state, unpersisted
- account actions remain a slot, so `shared` still imports no product module
- organization name remains optional and is still **not** rendered — the session
  carries an organization id, and a UUID is not a name

`MobileNavigation.tsx` was not modified at all in this slice.

### What changed visually

| File | Change |
| --- | --- |
| `Sidebar.module.css` | rail sits on canvas with one hairline instead of a raised panel; wordmark matches the public V2 mark; active item gets `--p-brand-soft` plus a 2px leading marker |
| `AppShell.module.css` | canvas ground; wider padding above 1280 |
| `Home.module.css` | sections separated by rules rather than boxed as cards; setup step styles |

**No max width was added to `AppShell`.** Home wants a measured column and a
future Team Finder wants the viewport, so that constraint belongs to the page.
Putting it in the frame would mean rewriting the shell for the first workbench.

The active state is carried by a structural marker *and* `aria-current`, not by
hue alone.

## 2. Founder setup signal table

| Step | Meaning | Endpoint | Authorized | Truthful? | Decision |
| --- | --- | --- | --- | --- | --- |
| Workspace created | organization exists | none | — | inherent from an authenticated organization context | not shown as a step; no request added |
| Department exists | `length > 0` | `GET /departments` | ORG_ADMIN | yes | implemented, already loaded |
| Team roles exist | `length > 0` | `GET /team-roles` | ORG_ADMIN or PM | yes | implemented, **+1 request** |
| Skill catalogue exists | `length > 0` | `GET /skills` | any org member | yes | implemented, **+1 request** |
| Team brought in | another member joined | `GET /users`, `length > 1` | ORG_ADMIN | yes, for *joined* | implemented, already loaded |
| First project exists | organization has a project | **none** | — | **no** | **UNKNOWN** |

### Why first-project is UNKNOWN

There is no organization-wide project read. `GET /projects/managed` returns
projects the caller manages, and `GET /me/projects` returns projects they are on.
An administrator who manages nothing and is staffed on nothing would be told a
busy workspace has no projects.

Deriving completion from either would be a lying checkmark; asserting the
opposite would be a different lie. The step is rendered as an action with no
completion claim, a dashed marker, and the sentence *"Completion is not tracked
for this step."* — said in words rather than left to a symbol.

No backend endpoint was added to obtain it. That is a V2-04+ decision.

### Four states, because two of them mean opposite things

| State | Meaning | Blocks `settled`? | Copy |
| --- | --- | --- | --- |
| `done` | a real read proved it complete | no | "— done" |
| `todo` | a real read proved it incomplete | yes | (none needed) |
| `unknown` | **no signal exists at all** | **no** | "Completion is not tracked for this step." |
| `unavailable` | a signal exists, the read did not answer | **yes** | "Status could not be checked right now." |

`unknown` is permanent — there is no organization-wide project read and there
never has been — so holding it against the workspace would mean `settled` could
never be true. `unavailable` is temporary: the question is answerable and we did
not get the answer, so claiming the basics are in place would assert something
nobody checked.

They were briefly conflated, which made a failed `/departments` read say
"Completion is not tracked for this step" — describing a permanent hole in the
product to explain a momentary one in the network. They are now separate states
with separate copy, and neither is styled as an error: a read that did not
answer is not the founder's problem to fix, and the action stays available.

There is no percentage, no score and no "n of five". The backend has no concept
of workspace completeness.

## 3. Home hierarchy

```
Home  ·  Welcome back, [name].

Pending staffing reviews      DEPARTMENT_MANAGER   ← another person is blocked
Projects you manage           PROJECT_MANAGER
Department projects           DEPARTMENT_MANAGER
Organization setup            ORGANIZATION_ADMIN
Set up your workspace         ORGANIZATION_ADMIN   ← guidance, below real work
My current work               everyone
My skills                     everyone
```

Setup guidance sits **below** operational sections. A founder with staffing
requests waiting has work that outranks onboarding.

Sections are separated by rules rather than boxed — six bordered panels read as
six unrelated widgets, and Home is one ordered answer to "what needs me?".

## 4. Request budget

| Role | Base | Role-gated | Bounded enrichment | Setup | Total |
| --- | --- | --- | --- | --- | --- |
| EMPLOYEE | 2 | 0 | 0 | 0 | **2** |
| PROJECT_MANAGER | 2 | 1 | ≤5 | 0 | **≤8** |
| DEPARTMENT_MANAGER | 2 | 2 | 0 | 0 | **4** |
| ORGANIZATION_ADMIN | 2 | 2 | 0 | 2 | **6** |
| multi-role | 2 | 5 | ≤5 | 2 | **≤14** |

Base is `/me/projects` and `/me/skills`. Setup reads (`/team-roles`, `/skills`)
happen **only** for an organization admin, because only they see the guidance.
Staffing enrichment stays capped at `STAFFING_ENRICHMENT_LIMIT = 5`; a project
without details reports "staffing not checked" rather than a zero nobody paid
for. No N+1 was introduced.

## 5. Role scenarios

| Composition | Result |
| --- | --- |
| EMPLOYEE | My current work + My skills only; manager panels absent, not empty |
| + PROJECT_MANAGER | adds Projects you manage; no review queue |
| + DEPARTMENT_MANAGER, appointed | review queue first |
| + DEPARTMENT_MANAGER, **no appointment** | truthful no-authority copy; **no** error language |
| + ORGANIZATION_ADMIN, fresh workspace | setup guidance with real next actions |
| all four | 7 sections, no duplicates, no role switcher |

Verified live with a four-role account: section order correct, `duplicates:
false`, one `h1`, zero `select`/`combobox`, and no "something went wrong"
language anywhere on a page whose department reads returned 403.

`FORBIDDEN` and `ERROR` remain distinct — a manager without an appointment is
told they manage no department; a real outage is reported as one.

## 6. Responsive matrix

| Width | Surface | Overflow | Setup row |
| --- | --- | --- | --- |
| 320 | mobile bar | 0 | 1 column |
| 375 | mobile bar | 0 | 1 column |
| 390 | mobile bar | 0 | 1 column |
| 768 | sidebar | 0 | 1 column |
| 1024 | sidebar | 0 | 3 columns |
| 1280 | sidebar | 0 | 3 columns |
| 1440 | sidebar | 0 | 3 columns |

Zero page-level horizontal overflow and zero elements past the viewport edge at
every width. Sign-out reachable at all seven.

**No duplicate focusable navigation**: at desktop the mobile bar is
`display: none` (0 focusable descendants); at mobile the sidebar is
`display: none`. Measured, not assumed.

Bottom-bar clearance was re-measured **after scrolling to the true page
bottom** — an earlier check at scroll 0 reported a false positive. Last section
bottom 820px against a bar top of 843px at 320.

## 7. Six-domain mobile pressure

A four-role account exposes all six domains. The bar renders **four plus More**:

```
Home · Projects · Staffing · People · [More]
More → Skills · Organization · Sign out · Close
```

Targets are 64×56. `aria-current="page"` on Home. The closed sheet has **0
focusable descendants**. Opened, it is a true `:modal` dialog and focus moves
inside.

## 8. Accessibility

One `h1`; `h2` per section; `nav` landmark; `aria-current` on the active
destination; skip link preserved with `main` still `tabIndex={-1}`.

Setup markers are decorative (`aria-hidden`) with the state in text — `done`
adds a visually-hidden "— done", `unknown` adds "— not tracked" plus a visible
sentence. No state is carried by colour or symbol alone.

### Keyboard — what was and was not verified

Clicks, focus movement and the overflow sheet were exercised directly.

**Escape on the mobile sheet could not be verified.** A real `Escape` was
injected and *was observed reaching the document* (`keydown` listener fired),
but no `cancel` event followed and the dialog stayed open. For a `showModal()`
dialog, Escape-to-close is a browser *default action*, and this environment
delivers key events to JS without their default actions — the same limitation
recorded in FE-13, now with sharper evidence. This is neither a pass nor a
failure, and `MobileNavigation` is unchanged by this slice either way.

Tab order across the sidebar was likewise not driven by real key presses.

## 9. Regression smoke

`/home`, `/projects`, `/skills`, `/staffing`, `/people`, `/organization` all
return 200 under the refined shell. `/projects` inspected visually at 1440: page
header, scope tabs, status filters and empty state intact, active nav correct,
no clipping and no padding regression. Domain content was not redesigned.

## 10. Tests

1228 → **1241+** across 73 → 75 files. New: `workspaceSetup.test.ts` (13 cases
on truthfulness), plus Home scenarios for fresh workspace, unmanaged-department
warning surviving a completed setup step, unknown first-project, setup source
failure, and a department manager without appointment.

Both truthfulness invariants were mutation-checked: deriving first-project
completion fails 3 tests, and treating a failed read as outstanding fails 3.

## 11. Deliberately deferred

- organization display name — no contract provides it; the shell is built to
  accept one later
- first-project completion — needs an organization-wide project read that does
  not exist
- Projects, Team Finder, Staffing, People, Skills and Organization page content
- real keyboard and Escape verification, pending an environment that delivers
  default actions

## 12. Next

**V2-04 — Projects.**
