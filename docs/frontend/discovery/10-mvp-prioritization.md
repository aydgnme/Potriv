# 10 — MVP, polish and future

Phase 22.

The traceability matrix ([09-backend-screen-traceability.md](09-backend-screen-traceability.md))
established that **all 66 product operations belong in the MVP** — the backend
was built to a coherent scope, and shipping a frontend that reaches only part of
it would leave working capabilities unreachable.

So the split below is not "which endpoints" but **which screens ship first, and
which refinements can wait**. That is a genuinely different question, and it has
a real answer.

---

## BACKEND PREREQUISITES — DELIVERED

Three enhancements were approved, built and merged **ahead of** frontend work. They are not "backend incomplete" — the agreed backend scope was
delivered and verified. Designing the UI simply exposed contract data the review
and onboarding flows need, which is exactly what a discovery phase is for.

### B1 — Capacity context on the proposal review response — **MERGED, PR #73**

**Problem.** A department manager accepts or rejects staffing requests without
being able to see the employee's load. Team Finder computes and returns exactly
that figure — to project managers only. The role *deciding* has strictly less
information than the role *asking*.

**Approved shape.** Current capacity context **on the review API response**, not
a generic capacity-dashboard endpoint. The reviewer needs `allocatedHours`,
`availableHours` and `requestedHours` for the employee in the proposal.

**Why scoped there rather than department-wide.** `GET /department/projects`
already exposes per-project allocation rows, but only for that department's
projects — summing them would silently under-report anyone allocated elsewhere.
Team Finder sums an employee's **all** active allocations. Putting the computed
figure on the review response reuses the correct calculation and gives it to the
one screen that needs it, without inventing a broader contract.

**Delivered as.** `capacity` on each pending assignment row: `maxHoursPerDay`,
`allocatedHoursPerDay`, `availableHoursPerDay`, `requestedHoursPerDay`,
`projectedAllocatedHoursPerDay`, `projectedAvailableHoursPerDay`,
`currentlyAcceptableByCapacity`. Null on removal rows and decided rows. Computed
with the acceptance rule, one batched query per page.

**Frontend effect, applied.** PR-A and PR-B render a real capacity block. The
department-wide capacity dashboard card stays rejected — still no endpoint.

### B2 — Rejection reason — **MERGED, PR #74**

**Problem.** Accept and reject take a path variable and no body, so a rejected
project manager receives a bare refusal and cannot tell a capacity constraint
from a disagreement.

**Approved shape.** An explanatory reason on both assignment and deallocation
reject, persisted.

**Delivered as.** An **optional** `{reason}` body on both reject endpoints, max
5000, blank normalised to null, readable on all three proposal surfaces,
immutable after the decision. Named `rejectionReason` so it can never merge with
a deallocation proposal's own `reason`.

**Frontend effect, applied.** PR-D is the reject dialog; the "no reason is sent"
copy is gone; rejected proposals without one render "No reason given".

### B3 — Single-person organization onboarding — **MERGED, PR #72**

**Problem, verified in the code.** `UserRoleManagementService.updateUserRoles`
rejects self-modification outright:

```java
if (targetUser.getId().equals(currentUser.userId())) {
    throw new BadRequestException("You cannot update your own roles.");
}
```

So a founding organization admin **cannot grant themselves** `DEPARTMENT_MANAGER`
or `PROJECT_MANAGER`. They can create departments and team roles, and then stop:
they cannot place a person into a department, create a project, run Team Finder,
or review a proposal. A new organization cannot be evaluated by one person.

**Approved shape.** Make single-person organization setup possible, safely, in
the backend. The self-modification guard exists for good reasons — an admin
should not casually escalate or strand the organization without an admin (the
service also enforces `"Cannot remove the last organization admin."`) — so the
fix needs to preserve those protections rather than delete the guard.

**Explicitly rejected:** solving this with frontend copy. Wording that explains
why the product cannot be used is not a solution.

**Delivered as.** A strictly additive self-role extension, permitted only while
the organization has exactly one member and only for `DEPARTMENT_MANAGER` /
`PROJECT_MANAGER`. Everything else returns the unchanged refusal.

