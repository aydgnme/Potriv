# 03 — Core user journeys

Phase 4. Every journey is mapped against real endpoints and the real error
contract from [00-repository-reality.md](00-repository-reality.md) §C-13:
`400` validation · `401` unauthorized · `403` forbidden · `404` not found ·
`409` conflict, with a single human-readable `message`.

Format for each journey: **actor · trigger · preconditions · happy path ·
alternative path · validation errors · authorization errors · empty state ·
confirmation points · success feedback · next action.**

---

# A. Authentication

## A1 — Organization admin registration

- **Actor** — a person with no account, founding an organization
- **Trigger** — arrives at the marketing/entry URL and chooses to create an organization
- **Preconditions** — none; this is the only fully public write endpoint
- **Happy path** — `POST /auth/register-admin` with name, email, password,
  organization name, headquarter address → `201` `RegisterAdminResponse` carrying
  `organizationId` and `employeeInviteUrl` → the user is sent to sign in
- **Alternative path** — none. Registration returns an identity, **not a session**
  (§C-9), so the flow ends at the login screen, pre-filled with the email
- **Validation errors** — `400`: blank name, invalid email, password outside
  8–72 characters, missing organization name or address. Mirrored client-side
  (§C-13)
- **Authorization errors** — none possible
- **Empty state** — n/a
- **Confirmation points** — none. Creating an organization is not destructive
- **Success feedback** — the invite URL is shown **once, prominently**, with an
  explicit "you can find this again under Organization → Invite" so the user
  does not believe it is lost
- **Next action** — sign in → the org admin's empty-organization home

## A2 — Employee registration via invite token

- **Actor** — an invited person
- **Trigger** — opens the invite URL (`…?token=…`)
- **Preconditions** — the invite is active and unexpired
  (`EmployeeInviteResponse.active`, `expiresAt`)
- **Happy path** — token is read from the URL → `POST /auth/register-employee/{inviteToken}`
  with name, email, password → `201` → sent to sign in
- **Alternative path** — the URL is opened with no token, or a malformed one:
  a dedicated "this invite link is not valid" screen, not a form that fails on submit
- **Validation errors** — `400` as A1
- **Authorization errors** — `404`/`400` for an unknown or rotated token. The copy
  must say the link is no longer valid and to ask the organization admin for a
  new one — **never** that the organization does not exist
- **Empty state** — n/a
- **Confirmation points** — none
- **Success feedback** — "Account created. Sign in to continue."
- **Next action** — sign in → employee home, which will show **no projects and no
  skills**. That empty state is the first real onboarding moment (P9)

## A3 — Login

- **Actor** — any registered user
- **Trigger** — visits any authenticated route without a valid token, or signs out
- **Preconditions** — an active account
- **Happy path** — `POST /auth/login` → `TokenPairResponse` → `GET /auth/me` for
  `userId`, `organizationId`, `roles[]` → redirect to the originally requested
  route, or to home
- **Alternative path** — the user arrived from a deep link; the target is
  preserved and restored after login
- **Validation errors** — `400` for a malformed email or a password shorter than 8
- **Authorization errors** — `401` for bad credentials. One message for both wrong
  email and wrong password — never distinguish them. A locked account
  (`ACCOUNT_LOCKED` is a real audit event) must surface as the backend words it,
  without revealing thresholds
- **Empty state** — n/a
- **Confirmation points** — none
- **Success feedback** — navigation itself; no toast
- **Next action** — role-aware home

## A4 — Session management

- **Actor** — any authenticated user
- **Trigger** — Account → Sessions
- **Preconditions** — signed in
- **Happy path** — `GET /auth/sessions` → a table of sessions with `createdAt`,
  `lastSeenAt`, `userAgent`, `ipAddress`, and the row where `currentSession` is
  true clearly marked → revoke another session with `DELETE /auth/sessions/{id}`
- **Alternative path** — "Sign out everywhere" → `POST /auth/logout-all`, which
  ends **this** session too and returns the user to login
