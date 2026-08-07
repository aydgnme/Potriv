# 06 — UX patterns, forms and copy

Combines Phase 9 (data-heavy patterns), Phase 12 (forms) and Phase 16 (copy).
They are one document because a pattern without its wording is only half
specified — "Delete" versus "Delete project" is a pattern decision, not a
separate discipline.

---

## Tables versus cards

The default is a **table**. A card grid is the exception and must be argued for.

Use a **table** when rows are comparable along the same attributes and the user
scans down a column: people, departments, skills, team roles, sessions, projects,
proposal queues, project members.

Use **cards** only when:

1. the entity has a heterogeneous shape that does not columnise, **and**
2. the user evaluates each one individually rather than comparing a column.

By that test, exactly **one** screen earns cards on desktop: **Team Finder
candidates**, where each candidate carries a score breakdown, an availability
state, a variable number of skill matches and a variable number of past-project
matches. Everything else is a table.

On mobile, tables become **stacked rows** — not cards. The distinction matters:
a stacked row keeps label–value pairs and the row's single primary action; a card
invites decorative padding and loses the column vocabulary the user learned on
desktop.

---

## Lists: filtering, sorting, pagination

**No product endpoint paginates** ([00-repository-reality.md](00-repository-reality.md) §C-1).
The patterns follow from that fact rather than fighting it.

| Concern | Decision |
| --- | --- |
| **Pagination** | **None.** No page-number controls anywhere in the product frontend. A control that re-slices an array already in memory implies a server contract that does not exist (P6). Long lists virtualise instead |
| **Filtering** | Server-side where a parameter exists — `?status=`, `?categoryId=`, `?includeInactive=`, `?q=` on skills. Client-side otherwise, and the count line says what it is working from: **"Showing 12 of 240"** |
| **Sorting** | Client-side only, on loaded data. Default order is the most useful one per screen (proposals oldest-first — the longest wait is the most urgent; projects by status then deadline; people by name) |
| **Search** | Only `/skills?q=`. Every other list has a filter input that visibly narrows *this list*, labelled "Filter people", not "Search" |

**Scale honesty.** Users, skills and projects can grow without bound and are
fetched whole. The design does not hide this: it virtualises long lists, shows
totals, and the risk is recorded in [11-open-questions.md](11-open-questions.md)
as a real limit rather than a solved problem.

---

## Status, role and skill display

### Status badges

Every badge carries **a colour and a word** — never colour alone
([01-product-direction.md](01-product-direction.md) §V3, and the accessibility
requirement in [08-responsive-accessibility.md](08-responsive-accessibility.md)).

| Domain | Values | Treatment |
| --- | --- | --- |
| Project status | `NOT_STARTED` `STARTING` `IN_PROGRESS` `CLOSING` `CLOSED` | Five steps on a neutral→active→settled ramp. `IN_PROGRESS` is the only one that reads as "live" |
| Proposal status | `PENDING` `APPROVED` `REJECTED` | `PENDING` is the attention state and is the only one that may also drive a count indicator |
| Account status | `ACTIVE` `SUSPENDED` `DISABLED` | Rare in the product frontend; status changes are system-admin only |
| Availability | fully available · partially available · unavailable · close to finish | Derived from the four booleans Team Finder returns, never computed independently |

`ProjectPeriod` (`FIXED` / `ONGOING`) is **not** a badge — it is a property shown
as text. Making it a badge would put a second coloured object on every project
row and dilute status.

### Role badges

Roles render as plain text chips in sentence case: "Project manager",
"Department manager". Never `PROJECT_MANAGER`, and never colour-coded — roles are
not a status and must not compete with one.

### Skill chips and levels

`SkillLevel` and `SkillExperience` **already carry display labels from the
backend** ("Knows", "1-2 years"). The frontend renders those verbatim and never
substitutes its own wording.

Level is a five-step ordinal scale, so it renders as a **stepped indicator plus
the label**, not five distinct hues. Five colours for one attribute would consume
the entire colour budget on its own.

### Capacity

Always **hours out of eight**, from real `allocatedHours` / `availableHours`
values (§C-7). A compact eight-segment bar with the numbers beside it
("6 / 8 h"). No percentages, no "utilisation", no invented index.

Where capacity is unavailable — a department manager looking at their own
members, or a queue row whose `capacity` is null — **nothing is shown**. No
placeholder, no estimate. The absence is honest; a wrong number is not.

On the review screen the denominator comes from `maxHoursPerDay` in the payload,
so eight is never hard-coded.

### Project timelines

