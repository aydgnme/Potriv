# 05 — Screen inventory

Phase 7. Coverage is driven by workflows, not by a target count: every backend
capability a product role can reach has a screen, and no screen exists only
because an endpoint does.

Shared conventions referenced throughout — loading, error, permission and empty
patterns — are defined once in [06-ux-patterns.md](06-ux-patterns.md) and named
here rather than repeated. Where a screen deviates, the deviation is spelled out.

**Legend.** `PUB` public · `SHR` authenticated shared · `EMP` employee ·
`OA` organization admin · `DM` department manager · `PM` project manager

---

## Index

| ID | Screen | Class |
| --- | --- | --- |
| P01 | Login | PUB |
| P02 | Create organization | PUB |
| P03 | Accept invite / register | PUB |
| P04 | Invite not valid | PUB |
| P05 | Forgot password | PUB |
| P06 | Set new password | PUB |
| A01 | Home | SHR |
| A02 | Account and sessions | SHR |
| A03 | Skill catalogue | SHR |
| A04 | Skill detail | SHR |
| A05 | My skills | SHR |
| A06 | Project overview | SHR |
| A07 | Project team | SHR |
| A08 | My projects | SHR |
| A09 | Permission denied | SHR |
| A10 | Not found | SHR |
| A11 | Something went wrong | SHR |
| O01 | People | OA |
| O02 | Person detail and roles | OA |
| O03 | Departments | OA |
| O04 | Department detail | OA |
| O05 | Department form | OA |
| O06 | Appoint department manager | OA |
| O07 | Team roles | OA |
| O08 | Team role form | OA |
| O09 | Invite link | OA |
| D01 | Review queue | DM |
| D02 | Assignment review | DM |
| D03 | Deallocation review | DM |
| D04 | My department | DM |
| D05 | Unassigned employees | DM |
| D06 | Department projects | DM |
| D07 | Skill catalogue management | DM |
| M01 | My projects (managed) | PM |
| M02 | Create project | PM |
| M03 | Project settings | PM |
| M04 | Team Finder | PM |
| M05 | Candidate detail | PM |
| M06 | Propose assignment | PM |
| M07 | Propose removal | PM |

---

# PUBLIC

### P01 — Login

- **Purpose** Authenticate and enter the app.
- **Actor** anyone · **Entry** root, any protected route, sign-out, post-registration
- **Content** email, password, submit; links to forgot-password and create-organization
- **Primary CTA** Sign in · **Secondary** Forgot password · Create an organization
- **Data** `POST /auth/login` → `GET /auth/me`
- **Empty** n/a · **Loading** button spinner, form disabled
- **Error** `401` one message for both wrong email and wrong password, at form level; a locked account shows the backend's wording verbatim
- **Permission** n/a · **Mobile** single column, full width, `autocomplete` set
- **Desktop** centred card, max 400px

### P02 — Create organization

- **Purpose** Found an organization and its first admin.
- **Actor** anyone · **Entry** link from P01
- **Content** name, email, password, organization name, headquarter address
- **Primary CTA** Create organization · **Secondary** Sign in instead
- **Data** `POST /auth/register-admin`
- **Empty** n/a · **Loading** disabled form
- **Error** `400` at form level plus mirrored client-side field rules (§C-13)
- **Permission** n/a · **Mobile/Desktop** as P01, taller
- **Note** Success shows the invite URL **once**, prominently, stating where to find it again. No auto sign-in (§C-9).

### P03 — Accept invite / register

- **Purpose** Join an existing organization.
- **Actor** invited person · **Entry** invite URL with `?token=`
- **Content** name, email, password; the token is read from the URL and never shown as an editable field
- **Primary CTA** Create account
- **Data** `POST /auth/register-employee/{inviteToken}`
- **Empty** n/a · **Loading** disabled form
- **Error** `400` validation; invalid/rotated token routes to P04 rather than failing in place
- **Permission** n/a · **Mobile/Desktop** as P01

