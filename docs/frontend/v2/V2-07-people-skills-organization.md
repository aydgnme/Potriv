# V2-07 — People, Skills & Organization

Base: `v2` at `096b0fac56c110f8b44c7d1e6a629fd36eb1c5e9` (after PR #102).

The slice that makes Potriv's organizational model legible: what a role grants,
where a person belongs, who is accountable for a department, who owns a skill,
and which of those are the same thing (none of them).

The four modules were already semantically correct. V2-07 did not rewrite them.
What changed is density — four surfaces became first-class tables — and the tests
that pin the authority model against the flattenings that look tidier.

---

## 1. The authority model

Six distinct things that are routinely confused:

| Concept | What it grants | What it does **not** |
|---|---|---|
| **Access role** | which workflows a person may use | membership, appointment, ownership |
| **Department membership** | where a person belongs organizationally | any access role |
| **Manager appointment** | accountability for **one** department | the `DEPARTMENT_MANAGER` role itself |
| **Skill authorship** | mutating that skill's content and state | department links |
| **Project ownership** | managing that project | managing every project |
| **Team role** | project staffing vocabulary | any permission at all |

And three role-specific truths:

```
DEPARTMENT_MANAGER role  != manager of a department
PROJECT_MANAGER role     != manager of every project
ORGANIZATION_ADMIN       != universal superuser
```

The last one is the least intuitive and the most load-bearing: an organization
admin has **no skill-authoring authority** unless they separately hold
`DEPARTMENT_MANAGER`.

### Proven live

```
role without appointment   GET /department/project-proposals -> 403
after PUT .../manager      GET /department/project-proposals -> 200
after DELETE .../manager   GET /department/project-proposals -> 403
roles after removal:       [DEPARTMENT_MANAGER, EMPLOYEE, ORGANIZATION_ADMIN, PROJECT_MANAGER]
```

The role survives the appointment being removed. Review authority does not.

---

## 2. People

### Scopes, not modes

`/people` asks two different questions of two different endpoints:

| Scope | Requires | Endpoint |
|---|---|---|
| Organization | `ORGANIZATION_ADMIN` | `GET /users` |
| My department | `DEPARTMENT_MANAGER` **+ appointment** | `/department/projects` → members + unassigned |

They are labelled *Organization* and *My department* — never "Admin mode". An
unauthorized `?view=` is normalized **before** any privileged endpoint is called,
so capability never depends on reading a 403.

### Department load order

```
GET /department/projects        → the exact managed department id
  only if that succeeded, in parallel:
    GET /departments/{id}/members
    GET /departments/unassigned-employees
```

The department id is never derived from the role, the URL or the organization
list. A `DEPARTMENT_MANAGER` with no appointment gets a setup state and **no
member calls at all** — there is no id to call them with.

### Membership

```
POST   /departments/{departmentId}/members/{userId}
DELETE /departments/{departmentId}/members/{userId}
```

Verified live: add returns **200** (not 201), is idempotent on repeat, and
answers **409 "User already belongs to another department"** rather than moving
anyone. Removal returned 204 and the person's roles were `[EMPLOYEE]` before and
`[EMPLOYEE]` after — membership and access roles never move together.

There is no delete-old-then-add-new "move". No such transaction exists.

### Person detail

`/people/[userId]` is `ORGANIZATION_ADMIN` only, checked before fetching. A
department manager does not gain it by managing somebody. The contract carries
`userId, name, email, roles, createdAt, updatedAt` — and nothing else. No
department, projects, skills, availability, job title, seniority, location or
avatar is invented.

### Access roles

`EMPLOYEE` is baseline: selected and locked, because the backend re-adds it and a
removable checkbox would be the UI lying about what will be saved. `SYSTEM_ADMIN`
never appears in the ordinary product editor.

Self-editing is blocked, with one exception matching the backend exactly: while
the organization has **one** member and that member is already an organization
admin, they may **add** `DEPARTMENT_MANAGER` or `PROJECT_MANAGER` to themselves.
Additive only; it closes the moment a second person exists.

Verified live:

```
add DM+PM to self            -> 200
drop ORGANIZATION_ADMIN      -> 400  "you can only add roles to your own account, not remove them"
self-grant SYSTEM_ADMIN      -> 400  "Only system admins can assign SYSTEM_ADMIN role"
```

The last organization admin's role is locked; it unlocks once a second admin
exists.

---

## 3. Skills

### Reading is for everyone

`/skills` is readable by every authenticated member. There is no admin gate on
the shared vocabulary.

### Search truth

```
GET /skills?q=&categoryId=&includeInactive=
```

`q` is a **case-insensitive contains match on the skill name only**. Not fuzzy,
not semantic, not AI, not a description or author search — and the screen says
so. Backend order (category name, then skill name) is preserved.

Filters are shareable URL state: `q` trimmed and omitted when blank, category
validated against the effective set and collapsed to All when unknown, and only
the literal `true` enables inactive mode.

The loader is deliberately sequential — categories first, then normalize, then
skills — so the filter shown can never disagree with the request made.

### The four skill authorities

```
read the catalogue        every authenticated member
author catalogue entries  DEPARTMENT_MANAGER role — appointment NOT required
mutate a skill's content  the skill's own author, and nobody else
link a department         DEPARTMENT_MANAGER role AND a real appointment
```

Verified live with an appointed manager who did not write the skill:

```
edit the author's skill      -> 403  "Only the skill author can modify this skill."
link their own department    -> 200
create their own category    -> 201
author edits own skill       -> 200
```

Authorship and department-link authority are orthogonal. A lookup failure fails
the link control **closed** without asserting the person has no appointment —
`unassigned` and `error` stay separate states.

### Soft state, verified live

| Action | What survives |
|---|---|
| retire category | skill stays `active: true`; assignments survive |
| retire skill | assignment survives, marked `catalogue active: false` |
| delete own assignment | catalogue skill still readable (200) |

Retirement never cascades. An inactive skill cannot take a **new** department
link but an existing one can still be removed, so retiring never traps a
department in a relationship it cannot end.

`SkillCategoryRef` carries only `categoryId` and `name` — a catalogue skill has
no view of its category's state. The contract itself makes the cascade
impossible.

### My skills

Self-scoped only (`/me/skills`); there is no target user id and no "edit another
person's skills" anywhere in People.

Exact vocabulary, no inference: `LEARNS/KNOWS/DOES/HELPS/TEACHES` and the six
experience buckets. Verified live rendering `Does · 2-4 years` and `TEACHES`.

**Level and experience are self-reported context, not a rating.** Zero
`progress`, `meter`, star or rating elements on the page — asserted in the
browser. Team Finder does not weight them (V2-05).

---

## 4. Organization

Administration routes are `ORGANIZATION_ADMIN` only, checked before any
privileged read.

The overview asks two independent questions in parallel — `GET /departments` and
`GET /organizations/current/invite` — and a failure in one leaves the other
usable. There are no authoritative fields for plan, billing, seats, health,
utilization or analytics, so none are shown.

Departments expose `departmentId, name, manager|null, memberCount, createdAt,
updatedAt`. The only editable content is `name`. Delete is 204, or 409 when
dependencies prevent it — never optimistic.

### Manager appointment

One manager per department, one department per manager, no co-managers — so the
picker is select-one, never multi-select. A candidate must already hold
`DEPARTMENT_MANAGER`; the role is never granted as a side effect of appointing.

Removing the appointment removes **only** the appointment. The role remains, and
the real consequence is stated: staffing requests for that department cannot be
reviewed until another manager is appointed.

### Invite security

`/organization/invite` is admin-gated **before** the invite is fetched — anyone
holding the URL can join as an employee.

Verified live: the invite URL appears on the admin invite page and on **zero**
other surfaces (`/home`, `/people`, `/skills`, `/organization` all 0). Employee
invites genuinely carry `expiresAt: null`, so no countdown is invented.

Rotation is destructive in effect, and was proven so:

```
rotate                    -> 200
register with OLD token   -> 400
register with NEW token   -> 201
```

### Team roles

Project staffing vocabulary, **not** access roles. Admin routes are
`ORGANIZATION_ADMIN` only; a project manager's ability to *read* the collection
in project workflows does not grant the admin screens. `DELETE` is soft
deactivation, and inactive roles stay resolvable because existing project
requirements reference them.

---

## 5. Request budgets

| Route / state | Calls |
|---|---|
| `/people` organization | 1 (`GET /users`) |
| `/people` department, ready | 3 (`/department/projects`, then members + unassigned in parallel) |
| `/people` DM without appointment | 1 — no member calls without a department id |
| `/people/[userId]` | 2 in parallel (`/users/{id}`, `/users`) |
| `/skills` | 2 sequential (categories, then skills) |
| `/skills/my` | 1 |
| `/skills/[id]` | 2 in parallel, plus the managed-department lookup only when DM capability needs it |
| `/organization` | 2 in parallel |

No per-person, per-department, per-skill or per-team-role enrichment anywhere.

---

## 6. What changed visually

Four surfaces became first-class tables (§73), all confirmed rendering as
`display: table` on desktop and `display: block` labelled records at ≤767px:

- **Department members** and **unassigned employees** — Person · Access roles · Membership
- **Skill catalogue** — Skill · Category · State · Departments
- **My skills** — Skill · Category · Level · Experience · Actions

My Skills needed the `form` attribute association: a `<form>` cannot wrap the
children of a `<tr>`, so the form lives in the last cell and the selects join it
by id. One row is still one submission, without breaking table semantics.

Membership buttons use `aria-label` rather than visible-plus-hidden text — the
accessible-name computation trims each text node, so `Add` + ` Bo…` had produced
`AddBo…`. A test caught it.

---

## 7. Responsive and accessibility

Seven surfaces × seven widths, **49/49 clean** — zero page-level horizontal
overflow at any width:

```
              320  375  390  768  1024  1280  1440
people         ok   ok   ok   ok    ok    ok    ok
people_dept    ok   ok   ok   ok    ok    ok    ok
skills         ok   ok   ok   ok    ok    ok    ok
skills_my      ok   ok   ok   ok    ok    ok    ok
organization   ok   ok   ok   ok    ok    ok    ok
departments    ok   ok   ok   ok    ok    ok    ok
team_roles     ok   ok   ok   ok    ok    ok    ok
```

Every table collapses to labelled records with `data-label` prefixes intact —
nothing is dropped to fit. One `h1` per surface. **Zero** `div`/`tr`/`span` click
targets across all seven.

### Stated limitations

- **Keyboard default actions were not exercised.** The harness delivers key
  events to JS listeners but performs no browser defaults, so Enter/Space/Escape
  could not be pressed for real. Verified instead that every control is a native
  element the browser supplies those defaults for.
- **The browser snapshots do not hydrate** — they are server-rendered HTML with
  CSS applied, served from a second origin, so React never attaches. They are
  authoritative for layout, reflow and structure, and **not** for interaction.
  Interactive behaviour is covered by `userEvent` tests in jsdom.
- **Real 200% browser zoom was unavailable; narrow-width reflow was tested
  instead.**

---

## 8. Live verification and secret safety

Local backend only (`localhost:8080/api`, from `apps/backend/target/classes`).
Production was never targeted.

**Secret values were never printed to stdout.** Not redacted — never emitted.
Access tokens and the organization invite token were parsed into `chmod 600`
files by python and passed to curl by reference; no `echo`, `cat`, `grep` or
`sed` ever handled one. The cookie jar was written with `-c` and used with `-b`,
never read back. Every request reported `%{http_code}` with the body to
`/dev/null`, or had it parsed by python printing only explicitly named non-secret
fields. All fixtures were deleted afterwards.

---

## 9. Deliberately not changed

- The backend — no contract defect found; frontend-only slice
- Home, Projects, Team Finder, Staffing, public/auth pages, dev console
- People/Organization module boundaries: Organization keeps its own narrowed
  `/users` contract for manager choices rather than importing People internals
- No search added to People, Organization or Team Roles — only Skills has a real
  server-side search contract
- No new dependency

---

## 10. Production isolation

`main` was not modified. PR base is `v2`. `origin/main` remained
`3298c1cf079683033157500829a929caba08bd57` throughout.

No Git merge/update was made to `main`; external deployment behavior was not
independently observable. Neither `v2` nor `main` has branch protection, and no
repository settings were changed.

---

## 11. Next slice

```
V2-08 — Account, History, Portfolio & System States
```
