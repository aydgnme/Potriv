# Frontend architecture

How `apps/frontend` is organised, and the few rules that keep it that way as the
product grows.

---

## Dependency direction

```
app  →  modules  →  shared
```

One direction, no exceptions:

- **`app/`** routes only. Thin: routing, layout composition, choosing the
  server/client boundary. No product logic.
- **`src/modules/<domain>/`** owns a product domain end to end — its components,
  its hooks, its types, its tests.
- **`src/shared/`** is genuinely cross-domain: design tokens, UI primitives,
  application configuration, types every domain uses.

**`shared` must never import a module.** If shared code needs something from a
domain, the dependency is pointing the wrong way — the thing belongs in shared,
or the module should own the composition.

Modules should not reach into each other's internals. If one domain genuinely
needs something another owns, the owning module exports it from its `index.ts`;
`import … from "@/modules/projects/components/internal/Foo"` is not allowed.

Why this shape rather than `components/ hooks/ services/ utils/`: those become
global buckets. Six months in, `components/` holds four hundred files and nobody
can tell which feature owns any of them. Colocation keeps ownership legible —
when Team Finder is deleted, one folder goes with it.

---

## Route ownership

```
app/
├── layout.tsx              document, design tokens, providers — nothing else
├── (product)/
│   ├── layout.tsx          product chrome
│   ├── page.tsx            → /home when signed in, /login when not
│   ├── login/page.tsx      → <LoginPage /> from @/modules/auth
│   ├── forgot-password/ · reset-password/
│   └── (protected)/
│       ├── layout.tsx      the session guard and the app shell
│       ├── home/page.tsx      → <HomePage /> from @/modules/home
│       └── projects/
│           ├── page.tsx                    the role-aware list
│           ├── new/page.tsx                create, project managers only
│           └── [projectId]/
│               ├── page.tsx      overview   (relationship-aware read)
│               ├── team/page.tsx team       (relationship-aware read)
│               └── edit/page.tsx settings   (owner-scoped management read)
├── api/auth/…              the BFF routes; the browser's only auth surface
└── (dev)/
    ├── layout.tsx          developer console chrome + its own stylesheet
    └── console/page.tsx    the API console
```

Route groups do not change URLs: `/console` is still `/console`, and `/login` is
still `/login`.

A page file should read like a table of contents:

```tsx
import { LoginPage } from "@/modules/auth";

export default function Page() {
  return <LoginPage />;
}
```

---

## Product and developer console are separate products

The console is a developer tool. It stays, it keeps working, and it keeps its own
dark theme — but it shares nothing with the product beyond the document itself.

| | Product | Developer console |
| --- | --- | --- |
| Routes | `app/(product)/` | `app/(dev)/` |
| Code | `src/modules/`, `src/shared/` | `src/dev-console/` |
| Styles | `src/shared/styles/` (light) | `src/dev-console/console.css` (dark) |
| Session | FE-02, not yet built | `localStorage` token, dev only |
| Metadata | "Potriv" | "Potriv Backend Control Console" |

Next code-splits CSS per route, so the console stylesheet never loads on a product
page. Verified rather than assumed: on `/login` the console's `.topbar` rule is
absent from `document.styleSheets` and its `--bg` custom property is undefined.

**The product must never import from `src/dev-console/`** — above all not
`tokenStore`. The console's token is a developer convenience with developer
security properties, and the product session is FE-02's to design.

---

## Module boundaries

A module exposes its public surface through `index.ts` and keeps everything else
private:

```
src/modules/auth/
├── components/LoginPage.tsx
├── model/session.ts
└── index.ts          ← the only entry point other code may use
```

Use `index.ts` as an intentional boundary, not as a habit. Nested barrel chains
inside a module make circular imports easy and stack traces useless.

When a domain grows, it takes the shape it needs — `api/`, `components/`,
`hooks/`, `model/`, `utils/` — and no more. Do not create empty folders.

Modules do not import each other. When two domains need the same thing, what
moves to `shared` is the part that belongs to no domain — the `ProjectStatus`
union, its labels and tones, date formatting — and it moves rather than being
copied. Domain arithmetic stays in the domain: Home and Projects each own their
open-positions calculation, pinned by their own regression tests, because putting
project staffing rules in `shared` would make `shared` the place domain knowledge
accumulates.

---

## Tests live beside the code

```
getNavigationItems.ts
getNavigationItems.test.ts
Button.tsx
Button.test.tsx
```

Vitest + Testing Library + jsdom, configured in `vitest.config.mts`. `@/*`
resolves through `resolve.tsconfigPaths`, so tests import exactly what the app
imports.

Test behaviour and contract — roles in, navigation out; disabled button does not
fire — never pixels or snapshots. A snapshot test fails when the design changes
and passes when the behaviour breaks, which is precisely backwards.

---

## Capability-aware navigation

`getNavigationItems(roles)` is pure: same roles in, same items out. It composes
the **union** of what a user's roles grant, so holding more roles can only reveal
more items.

There is no role switcher, and there will not be one. The backend authorises
every request against the whole role set, so a UI control that claimed to change
the active role would constrain nothing while appearing to.