### P04 — Invite not valid

- **Purpose** Explain a dead invite link without leaking whether the organization exists.
- **Actor** anyone · **Entry** P03 with a missing, malformed or rejected token
- **Content** one sentence and one instruction: ask your organization admin for a new link
- **Primary CTA** Go to sign in · **Secondary** none
- **Data** none · **Empty/Loading** n/a
- **Error** this screen *is* the error state
- **Mobile/Desktop** centred, minimal

### P05 — Forgot password · P06 — Set new password

- **Purpose** Recover access.
- **Actor** anyone · **Entry** P05 from login; P06 from the emailed link
- **Content** P05: email. P06: new password, confirm
- **Primary CTA** Send reset link / Set new password
- **Data** `POST /auth/password-reset/request` (`202`), `POST /auth/password-reset/confirm` (`204`)
- **Empty** n/a · **Loading** disabled form
- **Error** P05 always shows the same neutral confirmation regardless of whether the account exists. P06 shows "this link is no longer valid" with a route back to P05
- **Permission** n/a · **Mobile/Desktop** as P01
- **Note** P06 ends at login — `204` carries no tokens.

---

# AUTHENTICATED SHARED

### A01 — Home

- **Purpose** Answer "what needs me?" for whatever role set the user holds.
- **Actor** everyone · **Entry** post-login, logo, Home
- **Content** role-gated sections in fixed priority order: decisions waiting on you → blocked on someone else → needs attention → yours ([04-information-architecture.md](04-information-architecture.md))
- **Primary CTA** the top section's action; there is no page-level CTA
- **Secondary** navigate into any domain
- **Data** varies by role set: `/department/project-proposals?status=PENDING`, `/projects/managed`, `/departments`, `/organizations/current/invite`, `/me/projects`, `/me/skills`
- **Empty** each section has its own; an employee with nothing sees a genuine welcome plus "add your skills", not a wall of empty cards
- **Loading** per-section skeletons — sections load independently so a slow one never blocks the queue
- **Error** per-section inline error with retry; one failing section never blanks the page
- **Permission** sections the role set does not grant are **absent**, not disabled
- **Mobile** sections stack in the same priority order
- **Desktop** two columns; the first section always spans full width

### A02 — Account and sessions

- **Purpose** See who you are signed in as and control your sessions.
- **Actor** everyone · **Entry** account menu
- **Content** email, organization, roles in words; sessions table (`createdAt`, `lastSeenAt`, `userAgent`, `ipAddress`) with the current session marked
- **Primary CTA** none · **Secondary** Revoke session · Sign out · Sign out everywhere · Change password (links to P05)
- **Data** `GET /auth/me`, `GET /auth/sessions`, `DELETE /auth/sessions/{id}`, `POST /auth/logout`, `POST /auth/logout-all`
- **Empty** impossible — the current session always exists
- **Loading** table skeleton · **Error** standard inline
- **Permission** n/a — every role has this
- **Mobile** sessions become stacked rows; user agent truncated with the full value available on tap
- **Desktop** table
- **Note** There is no authenticated change-password endpoint, so that action is a link to the reset flow, labelled accordingly.

### A03 — Skill catalogue · A04 — Skill detail

- **Purpose** Browse the organization's shared skill vocabulary.
- **Actor** everyone (read); DM sees management controls (D07)
- **Entry** Skills
- **Content** A03: categories with their skills, `q` search, category filter, show-inactive toggle. A04: name, description, category, linked departments, active flag
- **Primary CTA** employee: Add to my skills · DM: New skill
- **Secondary** filter, search, show inactive
- **Data** `GET /skills?q=&categoryId=&includeInactive=`, `GET /skill-categories`, `GET /skills/{id}`, `GET /skills/{id}/departments`
- **Empty** "No skills have been added yet." — for a DM, plus Create
- **Filtered empty** "No skills match *{q}*." with a clear-filters action
- **Loading** list skeleton · **Error** standard
- **Permission** write controls are absent for non-DMs, never disabled
- **Mobile** single column list, filters in a sheet
- **Desktop** two-pane: categories left, skills right
- **Note** `q` is the only server-side text search in the API; the design does not imply search elsewhere.

