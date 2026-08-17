# V2-01 — Approved visual direction and the public landing

The first slice of Potriv V2: a brand token layer, a public marketing landing at
`/`, the technical vector language, and the real create-workspace route the
landing's primary action needed in order to be truthful.

Baseline: `cf710eb` on `main` — Next 16.3.1, React 19.2.0, 1164 tests / 69 files,
all gates green.
Branch: `feat/potriv-v2-approved-visual-foundation`.

Authenticated product screens are deliberately untouched. Those are V2-03 onward.

---

## 1. Approved principles

The direction is flat operational SaaS with a restrained teal accent and sparse
glass. What that means in practice, and what the implementation holds to:

- strong black typography on a white canvas; colour is never the loudest thing
- thin structural borders instead of shadows and large radii
- technical SVG diagrams, drawn as markup rather than shipped as images
- editorial section rhythm — one continuous surface with separators, not a field
  of floating cards
- one dark, factual security section
- glass on two floating panels only; flat is the default everywhere else
- no gradients, no glow, no stock imagery, no illustrated mascots, no fake charts

The character it is protecting against is "generic admin template", in both
directions: neither a colourful dashboard nor a glassmorphism demo.

## 2. Brand tokens

The existing Signal Discipline system is preserved exactly. `--p-accent` still
means "you can act on this" — links, focus, selection — and was **not** repointed
to teal, because doing so would have recoloured every authenticated screen in a
PR that is not allowed to touch them.

The V2 identity is a separate semantic family:

| Token | Value | Role |
| --- | --- | --- |
| `--p-brand-soft` | `#eef7f5` | quiet brand ground |
| `--p-brand` | `#0f6d63` | eyebrows, numbers, accepted relationships |
| `--p-brand-strong` | `#0a4f48` | scores and strongest emphasis |
| `--p-brand-line` | `#2a9d8f` | diagram strokes and marks |
| `--p-brand-selection` | `#d8ece8` | the selected candidate |