- **Validation errors** — none
- **Authorization errors** — `404` if the session id is not the caller's
- **Empty state** — impossible; the current session is always present
- **Confirmation points** — revoking a session ("that device will have to sign in
  again"); `logout-all` ("this signs you out here too")
- **Success feedback** — the row disappears and the list re-reads
- **Next action** — stay on the page

## A5 — Forgot password / reset

- **Actor** — a user who cannot sign in
- **Trigger** — "Forgot password" on the login screen
- **Preconditions** — none
- **Happy path** — `POST /auth/password-reset/request` → `202` → a neutral
  confirmation ("If an account exists for that address, we have sent a link") →
  the user opens the emailed link → `POST /auth/password-reset/confirm` with the
  token and new password → `204` → login
- **Alternative path** — the link is expired or already used: a screen offering to
  request a new one
- **Validation errors** — `400`: invalid email on request; new password outside
  8–72 on confirm
- **Authorization errors** — `400`/`404` on a bad token, worded as "this link is
  no longer valid"
- **Empty state** — n/a
- **Confirmation points** — none
- **Success feedback** — "Password updated. Sign in with your new password."
- **Next action** — login. **The response is `204` with no token pair**, so an
  automatic sign-in would be inventing behaviour

---

# B. Organization setup

## B1 — First organization setup

- **Actor** — organization admin, immediately after A1
- **Trigger** — first sign-in
- **Preconditions** — the organization exists and contains only them
- **Happy path** — home presents an ordered setup path, because everything is
  empty at once: **1)** create departments (`POST /departments`) → **2)** create
  team roles (`POST /team-roles`) → **3)** share the invite link → **4)** as
  people arrive, grant roles (`PATCH /users/{id}/roles`) and appoint department
  managers (`PUT /departments/{id}/manager`)
- **Alternative path** — the admin skips ahead; each area's own empty state
  repeats what is missing and why it matters
- **Validation errors** — `400` blank names; `409` duplicate department name
- **Authorization errors** — n/a
- **Empty state** — **this journey is nothing but empty states**, which is why P9
  treats them as the onboarding path
- **Confirmation points** — none in setup; creation is additive
- **Success feedback** — the setup path visibly advances
- **Next action** — the honest one: **the org admin cannot finish onboarding
  alone.** Placing people into departments is `@DepartmentManagerOnly`, so the
  final step of the setup path reads "appoint a department manager — they add
  people to the department" ([02-personas-and-roles.md](02-personas-and-roles.md))

## B2 — Invite URL discovery and rotation

- **Actor** — organization admin
- **Trigger** — Organization → Invite
- **Preconditions** — org admin role
- **Happy path** — `GET /organizations/current/invite` → `inviteUrl`, `active`,
  `createdAt`, `expiresAt` → copy to clipboard
- **Alternative path** — rotate: `POST /organizations/current/invite/rotate` → a
  new `inviteUrl`
- **Validation errors** — none
- **Authorization errors** — `403` for anyone else
- **Empty state** — none; an invite always exists
- **Confirmation points** — **rotation is the risky one.** The dialog must state
  that the current link stops working immediately and anyone part-way through
  signing up with it will be blocked. This is destructive in effect even though
  no `DELETE` is involved
- **Success feedback** — the new URL replaces the old one, with the old one gone
  from the screen rather than greyed out
- **Next action** — re-share the link

---

# C. Department management

## C1 — Create / edit department

- **Actor** — organization admin
- **Trigger** — Departments → New, or a row's Edit
- **Preconditions** — org admin role
- **Happy path** — `POST /departments` `{name}` → `201`; or `PATCH /departments/{id}`
- **Alternative path** — none
- **Validation errors** — `400` blank or over 160 characters; `409` duplicate name
  shown at form level (§C-13)
- **Authorization errors** — `403`
- **Empty state** — "No departments yet. Departments hold people and review
  staffing requests." + Create
- **Confirmation points** — none
- **Success feedback** — the row appears/updates and is briefly highlighted
- **Next action** — appoint a manager (C2) — surfaced directly from the new row

## C2 — Assign / remove department manager

- **Actor** — organization admin
- **Trigger** — a department has no manager, or needs a different one
- **Preconditions** — the target user exists in the organization
- **Happy path** — pick a user from `GET /users` → `PUT /departments/{id}/manager`
  `{userId}` → `DepartmentResponse` with the new manager
- **Alternative path** — remove: `DELETE /departments/{id}/manager` → the
  department has no reviewer for staffing proposals until one is appointed, which
  the UI must state
- **Validation errors** — `400` missing `userId`
- **Authorization errors** — `403`
- **Empty state** — "No manager. Staffing requests for this department cannot be
  reviewed until one is appointed."
