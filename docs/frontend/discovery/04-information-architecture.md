# 04 — Information architecture, dashboards and navigation

Combines Phase 5 (IA), Phase 6 (dashboard strategy) and Phase 19 (navigation
shell concepts). Dashboards are the content of the home node in the IA, and the
shell is what renders the IA — keeping the three together stops the navigation
from drifting from the structure it is meant to express.

---

## Starting from mental models, not routes

The users' mental model, stated in their own terms:

| They think | The system calls it |
| --- | --- |
| "What am I working on?" | `GET /me/projects` |
| "Who can do this work?" | Team Finder |
| "Can I have this person?" | assignment proposal |
| "Is anyone waiting on me?" | the review queue |
| "Who is in my department?" | department membership |
| "What can our people do?" | skill catalogue + employee skills |
| "Who is allowed to do what?" | users and roles |

Note what is **absent** from the mental model: nobody thinks in terms of
"allocations", "proposals of type deallocation", or "skill department links".
Those are implementation vocabulary. The IA is built from the left column.

---

## Top-level domains

Six. Each one is justified below, and three tempting candidates are rejected.

### 1. Home

| | |
| --- | --- |
| **Who sees it** | Everyone |
| **Why it exists** | The only screen that adapts to the whole role set; the answer to "what needs me?" |
| **Primary content** | Role-composed sections (see Dashboards below) |
| **Primary actions** | Whatever the top section implies — review a proposal, fill a staffing gap, add a skill |
| **Secondary actions** | Navigate into any domain |
| **Top-level?** | Yes. It is the destination after login and the only place multi-role users see their whole workload |

### 2. Projects

| | |
| --- | --- |
| **Who sees it** | Everyone, with very different content: PM sees `GET /projects/managed`; DM sees `GET /department/projects`; employee sees `GET /me/projects` |
| **Why it exists** | Projects are the object every other workflow orbits |
| **Primary content** | A list of the projects relevant to *you*, with status and staffing state |
| **Primary actions** | PM: create project, open Team Finder. Others: open a project |
| **Secondary actions** | Filter by status (a real server parameter for PM and DM lists) |
| **Top-level?** | Yes |

**Design decision:** one navigation item, three data sources. Splitting it into
"My projects" / "Department projects" / "Managed projects" would create up to
three items for a multi-role user describing the same noun. Instead the Projects
page shows the sources the role set grants, as tabs or grouped sections, with the
most authoritative first.

### 3. Staffing

| | |
| --- | --- |
| **Who sees it** | PROJECT_MANAGER (Team Finder) and DEPARTMENT_MANAGER (review queue) |
| **Why it exists** | It is the product's spine — the two halves of the proposal handshake, which are otherwise scattered across project and department pages |
| **Primary content** | For a DM: the review queue. For a PM: outstanding proposals they sent, and the entry point to Team Finder |
| **Primary actions** | Accept/reject; run Team Finder |
| **Secondary actions** | Filter by status (`?status=PENDING|APPROVED|REJECTED`) |
| **Top-level?** | **Yes — and this is the single most important IA decision in the pack.** Without it, the review queue would live inside a department page and Team Finder inside a project page, meaning the only screens with time-critical work would be two clicks deep and invisible from home |

Team Finder is *entered* from a project (it needs a `projectId`), but it is
*findable* here. Both are true, and the IA supports both.

### 4. People

| | |
| --- | --- |
| **Who sees it** | ORGANIZATION_ADMIN (`GET /users`) and DEPARTMENT_MANAGER (their members + unassigned employees) |
| **Why it exists** | Two distinct jobs — granting roles, and placing people in departments — are both "about people" |
| **Primary content** | Org admin: everyone, with roles. DM: their department's members, plus the unassigned pool |
| **Primary actions** | Org admin: change roles. DM: add/remove members |
| **Secondary actions** | Open a person; filter by role |
| **Top-level?** | Yes, for the two roles that have it. Hidden entirely for employees and pure PMs |

### 5. Skills

| | |
| --- | --- |
| **Who sees it** | Everyone — reads are open to all authenticated users |
| **Why it exists** | It is both a shared catalogue and a personal profile, and the two must sit together so an employee can browse the catalogue while editing their own profile |
| **Primary content** | The catalogue (categories → skills), plus "My skills" |
| **Primary actions** | Employee: add/edit own skills. DM: maintain the catalogue and link skills to their department |
| **Secondary actions** | Search (`?q=` — the only server-side text search in the API), filter by category, show inactive |
| **Top-level?** | Yes. It is the one domain every role touches |

**Design decision:** "My skills" lives under Skills, not under Account. It is
product data that feeds Team Finder, not a personal setting.

### 6. Organization

| | |
| --- | --- |
| **Who sees it** | ORGANIZATION_ADMIN only |
| **Why it exists** | Structure that changes rarely: departments, department managers, team roles, the invite link |
| **Primary content** | Departments list; team roles; invite status |
| **Primary actions** | Create department, appoint manager, create team role, rotate invite |
| **Secondary actions** | Edit, delete |
| **Top-level?** | Yes, for org admins. It is low-frequency but high-consequence, and burying it inside Account would misrepresent it as a personal setting |