### A05 — My skills

- **Purpose** Maintain the profile Team Finder matches on.
- **Actor** everyone · **Entry** Skills → My skills, Home
- **Content** the user's skills with level and experience **using the backend's own labels**; add via catalogue search
- **Primary CTA** Add a skill · **Secondary** edit level/experience inline; remove
- **Data** `GET/POST/PATCH/DELETE /me/skills`, `GET /skills?q=`
- **Empty** "Your skill profile is empty. Team Finder matches people to projects using these." + Add
- **Loading** skeleton · **Error** `409` "You have already assigned this skill." shown against the picker
- **Permission** self-scoped; no permission state possible
- **Mobile** stacked cards with level/experience as selects
- **Desktop** table with inline editing
- **Note** Removal is confirmed and states the Team Finder consequence (P5).

### A06 — Project overview

- **Purpose** Everything about one project in one payload.
- **Actor** everyone · **Entry** any project link
- **Content** name, status, period, dates, manager, technology stack, team-role requirements **with required vs filled counts**, active members, past members
- **Primary CTA** PM only: Find team · **Secondary** PM: Edit, Propose removal. Everyone: open Team tab
- **Data** `GET /projects/{id}/details`
- **Empty** "No one is allocated yet." — with Find team for the PM, plain for everyone else
- **Loading** header first, then sections · **Error** standard; `404` → A10
- **Permission** read is open to all authenticated users; management actions appear only for the managing PM
- **Mobile** stacked sections; requirements table becomes stacked rows
- **Desktop** two-column: details left, team right
- **Note** The gap between `requiredMembers` and allocated members is the screen's most valuable derived number and is shown per role.

### A07 — Project team

- **Purpose** Who is on the project, who is proposed, and who has left.
- **Actor** everyone · **Entry** A06 tab
- **Content** three **separate** groups — proposed (pending), active, past — never merged (P1). Active rows carry `proposedBy`, `approvedBy`, `approvedAt`; past rows carry `deallocationReason` and who approved it
- **Primary CTA** PM: Propose removal on an active row
- **Secondary** open a member
- **Data** `GET /projects/{id}/team`
- **Empty** per group; "No one is allocated to this project yet."
- **Loading** skeleton · **Error** standard
- **Permission** actions only for the managing PM
- **Mobile** grouped stacked rows with a detail sheet
- **Desktop** three tables under headings

### A08 — My projects

- **Purpose** What the signed-in person is working on and has worked on.
- **Actor** everyone · **Entry** Home, Projects
- **Content** current and past projects with role and daily hours
- **Primary CTA** none · **Secondary** open a project
- **Data** `GET /me/projects`
- **Empty** "You are not allocated to any project yet." + a pointer to A05
- **Loading** skeleton · **Error** standard
- **Permission** self-scoped
- **Mobile** stacked cards · **Desktop** two tables
- **Note** This response also carries `userName` — the cheapest source of the current user's display name (§C-11).

### A09 / A10 / A11 — Permission denied · Not found · Something went wrong

- **Purpose** Explain a dead end without leaking information.
- **Actor** everyone
- **Content** A09: what the user lacks in capability terms ("Only a department manager can review staffing requests"), never what the object contains. A10: the object does not exist or is not visible to you — deliberately ambiguous, because distinguishing them leaks existence. A11: a short apology, the request id from `X-Request-ID`, and a retry
- **Primary CTA** Go home / Retry
- **Data** none
- **Note** The request id is included because the backend correlates logs by it (`docs/backend/logging.md`); it makes a support conversation possible without exposing anything sensitive.

---

