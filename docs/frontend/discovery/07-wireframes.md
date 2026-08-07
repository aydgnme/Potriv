# 07 — Wireframes

Combines Phase 10 (Team Finder deep dive), Phase 11 (proposal review deep dive),
Phases 17–18 (wireframes and format), and Phase 20 (state matrix).

**Low fidelity by intent.** No colour, no spacing decisions, no typography. These
describe hierarchy, placement, density and flow. Anything that looks like a
visual choice here is accidental and not binding.

The application shell (sidebar versus top navigation, with the recommendation)
is in [04-information-architecture.md](04-information-architecture.md) §Navigation.
Every wireframe below assumes the recommended shell and omits it for legibility
except where the shell itself is the subject.

---

# Part 1 — Team Finder deep dive

## The questions, answered before drawing

**1. Table, ranked list, split view or hybrid?**
**Split view.** A candidate is not one row of comparable attributes — the payload
carries a three-part score, four availability booleans, a variable-length skill
match list and a variable-length past-project list. A table would either truncate
all of it or grow columns nobody can scan. A bare ranked list hides the evidence.
Split view keeps the ranking scannable on the left and the evidence complete on
the right.

**2. What must always remain visible?**
Name · department · availability state · total score · remaining hours. Those five
are what a manager compares across candidates.

**3. What moves into detail?**
The score breakdown, every matched skill with level and experience, past-project
matches with their matched technologies and roles, and the close-to-finish
projects with their deadlines.

**4. How do we avoid pretending the ranking is cleverer than it is?**
By showing the arithmetic. `TeamFinderScore` is `skill (max 60) + pastProject
(max 20) + availability (max 20)`. The detail panel shows those three numbers
with their maximums, and the evidence under each. **The words "AI",
"intelligent", "smart" and "recommended" do not appear.** The heading is
"Candidates", ordered by score — a fact, not a claim.

**5. How do unavailable and near-available candidates appear?**
They are excluded by default and included only by explicit criteria
(`includePartiallyAvailable`, `includeCloseToFinish`, `includeUnavailable`). When
included they are **not** visually demoted beyond their score — they carry their
availability state as a badge, and close-to-finish candidates show *which*
projects are ending and when, because that is the whole basis for considering
them.

**6. How does a PM move from discovery to proposal?**
The propose action lives in the detail panel, next to the evidence that justified
it — never in the list, where it could be clicked without reading anything. The
proposal form is prefilled with the project's unmet team roles and validates
`workHoursPerDay` against the candidate's real `availableHours`.

---

## Concept TF-A — Split view (recommended)

```
WIREFRAME ID:  TF-A
SCREEN:        Team Finder — desktop
ROLE(S):       PROJECT_MANAGER (own projects)
GOAL:          Find people for unmet role requirements, and understand why.

┌────────────────────────────────────────────────────────────────────────────┐
│ Projects › Apollo › Find team                                    [ AM ▾ ]  │
├────────────────────────────────────────────────────────────────────────────┤
│ Apollo                        IN PROGRESS · Fixed · 12 Mar – 30 Sep        │
│ Needs: Backend 2/3 · Frontend 0/2 · QA 1/1                                 │
│ Stack: Java · Spring · PostgreSQL · React                                  │
├────────────────────────────────────────────────────────────────────────────┤
│ Criteria  [x] partially available  [ ] close to finish (│4│wks)            │
│           [ ] unavailable          limit │20│            [ Search ]        │
│ Showing results for: partially available · limit 20      (generated 10:42) │
├───────────────────────────────────┬────────────────────────────────────────┤
│ 14 candidates                     │  Ayşe Yılmaz                           │
│                                   │  Platform Engineering                  │
│ ┌───────────────────────────────┐ │  ──────────────────────────────────────│
│ │ Ayşe Yılmaz              80   │◀│  Available   ████████░░  6 of 8 h      │
│ │ Platform Eng.  Available 6/8h │ │  2 active allocations                  │
│ └───────────────────────────────┘ │                                        │
│ ┌───────────────────────────────┐ │  Score 80 of 100                       │
│ │ Mehmet Kaya              70   │ │   Skills          45 / 60  3 of 4 tech │
│ │ Platform Eng.  Partial  2/8h  │ │   Past projects   20 / 20  matched     │
│ └───────────────────────────────┘ │   Availability    15 / 20  6 of 8 h    │
│ ┌───────────────────────────────┐ │                                        │
│ │ Elif Demir               40   │ │  Matched skills                        │
│ │ Data.  Close to finish  0/8h  │ │   Java         Teaches   4-7 years     │
│ │        Orion ends 12 Apr      │ │   Spring       Does      2-4 years     │
│ └───────────────────────────────┘ │   PostgreSQL   Knows     1-2 years     │
│ ┌───────────────────────────────┐ │                                        │
│ │ …                             │ │  Past projects on this stack           │
│ └───────────────────────────────┘ │   Helios   Java, Spring · Backend      │
│                                   │   Vega     PostgreSQL   · Backend      │
│                                   │                                        │
│                                   │  Levels are self-declared and do not   │
│                                   │  change the score — they are context.  │
│                                   │                                        │
│                                   │  [ Propose for this project ]          │
└───────────────────────────────────┴────────────────────────────────────────┘

PRIMARY ACTION:    Propose for this project → TF-C
SECONDARY ACTIONS: Adjust criteria and re-run · select another candidate ·
                   open a past project · open the employee's department
DATA REQUIRED:     POST /projects/{id}/team-finder → criteria, candidateCount,
                   candidates[].{employee, department, availability,
                   skillMatches, pastProjectMatches, score}
                   Header context: GET /projects/{id}/details
EMPTY STATE:       (a) no matches → restate criteria, offer to include partially
                   available / close to finish / unavailable
                   (b) project declares no TECHNOLOGIES → "This project has no
                   technologies to match on yet" → Edit project. Team roles are
                   NOT the trigger — the skill score matches technologies only.
ERROR STATE:       403 → permission screen. 5xx → inline retry, criteria kept.
NEXT SCREENS:      TF-C (propose) · A06 (project overview) · A07 (team)
```

**Why this wins.** The five comparison attributes stay visible while the evidence
is complete beside them. Selecting a candidate never loses the list, so comparing
is a keyboard-arrow away. The propose action is unreachable without the evidence
being on screen.

**Costs.** Needs roughly 1100px to be comfortable; below that it degrades to
TF-A-M. Only one candidate's detail is visible at a time — acceptable, because
the five headline attributes carry the actual comparison.

---

## Concept TF-B — Ranked comparison table

