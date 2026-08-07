# 01 — Product direction, principles and visual direction

Combines Phase 1 (product directions), Phase 2 (principles) and Phase 13 (visual
direction). They are kept together because the visual direction is a consequence
of the product direction, not an independent choice — splitting them would let
one drift from the other.

---

## What Potriv actually is

Before choosing a direction, name the product honestly.

Potriv's spine is a **negotiation across an authority boundary**:

> A project manager needs people. A department manager owns people. Nobody can
> staff a project unilaterally.

Every important workflow is a variation on that handshake:

| Step | Who | Endpoint |
| --- | --- | --- |
| Define the need | PM | `POST /projects` — technology stack + team-role requirements |
| Find candidates | PM | `POST /projects/{id}/team-finder` — scored, with evidence |
| Ask | PM | `POST /projects/{id}/assignment-proposals` |
| Decide | DM | `POST /department/project-proposals/assignments/{id}/accept|reject` |
| Undo | PM → DM | deallocation proposal, same handshake, reason required |

Two supporting systems feed it: the **skill profile** employees maintain about
themselves, and the **organization structure** an admin maintains (departments,
managers, team roles, invites).

This shape is what the three directions below are judged against.

---

## Direction A — Operational Workspace

A dense, role-driven internal tool. Every domain is a list you work through;
work arrives as queues.

| Aspect | |
| --- | --- |
| Personality | Efficient, unopinionated, keyboard-friendly. A tool, not a destination. |
| Information density | High. Tables everywhere, minimal chrome. |
| Navigation | Flat sidebar of domains: People, Departments, Skills, Projects, Proposals. |
| Dashboard | A single "what needs me" queue; everything else is a list. |
| Visual tone | Neutral, utilitarian. |
| Workflow emphasis | Throughput — clear the queue. |
| Strengths | Cheap to build; scales to every endpoint uniformly; no screen is special so nothing is neglected; matches how admins actually work. |
| Weaknesses | **Team Finder becomes just another table**, which wastes the one capability with a real scoring model behind it. Nothing communicates what Potriv is *for*. New users see structure, not purpose. |
| Best fit | Organization admins and department managers doing routine maintenance. |

## Direction B — People & Skills Platform

Employee- and skill-first. The organization's capability graph is the centre;
projects consume it.

| Aspect | |
| --- | --- |
| Personality | Human, profile-centric, closer to an HR product. |
| Information density | Medium. Profile pages, skill chips, category browsing. |
| Navigation | People · Skills · Departments, with Projects secondary. |
| Dashboard | "Your profile and your growth" for employees; capability coverage for managers. |
| Visual tone | Warmer, more editorial. |
| Workflow emphasis | Profile completeness and capability discovery. |
| Strengths | Gives employees a genuine reason to log in, which matters because **employees are the only source of skill data** (`POST /me/skills` is self-service and self-scoped). Better skill data directly improves Team Finder scores. |
| Weaknesses | **It overstates what the data is worth.** There is no endorsement, validation, or review endpoint anywhere in the API — `EmployeeSkill` is unverified self-assessment. Building the product's identity on a capability graph implies a rigour the backend does not have. It also buries the allocation workflow, which is where the actual decisions happen. |
| Best fit | Employees; organizations treating Potriv as a skills inventory. |

## Direction C — Project Allocation Command Center

Projects, staffing, capacity and Team Finder are the central mental model.
Proposals are first-class objects with their own lifecycle, not a side effect.

| Aspect | |
| --- | --- |
| Personality | Operational and decisive. The product is about staffing decisions and their consequences. |
| Information density | High where it earns it (Team Finder, project team, review queue), calmer elsewhere. |
| Navigation | Projects · Staffing · Reviews as the spine; People, Departments, Skills as the supporting structure. |
| Dashboard | Role-specific and decision-shaped: what is waiting on me, what is understaffed, who is free. |
| Visual tone | Neutral chassis with colour reserved for domain status. |
| Workflow emphasis | The proposal handshake, end to end, with capacity always in view. |
| Strengths | Matches the domain model exactly — proposals, allocations, capacity and scores are all real backend concepts with rich payloads. Makes Team Finder prominent, which is the one screen where Potriv does something a spreadsheet cannot. Gives the PM↔DM boundary a visible home. |
| Weaknesses | Risks under-serving the employee, who has the fewest capabilities (own skills, own projects, read a project). Needs deliberate work to keep the admin's structural tasks from feeling like second-class citizens. |
| Best fit | Project managers and department managers — the two roles that generate and resolve every staffing decision. |

