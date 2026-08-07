# 09 — Backend ↔ screen traceability

Phase 21. Every one of the **68 verified REST operations** appears exactly once
below, mapped to the screen that uses it. Nothing is omitted; operations that are
deliberately not in the product frontend say so and why.

Screen IDs refer to [05-screen-inventory.md](05-screen-inventory.md); wireframe
IDs (`W-`, `TF-`, `PR-`) to [07-wireframes.md](07-wireframes.md).

`R` read · `W` write · `D` destructive

---

## Authentication and account — 11 operations

| Operation | Screen | Actor | R/W | Notes |
| --- | --- | --- | :-: | --- |
| `POST /auth/register-admin` | P02 / — | public | W | Returns the invite URL; shown once, prominently |
| `POST /auth/register-employee/{inviteToken}` | P03 / W-02 | public | W | Returns an id, **not a session** — ends at login (§C-9) |
| `POST /auth/login` | P01 / W-01 | public | W | Followed immediately by `/auth/me` |
| `POST /auth/refresh` | app shell | all | W | Not a screen. Silent token refresh in the API client |
| `GET /auth/me` | shell + A02 / W-20 | all | R | `userId`, `organizationId`, `email`, `roles[]`. **No display name** (§C-11) |
| `POST /auth/password-reset/request` | P05 / W-03 | public | W | `202` always; the response never reveals whether the account exists |
| `POST /auth/password-reset/confirm` | P06 / W-03 | public | W | `204`, no tokens — no auto sign-in |
| `POST /auth/logout` | A02 / W-20 | all | W | |
| `POST /auth/logout-all` | A02 / W-20 | all | D | Ends the current session too; confirmed |
| `GET /auth/sessions` | A02 / W-20 | all | R | `currentSession` marks the row that cannot be revoked casually |
| `DELETE /auth/sessions/{sessionId}` | A02 / W-20 | all | D | Confirmed |

## Organization structure — 14 operations

| Operation | Screen | Actor | R/W | Notes |
| --- | --- | --- | :-: | --- |
| `GET /organizations/current/invite` | O09 / W-16 | ORG_ADMIN | R | Expiry in the past is a warning — it silently blocks onboarding |
| `POST /organizations/current/invite/rotate` | O09 / W-16 | ORG_ADMIN | D | **Destructive in effect**: the old link dies immediately. Confirmed |
| `GET /departments` | O03 / W-07 | ORG_ADMIN | R | Also the source for "departments without a manager" on Home |
| `GET /departments/{departmentId}` | O04 / W-08 | ORG_ADMIN | R | |
| `POST /departments` | O05 | ORG_ADMIN | W | `409` duplicate name at form level |
| `PATCH /departments/{departmentId}` | O05 | ORG_ADMIN | W | |
| `DELETE /departments/{departmentId}` | O04 / W-08 | ORG_ADMIN | D | Confirmed with `memberCount`; `409` when not empty |
| `PUT /departments/{departmentId}/manager` | O06 / W-08 | ORG_ADMIN | W | Picker marks users who already manage a department as unavailable (§C-4) |
| `DELETE /departments/{departmentId}/manager` | O04 / W-08 | ORG_ADMIN | D | Leaves the department unable to review staffing — stated in the dialog |
| `GET /team-roles` | O07, M02/M03 / W-14 | ORG_ADMIN, PROJ_MGR | R | `?includeInactive=` |
| `GET /team-roles/{teamRoleId}` | O08 | ORG_ADMIN | R | |
| `POST /team-roles` | O08 | ORG_ADMIN | W | |
| `PATCH /team-roles/{teamRoleId}` | O08 | ORG_ADMIN | W | |
| `DELETE /team-roles/{teamRoleId}` | O07 | ORG_ADMIN | D | Confirmed |

## People — 7 operations

| Operation | Screen | Actor | R/W | Notes |
| --- | --- | --- | :-: | --- |
| `GET /users` | O01 / W-05, O06 | ORG_ADMIN | R | No pagination; client-side filter with a stated total (P6) |
| `GET /users/{userId}` | O02 / W-06 | ORG_ADMIN | R | The only source of another user's display name |
| `PATCH /users/{userId}/roles` | O02 / W-06 | ORG_ADMIN | W | At least one role required — enforced client-side |
| `GET /departments/unassigned-employees` | D05 / W-09 | **DEPT_MGR** | R | Not available to the org admin — onboarding is split between roles |
| `GET /departments/{departmentId}/members` | D04 / W-10 | DEPT_MGR | R | Department id resolved via `GET /department/projects` (§C-4) |
| `POST /departments/{departmentId}/members/{userId}` | D05 / W-09 | DEPT_MGR | W | Returns **`200`, not `201`** |
| `DELETE /departments/{departmentId}/members/{userId}` | D04 / W-10 | DEPT_MGR | D | Confirmed by name |