```
WIREFRAME ID:  TF-B
SCREEN:        Team Finder — alternative concept
ROLE(S):       PROJECT_MANAGER
GOAL:          Compare many candidates on one screen.

┌────────────────────────────────────────────────────────────────────────────┐
│ Apollo · Find team          Criteria [x] partial [ ] close [ ] unavail.    │
├────────────────────────────────────────────────────────────────────────────┤
│ Name          Dept       Avail.   Skill Past Avail  Total  Top skills      │
│ ────────────────────────────────────────────────────────────────────────── │
│ Ayşe Yılmaz   Platform   6/8 h      45   20    15     80   Java, Spring +1 │
│ Mehmet Kaya   Platform   2/8 h      45   20     5     70   Java, React     │
│ Elif Demir    Data       0/8 h      30    0    10     40   PostgreSQL +2   │
│ …                                                                          │
├────────────────────────────────────────────────────────────────────────────┤
│ [ ] compare selected (max 3)                            [ Propose… ]       │
└────────────────────────────────────────────────────────────────────────────┘

PRIMARY ACTION:    Propose (requires selecting a row first)
SECONDARY ACTIONS: Sort by any score column · select up to three to compare
DATA REQUIRED:     as TF-A
EMPTY STATE:       as TF-A
ERROR STATE:       as TF-A
NEXT SCREENS:      candidate detail overlay · TF-C
```

**Strengths.** Genuinely better for comparing more than three candidates at once,
and sorting by *component* score is expressive — "who has the deepest skill
match regardless of availability" is a real question.

**Why it is not recommended.** Skill matches, past projects and close-to-finish
projects are variable-length; the table truncates all three to "+2" and the
manager must open a detail view anyway — at which point the list is lost. Worse,
**Propose is reachable from the row**, so a proposal can be sent having seen only
truncated evidence. That directly contradicts P2.

## Recommendation

**TF-A (split view)**, taking one idea from TF-B: the score column header offers
sorting by `skill`, `pastProject`, `availability` or `total`, because that
question is real and costs nothing. The proposal action stays in the detail panel.

---

## TF-A-M — Team Finder, mobile

```
WIREFRAME ID:  TF-A-M
SCREEN:        Team Finder — mobile
ROLE(S):       PROJECT_MANAGER
GOAL:          Same, on a phone. Not a shrunken table.

┌───────────────────────────┐   tap a candidate ▸  ┌───────────────────────────┐
│ ← Apollo · Find team      │                      │ ← Ayşe Yılmaz             │
│ Backend 2/3 · Frontend 0/2│                      │ Platform Engineering      │
├───────────────────────────┤                      ├───────────────────────────┤
│ [ Criteria ▾ ] 14 results │                      │ Available  ██████░░ 6/8 h │
├───────────────────────────┤                      │ 2 active allocations      │
│ Ayşe Yılmaz          80   │                      │                           │
│ Platform Eng.             │                      │ Score 80 of 100           │
│ Available · 6 of 8 h      │                      │  Skills        45 / 60    │
├───────────────────────────┤                      │  Past projects 20 / 20    │
│ Mehmet Kaya          70   │                      │  Availability  15 / 20    │
│ Platform Eng.             │                      │                           │
│ Partially avail. · 2/8 h  │                      │ Matched skills            │
├───────────────────────────┤                      │  Java      Teaches  4-7y  │
│ Elif Demir           40   │                      │  Spring    Does     2-4y  │
│ Data                      │                      │  …                        │
│ Close to finish · 0/8 h   │                      │                           │
│ Orion ends 12 Apr         │                      │ Past projects             │
├───────────────────────────┤                      │  Helios · Java, Spring    │
│ …                         │                      │                           │
└───────────────────────────┘                      │ [ Propose ]               │
                                                   └───────────────────────────┘
NOTES: Criteria collapse into a sheet. The list keeps all five comparison
attributes — nothing is dropped, the layout stacks instead. Detail is a full
screen with back, not a cramped drawer.
```

---

# Part 2 — Proposal review deep dive

## Queue page versus drawer versus dedicated page

**Queue plus drawer on desktop, queue plus full page on mobile.**

- A **dedicated page** per proposal loses the queue. A department manager works
  through a batch; returning to a list and finding their place is friction on the
  most repeated action in the product.
- A **drawer** keeps the next item visible, which makes the batch feel like a
  batch, and closes without navigation.
- On mobile there is no room for both, so the detail is a full screen with back.

**Reject is not styled as destruction.** It is a legitimate outcome. Accept is
primary; Reject is a secondary control of equal prominence but lower emphasis.

**There is no rejection reason field, and the UI says so** rather than staying
silent — a reviewer who expects to explain themselves should learn it before
pressing, not after ([00-repository-reality.md](00-repository-reality.md) §C-5).

## State after decision

The row leaves the `PENDING` filter and is reachable under `APPROVED`/`REJECTED`
with `reviewedBy` and `reviewedAt`. The queue re-reads so a proposal decided
elsewhere cannot be acted on twice.

```
WIREFRAME ID:  PR-A
SCREEN:        Review queue with detail drawer — desktop
ROLE(S):       DEPARTMENT_MANAGER
GOAL:          Decide staffing requests with enough context to be accountable.

┌────────────────────────────────────────────────────────────────────────────┐
│ Staffing › Reviews                                               [ AM ▾ ]  │
├────────────────────────────────────────────────────────────────────────────┤
│ [ Pending 3 ] [ Approved ] [ Rejected ]                                    │
├──────────────────────────────────────┬─────────────────────────────────────┤
│ Type      Employee   Project   Hrs   │ Assignment request                  │
│ ──────────────────────────────────── │ ───────────────────────────────────│
│ Assign    Ayşe Y.    Apollo    6  ◀  │ Ayşe Yılmaz · Platform Engineering  │
│           2 days ago                 │                                     │
│ ──────────────────────────────────── │ Project    Apollo   IN PROGRESS     │
│ Assign    Mehmet K.  Vega      4     │ Roles      Backend, Reviewer        │
│           4 hours ago                │ Hours      6 per day                │
│ ──────────────────────────────────── │                                     │
│ Removal   Elif D.    Orion     —     │ After accepting: 6 of 8 h allocated │
│           1 day ago                  │                                     │
│                                      │ "Needs someone on the migration     │
│                                      │  before the April freeze."          │
│                                      │  — Deniz Ak, 2 days ago             │
│                                      │                                     │
│                                      │ [ Accept ]   [ Reject ]             │
│                                      │ Rejecting does not send a reason.   │
└──────────────────────────────────────┴─────────────────────────────────────┘

PRIMARY ACTION:    Accept
SECONDARY ACTIONS: Reject · filter by status · open the project · next item
DATA REQUIRED:     GET /department/project-proposals?status=PENDING
                   → proposalType, employee, project, teamRoles,
                     workHoursPerDay, comments, reason, proposedBy, createdAt
                   POST …/assignments/{id}/accept|reject
EMPTY STATE:       "No proposals waiting." — a good state, worded as one.
ERROR STATE:       409 already reviewed → show who decided, refresh the queue.
                   409 already allocated on this project → explain, offer reject.
                   409 capacity exhausted → see PR-B. 403 → permission screen.
NEXT SCREENS:      A06 project overview · A07 project team
```

