# 02 — Roles, capabilities and multi-role UX

Combines Phase 3 (role analysis and the role × capability matrix) and Phase 8
(multi-role UX), because the matrix is the input the multi-role design consumes.

`SYSTEM_ADMIN` is **not** profiled here. It has a separate server-rendered
console and is out of scope for the product frontend
([00-repository-reality.md](00-repository-reality.md) §10).

---

## Employee

The default role. Every user has it or behaves like it; `@EmployeeOnly` means
"authenticated".

| Question | Answer |
| --- | --- |
| **Primary goals** | Know what they are working on; keep their skill profile accurate enough that Team Finder finds them for the right work. |
| **Immediately after login** | Current projects with their role and daily hours on each; anything about to end; whether their skill profile has gaps. |
| **Daily actions** | Realistically none. This is a low-frequency role — most employees open Potriv when something changed. |
| **Occasional actions** | Add or update a skill; check a project's team; review past projects; manage sessions; change password. |
| **Should never see** | Other people's skill profiles as editable; the user list; department administration; anything under `/admin/**`; any proposal decision control. |
| **Highest-risk mistakes** | Deleting a skill they meant to edit (`DELETE /me/skills/{id}` is immediate and unconfirmed by the API); revoking their own current session by mistake — `SessionResponse.currentSession` exists precisely so the UI can prevent this being a surprise. |
| **Needs more context before confirming** | Removing a skill: show what it is and that it will disappear from Team Finder matching. |
| **Surface prominently** | A project ending soon (derivable from `deadlineDate` on current projects); an empty or thin skill profile. |
| **Backend workflows** | `GET /me/projects`, `GET/POST/PATCH/DELETE /me/skills`, `GET /skills`, `GET /skill-categories`, `GET /projects/{id}/details`, `GET /projects/{id}/team`, `/auth/*` session and password operations. |
| **Dashboard priority** | 1) current projects, 2) skill profile state, 3) recent history. Nothing else — this role has no queue. |

**Design note.** The employee has no pending work in the system. A dashboard
built around "tasks waiting for you" would be permanently empty for them, so
their home is a *status* page, not a queue.

---

## Organization Admin

Owns the structure the rest of the product operates inside.

| Question | Answer |
| --- | --- |
| **Primary goals** | Get people into the organization, into departments, and into the right roles. Keep the shared vocabulary — team roles, skill catalogue — usable. |
| **Immediately after login** | Whether the invite link is active (it never expires — §C-14); who has arrived but has no department; who has no role beyond `EMPLOYEE`; which departments have no manager. |
| **Daily actions** | In a settled organization, close to none. In the first weeks: invite, assign roles, create departments, appoint managers. |
| **Occasional actions** | Rotate the invite link; create or rename departments; grant/revoke roles; maintain team roles. |
| **Should never see** | `/me/skills` of others; the system-admin console; project internals they have no endpoint for (see below). |
| **Highest-risk mistakes** | **Rotating the invite link** — `POST /organizations/current/invite/rotate` invalidates the previous URL immediately, so anyone mid-signup with the old link is locked out. **Replacing a department manager** — a single `PUT` silently reassigns authority over a whole department. **Removing a user's last role** is impossible (`@Size(min = 1)`), which the form must reflect rather than discover by error. **Deleting a department** with members. |
| **Needs more context before confirming** | Rotation (state that existing links stop working); manager replacement (name both the outgoing and incoming manager); department deletion (member count, from `DepartmentResponse.memberCount`). |
| **Surface prominently** | Unassigned employees; departments without a manager; the invite link during setup (Q8). |
| **Backend workflows** | `/users` list/detail/roles, `/departments` CRUD, `/departments/{id}/manager`, `/team-roles` CRUD, `/organizations/current/invite`, skill catalogue reads. |
| **Dashboard priority** | 1) unassigned people, 2) departments missing a manager, 3) invite status, 4) organization counts. |

**A real gap.** The organization admin has **no endpoint that lists the
organization's projects** ([00-repository-reality.md](00-repository-reality.md)
§C-3). `GET /projects/managed` returns only the caller's own projects, and it is
`@ProjectManagerOnly`. So an org admin cannot answer "what is this organization
working on?" — that is recorded as an open product decision, not designed around.
Notably, `GET /departments/unassigned-employees` is `@DepartmentManagerOnly`, so
even the "who has no department" card is unavailable to a pure org admin — see
the matrix note below.

---

## Department Manager

Owns people. The only role that can say yes to staffing.

