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
│   ├── page.tsx            → redirects to /login until FE-02 lands
│   └── login/page.tsx      → <LoginPage /> from @/modules/auth
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

The backend remains the authority for every operation. Hidden UI is not
authorization.

### Same-origin and caching

Session-mutating routes check `Origin`/`Referer` against `Host`, on top of
`SameSite=Lax`. Every auth response sets `Cache-Control: no-store`, and backend
auth calls use `cache: "no-store"` — authenticated identity must never be served
from a shared cache.

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
