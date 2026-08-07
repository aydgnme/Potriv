# Potriv — Frontend discovery summary

`FE-DISCOVERY-01` · product brainstorming, UX architecture and wireframes.

**Implementation performed: NONE — discovery/wireframe task only.**

No React component was created, no Next.js page edited, no dependency installed,
no style written, no endpoint wired, and no backend behaviour changed. This pack
is documentation.

---

## The pack

| Document | Covers |
| --- | --- |
| [00-repository-reality.md](00-repository-reality.md) | Phase 0 — the factual baseline everything else cites |
| [01-product-direction.md](01-product-direction.md) | Phases 1, 2, 13 — directions, principles, visual direction |
| [02-personas-and-roles.md](02-personas-and-roles.md) | Phases 3, 8 — role profiles, capability matrix, multi-role UX |
| [03-user-journeys.md](03-user-journeys.md) | Phase 4 — every journey end to end |
| [04-information-architecture.md](04-information-architecture.md) | Phases 5, 6, 19 — IA, dashboards, shell concepts |
| [05-screen-inventory.md](05-screen-inventory.md) | Phase 7 — 40 screens |
| [06-ux-patterns.md](06-ux-patterns.md) | Phases 9, 12, 16 — patterns, forms, copy |
| [07-wireframes.md](07-wireframes.md) | Phases 10, 11, 17, 18, 20 — wireframes and the state matrix |
| [08-responsive-accessibility.md](08-responsive-accessibility.md) | Phases 14, 15 |
| [09-backend-screen-traceability.md](09-backend-screen-traceability.md) | Phase 21 — all 68 operations mapped |
| [10-mvp-prioritization.md](10-mvp-prioritization.md) | Phase 22 |
| [11-open-questions.md](11-open-questions.md) | Phases 23, 25 — critique and decision register |

**Combinations explained.** Phase 0 was given its own document so fact stays
separate from proposal — the pack's labelling rules depend on that separation.
Visual direction sits with product direction because it is a consequence of it.
Dashboards and the navigation shell sit with the IA because they are its content
and its rendering. Copy sits with patterns because a pattern without its wording
is half specified. The critique sits with the decision register because it
produced several of its entries.

---

## What the repository actually contains

**There is no product frontend.** `apps/frontend` is a 1,623-line Next.js
developer console that says so itself — its header reads *"dev/demo console —
not the product UI"*. Two routes, no design system, no UI library, no Tailwind,
three runtime dependencies.

So nothing has to be migrated or undone. The discovery starts from zero, which is
the most useful fact in this pack.

## What the product is

A **negotiation across an authority boundary**: a project manager needs people, a
department manager owns them, and nobody staffs a project unilaterally. Every
important workflow is a variation on that handshake.

**Recommended direction: Project Allocation Command Center**, executed with
operational-workspace density. Rejected: a People & Skills platform, because
skill data is unvalidated self-assessment — no endorsement endpoint exists
anywhere — and building the product's identity on it would imply a rigour the
backend does not have.

## The eight constraints that shaped everything

Read from the code, not assumed:

1. **No pagination** on any product endpoint → no page controls anywhere; totals
   stated; long lists virtualised
2. **One text search in the whole API** (`/skills?q=`) → global search is
   future-only, not a shell feature
3. **No organization-wide project list** → the org admin's project overview
   cannot be built
4. **A department manager has exactly one department**, but cannot list
   departments — the id arrives via `GET /department/projects`
5. **Deallocation requires a reason; rejection cannot carry one** → the review UI
   states the absence rather than faking a field
6. **Team Finder's score is deterministic, fully evidenced — and narrower than it
   looks.** `skillScore = round(60 × matchedTechnologies / projectTechnologies)`,
   `pastProjectScore` is binary `0|20`, `availabilityScore = round(20 × availableHours / 8)`.
   Level and experience are returned but **do not affect the score** → the UI
   explains rankings from returned data, never calls them intelligent, and says
   plainly that levels are context rather than weight
7. **Capacity is 8h/day, enforced at three moments** — including a recalculation
   at accept time that leaves the proposal `PENDING` → a designed UI state, not
   an error
8. **Validation errors are one joined string** → rules are mirrored client-side;
   the server message is shown at form level

## The decisions that matter most

- **Staffing is a top-level navigation item.** Without it, the two time-critical
  screens sit two clicks deep inside a project and a department
- **No role switcher.** The backend has no active-role concept, so the control
  would constrain nothing while appearing to. Navigation is the union of
  capabilities; authority is communicated by object
