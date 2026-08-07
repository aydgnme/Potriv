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
| **Department capacity view** | An endpoint giving a department manager their members' allocated hours. The single most valuable gap: a manager currently accepts staffing requests without seeing their team's load |
| **Employee's own capacity** | The same figure exposed to the employee |
| **Organization-wide project overview** | A project list not scoped to the caller, readable by an organization admin |
| **Aggregate staffing gaps** | One call returning requirements versus allocations across a manager's projects, replacing today's N+1 |
| **In-app notifications** | Any notification endpoint at all. The README names a Notification module; the REST surface has none |
| **Rejection reason** | A request body on the reject endpoints. Today a project manager receives a bare refusal |
| **Authenticated change password** | An endpoint that accepts the current password. Today the only route is an emailed reset |
| **Global search** | Search endpoints for users, projects, departments and proposals. Only `skills?q=` exists |
| **Server-side pagination, sorting and filtering** | Paged responses on product lists. Only the system-admin audit endpoint paginates |
| **Skill endorsement or validation** | An endorsement model. Its absence is why skill data is labelled self-declared, and why product Direction B was rejected |
| **Analytics and utilisation trends** | Aggregate reporting endpoints — and a product argument, which does not currently exist |
| **Multi-organization membership** | A many-to-many user↔organization model. Today one user has one organization |

**Ordering note.** If exactly one backend addition were funded, it should be
**department capacity**. It is the only gap that leaves a role making
consequential decisions with less information than another role already has, and
the data already exists — Team Finder computes it.

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