---

## Recommended direction

**Direction C — Project Allocation Command Center**, with Direction A's density
discipline applied to every non-flagship screen.

Why:

1. **It matches the payloads.** `TeamFinderCandidateResponse` returns a
   decomposed score plus its evidence; `ProjectDetailsResponse` returns active
   members, past members and role requirements together; `ProjectTeamResponse`
   returns proposed, active and past members with who proposed and who approved.
   These are not list payloads — they are decision payloads. A direction that
   renders them as plain tables throws away work the backend already did.
2. **It puts the authority boundary where users can see it.** The PM↔DM handshake
   is the product's one genuinely hard interaction. Directions A and B both leave
   it implicit.
3. **It does not overstate the data.** Unlike Direction B, it treats the skill
   profile as an input to a scored search rather than as a source of truth about
   people.

What is taken from Direction A: the sidebar shape, table-first defaults,
uniform list behaviour, and the refusal to make ordinary CRUD screens special.
Team Finder and the review queue earn bespoke layouts. Skill categories do not.

What is taken from Direction B: employees get a real home — their skills page is
framed as *"this is what Team Finder will see"*, which is both true and the only
honest motivation to keep it current.

**Rejected explicitly:** a "choose your role on login" screen (see
[02-personas-and-roles.md](02-personas-and-roles.md) §Multi-role) and any
organization-wide analytics dashboard (no endpoints exist — see
[00-repository-reality.md](00-repository-reality.md) §C-3).

---

## Product principles

Ten principles, each traceable to something in the repository rather than to
general UX advice.

### P1 — The proposal is the product

Nothing about staffing happens instantly. A PM's action creates a *request*; a
DM's action resolves it. The UI must never render a proposal action as if it
takes effect immediately, and must never show a project team as final while a
proposal on it is `PENDING`. `ProjectTeamResponse` separates `proposedMembers`
from `activeMembers` for exactly this reason — the UI keeps that separation.

### P2 — Show the evidence, not just the score

A `totalScore` of 78 means nothing on its own. Wherever a score appears, its
three components and their supporting data are reachable without leaving the
screen. Because `TeamFinderScore` is deterministic and its inputs are returned,
this is a rendering job, not a modelling job. Corollary: **never describe the
ranking as intelligent, learned, or AI-driven.** It is arithmetic, and saying so
is both accurate and more trustworthy.

### P3 — Capacity has a real denominator

`MAX_HOURS_PER_DAY = 8`. Every availability display uses hours out of eight, from
real `allocatedHours` / `availableHours` values. No invented percentages, no
"utilisation index", no estimated capacity.

### P4 — Never offer a field the API cannot store

The most concrete case: **rejection has no reason field.** Accept and reject take
a path variable and nothing else. The review UI therefore has no rejection
comment box. Where a decision genuinely needs a note, the product owner is asked
for a backend change — the UI does not fake it.

### P5 — Say what the data is worth

Skill levels and experience bands are **self-declared**; no endorsement or
validation endpoint exists. Anywhere skills influence a decision — Team Finder
results above all — the interface says so plainly, once, without nagging.

### P6 — A list that is filtered in the browser must not pretend otherwise

No product endpoint paginates. Client-side filtering and sorting are therefore
the honest implementation, and the UI states the total it is working from
("showing 12 of 240 skills"). No page-number controls that merely re-slice an
array already in memory. Where unbounded growth is a real risk, that risk is
recorded rather than designed around.

### P7 — Role says what exists; ownership says what you may touch

`@DepartmentManagerOnly` lets a request through; `requireManagedDepartment`
decides whether it succeeds. The UI reflects both layers: it shows a capability
because of the role, and it scopes the objects because of ownership. A department
manager sees "my department", not a department picker.

### P8 — Destructive actions name the object and its consequence

`DELETE /projects/{id}` requires `?confirmed=true` and refuses outright for
`IN_PROGRESS`, `CLOSING` and `CLOSED`. Confirmation dialogs therefore state the
project's name and its status, and the action is absent — not merely disabled
with a shrug — where the backend will refuse it. The same applies to removing a
department member, deleting a department, and revoking a session.