- **Confirmation points** — **two distinct ones.** Replacing an existing manager
  names both people. Assigning someone who already manages another department
  returns `409` "User already manages another department" (§C-4) — the picker
  should therefore mark such users as unavailable rather than letting the user
  discover it on submit
- **Success feedback** — the manager name appears on the department
- **Next action** — the appointed manager adds members (C3)

## C3 — Add / remove department member

- **Actor** — department manager (their own department only)
- **Trigger** — new joiners appear in unassigned employees
- **Preconditions** — the caller manages a department
- **Happy path** — `GET /departments/unassigned-employees` → choose a person →
  `POST /departments/{deptId}/members/{userId}` → `200` `DepartmentUserResponse`
  (note: **`200`, not `201`**)
- **Alternative path** — remove: `DELETE /departments/{deptId}/members/{userId}` → `204`
- **Validation errors** — none; identifiers are path variables
- **Authorization errors** — `403` for a department they do not manage — enforced
  by `requireManagedDepartment`, not by the annotation (P7)
- **Empty state** — "Everyone in the organization has a department." — a *good*
  empty state, and worded as such
- **Confirmation points** — **removal.** The person may be allocated to projects;
  the dialog names them and says they leave the department
- **Success feedback** — the person moves between the two lists in place
- **Next action** — continue through the unassigned list

## C4 — Delete department

- **Actor** — organization admin
- **Trigger** — a department is no longer needed
- **Preconditions** — org admin role
- **Happy path** — `DELETE /departments/{id}` → `204`
- **Alternative path** — `409` when the department still has a manager or members
- **Validation errors** — none
- **Authorization errors** — `403`
- **Empty state** — n/a
- **Confirmation points** — **required.** Name the department and its
  `memberCount`, which `DepartmentResponse` already provides
- **Success feedback** — the row disappears
- **Next action** — back to the list

---

# D. Skills

## D1 — Manage categories and the skill catalogue

- **Actor** — department manager
- **Trigger** — a needed skill is missing from the catalogue
- **Preconditions** — department-manager role
- **Happy path** — `POST /skill-categories` → `POST /skills` `{categoryId, name, description}`
  → `201`
- **Alternative path** — edit (`PATCH`), or deactivate. Both skills and categories
  carry `active`, and lists default to active-only with `?includeInactive=true`
  available — so the UI offers "show inactive" rather than pretending inactive
  records do not exist
- **Validation errors** — `400` blank name; `409` duplicate within a category
- **Authorization errors** — `403` for employees, org admins and project managers
  — **reads are open to everyone, writes are not.** The catalogue is therefore
  browsable by all and editable by few, and the UI simply omits the write
  controls rather than showing them disabled
- **Empty state** — "No skills yet. Skills are what Team Finder matches people
  on." + Create, for a department manager; for everyone else, "No skills have
  been added yet."
- **Confirmation points** — deletion, which may be referenced by employee skills
  and by project technology stacks
- **Success feedback** — inline row update
- **Next action** — link the skill to departments (D2)

## D2 — Link a skill to a department

- **Actor** — department manager
- **Trigger** — the skill is relevant to their department
- **Preconditions** — the skill exists
- **Happy path** — `POST /skills/{skillId}/departments/current` → the updated link list
- **Alternative path** — `DELETE /skills/{skillId}/departments/current` → `204`
- **Validation errors** — none
- **Authorization errors** — `403`
- **Empty state** — "Not linked to any department yet."
- **Confirmation points** — none; the action is cheap and reversible
- **Success feedback** — the department chip appears on the skill
- **Next action** — back to the catalogue. Note the endpoint is `/current` — a
  manager links a skill **to their own department only**, so there is no
  department picker

## D3 — Employee manages their own skills

- **Actor** — employee (any user)
- **Trigger** — the skill profile is empty or out of date
- **Preconditions** — signed in
- **Happy path** — browse `GET /skills` (with `?q=` — §C-2, the only text search
  in the API) → `POST /me/skills` `{skillId, level, experience}` → `201`
- **Alternative path** — `PATCH /me/skills/{id}` to change level or experience;
  `DELETE /me/skills/{id}` to remove
- **Validation errors** — `400` unknown skill or invalid enum; `409` if the skill
  is already on the profile
- **Authorization errors** — none. The endpoint is self-scoped: a user can only
  ever act on their own profile, which is why there is no "whose skills" concept