- **Team Finder is a split view, and Propose lives in the detail panel.** A
  proposal must not be sendable from a table row showing truncated evidence
- **Colour is reserved for domain status.** Primary actions are monochrome —
  these screens are saturated with status, and colour must not compete
- **Capacity is omitted wherever the API does not supply it.** A quietly wrong
  number is worse than none

## The three findings that became backend work

All eight product decisions have been ruled on. Three require backend changes
**before** frontend implementation starts. None means "the backend is
incomplete" — the agreed scope was delivered and verified; designing the UI
exposed contract data the review and onboarding flows need, which is what a
discovery phase is for.

| | Finding | Approved fix |
| --- | --- | --- |
| **B1** | A department manager approves staffing **without being able to see the employee's load**. Team Finder computes exactly that figure — for project managers only. The role *deciding* has less information than the role *asking* | Capacity context (`allocatedHours` / `availableHours` / `requestedHours`) **on the review response** — not a generic capacity dashboard. It reuses the correct calculation and gives it to the one screen that needs it |
| **B2** | A rejected project manager receives a **bare refusal** — accept and reject take no request body | A persisted reason on assignment and deallocation reject |
| **B3** | A **single-person organization cannot bootstrap itself.** `UserRoleManagementService` refuses self-role-modification with a `400`, so a founding admin can create departments and team roles and then stop — they cannot staff a project or place anyone into a department | Make solo setup possible in the backend, preserving the guard's original protections. Explicitly **not** solved with frontend copy |

Everything else was ruled out of MVP (organization project overview, employee
capacity, dark mode) or confirmed as designed (`/skills?q=` is enough search;
the invite link appears on Home during setup only).

## Two corrections found while closing the technical questions

Verifying the eight technical questions against the code caught two things this
pack had wrong, and both changed the wireframes:

- **Invites never expire.** `expiresAt` is always `null`. The invite screen's
  expiry date and "expires soon" warning are gone; rotation is documented as the
  **only** revocation mechanism, which makes it the more important control there
- **The Team Finder score does not work the way the wireframes implied.**
  `pastProjectScore` is **binary** — exactly `0` or `20`, never `18`. And
  `skillScore = round(60 × matchedTechnologies / projectTechnologies)`, so
  **skill level and experience do not affect the score at all**: a
  `LEARNS` / `0-6 months` match scores identically to `TEACHES` / `7+ years`.
  They are evidence for the human, not ranking inputs, and the detail panel now
  says so

## Coverage

| | |
| --- | --- |
| Backend operations mapped | **68 of 68** |
| In the product frontend | 66 |
| Deliberately excluded (system-admin console) | 2 |
| Screens specified | 40 |
| Wireframe blocks | **31** — 22 screen wireframes, 4 Team Finder (2 competing concepts + mobile + proposal forms), 3 proposal review, 2 application shell |
| Of those, mobile variants | 3 (Team Finder, project overview, shell) |
| All 25 wireframes required by the brief | covered |
| Ideas marked `FUTURE / BACKEND NOT AVAILABLE` | 11 |
| Decisions made | 20 design + 8 product, all resolved |
| Approved backend prerequisites | 3 (B1, B2, B3) |
| Technical questions | 8, all closed against the code |
| Corrections applied from that verification | 2 (invite expiry, score arithmetic) |
| New questions raised by it | 2 (Q9 level weighting, Q10 account status) |

## What happens next

```text
1. Backend enhancements  B1 capacity context · B2 rejection reason · B3 solo onboarding
2. Update this pack      review wireframes, reject copy, org-admin setup path
3. Merge                 the discovery pack lands once it matches the contract
4. Lock the wireframes
5. Begin frontend implementation
```

The pack stops at the **STOP GATE**. It currently describes the system **as it
is**, not as it will be after B1–B3 — every place that changes is already
identified in [11-open-questions.md](11-open-questions.md) §"What changes once
Q1, Q2 and Q4 land", so the update is one pass rather than a rediscovery.

---

## Verdict

**`READY WITH OPEN PRODUCT DECISIONS`**

The discovery itself is complete and the decisions are locked. The verdict stays
as it is for one honest reason: **three approved backend changes (B1, B2, B3) sit
between this pack and implementation**, and two of them alter the review screens —
the most important screens in the product.

Calling it `READY FOR PRODUCT REVIEW` would suggest nothing further is pending.
Calling it `READY TO IMPLEMENT` would be plainly wrong: a frontend built against
today's contract would have to be reworked in exactly the places that matter
most.

The pack is accurate about the system as it stands today, and it names precisely
what changes when B1–B3 land.