## Skills — 17 operations

| Operation | Screen | Actor | R/W | Notes |
| --- | --- | --- | :-: | --- |
| `GET /skill-categories` | A03 / W-11 | all | R | `?includeInactive=` |
| `GET /skill-categories/{categoryId}` | A03 | all | R | |
| `POST /skill-categories` | D07 | DEPT_MGR | W | |
| `PATCH /skill-categories/{categoryId}` | D07 | DEPT_MGR | W | |
| `DELETE /skill-categories/{categoryId}` | D07 | DEPT_MGR | D | Confirmed; may be referenced by skills |
| `GET /skills` | A03 / W-11, A05 / W-12 | all | R | `?q=` — **the only server-side text search in the API** |
| `GET /skills/{skillId}` | A04 | all | R | |
| `POST /skills` | D07 | DEPT_MGR | W | |
| `PATCH /skills/{skillId}` | D07 | DEPT_MGR | W | |
| `DELETE /skills/{skillId}` | D07 | DEPT_MGR | D | Confirmed |
| `GET /skills/{skillId}/departments` | A04 | all | R | |
| `POST /skills/{skillId}/departments/current` | D07 | DEPT_MGR | W | `/current` — **no department picker exists or is needed** |
| `DELETE /skills/{skillId}/departments/current` | D07 | DEPT_MGR | D | Cheap and reversible — not confirmed |
| `GET /me/skills` | A05 / W-12, A01 / W-04 | all | R | |
| `POST /me/skills` | A05 / W-12 | all | W | `409` "You have already assigned this skill." |
| `PATCH /me/skills/{employeeSkillId}` | A05 / W-12 | all | W | Inline level/experience edit |
| `DELETE /me/skills/{employeeSkillId}` | A05 / W-12 | all | D | Confirmed, stating the Team Finder consequence |

## Projects — 9 operations

| Operation | Screen | Actor | R/W | Notes |
| --- | --- | --- | :-: | --- |
| `GET /projects/managed` | M01 / W-13, A01 / W-04 | PROJ_MGR | R | `?status=`. The **only** project list — there is no organization-wide one (§C-3) |
| `GET /projects/{projectId}` | M03 | PROJ_MGR | R | Edit form prefill |
| `POST /projects` | M02 / W-14 | PROJ_MGR | W | One page, four sections — not a wizard |
| `PATCH /projects/{projectId}` | M03 / W-14 | PROJ_MGR | W | Status change confirmed; `409` on activation when capacity would be exceeded |
| `DELETE /projects/{projectId}` | M03 | PROJ_MGR | D | `?confirmed=true`; `409` from status **history** and therefore unpredictable (§C-8) |
| `GET /projects/{projectId}/details` | A06 / W-15 | all | R | Also drives the staffing-gap figure on M01 and Home |
| `GET /projects/{projectId}/team` | A07 / W-17 | all | R | Proposed / active / past, kept strictly separate (P1) |
| `GET /department/projects` | D06 / W-19 | DEPT_MGR | R | `?status=`. Also **the only source of a manager's own `departmentId`** (§C-4) |
| `GET /me/projects` | A08 / W-18 | all | R | Also the cheapest source of the signed-in user's display name (§C-11) |

## Staffing — 8 operations

| Operation | Screen | Actor | R/W | Notes |
| --- | --- | --- | :-: | --- |
| `POST /projects/{projectId}/team-finder` | M04 / TF-A | PROJ_MGR | R | A `POST` that reads. Returns a decomposed score **plus its evidence** (§C-6) |
| `POST /projects/{projectId}/assignment-proposals` | M06 / TF-C | PROJ_MGR | W | Three capacity `409`s, all preventable client-side from `availableHours` |
| `POST /projects/{projectId}/allocations/{allocationId}/deallocation-proposals` | M07 / TF-C | PROJ_MGR | W | Reason is **required** and stored permanently |
| `GET /department/project-proposals` | D01 / PR-A | DEPT_MGR | R | `?status=`. Merged feed; `proposalType` distinguishes the two kinds |
| `POST …/assignments/{proposalId}/accept` | D02 / PR-A | DEPT_MGR | W | Capacity **recalculated**; on failure the proposal stays `PENDING` (PR-B) |
| `POST …/assignments/{proposalId}/reject` | D02 / PR-A | DEPT_MGR | W | **No reason field** — the UI says so before the click (§C-5) |
| `POST …/deallocations/{proposalId}/accept` | D03 / PR-C | DEPT_MGR | W | Moves the member to past with the stored reason |
| `POST …/deallocations/{proposalId}/reject` | D03 / PR-C | DEPT_MGR | W | The person stays allocated |