- **Empty state** — "Your skill profile is empty. Team Finder matches people to
  projects using these." — the only honest motivation, per P5
- **Confirmation points** — **removal.** It changes whether Team Finder can find
  them, and the dialog says exactly that
- **Success feedback** — the chip appears with its level and experience labels
  **as the backend supplies them** ("Knows", "1-2 years") — never re-worded
- **Next action** — add another, or return home

---

# E. Projects

## E1 — Create project

- **Actor** — project manager
- **Trigger** — new work
- **Preconditions** — project-manager role; team roles exist (created by the org admin)
- **Happy path** — `POST /projects` with name, period, `startDate`, optional
  `deadlineDate`, status, description, `technologyStack[]`, `teamRoles[]`
  (role + required member count) → `201` `ProjectResponse`
- **Alternative path** — save with only the required fields and add the technology
  stack and role requirements afterwards by `PATCH`
- **Validation errors** — `400`: blank name, name over 200, missing period,
  missing `startDate`, missing status, description over 10 000, a technology entry
  over 160. Because the server returns one joined string (§C-13), every one of
  these is mirrored client-side
- **Authorization errors** — `403` for non-PMs
- **Empty state** — "No projects yet." + Create
- **Confirmation points** — none for creation
- **Success feedback** — land on the new project's page, not back on the list —
  the next action lives there
- **Next action** — **Find team** (F1). A project with role requirements and no
  people is the entire reason Team Finder exists

## E2 — Edit project / lifecycle transition

- **Actor** — project manager (own projects)
- **Trigger** — scope, dates or stage change
- **Preconditions** — the caller manages the project
- **Happy path** — `PATCH /projects/{id}` with only changed fields → `ProjectResponse`
- **Alternative path** — a status change is the same call but deserves its own
  control, because its consequences differ from renaming
- **Validation errors** — `400` as E1
- **Authorization errors** — `403` for another manager's project
- **Conflicts (`409`)** — **activating a project can be refused.** Moving from a
  non-capacity-consuming status to a capacity-consuming one runs
  `AllocationProjectStatusChangeGuard`, which rejects the change if any already
  allocated employee would exceed 8 hours per day once this project starts
  counting: `"Activating this project would exceed an allocated employee's 8 hour
  daily capacity."` The manager must then deallocate someone (H1) — which itself
  needs department-manager approval. The UI has to explain that chain, because
  the message alone does not say who is over capacity
- **Empty state** — n/a
- **Confirmation points** — **moving to `IN_PROGRESS`.** It makes allocations
  capacity-consuming and permanently blocks deletion (§C-8). The dialog says both
- **Success feedback** — the status badge changes; a toast names the new status
- **Next action** — stay on the project

## E3 — Delete project

- **Actor** — project manager (own projects)
- **Trigger** — the project was created in error or abandoned before starting
- **Preconditions** — the project never reached `IN_PROGRESS`, `CLOSING` or `CLOSED`
- **Happy path** — confirm → `DELETE /projects/{id}?confirmed=true` → `204`
- **Alternative path** — **`409` "This project has progressed beyond planning and
  can no longer be deleted."** This is not an edge case: the guard is on status
  *history*, so a project moved back to `NOT_STARTED` still refuses (§C-8), and
  the UI **cannot** predict it from `ProjectResponse.status`. The `409` is
  therefore rendered as an explanation, not as a failure
- **Validation errors** — `400` if `confirmed` is missing, which the UI never
  triggers because its confirmation dialog is what sets it
- **Authorization errors** — `403`
- **Empty state** — n/a
- **Confirmation points** — required, typed against the project name
- **Success feedback** — return to the project list with a toast
- **Next action** — the project list

## E4 — Inspect project details

- **Actor** — any authenticated user
- **Trigger** — a link from anywhere
- **Preconditions** — signed in
- **Happy path** — `GET /projects/{id}/details` → one payload with status, period,
  dates, manager, technology stack, role requirements, active members and past
  members
- **Alternative path** — a project manager sees management actions on the same
  screen; everyone else sees the same information read-only
- **Validation errors** — none
- **Authorization errors** — none by role; `404` for an unknown id
- **Empty state** — "No one is allocated yet." with **Find team** for the manager
- **Confirmation points** — none
- **Success feedback** — n/a
- **Next action** — Team Finder, or the team view

---

