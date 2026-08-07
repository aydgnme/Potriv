# 08 — Responsive strategy and accessibility baseline

Combines Phase 14 (responsive) and Phase 15 (accessibility). They belong
together because several decisions serve both — a status badge that carries a
word rather than only a colour is simultaneously an accessibility requirement
and what makes a dense table survive a narrow viewport.

---

# Responsive strategy

## Breakpoints

| Name | Width | Shell |
| --- | --- | --- |
| Compact | < 768px | Bottom tab bar, single column, detail as full screen |
| Medium | 768–1119px | Collapsible sidebar (icon rail by default), single content column |
| Wide | ≥ 1120px | Sidebar expanded, split views available |

Team Finder's split view (TF-A) needs Wide. Below it, TF-A-M applies.

## Workflow classification

### Full mobile support

These must be comfortable on a phone, because they are genuinely done there.

| Workflow | Why |
| --- | --- |
| **Review a proposal — accept or reject** | The highest-value mobile task in the product. A department manager unblocking a project manager from a phone is a realistic Tuesday, and every proposal has another person waiting on it |
| Sign in, reset password, register via invite | Entry points; the invite link is usually opened on whatever device received it |
| View my projects and history | Read-only, small payload |
| View my skills; change a level or experience | Two selects on an existing row |
| Read a project overview and its team | Read-only |
| Account and sessions, sign out | Security actions must never require a desktop |

### Mobile-compatible but desktop-preferred

Workable on a phone; faster with a keyboard and more width.

| Workflow | Mobile shape |
| --- | --- |
| Browse the skill catalogue and add a skill | Search plus a single-column list; filters in a sheet |
| Add or remove a department member | The two panes stack; add is a row action |
| Create or rename a department, create a team role | Full-screen form; few fields |
| Change a person's roles | Full-screen checkbox list |
| Copy or rotate the invite link | The URL wraps; copy is full width |
| Create a project | Long form, but linear; the repeatable groups stack |

### Desktop-intensive

Complex enough that the mobile form is a **different presentation of the same
data**, never a shrunken copy.

| Workflow | Desktop | Mobile transformation |
| --- | --- | --- |
| **Team Finder** | Split view: ranked list + evidence panel | Ranked list of cards keeping all five comparison attributes → tap → full-screen detail. Criteria collapse into a sheet |
| **Project overview** | Two columns: details + team roles and members | Stacked sections, requirement rows keeping the "n of m" shape |
| **Review queue** | Table + right drawer | List of cards, each with accept/reject → tap → full-screen detail |
| **People** | Table with role column | Stacked rows, roles as chips, one action per row |
| **Project team** | Three tables | Three grouped lists with a detail sheet |

## Mobile transformations: the rules

1. **Stacked rows, not cards.** A stacked row keeps the label–value pairs and the
   single primary action. Converting to cards invites decorative padding and
   discards the column vocabulary the user learned on desktop.
2. **Priority columns.** Each table declares an ordered column list. Compact keeps
   the identity column plus the one or two that drive the decision; the rest move
   into the detail view. Nothing is silently dropped — the detail view holds
   everything.
3. **Detail sheets over horizontal scroll.** A horizontally scrolling data table
   on a phone is never acceptable. The exceptions are the object tab strip and
   deliberately scrollable code-like content, of which this product has none.
4. **Card conversion only where cards already exist on desktop.** By that rule,
   Team Finder candidates are the only cards in the product, on any viewport.
5. **One primary action per row on Compact.** Everything else moves to overflow.

Explicitly rejected: shrinking a desktop table's font to fit; hiding columns with
no way to reach the data; and a separate mobile route tree.

---

# Accessibility baseline

**Target: WCAG 2.2 AA.** Not aspirational — the checks below are testable and
belong in the implementation task's definition of done.

## Structure and semantics

- One `<h1>` per page: the object's name, or the page name where there is no object
- Heading levels descend without skipping; sections use `<section>` with an
  accessible name
