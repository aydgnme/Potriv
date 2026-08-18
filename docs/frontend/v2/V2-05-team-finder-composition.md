# V2-05 — Team Finder & Team Composition

Base: `v2` at `89fd500a2b16a78386043aa5a16b59832c8b1f7a` (after PR #100).

Team Finder as an **evidence workbench for making a staffing request**. Not a
recommendation engine, not a marketplace, not an assignment board.

The screen was already truthful when this slice began — backend ranking shown
verbatim, no AI language, no invented capacity. What V2-05 adds is the one thing
it could not answer: *what does this project still need, and how much of that gap
already has requests standing against it?*

---

## 1. Backend truth (unchanged)

`POST /projects/{projectId}/team-finder` is deterministic, read-only despite the
verb, owner-scoped, same-organization-scoped, non-persisting, and not AI.

Score components are backend-owned and rendered verbatim:

```
matched skills          / 60
past project similarity / 20
availability            / 20
total                   / 100
```

Nothing in the frontend recomputes a component, re-derives the total, or adds a
weight. Skill level and experience are **context only** and change no score —
stated on screen, and pinned by a test.

Candidate exclusions (no department, existing pending proposal for this project,
already actively allocated, fails availability criteria, no skill or past-project
match) stay entirely in the backend. None is reimplemented here.

`candidateCount` is the number returned **after** the limit. It is never labelled
a total.

---

## 2. Team composition — the new capability

### The invariant

```
Open = Needed − Active
```

**Proposals are counted, shown, and never subtracted.** A proposal is a request a
department manager has not answered; nobody is on the project because of one. A
role needing three people with one allocated and two proposed still has two
positions open.

The prompt's worked case, which is now a test:

```
Team role            Needed  Active  Proposed  Open
Backend Engineer          3       1         1     2
```

Never 1.

`open` is computed from `requirementOpenings`, which has no access to the
proposal count at all — the arithmetic cannot accidentally include it.

### Source

`/details` carries requirements and active members but **no proposals**. So the
loader adds exactly one bounded read of `/projects/{id}/team`, narrowed to a
Staffing-local type:

```ts
export type ProjectProposedMembers = {
  readonly proposedMembers: readonly {
    readonly proposalId: string;
    readonly roles: readonly { readonly teamRoleId: string }[];
  }[];
};
```

Local rather than imported from `modules/projects`: the two modules read the same
endpoint but narrow it to different questions, and modules do not import each
other.

Active members are deliberately **not** taken from `/team`. They come from
`/details` alongside the requirements, so both halves of `Needed − Active` come
from one consistent snapshot rather than two reads that could disagree.

### Partial failure

If `/team` fails, `Proposed` renders `—`, never `0`, and the table says the column
is *unknown rather than zero*. The Finder stays fully usable. Unknown is not none.

---

## 3. Load order

```
1. relationship-aware GET /projects/{id}/details
2. unavailable            → safe anti-leak refusal, nothing else fetched
3. readable but not owner → "Only this project's manager can staff it", nothing else fetched
4. no technologies        → nothing was searched, so nothing is requested
5. owner                  → Finder POST + team read, in parallel
```

Steps 2, 3 and 4 each have a test proving **neither** the Finder **nor** the team
read was called. No sensitive fan-out happens before the backend has confirmed
this caller may see the project.

---

## 4. Request budget

| State | Requests |
|---|---|
| unavailable / not-owner / no-technologies | 1 (`/details`) |
| owner, ready | **3** — `/details`, Finder POST, `/team` |

Fixed. A project with thirteen required people and a hundred returned candidates
costs the same three requests — pinned by a test. Candidate evidence comes
entirely from the Finder payload; there is no per-candidate read.

---

## 5. Candidate workbench

The results list became a native `<table>` with real column headers:

```
Candidate | Department | Availability | Matched evidence | Score
```

The **row is not the click target** — a bare `<tr>` with an `onClick` cannot be
reached by keyboard. The name cell carries a real `<button aria-pressed>`; the
rest of the row is data.

- Backend order is the default; the first backend-ranked candidate is selected.
- Selection is local inspection only. No storage, no shortlist, no favourites,
  no re-run of the Finder.
- The optional sort is retained, labelled *Sort returned candidates*, operates
  only on the returned set, and is stable so backend tie-breaking still decides.
- "Matched evidence" is counts of what the backend returned — never a verdict.

---

## 6. Relationship grammar

Continuing V2: **dashed = proposed, solid = accepted.** In the composition table
the counts themselves carry it — `Active` underlined solid in `--p-brand`,
`Proposed` underlined dashed. At ≤767px the underline becomes a leading rule so
the grammar survives the stacked layout.

Never colour alone: the column headers name both, and the sentence beneath states
that proposals do not reduce Open.

---

## 7. Proposal

Fields unchanged: `employeeId`, `workHoursPerDay`, `teamRoleIds[]`, `comments?`.
Review department is backend-derived and snapshotted — there is no picker.

Copy aligned to the staffing language: **Send staffing proposal** / **Send
proposal**. Never "Assign", "Add to team" or "Reserve".

Success now states what actually happened:

> Waiting for department review — sent to *{department}*. Nobody is allocated yet.

No optimistic update: Open is not decremented, Active is not incremented, the
candidate is not removed, and no requirement is marked filled.

Server revalidation is untouched — session, `PROJECT_MANAGER`, project UUID,
project re-read, owner re-check, open-role re-derivation, stale/inactive/filled
role rejection, and backend capacity authority. Hidden form inputs are never
treated as authority.

---

## 8. Two corrections found while reading

**§55 — unavailable filter.** Including unavailable people was not explained.
Widening who is *returned* is not widening who can be *proposed*, and a manager
could read a full evidence panel before discovering the form was closed. The
criteria now say so where the box is ticked.

**§14 — invented default.** The "Showing results for…" sentence fell back to
`closeToFinishWeeks ?? 2`, hardcoding a backend default the browser has no right
to know. If the backend echoed null, the UI asserted "2 weeks" without evidence.
It now says "finishing other work soon" instead of naming a window nobody
returned.

---

## 9. Invariants under test

```
selected            != proposed
proposed            != allocated
capacity snapshot   != reservation
Open = Needed − Active   (never − Proposed)
failed team read    != zero proposals
skill level/experience is not a score input
```

Each has at least one test that fails if the invariant is broken.

---

## 10. Deliberately not changed

- The backend algorithm — weights, filters, availability, normalization,
  tie-breaking, limit semantics. No change was needed.
- `/staffing`, `ReviewQueue`, `ReviewDetail`, accept/reject, deallocation review.
  **V2-06 owns those.**
- Project Overview and Project Team — V2-04 shipped them; only breadcrumb and
  context-nav consistency is preserved here.
- Candidate email stays out of the UI. It is in the payload and does not
  materially support the staffing decision.
- No drag-and-drop, no virtualization, no new chart/grid/state package.

---

## 11. Component audit

**KEEP** — `ScoreBreakdown`, `CapacityBlock`, `teamFinderQuery`, `proposalActions`,
`staffingDataSources` (extended, not reshaped), `teamFinderData`

**REFINE** — `TeamFinderScreen` (composition section), `TeamFinderResults`
(list → semantic table), `TeamFinderCriteriaForm` (§55 copy, §14 correction),
`ProposeAssignmentForm` (staffing language), `loadTeamFinder` (composition read),
`openRequirements` (composition model), `TeamFinder.module.css`

**ADD** — `TeamComposition`

**LEAVE FOR V2-06** — `StaffingPage`, `ReviewQueue`, `ReviewDetail`,
`RejectDialog`, `reviewActions`, `removalActions`, `loadStaffing`

**REMOVE** — nothing. No component proved redundant.

---

## 12. Responsive matrix

Measured in a real browser, both criteria states, all seven widths:

```
        320  375  390  768  1024  1280  1440
default  ok   ok   ok   ok    ok    ok    ok
widened  ok   ok   ok   ok    ok    ok    ok
```

Zero page-level horizontal overflow at any width. At **every** width the
composition row reported `Needed=3 Active=1 Proposed=1 Open=2` with no cell
hidden — nothing is dropped to fit mobile.

The two-pane workbench appears only at ≥1024px (`352px 536px` at 1024, single
column at 768 and below), so it never renders in a cramped half-state.

Tables become labelled stacked records at ≤767px; `thead` is visually hidden but
stays in the DOM with its `th[scope=col]` intact.

Bottom navigation clears the last control at 390px by 142px, and the clearance is
reserved (`main` `padding-bottom: 80px`) rather than incidental. At 1440px there
is no fixed bottom nav — the shell uses a sidebar.

---

## 13. Accessibility

Verified in-browser:

- exactly one `h1`
- native `<table>` with `th[scope="col"]`; **zero** `div`/`tr`/`span` click targets
- candidate selection is a native `<button aria-pressed>` and also says
  "· Selected" in text
- relationship grammar differs by pattern (`Active` solid, `Proposed` dashed) and
  the columns are named in words
- fieldset legends: "Who to include", "Roles", "Commitment"
- hours field has a real `<label for>` and `aria-describedby="hours-hint"`
- global `:focus-visible` outline rule applies
- the mobile-hidden detail pane is `display: none`, and a control inside it
  **could not take focus** — focus stayed on `body`. No hidden duplicate
  focusable pane.

Focus order is the reading order:

```
criteria checkboxes → weeks → limit → Run finder → sort
→ candidate selection → role checkboxes → hours → comments → Send proposal
```

**Stated limitation.** This environment delivers injected key events to JS
listeners but does not perform browser *default actions*, so Enter/Space/Escape
activation could not be exercised as a real key press. What was verified instead
is that every control is a native element (`button`, `input[type=checkbox]`,
`input[type=number]`, `select`, `textarea`, `button[type=submit]`) for which the
browser supplies those defaults — and that no interactive behaviour is attached
to a non-focusable element. Real 200% browser zoom was not exercised; only
narrow-viewport reflow.

---

## 14. Live verification

Against a **local** backend only (`localhost:8080/api`, from
`apps/backend/target/classes`). Production was never targeted.

Seeded: founder → self-granted `PROJECT_MANAGER` + `DEPARTMENT_MANAGER` →
department (self-appointed manager) → 2 team roles → skill category + Java and
PostgreSQL → 3 employees, department members, each with both skills.

Flow: project (Java + PostgreSQL; Backend ×3, QA ×1) → **Finder returned 3
candidates**, `60+0+20=80` each, backend criteria echoed
`closeToFinishWeeks: null` → proposal 1 accepted → proposal 2 left pending.

Backend proof, read from `GET /projects/{id}/team` rather than from UI copy:

```
proposedMembers: 1  ['Employee Number 2 …']
activeMembers:   1  ['Employee Number 1 …']
pending person appears in proposedMembers: True
pending person is NOT in activeMembers:    True
accepted person is active, not proposed:   True
```

The UI then rendered, from the real app:

```
Team role            Needed  Active  Proposed  Open
Backend Engineer          3       1         1     2
QA Engineer               1       0         0     1
```

Employees 1 and 2 stopped appearing as candidates — the backend's own exclusion
of already-allocated and already-proposed people, not a frontend filter.

Throwaway project deleted (204), session revoked (200), fixtures removed.

### Token-safe method

The V2-04 leak happened because a cookie jar was printed and a `sed` redaction
did not match. This slice never printed and never redacted:

- tokens were read into shell variables and passed straight into curl headers;
  no `echo`, `cat`, `grep` or `sed` ever touched a token value
- the cookie jar was written with `-c` and used with `-b`, never read back;
  only cookie **names** were listed (`awk` printing field 6 only)
- every request reported `%{http_code}` to `/dev/null`, or had its body parsed by
  python that printed only explicitly named safe fields
- credentials were written to `chmod 600` files, used by path, and deleted

---

## 15. Known limitations

- The composition **partial-failure** path (`/team` fails → `Proposed = —`) is
  covered by unit and screen tests, not live: forcing a single endpoint to fail
  against a healthy local backend would have meant editing the app.
- An **unavailable candidate** (`availableHours = 0`) was not produced live —
  every seeded employee had full capacity. The blocking behaviour, including the
  close-to-finish case, is covered by tests.
- Keyboard default actions and 200% zoom, as described in §13.

---

## 16. Production isolation

`main` was not modified. PR base is `v2`. `origin/main` remained
`3298c1cf079683033157500829a929caba08bd57` throughout.

No Git merge/update was made to `main`; external deployment behavior was not
independently observable.

Neither `v2` nor `main` has branch protection. No repository settings were changed.

---

## 17. Next slice

```
V2-06 — Staffing
```