```
WIREFRAME ID:  PR-B
SCREEN:        Review drawer — pending but not currently acceptable
ROLE(S):       DEPARTMENT_MANAGER
GOAL:          Represent the state the backend actually produces when capacity
               is consumed while a proposal waits (§C-7).

┌─────────────────────────────────────┐
│ Assignment request                  │
│ ────────────────────────────────────│
│ Ayşe Yılmaz · Platform Engineering  │
│ Project   Apollo   IN PROGRESS      │
│ Roles     Backend, Reviewer         │
│ Hours     6 per day                 │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Cannot be accepted right now    │ │
│ │ Ayşe has 2 of 8 hours free.     │ │
│ │ This request needs 6.           │ │
│ │ It stays pending — you can      │ │
│ │ still reject it.                │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [ Accept ]  ← disabled  [ Reject ]  │
└─────────────────────────────────────┘

NOTES: This is not an error toast. The backend deliberately leaves the proposal
PENDING so the manager can still reject it, and the UI mirrors that intent.
```

```
WIREFRAME ID:  PR-C
SCREEN:        Removal review
ROLE(S):       DEPARTMENT_MANAGER
GOAL:          Decide a removal, with the stated reason as the substance.

┌─────────────────────────────────────┐
│ Removal request                     │
│ ────────────────────────────────────│
│ Elif Demir · Data                   │
│ Project   Orion   CLOSING           │
│ Allocated 4 h/day since 3 Jan       │
│                                     │
│ Reason given                        │
│ ┌─────────────────────────────────┐ │
│ │ The reporting workstream ended  │ │
│ │ and the remaining scope is      │ │
│ │ front-end only.                 │ │
│ └─────────────────────────────────┘ │
│ — Deniz Ak, 1 day ago               │
│                                     │
│ Accepting moves Elif to past members│
│ and frees 4 hours of capacity.      │
│                                     │
│ [ Accept ]   [ Reject ]             │
└─────────────────────────────────────┘

NOTES: The reason is shown in full, never truncated — it is the decision.
```

---

# Part 3 — Application shell

```
WIREFRAME ID:  SH-A
SCREEN:        Application shell — desktop (recommended)
ROLE(S):       All (items vary by role set)
GOAL:          One home for a multi-role user; the pending count unmissable.

┌──────────────┬─────────────────────────────────────────────────────────────┐
│ POTRIV       │ Projects › Apollo                              [ ? ] [ AM ▾]│
│ Northwind Co ├─────────────────────────────────────────────────────────────┤
│              │ Apollo                     IN PROGRESS  [ Find team ]  [⋯]  │
│ ⌂ Home       │ Overview │ Team │ Find team │ Settings                      │
│ ▤ Projects   ├─────────────────────────────────────────────────────────────┤
│ ⇄ Staffing ③ │                                                             │
│ ☺ People     │  (page content)                                             │
│ ◈ Skills     │                                                             │
│ ⚙ Organization                                                             │
│              │                                                             │
│ ──────────── │                                                             │
│ Mert Aydoğan │                                                             │
│ PM · DM      │                                                             │
└──────────────┴─────────────────────────────────────────────────────────────┘

NOTES: ③ appears only for DEPARTMENT_MANAGER and only for pending proposals —
the sole count indicator in the product. Items render only if the role set
grants them. The object tab row belongs to the object, not the domain.
Destructive actions live under [⋯], never beside the primary action.
```

```
WIREFRAME ID:  SH-A-M
SCREEN:        Application shell — mobile
ROLE(S):       All

┌───────────────────────────┐
│ ← Apollo            [ ⋯ ] │
│ Overview │ Team │ Find ▸  │   ← horizontally scrollable
├───────────────────────────┤
│                           │
│  (page content)           │
│                           │
├───────────────────────────┤
│  ⌂     ▤     ⇄③    ☺    ⋯ │   ← max five, overflow in a sheet
│ Home Projects Staff People│
└───────────────────────────┘
```

---

# Part 4 — Screen wireframes

```
WIREFRAME ID:  W-01
SCREEN:        Login
ROLE(S):       PUBLIC
GOAL:          Sign in and land where the user intended.

┌─────────────────────────────────────┐
│              POTRIV                 │
│  ─────────────────────────────────  │
│  Email     [                     ]  │
│  Password  [                     ]  │
│                                     │
│  [        Sign in                ]  │
│                                     │
│  Forgot password?                   │
│  Create an organization             │
└─────────────────────────────────────┘

PRIMARY ACTION:    Sign in
SECONDARY ACTIONS: Forgot password · Create an organization
DATA REQUIRED:     POST /auth/login → GET /auth/me
EMPTY STATE:       n/a
ERROR STATE:       401 "That email and password do not match." (one message for
                   both cases). Locked account uses the backend's wording.
NEXT SCREENS:      W-04 home · W-03 reset · W-02 create organization
```

```
WIREFRAME ID:  W-02
SCREEN:        Employee invite registration
ROLE(S):       PUBLIC
GOAL:          Join an organization from an invite link.

┌─────────────────────────────────────┐
│  Join Northwind Co                  │
│  ─────────────────────────────────  │
│  Name      [                     ]  │
│  Email     [                     ]  │
│  Password  [                     ]  │
│            8–72 characters          │
│                                     │
│  [      Create account           ]  │
│  Already have an account? Sign in   │
└─────────────────────────────────────┘

PRIMARY ACTION:    Create account
SECONDARY ACTIONS: Sign in
DATA REQUIRED:     POST /auth/register-employee/{inviteToken}
EMPTY STATE:       n/a
ERROR STATE:       Missing/rotated token → dedicated "invite not valid" screen,
                   never a form that fails on submit. 400 at form level.
NEXT SCREENS:      W-01 (registration returns no session — §C-9)
```

```
WIREFRAME ID:  W-03
SCREEN:        Password reset (request, then set)
ROLE(S):       PUBLIC
GOAL:          Recover access without revealing whether an account exists.

┌─────────────────────────────────┐     ┌─────────────────────────────────┐
│  Reset your password            │     │  Set a new password             │
│  Email  [                    ]  │  →  │  New password  [             ]  │
│  [   Send reset link         ]  │     │  Confirm       [             ]  │
│                                 │     │  [    Set new password       ]  │
│  If an account exists for that  │     │                                 │
│  address, we have sent a link.  │     │                                 │
└─────────────────────────────────┘     └─────────────────────────────────┘

PRIMARY ACTION:    Send reset link / Set new password
SECONDARY ACTIONS: Back to sign in
DATA REQUIRED:     POST /auth/password-reset/request (202)
                   POST /auth/password-reset/confirm (204)
EMPTY STATE:       n/a
ERROR STATE:       Expired/used token → "This link is no longer valid" + request
                   a new one. 400 for a password outside 8–72.
NEXT SCREENS:      W-01 — 204 carries no tokens, so no auto sign-in.
```