`startDate` and `deadlineDate` only, with `ONGOING` projects having no deadline.
A single date range with a relative hint ("ends in 3 weeks"). **No Gantt chart** —
there is no dependency, milestone or phase data to draw one from.

---

## Proposal review cards

The one composite pattern the product genuinely needs. A review card must answer,
before any decision is possible:

1. **Who** — employee and their department
2. **What** — project, its status, requested team roles, `workHoursPerDay`
3. **Why** — the PM's `comments` (assignment) or the required `reason` (removal),
   shown in full and never truncated
4. **Who asked and when** — `proposedBy`, `createdAt`, with elapsed time
5. **What it costs** — the hours requested, and the capacity block the response
   now supplies (§C-19): allocated now, available now, and the projection after
   acceptance. Rendered from the payload, never computed in the client, and
   omitted entirely on rows where `capacity` is null

Two decisions, unequal in weight: **Accept** is primary; **Reject** is a
secondary control, not a red destructive button. Rejecting is a legitimate
routine outcome, not damage — styling it as destruction would bias the decision.

The card must be able to render a **fourth state** beyond pending/accepted/rejected:
*pending but not currently acceptable*, when capacity has been consumed since the
proposal was sent (§C-7). In that state Accept is disabled with the reason
stated, and Reject remains available — which is exactly what the backend intends.

---

## Empty states

Four kinds, deliberately distinguished. Treating them alike is one of the most
common ways an operational product becomes confusing.

| Kind | Meaning | Treatment |
| --- | --- | --- |
| **Nothing exists yet** | The organization has not created this | Explain what it is *for*, name the next action, and say **who can do it** if not this user |
| **Nothing matches** | Filters excluded everything | Repeat the active filters and offer to clear them |
| **Nothing to do — and that is good** | Empty review queue, no unassigned employees | Say so plainly. "No proposals waiting." Never an illustration, never "nothing here!" |
| **Nothing yet for you** | Employee with no projects | Acknowledge it and point at the one lever they have (their skills) |

No illustrations. No mascots. A sentence and, where there is one, a button.

---

## Dialogs and confirmations

**Confirm when the action is hard to reverse, or when its consequence is not
visible on screen.** Not otherwise — a confirmation on a cheap reversible action
trains people to click through the ones that matter.

| Action | Confirm? | Why |
| --- | --- | --- |
| Delete project | Yes, typed against the project name | Irreversible; also often refused (§C-8) |
| Delete department | Yes, naming `memberCount` | Irreversible, affects people |
| Remove department member | Yes | The person may be allocated elsewhere |
| **Rotate invite link** | Yes | Destructive in effect: the old link dies immediately, blocking anyone mid-signup |
| Replace department manager | Yes, naming both people | Silently transfers authority over a department |
| Move project to `IN_PROGRESS` | Yes | Makes allocations capacity-consuming and permanently blocks deletion |
| Remove own skill | Yes | Changes whether Team Finder can find you |
| Revoke a session / sign out everywhere | Yes | Signs out a device; `logout-all` includes this one |
| Accept / reject a proposal | Yes | Another person's staffing depends on it; reject cannot carry a reason |
| Link a skill to a department | No | Cheap and immediately reversible |
| Add a department member | No | Reversible, and the result is visible on screen |
| Edit a name or description | No | Visible and reversible |

**Every destructive dialog states the object by name and the consequence in one
sentence.** The confirm button repeats the verb and the noun — "Delete project" —
never "OK" or "Yes".

**Placement.** Destructive actions never sit in a page header next to the primary
action. They live at the bottom of a settings view, or in a row's overflow menu.

---

## Toasts, inline validation and loading

**Toasts** confirm a completed action whose result is not otherwise visible, and
carry the domain verb: "Proposal sent to Platform Engineering." They are never
used for errors that need a decision — those belong inline where the action was.

**Inline validation** runs on blur, not on keystroke, and clears immediately on
correction. Every rule is mirrored client-side from the documented constraints
because the server's message is a single joined string that **cannot be attached
to a field** (§C-13). The server message is shown at form level as the authority
when it disagrees with the client.

**Loading.** Skeletons that match the shape of the content, never spinners for
page loads. Independent sections load independently — Home never blocks its
review queue on a slow project list. Actions use a button-level busy state with
the form disabled, so a double submit is impossible.

**Stale data.** Lists that drive decisions (the review queue above all) re-read
after any mutation and on window focus. A proposal decided in another tab must
not remain actionable here.

---

## Error states

