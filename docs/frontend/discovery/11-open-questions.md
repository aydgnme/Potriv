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

## Product decisions — RESOLVED

All eight were ruled on by the product owner. Three require backend work **before**
frontend implementation begins; the rest are settled as scope.

| # | Question | Ruling | When |
| --- | --- | --- | --- |
| **Q1** | A department manager approves staffing without seeing their team's load | **Add to the backend.** The reviewer must see the candidate's `allocatedHours` / `availableHours` / `requestedHours`. Delivered as **current capacity context on the review API response**, not as a generic capacity dashboard endpoint — the review screen is the only place that needs it, and scoping it there keeps the contract honest | **Before frontend** |
| **Q2** | A rejected project manager receives no reason | **Add to the backend.** An explanatory reason on assignment and deallocation reject, persisted | **Before frontend** |
| **Q3** | An organization admin cannot see the organization's projects | **Out of MVP.** Do not turn the organization admin into an operations dashboard | Future |
| **Q4** | A single-person organization cannot bootstrap itself (§C-17) | **Fix in the backend.** One person must be able to complete organization setup. Solving this with frontend copy would be hiding it | **Before frontend** |
| **Q5** | Should an employee see their own capacity? | Useful, not a blocker | Future |
| **Q6** | Is `/skills?q=` enough search for launch? | **Yes** | MVP as designed |
| **Q7** | Dark mode at launch? | **No** | Future |
| **Q8** | Invite link on Home? | **Yes, but only during setup/onboarding** | MVP |

### What changes in this pack once Q1, Q2 and Q4 land

Recorded now so the wireframes can be updated in one pass rather than
rediscovered:

- **Q1** — PR-A and PR-B gain a real capacity block sourced from the response
  instead of the current deliberate omission. The dashboard card rejected in
  [04-information-architecture.md](04-information-architecture.md) stays
  rejected: this is review context, not a department-wide capacity view
- **Q2** — the reject flow gains a reason input, and
  [06-ux-patterns.md](06-ux-patterns.md)'s copy rule "Rejecting does not send a
  reason" is removed. The project manager's proposal history gains somewhere to
  display it
- **Q4** — the organization admin's setup path stops having to say "someone else
  finishes this", and journey B1's closing note is rewritten

Until then the pack describes the system **as it is**, not as it will be.

## Technical questions — RESOLVED

All eight answered against the repository. Four changed the design and the
affected documents have been corrected.

| # | Question | Answer | Effect on the pack |
| --- | --- | --- | --- |
| **T1** | Does `GET /department/projects` return the department summary when the department has no projects? | **Yes.** The summary is always returned | **Closed, no risk.** The `departmentId` resolution path (§C-4) is safe |
| **T2** | Invite lifetime and rotation semantics | **Invites never expire** — `expiresAt` is always `null`. Rotation deactivates every active invite inside a transaction with a pessimistic organization lock | **Correction applied.** W-16 no longer shows an expiry date or an "expires soon" warning; rotation is documented as the only revocation mechanism (§C-14) |
| **T3** | Token lifetimes and refresh rotation | Access **15 minutes**, refresh **7 days**; refresh tokens **rotate**, the old one is marked used, and reuse is audited | **Added as §C-15.** The API client needs a single-flight silent refresh — two concurrent refreshes would trip reuse detection |
| **T4** | Is `technologyStack` a catalogue reference? | **No** — `List<String>` free text | **Added as §C-16.** Project creation uses a tag/chip input that *suggests* skill names but accepts free text. A typo silently produces zero Team Finder matches |
| **T5** | What does the skill score match against? | **Project technologies only**, exact-normalized. Team-role requirements feed past-project similarity, not the skill score | **Correction applied.** TF-A's empty state (b) now names *technologies*, not team roles |
| **T6** | Rate limits on Team Finder? | **None in the repository** | Debounce or manual re-run regardless — a `POST` per keystroke is wrong even when permitted |
| **T7** | Will product endpoints stay unpaginated? | **No pagination today**, and the repository cannot guarantee the future | D10 holds for now and is flagged as revisitable. If pagination arrives, list patterns change everywhere |
| **T8** | Does `GET /users` expose account status? | **No.** No filter parameter, and `UserSummaryResponse` carries no status field | **Added as §C-18 and recorded as `FUTURE / BACKEND GAP`** — see below |

### New findings from resolving these questions

Two facts surfaced during verification that were not in the original pack and
change what the UI may claim:

| # | Finding | Consequence |
| --- | --- | --- |
| **F1** | **`pastProjectScore` is binary — exactly `0` or `20`**, never graduated | Rendering it on a continuous scale would invent precision. Wireframe values corrected |
| **F2** | **Skill level and experience do not affect the score at all.** `skillScore = round(60 × matchedTechnologies / projectTechnologies)` | A `LEARNS` / `0-6 months` match scores identically to `TEACHES` / `7+ years`. Level and experience are **evidence for the human**, not ranking inputs, and the Team Finder detail panel now says so. This is arguably a product question in its own right — see Q9 |

| # | New question raised | Recommendation |
| --- | --- | --- |
| **Q9** | Should skill **level** and **experience** influence the Team Finder score? Today they are returned but ignored | Worth a decision, not a blocker. Weighting them would make the ranking match what a manager assumes it already does. Until then the UI states the truth plainly |
| **Q10** | `GET /users` cannot distinguish an active account from a suspended or disabled one (§C-18) | **`FUTURE / BACKEND GAP`**, not an MVP blocker — as ruled. Worth noting that an organization admin can currently grant roles to a suspended user, and a project manager can propose someone who cannot sign in |

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