# ORGANIZATION ADMIN

### O01 — People · O02 — Person detail and roles

- **Purpose** See everyone and control what they may do.
- **Entry** People
- **Content** O01: name, email, roles, client-side filter by role. O02: identity plus a role editor
- **Primary CTA** O02: Save roles · **Secondary** open person
- **Data** `GET /users`, `GET /users/{userId}`, `PATCH /users/{userId}/roles`
- **Empty** "Only you so far. Share the invite link to add people." → deep-links to O09
- **Filtered empty** standard
- **Loading** table skeleton · **Error** standard
- **Permission** `403` → A09 for anyone else
- **Mobile** stacked rows, roles as chips
- **Desktop** table
- **Note** At least one role is mandatory (`@Size(min = 1)`), so the editor prevents clearing the last role rather than letting the server reject it. **No pagination exists** — the list is client-side filtered and states its total (P6).

### O03 — Departments · O04 — Department detail · O05 — Department form · O06 — Appoint manager

- **Purpose** Maintain organization structure.
- **Entry** Organization → Departments
- **Content** O03: name, manager, `memberCount`. O04: the department with its manager and member count. O05: name only. O06: a user picker
- **Primary CTA** New department / Save / Appoint manager
- **Secondary** edit, delete, remove manager
- **Data** `GET/POST/PATCH/DELETE /departments`, `GET /departments/{id}`, `PUT/DELETE /departments/{id}/manager`, `GET /users`
- **Empty** "No departments yet. Departments hold people and review staffing requests." + Create
- **Loading** skeleton · **Error** `409` duplicate name at form level; `409` on delete when the department is not empty
- **Permission** `403` → A09
- **Mobile** stacked rows; forms full-screen
- **Desktop** table; forms in a drawer ([06-ux-patterns.md](06-ux-patterns.md))
- **Note** O06's picker **marks users who already manage another department as unavailable**, because assigning them returns `409` (§C-4). O04 shows "No manager — staffing requests for this department cannot be reviewed" as a warning, since that is a real operational hole.

### O07 — Team roles · O08 — Team role form

- **Purpose** Maintain the vocabulary project managers staff against.
- **Entry** Organization → Team roles
- **Content** name, description, active; `?includeInactive=`
- **Primary CTA** New team role · **Secondary** edit, deactivate
- **Data** `GET/POST/PATCH/DELETE /team-roles`
- **Empty** "No team roles yet. Projects declare how many people they need per role." + Create — worded to explain the downstream consequence, because an empty list makes project creation confusing
- **Loading/Error/Permission** standard
- **Mobile/Desktop** as O03

### O09 — Invite link

- **Purpose** Control how people join.
- **Entry** Organization → Invite
- **Content** the URL with a copy control, `active`, `createdAt`. **No expiry is shown — invites never expire** (§C-14)
- **Primary CTA** Copy link · **Secondary** Rotate link
- **Data** `GET /organizations/current/invite`, `POST /organizations/current/invite/rotate`
- **Empty** none; an invite always exists
- **Loading** skeleton · **Error** standard
- **Permission** `403` → A09
- **Mobile** URL wraps with a full-width copy button
- **Desktop** single-line field with the copy control inline
- **Note** Rotation is treated as destructive: the dialog states that the existing link stops working immediately — and since invites never expire, **rotation is the only revocation mechanism**, which makes it the more important control on this screen rather than the lesser one.

---

# DEPARTMENT MANAGER

### D01 — Review queue

- **Purpose** The department manager's inbox. The most important screen in the product for this role.
- **Entry** Staffing, Home, the sidebar indicator
- **Content** one merged feed of assignment and deallocation proposals, distinguished by `proposalType`; status filter (`PENDING` default, `APPROVED`, `REJECTED`)
- **Primary CTA** open a proposal → D02/D03 · **Secondary** filter; accept/reject inline where context is sufficient
- **Data** `GET /department/project-proposals?status=`
- **Empty** "No proposals waiting." presented as a *good* state, not an error
- **Filtered empty** "No {status} proposals."
- **Loading** row skeletons · **Error** standard
- **Permission** `403` → A09
- **Mobile** stacked cards, each with accept/reject
- **Desktop** table with a detail drawer