**Frontend effect, applied.** W-22 is the solo setup step, shown only while the
organization has one member and worded in capability terms. Journey B1 now
branches instead of dead-ending.

---

## FRONTEND MVP — REQUIRED

Everything needed to expose the backend product coherently. Grouped into
delivery slices that are each independently demonstrable — a slice that cannot
be shown to a user is not a slice.

### Slice 1 — Get in and stay in

| Screen | Why it cannot wait |
| --- | --- |
| P01 Login · P05/P06 password reset | Nothing else is reachable |
| P02 Create organization · P03 invite registration · P04 invalid invite | The only ways an account comes to exist |
| App shell with role-aware navigation | Every later screen renders inside it |
| A02 Account and sessions | Session revocation is a security capability, not a nicety |
| A09/A10/A11 error screens | Every other screen routes to these |

**Demonstrable as:** a person can create an organization, invite someone, both
sign in, and both manage their own sessions.

### Slice 2 — The organization exists

| Screen | Why |
| --- | --- |
| O03/O04/O05 departments · O06 appoint manager | Without a department manager, nothing can be staffed — the whole allocation workflow is blocked |
| O01/O02 people and roles | Without roles, nobody can create a project or review a proposal |
| O07/O08 team roles | Projects declare requirements against these |
| O09 invite link | Onboarding beyond the founder |
| D04/D05 department membership | **Only a department manager can place people into a department** — onboarding is incomplete without this screen, and it belongs to a different role than the rest of this slice |

**Demonstrable as:** an organization with departments, managers, roles and people
in the right places.

### Slice 3 — Skills exist

| Screen | Why |
| --- | --- |
| A03/A04 skill catalogue · D07 catalogue management | Team Finder's skill score is 60 of 100 — without a catalogue it is scoring against nothing |
| A05 My skills | The only source of skill data in the entire system |

**Demonstrable as:** people have skill profiles, so Team Finder has inputs.

### Slice 4 — Projects exist

| Screen | Why |
| --- | --- |
| M01 projects list · M02/M03 create and edit | The object everything else orbits |
| A06 project overview · A07 project team · A08 my projects | Read surfaces for every role |
| D06 department portfolio | The department manager's view of commitments |

**Demonstrable as:** projects with declared technology stacks and role
requirements, visible to everyone who should see them.

### Slice 5 — The product's reason to exist

| Screen | Why |
| --- | --- |
| M04/M05 Team Finder | The one capability a spreadsheet cannot replace |
| M06/M07 proposal forms | The only way to request staffing |
| D01/D02/D03 review queue and decisions | The only way staffing happens |
| A01 Home, role-composed | The screen that makes the queue discoverable |

**Demonstrable as:** the full handshake — a project manager finds a candidate,
proposes, a department manager decides, and the project team reflects it.

**Slice 5 is the product.** Slices 1–4 exist to make it possible. If schedule
pressure appears, it must not come out of Slice 5 — a Potriv without the
allocation handshake is a directory.

### Cross-cutting MVP requirements

These are not screens and are not optional:

- Role-aware navigation as the union of capabilities, with no role switcher
- The four empty-state kinds distinguished ([06-ux-patterns.md](06-ux-patterns.md))
- **All 409 conflicts rendered as explanations**, not generic failures — six
  distinct conflicts carry real domain meaning
- **PR-B**: the pending-but-not-acceptable proposal state
- Client-side mirroring of validation rules, because server errors are not
  field-addressable (§C-13)
- Status badges carrying colour **and** a word
- WCAG 2.2 AA ([08-responsive-accessibility.md](08-responsive-accessibility.md))
- The mobile forms of the desktop-intensive workflows

---

## FRONTEND POLISH — SHOULD HAVE

Improves usability without changing scope. Each one is deferrable; none is
decorative.