`SYSTEM_ADMIN` is absent from `AccessRole` by construction, and `toProductRoles`
drops it at the boundary. It cannot produce a navigation item because the type
system will not let it — not because a filter remembers to exclude it.

Navigation lives in `src/shared/config/navigation/`:

- `navigationItems.ts` — definitions and the roles that reveal each
- `getNavigationItems.ts` — the composition rule
- `Sidebar.tsx` — rendering, and **no role conditions at all**

If a role check ever appears in the Sidebar, this separation has been lost.

---

## Design system

Tokens in `src/shared/styles/tokens.css`; a small global base in `globals.css`.
Component styling is colocated CSS Modules — `Button.tsx` beside
`Button.module.css` — so `globals.css` cannot grow into a second dumping ground.

The direction is **Signal Discipline**: colour is reserved for domain status.
The primary action is the strongest neutral, not a blue, because these screens
are saturated with status and a coloured button would compete with the thing
users are scanning for. Technical blue is spent only on links, focus and
selection.

**Colour never carries meaning alone.** `StatusBadge` requires a `label`;
`Alert` pairs its tone with an icon; the current navigation item is marked with
`aria-current` as well as weight. Accessibility and the visual rule reach the
same conclusion here, which is a good sign.

No arbitrary hex values in components — if a colour is needed, it becomes a
token.

---

## TypeScript

`strict` and `noEmit` stay on. No `any`. Prefer `unknown` with narrowing at
boundaries: `toProductRoles` takes `readonly unknown[]` precisely because the
server can send a role the product does not model.

Import through `@/*`, never `../../../..`.

---

## Naming

| Pattern | Use |
| --- | --- |
| `PascalCase.tsx` | components |
| `camelCase.ts` | configuration, helpers, pure functions |
| `useSomething.ts` | hooks |
| `Something.test.tsx` | colocated tests |

A filename should say what it owns. `helpers.ts`, `common.ts`, `utils2.ts` and
`misc.ts` say nothing and are not used here.

---

## Authentication

```
Browser  →  Next.js BFF route handlers  →  Spring backend
```

The browser never holds a token. It calls same-origin `/api/auth/*` routes; those
call the backend and keep the credentials in server-managed cookies. Product
modules therefore never learn that tokens exist — they ask for the session and
get identity and roles.

### Cookies

| Cookie | Holds | Lifetime |
| --- | --- | --- |
| `potriv_access_token` | backend access JWT | `expiresInSeconds` from the response, minus a 30s margin |
| `potriv_refresh_token` | backend refresh token | 7 days, mirroring the backend's `refresh-token-days` |
| `potriv_profile_name` | display name only | as the refresh cookie |

All three are `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` in production.
The access lifetime is **derived, never hard-coded** — the margin exists so the
browser stops presenting a token the backend is about to reject.

`potriv_profile_name` is presentation data. It exists because `TokenPairResponse`
carries `name` but `GET /auth/me` does not, so a reload would otherwise lose it.
It is never consulted for authorization; identity and roles always come from
`/auth/me`.

### Refresh rotation and single-flight

The backend rotates refresh tokens: using one marks it used and issues another.
Presenting a used token makes the backend **revoke the whole session**. So a
duplicate refresh is not wasteful, it is destructive — two tabs waking together
would sign the user out.

`refreshSingleFlight` therefore performs one backend refresh per old token and
hands the result to every caller, keyed by a SHA-256 digest so the raw token is
never a map key and never logged. The entry is held for a short bounded window
(5s) after it resolves, because a request already in flight when the new cookie
was set still carries the old one. Failures are not cached: the session is gone
and every caller should learn that at once.

**Limitation:** the map is in-process. It deduplicates within one Next.js
instance, not across several. A multi-instance deployment would need a shared
lock; that is infrastructure this repository does not have, and adding it for a
race a single-process deployment does not hit would be the wrong trade.

### Guards, and what each one is for

| Layer | Decides | Does not decide |
| --- | --- | --- |
| `middleware.ts` | is a cookie present — route to the page, to refresh, or to login | anything about identity or permission |
| protected layout | is this a real session, via `/auth/me` | which backend operations are allowed |
| `getNavigationItems` | which domains to show | **nothing about access** |

`getNavigationItems([])` is an empty menu, not a rejected session. Session
validity is decided in `toProductUser`, which refuses a user left with no
ordinary product role — `SYSTEM_ADMIN` alone, for instance, has its own console
and is not a product session.

**A refused login is cleaned up server-side.** The credentials were correct, so
the backend has already created a session and issued tokens. Nothing reaches the
browser, but that session would otherwise stay alive with nobody able to see or
revoke it, so `authenticateForProduct` closes it before answering. Best effort:
a cleanup that fails must not turn into an error for a request that was going to
be refused anyway.

The refusal reads exactly like a wrong password. "This account cannot use the
product" would confirm the address exists.

### Login status semantics

Two rules pull against each other, and both matter.

| Failure | Status |
| --- | --- |
| Malformed request | `400` |
| Wrong credentials — and unknown email, inactive, locked | `401` |
| **Credentials fine, product refuses the session** | **`401` — identical to above** |
| Backend unreachable or unexpected upstream failure | `502` |