| Question | Answer |
| --- | --- |
| **Primary goals** | Decide on staffing requests without over-committing the department; keep the department's membership accurate. |
| **Immediately after login** | Pending proposals — this is the one role with a genuine inbox. Then: who is over- or under-allocated, and what the department's projects are. |
| **Daily actions** | Review assignment and deallocation proposals: accept or reject. |
| **Occasional actions** | Add or remove department members; maintain the skill catalogue and skill↔department links; review the department's project portfolio. |
| **Should never see** | Other departments' member lists; organization-wide user administration; role granting. |
| **Highest-risk mistakes** | **Accepting a proposal that over-allocates someone** — the decision is irreversible from the UI's point of view; undoing it requires a whole deallocation proposal round trip. **Rejecting without reading** — the reason field is optional, so a hurried refusal still reaches the requester with no explanation at all. **Removing a member** who is allocated to projects. |
| **Needs more context before confirming** | Accept: the employee's current allocated hours, remaining capacity after this assignment, the project's status, the requested role and hours. Reject: an optional reason field, offered without being demanded, naming who will see it. |
| **Surface prominently** | The pending count, everywhere in the shell. This is the only justified pending-action indicator in the product. |
| **Backend workflows** | `GET /department/project-proposals` (+`?status=`), assignment accept/reject, deallocation accept/reject, `/departments/{id}/members`, `/departments/unassigned-employees`, `/department/projects`, skill catalogue writes, skill↔department links. |
| **Dashboard priority** | 1) pending proposals, 2) unassigned employees, 3) department projects. Department-wide capacity is **not** a card — no endpoint supplies it. Per-proposal capacity is on the review screen (§C-19). |

**Constraint that shapes the design.** A department manager manages exactly one
department, but `GET /departments` is organization-admin-only — so the UI learns
the manager's own `departmentId` from `GET /department/projects`
(§C-4). Every department-manager screen therefore depends on that one call
resolving first. This is worth stating in the frontend architecture task.

**Capacity caveat — half resolved.** A department manager now sees the
employee's load **on the proposal they are deciding** (§C-19, delivered by
PR #73). What they still cannot see is their **whole team's** load: no endpoint
returns it, and a department-wide capacity view remains
`FUTURE / BACKEND NOT AVAILABLE`; what a DM can see today is
membership and the department's projects with their teams. This is a significant
finding and is carried into the open questions.

---

## Project Manager

Needs people. Generates every staffing request.

| Question | Answer |
| --- | --- |
| **Primary goals** | Get their projects staffed against declared role requirements; remove people who are no longer needed. |
| **Immediately after login** | Their projects with staffing gaps — required members per team role versus who is actually allocated; proposals still pending. |
| **Daily actions** | Run Team Finder; send assignment proposals; check whether earlier proposals were decided. |
| **Occasional actions** | Create or edit a project; move a project through its lifecycle; propose a deallocation; delete a project. |
| **Should never see** | Department membership administration; user role management; other managers' projects (the API scopes `/projects/managed` to them). |
| **Highest-risk mistakes** | **Proposing the wrong person** — cheap to fix but it consumes a department manager's attention. **Deleting a project** — blocked by the backend for `IN_PROGRESS`/`CLOSING`/`CLOSED`, so the real risk is deleting a `NOT_STARTED`/`STARTING` project that others are already preparing for. **Moving status to `IN_PROGRESS` prematurely**, which makes the project capacity-consuming and deletion-blocked. |
| **Needs more context before confirming** | Proposal: the candidate's remaining capacity after the requested hours, and which department will review it. Deallocation: the reason is mandatory and permanent — it is stored and later surfaced on the project's past members. Status change: what the new status blocks or enables. |
| **Surface prominently** | Staffing gaps per project; proposals awaiting a decision (they are blocked on someone else). |
| **Backend workflows** | `/projects` CRUD + `/projects/managed`, `POST /projects/{id}/team-finder`, assignment proposals, deallocation proposals, `/projects/{id}/details`, `/projects/{id}/team`, `/team-roles` and `/skills` reads. |
| **Dashboard priority** | 1) staffing gaps, 2) outstanding proposals, 3) projects by status, 4) Team Finder entry. |

**Asymmetry worth naming.** The PM can see a candidate's exact allocated hours
through Team Finder; the department manager who must approve the request cannot
see the same figure for their own people. The proposal review screen should
therefore carry forward whatever capacity context the proposal payload provides,
because the reviewer cannot look it up independently.

---

## Role × capability matrix

`✓` = permitted. `own` = permitted but scoped to records the user owns or manages,
enforced in the service layer. `—` = not permitted (403).