```
WIREFRAME ID:  W-04
SCREEN:        Home — multi-role (PM + DM)
ROLE(S):       All; sections gated by role set
GOAL:          One home that answers "what needs me?" without a role switcher.

┌────────────────────────────────────────────────────────────────────────────┐
│ Home                                                                       │
├────────────────────────────────────────────────────────────────────────────┤
│ Waiting on you                                                             │
│ ┌────────────────────────────────────────────────────────────────────────┐ │
│ │ 3 staffing requests need your decision            [ Review requests ]  │ │
│ │ Oldest: Ayşe Yılmaz → Apollo, 2 days ago                               │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│ Waiting on someone else                                                    │
│ ┌────────────────────────────────────────────────────────────────────────┐ │
│ │ 2 proposals you sent are pending                                       │ │
│ │ Mehmet Kaya → Vega · Platform Engineering · 4 hours ago                │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│ Needs attention                                                            │
│ ┌──────────────────────────────┐ ┌───────────────────────────────────────┐ │
│ │ Apollo   Frontend 0 of 2     │ │ Vega    Backend 1 of 2                │ │
│ │          [ Find team ]       │ │         [ Find team ]                 │ │
│ └──────────────────────────────┘ └───────────────────────────────────────┘ │
│                                                                            │
│ Yours                                                                      │
│ ┌────────────────────────────────────────────────────────────────────────┐ │
│ │ You are on 1 project · 7 skills on your profile                        │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘

PRIMARY ACTION:    Review requests (the top section always owns it)
SECONDARY ACTIONS: Find team · open a project · edit skills
DATA REQUIRED:     /department/project-proposals?status=PENDING ·
                   /projects/managed (+ per-project details for gaps) ·
                   /me/projects · /me/skills
EMPTY STATE:       Each section separately; an employee-only user sees "Yours"
                   alone, worded as a welcome rather than four empty cards.
ERROR STATE:       Per section, inline with retry. One failure never blanks Home.
NEXT SCREENS:      PR-A · TF-A · A06 · A05
```

```
WIREFRAME ID:  W-05
SCREEN:        People (organization admin)
ROLE(S):       ORGANIZATION_ADMIN
GOAL:          See everyone and control what they may do.

┌────────────────────────────────────────────────────────────────────────────┐
│ People                                                                     │
│ [ Filter people…        ]  Role [ All ▾ ]        Showing 24 of 24          │
├────────────────────────────────────────────────────────────────────────────┤
│ Name             Email                     Roles                           │
│ ────────────────────────────────────────────────────────────────────────── │
│ Ayşe Yılmaz      ayse@northwind.test       Employee                     ▸  │
│ Deniz Ak         deniz@northwind.test      Employee · Project manager   ▸  │
│ Mert Aydoğan     mert@northwind.test       Employee · Dept. manager     ▸  │
│ …                                                                          │
└────────────────────────────────────────────────────────────────────────────┘

PRIMARY ACTION:    open a person → W-06
SECONDARY ACTIONS: filter (client-side) · filter by role
DATA REQUIRED:     GET /users
EMPTY STATE:       "Only you so far. Share the invite link to add people."
                   → links to W-16
FILTERED EMPTY:    "No people match — clear filters"
ERROR STATE:       403 → permission screen
NEXT SCREENS:      W-06
NOTES:             No pagination exists; the count line states the total (P6).
```

```
WIREFRAME ID:  W-06
SCREEN:        Person detail and roles
ROLE(S):       ORGANIZATION_ADMIN
GOAL:          Grant the capabilities a person needs.

┌────────────────────────────────────────────────────────────────────────────┐
│ People › Deniz Ak                                                          │
├────────────────────────────────────────────────────────────────────────────┤
│ Deniz Ak                                                                   │
│ deniz@northwind.test · joined 3 Jan                                        │
│                                                                            │
│ Roles                                                                      │
│  [x] Employee            Always required                                   │
│  [x] Project manager     Creates projects, runs Team Finder, proposes staff│
│  [ ] Department manager  Reviews staffing requests for one department      │
│  [ ] Organization admin  Manages departments, roles and the invite link    │
│                                                                            │
│ At least one role is required.                        [ Save roles ]       │
└────────────────────────────────────────────────────────────────────────────┘

PRIMARY ACTION:    Save roles
SECONDARY ACTIONS: back to People
DATA REQUIRED:     GET /users/{userId} · PATCH /users/{userId}/roles
EMPTY STATE:       n/a
ERROR STATE:       400 if the set is empty — prevented client-side, since the
                   constraint is documented (@Size(min = 1)).
NEXT SCREENS:      W-05
NOTES:             Each role is described by capability, not by name alone —
                   the admin is choosing what someone can do.
```

```
WIREFRAME ID:  W-07
SCREEN:        Departments
ROLE(S):       ORGANIZATION_ADMIN
GOAL:          Maintain structure and spot departments that cannot review staffing.

┌────────────────────────────────────────────────────────────────────────────┐
│ Organization › Departments                            [ New department ]   │
├────────────────────────────────────────────────────────────────────────────┤
│ Name                    Manager              Members                       │
│ ────────────────────────────────────────────────────────────────────────── │
│ Platform Engineering    Mert Aydoğan              8                     ▸  │
│ Data                    Elif Demir                5                     ▸  │
│ Design                  ⚠ No manager              3                     ▸  │
│ …                                                                          │
└────────────────────────────────────────────────────────────────────────────┘

PRIMARY ACTION:    New department
SECONDARY ACTIONS: open · edit · delete
DATA REQUIRED:     GET /departments
EMPTY STATE:       "No departments yet. Departments hold people and review
                   staffing requests." + Create
ERROR STATE:       403 → permission screen
NEXT SCREENS:      W-08
NOTES:             "No manager" is a warning, not a blank — such a department
                   cannot review staffing at all.
```