Answering `401` for a backend outage tells a client that a service problem is
something the user typed wrong, so upstream failures get a gateway status.

But a *different* status for a refused-yet-valid login is worse: the backend
authenticated those credentials, so any observable difference confirms the pair
is correct. That turns the login form into a credential oracle and undoes the
uniform login error the backend deliberately returns. The two are therefore
identical in status, code, message, body shape and cookies — the distinction
survives only inside `authenticateForProduct`, where the cleanup needs it.

`403` remains right for an authenticated product operation the backend denies:
by then the caller's own identity is not a secret from them.

The backend remains the authority for every operation. Hidden UI is not
authorization.

### Same-origin and caching

**`SameSite=Lax` is not relied on alone.** Lax cookies *are* sent on top-level
cross-site GET navigations, and `/api/auth/refresh` is reached by a GET that
rotates credentials — so a link on another site could otherwise force a
rotation.

`isSameOriginRequest` therefore consults **Fetch Metadata** first, which a page
cannot forge:

| `Sec-Fetch-Site` | Decision |
| --- | --- |
| `cross-site` | refused, whatever else the request claims |
| `same-site` | refused — a sibling subdomain is a different origin |
| `same-origin` | eligible, then the Origin/Referer check still applies |
| `none` | allowed: the user typed it or used a bookmark, which a page cannot cause |
| absent | fall back to Origin/Referer — see the policy split below |

Comparison is on the **full origin** — scheme, host and port. `http://` and
`https://` on the same host are different origins, and treating them as equal
was a real weakness in the first implementation.

**Two policies, because the endpoints differ.** When a request carries no origin
signal at all — no Fetch Metadata, no `Origin`, no `Referer`:

| Caller | Decision |
| --- | --- |
| `isSameOrigin` — login, logout, password reset (POST) | allowed. Same-origin `fetch` legitimately omits `Origin` and `Referer` in some browsers, and refusing would break ordinary use |
| `isSafeRefreshNavigation` — `GET /api/auth/refresh` | **refused.** That endpoint rotates credentials from a top-level GET, so it fails closed rather than treating an absence as proof of a non-browser caller. It does not need to serve arbitrary non-browser callers |

The expected origin comes from `request.nextUrl.origin`, so it reflects whatever
`Host`/forwarded headers the platform already trusts. A reverse proxy that
rewrites the origin must be configured for Next to see it — the same requirement
redirects and absolute URLs already have. There is deliberately no proxy-trust
framework here.

Every auth response sets `Cache-Control: no-store`, and backend auth calls use
`cache: "no-store"` — authenticated identity must never be served from a shared
cache.

`returnTo` on the refresh route accepts only local product paths. That route sets
credentials and then redirects, so an unvalidated destination would be an open
redirect with a session attached.

### Product and dev console remain separate

The console keeps its `localStorage` token because it is a developer tool. The
product uses cookies it cannot read. Neither imports the other, and
`server-only` makes an accidental client import of the auth server modules a
build error rather than a leak.

### Known gap: organization name

The session gives an organization **id** and no name, and the only endpoint that
could supply one is organization-admin-only. `AppShell` therefore takes
`organizationName?: string | null` and omits the line when it is absent. A UUID
or an invented label would be worse than nothing.

---

## Product modules and authenticated backend reads

The dependency rule still holds — `shared` imports no module — with **one
deliberate exception**: a product module may import
`@/modules/auth/server-public`.

```
modules/home  →  modules/auth/server-public  →  Spring backend
```

Every product module needs authenticated reads. The alternative is each of them
reading cookies, building an `Authorization` header and knowing the backend URL,
which spreads credential handling across the codebase. So auth owns that and
exposes exactly one thing: `backendGet(path)`.

It is **not** a proxy. The browser cannot reach it, cannot choose a path and
never learns a token exists. Callers pass a fixed path from their own typed
loader. Nothing else under `modules/auth/server/**` may be imported from another
module, and `server-only` turns an accidental client import into a build error.

### Role gating happens before fetching

A role-specific endpoint is never called for a user who lacks the role. Firing
it and swallowing the 403 would send the backend a request it rightly refuses on
every page load, and would quietly make capability depend on error handling.
`loadHomeData` checks the role set first; a section the user has no role for is
`null`, and its component is not rendered at all.

### Holding a role is not the same as owning a record

A user can hold `DEPARTMENT_MANAGER` and manage no department — the backend
answers `403` from `requireManagedDepartment`. That is ownership, not an outage,
so loaders distinguish `FORBIDDEN` from `ERROR` and the section says "You are
not managing a department yet" rather than "could not load, try again".

This one was found by running it, not by reading it.

### A failed section is one failed section

Loads are independent and awaited together, so an unavailable endpoint leaves
the rest of Home intact and only its own panel reports the problem. Messages
never carry a status code, a path or anything else from the backend.

### Bounded enrichment

There is no aggregate staffing endpoint, so a project's gap costs one
`details` request. Home enriches only the shortlist it displays — fifty projects
must not become fifty requests for five rows. Anything beyond it reports
"Staffing not checked", never `0`, which would read as a fully staffed team.

