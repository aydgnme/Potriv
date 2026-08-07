# 11 — Critique and decision register

Combines Phase 23 (challenge the product) and Phase 25 (open questions). The
critique produced several of the register's entries, so separating them would
hide where the questions came from.

---

# Part 1 — Critical review

Every question from Phase 23, answered honestly. Three found real problems, and
the IA was revised before this pack was finalised.

### Are we exposing backend structure instead of user mental models?

**Mostly no, with one fix already applied.** The IA is built from what users ask
("who can do this work?"), not from controllers. The vocabulary deliberately
avoids "allocation" and "deallocation proposal" in favour of "propose" and
"propose removal".

**The problem found:** an early draft had a top-level **Departments** item,
because `/departments` is a controller. But only organization admins can list
departments, and a department manager has exactly one — for them it is a page,
not a list. **Fixed:** departments live under Organization for the admin and
under People for the manager.

### Are there too many top-level navigation items?

**Six, and a given user sees three to six.** An employee sees Home, Projects,
Skills. Justified in [04-information-architecture.md](04-information-architecture.md),
where four candidates were rejected.

### Are dashboards actually useful?

**Yes, after removing four cards that were not.** Cut: department capacity (no
endpoint — a number that would be quietly wrong), organization project overview
(no endpoint), profile completeness percentage (no defensible denominator), and
"total people allocated" (a vanity metric).

The employee's home is deliberately a **status page rather than a queue**,
because that role genuinely has no pending work. Giving them a "tasks" dashboard
would produce a permanently empty screen.

### Are users forced to understand technical role names?

**No.** Roles render as "Project manager", never `PROJECT_MANAGER`. On the role
editor (W-06) each role is described by **capability** — "Reviews staffing
requests for one department" — because that is what the admin is actually
choosing. Enum values are never shown raw anywhere.

### Can multi-role users work naturally?