```
WIREFRAME ID:  W-08
SCREEN:        Department detail
ROLE(S):       ORGANIZATION_ADMIN
GOAL:          See a department and fix what is missing.

┌────────────────────────────────────────────────────────────────────────────┐
│ Organization › Departments › Design                              [ ⋯ ]     │
├────────────────────────────────────────────────────────────────────────────┤
│ Design                                                                     │
│ 3 members · created 3 Jan                                                  │
│                                                                            │
│ ┌────────────────────────────────────────────────────────────────────────┐ │
│ │ ⚠ No manager                                                           │ │
│ │ Staffing requests for this department cannot be reviewed until one is  │ │
│ │ appointed.                                    [ Appoint manager ]      │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘

PRIMARY ACTION:    Appoint manager
SECONDARY ACTIONS: Rename (⋯) · Delete department (⋯)
DATA REQUIRED:     GET /departments/{id} · PUT/DELETE /departments/{id}/manager
EMPTY STATE:       n/a
ERROR STATE:       409 on delete when not empty, explained with the member count.
                   The manager picker marks users who already manage another
                   department as unavailable (§C-4).
NEXT SCREENS:      W-07
NOTES:             Member management is NOT here — it is @DepartmentManagerOnly
                   (W-10). The org admin sees the count, not the roster.
```

```
WIREFRAME ID:  W-09
SCREEN:        Unassigned employees
ROLE(S):       DEPARTMENT_MANAGER
GOAL:          Place new joiners into the department in one movement.

┌────────────────────────────────────────────────────────────────────────────┐
│ People › Unassigned                                                        │
├───────────────────────────────────────┬────────────────────────────────────┤
│ Not in any department (4)             │ Platform Engineering (8)           │
│ ───────────────────────────────────── │ ───────────────────────────────────│
│ Ayşe Yılmaz     ayse@…      [ Add ▸ ] │ Mert Aydoğan          [ Remove ]   │
│ Mehmet Kaya     mehmet@…    [ Add ▸ ] │ Deniz Ak              [ Remove ]   │
│ …                                     │ …                                  │
└───────────────────────────────────────┴────────────────────────────────────┘

PRIMARY ACTION:    Add to my department
SECONDARY ACTIONS: Remove member
DATA REQUIRED:     GET /departments/unassigned-employees ·
                   GET /departments/{id}/members ·
                   POST/DELETE /departments/{deptId}/members/{userId}
EMPTY STATE:       "Everyone in the organization has a department." — a good
                   state, worded as one.
ERROR STATE:       403 for a department they do not manage.
NEXT SCREENS:      W-10
NOTES:             The department id comes from GET /department/projects (§C-4).
                   POST returns 200, not 201. Removal is confirmed by name.
```

```
WIREFRAME ID:  W-10
SCREEN:        My department
ROLE(S):       DEPARTMENT_MANAGER
GOAL:          See the roster.

┌────────────────────────────────────────────────────────────────────────────┐
│ People › Platform Engineering                        [ Add members ]       │
├────────────────────────────────────────────────────────────────────────────┤
│ Name             Email                     Roles                           │
│ Mert Aydoğan     mert@…                    Employee · Dept. manager     ⋯  │
│ Deniz Ak         deniz@…                   Employee · Project manager   ⋯  │
│ …                                                                          │
└────────────────────────────────────────────────────────────────────────────┘

PRIMARY ACTION:    Add members → W-09
SECONDARY ACTIONS: Remove member (⋯)
DATA REQUIRED:     GET /departments/{id}/members
EMPTY STATE:       "No members yet." + Add members
ERROR STATE:       403 → permission screen
NEXT SCREENS:      W-09
NOTES:             Allocated hours per member are NOT shown — no endpoint
                   exposes them to a department manager. Nothing is estimated.
```

```
WIREFRAME ID:  W-11
SCREEN:        Skill catalogue
ROLE(S):       All (read) · DEPARTMENT_MANAGER (write)
GOAL:          Browse the shared vocabulary; maintain it if permitted.

┌────────────────────────────────────────────────────────────────────────────┐
│ Skills                                                    [ New skill ]    │
│ [ Search skills…      ]  [ ] show inactive        Showing 18 of 42         │
├──────────────────────┬─────────────────────────────────────────────────────┤
│ Categories           │ Backend                                             │
│ ──────────────────── │ ────────────────────────────────────────────────────│
│ All            (42)  │ Java          Platform Engineering        ⋯         │
│ Backend        (18)◀ │ Spring        Platform Engineering        ⋯         │
│ Frontend       (12)  │ PostgreSQL    Platform Eng. · Data        ⋯         │
│ Data            (8)  │ …                                                   │
│ …                    │                                                     │
└──────────────────────┴─────────────────────────────────────────────────────┘

PRIMARY ACTION:    New skill (DM only) / Add to my skills (everyone)
SECONDARY ACTIONS: search · filter by category · show inactive · edit · link to
                   my department
DATA REQUIRED:     GET /skills?q=&categoryId=&includeInactive= ·
                   GET /skill-categories
EMPTY STATE:       "No skills have been added yet." (+ Create, for a DM)
FILTERED EMPTY:    "No skills match 'kubernet' — clear filters"
ERROR STATE:       403 on write for non-DMs — controls are absent, not disabled.
NEXT SCREENS:      W-12
NOTES:             ?q= is the ONLY server-side text search in the API, so this
                   is the only input labelled "Search".
```

```
WIREFRAME ID:  W-12
SCREEN:        My skills
ROLE(S):       All
GOAL:          Keep the profile Team Finder matches on accurate.

┌────────────────────────────────────────────────────────────────────────────┐
│ Skills › My skills                                       [ Add a skill ]   │
├────────────────────────────────────────────────────────────────────────────┤
│ Skill          Category    Level              Experience                   │
│ ────────────────────────────────────────────────────────────────────────── │
│ Java           Backend     [ Teaches   ▾ ]    [ 4-7 years   ▾ ]        ⋯   │
│ Spring         Backend     [ Does      ▾ ]    [ 2-4 years   ▾ ]        ⋯   │
│ React          Frontend    [ Knows     ▾ ]    [ 1-2 years   ▾ ]        ⋯   │
├────────────────────────────────────────────────────────────────────────────┤
│ These are what Team Finder matches you on.                                 │
└────────────────────────────────────────────────────────────────────────────┘

PRIMARY ACTION:    Add a skill
SECONDARY ACTIONS: change level/experience inline · remove (⋯)
DATA REQUIRED:     GET/POST/PATCH/DELETE /me/skills · GET /skills?q=
EMPTY STATE:       "Your skill profile is empty. Team Finder matches people to
                   projects using these." + Add a skill
ERROR STATE:       409 "You have already assigned this skill." against the picker
NEXT SCREENS:      W-11
NOTES:             Level and experience labels come from the backend and are
                   rendered verbatim. Removal is confirmed and states that Team
                   Finder will no longer match on it.
```