| State | Treatment |
| --- | --- |
| `400` validation | Form level, plus mirrored field rules |
| `401` | Session expired → sign-in, **preserving the intended route** |
| `403` | The capability that is missing, in role terms; never what the object contains |
| `404` | "Not found, or not visible to you" — deliberately ambiguous, because distinguishing them leaks existence |
| `409` | **Never a generic failure.** Each conflict in this product means something specific and is rendered as an explanation with a next step — already reviewed, already allocated, capacity exhausted, project progressed beyond planning, user already manages another department, duplicate name |
| `5xx` | Short apology, the `X-Request-ID`, and a retry |
| Network failure | Distinguished from `5xx`: "Could not reach Potriv." with retry; no request id, because no request was made |

`409` deserves the emphasis. In Potriv a conflict is almost always *the domain
working correctly* — someone else acted first, or a rule protected an employee's
capacity. Rendering these as red failures would misrepresent a functioning system.

---

## Forms

### Page, modal or drawer

| Container | When | Screens |
| --- | --- | --- |
| **Full page** | Many fields, or repeatable groups | Create/edit project (M02/M03) |
| **Drawer** | Few fields, and the surrounding list is useful context | Department, team role, skill, category forms |
| **Modal** | A decision about something already on screen | Confirmations; propose assignment; propose removal |
| **Inline** | A single attribute on a row | Skill level and experience; user roles |

### Single-step, always

**Project creation is not a wizard.** Evaluated explicitly, because it is the
largest form in the product:

`name`, `period`, `startDate`, `deadlineDate`, `status`, `generalDescription`,
`technologyStack[]`, `teamRoles[]` — nine fields, two of them repeatable.

A wizard would be wrong here because:

1. **No step depends on an earlier answer.** Wizards earn their cost by branching;
   nothing here branches
2. **`POST /projects` is a single atomic call.** Steps would be pure fiction —
   nothing is saved until the end, so a user who abandons at step 3 loses
   everything anyway
3. **Editing must mirror creating.** `PATCH` accepts the same fields, and a
   multi-step edit flow would be actively hostile for changing one date

Instead: one page, four labelled sections — Basics · Timeline · Technology stack ·
Team roles — with the two repeatable groups clearly separated. Required fields
are marked; the rest are visibly optional. This scales to more fields; a wizard
does not.

### Required fields, unsaved changes, destructive placement

- **Required** fields are marked with the word "Required", not an asterisk alone.
  Submit is never disabled for incomplete input — it submits and shows what is
  missing, so the reason is always visible. The one exception is the **deallocation
  reason**, which is `@NotBlank` and gates submission, because sending an empty
  reason is guaranteed to fail
- **Unsaved changes** prompt on navigation away from any form with a dirty field.
  Drawers and modals close on explicit cancel only — never on backdrop click when
  dirty
- **Destructive actions** sit at the bottom of the form, separated, never beside Save

---

## Copy conventions

**Actions name the domain verb and its object.** Never `Submit`, `OK`, `Continue`
or `Confirm` where a real name exists.

| Context | Use | Not |
| --- | --- | --- |
| Create a department | `Create department` | `Submit` |
| Send an assignment proposal | `Send proposal` | `Assign` — it is not an assignment yet |
| Decide on a proposal | `Accept` / `Reject` | `Approve` / `Deny` — the API says accept/reject |
| Remove someone from a project | `Propose removal` | `Remove` — it is a request, not an act |
| Rotate the invite link | `Rotate invite link` | `Regenerate` |
| Delete a project | `Delete project` | `Delete` |
| Add a skill to your profile | `Add to my skills` | `Add` |
| Place a person in a department | `Add to my department` | `Assign` |

**Never use "assign" for the proposal step.** A project manager who reads
"Assign" reasonably concludes the person is now on the project. They are not —
a department manager has to accept. The vocabulary carries the authority boundary
that principle P1 is built on.

### Status wording

Backend enum values are never shown raw. `NOT_STARTED` → "Not started";
`IN_PROGRESS` → "In progress". Skill levels and experience bands use the
backend's own labels unchanged.

### Confirmations

One sentence: what will happen, to what, and whether it can be undone.

> Delete **Apollo**? This cannot be undone.

> Rotate the invite link? The current link stops working immediately, and anyone
> part-way through signing up with it will need a new one.

> Reject this request? Add a reason if you want to — **optional**.

The reason field is genuinely optional, so the confirm button stays enabled with
it empty. Never fake mandatory validation on a field the API does not require.

### Permission errors

Say what capability is missing, in role terms, and stop:

> Only a department manager can review staffing requests.

Never name the object, its owner, or whether it exists.

### Session and login errors

> That email and password do not match.

One message for both cases, always. Session expiry:

> Your session has expired. Sign in to continue.

— and the intended route is preserved.