# F. Team Finder

## F1 — Open Team Finder and read candidates

- **Actor** — project manager (own projects)
- **Trigger** — a project has unmet role requirements
- **Preconditions** — the project exists and has a technology stack and/or role
  requirements — **without them the score has almost nothing to work with**, and
  the empty state must say so
- **Happy path** — `POST /projects/{id}/team-finder` with criteria
  (`includePartiallyAvailable`, `includeCloseToFinish`, `closeToFinishWeeks`,
  `includeUnavailable`, `limit`) → `TeamFinderResponse` with `candidateCount` and
  ranked `candidates[]`
- **Alternative path** — widen the criteria and re-run. The response echoes the
  `criteria` it used, so the UI always shows the search that produced the results
  rather than the form's current state
- **Validation errors** — `400` for an out-of-range `limit` or `closeToFinishWeeks`
- **Authorization errors** — `403` for a project they do not manage
- **Empty state** — two genuinely different ones, and conflating them would be a
  design failure: **(a)** no candidates matched the criteria → offer to include
  partially available / close-to-finish / unavailable people; **(b)** the project
  declares no technologies or role requirements → send the manager to edit the
  project, because the score has no inputs
- **Confirmation points** — none; searching is free
- **Success feedback** — the result count and the criteria that produced it
- **Next action** — compare candidates, then propose (F2)

## F2 — From candidate to assignment proposal

- **Actor** — project manager
- **Trigger** — a suitable candidate is identified
- **Preconditions** — the candidate has remaining capacity, or the manager is
  knowingly over-committing them
- **Happy path** — select the candidate → choose team roles and `workHoursPerDay`
  → optional comments → `POST /projects/{id}/assignment-proposals` → `201`
  `AssignmentProposalResponse` with status `PENDING`
- **Alternative path** — none. There is no direct-assign endpoint. **A PM cannot
  staff a project unilaterally**, and the UI must never imply otherwise (P1)
- **Validation errors** — `400`: missing `employeeId`, `workHoursPerDay` below 1,
  empty `teamRoleIds`, comments over 5 000
- **Conflicts (`409`)** — capacity is enforced **here as well as at review time**:
  `"workHoursPerDay exceeds the 8-hour daily maximum."`, `"The employee has no
  available capacity."`, and a request for more hours than the employee has left.
  Team Finder already returns `availableHours`, so the form can prevent all three
  client-side rather than letting the manager discover them on submit