```
WIREFRAME ID:  W-13
SCREEN:        Projects (project manager)
ROLE(S):       PROJECT_MANAGER
GOAL:          See the working set ordered by what needs attention.

┌────────────────────────────────────────────────────────────────────────────┐
│ Projects                        Status [ All ▾ ]        [ New project ]    │
├────────────────────────────────────────────────────────────────────────────┤
│ Name       Status         Period   Dates              Staffing             │
│ ────────────────────────────────────────────────────────────────────────── │
│ Apollo     IN PROGRESS    Fixed    12 Mar – 30 Sep    3 of 6   ⚠        ▸  │
│ Vega       STARTING       Fixed    1 Apr – 1 Aug      1 of 2   ⚠        ▸  │
│ Orion      CLOSING        Ongoing  3 Jan –            4 of 4            ▸  │
│ …                                                                          │
└────────────────────────────────────────────────────────────────────────────┘

PRIMARY ACTION:    New project
SECONDARY ACTIONS: filter by status (server-side) · open a project
DATA REQUIRED:     GET /projects/managed?status= plus GET /projects/{id}/details
                   per project for the staffing figure
EMPTY STATE:       "No projects yet." + Create
ERROR STATE:       403 → permission screen
NEXT SCREENS:      W-14 · A06 · TF-A
NOTES:             Staffing needs one request per project — no aggregate
                   endpoint exists. Fine at ten, a problem at fifty; recorded
                   as an open question rather than hidden.
```

```
WIREFRAME ID:  W-14
SCREEN:        Create / edit project
ROLE(S):       PROJECT_MANAGER
GOAL:          Define the work and what it needs. One page, four sections.

┌────────────────────────────────────────────────────────────────────────────┐
│ Projects › New project                                                     │
├────────────────────────────────────────────────────────────────────────────┤
│ Basics                                                                     │
│  Name          [ Apollo                                    ]  Required     │
│  Description   [                                           ]               │
│                                                                            │
│ Timeline                                                                   │
│  Period        (•) Fixed   ( ) Ongoing                        Required     │
│  Start date    [ 12 Mar 2026 ]   Deadline  [ 30 Sep 2026 ]                 │
│  Status        [ Not started ▾ ]                              Required     │
│                                                                            │
│ Technology stack                                                           │
│  [ Java        ] [ × ]                                                     │
│  [ Spring      ] [ × ]      [ + Add technology ]                           │
│                                                                            │
│ Team roles needed                                                          │
│  [ Backend  ▾ ]  [ 3 ] people   [ × ]                                      │
│  [ Frontend ▾ ]  [ 2 ] people   [ × ]    [ + Add role ]                    │
│                                                                            │
│                                        [ Cancel ]  [ Create project ]      │
└────────────────────────────────────────────────────────────────────────────┘

PRIMARY ACTION:    Create project / Save changes
SECONDARY ACTIONS: Cancel · (edit only) change status · delete, at the bottom
DATA REQUIRED:     POST /projects · PATCH /projects/{id} · GET /team-roles
EMPTY STATE:       No team roles exist → the section says so and links to the
                   organization admin's team-role screen, naming who can create
                   them.
ERROR STATE:       400 at form level plus mirrored client-side rules (§C-13).
                   409 on activation → names the capacity rule.
NEXT SCREENS:      A06 project overview
NOTES:             Deliberately NOT a wizard — reasoning in
                   06-ux-patterns.md §Forms. Delete never sits in the header.
```

```
WIREFRAME ID:  W-15
SCREEN:        Project overview — desktop
ROLE(S):       All (read) · managing PM (actions)
GOAL:          Everything about one project, with the staffing gap obvious.

┌────────────────────────────────────────────────────────────────────────────┐
│ Projects › Apollo                                                          │
│ Apollo                        IN PROGRESS   [ Find team ]            [ ⋯ ] │
│ Overview │ Team │ Find team │ Settings                                     │
├───────────────────────────────────────┬────────────────────────────────────┤
│ Fixed · 12 Mar – 30 Sep · ends in 12w │ Team roles                         │
│ Manager  Deniz Ak                     │  Backend    2 of 3   ⚠             │
│                                       │  Frontend   0 of 2   ⚠             │
│ Description                           │  QA         1 of 1   ✓             │
│  Migration of the reporting stack…    │                                    │
│                                       │ Active members (3)                 │
│ Technology stack                      │  Ayşe Yılmaz   Backend    6 h/day  │
│  Java · Spring · PostgreSQL · React   │  Mert Aydoğan  Backend    4 h/day  │
│                                       │  Elif Demir    QA         2 h/day  │
│                                       │                                    │
│                                       │ Past members (1)                ▸  │
└───────────────────────────────────────┴────────────────────────────────────┘

PRIMARY ACTION:    Find team (managing PM only)
SECONDARY ACTIONS: Edit · Delete (⋯) · open Team tab
DATA REQUIRED:     GET /projects/{id}/details
EMPTY STATE:       "No one is allocated yet." + Find team for the PM
ERROR STATE:       404 → not-found screen. Delete may return 409 because the
                   guard is on status HISTORY and cannot be predicted (§C-8) —
                   rendered as an explanation, not a failure.
NEXT SCREENS:      TF-A · W-17 team · W-14 edit
```

```
WIREFRAME ID:  W-15-M
SCREEN:        Project overview — mobile
ROLE(S):       All

┌───────────────────────────┐
│ ← Apollo            [ ⋯ ] │
│ IN PROGRESS               │
│ Overview │ Team │ Find ▸  │
├───────────────────────────┤
│ Fixed · 12 Mar – 30 Sep   │
│ ends in 12 weeks          │
│ Manager  Deniz Ak         │
├───────────────────────────┤
│ Team roles                │
│  Backend    2 of 3   ⚠    │
│  Frontend   0 of 2   ⚠    │
│  QA         1 of 1   ✓    │
├───────────────────────────┤
│ Active members (3)        │
│  Ayşe Yılmaz              │
│  Backend · 6 h/day     ▸  │
│  ─────────────────────────│
│  Mert Aydoğan             │
│  Backend · 4 h/day     ▸  │
├───────────────────────────┤
│ [ Find team ]             │
└───────────────────────────┘

NOTES: Requirement rows keep the "n of m" shape — the single most useful number
on the screen is never dropped on small viewports.
```