The gap is a count of open **positions** — `max(0, required − filled)` summed
over every team-role requirement — not a count of understaffed role types. A
role wanting three people with one filled is two people missing, and two is the
number a manager acts on.

## Projects: one domain, several granted scopes

`/projects` is a single navigation destination. There is no `Managed projects`,
`Department projects` or `My projects` in the sidebar, because they are not
separate places — they are three questions about the same domain, and which of
them a person may ask depends on their roles:

| Scope | Endpoint | Granted by |
| --- | --- | --- |
| Managed | `GET /projects/managed[?status=]` | `PROJECT_MANAGER` |
| Department | `GET /department/projects[?status=]` | `DEPARTMENT_MANAGER` |
| My projects | `GET /me/projects` | every product user |

This is **data-scope selection, not role switching**. The backend authorises
against the whole role set on every request, so a UI that claimed to switch role
would constrain nothing while appearing to. The same project may honestly appear
in more than one scope meaning something different each time — I manage it · my
department has people on it · I am allocated to it — so scopes are never merged
into one cross-role row.

There is **no organization-wide scope**. No ordinary-product endpoint returns
every project in the organization, so an admin who is neither PM nor DM sees only
their own allocations rather than an "All projects" view with nothing behind it.

### Scope and filter live in the URL

`?view=` and `?status=` are the whole of this screen's state — no client store,
no `onChange` that fires a request. The filter survives a reload, can be shared,
and works before any JavaScript runs.

Both are normalised against a closed union before anything is fetched. A `?view=`
the roles do not grant falls back to the default granted scope instead of being
attempted; an unrecognised `?status=` becomes All. Nothing arbitrary reaches a
backend path.

Default scope is `managed` → `department` → `mine`, widest responsibility first.

### Only the active scope is fetched

Hidden scopes are not loaded to fill counts or badges. Doing so would pay for
data nobody asked to see and, for a role the user does not hold, would send a
request the backend rightly refuses on every page load.

`/me/projects` takes no status parameter, so that one filter is applied in the
server-side frontend layer. Current and past stay separate, and every allocation
episode survives: the same project appearing twice is two real allocations, and
deduplicating by project id would delete part of someone's history.

### The staffing fan-out is concurrency-bounded

The Projects list attempts staffing for **every** managed row, not a shortlist —
reporting unknown staffing for everything past the fifth would be a quieter kind
of wrong. But one `details` request per project with `Promise.all` would open as
many connections as the person happens to manage, worst for the busiest users. So
`DETAIL_CONCURRENCY = 5` requests run at a time: small, fixed, server-side and
never user-supplied.

A row whose detail fails says "Staffing unavailable" and the rest of the list is
untouched. It never becomes `0`, which would claim a full team on the strength of
a failed request.

### Reading a project and managing one are different authorities

```
GET /projects/{id}/details   relationship-aware  owning PM · member · past member · involved DM
GET /projects/{id}/team      relationship-aware  same rule
GET /projects/{id}           owner only          the management representation
PATCH · DELETE · POST        owner only
```

Overview and Team therefore use the relationship endpoints and never the
owner-scoped one — asking it on behalf of an allocated employee would refuse a
legitimate reader. Editing uses the management representation, because a form
built from what a *reader* sees would mean something different from what it
saves.

Management controls need **both** halves: `PROJECT_MANAGER` in the session and
`projectManager.userId === session.userId`. Holding the role says someone can
manage projects, not that they manage this one, so ownership is never inferred
from the role alone.

### One sentence for "you cannot see this"

The backend answers `404` for a project that does not exist *and* for one the
caller has no relationship to, deliberately — including for a caller holding
`DEPARTMENT_MANAGER` while managing no department.

The UI says **"This project does not exist or is not visible to you."** for every
one of them. Capability refusals ("only a project manager can do this") are a
different question and are said where no project is named.

*FE-05 found the backend answering `403` here for an existing project and `404`
for a missing one, which made the refusal readable as "this project is real".
The backend now returns `404` for both; the frontend's single sentence stays as
defence in depth rather than as the only thing closing the gap.*

### Writes go through the same server-only boundary

`backendPost`, `backendPatch` and `backendDelete` were added beside `backendGet`
— one more verb on the boundary auth already owned, not a new mechanism. The
browser still cannot name a path, still never sees a token, and there is still
exactly one refresh implementation.

Mutations are Server Actions in `modules/projects/server/actions`. Each one
re-validates its input: the client validation is how the screen stays pleasant,
and this is the run that decides. Failures are narrowed to one product sentence —
the backend's own `message` when it is bounded, single-line and free of anything
describing infrastructure, and a fallback otherwise. Nothing that crosses back to
the browser has a field that could hold a status code, a path or a token.

An identifier is not a path. The project id arrives through the form like
everything else, is narrowed to the shape of a UUID before it can be substituted
into a path written in the action, and the backend still answers 404 for a
project this user does not own — which is what actually enforces ownership.

## Team Finder is deterministic, and says so

`POST /projects/{id}/team-finder` is a read that happens to take a body. It
persists nothing, creates no proposal and changes no project — so it is not
converted to a GET, and no proxy lets the browser reach it.