Measured on `--p-surface` (#ffffff), computed rather than estimated:

```
--p-brand         6.20:1   passes 1.4.3 at any size
--p-brand-strong  9.44:1   passes 1.4.6 (AAA)
--p-brand-line    3.32:1   clears 1.4.11, fails 1.4.3
```

`--p-brand-line` therefore carries no text. It draws strokes and marks, and every
stroke sits beside a written label, so the colour stays redundant.

Also added: glass (`--p-glass-soft|strong|border|blur`), the technical grid
(`--p-grid-line`, `--p-grid-size`), a dark-section family (`--p-inverse-*`,
including `--p-inverse-brand` at 8.92:1 because `--p-brand-line` is unreadable on
charcoal), a marketing display scale (`--p-display-1..3`, `--p-lead`), and motion
(`--p-motion`, `--p-ease`).

The display scale is deliberately named apart from `--p-text-*`. The product
scale is dense because an operator reads it all day; the landing scale is loud
because a stranger reads it once. Separate names are what stops a 56px heading
appearing on a screen full of tables.

## 3. Solid versus dashed — Potriv's visual grammar

The one rule the whole system is built around:

```
dashed  =  proposal, asked for and not yet agreed
solid   =  accepted allocation
```

It is carried by **dash pattern first and colour second**, so a reader who cannot
separate the hues still sees the difference, and it is stated in words directly
under the hero diagram rather than left to be inferred. This becomes part of the
product's language: Team Finder and staffing composition should use the same
grammar when they are rebuilt in V2-05 and V2-06.

## 4. Landing structure

`src/modules/marketing/` — a leaf module. It depends on shared tokens and nothing
else, and no product module imports it, so a headline change can never trigger a
product rebuild.

```
src/modules/marketing/
├── components/
│   ├── LandingPage.tsx        all sections, server-rendered
│   ├── MarketingHeader.tsx    the only client component on the page
│   ├── HeroFlowDiagram.tsx    the five-stage flow, two variants
│   ├── RoleGlyph.tsx
│   └── FinalCtaMotif.tsx
├── styles/landing.module.css
├── landingContent.ts          every word, in one auditable place
└── index.ts
```

Sections, in order: hero → value pillars → seven-step workflow → role
responsibilities → dark security section → final CTA → footer. One `h1`, one `h2`
per section, each section named by its heading through `aria-labelledby`.

Copy lives in `landingContent.ts` rather than inside components so the claims can
be read as a set. The security section is the reason that matters: it is a list
of assertions about this repository, and keeping them together makes "is this
still true?" answerable.

## 5. Vector language

Two inline SVGs, no images, no canvas, no animation library.

`HeroFlowDiagram` renders **two compositions**, not one scaled drawing. Shrinking
the 720-unit desktop flow to a 390px screen would leave 9px labels, so the mobile
variant is a genuinely different layout — a vertical spine carrying the same five
stages, with the requirement detail collapsed to technologies and an open-roles
count. Both are in the DOM; CSS shows one. A `display: none` subtree is outside
the accessibility tree, so exactly one labelled image is exposed at any width,
and their `title`/`desc` ids are suffixed apart so they cannot collide.

Both are present in the server-rendered HTML, so the diagram needs no JavaScript
to draw.

Demonstration content (Orion, Java/PostgreSQL/React, three candidate names,
Platform Engineering) is inert — no product behaviour reads it.

## 6. Glass and grid, and where they are not

Glass appears on exactly two surfaces: the hero's evidence panel and its review
panel. Not on sections, tables, forms, cards or lists.

The technical grid appears in the hero and the security section, as a pair of
repeating gradients masked to fade before it reaches body copy. At 4% alpha it
reads as texture when looked for and disappears otherwise, and it sits behind
text rather than over it, so it cannot move any measured contrast.

## 7. The root route

`/` was a session-aware redirector: it asked the backend who you were, then sent
you to `/home` or `/login`. It is now the landing page and asks nothing — no
cookie read, no session lookup, no backend call.

Consequences worth recording:

- the build now reports `○ /` (prerendered) where it was `ƒ` (dynamic per
  request); an anonymous visitor and a signed-in one receive identical bytes
- signed-in visitors are **not** bounced to `/home`. Landing on your own product's
  front page is not an error to correct
- the proxy never matched `/`, so no proxy change was needed
- nothing in the app linked to `/`, so no internal link changed meaning

## 8. Create workspace

The landing's strongest action says "Create your workspace". At the start of this
work no such route existed — no page and no BFF handler — so the CTA had nowhere
honest to point. Pointing it at `/login` was rejected: a control that promises
workspace creation and delivers a password prompt is a false promise.

The real route was implemented instead, and stayed narrow for one specific
reason: **`POST /auth/register-admin` returns no tokens.** It touches no cookie,
rotates nothing, and reads no session, so adding it changed no session semantics
at all.

```
/create-workspace              page, session-checked like /login
/api/auth/register-workspace   BFF boundary, same-origin guarded
```

The response carries `{ created, email }` and nothing else — no identifiers, no
invite URL, nothing the browser did not already send.

**There is no auto-login**, because the contract grants no session to log in
with. Faking one would have meant replaying the password against `/auth/login`
behind the user's back. The success state says the workspace exists and sends
them to sign in, which is what actually happens.

Deliberately not built here: department, team-role, skill-catalogue, invite and
first-project onboarding. Those are V2-02.

## 9. Invite and password-reset URL finding

Traced rather than assumed, and **not changed** in this PR.

`app.frontend-url` is read in exactly two places:

| File | Generated URL |
| --- | --- |
| `InviteTokenService.java:37` | `{frontend-url}/invite?token=…` |
| `PasswordResetService.java:134` | `{frontend-url}/reset-password?token=…` |

| Environment | Value | Source |
| --- | --- | --- |
| dev | `http://localhost:5173` | `application.yml:14` |
| prod | `${FRONTEND_URL:https://potriv.aydgn.me}` | `application-prod.yml:57`, `docker-compose.prod.yml:44` |

What the trace establishes:

- `apps/` contains only `backend` and `frontend`. There is **no Vite application
  in this repository**, and the Next app serves port 3000 — so the dev value
  points at an origin nothing here serves.
- `/reset-password` **does** exist in the Next app, so prod reset links resolve;
  dev reset links do not.
- `/invite` **does not exist** in the Next app in any environment, so invite
  URLs have no destination today regardless of configuration.
- `http://localhost:3000` is already in the backend's `allowed-origins`, and the
  e2e suite extracts the invite token generically rather than asserting the host
  (`tools/api-e2e/src/fixtures/context.ts:73`). The one place 5173 is pinned is
  a CORS allowed-origin assertion in `contract.ts:140`.

Conclusion: the dev value is genuinely stale for this frontend, and the missing
`/invite` route is the larger gap. Both belong to V2-02 rather than to a visual
PR, and neither was altered here.

## 10. Accessibility

- one `h1`; `h2` per section; `h3` within — no level skipped
- `banner` / `main` / `contentinfo` / `nav` landmarks present
- every section carries an accessible name via `aria-labelledby`
- the mobile menu toggles `aria-expanded`, changes its accessible name between
  "Open menu" and "Close menu", and **unmounts when closed** so no hidden link is
  reachable by Tab; its target is 44×44
- meaningful SVG carries `role="img"` with `title` and `desc`; decorative SVG is
  `aria-hidden`
- no meaning is carried by colour alone — the solid/dashed rule is written out
- no page-level horizontal scroll at 320, 375, 390, 768, 1024, 1280 or 1440
- brand teal is used for text only where it passes 4.5:1

## 11. Responsive behaviour

| Width | Result |
| --- | --- |
| 320 | no overflow; single column; mobile diagram |
| 375 / 390 | canonical mobile; stacked CTAs; vertical diagram spine |
| 768 | mobile diagram still; pillars stacked; roles two-column |
| 1024 | desktop diagram; hero two-column; workflow horizontal, 7 columns |
| 1280 / 1440 | full composition |

The diagram swaps variant at 860px and the workflow changes axis at 1024px.

## 12. What deliberately did not change

Authentication and authorization semantics are untouched: HttpOnly cookies, the
BFF boundary, refresh rotation and single-flight, the same-origin guards, the
proxy's cookie routing and its 303 mutation-safe recovery, role composition, and
the protected layout's `/auth/me` check. The new public root does not weaken any
protected route.

The developer console is untouched and remains separate in both directions —
verified in the served HTML, not assumed.

No authenticated product screen was restyled.

## 13. Next

**V2-02 — public auth and onboarding.** It should own: the `/invite` route that
does not exist, founder onboarding after workspace creation, join-workspace and
invalid-invite states, and the `app.frontend-url` alignment documented in §9.
That is the natural next slice because this PR created a workspace-creation entry
point whose follow-on steps do not yet exist.

Then V2-03 product shell and Home, V2-04 Projects, V2-05 Team Finder and team
composition, V2-06 staffing review, V2-07 People/Skills/Organization, V2-08
integration and polish.

## 14. Table and workbench language, for later

Team Finder V2 is **not** implemented here. The foundation it will need is:
`--p-brand-selection` for the selected row, `--p-brand-strong` for scores in
mono, the thin-separator table language used by the value pillars and security
facts, and the glass tokens for the selected-candidate evidence panel.

The semantics it must preserve are unchanged and worth restating: backend ranking
is the default order, the score is deterministic evidence read line by line, no
AI wording, no confidence score, no stars, no percentile, selection does not
rerun the finder, presentation sorting does not rerun the finder, a proposal is
not an assignment, and department review remains required.