### Plus: Account (not a top-level domain)

Lives in the account menu, not the primary navigation: email and roles
(`/auth/me`), sessions (`/auth/sessions`), sign out, sign out everywhere, and a
link to the password reset flow — because **there is no authenticated
change-password endpoint** ([03-user-journeys.md](03-user-journeys.md) §I2).

### Rejected top-level items

| Rejected | Why |
| --- | --- |
| **Departments** as its own item | Only org admins can list departments, and for them it is organization structure. A department manager has exactly one department, so for them it is not a list at all — it is a page. Folded into Organization and People respectively |
| **Proposals** as its own item separate from Staffing | Two items for the two halves of one workflow. A user who is both PM and DM would see both and have to learn which is theirs |
| **Reports / Analytics** | No endpoints exist. `FUTURE / BACKEND NOT AVAILABLE` |
| **Global search** | Only `/skills?q=` exists. A search box that silently searches skills only would be a lie. `FUTURE / BACKEND NOT AVAILABLE` — see below |

---

## Global search: explicitly future-only

**FUTURE IDEA / NOT IMPLEMENTED.** There is one text-search parameter in the
entire API (`GET /skills?q=`). A global search field would need per-domain
endpoints that do not exist for users, projects, departments or proposals.

What ships instead: **in-page filtering** on each list, which is honest about its
scope because it sits inside the list it filters. The skills page's filter is the
only one that reaches the server; the others narrow data already loaded, which is
acceptable precisely because they are visibly scoped to one page (P6).

---

## Organization switching: not designed

Every user belongs to exactly one organization (`CurrentUserResponse.organizationId`),
and no endpoint changes it. **No organization switcher.** The organization name
appears once, in the shell, as context — not as a control.

---

## Dashboards

One home route, composed of role-gated sections. Not one dashboard for everyone,
and not four separate dashboards a multi-role user has to choose between
([02-personas-and-roles.md](02-personas-and-roles.md) §Multi-role).

Every candidate widget was tested against one question: **is this actionable, or
is it decoration?** Rejections are listed, because they are the useful part.

### Employee sections

| Card | Data | Actionable? |
| --- | --- | --- |
| **Current projects** | `GET /me/projects` → `currentProjects[]` | Yes — opens the project; shows role and hours |
| **Skill profile state** | `GET /me/skills` count | Yes — an empty or thin profile is the one thing an employee can act on |
| **Recent history** | `pastProjects[]`, most recent few | Weakly. Kept because it is the employee's only sense of continuity, and it costs no extra request |

**Rejected:** "profile completeness %" — there is no target number of skills, so
any percentage would be invented. Replaced by a plain count and a prompt when it
is zero. **Rejected:** capacity/utilisation for the employee — `availableHours` is
only exposed through Team Finder, which employees cannot call (§C-3 sibling gap).

### Department manager sections

| Card | Data | Actionable? |
| --- | --- | --- |
| **Proposals waiting on you** | `GET /department/project-proposals?status=PENDING` | Yes — the single most actionable thing in the product. Always first |
| **Unassigned employees** | `GET /departments/unassigned-employees` | Yes — one click to place them |
| **Department projects** | `GET /department/projects` | Yes — with status filter |

**Rejected: "department capacity / team availability".** A department manager has
**no endpoint returning their members' allocated hours**
([02-personas-and-roles.md](02-personas-and-roles.md)). Building this card would
require either inventing an endpoint or summing what is visible in
`/department/projects` — which covers only that department's projects and would
therefore under-report anyone allocated elsewhere. A capacity number that is
quietly wrong is worse than no capacity number. Recorded as an open question.

### Project manager sections

| Card | Data | Actionable? |
| --- | --- | --- |
| **Staffing gaps** | `GET /projects/managed` + per-project `details` → `teamRoleRequirements[].requiredMembers` vs `activeMembers[]` | Yes — the PM's core job, and it leads straight to Team Finder |
| **Awaiting a decision** | proposals with status `PENDING` on their projects | Yes — tells them what is blocked and on whom |
| **Projects by status** | `GET /projects/managed` | Yes, as a filter control rather than a chart |

**Cost note.** The staffing-gap card needs one `details` call per managed project,
because no aggregate endpoint exists. That is acceptable for a handful of
projects and a real problem at fifty. Recorded as an open question rather than
hidden behind an optimistic design.

**Rejected:** a "total people allocated across my projects" counter — a vanity
number that changes nothing.

### Organization admin sections