The ranking is arithmetic over declared facts: exact-normalized matches between
the project's technologies and people's recorded skills (max 60), past projects
that shared **both** a technology and a target role (a binary 20), and current
capacity (max 20). Nothing in the UI recomputes a component or the total, and
nothing calls it a recommendation, a smart match or a good fit. The screen shows
the arithmetic; a manager decides.

Skill level and experience are rendered with the backend's own labels and carry
**no** points. The screen says so in as many words, because a level shown beside
a score invites the assumption that it moved it.

`candidateCount` is the number returned **after** the limit — the service sorts,
limits, then counts. At the limit the copy says "returned · limit N" rather than
claiming a total nobody computed.

### Criteria live in the URL; the run is explicit

The endpoint cannot be bookmarked, so the criteria are. `?includePartiallyAvailable`,
`?includeCloseToFinish`, `?closeToFinishWeeks`, `?includeUnavailable` and `?limit`
are narrowed to the ranges the backend enforces — anything else is dropped so a
hand-edited URL produces a default rather than a 400.

The criteria form is a plain `method="get"` form: one submit, one navigation, one
`POST` per render, and a screen that works before any JavaScript loads. Nothing
runs on a keystroke or a toggle. `response.criteria` — not the form draft — is
what "Showing results for…" reports, because only the backend knows which
defaults it applied.

Selecting a candidate and sorting the returned set are client-side. Re-running an
organization-wide ranking to look at a second person would be work nobody asked
for, and backend order stays the default.

### A proposal is not an assignment

`Propose for this project` exists only in the selected candidate's detail, never
as a row action. It creates a request a department manager reviews; the review
department is snapshotted server-side, so there is no picker and the success
message names it from the response.

Roles offered are the project's **active requirements with open positions**, and
the Server Action re-derives that set from the project rather than trusting the
form — a role filled or deactivated since the page loaded is refused before the
backend is asked. Hours are bounded by the candidate's current `availableHours`;
the frontend never learns how long a working day is, because the payload does not
say and copying the backend's constant would be a second source of truth.

Capacity in the finder is a snapshot. When it goes stale the backend answers 409
and that is authoritative: the form stays open with the reason, and nothing is
created optimistically.

## Staffing is a handshake, and `/staffing` is composed from both sides

A project manager asks; a department manager decides. One person can be both, so
`/staffing` is a capability union rather than a mode — reviews first, because that
is work other people are blocked on.

| Capability | Source |
| --- | --- |
| department manager | `GET /department/project-proposals?status=` |
| project manager | `GET /projects/managed` |

Each source is called only for the capability that entitles it, and somebody with
neither role gets a permission state before either is asked.

There is deliberately **no "requests I sent"**. The backend has no PM-wide
proposal list, and building one by asking every managed project for its team
would be inventing a feature out of N requests. The project side shows the
projects themselves, linking to Team Finder and the team.

`?status=` accepts `PENDING`, `APPROVED` and `REJECTED`; anything else becomes
`PENDING`, which is both the backend's default and the honest one.

### One merged feed, in the backend's order

Assignment and removal requests come back together, oldest first with a stable
tie-breaker, so the frontend makes one call and preserves that order. Two calls,
or a re-sort by type, would push a three-week-old request below one from this
morning. Selecting a row is local; changing the status filter navigates.

The two types share a DTO but not a meaning, and nothing crosses between them: an
assignment carries the manager's `comments`, a removal carries an `allocationId`
and their `reason`, and a null is rendered as absence.

### Capacity belongs to the backend

Pending assignment rows carry a capacity context computed with the same rule
acceptance uses. Every figure is rendered as given, the denominator is the
published `maxHoursPerDay` — so no client hard-codes a working day — and
`currentlyAcceptableByCapacity` is the backend's own conclusion. Deriving it from
the numbers would be a second capacity model that could disagree.

When it says a request no longer fits, Accept is off and Reject stays available:
the backend deliberately leaves such proposals pending rather than auto-rejecting
them, and that is a real state for a person to act on.

`capacity` is null for removals — which free capacity rather than consume it —
and for decided rows. Null renders as no block, never as zeros.

A capacity context is current state, not a reservation, so acceptance can still
lose a race. A 409 keeps the request reviewable; a 409 that says it was *already
reviewed* also clears the stale selection, because leaving live buttons on a
settled request invites a second decision.

### A removal proposal removes nobody

`Propose removal` appears on **active** allocation rows only, and only for the
owning project manager. The person stays on the project — active, allocated,
counted — until a department manager accepts, so success says the request was
sent and names the reviewing department from the response.

The reason is required because, once approved, it is stored permanently with the
past allocation and becomes the only record of why. The Server Action re-reads the
project for ownership and the team for the allocation: an id that is not active
right now is refused before the backend is asked.

The manager's `reason` and the reviewer's `rejectionReason` are two statements by
two different people and are never merged — "Removal reason" and "Review rejection
reason" are separate fields with separate labels.

### Projects and staffing still do not import each other

Project Team takes an optional per-row action and the **route** supplies staffing's
`ProposeRemovalAction`. The composition point is the route, which is the same rule
that lets Team Finder read `/projects/{id}/details` through staffing's own types.