**Yes, and this was tested against the hardest case:** someone who is both a
project manager and a department manager. They get one home with sections in a
fixed priority order, one navigation built from the union of capabilities, and
no role switcher. Authority is communicated by object ("You manage this
project", "Your department reviews this"), not by mode.

### Is Team Finder prominent enough?

**Yes — and this drove the single most important IA decision.** Making
**Staffing** top-level is what rescues Team Finder and the review queue from
being buried two clicks deep inside a project and a department. Team Finder is
still *entered* from a project, because it needs a `projectId`, but it is
*findable* from the sidebar.

### Are proposal queues discoverable?

**Yes.** The review queue is the first section on Home, a top-level navigation
item, and the only place in the product with a count indicator. That
concentration is intentional: badges everywhere would destroy the signal.

### Are destructive actions safe?

**Yes, with one non-obvious case caught.** Rotating the invite link has no
`DELETE` verb but kills the existing link immediately, locking out anyone
mid-signup. It is treated as destructive and confirmed.

Deletion of a project is guarded twice — `?confirmed=true` plus a `409` from
status **history** that the UI cannot predict, so the refusal is designed as an
explanation rather than an error.

### Is important context hidden inside modals?

**No, and one draft was corrected.** Team Finder's evidence is in a panel beside
the list, not a modal — and **Propose lives in that panel**, so a proposal cannot
be sent without the evidence on screen. This is precisely why concept TF-B was
rejected: it allowed Propose directly from a table row showing truncated data.

Modals are used only for decisions about something already visible: confirmations
and the two proposal forms.

### Are there screens that exist only because an endpoint exists?

**Two were examined and both survived, for stated reasons:**

- `GET /skills/{skillId}/departments` — folded into the skill detail screen
  rather than given its own
- `GET /projects/{projectId}` — used only to prefill the edit form; not a screen

**Two endpoints were removed from the product frontend entirely** —
`GET /admin/security/audit-events` and `PATCH /admin/users/{userId}/status`.
Both are system-admin operations already served by an existing console.

### Are there important workflows without a natural entry point?

**One was found and fixed.** Deallocation had no home: `POST …/deallocation-proposals`
needs an `allocationId`, which appears only in `GET /projects/{id}/team`. The
entry point is now explicitly the overflow menu on an **active** member row in
the project team view (W-17). Without that, a documented workflow would have
been unreachable.

### Is anything duplicated across roles?

**No.** Each navigation item appears once regardless of how many roles grant it.
Projects is one item backed by three different endpoints depending on the role
set, rather than three items describing the same noun.

### Are future ideas being treated as current features?

**Guarded explicitly.** Eleven ideas are marked `FUTURE / BACKEND NOT AVAILABLE`
in [09-backend-screen-traceability.md](09-backend-screen-traceability.md), and
[10-mvp-prioritization.md](10-mvp-prioritization.md) names the backend
prerequisite for each. The two most tempting — global search and department
capacity — are both refused in the dashboard and IA sections where they would
otherwise have appeared.

---

# Part 2 — Decision register

## Decisions made

These are settled unless the product owner overrules them.

| # | Decision | Basis |
| --- | --- | --- |
| D1 | Product direction: **Allocation Command Center** with operational-workspace density | The payloads are decision payloads, not list payloads |
| D2 | Visual direction: **Signal Discipline** — colour reserved for domain status; primary actions are monochrome | Potriv screens are saturated with status; colour must not compete |
| D3 | Shell: **persistent sidebar**, with an object-level tab row | The pending indicator must be unmissable; the role set varies in size |
| D4 | **No role switcher.** Navigation is the union of capabilities | The backend has no active-role concept; the control would constrain nothing |
| D5 | One role-composed Home in fixed priority order | A multi-role user must not have several homes |
| D6 | **Staffing is top-level** | Otherwise the two time-critical screens are buried |
| D7 | Team Finder: **split view** (TF-A), Propose in the detail panel only | A proposal must not be sendable from truncated evidence |
| D8 | Score is shown **decomposed with its evidence**; never called intelligent or AI | It is deterministic arithmetic, and saying so is more trustworthy |
| D9 | Review: queue + drawer on desktop, queue + full page on mobile | The batch must stay a batch |
| D10 | **No pagination controls anywhere**; totals stated, long lists virtualised | No product endpoint paginates |
| D11 | Project create/edit is **one page with sections**, not a wizard | Nothing branches; `POST` is atomic; editing must mirror creating |
| D12 | Validation mirrored client-side; server message shown at form level | Server errors are a single joined string and are not field-addressable |
| D13 | System-admin console stays out of the product frontend | It exists, works, and is an operations tool |
| D14 | Capacity always as **hours out of eight**, and **omitted entirely** where the API does not supply it | A quietly wrong number is worse than none |
| D15 | Status badges carry **colour and a word** | Accessibility requirement and visual-direction rule, arrived at independently |
| D16 | Skill and experience labels are rendered **from the backend verbatim** | They already carry display labels |
| D17 | "Propose", never "Assign" | A project manager cannot staff unilaterally, and the vocabulary must carry that |
| D18 | **PR-B is a designed state**: pending but not currently acceptable | The backend deliberately leaves such proposals `PENDING` |
| D19 | Employee home is a **status page**, not a queue | The role has no pending work |
| D20 | Deallocation's entry point is the overflow menu on an active member row | The only place `allocationId` is exposed |

## Decisions needing product-owner approval

Genuine product choices, not technical ones. Each has a recommendation, because
an open question without one is just a delay.

| # | Question | Recommendation |
| --- | --- | --- |
| Q1 | **A department manager approves staffing without seeing their team's load.** Ship this way, or fund a capacity endpoint first? | **Fund the endpoint.** This is the pack's most significant finding: the role making the decision has strictly less information than the role making the request, and the data already exists in Team Finder |
| Q2 | **A rejected project manager receives no reason.** Accept, or add a reason field to reject? | **Add it.** The cost is one optional string; the cost of not having it is a manager who cannot tell a capacity refusal from a disagreement |
| Q3 | **An organization admin cannot see the organization's projects.** Intended, or a gap? | Confirm intent. If unintended, an org-admin-readable project list is small work with real value |
| Q4 | **Onboarding is split**: an org admin creates departments and grants roles, but only a department manager can place people into one. Intended? | Assume intended and design for it — the setup path names who finishes the job — but confirm, because it means a one-person organization cannot fully onboard anyone |
| Q5 | Should an employee see their own capacity? | **Yes, eventually.** It is the clearest explanation of why Team Finder does or does not surface them |
| Q6 | Is `/skills?q=` enough search, or is global search needed for launch? | **Enough for launch.** Revisit when an organization exceeds a few hundred users |
| Q7 | Does the product frontend need dark mode at launch? | **No.** The chosen direction inverts cleanly, so it stays cheap to add later |
| Q8 | Should the invite link be shown on the org admin's Home, or only under Organization? | Both, during setup only — it is the bottleneck for a new organization |

## Technical questions requiring repository or API confirmation

Answerable from the repository or by the backend owner; none blocks the design.

| # | Question | Why it matters |
| --- | --- | --- |
| T1 | Is `GET /department/projects` guaranteed to return the department summary even when the department has **no projects**? | Every department-manager screen resolves `departmentId` from it (§C-4). If it can return no department, the frontend has no way to learn it |
| T2 | What is the invite token's lifetime, and does rotation immediately invalidate the old one or allow a grace period? | The rotation confirmation copy states "immediately" |
| T3 | What is the access token's lifetime, and does `POST /auth/refresh` rotate the refresh token? | Determines whether a silent refresh interceptor is enough |
| T4 | Are `technologyStack` entries free text matched by name, or resolved to a catalogue? | Determines whether project creation offers autocomplete or a plain input |
| T5 | Does Team Finder's skill score match on **project technology stack** only, or also on team-role requirements? | The empty state tells a manager what to add; it must name the right thing |
| T6 | Are there rate limits on `POST /projects/{id}/team-finder`? | The criteria form re-runs on every change if unthrottled |
| T7 | Confirm no product list endpoint will gain pagination soon | D10 assumes not. A late addition changes list patterns everywhere |
| T8 | Does `GET /users` include suspended and disabled accounts? | If so, the people list needs an account-status column that this pack has not designed |

## Future ideas intentionally deferred

Recorded so they are not rediscovered as requirements. Full list with backend
prerequisites in [10-mvp-prioritization.md](10-mvp-prioritization.md).

In-app notifications · global search · organization-wide project overview ·
department and employee capacity views · aggregate staffing gaps · rejection
reasons · authenticated change password · server-side pagination · skill
endorsement and validation · analytics and utilisation trends ·
multi-organization membership.

**None of these is in the MVP. None may become MVP scope without a backend
change and an explicit decision.**