| Card | Data | Actionable? |
| --- | --- | --- |
| **Departments without a manager** | `GET /departments` → `manager == null` | Yes — such a department cannot review staffing at all |
| **Invite status** | `GET /organizations/current/invite` → `active`, `expiresAt` | Yes — an expired invite silently blocks all onboarding |
| **People without a role beyond EMPLOYEE** | `GET /users` → `roles` | Yes — leads to role assignment |
| **Organization counts** | departments, users, team roles, skills | **Borderline.** Kept only as a compact single line, and only because during setup "0 team roles" explains why project creation is awkward |

**Rejected:** "organization project overview" — no endpoint (§C-3).
**Rejected:** "unassigned employees" for the org admin — that endpoint is
`@DepartmentManagerOnly`, so the card would 403. The org admin's setup path says
who can do it instead.

---

## Navigation shell: two concepts

### Concept S — Persistent sidebar

```
┌──────────────┬────────────────────────────────────────────────────────┐
│ POTRIV       │  Projects › Apollo › Team Finder            [ ? ] [AM] │
│ Northwind Co ├────────────────────────────────────────────────────────┤
│              │                                                        │
│ ▸ Home       │  Find team for Apollo                                  │
│ ▸ Projects   │                                                        │
│ ▸ Staffing ③ │  …                                                     │
│ ▸ People     │                                                        │
│ ▸ Skills     │                                                        │
│ ▸ Organization                                                        │
│              │                                                        │
│ ─────────    │                                                        │
│ Mert A.      │                                                        │
│ PM · DM      │                                                        │
└──────────────┴────────────────────────────────────────────────────────┘
```

- Logo + organization name pinned top-left, as context not as a control
- Role-aware items: an item renders only if the role set grants it
- One pending indicator, on Staffing only, for department managers
- Account block at the bottom shows the roles held, in words
- Breadcrumbs in the top bar carry deep context (`Projects › Apollo › Team Finder`)
- **Mobile:** the sidebar collapses to a bottom tab bar of at most five items with
  overflow in a sheet; breadcrumbs collapse to a back affordance plus the current
  title

**Strengths:** all domains visible at once, which suits a product where a
multi-role user's work is genuinely spread across domains. Vertical lists absorb
a variable number of items without reflowing. Leaves the full page width for
tables — and Team Finder needs it.

**Weaknesses:** costs 200–240px of horizontal space on exactly the screens that
want it most; needs a collapse control; a six-item sidebar can feel oversized for
an employee who only ever uses three.

### Concept T — Top navigation with contextual sub-navigation

```
┌────────────────────────────────────────────────────────────────────────┐
│ POTRIV   Home  Projects  Staffing ③  People  Skills  Organization  [AM]│
├────────────────────────────────────────────────────────────────────────┤
│ Apollo                                    NOT STARTED · Fixed · 12 Mar │
│ Overview │ Team │ Find team │ Settings                                 │
├────────────────────────────────────────────────────────────────────────┤
│  …                                                                     │
└────────────────────────────────────────────────────────────────────────┘
```

- Global navigation across the top; a second contextual row for the current object
- Full page width available for content
- **Mobile:** global nav collapses into a menu; the contextual row becomes a
  horizontally scrollable tab strip, which is a well-understood mobile pattern

**Strengths:** maximum content width; the object-level tab row is a natural home
for Overview / Team / Find team, which are all views of one project; reads as a
product rather than an admin panel.

**Weaknesses:** six top-level items plus a context row is two navigation systems
to learn; horizontal space is finite, so a longer label set would need to
collapse; the pending indicator is less visible than in a sidebar.

### Recommendation: **Concept S — persistent sidebar**, with an object-level tab
row where an object genuinely has multiple views

Reasons, in order of weight:

1. **The pending indicator has to be unmissable.** A department manager blocking a
   project manager is the product's most time-sensitive state. A persistent
   sidebar item with a count is the strongest available placement, and it survives
   scrolling.
2. **The role set is variable.** Between three and six top-level items depending on
   roles. A vertical list handles that without any layout consequence; a
   horizontal bar visibly changes shape per user.
3. **Concept T's best idea is not exclusive to it.** The object-level tab row
   (Overview / Team / Find team / Settings) is adopted *inside* the sidebar
   layout. That is where the real benefit was, and it costs nothing to take.

The width objection is answered by making the sidebar collapsible to an icon rail
— with labels retained in the collapsed state via tooltip and `aria-label` — and
by defaulting Team Finder to the collapsed rail, since it is the one screen that
genuinely needs the pixels.

---

## Page titles and breadcrumbs

- **Document title:** `{Page} · Potriv` — object pages use the object name
  (`Apollo · Potriv`) so browser tabs are distinguishable
- **Breadcrumbs** appear only at depth ≥ 2 and always reflect the real navigation
  path, never a synthetic hierarchy
- **Page heading** is the object's name, with its status badge beside it — not
  the domain name, which the sidebar already shows
- **Contextual actions** sit at the top right of the page header, with a single
  primary action per page. Destructive actions never sit there; they live at the
  bottom of a settings tab, or inside a row's overflow menu
  ([06-ux-patterns.md](06-ux-patterns.md))