## Deliberately outside the product frontend — 2 operations

| Operation | Actor | Disposition |
| --- | --- | --- |
| `GET /admin/security/audit-events` | SYSTEM_ADMIN | **OUT OF SCOPE.** Served by the existing server-rendered admin console (`docs/admin/ADMIN_UI.md`). The only paginated endpoint in the API, and it belongs to operations, not to the product |
| `PATCH /admin/users/{userId}/status` | SYSTEM_ADMIN | **OUT OF SCOPE.** Suspending or disabling an account is a break-glass operations action. Putting it in the product frontend would place account termination one click from ordinary user administration |

---

## Coverage summary

| Group | Operations | In MVP | Post-MVP | Out of scope |
| --- | :-: | :-: | :-: | :-: |
| Authentication and account | 11 | 11 | 0 | 0 |
| Organization structure | 14 | 14 | 0 | 0 |
| People | 7 | 7 | 0 | 0 |
| Skills | 17 | 17 | 0 | 0 |
| Projects | 9 | 9 | 0 | 0 |
| Staffing | 8 | 8 | 0 | 0 |
| System admin | 2 | 0 | 0 | 2 |
| **Total** | **68** | **66** | **0** | **2** |

**Every product operation has a screen.** The 2 excluded are system-admin
operations already served by an existing console.

Nothing is deferred to post-MVP, and that is a deliberate finding rather than an
oversight: the backend was built to a scope, that scope is coherent, and shipping
a frontend that exposes only part of it would leave capabilities unreachable.
The MVP/polish split in [10-mvp-prioritization.md](10-mvp-prioritization.md)
therefore separates **screens** and **refinements**, not endpoints.

---

## Proposed functionality WITHOUT backend support

Marked `FUTURE / BACKEND NOT AVAILABLE`. **None of these is in the MVP**, and
none may quietly become a requirement.

| Idea | Why it is unavailable | Where it was tempting |
| --- | --- | --- |
| **Global search** | Only `GET /skills?q=` exists. No search for users, projects, departments or proposals | Shell — rejected in [04-information-architecture.md](04-information-architecture.md) |
| **Organization-wide project overview** | No endpoint returns all projects; `GET /projects/managed` is caller-scoped and `@ProjectManagerOnly` (§C-3) | Organization admin dashboard |
| ~~Department capacity on the review screen~~ | **Approved backend work (B1)** — capacity context moves onto the review response | Proposal review. The department-wide *dashboard* card stays rejected |
| **Employee's own capacity** | Same gap from the other side: an employee cannot see their own `availableHours` | Employee home |
| **In-app notifications** | `README.md` names a Notification module, but **no notification endpoints exist** | Everywhere; replaced by the single pending count on Staffing |
| ~~Rejection reason~~ | **Approved backend work (B2)** | Proposal review. Until it lands, the UI states the absence |
| **Authenticated change password** | Only the emailed reset flow exists | Account screen — links to reset, and says so |
| **Analytics, utilisation trends, skill-gap reports** | No aggregate endpoints | Rejected as vanity metrics regardless |
| **Skill endorsement or validation** | `EmployeeSkill` is self-declared; no endorsement endpoint | Would have justified Direction B; its absence is why that direction was rejected |
| **Multi-organization switching** | One `organizationId` per user; no endpoint changes it | Shell — no switcher designed |
| **Account status visibility** | `UserSummaryResponse` carries no status and `GET /users` has no filter (§C-18) | People list — `FUTURE / BACKEND GAP`; the frontend cannot mark a suspended account |
| **Level- and experience-weighted ranking** | `skillScore` ignores both (F2) | Team Finder — the detail panel states that levels are context, not score |
| **Server-side pagination** | Only the system-admin audit endpoint paginates (§C-1) | Every list; replaced by virtualisation and stated totals |

---

## Endpoints whose UX cost is worth flagging

Not gaps — working endpoints whose shape has a real frontend consequence.

| Endpoint | Consequence |
| --- | --- |
| `GET /projects/{id}/details` | Needed **once per project** to compute staffing gaps on M01 and Home. Acceptable at ten projects; expensive at fifty. An aggregate would fix it |
| `GET /department/projects` | Carries a department manager's own `departmentId`, so D04/D05 depend on it resolving first — a load-order dependency the architecture task must handle |
| `GET /auth/me` | No display name, so the shell needs a second call (`GET /me/projects`) purely to greet the user |
| `POST /projects/{id}/team-finder` | A `POST` that performs a read, so results are not linkable, bookmarkable or back-button friendly. The screen keeps criteria in the URL and re-posts on load to compensate |