### D02 — Assignment review

- **Purpose** Decide on a staffing request with enough context to be accountable.
- **Entry** D01
- **Content** employee, their department, project and its status, requested team roles, `workHoursPerDay`, the PM's `comments`, who proposed it and when, and the **capacity block** the response supplies — allocated now, available now, and the projection after acceptance
- **Primary CTA** Accept · **Secondary** Reject · Back to queue
- **Data** `GET /department/project-proposals`, `POST …/assignments/{id}/accept|reject`
- **Empty** n/a
- **Loading** action-level spinner; the panel stays readable
- **Error** three distinct `409`s, each with its own treatment (§C-7): *already reviewed* → show who decided and refresh; *already allocated on this project*; **and capacity no longer sufficient — the proposal stays `PENDING`, so the panel keeps reject available and explains that accepting is currently impossible.** This is a first-class state, not a toast
- **Permission** `403` → A09
- **Mobile** full-screen detail
- **Desktop** right-hand drawer over the queue, so the next item stays visible
- **Note** Reject opens PR-D and takes an **optional** reason. Genuinely optional: the confirm button stays enabled with the box empty. Capacity figures come from the payload and are absent — not zeroed — where `capacity` is null.

### D03 — Deallocation review

- As D02, with the PM's **required** `reason` shown in full and never truncated —
  it is the substance of the decision. Accept moves the person from active to past
  on the project; the reason is stored permanently and appears on
  `ProjectPastMemberResponse`. **No capacity block**: `capacity` is null on
  removal rows because accepting frees capacity and can never fail on it. Reject
  takes its own optional reason, stored separately from the proposer's.

### D04 — My department · D05 — Unassigned employees

- **Purpose** Keep membership accurate.
- **Entry** People
- **Content** D04: members with name, email, roles. D05: people in the organization with no department
- **Primary CTA** D05: Add to my department · **Secondary** D04: Remove member
- **Data** `GET /departments/{id}/members`, `GET /departments/unassigned-employees`, `POST/DELETE /departments/{deptId}/members/{userId}`
- **Empty** D04: "No members yet." D05: "Everyone in the organization has a department." — a *good* empty state, worded as one
- **Loading** skeleton · **Error** standard
- **Permission** `403` → A09; the department id comes from `GET /department/projects` (§C-4), so this screen depends on that call resolving first — a dependency the frontend architecture task must handle explicitly
- **Mobile** stacked rows with a single action each
- **Desktop** two panes side by side, so adding is one movement
- **Note** `POST` returns **`200`, not `201`**. Removal is confirmed and names the person.

### D06 — Department projects

- **Purpose** What the department's people are committed to.
- **Entry** Projects
- **Content** projects with status and the department's members on each; `?status=` filter
- **Primary CTA** none · **Secondary** open a project
- **Data** `GET /department/projects`
- **Empty** "No projects involve this department yet."
- **Loading/Error/Permission** standard
- **Mobile** stacked cards · **Desktop** table

### D07 — Skill catalogue management

- **Purpose** Maintain the shared vocabulary.
- **Entry** Skills, when the role set includes DM
- **Content** A03 plus create/edit/deactivate for skills and categories, and link/unlink to **their own** department
- **Primary CTA** New skill · **Secondary** New category, edit, deactivate, link to my department
- **Data** `POST/PATCH/DELETE /skills`, `/skill-categories`, `POST/DELETE /skills/{id}/departments/current`
- **Empty/Filtered empty** as A03
- **Loading/Error/Permission** standard
- **Mobile/Desktop** as A03
- **Note** The link endpoint is `/current`, so there is **no department picker** — a manager links to their own department only.