| Capability | Endpoint(s) | EMP | ORG_ADMIN | DEPT_MGR | PROJ_MGR |
| --- | --- | :-: | :-: | :-: | :-: |
| See own identity and roles | `GET /auth/me` | ✓ | ✓ | ✓ | ✓ |
| Manage own sessions | `GET/DELETE /auth/sessions`, `logout`, `logout-all` | ✓ | ✓ | ✓ | ✓ |
| Reset password | `/auth/password-reset/*` | ✓ | ✓ | ✓ | ✓ |
| See own projects and history | `GET /me/projects` | ✓ | ✓ | ✓ | ✓ |
| Manage own skills | `GET/POST/PATCH/DELETE /me/skills` | ✓ | ✓ | ✓ | ✓ |
| Browse skill catalogue | `GET /skills`, `GET /skill-categories`, `GET /skills/{id}/departments` | ✓ | ✓ | ✓ | ✓ |
| Read a project's details / team | `GET /projects/{id}/details`, `/team` | ✓ | ✓ | ✓ | ✓ |
| List organization users | `GET /users`, `GET /users/{id}` | — | ✓ | — | — |
| Change a user's roles | `PATCH /users/{id}/roles` | — | ✓ | — | — |
| Departments CRUD | `/departments` | — | ✓ | — | — |
| Assign / remove department manager | `/departments/{id}/manager` | — | ✓ | — | — |
| Team roles CRUD | `/team-roles` | — | ✓ | — | — |
| Invite link read / rotate | `/organizations/current/invite` | — | ✓ | — | — |
| Department members list / add / remove | `/departments/{id}/members` | — | — | own | — |
| Unassigned employees | `GET /departments/unassigned-employees` | — | — | ✓ | — |
| Skill catalogue writes | `POST/PATCH/DELETE /skills`, `/skill-categories` | — | — | ✓ | — |
| Skill ↔ department links | `/skills/{id}/departments/current` | — | — | own | — |
| Department project portfolio | `GET /department/projects` | — | — | own | — |
| Proposal review queue | `GET /department/project-proposals` | — | — | own | — |
| Accept / reject assignment | `/department/project-proposals/assignments/{id}/…` | — | — | own | — |
| Accept / reject deallocation | `/department/project-proposals/deallocations/{id}/…` | — | — | own | — |
| Projects CRUD | `/projects` | — | — | — | own |
| List managed projects | `GET /projects/managed` | — | — | — | own |
| Team Finder | `POST /projects/{id}/team-finder` | — | — | — | own |
| Create assignment proposal | `POST /projects/{id}/assignment-proposals` | — | — | — | own |
| Create deallocation proposal | `…/deallocation-proposals` | — | — | — | own |

Two consequences fall straight out of the matrix:

- **`GET /departments/unassigned-employees` sits under `@DepartmentManagerOnly`,
  not `@OrganizationAdminOnly`.** Onboarding is split: the org admin creates
  departments and grants roles, but only a department manager can place people
  into a department. A pure org admin cannot complete onboarding alone. This is
  a deliberate-looking backend design and the UI must not paper over it — the
  org admin's empty state has to say who finishes the job.
- **Skill catalogue writes belong to department managers, not the org admin.**
  The shared vocabulary is maintained by the people closest to the work. The
  navigation must therefore not file Skills under "organization settings".

---

## Multi-role UX

Multi-role is the normal case, not an edge case: `PATCH /users/{id}/roles` takes a
set, `CurrentUserResponse.roles` is a list, and the realistic organization has
department managers who are also project managers.

### Decision: union of capabilities, never a role switcher

No "acting as…" selector, no role-switch screen, no duplicated navigation.

Rationale:

1. **The backend has no concept of an active role.** Every request is authorised
   against the full role set. A UI-level role switch would be pure theatre: the
   user could "switch to Employee" and still successfully call every
   project-manager endpoint. A control that does not constrain anything but looks
   like it does is worse than no control.
2. **The roles are complementary, not overlapping.** A PM/DM's two jobs — asking
   for people and deciding about people — happen on different objects. There is
   almost nothing to disambiguate.
3. **Switching would hide the inbox.** A DM who is also a PM would lose sight of
   pending proposals whenever they were "in PM mode". That is the single most
   time-critical thing in the product.

### How it works instead

**Navigation is the union of what the role set permits.** Each navigation item
declares which roles reveal it; the shell renders the union. Nothing is
duplicated because each item appears once regardless of how many roles grant it.

**Authority is communicated by object, not by mode.** The user never asks "which
hat am I wearing?" because the screen answers it:

- On a project they manage: "You manage this project" → propose, edit, staff.
- On a proposal in their department: "Your department reviews this" → accept, reject.
- On their own profile: "Your skills".

**The dashboard merges responsibilities in a fixed priority order,** so a
multi-role user gets one home, not several:

1. **Decisions waiting on you** — pending proposals (DEPT_MGR)
2. **Blocked on someone else** — proposals you sent that are still pending (PROJ_MGR)
3. **Needs attention** — staffing gaps (PROJ_MGR); unassigned people and
   manager-less departments (ORG_ADMIN)
4. **Yours** — your projects and your skill profile (every role)

A section is omitted entirely when the role set does not grant it — not shown
empty, not shown disabled. An employee sees only section 4, which is why their
home is a status page rather than a queue (see the Employee profile above).

**The pending indicator is role-scoped and singular.** Only the department
manager's review queue gets a count in the navigation, because it is the only
place where another person is actively blocked. Adding badges to everything
would destroy the signal — the same argument as the visual direction's colour
discipline ([01-product-direction.md](01-product-direction.md) §V3).

### What the user sees about their own roles

One place: the account menu lists the roles they hold, in plain words
("Project manager · Department manager"). It is informational. It is not a
control, and it does not gate anything.