### Deletability is not predicted

The backend refuses deletion once a project has *ever* reached In progress,
Closing or Closed. That is a rule about status **history**, and no endpoint
exposes it — so a project sitting in Not started may still be undeletable.
`canDelete = status === "NOT_STARTED"` would be confidently wrong. The button is
always offered, always confirmed, and the backend decides; a refusal keeps the
person on Settings with the explanation and the project intact.

## People: two questions, two contracts

`/people` answers one of two different questions depending on who is asking, and
they come from endpoints that do not share a shape.

An Organization Admin sees everyone in the organization from `GET /users`. A
Department Manager sees their own department's members and the unassigned pool,
from `GET /departments/{id}/members` and `GET /departments/unassigned-employees`.
Somebody holding both roles gets both views, organization first, as ordinary
links rather than tabs — each view is a page, and the URL says which one.

### `roles` and `accessRoles` are different fields

`GET /users` returns `roles`. The department endpoints return `accessRoles` for
what is otherwise the same person. A single shared "person" type would compile
against either and render an empty chip list against the other, silently: the
list would simply show no capabilities, which reads as "this person has none".
So the two contracts stay separate types, and `rolesOf` is the one place that
knows which field a given shape carries.

### The department id never comes from the browser

Membership actions re-resolve the acting manager's department from
`GET /department/projects` on every mutation and ignore any `departmentId` in the
form. That endpoint is also the only one that will tell a manager which
department is theirs, so a 403 from it is the honest signal that nobody has
appointed them yet — which is a different sentence from "we could not load your
department", and the screen says whichever is true.

`POST /departments/{id}/members/{userId}` answers **200**, not 201, and `DELETE`
answers 204. Nothing asserts a particular success code.

### Access-role authority is not membership authority

An Organization Admin changes roles and cannot add anyone to a department; a
Department Manager does the reverse. Adding somebody changes no roles, and the
confirmation for removing says so explicitly rather than leaving the reader to
wonder what else it did.

### Role rules are re-derived, never remembered

`roleEditorState` recomputes from a fresh read every time: Employee is the
baseline and always locked on, you cannot edit your own roles, and an
organization keeps at least one Organization Admin. A locked checkbox says *why*
it is locked, because "you cannot edit your own" and "the last admin must stay an
admin" are different facts that a dimmed box communicates equally badly.

The one exception is a founder alone in a new organization, who may add
Department Manager or Project Manager to themselves and remove nothing. It is
derived from a fresh `GET /users` — a page loaded an hour ago would happily still
claim they are alone — and it closes the moment a second person exists. The
backend rebuilds roles per request, so the new capability is live immediately and
nothing suggests signing out.

That exception is also why a lone founder is still listed on `/people` rather
than replaced by "only you so far": their own detail page is the only screen
where self-editing is allowed, and nothing else in the product links to it.

### The submitted role vocabulary is closed, and fails the request

`PATCH /users/{id}/roles` replaces the **complete** role set, which changes what a
malformed submission means. Dropping a value the product does not offer and
carrying on would leave a different, perfectly valid request behind: submitting
`EMPLOYEE + SYSTEM_ADMIN` for somebody holding `EMPLOYEE + PROJECT_MANAGER` would
quietly become "remove Project Manager" — a mutation nobody asked for, from a
request that was invalid.

So `parseRolePayload` accepts only the four product roles and fails the whole
submission on anything else, before any read happens: proving a role is unknown
needs no organization or target lookup, and fetching first would only widen what a
tampered form can reach. The browser gets one bounded sentence that names nothing
it did not already send.

Two normalizations survive, because neither invents authority the caller did not
express: a missing `EMPLOYEE` is added back, since the backend treats it as the
organization baseline and would add it anyway, and repeats of a known role
collapse to one.

This is the opposite of how unknown values are treated on **reads** — narrowing
`SYSTEM_ADMIN` out of navigation, or a hand-edited Team Finder criterion falling
back to its default. There, dropping is right: nothing is being changed. Here it
would turn bad input into a silent write.

### The role checkboxes are uncontrolled, deliberately

React resets a form once a Server Action settles. With controlled checkboxes that
reset clears them in the DOM while React still believes they are ticked, so the
identical next render writes nothing back — a role that saved correctly renders
as unticked, the screen denying a capability the person now holds. Elsewhere the
answer to that reset was to control every field, because losing half-typed text
is unacceptable. Here the opposite is right: the only correct value is the one
the backend just confirmed, so the reset restores the truth and a changed answer
remounts the fieldset to take the new one.

### Only what the contract has

The table shows name, email and roles, because that is what `GET /users`
returns. No account status, no department, no last-login: a column would be blank
or invented, and fanning out department endpoints per row would answer a question
this screen is not asking. Filtering is local — the rows are already loaded and
there is no people search to call.

## Organization: only what the API actually governs

`/organization` manages departments and the invite link. That is the whole of it,
because that is the whole of what the ordinary product's API exposes.