```
WIREFRAME ID:  W-16
SCREEN:        Organization invite link
ROLE(S):       ORGANIZATION_ADMIN
GOAL:          Control how people join; make rotation's cost explicit.

┌────────────────────────────────────────────────────────────────────────────┐
│ Organization › Invite                                                      │
├────────────────────────────────────────────────────────────────────────────┤
│ Anyone with this link can join Northwind Co as an employee.                │
│                                                                            │
│ [ https://potriv.app/join?token=…                          ]  [ Copy ]     │
│                                                                            │
│ Active · created 3 Jan · does not expire                                   │
│                                                                            │
│ ─────────────────────────────────────────────────────────────────────────  │
│ Rotate the link if it has been shared too widely.                          │
│ The current link stops working immediately.        [ Rotate invite link ]  │
└────────────────────────────────────────────────────────────────────────────┘

PRIMARY ACTION:    Copy
SECONDARY ACTIONS: Rotate invite link (confirmed)
DATA REQUIRED:     GET /organizations/current/invite ·
                   POST /organizations/current/invite/rotate
EMPTY STATE:       none — an invite always exists
ERROR STATE:       403 → permission screen.
NOTES:             Invites NEVER expire (expiresAt is always null — §C-14), so no
                   expiry date and no "expires soon" warning is shown. Rotation
                   is the only revocation mechanism, which makes it the more
                   important control on this screen rather than the lesser one.
NEXT SCREENS:      W-05 People
```

```
WIREFRAME ID:  W-17
SCREEN:        Project team
ROLE(S):       All (read) · managing PM (actions)
GOAL:          Keep proposed, active and past strictly separate (P1).

┌────────────────────────────────────────────────────────────────────────────┐
│ Projects › Apollo › Team                                                   │
├────────────────────────────────────────────────────────────────────────────┤
│ Proposed — awaiting a decision (1)                                         │
│  Mehmet Kaya   Platform Eng.  Backend  4 h/day  proposed 4 h ago           │
│                                                                            │
│ Active (3)                                                                 │
│  Ayşe Yılmaz   Platform Eng.  Backend  6 h/day  approved by Mert, 2 Feb ⋯  │
│  Mert Aydoğan  Platform Eng.  Backend  4 h/day  approved by Mert, 3 Feb ⋯  │
│  Elif Demir    Data           QA       2 h/day  approved by Elif, 5 Feb ⋯  │
│                                                                            │
│ Past (1)                                                                   │
│  Selin Ay      Design         Design   3 h/day  removed 1 Mar              │
│   "Design workstream closed."  approved by Ada                             │
└────────────────────────────────────────────────────────────────────────────┘

PRIMARY ACTION:    Propose removal (⋯ on an active row, managing PM only)
SECONDARY ACTIONS: open a member · open the proposal
DATA REQUIRED:     GET /projects/{id}/team
EMPTY STATE:       per group; "No one is allocated to this project yet."
ERROR STATE:       standard
NEXT SCREENS:      TF-C (propose removal) · PR-A
NOTES:             Proposed members are never counted as staffed — the gap on
                   W-15 counts active members only.
```

```
WIREFRAME ID:  TF-C
SCREEN:        Propose assignment / propose removal
ROLE(S):       PROJECT_MANAGER
GOAL:          Ask for a decision, with the cost of the request visible.

┌─────────────────────────────────────┐   ┌─────────────────────────────────────┐
│ Propose Ayşe Yılmaz for Apollo      │   │ Propose removing Elif Demir         │
│ ─────────────────────────────────── │   │ ─────────────────────────────────── │
│ Team roles     [x] Backend          │   │ Orion · QA · 4 h/day since 3 Jan    │
│                [ ] Frontend         │   │                                     │
│                [ ] QA               │   │ Reason              Required        │
│ At least one required.              │   │ ┌─────────────────────────────────┐ │
│                                     │   │ │                                 │ │
│ Hours per day  [ 6 ]                │   │ └─────────────────────────────────┘ │
│  Ayşe has 6 of 8 hours free.        │   │ Stored permanently and shown on     │
│                                     │   │ the project's past members.         │
│ Comments (optional)                 │   │                                     │
│ ┌─────────────────────────────────┐ │   │                                     │
│ └─────────────────────────────────┘ │   │                                     │
│                                     │   │                                     │
│ Platform Engineering will review    │   │ Data will review this request.      │
│ this request.                       │   │                                     │
│      [ Cancel ]  [ Send proposal ]  │   │   [ Cancel ]  [ Propose removal ]   │
└─────────────────────────────────────┘   └─────────────────────────────────────┘

PRIMARY ACTION:    Send proposal / Propose removal
SECONDARY ACTIONS: Cancel
DATA REQUIRED:     POST /projects/{id}/assignment-proposals
                   POST /projects/{id}/allocations/{allocationId}/deallocation-proposals
EMPTY STATE:       n/a
ERROR STATE:       400 validation. 409 capacity — all three variants are
                   preventable here from Team Finder's availableHours, so the
                   form guards them rather than letting the manager discover
                   them on submit.
NEXT SCREENS:      TF-A (next gap) · W-17
NOTES:             Both name the REVIEWING DEPARTMENT — the request goes to a
                   person, and the wording says so. Never labelled "Assign".
```

```
WIREFRAME ID:  W-18
SCREEN:        Employee home / My projects
ROLE(S):       EMPLOYEE
GOAL:          A status page, not a queue — this role has no pending work.

┌────────────────────────────────────────────────────────────────────────────┐
│ Home                                                                       │
├────────────────────────────────────────────────────────────────────────────┤
│ Your projects (1)                                                          │
│ ┌────────────────────────────────────────────────────────────────────────┐ │
│ │ Apollo          IN PROGRESS   Backend · 6 h/day   ends in 12 weeks  ▸  │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│ Your skills (7)                                            [ Manage ▸ ]    │
│  Java · Spring · PostgreSQL · React · Docker · Git · SQL                   │
│                                                                            │
│ Previously (2)                                                          ▸  │
│  Orion  QA · until 1 Mar      Helios  Backend · until 4 Dec                │
└────────────────────────────────────────────────────────────────────────────┘

PRIMARY ACTION:    open a project
SECONDARY ACTIONS: Manage skills
DATA REQUIRED:     GET /me/projects · GET /me/skills
EMPTY STATE:       "You are not allocated to any project yet." + a pointer to
                   skills — the only lever an employee actually has.
ERROR STATE:       per section, inline
NEXT SCREENS:      A06 · W-12
NOTES:             /me/projects also carries userName — the cheapest source of
                   the signed-in user's display name (§C-11).
```

```
WIREFRAME ID:  W-19
SCREEN:        Department project portfolio
ROLE(S):       DEPARTMENT_MANAGER
GOAL:          See what the department's people are committed to.

┌────────────────────────────────────────────────────────────────────────────┐
│ Projects › Platform Engineering        Status [ All ▾ ]                    │
├────────────────────────────────────────────────────────────────────────────┤
│ Project    Status         Our people                                       │
│ ────────────────────────────────────────────────────────────────────────── │
│ Apollo     IN PROGRESS    Ayşe Yılmaz (6h) · Mert Aydoğan (4h)          ▸  │
│ Vega       STARTING       Deniz Ak (2h)                                 ▸  │
│ …                                                                          │
└────────────────────────────────────────────────────────────────────────────┘

PRIMARY ACTION:    open a project
SECONDARY ACTIONS: filter by status (server-side)
DATA REQUIRED:     GET /department/projects?status=
EMPTY STATE:       "No projects involve this department yet."
ERROR STATE:       403 → permission screen
NEXT SCREENS:      A06
NOTES:             Hours shown are per project only. They are NOT summed into a
                   per-person total, because this endpoint sees only this
                   department's projects — a total would silently under-report
                   anyone allocated elsewhere.
```