---

# PROJECT MANAGER

### M01 — My projects (managed)

- **Purpose** The PM's working set, ordered by what needs attention.
- **Entry** Projects
- **Content** name, status, period, dates, and **staffing gap** per project
- **Primary CTA** New project · **Secondary** `?status=` filter, open a project
- **Empty** "No projects yet." + Create
- **Data** `GET /projects/managed?status=`, plus `GET /projects/{id}/details` per project for gaps
- **Loading** skeleton; gap figures fill in progressively
- **Error** standard
- **Permission** `403` → A09
- **Mobile** stacked cards · **Desktop** table
- **Note** Gap calculation costs one request per project — no aggregate endpoint exists. Fine at ten projects, a problem at fifty; recorded as an open question rather than designed around.

### M02 — Create project · M03 — Project settings

- **Purpose** Define the work and what it needs.
- **Entry** M01, A06
- **Content** name, period, start date, deadline, status, description, technology stack (repeatable), team-role requirements (role + count)
- **Primary CTA** Create project / Save changes
- **Secondary** M03: change status, delete project
- **Data** `POST /projects`, `PATCH /projects/{id}`, `DELETE /projects/{id}?confirmed=true`, `GET /team-roles`
- **Empty** if no team roles exist, the requirements section says so and links to O07 with an explanation of who can create them
- **Loading** disabled form · **Error** `400` at form level plus mirrored client-side rules; **`409` on delete rendered as an explanation** — deletability depends on status *history* and cannot be predicted from the payload (§C-8); `409` on activation names the capacity rule
- **Permission** `403` → A09
- **Mobile** single column, repeatable groups stack
- **Desktop** two columns with the repeatable groups full width
- **Note** Single page with sections, **not a wizard** — reasoning in [06-ux-patterns.md](06-ux-patterns.md). Delete lives at the bottom of M03, never in the page header.

### M04 — Team Finder · M05 — Candidate detail

- **Purpose** Find people who can do the work, and understand why they rank as they do.
- **Entry** A06, M01, Staffing
- **Content** project context header; criteria controls; ranked candidates with score breakdown, availability, matched skills and past projects — full treatment in [07-wireframes.md](07-wireframes.md)
- **Primary CTA** Propose → M06 · **Secondary** adjust criteria and re-run, compare, open candidate
- **Data** `POST /projects/{id}/team-finder`
- **Empty** **two distinct states**: no candidates matched the criteria (offer to widen); or the project declares no technologies or role requirements, so the score has no inputs (send to M03)
- **Loading** skeleton rows; the echoed `criteria` renders as soon as the response lands
- **Error** standard; `403` for a project they do not manage
- **Permission** `403` → A09
- **Mobile** ranked cards with a detail sheet; never a shrunken table
- **Desktop** split view — list left, detail right
- **Note** The screen always shows the criteria **the response used**, not the form's current state.

### M06 — Propose assignment · M07 — Propose removal

- **Purpose** Ask the department manager for a decision.
- **Entry** M04/M05 (M06); A07 active row (M07)
- **Content** M06: candidate, team roles (multi-select, at least one), `workHoursPerDay` against remaining capacity, optional comments. M07: the member, the allocation, and a **required** reason
- **Primary CTA** Send proposal / Propose removal
- **Secondary** cancel
- **Data** `POST /projects/{id}/assignment-proposals`, `POST /projects/{id}/allocations/{allocationId}/deallocation-proposals`
- **Empty** n/a
- **Loading** disabled form
- **Error** `400` validation; `409` capacity — all three capacity conflicts are preventable client-side from Team Finder's `availableHours`, so the form guards them rather than letting the manager discover them on submit
- **Permission** `403` → A09
- **Mobile** full-screen form · **Desktop** modal over the context that launched it
- **Note** M06's confirmation names the **reviewing department**. M07 states that the reason is stored permanently and will appear on the project's past members.