- **Authorization errors** — `403`
- **Empty state** — n/a
- **Confirmation points** — the form is the confirmation, but it must show the
  candidate's remaining capacity against the requested hours, and name the
  **department that will review it** (`reviewDepartment` in the response, known
  from the candidate's department beforehand)
- **Success feedback** — "Proposal sent to {department}. They will accept or
  reject it." — the wait is the point and is stated plainly
- **Next action** — return to Team Finder to fill the next gap, with the proposed
  candidate now marked as proposed

---

# G. Allocation workflow

## G1 — Department manager reviews an assignment proposal

- **Actor** — department manager
- **Trigger** — a proposal targets one of their members
- **Preconditions** — they manage the review department
- **Happy path** — `GET /department/project-proposals?status=PENDING` →
  `DepartmentProjectProposalResponse[]` (a merged feed: `proposalType`
  distinguishes assignment from deallocation) → open one → accept:
  `POST …/assignments/{id}/accept` → `AssignmentReviewResponse` containing both
  the updated proposal and the created `allocation`
- **Alternative path** — reject: `POST …/assignments/{id}/reject` → the same
  response shape with no active allocation
- **Validation errors** — none; there is no request body
- **Authorization errors** — `403` for another department's proposal
- **Conflicts (`409`) — the most important states on this screen.** Three are
  real and each needs its own treatment:
  1. `"This proposal has already been reviewed."` — someone got there first.
     Render as "already decided by {reviewedBy} on {reviewedAt}" from the payload,
     and refresh the queue
  2. `"The employee already has an active allocation on this project."`
  3. **`"The employee no longer has enough available capacity for this proposal."`**
     Capacity is recalculated at accept time, so a proposal that was valid when
     sent can become unacceptable while it waits. Critically, the backend
     comment is explicit that **the proposal stays `PENDING`** — the manager may
     still reject it later. So this is not an error state to dismiss; it is a
     *pending proposal that cannot currently be accepted*, and the queue must be
     able to show it as such, with reject still available
- **Empty state** — "No proposals waiting." — for this role the *good* state, and
  it should read that way rather than as an error
- **Confirmation points** — **both decisions.** Accept: the employee, the project,
  the requested hours and roles. Reject: **state explicitly that no reason is
  sent**, because the API has no field for one (§C-5, P4)
- **Success feedback** — the row leaves the pending queue; the decision and
  `reviewedAt` are shown
- **Next action** — the next pending proposal; the queue is a work list

## G2 — Resulting project team state

- **Actor** — project manager (and anyone reading the project)
- **Trigger** — a decision was made
- **Preconditions** — none
- **Happy path** — `GET /projects/{id}/team` → three distinct groups:
  `proposedMembers` (still pending), `activeMembers` (allocated, with
  `proposedBy`, `approvedBy`, `approvedAt`), `pastMembers` (with
  `deallocationReason` and who approved it)
- **Alternative path** — none
- **Validation errors** — none
- **Authorization errors** — none by role
- **Empty state** — "No one is allocated to this project yet."
- **Confirmation points** — none; this is a read
- **Success feedback** — n/a
- **Next action** — propose more people, or deallocate (H1)

---

# H. Deallocation workflow

## H1 — Project manager initiates deallocation

- **Actor** — project manager (own projects)
- **Trigger** — someone is no longer needed
- **Preconditions** — an active allocation exists
- **Happy path** — from the project team, choose an active member → **enter a
  reason (required)** → `POST /projects/{id}/allocations/{allocationId}/deallocation-proposals`
  → `201`, status `PENDING`
- **Alternative path** — none; removal is never unilateral either
- **Validation errors** — `400` blank reason or over 5 000 characters. The reason
  is `@NotBlank`, so the submit control stays disabled until it is filled — this
  is the one place where a required free-text field genuinely gates the action
- **Authorization errors** — `403`
- **Empty state** — n/a
- **Confirmation points** — the form itself, with the reason visible, plus a
  statement that **the reason is stored permanently and will appear on the
  project's past members** (`ProjectPastMemberResponse.deallocationReason`).
  People write differently when they know that
- **Success feedback** — "Removal proposed. {department} will review it." The
  person stays on the active team until it is approved
- **Next action** — back to the project team

## H2 — Department manager reviews a deallocation

- **Actor** — department manager
- **Trigger** — a deallocation proposal targets one of their members
- **Preconditions** — they manage the review department
- **Happy path** — the same merged queue as G1, filtered by
  `proposalType` → accept: `POST …/deallocations/{id}/accept` →
  `DeallocationReviewResponse`
- **Alternative path** — reject → the person stays allocated
- **Validation errors** — none
- **Authorization errors** — `403`; `409` if already decided
- **Empty state** — shared with G1
- **Confirmation points** — accept, naming the employee, the project and the
  **reason the PM gave** — which is the substance of the decision and must be
  shown in full, not truncated
- **Success feedback** — the member moves from active to past on the project
- **Next action** — the next proposal

---

# I. Employee journeys

## I1 — View current projects and history

- **Actor** — employee
- **Trigger** — sign-in, or Home
- **Preconditions** — signed in
- **Happy path** — `GET /me/projects` → `currentProjects[]`, `pastProjects[]`,
  plus `userName` and `userEmail`, which is also the cheapest source of the
  current user's display name (§C-11)
- **Alternative path** — open a project → `GET /projects/{id}/details`
- **Validation errors** — none
- **Authorization errors** — none
- **Empty state** — "You are not allocated to any project yet." plus a pointer to
  the skill profile, because that is the only lever the employee actually has
- **Confirmation points** — none
- **Success feedback** — n/a
- **Next action** — open a project, or update skills (D3)

## I2 — Inspect own account

- **Actor** — employee
- **Trigger** — account menu
- **Preconditions** — signed in
- **Happy path** — `GET /auth/me` for email and roles; `GET /auth/sessions` for
  devices
- **Alternative path** — change password via the reset flow (A5) — **there is no
  authenticated change-password endpoint**, so the account screen links to the
  reset flow rather than showing a form that cannot submit
- **Validation errors** — none
- **Authorization errors** — none
- **Empty state** — n/a
- **Confirmation points** — session revocation (A4)
- **Success feedback** — n/a
- **Next action** — return home