```
WIREFRAME ID:  W-20
SCREEN:        Account and sessions
ROLE(S):       All
GOAL:          Know who you are signed in as, and end sessions you do not want.

┌────────────────────────────────────────────────────────────────────────────┐
│ Account                                                                    │
├────────────────────────────────────────────────────────────────────────────┤
│ mert@northwind.test · Northwind Co                                         │
│ Roles  Employee · Department manager · Project manager                     │
│ Change password ▸  (sent by email)                                         │
│                                                                            │
│ Sessions                                                                   │
│ ────────────────────────────────────────────────────────────────────────── │
│ This device   Chrome on macOS   192.0.2.10   last seen just now            │
│ iPhone        Safari on iOS     192.0.2.44   last seen 2 days ago   [ End ]│
│                                                                            │
│                              [ Sign out ]   [ Sign out everywhere ]        │
└────────────────────────────────────────────────────────────────────────────┘

PRIMARY ACTION:    none — this is a control surface, not a task
SECONDARY ACTIONS: End a session · Sign out · Sign out everywhere
DATA REQUIRED:     GET /auth/me · GET /auth/sessions ·
                   DELETE /auth/sessions/{id} · POST /auth/logout · logout-all
EMPTY STATE:       impossible — the current session is always listed
ERROR STATE:       404 if the session is not the caller's
NEXT SCREENS:      W-01 after signing out
NOTES:             There is no authenticated change-password endpoint, so that
                   action links to the reset flow and says so.
```

```
WIREFRAME ID:  W-21
SCREEN:        Permission denied · Not found · Something went wrong
ROLE(S):       All

┌─────────────────────────────┐ ┌─────────────────────────────┐ ┌─────────────────────────────┐
│ You do not have access      │ │ Not found                   │ │ Something went wrong        │
│                             │ │                             │ │                             │
│ Only a department manager   │ │ This page does not exist,   │ │ We could not complete that. │
│ can review staffing         │ │ or is not visible to you.   │ │                             │
│ requests.                   │ │                             │ │ Reference  a3f91c2b         │
│                             │ │                             │ │                             │
│ [ Go to Home ]              │ │ [ Go to Home ]              │ │ [ Try again ] [ Go to Home ]│
└─────────────────────────────┘ └─────────────────────────────┘ └─────────────────────────────┘

NOTES: 403 names the missing capability, never the object. 404 is deliberately
ambiguous, because distinguishing "does not exist" from "not yours" leaks
existence. 5xx carries the X-Request-ID, which the backend correlates logs by —
enough for support, and it exposes nothing.
```

---

# Part 5 — State matrix

Wireframes above show the loaded state. Every critical screen must also handle
these. `—` means the state cannot occur on that screen.

| Screen | Initial load | Empty | Filtered empty | Validation | 401 | 403 | 404 | Conflict (409) | 5xx | Network | Stale |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **W-01 Login** | form ready | — | — | inline | — | — | — | — | inline retry | "Could not reach Potriv" | — |
| **W-04 Home** | per-section skeletons | per-section | — | — | → login, route kept | section absent | — | — | per-section retry | banner + retry | re-read on focus |
| **PR-A Review queue** | row skeletons | "No proposals waiting" (good) | "No {status} proposals" | — | → login | permission screen | — | already reviewed → show decider, refresh | inline retry | banner | **re-read after every decision and on focus** |
| **PR-B Review drawer** | detail skeleton | — | — | — | → login | permission screen | proposal gone → refresh queue | **capacity → accept disabled, reject kept, proposal stays PENDING** | inline | banner | refetch on open |
| **TF-A Team Finder** | criteria ready, result skeletons | (a) no match → widen · (b) no stack/roles → edit project | as (a) | criteria bounds inline | → login | permission screen | project gone → project list | — | retry, criteria kept | banner | results carry `generatedAt` |
| **TF-C Propose** | form ready | — | — | inline + mirrored rules | → login | permission screen | — | **all three capacity conflicts prevented client-side** from `availableHours` | inline, form kept | banner, form kept | capacity re-checked on open |
| **W-13 Projects** | table skeleton | "No projects yet" | "No {status} projects" | — | → login | permission screen | — | — | inline retry | banner | re-read after mutation |
| **W-14 Project form** | form ready | no team roles → explain + link | — | inline + form-level server message | → login | permission screen | project gone | activation capacity; delete refused by status history | inline, input kept | banner, input kept | unsaved-changes prompt |
| **W-15 Project overview** | header then sections | "No one is allocated yet" | — | — | → login | — (read is open) | not-found screen | delete 409 explained | inline retry | banner | re-read after team changes |
| **W-05 People** | table skeleton | "Only you so far" + invite | "No people match" | — | → login | permission screen | — | — | inline retry | banner | re-read after role change |
| **W-06 Person roles** | form ready | — | — | last role prevented client-side | → login | permission screen | user gone | — | inline, selection kept | banner | — |
| **W-07/08 Departments** | table skeleton | "No departments yet" | — | duplicate name at form level | → login | permission screen | department gone | delete refused when not empty; manager already manages another | inline retry | banner | re-read after mutation |
| **W-09 Unassigned** | two skeletons | "Everyone has a department" (good) | — | — | → login | permission screen | — | — | inline retry | banner | both panes re-read after a move |
| **W-11 Skills** | list skeleton | "No skills added yet" | "No skills match '{q}'" | — | → login | write controls absent | skill gone | duplicate name | inline retry | banner | re-read after mutation |
| **W-12 My skills** | list skeleton | "Your skill profile is empty" | — | inline | → login | — | — | "already assigned this skill" | inline retry | banner | — |
| **W-16 Invite** | skeleton | — | — | — | → login | permission screen | — | — | inline retry | banner | re-read after rotation |
| **W-20 Sessions** | table skeleton | impossible | — | — | → login | — | session gone → refresh | — | inline retry | banner | re-read after revoke |

Three rows carry the weight and are worth restating:

- **PR-B** is the state most likely to be missed: a `PENDING` proposal that
  cannot currently be accepted. It is a designed state, not an error.
- **W-14/W-15** cannot predict deletability, because the guard reads status
  *history* and the API returns only current status. The `409` is part of the
  design.
- **PR-A** must re-read aggressively. Two managers reviewing the same queue is
  the normal case, not a race-condition edge case.