There is no organization name on this screen, no headquarters, no plan, no
employee total. No product endpoint returns an organization profile, and the
session carries an `organizationId` and nothing else about the organization
itself. The system-admin surface does have more, but it is not this product's to
borrow — a heading reading "Acme Ltd" here would have to be invented, and an
invented heading is worse than an absent one. **The organization display-name gap
is real and stays open.**

The landing page loads departments and the invite independently. They answer
unrelated questions of unrelated endpoints, and an invite outage must not blank
the department summary.

### A department name is trimmed, not folded

The backend stores a trimmed display name and compares uniqueness on a lowercased
form. Both are honoured, differently: the payload is trimmed so it matches what
gets stored, and the case is left exactly as typed. `Platform` and `platform`
collide — but whichever was typed is the one that appears.

Uniqueness itself is never predicted. Only the organization's whole department set
could answer it, that set changes, and the backend answers 409. A duplicate comes
back into the form with the entered value intact.

### Deletion states what it knows, and no more

The department contract carries a manager and a member count, so those two
blockers are named before the button is offered — each saying who has to act.
Other modules register their own deletion guards, linked skills among them, and no
product endpoint exposes those. So passing the two known checks is **not** a
promise: the confirmation says other configuration can still prevent deletion, and
a 409 is reported as the legitimate answer it is.

The Server Action re-reads the department and re-derives both blockers. What the
browser believed about `memberCount` or `hasManager` is never consulted.

Nothing cascades. A delete that quietly unassigned a manager, emptied a department
and unlinked its skills would be a far larger operation than the one the button
offers, so blocked dependencies stay blocked and visible.

### A role is a capability; an appointment is a posting

This is the distinction the whole area turns on.

`DEPARTMENT_MANAGER` says somebody *can* manage a department. A
`DepartmentManagerAssignment` says they manage *this* one. The backend keeps a
strict one-to-one: one manager per department, one department per manager.

So appointing never grants the role and removing never takes it away — the
Organization module exposes no user-role call at all, which is what makes that
guarantee structural rather than a promise. Somebody removed as manager still
holds the role and simply manages nothing, and the removal confirmation says so
outright rather than leaving the reader to guess whether they were just demoted.

The picker is built from `GET /users` and `GET /departments` together, because
nothing exposes "unassigned managers" directly: everyone holding the role, minus
everyone already posted elsewhere. Someone managing another department is shown
and disabled *with the department named* — "Cara is missing from the list" is a
puzzle, "Cara manages QA" is an answer. Eligibility is re-derived server-side from
fresh reads, since a picker rendered before a role was revoked would otherwise
carry a stale answer through.

Where nobody holds the role at all, the screen says so and links to People. It
does not offer to grant the role, because that is a different decision with
different authority.

### One panel, one sentence

Appointing and removing are separate forms with separate action states, and each
outlives the answer it described. Left alone they contradict each other: after a
removal the panel showed "X is now the manager" directly above "this department has
no manager", and the reassuring sentence was the false one. Worse, the removal's
own confirmation lived on a button that success unmounted, so the action that
actually happened had no visible outcome.

A confirmation is now shown only while it still agrees with the department as it
is, and the removal's state belongs to the panel rather than the button.

### Rotating the invite is a revocation

`POST /organizations/current/invite/rotate` deactivates every active invite before
minting the new one, so anybody part-way through joining with the old link is cut
off. It reads like a refresh and behaves like a revocation, which is why it is
confirmed first and why the wording leads with the consequence.

The new URL is whatever the backend returned. Assembling one in the browser, or
swapping a token into the old one, would be inventing an onboarding credential.
The link is rendered from the revalidated read and never carried in the action
state — that is a place for sentences, not credentials.

The whole URL is shown in a read-only, selectable field; the token is never
extracted and displayed on its own, where it would be a bare credential with no
context. Copying is local: no request, no rotation, and if the clipboard refuses,
the field is still selectable and the message says so.

Employee invites are created with `expiresAt = null`, so there is no countdown and
no expiry column. Inventing one would be a promise the contract does not make.

## Skills: shared vocabulary, and one person's claim on it

Two things live in this domain and they are not the same thing.

A **catalogue skill** is the organization's shared vocabulary, identified by
`skillId`. An **employee skill** is one person's declared assignment to that
vocabulary, identified by `employeeSkillId`. Their lifecycles differ — a catalogue
skill can be deactivated while somebody's assignment to it survives — and every
profile mutation takes the *assignment* id. Sending the catalogue id instead would
aim a profile edit at shared organization data, so the types keep them apart and
the tests assert the distinction directly.

`/skills` is the catalogue, `/skills/{skillId}` one entry, `/skills/my` the
reader's own profile. All three are open to every authenticated person: the
vocabulary is shared, and the profile is their own. Catalogue *management* —
creating skills and categories, linking departments — is not here. The module
exposes no data source that could perform it, which makes that structural rather
than a matter of hiding buttons.

### The search is the backend's, and says so

`GET /skills?q=` is the product's only server-side text search: a case-insensitive
*contains* match on the skill name. Not fuzzy, not semantic, and not across
descriptions or authors — so the screen says "Search matches skill names" rather
than letting people infer more.

