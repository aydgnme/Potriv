# V2-06 — Staffing Review Workbench

Base: `v2` at `9a62caa2f07f731e85ef99ebd9597ef313977195` (after PR #101).

Staffing as **an operational review inbox where a department manager makes
accountable staffing decisions.**

The domain was already semantically correct when this slice began — one merged
feed, backend order preserved, `reason` and `rejectionReason` kept apart, capacity
taken verbatim. V2-06 did not rewrite it. What changed is density, one misleading
heading, and the tests that pin the invariants against future edits.

---

## 1. Capability and authority

Two distinct rules, and the second is the one that is easy to get wrong.

**Capability** — `/staffing` is for `DEPARTMENT_MANAGER` **or** `PROJECT_MANAGER`.
Roles are additive, there is no switcher, and someone holding both gets both
sections with reviews first, because that is work other people are blocked on.

**Authority** — holding `DEPARTMENT_MANAGER` is *not* the same as being appointed
to a department. Verified live against the local backend:

```
holds DEPARTMENT_MANAGER, no appointment
GET /department/project-proposals  ->  403

after PUT /departments/{id}/manager
GET /department/project-proposals  ->  200
```

That 403 is a setup state, not an outage and not an empty queue, and the UI says
so: *"You are not managing a department yet."* It is carried through the loader
as `FORBIDDEN` rather than flattened into `ERROR`, and a test pins that.

`PROJECT_MANAGER` never confers review authority; it only opens the managed
projects section.

---

## 2. Review queue

**One merged feed.** `GET /department/project-proposals?status=…` returns
assignment and removal requests together. The frontend makes exactly one call and
never splits them.

**Backend order, untouched.** The backend sorts `createdAt ASC`, then
`proposalType`, then `proposalId`. Re-sorting by type, project or "urgency" would
bury a three-week-old request under one from this morning. The oldest-first order
*is* the prioritisation — there is no SLA, no urgency flag, no priority score.

**Status is URL state.** `PENDING` (default), `APPROVED`, `REJECTED`; anything
unrecognised falls back to `PENDING` without reaching the backend. Each status
keeps its own empty message, and none of them is the error message.

### What changed

The queue was a column of button-shaped cards. It is now a native `<table>`:

```
Request | Employee | Project | Commitment | Requested
```

The row is **not** the click target — a bare `<tr>` with a handler is unreachable
by keyboard — so the button lives in the row header cell and every other cell is
data. Below 1280px the same markup becomes labelled stacked records, so the
semantics never change with the layout.

Each button also carries a visually-hidden `— {employee}, {project}`. Without it a
queue of five reads as five identical "Assignment request" buttons: the columns
beside it are what disambiguate them on screen, and a screen reader is not in the
row. This was found by a test failing, not by inspection.

---

## 3. Assignment review

Shows employee, review department, project, project status, team roles, hours per
day, requester and date, the project manager's `comments`, and — while pending —
capacity.

Verified live:

```
accept  ->  active allocation exists, employee no longer proposed
reject  ->  no active allocation, employee not proposed
```

---

## 4. Deallocation review

A removal request asks to end an active allocation. It shows the project
manager's `reason` and **no capacity block** — ending an allocation releases
hours rather than consuming them.

Verified live:

```
accept  ->  deallocatedAt set, allocation moved to past (active 3 -> 2)
reject  ->  allocation remains ACTIVE
```

---

## 5. The two reasons

The invariant most likely to be quietly broken:

```
reason           = why the PROJECT MANAGER asked to end the allocation
rejectionReason  = why the DEPARTMENT MANAGER declined that request
```

Different facts, from different people, on a record of an accountable decision. A
rejected removal carries **both at once** — confirmed live:

```
proposer's removal reason : Rolling off after the migration milestone.
reviewer's rejectionReason: Employee is still required during transition.
distinct: True
```

They render under separate headings in separate sections: the proposer's words in
*Request*, the reviewer's in *Decision*. Tests assert both are present, that
neither leaks into the other's section, and that a missing `rejectionReason` shows
"No reason given" rather than borrowing the proposer's sentence.

**Mutation-tested.** Making `rejectionReason` fall back to `reason` fails the
suite; the invariant was restored and re-run green.

Assignment `comments` are never labelled as a review or rejection reason.

---

## 6. Capacity

Rendered verbatim from the backend:

```
maxHoursPerDay
allocatedHoursPerDay
availableHoursPerDay
requestedHoursPerDay
projectedAllocatedHoursPerDay
projectedAvailableHoursPerDay
currentlyAcceptableByCapacity
```

**The frontend never recomputes acceptability.** A test feeds deliberately
contradictory data — the arithmetic says it fits, the backend says it does not —
and asserts the backend wins. Recomputing would be a second, quieter capacity
model that could disagree with the one that actually decides.

```
capacity snapshot != reservation
```

Nothing is held for a proposal. The copy says capacity *"is checked again when you
accept"*, and a test forbids the words reserved / reservation / held for /
guaranteed.

When `currentlyAcceptableByCapacity` is false: **Accept disabled, Reject still
available, request left pending.** Never auto-rejected, never hidden — the backend
deliberately leaves it pending and the decision stays the manager's.

`capacity === null` means no block at all, never `0 / 8`. Null is not zero: a
removal frees hours and a decided request has nothing left to check.

---

## 7. Concurrency

A 409 carrying "already been reviewed" is classified as **stale**, distinct from a
capacity conflict which is an ordinary 409. Once stale is known the decision
controls are withdrawn and the queue is re-read, so a second decision is never
invited. There is no undo — the backend exposes none, so offering one would be a
button that cannot work. Decided requests are strictly read-only.

---

## 8. Project-manager section

`Projects you staff` is now a table: **Project · Status · Staffing** (Find team /
View team), built only from what `GET /projects/managed` already returns.

It is deliberately **not** a "requests I sent" inbox. No PM-wide proposal endpoint
exists, and building one by asking every managed project for its team would be an
N+1 fan-out inventing a feature. No per-project proposal count, team count or
staffing gap, for the same reason.

`Find team` and `View team` are links into V2-05 and V2-04. Team Finder is never
run from this list.

---

## 9. Request budget

Fixed, gated on the role that entitles each source:

| Capability | Calls |
|---|---|
| neither | **0** privileged |
| DM only | 1 × `GET /department/project-proposals?status=X` |
| PM only | 1 × `GET /projects/managed` |
| DM + PM | 2, in parallel |

No tab-count fan-out: the three status tabs are links, not three queue reads.
Selecting a request costs nothing — the queue payload already carries the detail,
and only the selected detail is mounted. Tests pin every count.

Partial failure is independent: a failed queue leaves the project section usable
and vice versa.

---

## 10. Responsive

Three states (Waiting / Approved / Rejected) × seven widths, all clean:

```
        320  375  390  768  1024  1280  1440
waiting  ok   ok   ok   ok    ok    ok    ok
approved ok   ok   ok   ok    ok    ok    ok
rejected ok   ok   ok   ok    ok    ok    ok
```

Zero page-level horizontal overflow anywhere. Single column at ≤768 — the split
never appears cramped — two panes from 1024, and the queue becomes a real five-column
`table` at 1280+. Below that it is labelled stacked records with the header cells
still in the DOM.

At 390px the hidden pane is `display: none` and a control inside it **could not
take focus** (focus stayed on `body`). Bottom navigation clears the last control
by 41px.

---

## 11. Accessibility

Verified in-browser: one `h1`; logical heading order (`H1 Staffing → H2 Staffing
reviews → H2 employee → H3 Request → H4 Comments → H3 Capacity → H2 Projects you
staff`); status nav labelled *"Filter reviews by status"* with `aria-current`;
native `th[scope=col]` and `th[scope=row]`; selection via `button[aria-pressed]`
and also written as "· Selected"; **zero** `div`/`tr`/`span` click targets; native
`<dialog>` with `aria-labelledby`; reject textarea with a real `<label for>` and
`aria-describedby`. The closed dialog is `display: none`, so its title is not in
the accessibility tree.

Capacity is text with units (`Allocated now 0 / 8 h`), never a gauge.

### Stated limitations

- **Keyboard default actions were not exercised.** This environment delivers key
  events to JS listeners but performs no browser defaults, so Enter / Space /
  Escape could not be pressed for real. What was verified is that every control is
  a native element the browser supplies those defaults for.
- **The browser snapshots do not hydrate.** They are server-rendered HTML with CSS
  applied, served from a second origin, so React never attaches. They are
  authoritative for layout, reflow and focusability — and *not* for interaction.
  Selection, pane switching and dialog behaviour are covered by `userEvent` tests
  in jsdom, where React genuinely runs.
- **Real 200% browser zoom was unavailable; narrow-width reflow was tested
  instead.**

---

## 12. Live verification

Local backend only (`localhost:8080/api`, from `apps/backend/target/classes`).
Production was never targeted.

Seeded: founder → self-granted PM + DM → department → appointment → 2 team roles
→ 4 employees as department members → project (Backend ×4, QA ×1) → 4 assignment
proposals. Then all four decision paths, each read back from
`GET /projects/{id}/team` or the proposal feed rather than from UI copy.

The live UI rendered the queue table with both request types, the corrected
heading, and the PM project table. Throwaway project deleted (204), session
revoked (200), all fixtures removed.

### Token-safe method

**Secret values were never printed to stdout.** Not redacted — never emitted:

- tokens were parsed into files/variables by python and passed to curl by
  reference; no `echo`, `cat`, `grep` or `sed` ever handled a token value
- the cookie jar was written with `-c` and used with `-b`, never read back; only
  cookie **names** were listed
- every request reported `%{http_code}` with the body to `/dev/null`, or had it
  parsed by python printing only explicitly named safe fields
- credentials lived in `chmod 600` files and were deleted afterwards

---

## 13. Deliberately not changed

- The backend — no contract defect was found; this slice is frontend-only.
- Team Finder (V2-05), Project Team and Project Overview (V2-04) — only the
  handoff links.
- Home, People, Skills, Organization, auth, public routes, dev console.
- The reject reason stays optional at 5000 characters; rejecting is an ordinary
  business decision, not a destructive one.
- No bulk review, no undo, no urgency, no analytics, no new dependency.

---

## 14. Production isolation

`main` was not modified. PR base is `v2`. `origin/main` remained
`3298c1cf079683033157500829a929caba08bd57` throughout.

No Git merge/update was made to `main`; external deployment behavior was not
independently observable.

Neither `v2` nor `main` has branch protection. No repository settings were changed.

---

## 15. Next slice

```
V2-07 — People, Skills & Organization
```
