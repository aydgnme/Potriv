# V2-09 — Full integration, responsive, accessibility & polish

Baseline: `v2` at `33ed06688a3cb9a79d92f81eb985f0b0849d86c4` (after PR #104 merged),
`1427 tests / 85 files`.

The closing slice of the V2 programme: integrate every reachable surface, measure
it, and fix what the measurements actually prove — not what the earlier docs
assumed.

---

## 1. The evidence contract, corrected

Every previous V2 document carried this sentence:

> the harness delivers key events to JS listeners but performs no browser default
> actions

**That was wrong, and V2-09 began by disproving it.** Measured against the real
hydrated development server, with a control experiment confirming the
instrumentation:

| Interaction | Measured behaviour |
|---|---|
| `Tab` / `Shift+Tab` | **Default action performed** — focus moved `email` → `password` → back |
| Typing | **Works** — text reached React's controlled state |
| `Enter` | Event delivered with the correct key name; **implicit form submission did not occur** |
| `Escape` | Event delivered; **native `<dialog>` did not close** |
| `Space` | Both `space` and `Space` arrive as an **empty key** — not mapped |

The control: a programmatic `form.requestSubmit()` fired the listener that
`Enter` had not, proving the listener was sound and the `Enter` result real.

A second correction came with it. The real page **is** hydrated
(`__reactFiber` keys present), so "snapshots do not hydrate" was a property of
the snapshot technique — cross-origin, no chunks — and never of the app or the
harness.

**What this changed:** real-browser tab-order verification was available for the
whole programme and went unused. V2-09 uses it.

### Evidence channels used here

The first version of this table and the limitations section disagreed about what
authenticated snapshots prove — one said "geometry, overflow, text spacing,
target size", the other said "geometry and tab order". Both were partly right and
the disagreement was the defect. This is the reconciled statement:

| Channel | Proves | Does not prove |
|---|---|---|
| Real hydrated browser | Tab/Shift+Tab order, focus ring, focus-not-obscured, typing, console health, contrast, form validation semantics, live-region announcement | `Enter`/`Space`/`Escape` default actions — this harness does not perform them |
| Authenticated snapshots | Geometry, overflow, text spacing, target size, **and** Tab/Shift+Tab order, focus ring and focus-not-obscured | Anything requiring hydration: activation, submit, state change |
| `userEvent` integration tests | Enter/Space activation, implicit submit, dialog open/cancel from the keyboard | Browser defaults jsdom does not implement — Escape-to-close, focus return |
| Source/contract inspection | Stylesheet contracts, reduced-motion coverage, announcement roles | Anything about rendered geometry |

**Why snapshot tab order is legitimate.** A snapshot is the server's HTML with
scripts stripped, served from the dev server's own origin so its stylesheets
still apply. It does not hydrate. Sequential focus navigation, the focus ring and
`elementFromPoint` obscuration are all decided by the browser from the DOM and
CSS alone, with no script involved, so they are as real in a snapshot as in the
live app. Anything that needs an event handler is not, and is not claimed.

`Enter`, `Space` and `Escape` **activation** is never claimed from the browser
harness. No default-action claim rests on those paths.

---

## 2. Coverage inventory

Built from the route tree, not from memory.

```
31 page routes   9 BFF/API routes   2 App Router boundaries
```

35 captured surfaces: 28 protected (including scope and status variants), 6
public, plus the global not-found.

### 2.1 The actors, and why one was not enough

The first version of this document measured everything with a single account
holding `ORGANIZATION_ADMIN + PROJECT_MANAGER + DEPARTMENT_MANAGER` and a real
department appointment — "the combination that makes every route reachable".

That is exactly the problem with it. An actor chosen for reaching everything
cannot show where authority stops, so the matrix it produces says nothing about
authorization. Six actors were built for this pass, all through the real invite
and role-grant flows against a throwaway local fixture organization. No backend
fixture was inserted and no authorization rule was touched.

| Actor | Roles | Appointment |
|---|---|---|
| `anonymous` | — | — |
| `employee` | `EMPLOYEE` | — |
| `projmgr` | `EMPLOYEE + PROJECT_MANAGER` | — |
| `dm-unappointed` | `EMPLOYEE + DEPARTMENT_MANAGER` | **none** |
| `dm-appointed` | `EMPLOYEE + DEPARTMENT_MANAGER` | one department |
| `founder` | `EMPLOYEE + ORGANIZATION_ADMIN` | — |
| `all-roles` | all four | one department |

`founder` is what workspace registration actually grants — `EMPLOYEE +
ORGANIZATION_ADMIN`, not project or department authority. That is worth stating
because it is the account every real organization starts with.

### 2.2 Protected route × actor

Measured by fetching each rendered route with each actor's real session and
classifying the rendered markup — scripts stripped first, because Next serialises
the whole route tree including the global not-found into every page's RSC
payload, which made an earlier version of this measurement report "not found" for
all 130 cells.

`200` = the surface rendered. `denied` = the capability is refused.
`not-found` = the resource is not visible to this actor, worded identically to a
resource that does not exist. `→ /login` = redirected, unauthenticated.

| Route | employee | projmgr | dm-unappt | dm-appt | founder | all-roles | anon |
|---|---|---|---|---|---|---|---|
| `/home` | 200 | 200 | 200 | 200 | 200 | 200 | → /login |
| `/account` | 200 | 200 | 200 | 200 | 200 | 200 | → /login |
| `/people` | denied | denied | 200 | 200 | 200 | 200 | → /login |
| `/people/[userId]` | denied | denied | — | denied | 200 | 200 | → /login |
| `/projects` | 200 | 200 | 200 | 200 | 200 | 200 | → /login |
| `/projects/new` | denied | 200 | — | denied | denied | 200 | → /login |
| `/projects/[id]` | not-found | 200 | — | not-found | not-found | **not-found** | → /login |
| `/projects/[id]/edit` | denied | 200 | — | denied | denied | **not-found** | → /login |
| `/projects/[id]/team` | not-found | 200 | — | not-found | not-found | **not-found** | → /login |
| `/projects/[id]/team-finder` | not-found | 200 | — | not-found | not-found | **not-found** | → /login |
| `/skills` | 200 | 200 | 200 | 200 | 200 | 200 | → /login |
| `/skills/my` | 200 | 200 | 200 | 200 | 200 | 200 | → /login |
| `/skills/new` | denied | denied | **200** | 200 | denied | 200 | → /login |
| `/skills/categories` | denied | denied | **200** | 200 | denied | 200 | → /login |
| `/skills/[id]` | 200 | 200 | **denied** | 200 | 200 | 200 | → /login |
| `/skills/[id]/edit` | denied | denied | **200** | 200 | denied | 200 | → /login |
| `/organization` | denied | denied | denied | denied | 200 | 200 | → /login |
| `/organization/departments` | denied | denied | denied | denied | 200 | 200 | → /login |
| `/organization/departments/[id]` | denied | denied | — | denied | 200 | 200 | → /login |
| `/organization/invite` | denied | denied | — | denied | 200 | 200 | → /login |
| `/organization/team-roles` | denied | denied | denied | denied | 200 | 200 | → /login |
| `/organization/team-roles/new` | denied | denied | — | denied | 200 | 200 | → /login |
| `/organization/team-roles/[id]` | denied | denied | — | denied | 200 | 200 | → /login |
| `/staffing` | denied | 200 | 200 | 200 | denied | 200 | → /login |
| `/projects/{absent uuid}` | not-found | not-found | — | not-found | not-found | not-found | → /login |
| `/skills/{absent uuid}` | not-found | not-found | — | not-found | not-found | not-found | → /login |

`—` marks a cell not measured for `dm-unappointed`; that actor was swept over the
fourteen routes where appointment could plausibly matter, not all twenty-six.

**Four things this matrix shows that a single actor could not.**

*`ORGANIZATION_ADMIN` is not a superuser.* The founder is **denied**
`/projects/new`, `/projects/[id]/edit`, every skill-administration route, and
`/staffing`. Administering an organization is not the same authority as managing
a project or a department.

*The `DEPARTMENT_MANAGER` role is not the appointment.* Compare the two DM
columns. Unappointed, the actor may still administer the shared catalogue —
`/skills/new`, `/skills/categories`, `/skills/[id]/edit` all render — but
`/skills/[id]` is **denied**, because that surface carries the
department-link panel. The backend says it in as many words: linking a skill to a
department returns `403 You are not assigned as a department manager`, while
creating a category from the same session returns `201`. The role grants the
catalogue; the appointment grants the department.

*`PROJECT_MANAGER` is not manager of every project.* The `all-roles` actor holds
all four roles and an appointment, and still gets **not-found** on a project
managed by someone else. Ownership is not a role, which is why the single-actor
matrix could never have surfaced this.

*404 and 403 collapse, deliberately.* A project that exists but is not yours and
a project id that does not exist produce the same `not-found` wording. The
distinction that *is* drawn is between a refused **capability** (`denied`, for
`/projects/new`) and an invisible **resource** (`not-found`) — the first leaks
nothing about data, the second leaks nothing about existence.

### 2.3 Public routes and boundaries

| Route | Anonymous | Signed in |
|---|---|---|
| `/` | 200 — `Build the right project team…` | 200, unchanged |
| `/login` | 200 — `Sign in` | 200 → `Home` |
| `/create-workspace` | 200 — `Create your workspace` | 200 → `Home` |
| `/forgot-password` | 200 — `Reset your password` | not applicable |
| `/reset-password` (no token) | 200 — `This link is no longer valid` | not applicable |
| `/invite` (no token) | 200 — `This invite is no longer valid` | not applicable |
| `/console` | 200 — developer tool, see §9 | 200 |
| unknown path | **404** — `Page not found` | 404 |

A missing or dead token on `/reset-password` and `/invite` produces a stated,
designed page rather than a crash or a blank form — the "not configured" state
for those two surfaces.

### 2.4 States exercised, and where

Not every state applies to every route, and the ones that do not are marked with
the reason rather than left blank.

| State | Where it is exercised | Evidence |
|---|---|---|
| unauthenticated | every protected route | §2.2, `anon` column — 26/26 → `/login` |
| unauthorized (capability) | `/organization/*`, `/skills/new`, `/projects/new`, `/staffing` | §2.2 `denied` cells |
| not found / not visible | `/projects/[id]`, `/skills/[id]`, absent uuids | §2.2 `not-found` cells |
| not appointed | `/skills/[id]` as `dm-unappointed` | §2.2; backend `403 You are not assigned as a department manager` |
| not configured | `/reset-password`, `/invite` without a token | §2.3 |
| validation error | `/login` | §5.4 — `aria-invalid` + `aria-describedby` measured |
| generic/transient failure | `/login` with unknown credentials | §5.4 — `role="alert"`, `Invalid email or password.` |
| empty | skills catalogue, staffing queue | `SkillCatalogue`, `ReviewQueue` tests |
| success | staffing decisions, skill administration | `ReviewQueue.test.tsx`, `SkillAdminScreens.test.tsx` |
| conflict | staffing accept after capacity change | `ReviewQueue.test.tsx` — "no longer has enough available capacity" |
| loading | any Server Action in flight | `Button` `loading` prop; `keyboardContracts.test.tsx` proves it blocks keyboard re-activation |

**Deliberately not claimed.** `loading` and `empty` were not exercised route by
route in the browser: a warm local server renders too fast to hold a pending
state, and emptying a populated fixture would have meant destroying the data the
rest of the matrix depends on. Both are covered causally by component tests
instead, cited above, and that is a weaker channel than the browser measurements
around them.

## 3. Responsive matrix

35 surfaces × 7 widths = **245 measured checks**.

```
        320  375  390  768  1024  1280  1440
before   —    —    —    —     —     —     —    10 failures across 4 defects
after   ok   ok   ok   ok    ok    ok    ok    0 failures
```

Overflow was measured as `documentElement.scrollWidth > clientWidth`, with the
offending elements enumerated — never from screenshots.

### WCAG 1.4.12 text spacing

Applied at 320px across 11 representative surfaces: line height `1.5`, paragraph
spacing `2em`, letter spacing `0.12em`, word spacing `0.16em`.

**Zero overflow, zero content loss.** The clipped-element detector initially
flagged 10 nodes on Home; all 10 proved to be intentional visually-hidden
elements (`clip-path: inset(50%)`), and real clipping was zero.

### Reflow and zoom

WCAG 1.4.10 reflow is covered by the 320px column of the matrix. **Real browser
zoom was not exercised**; the 320 CSS-pixel matrix is not relabelled as zoom.

---

## 4. Defects found and fixed

### 1 — An unused lint directive, invisible because lint exits 0 on warnings

`logoutAllRoute.test.ts` carried an `eslint-disable-next-line
@typescript-eslint/no-explicit-any` that suppressed nothing. `npm run lint`
exited 0 while reporting `1 warning`, so it survived V2-08 review.

**Fix:** removed the directive and narrowed the cast from `any` to
`NextRequest`.
**Regression:** the lint gate itself, now at 0 errors / 0 warnings.

**And a claim withdrawn.** An earlier version of this section said the change
meant "the stub's shape is checked at the boundary". It is not.
`request(accessToken) as unknown as NextRequest` is a double assertion, and it
bypasses structural checking exactly as completely as the `any` it replaced —
the compiler verifies nothing about that object. The narrower spelling is still
worth having, because it names the type the test is pretending to supply, but the
test file now says plainly that nothing there is compiler-verified.

### 2 — Seven-column table overflowed at exactly 768px

`.table th { white-space: nowrap }` made the header row the table's min-content
floor. Project Team has seven columns, and between 768px and the 767px point
where these tables fold into stacked records the row could not fit: **772px in a
768px viewport**.

**Fix:** `white-space: normal` on the header rule, letting "Review department"
wrap onto two lines.
**Regression:** `tableHeaderWrap.test.ts` asserts the stylesheet contract — a
source-level test, because jsdom cannot measure layout and the responsive matrix
is not unit-runnable. Restoring `nowrap` fails it.

**And a regression that did not regress.** As first written, that test matched
`@media (max-width: 767px)` and `content: attr(data-label)` independently,
anywhere in the file. `Projects.module.css` has *two* blocks at 767px, and only
one carries the table rules — so the stacking contract could have moved to
another breakpoint, or broken outright, with the test still green. The
assertions are now scoped to the block that actually contains the `.table`
rules, found by brace matching rather than by hoping the first match is the right
one. Proven: retargeting that block to `480px` fails four assertions where it
previously failed none.

The same weakness existed in the Staffing long-text regression V2-09 relies on
for its long-content acceptance. `ReviewQueue.test.tsx` proved only that the
element receives `styles.longText`; deleting `overflow-wrap: anywhere` from
`Staffing.module.css` left it green. A stylesheet contract now pins the
declaration itself. Proven by the same method: with the declaration deleted the
old assertion still passes and the new one fails.

### 3, 4, 5 — Organization free text inside button labels

One root cause in three places. A `<button>` cannot wrap its label, and
department, category and team-role names are organization-authored and long.

They are **bounded, not unbounded** — an earlier draft of this document said
otherwise and was wrong. The real contracts are `@Size(max = 120)` on a category
name, `@Size(max = 120)` on a team-role name and `@Size(max = 160)` on a
department name. The bound is not the point: a perfectly valid name *at* that
bound still does not fit a mobile control, which is what the measurements show.

| Surface | Label | Measured |
|---|---|---|
| Skill detail | `Link to {department}` | 445px wide |
| Team-role detail | `Retire {teamRole}` | 484px wide |
| Category admin | `Retire {category}` | 367px in a 248px row → document 422px |

**Fix:** the pattern already established in V2-07 and V2-08 — a short visible
label, with the full context in `aria-label`.

**And a regression that fix introduced.** The first version of it wrote
accessible names like `Retire Programming Languages…` beside a visible label
reading `Retire category`. The visible string was therefore *not contained in*
the accessible name, which is a WCAG 2.5.3 Label in Name failure and a breach of
V2-09's own acceptance requirement. Speech-input users say what they see; the
name they say has to be part of the name the control answers to.

The corrected contract puts the visible label first and the distinguishing value
after it:

```
Retire category: {name}      Link department: {name}
Restore category: {name}     Unlink department: {name}
Retire team role: {name}     Restore team role: {name}
```

The same violation existed in the V2-08 session table (`Revoke session from
{time}` under a visible `Revoke`) and is fixed with it, as
`Revoke session last seen {time}`.

**Regressions:** tests across `SkillAdminScreens` and `TeamRoleScreens` now
assert *both* halves through a shared `assertLabelInName` helper — the visible
text is the short label, the long value is absent from it, and the accessible
name contains the visible label **and** the value. Putting the name back into the
visible label fails them; so does dropping the visible label out of the
accessible name, which is the failure the review caught.

**Measured after the fix**, on an authenticated snapshot at a 320px viewport with
a department name at its full 160-character bound: the `Unlink department` button
is **141px** wide (it was 445px), and `documentElement.scrollWidth` is 320 against
a `clientWidth` of 320 — zero overflow, zero offending elements.

### A wrong turn, recorded

The category-admin overflow was first diagnosed as a flexbox `min-width: auto`
floor, and a `min-width: 0` fix was written. Injecting `min-width: 0 !important`
on every element changed nothing, which disproved it; a second speculative fix
using `max-width: 100%` was also wrong. The actual culprit — the same button as
defects 3 and 5 — was found by looking for the widest **leaf** rather than the
first reported offender, which was merely the container the button had stretched.
Both speculative stylesheet edits were reverted; `Skills.module.css` is
byte-identical to baseline.

---

## 5. Accessibility results

### 5.1 Keyboard, focus order and focus visibility

Measured by pressing real `Tab` and `Shift+Tab` keys and recording `focusin`,
never by reading the DOM and assuming the browser would agree.

**`/login` — real hydrated page.**

```
1 POTRIV      2 Email      3 Password      4 Sign in
5 Forgot password?         6 Create your workspace
```

`Shift+Tab` returns through exactly the reverse sequence
(y 679 → 611 → 553 → 503 → 425 → 287) and then wraps out of the document. No
trap. Every stop carried `outline: 2px solid rgb(27,95,191)`.

A seventh stop, `nextjs-portal`, is the Next.js development overlay. It is not
product markup and does not exist in a production build.

**Protected surfaces — authenticated snapshots.** Sequential focus navigation,
the focus ring and obscuration are browser behaviours decided from DOM and CSS
alone, so they are measurable on a snapshot; see the channel table in §1.

| Surface | Width | Distinct stops | Cycles cleanly | Stops without a ring | Obscured |
|---|---|---|---|---|---|
| Skill categories | 901 | 17 | yes | 0 | 0 |
| Skill categories | 375 | 15 | yes | 0 | 0 |
| Account | 375×640 (scrolls, 1105px tall) | 8 | yes | 0 | 0 |

Every stop on every surface reported the same indicator,
`2px rgb(27, 95, 191)` — the set of distinct focus-ring values measured across a
full cycle had exactly one member.

The skill-categories order at 901px is the shared-layout order every protected
route inherits:

```
Skip to content -> Home -> Projects -> Staffing -> People -> Skills
-> Account -> Sign out -> [main content]
```

and at 375px the same page exposes the bottom bar instead:

```
Skip to content -> Home -> Projects -> Staffing -> People
-> "More, current section Skills" -> [main content]
```

Note the sidebar lists five domains, not six: these snapshots were taken as a
department manager, who is not an organization administrator. Navigation is
composed from the role set, so this is the correct list for that actor.

### 5.2 Focus not obscured (2.4.11)

The meaningful test is at phone width, where `MobileNavigation` is
`position: fixed; z-index: 20` across the bottom 57px of the viewport.

On Account at 375×640 — a page that genuinely scrolls, 1105px against a 640px
viewport — every stop was scrolled into view and then tested with
`document.elementFromPoint` at its centre:

```
first   Skip to content        y12-51     not obscured
middle  Skills (bottom bar)    y584-640   not obscured (it is the bar)
last    Sign out everywhere    y502-536   not obscured, fully in view
```

No focused control anywhere in the cycle was covered by another element, and no
non-bar stop was left partly outside the viewport.

### 5.3 Names, roles, structure

Measured per surface rather than asserted globally.

| Check | Result |
|---|---|
| `<html lang>` | `en` on every surface measured |
| Page title | Distinct and specific — `Sign in · Potriv`, `Skill · Potriv`, `Account · Potriv`, `Skill categories · Potriv` |
| Single `h1` | Yes on every surface; `/login` `h1` is `Sign in`, skill detail is the skill name |
| Landmarks | `main`, `header`, `nav["Product"]`, `nav["Breadcrumb"]`, `nav["Skills views"]` — every `nav` carries an accessible name |
| Unlabelled visible controls | **0** on the surfaces measured |

One structural wrinkle, recorded rather than smoothed over: an `h2` reading
`More` precedes the `h1` in source order on protected surfaces. It belongs to the
mobile account sheet, which is `display: none` above 767px and therefore absent
from the accessibility tree at the widths where the `h1` leads. At phone widths
the sheet is a closed `<dialog>`, which is also not exposed. It is never both
present and out of order.

`aria-hidden="true"` is on every decorative icon, and the `$ACTION_*` inputs a
Server Action emits are `type="hidden"`, so neither reaches the tree.

### 5.4 Forms, errors and announcements

Measured on `/login` against the real hydrated page.

| Check | Result |
|---|---|
| Label association | Both fields have a real `<label for>`; `autocomplete` is `email` and `current-password` |
| Error identification (3.3.1) | On failure each field gains `aria-invalid="true"` |
| Error description (3.3.3) | Each field gains `aria-describedby` resolving to a **present** element carrying a specific message — "Enter a valid email address.", "Password must be 8–72 characters." |
| Not colour alone (1.4.1) | The error is a text message, not just a red border |
| Error text contrast | **7.43:1** |
| Invalid border | `rgb(163,36,28)` — **7.43:1** against the field's surroundings, above the 3:1 non-text minimum |
| Recovery | Correcting the value and resubmitting clears the state; the failed submit does not lose what was typed |

**Announcement semantics.** The shared `Alert` decides this in one place —
`Alert.tsx:32` renders `role="alert"` for the `danger` tone and `role="status"`
otherwise — so success, denied, conflict and failure messages all announce, and
an icon accompanies the colour so the tone survives for anyone who cannot see it.
Proven live: a failed sign-in produced a real `role="alert"` node reading
`Invalid email or password.`, a message that also collapses the
"no such account" and "wrong password" cases into one sentence.

**One gap, and it is a real one.** *Field-level* validation errors announce
nothing. They are correctly associated through `aria-invalid` and
`aria-describedby`, but there is no live region for them and focus does not move
to the first invalid field — measured: after a failed submit the live-region set
was empty and focus remained on the submit button. Someone using a screen reader
submits the form and is told nothing happened. Against WCAG 4.1.3 Status
Messages this is a failure for the field-level path, and it is carried into §9 as
an open item rather than written off.

### 5.5 Contrast, motion, targets

| Check | Result |
|---|---|
| Focus indicator | `2px solid rgb(27,95,191)`, 2px offset |
| Focus ring contrast (1.4.11) | **5.75:1** — passes the 3:1 non-text minimum |
| Text contrast (1.4.3) | **0 failures** across every distinct colour/size/weight combination on the surfaces measured; minimum **5.75:1**, and **6.11:1** on `/login` |
| Non-text contrast (1.4.11) | **0 failures**; minimum **3.41:1**, a control border |
| `prefers-reduced-motion` | Global rule neutralises all three transition declarations in the codebase |
| Target size (2.5.8) | Bottom nav 78×56. Sub-24px targets are inline text links; all meet the spacing exception — nearest-centre distances measured at 27px, 57px and 76px on skill detail, and 80–237px on the earlier sweep |

The target-size result is worth stating plainly: those links *conform* through
the documented exception, so they were measured and left alone rather than
"fixed". The tightest pair measured, `Account` to `Sign out` at 27px between
centres, clears the 24px threshold but not by much.

Contrast was computed from resolved `getComputedStyle` colours, walking up for
the first opaque background, one entry per distinct colour/size/weight pair —
not sampled from screenshots, and not restricted to headings and body text.

### 5.6 Console health

Real hydrated `/` and `/login`: no errors, no hydration warnings, no React key
warnings. Only the React DevTools notice and the HMR connection log.

## 6. What was verified how

```
real hydrated browser        Tab/Shift+Tab order, focus ring, typing, console,
                             contrast, form validation semantics, live regions
authenticated snapshot       geometry, overflow, text spacing, target size,
                             Tab/Shift+Tab order, focus ring, focus-not-obscured
userEvent test               Enter/Space activation, implicit submit,
                             dialog open and cancel from the keyboard
real session over HTTP       route x actor authorization, rendered state
source inspection            reduced motion, stylesheet contracts,
                             announcement roles
not proven in this env       real browser zoom; Enter/Space/Escape default
                             actions in the browser harness; Escape-to-close and
                             focus return on a native dialog under jsdom
```

The snapshot line is the one the review flagged as self-contradictory. §1 now
states the reasoning: focus order, the focus ring and obscuration are decided by
the browser from DOM and CSS with no script involved, so they survive a
non-hydrating snapshot; activation and state change do not, and are not claimed
from that channel.

### Keyboard tests actually present

`src/shared/ui/keyboardContracts.test.tsx` and the keyboard block in
`src/modules/account/components/SignOutEverywhere.test.tsx`, all driven by
`user.keyboard(...)`:

| Test | Proves |
|---|---|
| native button, `{Enter}` / `[Space]` | what this environment performs at all, so the rest rests on a measurement |
| shared `Button`, `{Enter}` / `[Space]` | the product's own control activates from the keyboard |
| `Button` while `loading` | a pending mutation cannot be re-fired by holding Enter or Space |
| `Tab` past a disabled `Button` | a disabled control is not a tab stop |
| `{Enter}` in a text field | implicit form submission |
| `{Enter}` on a focused submit button | submission from the control itself |
| `SignOutEverywhere` — open on `{Enter}` / `[Space]` | a **real product dialog** opens from the keyboard |
| — cancel on `{Enter}` | it closes from the keyboard, and cancelling issues no mutation |
| — confirm on `{Enter}` | exactly one mutation, from the keyboard |
| — `{Escape}` | recorded as **not performed here**, with the reason |

No `click`, no `fireEvent.click`, no direct callback invocation and no
`requestSubmit()` appears in any of them.

## 7. Gates

```
audit --audit-level=high   0 vulnerabilities
typecheck                  pass
lint                       pass - 0 errors, 0 warnings
tests                      1453 passed / 87 files
production build           pass
git diff --check           pass
```

`1427 / 85` at the V2-09 baseline, `1436 / 86` at the reviewed head, `1453 / 87`
now: seventeen tests and one file added by this review pass. No test was removed
or weakened; two were made strictly harder to pass, and both were proven so by
mutation.

## 8. Scope

Frontend product files and their tests, plus this document. No backend, API E2E,
workflow, dependency, lockfile or authentication change.

---

## 9. Limitations and follow-ups

Stated as limitations because they are, not softened into passes.

**Open accessibility item — field-level errors do not announce.** Measured on
`/login`: after a failed submit the fields carry `aria-invalid` and a resolving
`aria-describedby`, but there is no live region for them and focus stays on the
submit button. A screen-reader user gets no notification that the submission
failed. Form-level messages *do* announce, through `Alert`'s
`role="alert"`/`role="status"`, so this is specifically the field-level path.
Against WCAG 4.1.3 this is a failure, and it is the reason for this document's
verdict.

**Real browser zoom was not exercised.** The 320 CSS-pixel matrix covers WCAG
1.4.10 reflow; it is not presented as zoom testing.

**`Enter`, `Space` and `Escape` default actions** cannot be produced by the
browser harness — re-confirmed during this pass, with `Enter` in a focused text
field on the live hydrated `/login` producing no submit event. Activation and
implicit submit are proven by `userEvent` instead, never by the browser.

**Escape-to-close and focus return on a native `<dialog>`** are browser defaults
jsdom does not implement, so they remain unproven in either channel. Measured
rather than assumed: after `showModal` under jsdom, focus never enters the dialog
at all, so there is no return to observe. No Escape handler was added to
production code to make a test pass, and no shim is cited as evidence.

**`loading` and `empty` were not exercised route by route in the browser** — see
§2.4. They are covered by component tests, which is a weaker channel than the
browser measurements around them.

**`dm-unappointed` was swept over fourteen routes, not twenty-six.** The routes
chosen are the ones where an appointment could plausibly change the answer.

**The `/console` developer tool ships in production builds.** Not introduced or
touched by V2-09 — it dates from the first frontend commit and `proxy.ts`
deliberately excludes it, describing it as "a developer tool with its own token".
It is out of this PR's scope and is left alone, but it is worth recording: the
production build emits `console.html`, and an anonymous request to `/console`
returns 200. It carries no credentials of its own and the backend still enforces
authorization, so nothing leaks without a valid token; it is unnecessary attack
surface rather than a vulnerability. Tracked separately.

**`secureCookiesEnabled()` keys off `NODE_ENV`, not the request origin**, though
its comment says otherwise. Correct for a real HTTPS deployment. It surfaced here
because a local production build cannot be measured over plain HTTP — the
`Secure` cookies are, correctly, never sent. Not changed: authentication is out
of scope for this PR.

**`/people/[userId]` compiles slowly in development** — 73s to 10 minutes per
first request under Turbopack. It is a dev-server compilation cost, not the
application: the same route answers in **0.0s** against a production build.

**Request-ID propagation** remains the documented observability gap from V2-08
§65; nothing in V2-09 depended on it.

### Verdict

Every responsive defect is fixed and measured, the WCAG 2.5.3 regression the
review caught is fixed and guarded by tests that fail in both directions, the
keyboard claims are now backed by real keyboard tests, the route/actor/state
inventory is complete across six actors, and the two weak regressions were
strengthened and proven by mutation.

One acceptance item does not pass: field-level validation errors are not
announced (WCAG 4.1.3), and three others — browser zoom, native-dialog Escape,
and focus return — remain unproven rather than proven. The rules of this slice
are that an unproven item stays unproven.

```
V2-09 NOT COMPLETE - INTEGRATION, RESPONSIVE, ACCESSIBILITY, OR POLISH GAPS REMAIN
```

## 10. Production isolation

`main` was not modified; `origin/main` remains
`3298c1cf079683033157500829a929caba08bd57`. PR base is `v2`.

No Git merge/update was made to `main`; external deployment behavior was not
independently observable.