Filters live in the URL and the list is always the backend's answer to it.
Re-implementing the match over a preloaded list would make the screen disagree
with its own address bar the moment the two drifted. The order is the backend's
too — category name, then skill name — because there is no ranking to sort by.

There is no pagination endpoint, so there is no pagination: the count states what
came back and implies no hidden remainder.

### A filter never lies about what was asked

Categories load first, with the mode being asked for; the category filter is then
settled against them, and only then is the search issued. That ordering exists so
one thing cannot happen: the sidebar showing "All skills" while a category
parameter is quietly narrowing the request.

A malformed category never reaches the backend. A well-formed one for a category
the organization does not have — or an inactive one while the toggle is off —
collapses to no filter, in the query the screen renders from as well as the one it
sends. Show-inactive drives both lists together, so the filter can never offer a
category the source was not asked for.

### Inactive is visible, not secret

An inactive catalogue skill still has a detail page, still shows its metadata, and
is simply marked. What it cannot do is be newly added. Turning inactive into a 404
would confuse "retired" with "not yours", and only the second deserves the
ambiguous answer — a skill in another organization and one that never existed get
the same sentence.

An existing assignment to a since-deactivated skill stays in the profile, and stays
editable and removable. Hiding it would strand somebody with a row they can no
longer reach, and it is still their data.

### A department link is metadata, not permission

`SkillResponse` embeds its department links, so the detail page reads them from the
response it already has rather than fetching them again.

They describe where a skill is used. The backend's assign path never consults
them, so a skill linked to no department can still be added by anyone in the
organization — filtering the action by department would invent a rule that does not
exist and hide skills people are entitled to claim.

### Level and experience are self-reported context

Both are closed vocabularies mirroring backend enums exactly, written out rather
than generated: the level's 1–5 belongs to its code, not to its position in a list,
so reordering the options cannot silently change what a level means.

They are checked exactly on the server, before anything is read. An unknown code
fails the whole submission rather than being coerced into a neighbour — recording a
self-assessment somebody never made is the profile version of the closed-vocabulary
rule that access roles follow.

Neither field is a rating. Team Finder's ranking does not weight them, so nothing
is starred, coloured or sorted by them, and no screen claims a higher level improves
a match. There is no endorsement or verification endpoint, so no screen shows one.

### The self list is the ownership proof

`/me/skills` has no user in its path, so a fresh read of it is what proves an
assignment belongs to the caller. Edit and remove both look the id up there first;
an id that is not in it belongs to somebody else or to nobody, and both get the same
sentence rather than one that reveals which.

Removing an assignment removes one row from one profile. The catalogue skill, its
category and everybody else's assignment to it are untouched, which is why the
confirmation says "remove" and never "delete".

## Skill administration: three authorities, kept apart

Catalogue administration looks like one permission and is three. Flattening them
would give each the reach of the widest, so they are checked separately and shown
separately.

**Authoring** needs the Department Manager role and nothing else. Any manager may
create categories and skills, including one who manages no department.

**Content** belongs to the skill's author. Only they may rename, re-describe,
retire or restore it; another manager reads it and is told whose it is. The
Server Action re-reads the skill and compares the author to the session on every
attempt, so hiding the Edit button is convenience and the check is the protection
— a tampered form from another manager fails before anything is written.

**Department links** need an actual manager *appointment*, which the role does not
imply. `GET /department/projects` is what answers it, and a 403 there is the
honest signal that somebody holds the role without a department: they keep
authoring, and simply have nothing to link to.

Link authority is deliberately not authorship. A manager may link their own
department to a skill somebody else wrote, because a link says "we use this here",
not "this is mine".

### The link endpoint takes no department

`POST` and `DELETE /skills/{id}/departments/current` resolve the caller's
department from the principal. There is no department id in the path or the body,
so there is no picker to build and nothing a submission could point elsewhere.

A retired skill cannot receive a *new* link — the backend refuses — but an existing
one can still be removed, so retiring a skill never traps a department in a
relationship it cannot end.

### Retiring is soft, and stops where it says

Categories and skills are both deactivated rather than deleted, and neither
cascades. Retiring a category leaves its skills exactly as they were: their own
state, their department links, and everybody's existing profiles. That means the
backend can hold an active skill inside a retired category, and the product shows
that rather than tidying it away — what changes is that no *new* skill can be
created there, and an edit must move the skill to an active category before it
saves.

Retiring a skill leaves every existing assignment intact. It cannot be newly
added; people who already have it keep it.

## Team roles are staffing vocabulary, not permissions

`/organization/team-roles` is the organization's list of what projects can ask to
be staffed with. Administering it is organization-admin work.

Project managers read the same catalogue through the backend — they need it to
declare requirements, inactive entries included, because a project whose role was
retired afterwards still has to render what is already attached. Reading it is not
administering it, and the management surface is not theirs.

The word "role" already means access in this product, so every team-role screen
says what these are not: they describe project staffing needs and grant nobody
permission to do anything. The module has no call that could change what somebody
may do, which makes that structural rather than a claim.

Deactivation is soft here too. A project that already requires a role keeps
requiring it; what changes is that the role stops being offered for new work. The
row stays resolvable so existing requirements keep rendering, and restoring is a
single flag rather than a re-creation.