### P9 — Empty states are the onboarding path

A newly registered organization is empty in every direction at once: no
departments, no team roles, no skills, no projects, no employees. The first-run
experience *is* a chain of empty states, so each one names the next real action
and who can perform it. This is a product requirement, not polish.

### P10 — Desktop-first density, but nothing is desktop-only

Team Finder, project details and the review queue are desktop-shaped. They still
have a defined mobile form — a department manager approving a proposal from a
phone is a realistic Tuesday. What is not acceptable is a shrunken table.

---

## Visual direction

Three directions, expressed as tokens and rules. No production CSS, no
high-fidelity mockups — that is a later task.

### V1 — Instrument Panel

| | |
| --- | --- |
| Mood | Cool, technical, quiet. Familiar to anyone who uses modern developer tools. |
| Typography | One neutral grotesque (Inter-class). Tabular numerals for all hours, counts and scores. Headings by weight and size, not colour. |
| Density | Tight. 32–36px table rows, 8px base spacing unit. |
| Border/radius | 4px radius. Borders carry structure; shadows only for true overlays. |
| Spacing | 4/8/12/16/24/32 scale. |
| Colour strategy | Neutral gray ramp plus a single blue accent used for primary actions, links and selection. |
| Status colours | Semantic ramp separate from the accent. |
| Icons | Outline, 16/20px, always paired with a text label. |
| Tables | Dense, zebra-free, hairline row separators, sticky header. |
| Cards | Rare — used for genuinely non-tabular content. |
| Dark mode | Excellent; the neutral ramp inverts cleanly. |

### V2 — Studio Notebook

| | |
| --- | --- |
| Mood | Warm, calm, editorial. Reads as a considered document rather than a control panel. |
| Typography | Higher-contrast type; larger headings; comfortable measure for descriptions. |
| Density | Airy. 44–48px rows, 12px base unit. |
| Border/radius | 8–10px radius. Soft separators, more whitespace than rules. |
| Spacing | Generous; whitespace is the primary grouping device. |
| Colour strategy | Warm paper neutrals with a muted accent. |
| Status colours | Softer, lower-saturation. |
| Icons | Fewer; more words. |
| Tables | Roomy, closer to a list. |
| Cards | Common — the default container. |
| Dark mode | Awkward; warm neutrals invert to muddy tones without a second palette. |

### V3 — Signal Discipline

The V1 chassis with one hard additional rule: **colour is reserved for domain
status. Nothing else may use it.**

| | |
| --- | --- |
| Mood | Neutral to the point of severity, then unmistakable where it matters. |
| Typography | As V1. |
| Density | As V1. |
| Border/radius | As V1 — 4px, borders over shadows. |
| Spacing | As V1. |
| Colour strategy | The interface is monochrome. Buttons, links, selection and focus are expressed with weight, border, fill and underline — not hue. Every hue on screen encodes a domain state. |
| Status colours | The entire colour budget: project status (5), proposal status (3), availability (4), account status (3), skill level (5, as a stepped scale rather than distinct hues). |
| Icons | As V1, always labelled. |
| Tables | As V1, with status rendered as a badge carrying **both** a colour and a word. |
| Cards | As V1. |
| Dark mode | Excellent, and the discipline makes contrast tuning simpler because there are fewer semantic colours to balance. |

### Recommended visual direction: **V3 — Signal Discipline**

Potriv screens are saturated with status. A single Team Finder row can carry an
availability state, several skill levels and a score; a project team row carries
a project status, a proposal status and an allocation. Under V1, a blue "Propose"
button competes with all of it. Under V3, colour is never decorative, so a
reviewer scanning twelve pending proposals sees state immediately.

V2 is rejected for the product surface: it is pleasant but it cannot carry
Team Finder or the review queue at a workable density, and its dark mode would
need a second palette.

Two rules make V3 concrete and testable:

1. **No colour without a word.** Every status badge carries text. This is also the
   accessibility requirement (see
   [08-responsive-accessibility.md](08-responsive-accessibility.md)) — the two
   goals coincide, which is a good sign.
2. **Primary actions are monochrome.** A primary button is the highest-contrast
   neutral fill on the screen. It does not need a hue to be found.

Explicitly avoided: gradient headers, purple-to-indigo brand washes, glassmorphism,
and illustrated empty states. An allocation tool that looks like a consumer AI
product misrepresents what it does.