| Item | Value | Why it can wait |
| --- | --- | --- |
| Team Finder keyboard navigation (`↑`/`↓` + `Enter`) | Materially faster for the highest-frequency PM task | The screen works without it |
| Sorting Team Finder by score **component** | Answers "deepest skill match regardless of availability" | Total-score order is a reasonable default |
| Compare up to three candidates side by side | The one genuinely good idea from concept TF-B | The split view supports sequential comparison |
| List virtualisation | Required at a few hundred rows; the API returns everything | Small organizations will not notice |
| "Next proposal" after a decision without returning to the queue | Turns the queue into a genuine work list | Returning to the list works |
| Optimistic updates on accept/reject and membership changes | Removes a perceptible wait | A busy state is honest and adequate |
| Relative timestamps with absolute on hover | "2 days ago" is how people read a queue | Absolute dates are unambiguous |
| Dark mode | The chosen visual direction inverts cleanly | Light mode is complete |
| Deep-linkable Team Finder criteria in the URL | Compensates for a `POST` that reads | Re-running the search is cheap |
| Copy-link confirmation micro-feedback on the invite screen | Removes doubt about whether the copy worked | The clipboard usually just works |
| Staffing-gap figures loaded progressively rather than blocking | The N+1 cost is real | A skeleton covers it |

---

## POST-MVP / FUTURE

Requires backend work that does not exist. **Nothing here may be treated as a
current feature or slipped into MVP scope.** Each item names what would have to
be built first.

| Idea | Backend prerequisite |
| --- | --- |
| ~~Department capacity view~~ | **Approved as B1 above** — scoped to the review response rather than a dashboard endpoint |
| **Employee's own capacity** | The same figure exposed to the employee |
| **Organization-wide project overview** | A project list not scoped to the caller, readable by an organization admin |
| **Aggregate staffing gaps** | One call returning requirements versus allocations across a manager's projects, replacing today's N+1 |
| **In-app notifications** | Any notification endpoint at all. The README names a Notification module; the REST surface has none |
| ~~Rejection reason~~ | **Approved as B2 above** |
| **Authenticated change password** | An endpoint that accepts the current password. Today the only route is an emailed reset |
| **Global search** | Search endpoints for users, projects, departments and proposals. Only `skills?q=` exists |
| **Server-side pagination, sorting and filtering** | Paged responses on product lists. Only the system-admin audit endpoint paginates |
| **Skill endorsement or validation** | An endorsement model. Its absence is why skill data is labelled self-declared, and why product Direction B was rejected |
| **Analytics and utilisation trends** | Aggregate reporting endpoints — and a product argument, which does not currently exist |
| **Multi-organization membership** | A many-to-many user↔organization model. Today one user has one organization |
| **Account status on `GET /users`** | A status field on `UserSummaryResponse`, or a filter. Today the product frontend cannot tell an active account from a suspended one (§C-18), so an admin may grant roles to a user who cannot sign in. Ruled `FUTURE / BACKEND GAP`, not an MVP blocker |
| **Skill level and experience in the Team Finder score** | Weighting in `skillScore`. Today they are returned but ignored entirely (F2), so a beginner scores identically to an expert on the same technology |

**Ordering note.** The three approved prerequisites (B1, B2, B3) come first. Of
what remains, **account status on `GET /users`** is the most consequential: it is
the only gap where the frontend can currently mislead an administrator into
acting on an account that cannot sign in.

---

## What is deliberately not built at all

Distinct from "future": these were considered and rejected on product grounds,
not blocked by the backend.

| Rejected | Why |
| --- | --- |
| A "choose your role" screen | The backend has no active-role concept; the control would constrain nothing while appearing to ([02-personas-and-roles.md](02-personas-and-roles.md)) |
| A generic dashboard shared by all roles | An employee has no queue; a department manager has nothing but one |
| Profile-completeness percentages | There is no target number of skills, so any percentage is invented |
| Pagination controls over client-side arrays | Implies a server contract that does not exist (P6) |
| Estimated or derived capacity where the API does not supply it | A quietly wrong number is worse than none (P3) |
| A project Gantt chart | No milestone, phase or dependency data exists |
| Illustrated empty states and mascots | An allocation tool that looks like a consumer product misrepresents what it does |
| Rebuilding the system-admin console in the product frontend | It exists, works, and belongs to operations |
