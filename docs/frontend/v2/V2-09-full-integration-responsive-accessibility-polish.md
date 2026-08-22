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

| Channel | Used for |
|---|---|
| Real hydrated browser | Tab/Shift+Tab order, focus ring, typing, console health, contrast |
| Authenticated snapshots | Protected-surface geometry, overflow, text-spacing, target size |
| `userEvent` integration tests | Enter/Space activation, submit, Escape/cancel, focus return |
| Source/contract inspection | Stylesheet contracts, reduced-motion coverage |

`Enter`, `Space` and `Escape` **activation** is never claimed from the browser
harness. No default-action claim rests on those paths.

---

## 2. Coverage inventory

Built from the route tree, not from memory.

```
31 page routes   9 BFF/API routes   2 App Router boundaries
```

35 captured surfaces: 28 protected (including scope and status variants), 6
public, plus the global not-found. Actor: one account holding
`ORGANIZATION_ADMIN + PROJECT_MANAGER + DEPARTMENT_MANAGER` with a real
department appointment — the combination that makes every route reachable.

Fixture used deliberately hostile content: a 63-character project name, a
57-character department name, an unbroken 55-character technology token, a long
URL inside a description, and long comments on staffing decisions.

---

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
`NextRequest`, so the stub's shape is checked at the boundary.
**Regression:** the lint gate itself, now at 0 errors / 0 warnings.

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

### 3, 4, 5 — Organization free text inside button labels

One root cause in three places. A `<button>` cannot wrap its label, and
department, category and team-role names are organization-authored with no
length bound:

| Surface | Label | Measured |
|---|---|---|
| Skill detail | `Link to {department}` | 445px wide |
| Team-role detail | `Retire {teamRole}` | 484px wide |
| Category admin | `Retire {category}` | 367px in a 248px row → document 422px |

**Fix:** the pattern already established in V2-07 and V2-08 — a short visible
label, with the full context in `aria-label`. The accessible name is unchanged,
which is why all 1427 existing tests still passed after the change.

**Regressions:** seven tests across `SkillAdminScreens` and `TeamRoleScreens`
assert that the visible text is the short label *and* the accessible name carries
the full value. Putting the name back into the visible label fails them.

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

### Keyboard and focus — real browser

Real `Tab` presses on the hydrated shell, recorded via `focusin`:

```
1. Skip to content   2-7. Home / Projects / Staffing / People / Skills / Organization
8. Account           9. Sign out
10+. main content
```

Logical, and account/sign-out reachable. One backward vertical jump appears
between `Sign out` (y≈1459, end of sidebar) and `Review` (y≈160, start of main) —
the expected two-column sidebar→main transition, not a defect.

`Enter`/`Space`/`Escape` activation, implicit submit and focus return remain
covered by `userEvent` tests, per the harness contract above.

### Focus visibility, contrast, motion, targets

| Check | Result |
|---|---|
| Focus indicator | `2px solid rgb(27,95,191)`, 2px offset |
| Focus ring contrast (1.4.11) | **5.75:1** — passes the 3:1 non-text minimum |
| Heading text | **16.7:1** |
| Body / nav / muted text | **5.75:1** — passes AA |
| `prefers-reduced-motion` | Global rule neutralises all three transition declarations in the codebase |
| Target size (2.5.8) | Bottom nav 78×56. Twelve 20px-tall section links are undersized but **all meet the spacing exception**, nearest-centre distances 80–237px |

The target-size result is worth stating plainly: those links *conform* through
the documented exception, so they were measured and left alone rather than
"fixed".

### Console health

Real hydrated `/` and `/login`: no errors, no hydration warnings, no React key
warnings. Only the React DevTools notice and the HMR connection log.

---

## 6. What was verified how

```
verified in real hydrated browser      Tab order, focus ring, typing, console, contrast
verified in authenticated snapshot     geometry, overflow, text spacing, target size
verified by userEvent test             activation, submit, cancel, focus return
verified by source inspection          reduced motion, stylesheet contracts
not proven in this environment         real browser zoom; Enter/Space/Escape default actions
```

---

## 7. Gates

```
audit --audit-level=high   0 vulnerabilities
typecheck                  pass
lint                       pass — 0 errors, 0 warnings (was 1 warning at baseline)
tests                      1436 passed / 86 files
production build           pass
git diff --check           pass
```

`1427 / 85 → 1436 / 86`: nine added regressions, one added file. No test removed.

---

## 8. Scope

Frontend product files and their tests, plus this document. No backend, API E2E,
workflow, dependency, lockfile or authentication change.

---

## 9. Limitations and follow-ups

- **Real browser zoom was not exercised.** The 320 CSS-pixel matrix covers WCAG
  1.4.10 reflow; it is not presented as zoom testing.
- **`Enter`, `Space` and `Escape` default actions** cannot be produced by this
  harness. Activation is proven by `userEvent`, never by the browser.
- **Protected surfaces cannot be browser-authenticated**, because that would mean
  entering a password into a form field. Their geometry and tab order are proven
  through authenticated snapshots, which are valid for layout and focus because
  both are browser behaviours independent of hydration.
- **Request-ID propagation** remains the documented observability gap from V2-08
  §65; nothing in V2-09 depended on it.

---

## 10. Production isolation

`main` was not modified; `origin/main` remains
`3298c1cf079683033157500829a929caba08bd57`. PR base is `v2`.

No Git merge/update was made to `main`; external deployment behavior was not
independently observable.
