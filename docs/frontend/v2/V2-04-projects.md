# V2-04 — Projects

Projects in the V2 product language: an operational portfolio and project
workspace, not a card gallery and not an analytics dashboard.

The domain was already semantically sound when this slice began — FE-04, FE-05
and FE-12 built truthful scopes, anti-leak refusals and real empty states. V2-04
did **not** rewrite it. What changed is the visual grammar, one missing product
fact (proposals on the project page), and one cross-slice correction that a
backend audit forced.

---

## 1. The founder authority audit

The prompt asked two questions before any code was written.

### Can `ORGANIZATION_ADMIN` create a project without `PROJECT_MANAGER`?

**No.**

`ProjectController` is annotated `@ProjectManagerOnly`, which resolves to:

```java
@PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'PROJECT_MANAGER')")
```

`ORGANIZATION_ADMIN` is not in that set. `POST /projects` answers 403.

### Can a fresh workspace founder complete "Create your first project"?

**Yes — but only through a prerequisite step, and only inside a window that
closes.**

`AuthRegistrationService` grants a new founder exactly two roles:

```java
userRoleRepository.save(new UserRole(admin, AccessRole.EMPLOYEE));
userRoleRepository.save(new UserRole(admin, AccessRole.ORGANIZATION_ADMIN));
```

So a founder lands in the product entitled to administer the organization and
not to manage projects. Those are separate authorities and the backend keeps
them separate.

The way out is real. `UserRoleManagementService.requireSoloOrganizationSetup`
carries a deliberately narrow exception: while the organization contains exactly
one user, that user may add `DEPARTMENT_MANAGER` or `PROJECT_MANAGER` to their
own account.

```java
private static final EnumSet<AccessRole> SELF_ASSIGNABLE_SETUP_ROLES =
    EnumSet.of(AccessRole.DEPARTMENT_MANAGER, AccessRole.PROJECT_MANAGER);
```

It is additive only, cannot touch `SYSTEM_ADMIN`, cannot drop
`ORGANIZATION_ADMIN` or `EMPLOYEE`, and **closes the moment a second person
exists** — `userRepository.countByOrganization_Id(organizationId) != 1` rejects
it, and `verifyStillSoloAfterWrite` re-checks after the write.

Verified live against a local backend: a freshly registered founder held
`[EMPLOYEE, ORGANIZATION_ADMIN]`, `PATCH /users/{self}/roles` returned 200 with
`[EMPLOYEE, ORGANIZATION_ADMIN, PROJECT_MANAGER]`, and `POST /projects` then
returned 201.

### What this cost V2-03

The Home setup checklist pointed "Create your first project" at
`/projects/new` unconditionally. For the founder it is aimed at, that is a step
that cannot be completed by following it — the exact defect a setup checklist
must never contain.

The correction is narrow and does not touch the four-state setup model:

- `buildWorkspaceSetup` takes `canCreateProject`.
- Without the role, the step's action becomes **"Get the Project Manager role" →
  `/people`**, and the rationale names both the role and the window:
  *"Creating a project needs the Project Manager role, which this account does
  not have. While you are the only member you can add it to yourself from
  People."*
- With the role, it is **"Create project" → `/projects/new`**, unchanged.
- The step's state stays `"unknown"` either way. No organization-wide project
  read exists, and create authority is not a completion signal.

`/projects/new` itself no longer dead-ends. An organization admin is told the
real path; anybody else still gets the plain capability refusal, because for
them the solo-founder route does not exist.

---

## 2. Visual language

V2-03 established the product grammar on Home: sections separated by a rule,
containment spent only where it means something. Projects stacked seven or more
bordered cards per page, which reads as unrelated widgets rather than one
project.

`.panel` was redefined from a boxed card to a rule-separated section. The name
stayed because it is the same section in every view — what changed is what a
section looks like, not what one is. Containment is kept for the genuine
decision surfaces: form fieldsets, the dialog, the delete panel.

Other changes:

- `.detailColumns` is now `3fr / 2fr` and collapses at ≤1023px. The detail page
  is read; the list and team pages stay wide.
- One dominant action per view. `New project` is a weighted link
  (`.primaryAction`); everything else stays a plain link.