- Landmarks: `<nav>` for the sidebar, `<main>` for content, `<header>` for the
  top bar. A skip-to-content link is the first focusable element
- The sidebar is a `<nav>` with a list; the current item carries `aria-current="page"`
- The object tab row uses the tabs pattern with real `role="tab"` semantics and
  arrow-key movement

## Tables

- Real `<table>`, `<thead>`, `<th scope="col">`. Row headers use `scope="row"`
  where a row has a natural identity (a person's name, a project's name)
- Sortable columns are `<button>`s inside `<th>` carrying `aria-sort`
- The result count is announced: "Showing 12 of 240" lives in an `aria-live="polite"`
  region so filtering is perceivable without sight
- Stacked mobile rows keep their labels visibly — the label is not moved into a
  `::before` where it can be lost to assistive technology

## Forms

- Every control has a real `<label>`. Placeholders are never the label
- Errors are associated with `aria-describedby` and the field carries
  `aria-invalid`
- The form-level server message (§C-13) is in an `aria-live="assertive"` region,
  because it is the authority when it disagrees with the client
- Required fields are marked with the word "Required", not an asterisk alone
- Related radio and checkbox groups are wrapped in `<fieldset>` with a `<legend>` —
  the role editor (W-06) and team-role selection (TF-C) both need this

## Dialogs and drawers

- Focus moves into the dialog on open and returns to the trigger on close
- Focus is trapped while open; `Escape` closes — except when a form is dirty,
  where it prompts instead
- `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` pointing at the title
- The review drawer (PR-A) is a dialog on Compact and a complementary region on
  Wide, where the queue behind it stays interactive

## Colour and status

- **Status is never communicated by colour alone.** Every badge carries a word.
  This is the same rule the visual direction arrived at independently
  ([01-product-direction.md](01-product-direction.md) §V3), which is a good sign
- Contrast: 4.5:1 for body text, 3:1 for large text and for the boundaries of UI
  components. Badges are validated in both light and dark themes
- Skill level is a five-step ordinal scale rendered as a stepped indicator **plus
  its label**, never five hues
- The staffing-gap warning is an icon plus text ("2 of 3 ⚠"), never a red number

## Keyboard

- Every action is reachable and operable by keyboard, including row overflow menus
- Visible focus on every focusable element, meeting WCAG 2.2's focus-appearance
  requirement — never removed, never reduced to the browser default on a
  custom control
- Team Finder's split view: `↑`/`↓` move between candidates and update the detail
  panel; `Enter` opens the proposal form. This is the one screen where keyboard
  flow materially changes how fast the work goes
- The review queue supports moving to the next item after a decision without
  returning to the list

## Motion and announcements

- All non-essential animation is disabled under `prefers-reduced-motion`. Nothing
  in this product's flows depends on motion to be understood
- Toasts are `aria-live="polite"`; they never steal focus
- Loading regions carry `aria-busy`; skeletons are `aria-hidden` with a single
  polite "Loading {thing}" announcement rather than one per skeleton row

## WCAG 2.2 specifics worth naming

- **Target Size (Minimum)** — 24×24 CSS pixels for every control, which
  constrains the dense table row height on Compact
- **Dragging Movements** — no drag-only interaction exists in this design, and
  none may be introduced
- **Consistent Help** — the help affordance keeps the same position on every page
- **Redundant Entry** — the login screen is prefilled with the email after
  registration; the intended route is preserved across a session expiry so the
  user does not re-navigate
- **Focus Not Obscured** — the sticky table header and the bottom tab bar must not
  cover a focused row; scroll padding accounts for both

## Out of scope for this pack

Screen-reader test scripts, an audit tool choice, and a component-level
accessibility checklist belong to the implementation task. What is fixed here is
the **target**, the **rules**, and the fact that colour-plus-word status is a
product requirement rather than a styling preference.