- `/projects/new` gained the breadcrumb it was missing.
- `/projects/{id}/edit` breadcrumb says **Edit**, matching its route, instead of
  "Settings".

No shared primitive was modified, so no other domain's styling could move.

---

## 3. Relationship grammar

The landing diagram teaches **dashed = proposed, solid = accepted**. That
distinction now holds inside the product:

| Group | Border | Token |
|---|---|---|
| Proposed | 2px **dashed** | `--p-border-strong` |
| Active | 2px **solid** | `--p-brand` |
| Past | 2px solid | `--p-border` |

Past is deliberately outside the pair: it is settled, not pending, and no longer
part of the proposal-to-allocation sequence the two patterns describe.

The pattern is never the only signal. Each group states what it is:

- Proposed — "Waiting on a department manager's decision. Nobody here is
  allocated yet."
- Active — "Accepted allocations. These people are on the project now."
- Past — "Allocations that have ended. Kept as evidence of who did the work."

---

## 4. Requirement coverage

The overview previously showed `1 / 3 filled` and `2 positions open` per role.
It never mentioned proposals at all, because `/details` carries none — so a
manager could look at the canonical project page while two candidates sat
waiting on a department decision and see nothing.

The overview now loads `/details` **and** `/team` — two fixed requests, run
together, not one per requirement and not one per row — and renders:

```
Team role            Needed  Active  Proposed  Open
Backend Engineer          3       0         0     3
```

The rule that governs the whole table: **`Open` is `Needed − Active` and never
subtracts proposals.** A proposal is not an allocation; a role needing three
people with two proposed still has three positions to fill. Subtracting them
would tell a manager the work is nearly done on the strength of decisions
nobody has made. The table says so in words underneath.

If `/team` fails, `Proposed` shows `—`, never `0`: "nobody checked" and "nobody
was proposed" are different facts. The requirements and the active team survive,
because one failed request must not discard the answer the other one gave.

There is no percentage and no staffed score. The backend has no such concept.

---

## 5. Request budget

| Route | Requests | Notes |
|---|---|---|
| `/projects` — Mine | 1 | `/me/projects`; status filtered server-side, no param exists |
| `/projects` — Managed | 1 + N | `/projects/managed`, then one `/details` per row at concurrency 5 |
| `/projects` — Department | 1 | `/department/projects` |
| `/projects/{id}` | **2** | `/details` + `/team`, in parallel |
| `/projects/{id}/team` | 2 | `/team` + `/details` (ownership) |
| `/projects/{id}/edit` | 2 | `/projects/{id}` + `/team-roles?includeInactive=true` |
| `/projects/new` | 1 | `/team-roles` |

The Managed fan-out predates this slice and is unchanged. It is bounded by
concurrency, every row is attempted, and a row whose request failed reports
`Staffing unavailable` rather than `0`. No row fetches a detail to decorate
itself with a manager name, department or timeline.

---

## 6. Scopes

Unchanged, and deliberately so. `Managed`, `Department`, `My projects` are
**data scopes**, not personas — the backend authorises against the whole role
set on every request, so a UI claiming to switch role would constrain nothing.

- A scope the roles do not grant is never rendered and never fetched.
- `DEPARTMENT_MANAGER` with no appointment gets an authority state — "You are
  not managing a department yet" — not an outage.
- There is no "All projects". No ordinary-product endpoint returns every project
  in the organization.

---

## 7. Anti-leak

Unchanged and re-verified live. `/projects/{id}`, `/team` and `/edit` all answer
with one sentence:

> This project does not exist or is not visible to you.

404 and 403 collapse to it deliberately. `/details` answers 403 to a caller
holding `DEPARTMENT_MANAGER` while managing no department, and 404 to an
unrelated employee; two sentences would turn that into an existence oracle.
Nothing in the refusal names a project, manager or status.

---

## 8. Deliberately not changed

- **Team Finder internals.** Routing, breadcrumb and handoff only. Candidate
  table, ranking, evidence and proposal semantics belong to V2-05.
- **Staffing.** Projects shows proposal state; department review and allocation
  transitions stay in Staffing.
- **The Managed staffing fan-out.** Pre-existing, bounded, and the figure is
  operationally load-bearing.
- **Shared primitives**, People, Skills, Organization, dev console, backend.
